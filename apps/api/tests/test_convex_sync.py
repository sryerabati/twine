from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.core.config import Settings
from app.services.convex_sync import ConvexSyncService


def _settings_with_convex(
    tmp_path: Path,
    *,
    site_url: str | None = "https://example.convex.site",
    secret: str | None = "secret",
) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        gemini_api_key=None,
        gemini_model="gemini-2.5-pro",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        convex_site_url=site_url,
        convex_service_secret=secret,
    )


class _RequestRecorder:
    def __init__(self, response_status: int = 204) -> None:
        self.calls: list[dict[str, object]] = []
        self.response_status = response_status

    def __call__(
        self,
        url: str,
        *,
        json: dict[str, object] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> httpx.Response:
        self.calls.append(
            {
                "url": url,
                "json": json,
                "headers": headers or {},
                "timeout": timeout,
            }
        )
        return httpx.Response(status_code=self.response_status)


def test_convex_sync_no_op_when_not_configured(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorder = _RequestRecorder()
    monkeypatch.setattr("app.services.convex_sync.httpx.post", recorder)

    service = ConvexSyncService(_settings_with_convex(tmp_path, site_url=None, secret=None))
    service.update_scan_status(convex_scan_id="scan_123", status="running")

    assert recorder.calls == []


def test_update_scan_status_strips_trailing_slash_and_caps_error_message(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorder = _RequestRecorder()
    monkeypatch.setattr("app.services.convex_sync.httpx.post", recorder)

    service = ConvexSyncService(
        _settings_with_convex(tmp_path, site_url="https://example.convex.site/")
    )
    service.update_scan_status(
        convex_scan_id="scan_123",
        status="running",
        local_analysis_id="analysis_123",
        error_message="x" * 700,
    )

    assert recorder.calls[0]["url"] == "https://example.convex.site/service/scan/status"
    assert recorder.calls[0]["timeout"] == 5.0
    assert recorder.calls[0]["json"] == {
        "scanId": "scan_123",
        "status": "running",
        "localAnalysisId": "analysis_123",
        "errorMessage": "x" * 500,
    }
    assert recorder.calls[0]["headers"] == {
        "content-type": "application/json",
        "x-service-secret": "secret",
    }


def test_attach_scan_summary_omits_none_metrics(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorder = _RequestRecorder()
    monkeypatch.setattr("app.services.convex_sync.httpx.post", recorder)

    service = ConvexSyncService(_settings_with_convex(tmp_path))

    service.attach_scan_summary(
        convex_scan_id="scan_123",
        viral_potential=85,
        hook_score=91,
        pacing_score=88,
        retention_estimate=79,
        deadspace_seconds=3.2,
        trimmed_duration_sec=None,
        overall_recommendation=None,
    )

    assert recorder.calls[0]["json"] == {
        "scanId": "scan_123",
        "viralPotential": 85,
        "hookScore": 91,
        "pacingScore": 88,
        "retentionEstimate": 79,
        "deadspaceSeconds": 3.2,
    }
