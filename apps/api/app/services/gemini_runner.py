from __future__ import annotations

import base64
import json
import mimetypes
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd

from app.core.config import Settings
from app.services.tribe_runner import SegmentSnapshot, TribeProbe, TribeRunResult


GEMINI_DEVELOPER_API_BASE = "https://generativelanguage.googleapis.com"
VERTEX_API_BASE = "https://aiplatform.googleapis.com"
FILE_POLL_SECONDS = 5
FILE_TIMEOUT_SECONDS = 300
RETRYABLE_STATUS_CODES = {429, 503}


class GeminiIntegrationError(RuntimeError):
    """Raised when the Gemini fallback backend cannot be reached or parsed."""


TIMELINE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "object",
            "properties": {
                "overallRecommendation": {"type": "string"},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "weaknesses": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["overallRecommendation", "strengths", "weaknesses"],
            "additionalProperties": False,
        },
        "scores": {
            "type": "object",
            "properties": {
                "hookScore": {"type": "integer", "minimum": 0, "maximum": 100},
                "pacingScore": {"type": "integer", "minimum": 0, "maximum": 100},
                "retentionEstimate": {"type": "integer", "minimum": 0, "maximum": 100},
                "viralPotential": {"type": "integer", "minimum": 0, "maximum": 100},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                "helpingFactors": {"type": "array", "items": {"type": "string"}},
                "hurtingFactors": {"type": "array", "items": {"type": "string"}},
            },
            "required": [
                "hookScore",
                "pacingScore",
                "retentionEstimate",
                "viralPotential",
                "confidence",
                "helpingFactors",
                "hurtingFactors",
            ],
            "additionalProperties": False,
        },
        "timeline": {
            "type": "array",
            "minItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "startSec": {"type": "number", "minimum": 0},
                    "endSec": {"type": "number", "minimum": 0},
                    "globalActivation": {"type": "number", "minimum": 0, "maximum": 1},
                    "motionScore": {"type": "number", "minimum": 0, "maximum": 1},
                    "audioEnergy": {"type": "number", "minimum": 0, "maximum": 1},
                    "transcriptDensity": {"type": "number", "minimum": 0, "maximum": 1},
                    "sceneChange": {"type": "boolean"},
                    "silenceOverlap": {"type": "boolean"},
                    "note": {"type": "string"},
                },
                "required": [
                    "startSec",
                    "endSec",
                    "globalActivation",
                    "motionScore",
                    "audioEnergy",
                    "transcriptDensity",
                    "sceneChange",
                    "silenceOverlap",
                    "note",
                ],
                "additionalProperties": False,
            },
        },
        "markers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "t": {"type": "number", "minimum": 0},
                    "type": {
                        "type": "string",
                        "enum": [
                            "strong_hook",
                            "attention_drop",
                            "deadspace_candidate",
                            "high_rewatch_moment",
                            "pacing_issue",
                            "audio_energy_drop",
                        ],
                    },
                    "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                    "explanation": {"type": "string"},
                    "suggestion": {"type": "string"},
                },
                "required": ["t", "type", "severity", "explanation", "suggestion"],
                "additionalProperties": False,
            },
        },
        "deadspaceCuts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "number", "minimum": 0},
                    "end": {"type": "number", "minimum": 0},
                    "reason": {"type": "string"},
                },
                "required": ["start", "end", "reason"],
                "additionalProperties": False,
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "scores", "timeline", "markers", "deadspaceCuts", "warnings"],
    "additionalProperties": False,
}

EDITOR_CLIP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "transcriptPreview": {"type": "string"},
        "speechCoverage": {"type": "number", "minimum": 0, "maximum": 1},
        "warnings": {"type": "array", "items": {"type": "string"}},
        "speechSegments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "startSec": {"type": "number", "minimum": 0},
                    "endSec": {"type": "number", "minimum": 0},
                    "text": {"type": "string"},
                },
                "required": ["startSec", "endSec", "text"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "transcriptPreview", "speechCoverage", "warnings", "speechSegments"],
    "additionalProperties": False,
}

EDITOR_ORDERING_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "storylineSummary": {"type": "string"},
        "orderingConfidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "orderedClips": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "clipId": {"type": "string"},
                    "rationale": {"type": "string"},
                },
                "required": ["clipId", "rationale"],
                "additionalProperties": False,
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["storylineSummary", "orderingConfidence", "orderedClips", "warnings"],
    "additionalProperties": False,
}

ROOM_VOICE_STANCE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "classifications": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "handle": {"type": "string"},
                    "stance": {"type": "string", "enum": ["positive", "negative"]},
                },
                "required": ["handle", "stance"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["classifications"],
    "additionalProperties": False,
}


@dataclass
class GeminiFile:
    name: str
    uri: str
    mime_type: str
    state: str


class GeminiRunner:
    MODEL_COMMIT = "api"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.MODEL_REPO = f"google/{settings.gemini_model}"
        self._model_error: str | None = None

    def has_install(self) -> bool:
        return True

    def model_status(self) -> str:
        if self._model_error:
            return "error"
        return "loaded" if self.settings.gemini_api_key else "unloaded"

    def model_error(self) -> str | None:
        return self._model_error

    def selected_device(self) -> str:
        return "remote"

    def probe(self) -> TribeProbe:
        return TribeProbe(
            installed=True,
            modelStatus=self.model_status(),
            modelError=self.model_error(),
            selectedDevice=self.selected_device(),
            modelRepo=self.MODEL_REPO,
            modelCommit=self.MODEL_COMMIT,
        )

    def warm_load(self) -> TribeProbe:
        self._require_api_key()
        return self.probe()

    def analyze_video(self, video_path: Path) -> TribeRunResult:
        self._require_api_key()
        mime_type = mimetypes.guess_type(video_path.name)[0] or "video/mp4"
        if mime_type != "video/mp4":
            mime_type = "video/mp4"

        try:
            with httpx.Client(timeout=httpx.Timeout(60.0, read=300.0)) as client:
                media_part = self._build_video_part(client, video_path, mime_type)
                response_payload = self._generate_analysis(client, media_part)
        except httpx.HTTPStatusError as exc:
            self._model_error = self._describe_http_status_error(exc)
            raise GeminiIntegrationError(self._model_error) from exc
        except httpx.HTTPError as exc:
            self._model_error = str(exc)
            raise GeminiIntegrationError(
                f"Content analysis backend request failed: {exc}"
            ) from exc

        try:
            analysis = self._extract_analysis(response_payload)
            timeline = self._normalize_timeline(analysis.get("timeline", []))
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            self._model_error = str(exc)
            raise GeminiIntegrationError(
                "Content analysis backend returned malformed structured output."
            ) from exc

        if not timeline:
            raise GeminiIntegrationError("Content analysis backend returned no timeline windows.")

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
                {
                    "type": "Marker",
                    "start": float(marker["t"]),
                    "label": marker["type"],
                }
                for marker in analysis.get("markers", [])
            ]
        )

        return TribeRunResult(
            preds=self._synthetic_predictions(timeline),
            events=events,
            segments=segments,
            device=self.selected_device(),
            provider="gemini",
            modelRepo=self.MODEL_REPO,
            modelCommit=self.MODEL_COMMIT,
            providerRaw=response_payload,
            proxyAnalysis={
                "summary": analysis["summary"],
                "scores": analysis["scores"],
                "timeline": timeline,
                "markers": analysis.get("markers", []),
                "deadspaceCuts": analysis.get("deadspaceCuts", []),
                "warnings": analysis.get("warnings", []),
            },
            warnings=["Generated by temporary content-analysis backend."],
        )

    def require_editor_support(self) -> None:
        self._require_api_key()

    def summarize_editor_clip(self, video_path: Path) -> dict[str, object]:
        self._require_api_key()
        mime_type = mimetypes.guess_type(video_path.name)[0] or "video/mp4"
        if mime_type != "video/mp4":
            mime_type = "video/mp4"

        try:
            with httpx.Client(timeout=httpx.Timeout(60.0, read=300.0)) as client:
                media_part = self._build_video_part(client, video_path, mime_type)
                payload = self._generate_structured_response(
                    client,
                    parts=[
                        {
                            "text": (
                                "Watch this clip and return strict JSON only. "
                                "Summarize what the speaker says, provide a short transcript preview, "
                                "estimate how speech-driven the clip is on a 0 to 1 scale, and list any "
                                "warnings if the clip is sparse, hard to hear, or mostly supporting footage. "
                                "Also return timestamped speechSegments for the spoken portions of the clip. "
                                "Each speech segment must include startSec, endSec, and text. Merge tiny pauses "
                                "into nearby speech instead of returning dozens of fragments. If the clip has no "
                                "meaningful speech, return an empty speechSegments array."
                            )
                        },
                        media_part,
                    ],
                    schema=EDITOR_CLIP_SCHEMA,
                )
        except httpx.HTTPStatusError as exc:
            self._model_error = self._describe_http_status_error(exc)
            raise GeminiIntegrationError(self._model_error) from exc
        except httpx.HTTPError as exc:
            self._model_error = str(exc)
            raise GeminiIntegrationError(
                f"Editor clip summary request failed: {exc}"
            ) from exc

        summary = self._extract_analysis(payload)
        self._model_error = None
        return {
            "summary": str(summary["summary"]),
            "transcriptPreview": str(summary["transcriptPreview"]),
            "speechCoverage": self._clamp01(summary["speechCoverage"]),
            "warnings": [str(item) for item in summary.get("warnings", [])],
            "speechSegments": self._normalize_speech_segments(summary.get("speechSegments")),
        }

    def order_editor_clips(self, clips: list[dict[str, object]]) -> dict[str, object]:
        self._require_api_key()
        if not clips:
            raise GeminiIntegrationError("At least one clip is required for editor ordering.")

        prompt = (
            "You are ordering short-form video clips into a coherent rough cut. "
            "Return strict JSON only. Preserve the clip ids exactly as provided. "
            "Your primary job is to reconstruct the spoken script in chronological order, not to loosely group related topics. "
            "Use transcript meaning, transcriptStart, and transcriptEnd to decide which line clearly comes before or after another. "
            "If one clip sounds like a direct answer, reaction, or continuation of the previous clip's last sentence, keep those clips adjacent in that order. "
            "Do not move a reply away from the sentence it answers just because another clip feels topically similar. "
            "Use transcript meaning and creator storytelling flow to decide the order first. "
            "Also consider metadata such as recordedAt and fileModifiedAt as secondary chronology clues when the transcript alone is ambiguous or when the clips clearly represent a sequence of events. "
            "Do not blindly sort by timestamp if the spoken narrative clearly suggests a better order. "
            "If any clip looks like supporting footage or has weak speech context, keep it later in the sequence "
            "and mention that in warnings. Input clips:\n"
            f"{json.dumps(clips, ensure_ascii=True)}"
        )

        try:
            with httpx.Client(timeout=httpx.Timeout(60.0, read=120.0)) as client:
                payload = self._generate_structured_response(
                    client,
                    parts=[{"text": prompt}],
                    schema=EDITOR_ORDERING_SCHEMA,
                )
        except httpx.HTTPStatusError as exc:
            self._model_error = self._describe_http_status_error(exc)
            raise GeminiIntegrationError(self._model_error) from exc
        except httpx.HTTPError as exc:
            self._model_error = str(exc)
            raise GeminiIntegrationError(
                f"Editor ordering request failed: {exc}"
            ) from exc

        ordering = self._extract_analysis(payload)
        self._model_error = None
        return {
            "storylineSummary": str(ordering["storylineSummary"]),
            "orderingConfidence": str(ordering["orderingConfidence"]),
            "orderedClips": [
                {
                    "clipId": str(item["clipId"]),
                    "rationale": str(item["rationale"]),
                }
                for item in ordering.get("orderedClips", [])
            ],
            "warnings": [str(item) for item in ordering.get("warnings", [])],
        }

    def classify_reaction_stances(self, reactions: list[dict[str, str]]) -> dict[str, str]:
        self._require_api_key()
        if not reactions:
            return {}

        prompt = (
            "Classify each simulated audience reaction as either positive or negative. "
            "Use positive when the overall takeaway is supportive, impressed, interested, or net-favorable, "
            "even if the reaction includes minor caveats. "
            "Use negative when the overall takeaway is skeptical, doubtful, unconvinced, critical, "
            "or mainly pushing back on the claim, even if some praise is present. "
            "Return strict JSON only. Preserve each handle exactly as given. "
            "Reactions:\n"
            f"{json.dumps(reactions, ensure_ascii=True)}"
        )

        try:
            with httpx.Client(timeout=httpx.Timeout(30.0, read=60.0)) as client:
                payload = self._generate_structured_response(
                    client,
                    parts=[{"text": prompt}],
                    schema=ROOM_VOICE_STANCE_SCHEMA,
                )
        except httpx.HTTPStatusError as exc:
            self._model_error = self._describe_http_status_error(exc)
            raise GeminiIntegrationError(self._model_error) from exc
        except httpx.HTTPError as exc:
            self._model_error = str(exc)
            raise GeminiIntegrationError(
                f"Reaction stance classification request failed: {exc}"
            ) from exc

        response = self._extract_analysis(payload)
        self._model_error = None
        return {
            str(item["handle"]).lstrip("@"): str(item["stance"])
            for item in response.get("classifications", [])
            if str(item.get("handle") or "").strip()
        }

    def _require_api_key(self) -> str:
        key = self.settings.gemini_api_key
        if not key:
            raise GeminiIntegrationError(
                "GEMINI_API_KEY is not set. Add it to the repo-root .env to enable content analysis."
            )
        return key

    def _uses_vertex_platform(self) -> bool:
        return self.settings.gemini_platform == "vertex"

    def _build_video_part(
        self,
        client: httpx.Client,
        video_path: Path,
        mime_type: str,
    ) -> dict[str, Any]:
        if self._uses_vertex_platform():
            return {
                "inlineData": {
                    "mimeType": mime_type,
                    "data": base64.b64encode(video_path.read_bytes()).decode("ascii"),
                }
            }

        uploaded = self._upload_file(client, video_path, mime_type)
        active = self._wait_for_active_file(client, uploaded.name)
        return {
            "file_data": {
                "mime_type": mime_type,
                "file_uri": active.uri,
            }
        }

    def _upload_file(self, client: httpx.Client, video_path: Path, mime_type: str) -> GeminiFile:
        key = self._require_api_key()
        start_response = self._request_with_retry(
            client,
            "POST",
            f"{GEMINI_DEVELOPER_API_BASE}/upload/v1beta/files",
            params={"key": key},
            headers={
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": str(video_path.stat().st_size),
                "X-Goog-Upload-Header-Content-Type": mime_type,
                "Content-Type": "application/json",
            },
            json={"file": {"display_name": video_path.name}},
        )
        upload_url = start_response.headers.get("x-goog-upload-url")
        if not upload_url:
            raise GeminiIntegrationError("Content analysis backend did not return an upload URL.")

        finalize_response = self._request_with_retry(
            client,
            "POST",
            upload_url,
            headers={
                "Content-Length": str(video_path.stat().st_size),
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize",
            },
            content=video_path.read_bytes(),
        )
        return self._parse_file(finalize_response.json())

    def _wait_for_active_file(self, client: httpx.Client, file_name: str) -> GeminiFile:
        key = self._require_api_key()
        started = time.monotonic()
        while True:
            response = self._request_with_retry(
                client,
                "GET",
                f"{GEMINI_DEVELOPER_API_BASE}/v1beta/{file_name}",
                params={"key": key},
            )
            uploaded = self._parse_file(response.json())
            if uploaded.state == "ACTIVE":
                return uploaded
            if uploaded.state == "FAILED":
                raise GeminiIntegrationError("Content analysis backend failed while processing the uploaded video.")
            if time.monotonic() - started > FILE_TIMEOUT_SECONDS:
                raise GeminiIntegrationError("Timed out while waiting for the uploaded video to become ready.")
            time.sleep(FILE_POLL_SECONDS)

    def _generate_analysis(
        self,
        client: httpx.Client,
        media_part: dict[str, Any],
    ) -> dict[str, Any]:
        return self._generate_structured_response(
            client,
            parts=[
                {
                    "text": (
                        "Analyze this entire short-form video as a creator-focused content review. "
                        "Return strict JSON only. Cover the whole clip chronologically with 8 to 16 "
                        "timeline windows. Use timestamps that span the full video, keep explanations "
                        "grounded in what happens on screen, and make the recommendations actionable "
                        "for editing decisions."
                    )
                },
                media_part,
            ],
            schema=TIMELINE_SCHEMA,
        )

    def _generate_structured_response(
        self,
        client: httpx.Client,
        parts: list[dict[str, Any]],
        schema: dict[str, Any],
    ) -> dict[str, Any]:
        key = self._require_api_key()
        last_error: httpx.HTTPStatusError | None = None
        for model_name in self._candidate_models():
            for attempt in range(self.settings.gemini_max_retries + 1):
                try:
                    response = client.post(
                        self._generate_content_url(model_name),
                        params={"key": key},
                        json={
                            "contents": [{"role": "user", "parts": parts}],
                            "generationConfig": self._generation_config(schema),
                        },
                    )
                    response.raise_for_status()
                    return response.json()
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    should_retry = self._should_retry(exc)
                    has_more_attempts = attempt < self.settings.gemini_max_retries
                    if should_retry and has_more_attempts:
                        time.sleep(self._retry_delay_seconds(exc, attempt))
                        continue
                    if exc.response.status_code == 429:
                        break
                    raise

        if last_error is not None:
            raise last_error
        raise GeminiIntegrationError("Gemini request failed before a response was received.")

    def _generate_content_url(self, model_name: str) -> str:
        if self._uses_vertex_platform():
            return f"{VERTEX_API_BASE}/v1/publishers/google/models/{model_name}:generateContent"
        return f"{GEMINI_DEVELOPER_API_BASE}/v1beta/models/{model_name}:generateContent"

    def _generation_config(self, schema: dict[str, Any]) -> dict[str, Any]:
        config: dict[str, Any] = {
            "responseMimeType": "application/json",
        }
        if self._uses_vertex_platform():
            config["responseSchema"] = schema
        else:
            config["responseJsonSchema"] = schema
        return config

    def _describe_http_status_error(self, exc: httpx.HTTPStatusError) -> str:
        status_code = exc.response.status_code
        if status_code == 429:
            retry_delay = GeminiRunner._extract_retry_delay_seconds(exc.response)
            retry_hint = f" Retry after about {retry_delay:.0f}s." if retry_delay is not None else ""
            quota_hint = (
                "enable Vertex AI billing."
                if self._uses_vertex_platform()
                else "enable Gemini API billing."
            )
            return (
                "Content analysis backend rate limit reached (HTTP 429). "
                "The app will retry automatically, but you should still lower request pressure, "
                f"switch to a lighter Gemini model, or {quota_hint}"
                f"{retry_hint}"
            )
        return f"Content analysis backend request failed with HTTP {status_code}."

    def _request_with_retry(
        self,
        client: httpx.Client,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        last_error: httpx.HTTPStatusError | None = None
        for attempt in range(self.settings.gemini_max_retries + 1):
            response = client.request(method, url, **kwargs)
            try:
                response.raise_for_status()
                return response
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if not self._should_retry(exc) or attempt >= self.settings.gemini_max_retries:
                    raise
                time.sleep(self._retry_delay_seconds(exc, attempt))
        if last_error is not None:
            raise last_error
        raise GeminiIntegrationError("Gemini request failed before a response was received.")

    def _candidate_models(self) -> list[str]:
        models = [self.settings.gemini_model]
        fallback = self.settings.gemini_fallback_model
        if fallback and fallback not in models:
            models.append(fallback)
        return models

    @staticmethod
    def _should_retry(exc: httpx.HTTPStatusError) -> bool:
        return exc.response.status_code in RETRYABLE_STATUS_CODES

    def _retry_delay_seconds(self, exc: httpx.HTTPStatusError, attempt: int) -> float:
        parsed = self._extract_retry_delay_seconds(exc.response)
        if parsed is not None:
            return max(parsed, 1.0)
        base_delay = self.settings.gemini_retry_base_seconds * (2**attempt)
        return min(max(base_delay, 1.0), 60.0)

    @staticmethod
    def _extract_retry_delay_seconds(response: httpx.Response) -> float | None:
        retry_after_header = response.headers.get("Retry-After")
        if retry_after_header:
            try:
                return float(retry_after_header)
            except ValueError:
                pass

        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict):
                details = error.get("details")
                if isinstance(details, list):
                    for detail in details:
                        if not isinstance(detail, dict):
                            continue
                        retry_delay = detail.get("retryDelay")
                        if isinstance(retry_delay, str):
                            parsed = GeminiRunner._parse_retry_delay_literal(retry_delay)
                            if parsed is not None:
                                return parsed
                message = error.get("message")
                if isinstance(message, str):
                    parsed = GeminiRunner._extract_retry_delay_from_message(message)
                    if parsed is not None:
                        return parsed

        return None

    @staticmethod
    def _extract_retry_delay_from_message(message: str) -> float | None:
        match = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", message, flags=re.IGNORECASE)
        if not match:
            return None
        return float(match.group(1))

    @staticmethod
    def _parse_retry_delay_literal(value: str) -> float | None:
        match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)s", value.strip())
        if not match:
            return None
        return float(match.group(1))

    @staticmethod
    def _parse_file(payload: dict[str, Any]) -> GeminiFile:
        file_payload = payload.get("file", payload)
        return GeminiFile(
            name=str(file_payload["name"]),
            uri=str(file_payload["uri"]),
            mime_type=str(file_payload.get("mimeType") or file_payload.get("mime_type") or "video/mp4"),
            state=str(file_payload.get("state") or "STATE_UNSPECIFIED"),
        )

    @staticmethod
    def _extract_analysis(payload: dict[str, Any]) -> dict[str, Any]:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)

    @staticmethod
    def _normalize_timeline(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for index, window in enumerate(sorted(timeline, key=lambda item: float(item["startSec"]))):
            start = max(float(window["startSec"]), 0.0)
            end = max(float(window["endSec"]), start + 0.1)
            normalized.append(
                {
                    "startSec": round(start, 2),
                    "endSec": round(end, 2),
                    "globalActivation": GeminiRunner._clamp01(window["globalActivation"]),
                    "motionScore": GeminiRunner._clamp01(window["motionScore"]),
                    "audioEnergy": GeminiRunner._clamp01(window["audioEnergy"]),
                    "transcriptDensity": GeminiRunner._clamp01(window["transcriptDensity"]),
                    "sceneChange": bool(window["sceneChange"]),
                    "silenceOverlap": bool(window["silenceOverlap"]),
                    "note": str(window.get("note") or f"Window {index + 1}"),
                }
            )
        return normalized

    @staticmethod
    def _normalize_speech_segments(raw_segments: Any) -> list[dict[str, object]]:
        if not isinstance(raw_segments, list):
            return []
        normalized: list[dict[str, object]] = []
        for segment in raw_segments:
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or "").strip()
            start = max(float(segment.get("startSec", 0.0)), 0.0)
            end = max(float(segment.get("endSec", start)), start)
            if not text or end - start < 0.05:
                continue
            normalized.append(
                {
                    "startSec": round(start, 2),
                    "endSec": round(end, 2),
                    "text": text,
                }
            )
        normalized.sort(key=lambda item: float(item["startSec"]))
        return normalized

    @staticmethod
    def _synthetic_predictions(timeline: list[dict[str, Any]]) -> np.ndarray:
        rows: list[np.ndarray] = []
        for index, window in enumerate(timeline):
            base = float(window["globalActivation"])
            motion = float(window["motionScore"])
            audio = float(window["audioEnergy"])
            transcript = float(window["transcriptDensity"])
            left = np.full(64, base * 0.92 + motion * 0.08, dtype=np.float32)
            right = np.full(64, base * 0.9 + audio * 0.05 + transcript * 0.05, dtype=np.float32)
            # Add tiny window-specific variance so downstream charts don't flatten completely.
            variance = ((index % 4) - 1.5) * 0.01
            rows.append(np.clip(np.concatenate([left, right]) + variance, 0.0, 1.0))
        return np.asarray(rows, dtype=np.float32)

    @staticmethod
    def _clamp01(value: Any) -> float:
        return max(0.0, min(float(value), 1.0))
