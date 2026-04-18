"""Tests for ConvexSyncService.

These never hit the network. We monkeypatch `httpx.post` to capture the requests
that would have been sent, and to simulate responses.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.services.convex_sync import ConvexSyncService


def _settings_with_convex(
    tmp_path: Path,
    *,
    site_url: str | None = "https://example.convex.site",
    secret: str | None = "test-secret",
) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        tribe_device="cpu",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        require_convex_ids=False,
        convex_site_url=site_url,
        convex_service_secret=secret,
    )


class _RequestRecorder:
    def __init__(self, response_status: int = 204) -> None:
        self.calls: list[dict[str, Any]] = []
        self.response_status = response_status

    def __call__(
        self,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> httpx.Response:
        self.calls.append(
            {"url": url, "json": json, "headers": headers or {}, "timeout": timeout}
        )
        return httpx.Response(status_code=self.response_status)


def test_convex_sync_no_op_when_not_configured(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path, site_url=None, secret=None)
    service = ConvexSyncService(settings)
    assert service.enabled is False

    recorder = _RequestRecorder()
    monkeypatch.setattr(httpx, "post", recorder)

    service.update_scan_status("scan_abc", "queued")
    service.attach_upload_local_id("upload_abc", "local-123")
    service.attach_scan_summary("scan_abc", viral_potential=80)

    assert recorder.calls == []


def test_convex_sync_sends_secret_header(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path)
    service = ConvexSyncService(settings)

    recorder = _RequestRecorder()
    monkeypatch.setattr(httpx, "post", recorder)

    service.update_scan_status("scan_abc", "queued", local_analysis_id="deadbeef")
    assert len(recorder.calls) == 1
    call = recorder.calls[0]
    assert call["url"] == "https://example.convex.site/service/scan/status"
    assert call["headers"]["x-service-secret"] == "test-secret"
    assert call["headers"]["content-type"] == "application/json"
    assert call["json"]["scanId"] == "scan_abc"
    assert call["json"]["status"] == "queued"
    assert call["json"]["localAnalysisId"] == "deadbeef"


def test_convex_sync_attach_upload_includes_duration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path)
    service = ConvexSyncService(settings)

    recorder = _RequestRecorder()
    monkeypatch.setattr(httpx, "post", recorder)

    service.attach_upload_local_id(
        "upload_abc", "local-upload-123", duration_sec=42.5
    )
    call = recorder.calls[0]
    assert call["url"].endswith("/service/upload/attach")
    assert call["json"]["uploadId"] == "upload_abc"
    assert call["json"]["localUploadId"] == "local-upload-123"
    assert call["json"]["durationSec"] == 42.5


def test_convex_sync_summary_sends_only_provided_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path)
    service = ConvexSyncService(settings)

    recorder = _RequestRecorder()
    monkeypatch.setattr(httpx, "post", recorder)

    service.attach_scan_summary(
        "scan_abc",
        viral_potential=80,
        hook_score=60,
    )
    call = recorder.calls[0]
    assert call["json"] == {
        "scanId": "scan_abc",
        "viralPotential": 80,
        "hookScore": 60,
    }


def test_convex_sync_caps_error_message_length(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path)
    service = ConvexSyncService(settings)

    recorder = _RequestRecorder()
    monkeypatch.setattr(httpx, "post", recorder)

    big_message = "x" * 1000
    service.update_scan_status("scan_abc", "failed", error_message=big_message)
    sent = recorder.calls[0]["json"]["errorMessage"]
    assert len(sent) == 500


def test_convex_sync_swallows_network_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path)
    service = ConvexSyncService(settings)

    def _raise(*args: Any, **kwargs: Any) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "post", _raise)

    # Should not raise. The analysis pipeline must keep running even if Convex
    # is unreachable.
    service.update_scan_status("scan_abc", "running")


def test_convex_sync_swallows_server_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path)
    service = ConvexSyncService(settings)

    recorder = _RequestRecorder(response_status=500)
    monkeypatch.setattr(httpx, "post", recorder)

    # Should not raise even if Convex returns 500.
    service.update_scan_status("scan_abc", "completed")


def test_convex_sync_noops_on_empty_ids(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings_with_convex(tmp_path)
    service = ConvexSyncService(settings)

    recorder = _RequestRecorder()
    monkeypatch.setattr(httpx, "post", recorder)

    service.update_scan_status("", "queued")
    service.attach_upload_local_id("", "local-123")
    service.attach_scan_summary("", viral_potential=50)

    assert recorder.calls == []
