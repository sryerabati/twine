from __future__ import annotations

import base64
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings
from app.services.media import MediaInspectionError, MediaService


NVIDIA_CHAT_API = "https://integrate.api.nvidia.com/v1/chat/completions"
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
INLINE_AUDIO_TARGET_BYTES = 150_000
INLINE_AUDIO_BITRATES_KBPS = [24, 16, 12, 10, 8]


class NvidiaIntegrationError(RuntimeError):
    """Raised when the NVIDIA editor backend cannot be reached or parsed."""


class NvidiaEditorAI:
    MODEL_COMMIT = "api"

    def __init__(self, settings: Settings, media: MediaService) -> None:
        self.settings = settings
        self.media = media
        self.MODEL_REPO = settings.nvidia_model
        self._model_error: str | None = None

    def require_editor_support(self) -> None:
        self._require_api_key()

    def summarize_editor_clip(self, video_path: Path) -> dict[str, object]:
        audio_tag = self._inline_audio_tag(video_path)
        prompt = (
            "Return strict JSON only. Do not wrap the JSON in markdown. "
            "Analyze the spoken content of this clip and respond with exactly these keys: "
            "summary, transcriptPreview, speechCoverage, warnings, speechSegments. "
            "summary: a concise 1-2 sentence summary of what the speaker says. "
            "transcriptPreview: a short excerpt-like preview of the spoken words. "
            "speechCoverage: a number from 0 to 1 estimating how speech-driven the clip is. "
            "warnings: an array of strings for sparse speech, low-confidence audio, or supporting-footage concerns. "
            "speechSegments: an array of objects with startSec, endSec, and text for the spoken portions only. "
            "Use coarse estimated timings if exact timing is uncertain, but keep them chronological and realistic. "
            "If there is no meaningful speech, return an empty speechSegments array and set speechCoverage near 0. "
            f"{audio_tag}"
        )
        payload = self._chat_json(prompt=prompt, max_tokens=900)
        summary = self._extract_json_object(payload)
        self._model_error = None
        return {
            "summary": str(summary.get("summary") or ""),
            "transcriptPreview": str(summary.get("transcriptPreview") or ""),
            "speechCoverage": self._clamp01(summary.get("speechCoverage", 0.0)),
            "warnings": self._normalize_string_list(summary.get("warnings")),
            "speechSegments": self._normalize_speech_segments(summary.get("speechSegments")),
        }

    def order_editor_clips(self, clips: list[dict[str, object]]) -> dict[str, object]:
        if not clips:
            raise NvidiaIntegrationError("At least one clip is required for editor ordering.")

        prompt = (
            "Return strict JSON only. Do not wrap the JSON in markdown. "
            "Order these short-form creator clips into the most coherent final sequence using transcript meaning and story flow first. "
            "Also consider metadata such as recordedAt and fileModifiedAt as secondary chronology clues when the clips appear to describe a sequence or when the transcript alone is ambiguous. "
            "Do not blindly sort by timestamp if the spoken narrative clearly suggests a better order. "
            "Respond with exactly these keys: storylineSummary, orderingConfidence, orderedClips, warnings. "
            "orderingConfidence must be one of low, medium, high. "
            "orderedClips must be an array of objects with clipId and rationale. "
            "Preserve clip ids exactly as provided. "
            "If a clip seems like supporting footage or has weak spoken context, place it later and mention that in warnings. "
            f"Clips: {json.dumps(clips, ensure_ascii=True)}"
        )
        payload = self._chat_json(prompt=prompt, max_tokens=1200)
        ordering = self._extract_json_object(payload)
        self._model_error = None
        return {
            "storylineSummary": str(ordering.get("storylineSummary") or ""),
            "orderingConfidence": self._normalize_confidence(ordering.get("orderingConfidence")),
            "orderedClips": [
                {
                    "clipId": str(item.get("clipId") or ""),
                    "rationale": str(item.get("rationale") or ""),
                }
                for item in ordering.get("orderedClips", [])
                if str(item.get("clipId") or "").strip()
            ],
            "warnings": self._normalize_string_list(ordering.get("warnings")),
        }

    def _chat_json(self, *, prompt: str, max_tokens: int) -> dict[str, Any]:
        key = self._require_api_key()
        last_error: httpx.HTTPStatusError | None = None
        with httpx.Client(timeout=httpx.Timeout(60.0, read=300.0)) as client:
            for attempt in range(self.settings.gemini_max_retries + 1):
                response = client.post(
                    NVIDIA_CHAT_API,
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": self.settings.nvidia_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": max_tokens,
                        "temperature": 0,
                        "top_p": 0.1,
                    },
                )
                try:
                    response.raise_for_status()
                    return response.json()
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    if exc.response.status_code not in RETRYABLE_STATUS_CODES:
                        self._model_error = self._describe_http_status_error(exc)
                        raise NvidiaIntegrationError(self._model_error) from exc
                    if attempt >= self.settings.gemini_max_retries:
                        self._model_error = self._describe_http_status_error(exc)
                        raise NvidiaIntegrationError(self._model_error) from exc
                    time.sleep(self._retry_delay_seconds(attempt))

        if last_error is not None:
            self._model_error = self._describe_http_status_error(last_error)
            raise NvidiaIntegrationError(self._model_error) from last_error
        raise NvidiaIntegrationError("NVIDIA editor backend failed before a response was received.")

    def _inline_audio_tag(self, video_path: Path) -> str:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            audio_path = temp_dir / f"{video_path.stem}.mp3"
            self._extract_compact_audio(video_path, audio_path)
            audio_bytes = audio_path.read_bytes()
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        return f'<audio src="data:audio/mp3;base64,{audio_b64}" />'

    def _extract_compact_audio(self, video_path: Path, output_path: Path) -> None:
        duration_sec = max(self.media.inspect_video(video_path).duration_sec, 1.0)
        chosen_bitrate = INLINE_AUDIO_BITRATES_KBPS[-1]

        for bitrate_kbps in self._candidate_bitrates(duration_sec):
            cmd = [
                self.settings.ffmpeg_bin,
                "-y",
                "-i",
                str(video_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-codec:a",
                "libmp3lame",
                "-b:a",
                f"{bitrate_kbps}k",
                str(output_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                raise NvidiaIntegrationError(
                    result.stderr.strip() or "ffmpeg audio extraction for NVIDIA editor failed"
                )
            chosen_bitrate = bitrate_kbps
            if output_path.stat().st_size <= INLINE_AUDIO_TARGET_BYTES:
                return

        if output_path.stat().st_size > INLINE_AUDIO_TARGET_BYTES:
            raise NvidiaIntegrationError(
                "Clip audio is still too large for NVIDIA inline audio input after compression. "
                f"Last attempted bitrate was {chosen_bitrate} kbps."
            )

    @staticmethod
    def _candidate_bitrates(duration_sec: float) -> list[int]:
        dynamic_target = int((INLINE_AUDIO_TARGET_BYTES * 8) / max(duration_sec, 1.0) / 1000)
        dynamic_target = max(INLINE_AUDIO_BITRATES_KBPS[-1], min(INLINE_AUDIO_BITRATES_KBPS[0], dynamic_target))
        ordered = [dynamic_target, *INLINE_AUDIO_BITRATES_KBPS]
        deduped: list[int] = []
        for bitrate in ordered:
            if bitrate not in deduped:
                deduped.append(bitrate)
        return deduped

    def _require_api_key(self) -> str:
        key = self.settings.nvidia_api_key
        if not key:
            raise NvidiaIntegrationError(
                "NVIDIA_API_KEY is not set. Add it to the repo-root .env.local to enable the NVIDIA editor backend."
            )
        return key

    @staticmethod
    def _extract_json_object(payload: dict[str, Any]) -> dict[str, Any]:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise NvidiaIntegrationError("NVIDIA editor backend returned no choices.")
        message = choices[0].get("message")
        if not isinstance(message, dict):
            raise NvidiaIntegrationError("NVIDIA editor backend returned a malformed message payload.")
        content = str(message.get("content") or "").strip()
        if not content:
            raise NvidiaIntegrationError("NVIDIA editor backend returned an empty response.")

        if content.startswith("```"):
            content = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", content)
            content = re.sub(r"\n?```$", "", content).strip()

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", content, flags=re.DOTALL)
            if not match:
                raise NvidiaIntegrationError("NVIDIA editor backend did not return valid JSON.") from None
            parsed = json.loads(match.group(0))

        if not isinstance(parsed, dict):
            raise NvidiaIntegrationError("NVIDIA editor backend returned JSON in an unexpected shape.")
        return parsed

    @staticmethod
    def _describe_http_status_error(exc: httpx.HTTPStatusError) -> str:
        status_code = exc.response.status_code
        if status_code == 401:
            return "NVIDIA editor backend rejected the configured API key (HTTP 401)."
        if status_code == 402:
            return "NVIDIA editor backend billing or trial access is not active for this key (HTTP 402)."
        if status_code == 429:
            return "NVIDIA editor backend rate limit reached (HTTP 429). Wait briefly and retry."
        return f"NVIDIA editor backend request failed with HTTP {status_code}."

    def _retry_delay_seconds(self, attempt: int) -> float:
        base_delay = self.settings.gemini_retry_base_seconds * (2**attempt)
        return min(max(base_delay, 1.0), 20.0)

    @staticmethod
    def _normalize_confidence(value: object) -> str:
        normalized = str(value or "low").strip().lower()
        if normalized not in {"low", "medium", "high"}:
            return "low"
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
            try:
                start = max(float(segment.get("startSec", 0.0)), 0.0)
                end = max(float(segment.get("endSec", start)), start)
            except (TypeError, ValueError):
                continue
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
    def _clamp01(value: Any) -> float:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(numeric, 1.0))

    @staticmethod
    def _normalize_string_list(value: Any) -> list[str]:
        if isinstance(value, str):
            normalized = value.strip()
            return [normalized] if normalized else []
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]
