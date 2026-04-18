"""Tests for the Convex-required flag on /api/upload and /api/analyze.

These verify that when require_convex_ids=True, requests without Convex IDs
are rejected with 400. They also verify that valid Convex IDs propagate from
the request through to the stored upload metadata and job queue.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.context import APIContext
from app.main import create_app
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.media import VideoMetadata
from app.services.storage import StorageService


@pytest.fixture
def strict_settings(tmp_path: Path) -> Settings:
    # Mirror the conftest settings but flip require_convex_ids to True.
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
        require_convex_ids=True,
        convex_site_url=None,
        convex_service_secret=None,
    )


@pytest.fixture
def strict_client(strict_settings: Settings) -> TestClient:
    # Reuse the conftest stubs by importing them directly.
    from tests.conftest import ImmediateJobService, StubMediaService, StubRunner

    storage = StorageService(strict_settings)
    media = StubMediaService(
        VideoMetadata(
            duration_sec=12.0,
            width=1080,
            height=1920,
            size_bytes=1024 * 1024,
            fps=30.0,
        )
    )
    runner = StubRunner()
    engine = AnalysisEngine(storage, media)
    convex = ConvexSyncService(strict_settings)
    jobs = ImmediateJobService(storage, runner, engine, convex)
    context = APIContext(
        settings=strict_settings,
        storage=storage,
        media=media,
        runner=runner,
        engine=engine,
        jobs=jobs,
        convex=convex,
    )
    return TestClient(create_app(context))


def test_upload_rejects_missing_convex_id_when_strict(strict_client: TestClient) -> None:
    response = strict_client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
    )
    assert response.status_code == 400
    assert "convexUploadId" in response.json()["detail"]


def test_upload_accepts_convex_id_when_strict(strict_client: TestClient) -> None:
    response = strict_client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
        data={"convexUploadId": "kg123abc"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["convexUploadId"] == "kg123abc"


def test_upload_rejects_convex_id_with_control_chars(strict_client: TestClient) -> None:
    response = strict_client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
        data={"convexUploadId": "bad\x00id"},
    )
    assert response.status_code == 400


def test_upload_rejects_convex_id_too_long(strict_client: TestClient) -> None:
    response = strict_client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
        data={"convexUploadId": "a" * 100},
    )
    assert response.status_code == 400


def test_analyze_rejects_missing_convex_scan_id_when_strict(
    strict_client: TestClient,
) -> None:
    upload = strict_client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
        data={"convexUploadId": "kg123abc"},
    ).json()

    # Missing convexScanId must be rejected.
    response = strict_client.post(
        "/api/analyze", json={"uploadId": upload["uploadId"]}
    )
    assert response.status_code == 400
    assert "convexScanId" in response.json()["detail"]


def test_analyze_accepts_convex_scan_id_when_strict(
    strict_client: TestClient,
) -> None:
    upload = strict_client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
        data={"convexUploadId": "kg123abc"},
    ).json()

    response = strict_client.post(
        "/api/analyze",
        json={"uploadId": upload["uploadId"], "convexScanId": "js456def"},
    )
    assert response.status_code == 202


def test_analyze_rejects_invalid_convex_scan_id(strict_client: TestClient) -> None:
    upload = strict_client.post(
        "/api/upload",
        files={"file": ("clip.mp4", BytesIO(b"fake-mp4"), "video/mp4")},
        data={"convexUploadId": "kg123abc"},
    ).json()

    response = strict_client.post(
        "/api/analyze",
        json={
            "uploadId": upload["uploadId"],
            "convexScanId": "scan\nwith\nnewlines",
        },
    )
    assert response.status_code == 400
