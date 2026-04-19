from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.core.config import REPO_ROOT, Settings
from app.services.gemini_runner import GeminiFile, GeminiIntegrationError, GeminiRunner


def make_gemini_settings(tmp_path: Path) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="gemini",
        gemini_api_key="test-key",
        gemini_model="gemini-2.5-pro",
        tribe_device="cpu",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
    )


def test_settings_defaults_allow_50mb_uploads_and_2_minute_clips(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TRIBE_MAX_VIDEO_SECONDS", raising=False)
    monkeypatch.delenv("TRIBE_MAX_UPLOAD_BYTES", raising=False)

    settings = Settings(_env_file=None)

    assert settings.max_video_seconds == 120
    assert settings.max_upload_bytes == 50_000_000


def test_relative_storage_paths_resolve_from_repo_root() -> None:
    settings = Settings(
        uploads_dir="./storage/uploads",
        results_dir="./storage/analyses",
        cache_dir="./storage/cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
    )

    assert settings.uploads_dir == REPO_ROOT / "storage" / "uploads"
    assert settings.results_dir == REPO_ROOT / "storage" / "analyses"
    assert settings.cache_dir == REPO_ROOT / "storage" / "cache"


def test_gemini_runner_maps_429_to_actionable_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runner = GeminiRunner(make_gemini_settings(tmp_path))
    video_path = tmp_path / "clip.mp4"
    video_path.write_bytes(b"video")

    monkeypatch.setattr(
        runner,
        "_upload_file",
        lambda client, path, mime_type: GeminiFile(
            name="files/abc123",
            uri="gs://fake/clip.mp4",
            mime_type="video/mp4",
            state="ACTIVE",
        ),
    )
    monkeypatch.setattr(
        runner,
        "_wait_for_active_file",
        lambda client, name: GeminiFile(
            name=name,
            uri="gs://fake/clip.mp4",
            mime_type="video/mp4",
            state="ACTIVE",
        ),
    )

    request = httpx.Request(
        "POST",
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=secret",
    )
    response = httpx.Response(status_code=429, request=request)

    def raise_rate_limit(*args, **kwargs):
        raise httpx.HTTPStatusError("rate limited", request=request, response=response)

    monkeypatch.setattr(runner, "_generate_analysis", raise_rate_limit)

    with pytest.raises(GeminiIntegrationError, match="rate limit reached"):
        runner.analyze_video(video_path)
