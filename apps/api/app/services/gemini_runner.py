from __future__ import annotations

import json
import mimetypes
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd

from app.core.config import Settings
from app.services.tribe_runner import SegmentSnapshot, TribeProbe, TribeRunResult


GEMINI_API_BASE = "https://generativelanguage.googleapis.com"
FILE_POLL_SECONDS = 5
FILE_TIMEOUT_SECONDS = 300


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
                uploaded = self._upload_file(client, video_path, mime_type)
                active = self._wait_for_active_file(client, uploaded.name)
                response_payload = self._generate_analysis(client, active.uri, mime_type)
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

    def _require_api_key(self) -> str:
        key = self.settings.gemini_api_key
        if not key:
            raise GeminiIntegrationError(
                "GEMINI_API_KEY is not set. Add it to the repo-root .env to enable content analysis."
            )
        return key

    def _upload_file(self, client: httpx.Client, video_path: Path, mime_type: str) -> GeminiFile:
        key = self._require_api_key()
        start_response = client.post(
            f"{GEMINI_API_BASE}/upload/v1beta/files",
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
        start_response.raise_for_status()
        upload_url = start_response.headers.get("x-goog-upload-url")
        if not upload_url:
            raise GeminiIntegrationError("Content analysis backend did not return an upload URL.")

        finalize_response = client.post(
            upload_url,
            headers={
                "Content-Length": str(video_path.stat().st_size),
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize",
            },
            content=video_path.read_bytes(),
        )
        finalize_response.raise_for_status()
        return self._parse_file(finalize_response.json())

    def _wait_for_active_file(self, client: httpx.Client, file_name: str) -> GeminiFile:
        key = self._require_api_key()
        started = time.monotonic()
        while True:
            response = client.get(
                f"{GEMINI_API_BASE}/v1beta/{file_name}",
                params={"key": key},
            )
            response.raise_for_status()
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
        file_uri: str,
        mime_type: str,
    ) -> dict[str, Any]:
        key = self._require_api_key()
        response = client.post(
            f"{GEMINI_API_BASE}/v1beta/models/{self.settings.gemini_model}:generateContent",
            params={"key": key},
            json={
                "contents": [
                    {
                        "parts": [
                            {
                                "text": (
                                    "Analyze this entire short-form video as a creator-focused content review. "
                                    "Return strict JSON only. Cover the whole clip chronologically with 8 to 16 "
                                    "timeline windows. Use timestamps that span the full video, keep explanations "
                                    "grounded in what happens on screen, and make the recommendations actionable "
                                    "for editing decisions."
                                )
                            },
                            {
                                "file_data": {
                                    "mime_type": mime_type,
                                    "file_uri": file_uri,
                                }
                            },
                        ]
                    }
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseJsonSchema": TIMELINE_SCHEMA,
                },
            },
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _describe_http_status_error(exc: httpx.HTTPStatusError) -> str:
        status_code = exc.response.status_code
        if status_code == 429:
            return (
                "Content analysis backend rate limit reached (HTTP 429). "
                "Wait a minute and retry, or switch to a less quota-intensive model / "
                "enable Gemini API billing."
            )
        return f"Content analysis backend request failed with HTTP {status_code}."

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
