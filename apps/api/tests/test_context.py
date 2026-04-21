from __future__ import annotations

from app.core.config import Settings
from app.main import build_context


def test_build_context_selects_gemini_runner(monkeypatch, tmp_path) -> None:
    captured: dict[str, object] = {}

    class FakeGeminiRunner:
        MODEL_REPO = "google/gemini-2.5-pro"
        MODEL_COMMIT = "api"

        def __init__(self, settings: Settings) -> None:
            captured["settings"] = settings

    monkeypatch.setattr("app.main.GeminiRunner", FakeGeminiRunner)

    settings = Settings(
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
        convex_site_url=None,
        convex_service_secret=None,
    )

    context = build_context(settings)

    assert isinstance(context.runner, FakeGeminiRunner)
    assert captured["settings"] is settings


def test_build_context_selects_mirofish_runner(monkeypatch, tmp_path) -> None:
    captured: dict[str, object] = {}

    class FakeMiroFishRunner:
        MODEL_REPO = "666ghj/MiroFish"
        MODEL_COMMIT = "service"

        def __init__(self, settings: Settings) -> None:
            captured["settings"] = settings

    monkeypatch.setattr("app.main.MiroFishRunner", FakeMiroFishRunner)

    settings = Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="mirofish",
        gemini_api_key="test-key",
        gemini_model="gemini-2.5-pro",
        mirofish_base_url="http://mirofish.test",
        mirofish_zep_api_key="zep-key",
        tribe_device="cpu",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        convex_site_url=None,
        convex_service_secret=None,
    )

    context = build_context(settings)

    assert isinstance(context.runner, FakeMiroFishRunner)
    assert captured["settings"] is settings
