from __future__ import annotations

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
                self._run_simulation(client, base_url, simulation_id)
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
            json={"simulation_id": simulation_id, "parallel_profile_count": 3},
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

    def _run_simulation(self, client: httpx.Client, base_url: str, simulation_id: str) -> None:
        response = client.post(
            f"{base_url}/api/simulation/start",
            json={
                "simulation_id": simulation_id,
                "platform": "parallel",
                "max_rounds": self.settings.mirofish_simulation_max_rounds,
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
        return "negative" if negative_score >= positive_score else "positive"

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
