from __future__ import annotations

import json
import subprocess
import sys
import types
from pathlib import Path

import pandas as pd
import pytest

from app.core.config import Settings
from app.services.tribe_runner import TribeRunner


def make_settings(tmp_path: Path, *, device: str) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        tribe_device=device,
        max_video_seconds=60,
        huggingface_hub_token="hf_test_token",
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
    )


def install_fake_eventstransforms(monkeypatch: pytest.MonkeyPatch) -> type:
    tribev2_module = types.ModuleType("tribev2")
    tribev2_module.__path__ = []  # type: ignore[attr-defined]
    eventstransforms_module = types.ModuleType("tribev2.eventstransforms")

    class ExtractWordsFromAudio:
        _get_transcript_from_audio = staticmethod(lambda wav_filename, language: None)

    eventstransforms_module.ExtractWordsFromAudio = ExtractWordsFromAudio
    monkeypatch.setitem(sys.modules, "tribev2", tribev2_module)
    monkeypatch.setitem(sys.modules, "tribev2.eventstransforms", eventstransforms_module)
    return ExtractWordsFromAudio


def test_build_whisperx_command_uses_cpu_safe_defaults(tmp_path: Path) -> None:
    runner = TribeRunner(make_settings(tmp_path, device="cpu"))

    command = runner._build_whisperx_command(
        wav_filename=Path("/tmp/source.wav"),
        language="english",
        output_dir=Path("/tmp/output"),
    )

    assert command[:4] == ["uvx", "--python", sys.executable, "whisperx"]
    assert command[4] == "/tmp/source.wav"
    assert command[command.index("--model") + 1] == "large-v3"
    assert command[command.index("--device") + 1] == "cpu"
    assert command[command.index("--compute_type") + 1] == "default"


def test_build_whisperx_command_keeps_float16_on_cuda(tmp_path: Path) -> None:
    runner = TribeRunner(make_settings(tmp_path, device="cuda"))

    command = runner._build_whisperx_command(
        wav_filename=Path("/tmp/source.wav"),
        language="english",
        output_dir=Path("/tmp/output"),
    )

    assert command[command.index("--device") + 1] == "cuda"
    assert command[command.index("--compute_type") + 1] == "float16"


def test_patch_whisperx_runtime_replaces_upstream_transcriber(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runner = TribeRunner(make_settings(tmp_path, device="cpu"))
    patched_class = install_fake_eventstransforms(monkeypatch)
    captured: dict[str, object] = {}

    def fake_run(
        cmd: list[str],
        *,
        capture_output: bool,
        text: bool,
        env: dict[str, str],
    ) -> subprocess.CompletedProcess[str]:
        captured["cmd"] = cmd
        captured["env"] = env
        output_dir = Path(cmd[cmd.index("--output_dir") + 1])
        source_path = Path(cmd[4])
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / f"{source_path.stem}.json").write_text(
            json.dumps(
                {
                    "segments": [
                        {
                            "text": "hello world",
                            "words": [
                                {"word": "hello", "start": 0.1, "end": 0.3},
                                {"word": "world", "start": 0.35, "end": 0.65},
                            ],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr("app.services.tribe_runner.subprocess.run", fake_run)

    runner._patch_whisperx_runtime()

    wav_path = tmp_path / "sample.wav"
    wav_path.write_bytes(b"wav")
    transcript = patched_class._get_transcript_from_audio(wav_path, "english")

    assert isinstance(transcript, pd.DataFrame)
    assert transcript["text"].tolist() == ["hello", "world"]
    assert captured["cmd"] is not None
    command = captured["cmd"]
    assert isinstance(command, list)
    assert command[:4] == ["uvx", "--python", sys.executable, "whisperx"]
    assert command[command.index("--compute_type") + 1] == "default"
