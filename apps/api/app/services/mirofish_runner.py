from __future__ import annotations

from collections import Counter, defaultdict
import json
import os
import re
import sqlite3
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import pandas as pd
from google.auth import default as google_auth_default
from google.auth.exceptions import DefaultCredentialsError
from google.auth.transport.requests import Request as GoogleAuthRequest

from app.core.config import Settings
from app.services.analysis_engine import AnalysisEngine
from app.services.gemini_runner import GeminiIntegrationError, GeminiRunner
from app.services.media import MediaService
from app.services.tribe_runner import SegmentSnapshot, TribeProbe, TribeRunResult


GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
MIROFISH_MODEL_REPO = "666ghj/MiroFish"
MIROFISH_MODEL_COMMIT = "service"
MIROFISH_REQUEST_HEADERS = {"Accept-Language": "en"}
MIROFISH_ROOM_VOICE_LIMIT = 10
MIROFISH_ROOM_VOICE_CHAR_LIMIT = 420


class MiroFishIntegrationError(RuntimeError):
    """Raised when the MiroFish sidecar cannot be reached or parsed."""


@dataclass
class MiroFishBrief:
    projectName: str
    projectFileName: str
    markdown: str
    simulationRequirement: str
    windows: list[dict[str, object]]
    warnings: list[str]


class MiroFishRunner:
    MODEL_REPO = MIROFISH_MODEL_REPO
    MODEL_COMMIT = MIROFISH_MODEL_COMMIT
    VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.media = MediaService(settings)
        self._brief_helper = GeminiRunner(settings) if settings.gemini_api_key else None
        self._model_error: str | None = None
        self._service_process: subprocess.Popen[str] | None = None

    def has_install(self) -> bool:
        repo_dir = self.settings.mirofish_repo_dir
        return bool(self.settings.mirofish_base_url or (repo_dir and repo_dir.exists()))

    def model_status(self) -> str:
        if self._service_healthy():
            return "loaded"
        if self._model_error:
            return "error"
        return "unloaded"

    def model_error(self) -> str | None:
        return self._model_error

    def selected_device(self) -> str:
        return "service"

    def probe(self) -> TribeProbe:
        return TribeProbe(
            installed=self.has_install(),
            modelStatus=self.model_status(),
            modelError=self.model_error(),
            selectedDevice=self.selected_device(),
            modelRepo=self.MODEL_REPO,
            modelCommit=self.MODEL_COMMIT,
        )

    def warm_load(self) -> TribeProbe:
        self._ensure_service_ready()
        return self.probe()

    def analyze_video(self, video_path: Path) -> TribeRunResult:
        base_url = self._ensure_service_ready()
        brief = self._build_video_brief(video_path)

        try:
            with httpx.Client(
                timeout=httpx.Timeout(30.0, read=120.0),
                headers=self._service_headers(),
            ) as client:
                project_id = self._create_project(client, base_url, brief)
                graph_id = self._build_graph(client, base_url, project_id)
                simulation_id = self._create_simulation(client, base_url, project_id, graph_id)
                self._prepare_simulation(client, base_url, simulation_id)
                self._run_simulation(client, base_url, simulation_id, graph_id=graph_id)
                audience_world = self._hydrate_audience_world(
                    client,
                    base_url,
                    simulation_id,
                    windows=brief.windows,
                    include_cached_interviews=False,
                )
                response_payload = self._request_structured_outlook(
                    client,
                    base_url,
                    simulation_id,
                    brief.windows,
                )
                room_voices = self._load_room_voices(simulation_id, classify_with_gemini=True)
        except httpx.HTTPStatusError as exc:
            self._model_error = f"MiroFish returned HTTP {exc.response.status_code}."
            raise MiroFishIntegrationError(self._model_error) from exc
        except httpx.HTTPError as exc:
            self._model_error = f"MiroFish request failed: {exc}"
            raise MiroFishIntegrationError(self._model_error) from exc

        analysis = self._extract_analysis(response_payload)
        timeline = self._normalize_timeline(analysis.get("timeline", []), brief.windows)
        if not timeline:
            raise MiroFishIntegrationError("MiroFish returned no audience timeline windows.")

        self._model_error = None
        segments = [
            SegmentSnapshot(
                start=float(window["startSec"]),
                duration=max(float(window["endSec"]) - float(window["startSec"]), 0.1),
                nsEventCount=0,
            )
            for window in timeline
        ]
        events = pd.DataFrame(
            [
                {"type": "Marker", "start": float(marker["t"]), "label": marker["type"]}
                for marker in analysis.get("markers", [])
            ]
        )
        warnings = [*brief.warnings, *[str(item) for item in analysis.get("warnings", [])]]

        return TribeRunResult(
            preds=GeminiRunner._synthetic_predictions(timeline),
            events=events,
            segments=segments,
            device=self.selected_device(),
            provider="mirofish",
            modelRepo=self.MODEL_REPO,
            modelCommit=self.MODEL_COMMIT,
            providerRaw={
                "projectId": project_id,
                "graphId": graph_id,
                "simulationId": simulation_id,
                "briefWarnings": brief.warnings,
                "audienceWorld": audience_world,
                "response": response_payload,
            },
            proxyAnalysis={
                "summary": analysis["summary"],
                "scores": analysis["scores"],
                "timeline": timeline,
                "roomVoices": room_voices,
                "markers": analysis.get("markers", []),
                "deadspaceCuts": analysis.get("deadspaceCuts", []),
                "warnings": warnings,
            },
            warnings=warnings,
        )

    def _service_base_url(self) -> str:
        base_url = self.settings.mirofish_base_url
        if base_url:
            return base_url.rstrip("/")
        return "http://127.0.0.1:5001"

    def _service_healthy(self) -> bool:
        if not self.has_install():
            return False
        try:
            with httpx.Client(
                timeout=httpx.Timeout(3.0, read=3.0),
                headers=self._service_headers(),
            ) as client:
                response = client.get(f"{self._service_base_url()}/health")
                response.raise_for_status()
        except httpx.HTTPError:
            return False
        return True

    @staticmethod
    def _service_headers() -> dict[str, str]:
        return dict(MIROFISH_REQUEST_HEADERS)

    def _ensure_service_ready(self) -> str:
        if not self.has_install():
            raise MiroFishIntegrationError(
                "MiroFish is not configured. Set MIROFISH_BASE_URL to a running service or "
                "set MIROFISH_REPO_DIR and MIROFISH_AUTO_START=true."
            )

        base_url = self._service_base_url()
        if self._service_healthy():
            return base_url

        if not self.settings.mirofish_auto_start:
            raise MiroFishIntegrationError(
                "MiroFish is configured but not reachable. Start the official MiroFish backend "
                "or enable MIROFISH_AUTO_START."
            )

        repo_dir = self.settings.mirofish_repo_dir
        if repo_dir is None:
            raise MiroFishIntegrationError(
                "MIROFISH_AUTO_START requires MIROFISH_REPO_DIR to point at the official repo checkout."
            )

        self._write_managed_repo_env(repo_dir)
        self._start_local_service(repo_dir)
        deadline = time.monotonic() + 45.0
        while time.monotonic() < deadline:
            if self._service_healthy():
                return base_url
            time.sleep(1.0)

        raise MiroFishIntegrationError(
            "MiroFish auto-started but never became healthy. Check the sidecar log under storage/cache."
        )

    def _start_local_service(self, repo_dir: Path) -> None:
        if self._service_process and self._service_process.poll() is None:
            return

        backend_dir = repo_dir / "backend"
        if not (backend_dir / "run.py").exists():
            raise MiroFishIntegrationError(
                f"MIROFISH_REPO_DIR does not look like the official repo: {repo_dir}"
            )

        parsed = urlparse(self._service_base_url())
        port = parsed.port or 5001
        log_path = self.settings.cache_dir / "mirofish-backend.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = log_path.open("a", encoding="utf-8")
        env = os.environ.copy()
        env.setdefault("FLASK_HOST", "127.0.0.1")
        env["FLASK_PORT"] = str(port)

        self._service_process = subprocess.Popen(
            ["uv", "run", "python", "run.py"],
            cwd=backend_dir,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )

    def _write_managed_repo_env(self, repo_dir: Path) -> None:
        env_path = repo_dir / ".env"
        managed_env = self._managed_sidecar_env()
        env_path.write_text(
            "\n".join(f"{key}={value}" for key, value in managed_env.items()) + "\n",
            encoding="utf-8",
        )

    def _managed_sidecar_env(self) -> dict[str, str]:
        zep_api_key = self.settings.mirofish_zep_api_key
        if not zep_api_key:
            raise MiroFishIntegrationError(
                "Auto-starting MiroFish requires MIROFISH_ZEP_API_KEY."
            )

        if self.settings.mirofish_llm_api_key:
            return {
                "LLM_API_KEY": self.settings.mirofish_llm_api_key,
                "LLM_BASE_URL": self.settings.mirofish_llm_base_url or GEMINI_OPENAI_BASE_URL,
                "LLM_MODEL_NAME": self.settings.mirofish_llm_model_name or self.settings.gemini_model,
                "ZEP_API_KEY": zep_api_key,
            }

        if self.settings.gemini_platform == "vertex":
            return self._vertex_sidecar_env(zep_api_key)

        if self.settings.gemini_api_key:
            return {
                "LLM_API_KEY": self.settings.gemini_api_key,
                "LLM_BASE_URL": self.settings.mirofish_llm_base_url or GEMINI_OPENAI_BASE_URL,
                "LLM_MODEL_NAME": self.settings.mirofish_llm_model_name or self.settings.gemini_model,
                "ZEP_API_KEY": zep_api_key,
            }

        raise MiroFishIntegrationError(
            "Auto-starting MiroFish requires an LLM credential. "
            "Set MIROFISH_LLM_API_KEY, or configure Gemini credentials for the selected Gemini platform."
        )

    def _vertex_sidecar_env(self, zep_api_key: str) -> dict[str, str]:
        try:
            credentials, detected_project_id = google_auth_default(scopes=[self.VERTEX_SCOPE])
        except DefaultCredentialsError as exc:
            raise MiroFishIntegrationError(
                "Vertex-backed MiroFish auto-start needs Application Default Credentials. "
                "Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file or run "
                "`gcloud auth application-default login` on a machine with gcloud installed."
            ) from exc

        credentials.refresh(GoogleAuthRequest())
        if not credentials.token:
            raise MiroFishIntegrationError("Could not mint a Vertex access token for the MiroFish sidecar.")

        project_id = (
            self.settings.mirofish_vertex_project_id
            or os.environ.get("GOOGLE_CLOUD_PROJECT")
            or os.environ.get("GCLOUD_PROJECT")
            or detected_project_id
        )
        if not project_id:
            raise MiroFishIntegrationError(
                "Vertex-backed MiroFish auto-start needs a Google Cloud project id. "
                "Set MIROFISH_VERTEX_PROJECT_ID or GOOGLE_CLOUD_PROJECT."
            )

        model_name = self.settings.mirofish_llm_model_name or self.settings.gemini_model
        if not model_name.startswith("google/"):
            model_name = f"google/{model_name}"

        return {
            "LLM_API_KEY": credentials.token,
            "LLM_BASE_URL": (
                self.settings.mirofish_llm_base_url
                or f"https://aiplatform.googleapis.com/v1/projects/{project_id}/locations/"
                f"{self.settings.mirofish_vertex_location}/endpoints/openapi"
            ),
            "LLM_MODEL_NAME": model_name,
            "ZEP_API_KEY": zep_api_key,
        }

    def _create_project(self, client: httpx.Client, base_url: str, brief: MiroFishBrief) -> str:
        response = client.post(
            f"{base_url}/api/graph/ontology/generate",
            data={
                "simulation_requirement": brief.simulationRequirement,
                "project_name": brief.projectName,
            },
            files=[
                (
                    "files",
                    (
                        brief.projectFileName,
                        brief.markdown.encode("utf-8"),
                        "text/markdown",
                    ),
                )
            ],
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise MiroFishIntegrationError(str(payload.get("error") or "MiroFish project creation failed."))
        return str(payload["data"]["project_id"])

    def _build_graph(self, client: httpx.Client, base_url: str, project_id: str) -> str:
        response = client.post(
            f"{base_url}/api/graph/build",
            json={"project_id": project_id, "graph_name": f"Twine {project_id}"},
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise MiroFishIntegrationError(str(payload.get("error") or "MiroFish graph build failed to start."))
        task_id = str(payload["data"]["task_id"])

        deadline = time.monotonic() + self.settings.mirofish_timeout_seconds
        while time.monotonic() < deadline:
            task_response = client.get(f"{base_url}/api/graph/task/{task_id}")
            task_response.raise_for_status()
            task_payload = task_response.json()
            if not task_payload.get("success"):
                raise MiroFishIntegrationError(str(task_payload.get("error") or "MiroFish graph task failed."))
            status = str(task_payload["data"].get("status", "")).lower()
            if status == "completed":
                result = task_payload["data"].get("result") or {}
                return str(result["graph_id"])
            if status == "failed":
                raise MiroFishIntegrationError(str(task_payload["data"].get("error") or "MiroFish graph task failed."))
            time.sleep(self.settings.mirofish_poll_seconds)

        raise MiroFishIntegrationError("Timed out waiting for MiroFish graph build to finish.")

    def _create_simulation(
        self,
        client: httpx.Client,
        base_url: str,
        project_id: str,
        graph_id: str,
    ) -> str:
        response = client.post(
            f"{base_url}/api/simulation/create",
            json={"project_id": project_id, "graph_id": graph_id, "enable_twitter": True, "enable_reddit": True},
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise MiroFishIntegrationError(str(payload.get("error") or "MiroFish simulation creation failed."))
        return str(payload["data"]["simulation_id"])

    def _prepare_simulation(self, client: httpx.Client, base_url: str, simulation_id: str) -> None:
        response = client.post(
            f"{base_url}/api/simulation/prepare",
            json={"simulation_id": simulation_id, "parallel_profile_count": 5},
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise MiroFishIntegrationError(str(payload.get("error") or "MiroFish simulation preparation failed."))
        data = payload.get("data") or {}
        if data.get("already_prepared") or str(data.get("status", "")).lower() == "ready":
            return
        task_id = data.get("task_id")
        if not task_id:
            raise MiroFishIntegrationError("MiroFish prepare response did not include a task id.")

        deadline = time.monotonic() + self.settings.mirofish_timeout_seconds
        while time.monotonic() < deadline:
            status_response = client.post(
                f"{base_url}/api/simulation/prepare/status",
                json={"task_id": task_id, "simulation_id": simulation_id},
            )
            status_response.raise_for_status()
            status_payload = status_response.json()
            if not status_payload.get("success"):
                raise MiroFishIntegrationError(str(status_payload.get("error") or "MiroFish prepare status failed."))
            status = str(status_payload["data"].get("status", "")).lower()
            if status in {"completed", "ready"}:
                return
            if status == "failed":
                raise MiroFishIntegrationError(
                    str(status_payload["data"].get("error") or "MiroFish simulation preparation failed.")
                )
            time.sleep(self.settings.mirofish_poll_seconds)

        raise MiroFishIntegrationError("Timed out waiting for MiroFish simulation preparation to finish.")

    def _run_simulation(
        self,
        client: httpx.Client,
        base_url: str,
        simulation_id: str,
        *,
        graph_id: str,
    ) -> None:
        response = client.post(
            f"{base_url}/api/simulation/start",
            json={
                "simulation_id": simulation_id,
                "platform": "parallel",
                "max_rounds": self.settings.mirofish_simulation_max_rounds,
                "enable_graph_memory_update": True,
            },
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise MiroFishIntegrationError(str(payload.get("error") or "MiroFish simulation start failed."))

        deadline = time.monotonic() + self.settings.mirofish_timeout_seconds
        while time.monotonic() < deadline:
            status_response = client.get(f"{base_url}/api/simulation/{simulation_id}/run-status")
            status_response.raise_for_status()
            status_payload = status_response.json()
            if not status_payload.get("success"):
                raise MiroFishIntegrationError(str(status_payload.get("error") or "MiroFish run status failed."))
            runner_status = str(status_payload["data"].get("runner_status", "")).lower()
            if runner_status in {"completed", "stopped"}:
                return
            if runner_status == "failed":
                raise MiroFishIntegrationError("MiroFish simulation run failed.")
            time.sleep(self.settings.mirofish_poll_seconds)

        raise MiroFishIntegrationError("Timed out waiting for MiroFish simulation run to finish.")

    def _request_structured_outlook(
        self,
        client: httpx.Client,
        base_url: str,
        simulation_id: str,
        windows: list[dict[str, object]],
    ) -> dict[str, Any]:
        prompt = (
            "You are summarizing the completed MiroFish simulation for a short-form video audience study. "
            "Return strict JSON only with keys summary, scores, timeline, markers, deadspaceCuts, warnings. "
            "Use the exact window timestamps from this source timeline and keep them in order:\n"
            f"{json.dumps(windows, ensure_ascii=True)}\n\n"
            "Schema guidance:\n"
            "- summary: overallRecommendation, strengths[], weaknesses[]\n"
            "- scores: hookScore, pacingScore, retentionEstimate, viralPotential as integers 0-100; "
            "confidence as low|medium|high; helpingFactors[]; hurtingFactors[]\n"
            "- timeline: one object per source window with startSec, endSec, globalActivation, motionScore, "
            "audioEnergy, transcriptDensity, sceneChange, silenceOverlap, note\n"
            "- markers: optional objects with t, type (strong_hook|attention_drop|deadspace_candidate|high_rewatch_moment|pacing_issue|audio_energy_drop), "
            "severity (low|medium|high), explanation, suggestion\n"
            "- deadspaceCuts: optional objects with start, end, reason\n"
            "- warnings: array of strings\n"
            "Interpret this as simulated consumer sentiment and room energy, not literal neuroscience. "
            "All natural-language output must be English only. "
            "Do not use Chinese or any other non-English language in any string field. "
            "If the source material implies non-English phrasing, translate or paraphrase it into natural English."
        )

        response = client.post(
            f"{base_url}/api/report/chat",
            json={"simulation_id": simulation_id, "message": prompt, "chat_history": []},
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise MiroFishIntegrationError(str(payload.get("error") or "MiroFish report agent chat failed."))
        return payload

    def hydrate_audience_world(
        self,
        simulation_id: str,
        *,
        windows: list[dict[str, object]] | None = None,
        include_cached_interviews: bool = True,
    ) -> dict[str, Any]:
        base_url = self._ensure_service_ready()
        try:
            with httpx.Client(
                timeout=httpx.Timeout(30.0, read=120.0),
                headers=self._service_headers(),
            ) as client:
                return self._hydrate_audience_world(
                    client,
                    base_url,
                    simulation_id,
                    windows=windows or [],
                    include_cached_interviews=include_cached_interviews,
                )
        except httpx.HTTPStatusError as exc:
            self._model_error = f"MiroFish returned HTTP {exc.response.status_code}."
            raise MiroFishIntegrationError(self._model_error) from exc
        except httpx.HTTPError as exc:
            self._model_error = f"MiroFish request failed: {exc}"
            raise MiroFishIntegrationError(self._model_error) from exc

    def interview_agents(
        self,
        simulation_id: str,
        *,
        agent_ids: list[int],
        prompt: str,
        platform: str | None = None,
    ) -> list[dict[str, Any]]:
        base_url = self._ensure_service_ready()
        try:
            with httpx.Client(
                timeout=httpx.Timeout(30.0, read=120.0),
                headers=self._service_headers(),
            ) as client:
                return self._interview_agents(
                    client,
                    base_url,
                    simulation_id,
                    agent_ids=agent_ids,
                    prompt=prompt,
                    platform=platform,
                )
        except httpx.HTTPStatusError as exc:
            self._model_error = f"MiroFish returned HTTP {exc.response.status_code}."
            raise MiroFishIntegrationError(self._model_error) from exc
        except httpx.HTTPError as exc:
            self._model_error = f"MiroFish request failed: {exc}"
            raise MiroFishIntegrationError(self._model_error) from exc

    def _hydrate_audience_world(
        self,
        client: httpx.Client,
        base_url: str,
        simulation_id: str,
        *,
        windows: list[dict[str, object]],
        include_cached_interviews: bool,
    ) -> dict[str, Any]:
        reddit_posts = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/posts",
            params={"platform": "reddit", "limit": 120, "offset": 0},
        ).get("posts", [])
        twitter_posts = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/posts",
            params={"platform": "twitter", "limit": 120, "offset": 0},
        ).get("posts", [])
        comments = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/comments",
            params={"limit": 240, "offset": 0},
        ).get("comments", [])
        reddit_profiles = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/profiles/realtime",
            params={"platform": "reddit"},
        ).get("profiles", [])
        twitter_profiles = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/profiles/realtime",
            params={"platform": "twitter"},
        ).get("profiles", [])
        agent_stats = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/agent-stats",
        ).get("stats", [])
        timeline = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/timeline",
        ).get("timeline", [])
        run_detail = self._service_data(
            client,
            f"{base_url}/api/simulation/{simulation_id}/run-status/detail",
        )

        merged_profiles, agent_platforms = self._merge_profiles(
            reddit_profiles=reddit_profiles,
            twitter_profiles=twitter_profiles,
        )
        stats_by_agent = {
            int(item.get("agent_id", 0)): item for item in agent_stats if item.get("agent_id") is not None
        }
        agents = self._normalize_world_agents(merged_profiles, agent_platforms, stats_by_agent)
        cohorts, agent_to_cohort = self._build_audience_cohorts(
            agents=agents,
            posts=[*reddit_posts, *twitter_posts],
            comments=comments,
        )
        threads = self._build_threads(
            reddit_posts=reddit_posts,
            twitter_posts=twitter_posts,
            comments=comments,
            profiles=merged_profiles,
            stats_by_agent=stats_by_agent,
            agent_to_cohort=agent_to_cohort,
        )
        platform_breakdown = self._platform_breakdown(threads)
        interviews: list[dict[str, Any]] = []
        if include_cached_interviews:
            interviews = self._cached_interviews(
                client,
                base_url,
                simulation_id,
                threads=threads,
            )
        evidence_moments = self._build_evidence_moments(
            windows=windows,
            threads=threads,
            timeline=timeline,
            run_detail=run_detail,
            agent_to_cohort=agent_to_cohort,
        )
        if windows:
            moment_ids = {item["windowId"] for item in evidence_moments}
            for cohort in cohorts:
                if not cohort["momentIds"]:
                    cohort["momentIds"] = sorted(moment_ids)

        status = "hydrating"
        if threads or agents:
            status = "ready" if include_cached_interviews else "hydrating"
            if include_cached_interviews and not interviews:
                status = "partial"
        else:
            status = "unavailable"

        return {
            "status": status,
            "simulationId": simulation_id,
            "platformBreakdown": platform_breakdown,
            "cohorts": cohorts,
            "threads": threads,
            "agents": agents,
            "interviews": interviews,
            "evidenceMoments": evidence_moments,
        }

    @staticmethod
    def _service_data(
        client: httpx.Client,
        url: str,
        *,
        params: dict[str, object] | None = None,
        json_body: dict[str, object] | None = None,
        method: str = "GET",
    ) -> dict[str, Any]:
        response = (
            client.post(url, json=json_body)
            if method.upper() == "POST"
            else client.get(url, params=params)
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise MiroFishIntegrationError(str(payload.get("error") or f"MiroFish request failed for {url}."))
        data = payload.get("data")
        return data if isinstance(data, dict) else {}

    def _merge_profiles(
        self,
        *,
        reddit_profiles: list[dict[str, Any]],
        twitter_profiles: list[dict[str, Any]],
    ) -> tuple[dict[int, dict[str, Any]], dict[int, set[str]]]:
        merged: dict[int, dict[str, Any]] = {}
        platforms: dict[int, set[str]] = defaultdict(set)

        for platform, profiles in (("reddit", reddit_profiles), ("twitter", twitter_profiles)):
            for item in profiles:
                agent_id = int(item.get("agent_id", 0) or 0)
                if agent_id <= 0:
                    continue
                current = merged.setdefault(agent_id, {"agent_id": agent_id})
                for key in ("name", "username", "profession", "bio"):
                    value = str(item.get(key) or "").strip()
                    if value and not current.get(key):
                        current[key] = value
                platforms[agent_id].add(platform)
        return merged, platforms

    def _normalize_world_agents(
        self,
        merged_profiles: dict[int, dict[str, Any]],
        agent_platforms: dict[int, set[str]],
        stats_by_agent: dict[int, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        all_agent_ids = sorted(
            set(merged_profiles.keys()) | set(stats_by_agent.keys()),
            key=lambda agent_id: int(stats_by_agent.get(agent_id, {}).get("total_actions", 0)),
            reverse=True,
        )
        agents: list[dict[str, Any]] = []
        for agent_id in all_agent_ids:
            profile = merged_profiles.get(agent_id, {})
            stats = stats_by_agent.get(agent_id, {})
            username = str(profile.get("username") or stats.get("agent_name") or f"agent_{agent_id}").strip()
            display_name = str(profile.get("name") or stats.get("agent_name") or self._humanize_handle(username)).strip()
            role = str(profile.get("profession") or profile.get("bio") or "Simulated audience agent").strip()
            handle = f"@{username.lstrip('@')}"
            platforms = sorted(agent_platforms.get(agent_id) or self._platforms_from_stats(stats))
            agents.append(
                {
                    "id": agent_id,
                    "displayName": display_name,
                    "handle": handle,
                    "role": role,
                    "platforms": platforms,
                    "bio": str(profile.get("bio") or "").strip() or None,
                    "stats": {
                        "totalActions": int(stats.get("total_actions", 0) or 0),
                        "redditActions": int(stats.get("reddit_actions", 0) or 0),
                        "twitterActions": int(stats.get("twitter_actions", 0) or 0),
                    },
                }
            )
        return agents

    @staticmethod
    def _platforms_from_stats(stats: dict[str, Any]) -> set[str]:
        platforms: set[str] = set()
        if int(stats.get("reddit_actions", 0) or 0) > 0:
            platforms.add("reddit")
        if int(stats.get("twitter_actions", 0) or 0) > 0:
            platforms.add("twitter")
        return platforms

    def _build_threads(
        self,
        *,
        reddit_posts: list[dict[str, Any]],
        twitter_posts: list[dict[str, Any]],
        comments: list[dict[str, Any]],
        profiles: dict[int, dict[str, Any]],
        stats_by_agent: dict[int, dict[str, Any]],
        agent_to_cohort: dict[int, str],
    ) -> list[dict[str, Any]]:
        comments_by_post: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for comment in comments:
            post_id = int(comment.get("post_id", 0) or 0)
            if post_id:
                comments_by_post[post_id].append(comment)

        threads: list[dict[str, Any]] = []
        for platform, posts in (("reddit", reddit_posts), ("twitter", twitter_posts)):
            for post in posts:
                post_id = int(post.get("post_id", 0) or 0)
                if post_id <= 0:
                    continue
                root = self._world_comment_from_record(
                    record=post,
                    platform=platform,
                    kind="post",
                    profiles=profiles,
                    stats_by_agent=stats_by_agent,
                )
                replies = []
                if platform == "reddit":
                    replies = [
                        self._world_comment_from_record(
                            record=comment,
                            platform=platform,
                            kind="comment",
                            profiles=profiles,
                            stats_by_agent=stats_by_agent,
                        )
                        for comment in sorted(
                            comments_by_post.get(post_id, []),
                            key=lambda item: (
                                -int(item.get("num_likes", 0) or 0),
                                str(item.get("created_at", "")),
                            ),
                        )
                    ]
                stances = [self._voice_stance(root["content"]), *(self._voice_stance(reply["content"]) for reply in replies)]
                stance_counts = Counter(stances)
                dominant_stance = "mixed"
                if stance_counts:
                    ordered_stances = stance_counts.most_common()
                    dominant_stance = ordered_stances[0][0]
                    if len(ordered_stances) > 1 and ordered_stances[0][1] == ordered_stances[1][1]:
                        dominant_stance = "mixed"
                cohort_ids = {
                    agent_to_cohort.get(root.get("agentId") or -1),
                    *(agent_to_cohort.get(reply.get("agentId") or -1) for reply in replies),
                }
                engagement = int(root["likes"]) + int(root["shares"]) + sum(int(reply["likes"]) for reply in replies)
                threads.append(
                    {
                        "id": root["id"],
                        "platform": platform,
                        "dominantStance": dominant_stance,
                        "engagement": engagement,
                        "replyCount": len(replies),
                        "participatingCohortIds": sorted(cohort_id for cohort_id in cohort_ids if cohort_id),
                        "rootPost": root,
                        "replies": replies,
                    }
                )
        return sorted(
            threads,
            key=lambda item: (-int(item["engagement"]), -int(item["replyCount"]), str(item["id"])),
        )

    def _world_comment_from_record(
        self,
        *,
        record: dict[str, Any],
        platform: str,
        kind: str,
        profiles: dict[int, dict[str, Any]],
        stats_by_agent: dict[int, dict[str, Any]],
    ) -> dict[str, Any]:
        agent_id = int(record.get("user_id", 0) or 0)
        profile = profiles.get(agent_id, {})
        stats = stats_by_agent.get(agent_id, {})
        username = str(profile.get("username") or stats.get("agent_name") or f"agent_{agent_id}").strip()
        display_name = str(profile.get("name") or stats.get("agent_name") or self._humanize_handle(username)).strip()
        content = str(record.get("content") or record.get("title") or "").strip()
        role = str(profile.get("profession") or profile.get("bio") or "Simulated audience agent").strip()
        record_id = int(record.get(f"{kind}_id", 0) or 0)
        return {
            "id": f"{platform}-{kind}-{record_id}",
            "agentId": agent_id if agent_id > 0 else None,
            "speaker": display_name,
            "handle": f"@{username.lstrip('@')}",
            "role": role,
            "platform": platform,
            "content": content,
            "createdAt": record.get("created_at"),
            "likes": int(record.get("num_likes", 0) or 0),
            "shares": int(record.get("num_shares", 0) or 0),
        }

    def _build_audience_cohorts(
        self,
        *,
        agents: list[dict[str, Any]],
        posts: list[dict[str, Any]],
        comments: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], dict[int, str]]:
        text_by_agent: dict[int, list[str]] = defaultdict(list)
        for item in [*posts, *comments]:
            agent_id = int(item.get("user_id", 0) or 0)
            if agent_id > 0:
                text_by_agent[agent_id].append(str(item.get("content") or "").strip())

        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        agent_to_cohort: dict[int, str] = {}
        for agent in agents:
            agent_id = int(agent["id"])
            agent_texts = text_by_agent.get(agent_id, [])
            dominant_stance = self._dominant_stance(agent_texts)
            cohort_id, label = self._cohort_identity(agent, dominant_stance=dominant_stance)
            grouped[cohort_id].append(
                {
                    **agent,
                    "_label": label,
                    "_texts": agent_texts,
                    "_dominant_stance": dominant_stance,
                }
            )
            agent_to_cohort[agent_id] = cohort_id

        cohorts: list[dict[str, Any]] = []
        for cohort_id, members in sorted(grouped.items(), key=lambda item: len(item[1]), reverse=True):
            members = sorted(
                members,
                key=lambda item: (
                    -int(item["stats"]["totalActions"]),
                    str(item["displayName"]).lower(),
                ),
            )
            label = str(members[0]["_label"])
            sentiments = [self._voice_stance(text) for member in members for text in member["_texts"] if text]
            leaning = self._dominant_stance_from_values(
                sentiments or [str(member["_dominant_stance"]) for member in members]
            )
            liked = self._top_supporting_lines([text for member in members for text in member["_texts"]])
            blocked = self._top_blocking_lines([text for member in members for text in member["_texts"]])
            proof_threshold = (
                "Needs clearer proof before the claim fully lands."
                if blocked
                else "Needs enough proof to justify trying the workflow."
            )
            cohorts.append(
                {
                    "id": cohort_id,
                    "label": label,
                    "size": len(members),
                    "leaning": leaning,
                    "proofThreshold": proof_threshold,
                    "keyConcerns": blocked[:3] or ["Still looking for stronger proof in the back half."],
                    "liked": liked[:3],
                    "blocked": blocked[:3],
                    "representativeAgentIds": [int(member["id"]) for member in members[:3]],
                    "momentIds": [],
                }
            )
        return cohorts[:5], agent_to_cohort

    @staticmethod
    def _cohort_identity(
        agent: dict[str, Any],
        *,
        dominant_stance: str,
    ) -> tuple[str, str]:
        role_text = " ".join(
            part.strip().lower()
            for part in (str(agent.get("role") or ""), str(agent.get("bio") or ""))
            if part and part.strip()
        ).strip()
        generic_role = role_text in {"", "simulated audience agent"}
        if not generic_role and any(token in role_text for token in ("ugc", "creator", "editor")):
            return ("ugc-creators", "UGC creators")
        if not generic_role and any(token in role_text for token in ("brand", "growth", "marketing", "strategist")):
            return ("growth-brand", "Growth and brand operators")
        if not generic_role and any(token in role_text for token in ("analyst", "research", "strategy")):
            return ("analysts", "Analysts and planners")
        if not generic_role and any(token in role_text for token in ("parent", "mom", "dad", "family")):
            return ("parents", "Parents")

        stats = agent.get("stats", {})
        total_actions = int(stats.get("totalActions", 0) or 0)
        reddit_actions = int(stats.get("redditActions", 0) or 0)
        twitter_actions = int(stats.get("twitterActions", 0) or 0)

        if total_actions <= 4:
            return ("quiet-observers", "Quiet observers")

        if twitter_actions >= reddit_actions + 2:
            if dominant_stance == "negative":
                return ("twitter-skeptics", "Twitter-first skeptics")
            if dominant_stance == "positive":
                return ("twitter-boosters", "Twitter-first boosters")
            return ("twitter-watchers", "Twitter-first watchers")

        if reddit_actions >= twitter_actions + 2:
            if dominant_stance == "negative":
                return ("reddit-skeptics", "Reddit-first skeptics")
            if dominant_stance == "positive":
                return ("reddit-advocates", "Reddit-first advocates")
            return ("reddit-evaluators", "Reddit-first evaluators")

        if dominant_stance == "negative":
            return ("cross-platform-skeptics", "Cross-platform skeptics")
        if dominant_stance == "positive":
            return ("cross-platform-supporters", "Cross-platform supporters")
        return ("cross-platform-watchers", "Cross-platform watchers")

    @classmethod
    def _dominant_stance(cls, texts: list[str]) -> str:
        sentiments = [cls._voice_stance(text) for text in texts if text.strip()]
        return cls._dominant_stance_from_values(sentiments)

    @staticmethod
    def _dominant_stance_from_values(sentiments: list[str]) -> str:
        if not sentiments:
            return "mixed"
        counts = Counter(sentiments)
        ordered = counts.most_common()
        if len(ordered) > 1 and ordered[0][1] == ordered[1][1]:
            return "mixed"
        return str(ordered[0][0])

    def _platform_breakdown(self, threads: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_platform: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for thread in threads:
            by_platform[str(thread["platform"])].append(thread)
        breakdown: list[dict[str, Any]] = []
        for platform, platform_threads in sorted(by_platform.items()):
            stances = Counter(str(thread["dominantStance"]) for thread in platform_threads)
            dominant = stances.most_common(1)[0][0] if stances else "mixed"
            breakdown.append(
                {
                    "platform": platform,
                    "volume": len(platform_threads) + sum(int(thread["replyCount"]) for thread in platform_threads),
                    "engagement": sum(int(thread["engagement"]) for thread in platform_threads),
                    "leaning": dominant,
                    "dominantNarratives": self._dominant_narratives(platform_threads),
                }
            )
        return sorted(breakdown, key=lambda item: (-int(item["engagement"]), str(item["platform"])))

    @staticmethod
    def _dominant_narratives(threads: list[dict[str, Any]]) -> list[str]:
        narratives: list[str] = []
        for thread in threads[:3]:
            content = str(thread["rootPost"]["content"]).strip()
            if not content:
                continue
            narratives.append(content[:120].rstrip(". ") + ("." if not content.endswith(".") else ""))
        return narratives

    def _cached_interviews(
        self,
        client: httpx.Client,
        base_url: str,
        simulation_id: str,
        *,
        threads: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not threads:
            return []
        ranked_agents: list[tuple[int, str]] = []
        seen_agents: set[int] = set()
        for thread in threads:
            root = thread.get("rootPost") or {}
            agent_id = int(root.get("agentId") or 0)
            if agent_id > 0 and agent_id not in seen_agents:
                stance = str(thread.get("dominantStance") or "mixed")
                ranked_agents.append((agent_id, stance))
                seen_agents.add(agent_id)

        positive_agent = next((agent_id for agent_id, stance in ranked_agents if stance == "positive"), None)
        if positive_agent is None and ranked_agents:
            positive_agent = ranked_agents[0][0]
        skeptical_agent = next((agent_id for agent_id, stance in ranked_agents if stance == "negative"), None)
        interviews_request: list[dict[str, Any]] = []
        if positive_agent is not None:
            interviews_request.append(
                {"agent_id": positive_agent, "prompt": "What made you trust this moment?"}
            )
        if skeptical_agent is not None:
            interviews_request.append(
                {"agent_id": skeptical_agent, "prompt": "What made you skeptical of this video?"}
            )
        if not interviews_request:
            return []

        payload = self._service_data(
            client,
            f"{base_url}/api/simulation/interview/batch",
            json_body={
                "simulation_id": simulation_id,
                "interviews": interviews_request,
                "timeout": 120,
            },
            method="POST",
        )
        results = ((payload.get("result") or {}).get("results") or {})
        interviews: list[dict[str, Any]] = []
        prompt_by_agent = {int(item["agent_id"]): str(item["prompt"]) for item in interviews_request}
        for value in results.values():
            if not isinstance(value, dict):
                continue
            agent_id = int(value.get("agent_id", 0) or 0)
            response = str(value.get("response") or "").strip()
            if agent_id <= 0 or not response:
                continue
            interviews.append(
                {
                    "agentId": agent_id,
                    "prompt": prompt_by_agent.get(agent_id, ""),
                    "response": response,
                    "platform": value.get("platform"),
                    "cached": True,
                }
            )
        return interviews

    def _build_evidence_moments(
        self,
        *,
        windows: list[dict[str, object]],
        threads: list[dict[str, Any]],
        timeline: list[dict[str, Any]],
        run_detail: dict[str, Any],
        agent_to_cohort: dict[int, str],
    ) -> list[dict[str, Any]]:
        evidence: list[dict[str, Any]] = []
        all_actions = run_detail.get("all_actions") or []
        sorted_threads = threads or []
        for index, window in enumerate(windows, start=1):
            thread = sorted_threads[min(index - 1, max(len(sorted_threads) - 1, 0))] if sorted_threads else None
            headline = str(window.get("note") or "The room reacts strongly here.").strip()
            reason = headline
            thread_ids: list[str] = []
            cohort_ids: list[str] = []
            agent_ids: list[int] = []
            if thread:
                thread_ids = [str(thread["id"])]
                cohort_ids = list(thread.get("participatingCohortIds") or [])
                root_agent_id = int(thread["rootPost"].get("agentId") or 0)
                if root_agent_id > 0:
                    agent_ids.append(root_agent_id)
                reason = str(thread["rootPost"]["content"]).strip()[:180]
            if index - 1 < len(timeline):
                round_num = int(timeline[index - 1].get("round_num", 0) or 0)
                action = next(
                    (
                        item
                        for item in all_actions
                        if int(item.get("round_num", 0) or 0) == round_num
                    ),
                    None,
                )
                if action:
                    action_agent_id = int(action.get("agent_id", 0) or 0)
                    if action_agent_id > 0 and action_agent_id not in agent_ids:
                        agent_ids.append(action_agent_id)
                    cohort_id = agent_to_cohort.get(action_agent_id)
                    if cohort_id and cohort_id not in cohort_ids:
                        cohort_ids.append(cohort_id)
            evidence.append(
                {
                    "windowId": f"window-{index}",
                    "startSec": float(window.get("startSec", 0.0) or 0.0),
                    "endSec": float(window.get("endSec", 0.0) or 0.0),
                    "headline": headline,
                    "reason": reason,
                    "threadIds": thread_ids,
                    "cohortIds": cohort_ids,
                    "agentIds": agent_ids,
                }
            )
        return evidence

    def _interview_agents(
        self,
        client: httpx.Client,
        base_url: str,
        simulation_id: str,
        *,
        agent_ids: list[int],
        prompt: str,
        platform: str | None,
    ) -> list[dict[str, Any]]:
        payload = self._service_data(
            client,
            f"{base_url}/api/simulation/interview/batch",
            json_body={
                "simulation_id": simulation_id,
                "interviews": [
                    {"agent_id": int(agent_id), "prompt": prompt, **({"platform": platform} if platform else {})}
                    for agent_id in agent_ids
                ],
                **({"platform": platform} if platform else {}),
                "timeout": 120,
            },
            method="POST",
        )
        results = ((payload.get("result") or {}).get("results") or {})
        interviews: list[dict[str, Any]] = []
        for value in results.values():
            if not isinstance(value, dict):
                continue
            agent_id = int(value.get("agent_id", 0) or 0)
            response = str(value.get("response") or "").strip()
            if agent_id <= 0 or not response:
                continue
            interviews.append(
                {
                    "agentId": agent_id,
                    "prompt": prompt,
                    "response": response,
                    "platform": value.get("platform") or platform,
                    "cached": False,
                }
            )
        return sorted(interviews, key=lambda item: (agent_ids.index(int(item["agentId"])), str(item.get("platform") or "")))

    @staticmethod
    def _top_supporting_lines(texts: list[str]) -> list[str]:
        return [
            text.strip()
            for text in texts
            if text.strip() and MiroFishRunner._voice_stance(text) == "positive"
        ][:3]

    @staticmethod
    def _top_blocking_lines(texts: list[str]) -> list[str]:
        return [
            text.strip()
            for text in texts
            if text.strip() and MiroFishRunner._voice_stance(text) == "negative"
        ][:3]

    def _load_room_voices(
        self,
        simulation_id: str,
        *,
        classify_with_gemini: bool = False,
    ) -> list[dict[str, str]]:
        simulation_dir = self._simulation_artifact_dir(simulation_id)
        if simulation_dir is None:
            return []

        profile_map = self._load_profile_map(simulation_dir / "reddit_profiles.json")
        candidates = [
            *self._voice_candidates_from_db(
                simulation_dir / "reddit_simulation.db",
                platform="Reddit",
                profile_map=profile_map,
            ),
            *self._voice_candidates_from_db(
                simulation_dir / "twitter_simulation.db",
                platform="X",
                profile_map=profile_map,
            ),
        ]

        deduped_candidates: list[dict[str, object]] = []
        seen_handles: set[str] = set()
        seen_quotes: set[str] = set()
        for candidate in sorted(
            candidates,
            key=lambda item: (
                -int(item["score"]),
                str(item["created_at"]),
                str(item["speaker"]).lower(),
            ),
        ):
            handle = str(candidate["raw_handle"])
            quote = str(candidate["quote"])
            if handle in seen_handles or quote in seen_quotes:
                continue
            deduped_candidates.append(candidate)
            seen_handles.add(handle)
            seen_quotes.add(quote)
            if len(deduped_candidates) >= MIROFISH_ROOM_VOICE_LIMIT * 3:
                break
        if classify_with_gemini:
            deduped_candidates = self._classify_room_voice_stances_with_gemini(deduped_candidates)
        return self._balanced_room_voices(deduped_candidates)

    def _simulation_artifact_dir(self, simulation_id: str) -> Path | None:
        repo_dir = self.settings.mirofish_repo_dir
        if repo_dir is None:
            return None
        candidate = repo_dir / "backend" / "uploads" / "simulations" / simulation_id
        if candidate.exists():
            return candidate
        return None

    @staticmethod
    def _load_profile_map(profiles_path: Path) -> dict[str, dict[str, str]]:
        if not profiles_path.exists():
            return {}
        try:
            payload = json.loads(profiles_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

        profile_map: dict[str, dict[str, str]] = {}
        if not isinstance(payload, list):
            return profile_map
        for item in payload:
            if not isinstance(item, dict):
                continue
            username = str(item.get("username") or "").strip()
            if not username:
                continue
            profile_map[username] = {
                "speaker": str(item.get("name") or "").strip(),
                "role": str(item.get("profession") or item.get("bio") or "").strip(),
            }
        return profile_map

    def _voice_candidates_from_db(
        self,
        db_path: Path,
        *,
        platform: str,
        profile_map: dict[str, dict[str, str]],
    ) -> list[dict[str, object]]:
        if not db_path.exists():
            return []

        try:
            connection = sqlite3.connect(db_path)
            connection.row_factory = sqlite3.Row
        except sqlite3.Error:
            return []

        try:
            post_rows = connection.execute(
                """
                SELECT
                    COALESCE(NULLIF(TRIM(u.user_name), ''), NULLIF(TRIM(u.name), '')) AS handle,
                    p.content AS content,
                    COALESCE(p.num_likes, 0) AS likes,
                    COALESCE(p.num_shares, 0) AS shares,
                    COALESCE(p.created_at, '') AS created_at,
                    'post' AS kind
                FROM post p
                LEFT JOIN user u ON u.user_id = p.user_id
                WHERE TRIM(COALESCE(p.content, '')) != ''
                """
            ).fetchall()
            comment_rows = connection.execute(
                """
                SELECT
                    COALESCE(NULLIF(TRIM(u.user_name), ''), NULLIF(TRIM(u.name), '')) AS handle,
                    c.content AS content,
                    COALESCE(c.num_likes, 0) AS likes,
                    0 AS shares,
                    COALESCE(c.created_at, '') AS created_at,
                    'comment' AS kind
                FROM comment c
                LEFT JOIN user u ON u.user_id = c.user_id
                WHERE TRIM(COALESCE(c.content, '')) != ''
                """
            ).fetchall()
        except sqlite3.Error:
            return []
        finally:
            connection.close()

        candidates: list[dict[str, object]] = []
        for row in [*post_rows, *comment_rows]:
            handle = str(row["handle"] or "").strip()
            if not handle:
                continue
            quote = self._compact_quote(str(row["content"] or ""))
            if not quote:
                continue
            profile = profile_map.get(handle, {})
            speaker = str(profile.get("speaker") or self._humanize_handle(handle))
            role = self._compact_role(str(profile.get("role") or "Simulated audience voice"))
            likes = int(row["likes"] or 0)
            shares = int(row["shares"] or 0)
            kind = str(row["kind"] or "comment")
            score = likes * 4 + shares * 6 + (2 if kind == "post" else 0)
            candidates.append(
                {
                    "speaker": speaker,
                    "raw_handle": handle,
                    "role": role,
                    "platform": platform,
                    "stance": self._voice_stance(quote),
                    "quote": quote,
                    "score": score,
                    "created_at": str(row["created_at"] or ""),
                }
            )
        return candidates

    def _balanced_room_voices(self, candidates: list[dict[str, object]]) -> list[dict[str, str]]:
        positive = [item for item in candidates if item.get("stance") == "positive"]
        negative = [item for item in candidates if item.get("stance") == "negative"]
        selected_positive = positive[: MIROFISH_ROOM_VOICE_LIMIT // 2]
        selected_negative = negative[: MIROFISH_ROOM_VOICE_LIMIT // 2]

        balanced: list[dict[str, object]] = []
        for index in range(max(len(selected_positive), len(selected_negative))):
            if index < len(selected_positive):
                balanced.append(selected_positive[index])
            if index < len(selected_negative):
                balanced.append(selected_negative[index])

        remaining = [
            *positive[len(selected_positive) :],
            *negative[len(selected_negative) :],
        ]
        for candidate in remaining:
            if len(balanced) >= MIROFISH_ROOM_VOICE_LIMIT:
                break
            balanced.append(candidate)

        return [
            {
                "speaker": str(candidate["speaker"]),
                "handle": f"@{candidate['raw_handle']}",
                "role": str(candidate["role"]),
                "platform": str(candidate["platform"]),
                "stance": str(candidate["stance"]),
                "quote": str(candidate["quote"]),
            }
            for candidate in balanced[:MIROFISH_ROOM_VOICE_LIMIT]
        ]

    def _classify_room_voice_stances_with_gemini(
        self,
        candidates: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        if not candidates or self._brief_helper is None:
            return candidates

        try:
            classified = self._brief_helper.classify_reaction_stances(
                [
                    {
                        "handle": str(candidate["raw_handle"]),
                        "speaker": str(candidate["speaker"]),
                        "role": str(candidate["role"]),
                        "platform": str(candidate["platform"]),
                        "quote": str(candidate["quote"]),
                    }
                    for candidate in candidates
                ]
            )
        except GeminiIntegrationError:
            return candidates

        normalized: list[dict[str, object]] = []
        for candidate in candidates:
            next_candidate = dict(candidate)
            handle = str(candidate["raw_handle"])
            stance = str(classified.get(handle) or candidate.get("stance") or "positive")
            next_candidate["stance"] = "negative" if stance == "negative" else "positive"
            normalized.append(next_candidate)
        return normalized

    @staticmethod
    def _humanize_handle(handle: str) -> str:
        base = re.sub(r"_\d+$", "", handle).replace("_", " ").strip()
        if not base:
            return "Audience"
        return " ".join(part.upper() if part.isupper() else part.capitalize() for part in base.split())

    @staticmethod
    def _compact_role(role: str) -> str:
        cleaned = " ".join(role.split())
        if not cleaned:
            return "Simulated audience voice"
        if len(cleaned) <= 56:
            return cleaned
        shortened = cleaned[:53].rsplit(" ", 1)[0].strip()
        return f"{shortened}..." if shortened else f"{cleaned[:53]}..."

    @staticmethod
    def _compact_quote(text: str) -> str:
        cleaned = " ".join(text.split()).strip().strip("\"")
        if len(cleaned) <= MIROFISH_ROOM_VOICE_CHAR_LIMIT:
            return cleaned
        shortened = cleaned[: MIROFISH_ROOM_VOICE_CHAR_LIMIT - 3].rsplit(" ", 1)[0].strip()
        return f"{shortened}..." if shortened else f"{cleaned[: MIROFISH_ROOM_VOICE_CHAR_LIMIT - 3]}..."

    @staticmethod
    def _voice_stance(text: str) -> str:
        lowered = text.lower()
        positive_markers = [
            "strong",
            "great",
            "love",
            "impressed",
            "smart",
            "helpful",
            "useful",
            "worth",
            "promising",
            "essential",
            "perfect",
            "sharp",
            "good",
            "best",
            "in.",
            "i'm in",
            "keep watching",
            "blows my mind",
            "masterclass",
        ]
        negative_markers = [
            "but",
            "needs",
            "need",
            "proof",
            "skeptical",
            "question",
            "unclear",
            "confusing",
            "drop-off",
            "gimmick",
            "worry",
            "too long",
            "still",
            "not sure",
            "trust",
            "cools",
            "drifts",
            "loses",
            "softens",
        ]
        positive_score = sum(lowered.count(marker) for marker in positive_markers)
        negative_score = sum(lowered.count(marker) for marker in negative_markers)
        if positive_score == negative_score:
            return "mixed"
        return "negative" if negative_score > positive_score else "positive"

    def _extract_analysis(self, payload: dict[str, Any]) -> dict[str, Any]:
        response_text = str((payload.get("data") or {}).get("response") or "").strip()
        if not response_text:
            raise MiroFishIntegrationError("MiroFish report agent returned an empty response.")

        direct_json = self._extract_json_blob(response_text)
        if direct_json is None:
            raise MiroFishIntegrationError("MiroFish report agent did not return valid JSON.")
        return json.loads(direct_json)

    @staticmethod
    def _extract_json_blob(text: str) -> str | None:
        stripped = text.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            return stripped

        fenced_match = re.search(r"```json\s*(\{.*\})\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
        if fenced_match:
            return fenced_match.group(1)

        object_match = re.search(r"(\{.*\})", stripped, flags=re.DOTALL)
        if object_match:
            return object_match.group(1)
        return None

    def _build_video_brief(self, video_path: Path) -> MiroFishBrief:
        metadata = self.media.inspect_video(video_path)
        windows = AnalysisEngine._editor_windows(metadata.duration_sec)
        warnings: list[str] = []
        summary_text = "No transcript-forward summary was generated."
        transcript_preview = ""
        speech_segments: list[tuple[float, float, str]] = []
        speech_coverage = 0.0

        if self._brief_helper is not None:
            try:
                summary = self._brief_helper.summarize_editor_clip(video_path)
                summary_text = str(summary.get("summary") or summary_text)
                transcript_preview = str(summary.get("transcriptPreview") or "")
                speech_coverage = float(summary.get("speechCoverage") or 0.0)
                speech_segments = [
                    (
                        float(segment["startSec"]),
                        float(segment["endSec"]),
                        str(segment["text"]),
                    )
                    for segment in summary.get("speechSegments", [])
                    if isinstance(segment, dict)
                ]
                warnings.extend(str(item) for item in summary.get("warnings", []))
            except GeminiIntegrationError as exc:
                warnings.append(f"Transcript helper unavailable: {exc}")
        else:
            warnings.append("No transcript helper configured; the MiroFish brief only contains media metadata.")

        transcript_density = AnalysisEngine._transcript_density_from_speech_segments(speech_segments, windows)
        media_features = self.media.analyze_media(video_path, windows, transcript_density)
        brief_windows = self._brief_windows(windows, media_features, speech_segments)
        markdown = self._brief_markdown(
            video_path=video_path,
            metadata=metadata,
            summary_text=summary_text,
            transcript_preview=transcript_preview,
            speech_coverage=speech_coverage,
            windows=brief_windows,
            warnings=warnings,
        )
        return MiroFishBrief(
            projectName=f"Twine {video_path.stem}",
            projectFileName=f"{video_path.stem}-brief.md",
            markdown=markdown,
            simulationRequirement=(
                "Simulate how a broad consumer audience would react to the short-form video described in the uploaded brief. "
                "Focus on consumer sentiment, trust, confusion, share intent, and drop-off risk across the provided timeline windows. "
                "Treat the timeline windows as chronological moments in the same video."
            ),
            windows=brief_windows,
            warnings=warnings,
        )

    @staticmethod
    def _brief_windows(
        windows: list[tuple[float, float]],
        media_features,
        speech_segments: list[tuple[float, float, str]],
    ) -> list[dict[str, object]]:
        output: list[dict[str, object]] = []
        for index, (start, end) in enumerate(windows):
            transcript_excerpt = MiroFishRunner._speech_excerpt_for_window(start, end, speech_segments)
            note_parts: list[str] = []
            if media_features.scene_changes[index]:
                note_parts.append("scene change")
            if media_features.motion_scores[index] >= 0.6:
                note_parts.append("high motion")
            if media_features.audio_energy[index] >= 0.6:
                note_parts.append("strong audio")
            if media_features.silence_overlap[index]:
                note_parts.append("silence overlap")
            if transcript_excerpt:
                note_parts.append(f"spoken cue: {transcript_excerpt}")
            output.append(
                {
                    "windowIndex": index + 1,
                    "startSec": round(start, 2),
                    "endSec": round(end, 2),
                    "motionScore": round(float(media_features.motion_scores[index]), 4),
                    "audioEnergy": round(float(media_features.audio_energy[index]), 4),
                    "transcriptDensity": round(float(media_features.transcript_density[index]), 4),
                    "sceneChange": bool(media_features.scene_changes[index]),
                    "silenceOverlap": bool(media_features.silence_overlap[index]),
                    "transcriptExcerpt": transcript_excerpt,
                    "note": "; ".join(note_parts) if note_parts else "steady beat",
                }
            )
        return output

    @staticmethod
    def _speech_excerpt_for_window(
        start: float,
        end: float,
        speech_segments: list[tuple[float, float, str]],
    ) -> str:
        excerpts: list[str] = []
        for seg_start, seg_end, text in speech_segments:
            overlap = max(0.0, min(end, seg_end) - max(start, seg_start))
            if overlap <= 0:
                continue
            cleaned = " ".join(text.split())
            if cleaned:
                excerpts.append(cleaned)
            if len(" ".join(excerpts)) >= 180:
                break
        excerpt = " ".join(excerpts).strip()
        return excerpt[:180]

    @staticmethod
    def _brief_markdown(
        *,
        video_path: Path,
        metadata,
        summary_text: str,
        transcript_preview: str,
        speech_coverage: float,
        windows: list[dict[str, object]],
        warnings: list[str],
    ) -> str:
        warnings_md = "\n".join(f"- {warning}" for warning in warnings) or "- None"
        room_seeds_md = "\n".join(MiroFishRunner._brief_room_seed_lines())
        timeline_md = "\n".join(MiroFishRunner._brief_moment_lines(windows))
        return (
            f"# Twine Video Brief: {video_path.name}\n\n"
            "## Goal\n"
            "Simulate how an audience is likely to react to this short-form video over time.\n\n"
            "## Video Metadata\n"
            f"- Duration: {metadata.duration_sec:.2f}s\n"
            f"- Resolution: {metadata.width}x{metadata.height}\n"
            f"- FPS: {metadata.fps:.2f}\n"
            f"- File size: {metadata.size_bytes} bytes\n\n"
            "## Generated Summary\n"
            f"{summary_text}\n\n"
            "## Transcript Preview\n"
            f"{transcript_preview or 'No transcript preview available.'}\n\n"
            "## Speech Coverage\n"
            f"- Estimated speech-driven ratio: {speech_coverage:.2f}\n\n"
            "## Room Seeds\n"
            f"{room_seeds_md}\n\n"
            "## Timeline Moments\n"
            f"{timeline_md}\n\n"
            "## Brief Warnings\n"
            f"{warnings_md}\n"
        )

    @staticmethod
    def _brief_room_seed_lines() -> list[str]:
        return [
            "- Maya (CasualViewer) sees the clip in-feed and reacts first with confusion, curiosity, or quick judgment.",
            "- Theo (ExpertViewer) explains technical details, fact-checks claims, and notices production mistakes fast.",
            "- Lena (CreatorPeer) judges the craft, pacing, edit quality, and whether the clip feels intentional or sloppy.",
            "- Jordan (TrendCommentator) reposts moments for humor, praise, or skepticism and amplifies whatever feels most shareable.",
            "- Avery (BrandObserver) watches for trust, credibility, and whether the clip helps or hurts reputation.",
        ]

    @staticmethod
    def _brief_moment_lines(windows: list[dict[str, object]]) -> list[str]:
        lines: list[str] = []
        for window in windows:
            details: list[str] = []
            note = str(window.get("note") or "").strip()
            if note:
                details.append(note)
            if bool(window.get("sceneChange")) and "scene change" not in note.lower():
                details.append("scene change")
            if bool(window.get("silenceOverlap")) and "silence overlap" not in note.lower():
                details.append("silence overlap")
            details.append(f"motion {float(window['motionScore']):.2f}")
            details.append(f"audio {float(window['audioEnergy']):.2f}")
            details.append(f"transcript density {float(window['transcriptDensity']):.2f}")
            transcript_excerpt = str(window.get("transcriptExcerpt") or "").strip()
            if transcript_excerpt:
                details.append(f'transcript excerpt: "{transcript_excerpt}"')
            lines.append(
                f"- {float(window['startSec']):.2f}s to {float(window['endSec']):.2f}s: "
                + "; ".join(details)
            )
        return lines

    @staticmethod
    def _normalize_timeline(
        timeline: list[dict[str, Any]],
        fallback_windows: list[dict[str, object]],
    ) -> list[dict[str, Any]]:
        if not timeline:
            timeline = [
                {
                    "startSec": window["startSec"],
                    "endSec": window["endSec"],
                    "globalActivation": 0.5,
                    "motionScore": window["motionScore"],
                    "audioEnergy": window["audioEnergy"],
                    "transcriptDensity": window["transcriptDensity"],
                    "sceneChange": window["sceneChange"],
                    "silenceOverlap": window["silenceOverlap"],
                    "note": window["note"],
                }
                for window in fallback_windows
            ]
        return GeminiRunner._normalize_timeline(timeline)
