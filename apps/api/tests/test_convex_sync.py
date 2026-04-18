from __future__ import annotations

from app.core.config import Settings
from app.services.convex_sync import ConvexSyncService


class _DummyResponse:
    def raise_for_status(self) -> None:
        return None


class _CaptureClient:
    def __init__(self, sink: list[dict[str, object]]) -> None:
        self._sink = sink

    def __enter__(self) -> _CaptureClient:
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def post(self, url: str, *, json: dict[str, object], headers: dict[str, str]) -> _DummyResponse:
        self._sink.append({"url": url, "json": json, "headers": headers})
        return _DummyResponse()


def test_update_scan_status_omits_none_fields(monkeypatch) -> None:
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        "app.services.convex_sync.httpx.Client",
        lambda timeout: _CaptureClient(captured),
    )

    service = ConvexSyncService(
        Settings(
            convex_site_url="https://example.convex.site",
            convex_service_secret="secret",
        )
    )

    service.update_scan_status(
        convex_scan_id="scan_123",
        status="running",
        local_analysis_id="analysis_123",
        error_message=None,
    )

    assert captured[0]["json"] == {
        "scanId": "scan_123",
        "status": "running",
        "localAnalysisId": "analysis_123",
    }


def test_attach_scan_summary_omits_none_metrics(monkeypatch) -> None:
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(
        "app.services.convex_sync.httpx.Client",
        lambda timeout: _CaptureClient(captured),
    )

    service = ConvexSyncService(
        Settings(
            convex_site_url="https://example.convex.site",
            convex_service_secret="secret",
        )
    )

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

    assert captured[0]["json"] == {
        "scanId": "scan_123",
        "viralPotential": 85,
        "hookScore": 91,
        "pacingScore": 88,
        "retentionEstimate": 79,
        "deadspaceSeconds": 3.2,
    }
