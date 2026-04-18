from __future__ import annotations

import importlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core.config import Settings


MODEL_REPO = "facebook/tribev2"
MODEL_COMMIT = "72399081ed3f1040c4d996cefb2864a4c46f5b8e"
WHISPERX_MODEL = "large-v3"
WHISPERX_ENGLISH_ALIGN_MODEL = "WAV2VEC2_ASR_LARGE_LV60K_960H"
LANGUAGE_CODES = {
    "english": "en",
    "french": "fr",
    "spanish": "es",
    "dutch": "nl",
    "chinese": "zh",
}


class TribeIntegrationError(RuntimeError):
    """Raised when TRIBE v2 cannot be loaded or executed."""


@dataclass
class SegmentSnapshot:
    start: float
    duration: float
    nsEventCount: int


@dataclass
class TribeRunResult:
    preds: np.ndarray
    events: pd.DataFrame
    segments: list[SegmentSnapshot]
    device: str


@dataclass
class TribeProbe:
    installed: bool
    modelStatus: str
    modelError: str | None
    selectedDevice: str
    modelRepo: str
    modelCommit: str


class TribeRunner:
    MODEL_REPO = MODEL_REPO
    MODEL_COMMIT = MODEL_COMMIT

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._model: Any | None = None
        self._model_error: str | None = None

    def has_install(self) -> bool:
        return importlib.util.find_spec("tribev2") is not None

    def model_status(self) -> str:
        if self._model is not None:
            return "loaded"
        if self._model_error:
            return "error"
        return "unloaded"

    def model_error(self) -> str | None:
        return self._model_error

    def selected_device(self) -> str:
        if self.settings.tribe_device != "auto":
            return self.settings.tribe_device
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

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
        self.load_model()
        return self.probe()

    def analyze_video(self, video_path: Path) -> TribeRunResult:
        try:
            model = self.load_model()
            events = model.get_events_dataframe(video_path=str(video_path))
            preds, segments = model.predict(events=events)
        except Exception as exc:  # pragma: no cover - exercised in smoke test
            message = str(exc)
            self._model_error = message
            if "gated repo" in message.lower() or "access" in message.lower():
                raise TribeIntegrationError(
                    "TRIBE v2 could not access its Hugging Face dependencies. "
                    "Set HUGGINGFACE_HUB_TOKEN and confirm access to facebook/tribev2 "
                    "and gated Llama dependencies."
                ) from exc
            raise TribeIntegrationError(f"TRIBE v2 analysis failed: {message}") from exc
        return TribeRunResult(
            preds=preds,
            events=events,
            segments=[
                self._snapshot_segment(segment, index)
                for index, segment in enumerate(segments)
            ],
            device=self.selected_device(),
        )

    def load_model(self) -> Any:
        if self._model is not None:
            return self._model
        if not self.has_install():
            raise TribeIntegrationError(
                "The tribev2 package is not installed. Run `uv sync --python 3.11` in apps/api."
            )
        self._apply_huggingface_token()
        try:
            from tribev2 import TribeModel

            self._patch_whisperx_runtime()
        except Exception as exc:  # pragma: no cover - depends on env
            self._model_error = str(exc)
            raise TribeIntegrationError(
                "The tribev2 package could not be imported. This usually means the Python "
                "environment is missing compiled dependencies or the wrong Python version "
                "is active. Use python3.11 with `uv sync --python 3.11`."
            ) from exc

        try:
            self._model = TribeModel.from_pretrained(
                MODEL_REPO,
                cache_folder=str(self.settings.cache_dir),
                device=self.selected_device(),
            )
        except Exception as exc:  # pragma: no cover - depends on env
            self._model_error = str(exc)
            raise TribeIntegrationError(
                f"TRIBE v2 model load failed: {exc}"
            ) from exc
        return self._model

    def _apply_huggingface_token(self) -> None:
        token = self.settings.huggingface_hub_token
        if not token:
            return
        os.environ.setdefault("HUGGINGFACE_HUB_TOKEN", token)
        os.environ.setdefault("HF_TOKEN", token)

    def _patch_whisperx_runtime(self) -> None:
        eventstransforms = importlib.import_module("tribev2.eventstransforms")
        patched_class = eventstransforms.ExtractWordsFromAudio
        patch_marker = (
            sys.executable,
            self.selected_device(),
        )
        if getattr(patched_class, "_tribe_creator_patch", None) == patch_marker:
            return
        patched_class._get_transcript_from_audio = staticmethod(  # type: ignore[attr-defined]
            self._get_transcript_from_audio
        )
        patched_class._tribe_creator_patch = patch_marker  # type: ignore[attr-defined]

    def _build_whisperx_command(
        self,
        *,
        wav_filename: Path,
        language: str,
        output_dir: Path,
    ) -> list[str]:
        if language not in LANGUAGE_CODES:
            raise ValueError(f"Language {language} not supported")
        device = self.selected_device()
        compute_type = "float16" if device == "cuda" else "default"
        command = [
            "uvx",
            "--python",
            sys.executable,
            "whisperx",
            str(wav_filename),
            "--model",
            WHISPERX_MODEL,
            "--language",
            LANGUAGE_CODES[language],
            "--device",
            device,
            "--compute_type",
            compute_type,
            "--batch_size",
            "16",
            "--align_model",
            WHISPERX_ENGLISH_ALIGN_MODEL if language == "english" else "",
            "--output_dir",
            str(output_dir),
            "--output_format",
            "json",
        ]
        return [arg for arg in command if arg]

    def _get_transcript_from_audio(
        self,
        wav_filename: Path,
        language: str,
    ) -> pd.DataFrame:
        with tempfile.TemporaryDirectory() as output_dir_name:
            output_dir = Path(output_dir_name)
            command = self._build_whisperx_command(
                wav_filename=wav_filename,
                language=language,
                output_dir=output_dir,
            )
            env = {key: value for key, value in os.environ.items() if key != "MPLBACKEND"}
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                env=env,
            )
            if result.returncode != 0:
                details = "\n".join(
                    part for part in [result.stderr.strip(), result.stdout.strip()] if part
                )
                raise RuntimeError(f"whisperx failed:\n{details}")

            json_path = output_dir / f"{wav_filename.stem}.json"
            transcript = json.loads(json_path.read_text(encoding="utf-8"))

        words: list[dict[str, float | int | str]] = []
        for index, segment in enumerate(transcript["segments"]):
            sentence = segment["text"].replace('"', "")
            for word in segment["words"]:
                if "start" not in word:
                    continue
                words.append(
                    {
                        "text": word["word"].replace('"', ""),
                        "start": word["start"],
                        "duration": word["end"] - word["start"],
                        "sequence_id": index,
                        "sentence": sentence,
                    }
                )

        return pd.DataFrame(words)

    @staticmethod
    def _snapshot_segment(segment: Any, index: int) -> SegmentSnapshot:
        ns_events = getattr(segment, "ns_events", None)
        if ns_events is None:
            ns_events = getattr(segment, "events", [])
        try:
            count = len(ns_events)
        except TypeError:
            count = 0
        start = float(getattr(segment, "start", index))
        duration = float(getattr(segment, "duration", 1.0))
        return SegmentSnapshot(start=start, duration=duration, nsEventCount=count)
