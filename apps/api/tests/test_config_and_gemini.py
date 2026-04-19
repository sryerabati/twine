from __future__ import annotations

import base64
import json
from pathlib import Path

import httpx
import pytest

from app.core.config import REPO_ROOT, Settings
from app.services.gemini_runner import GeminiFile, GeminiIntegrationError, GeminiRunner


def make_gemini_settings(
    tmp_path: Path,
    *,
    gemini_platform: str = "developer",
) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="gemini",
        gemini_api_key="test-key",
        gemini_platform=gemini_platform,
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


def test_gemini_runner_vertex_uses_vertex_endpoint_and_response_schema(
    tmp_path: Path,
) -> None:
    settings = make_gemini_settings(tmp_path, gemini_platform="vertex")
    runner = GeminiRunner(settings)
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            status_code=200,
            request=request,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "ok": True,
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        payload = runner._generate_structured_response(
            client,
            parts=[{"text": "Return JSON."}],
            schema={
                "type": "object",
                "properties": {"ok": {"type": "boolean"}},
                "required": ["ok"],
                "additionalProperties": False,
            },
        )

    assert payload["candidates"][0]["content"]["parts"][0]["text"] == '{"ok": true}'
    assert (
        captured["url"]
        == "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro:generateContent?key=test-key"
    )
    assert captured["body"]["contents"][0]["role"] == "user"
    generation_config = captured["body"]["generationConfig"]
    assert generation_config["responseMimeType"] == "application/json"
    assert "responseSchema" in generation_config
    assert "responseJsonSchema" not in generation_config


def test_gemini_runner_vertex_sends_inline_video_bytes_for_editor_clip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = make_gemini_settings(tmp_path, gemini_platform="vertex")
    runner = GeminiRunner(settings)
    video_path = tmp_path / "clip.mp4"
    video_bytes = b"fake-video-bytes"
    video_path.write_bytes(video_bytes)
    captured: dict[str, object] = {}

    def capture_response(client, parts, schema):
        captured["parts"] = parts
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "summary": "Intro clip",
                                        "transcriptPreview": "Hey everyone",
                                        "speechCoverage": 0.9,
                                        "warnings": [],
                                        "speechSegments": [
                                            {
                                                "startSec": 0.0,
                                                "endSec": 1.0,
                                                "text": "Hey everyone",
                                            }
                                        ],
                                    }
                                )
                            }
                        ]
                    }
                }
            ]
        }

    monkeypatch.setattr(runner, "_generate_structured_response", capture_response)
    monkeypatch.setattr(
        runner,
        "_upload_file",
        lambda *args, **kwargs: pytest.fail("vertex mode should not use the Gemini files upload flow"),
    )

    summary = runner.summarize_editor_clip(video_path)

    assert summary["summary"] == "Intro clip"
    assert captured["parts"][1] == {
        "inlineData": {
            "mimeType": "video/mp4",
            "data": base64.b64encode(video_bytes).decode("ascii"),
        }
    }
