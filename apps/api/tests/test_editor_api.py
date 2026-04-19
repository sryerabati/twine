from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.context import APIContext
from app.main import create_app
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.jobs import EditorDraftJobService
from app.services.media import VideoMetadata
from app.services.storage import StorageService
from tests.conftest import ImmediateJobService, StubMediaService, StubRunner


class StubEditorAI:
    def require_editor_support(self) -> None:
        return None

    def summarize_editor_clip(self, video_path: Path) -> dict[str, object]:
        name = video_path.stem.replace("_", " ")
        return {
            "summary": f"{name} summary",
            "transcriptPreview": f"{name} transcript",
            "speechCoverage": 0.8,
            "warnings": [],
        }

    def order_editor_clips(self, clips: list[dict[str, object]]) -> dict[str, object]:
        return {
            "storylineSummary": "Ordered into a simple UGC narrative.",
            "orderingConfidence": "high",
            "orderedClipIds": [str(clip["clipId"]) for clip in clips],
            "rationales": {
                str(clip["clipId"]): f"Placed {clip['filename']} in order."
                for clip in clips
            },
            "warnings": [],
        }


def build_editor_test_context(tmp_path: Path, *, gemini_api_key: str | None) -> APIContext:
    settings = Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        gemini_api_key=gemini_api_key,
        gemini_model="gemini-2.5-pro",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        require_convex_ids=False,
    )
    storage = StorageService(settings)
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
    jobs = ImmediateJobService(storage, runner, engine)
    return APIContext(
        settings=settings,
        storage=storage,
        media=media,
        runner=runner,
        engine=engine,
        jobs=jobs,
        convex_sync=ConvexSyncService(settings),
        editor_ai=StubEditorAI(),
        editor_jobs=EditorDraftJobService(
            storage=storage,
            runner=runner,
            media=media,
            engine=engine,
            editor_ai=StubEditorAI(),
            convex_sync=ConvexSyncService(settings),
        ),
    )


def build_editor_client(tmp_path: Path, *, gemini_api_key: str | None) -> tuple[TestClient, APIContext]:
    context = build_editor_test_context(tmp_path, gemini_api_key=gemini_api_key)
    return TestClient(create_app(context)), context


def upload_clip(client: TestClient, filename: str) -> dict[str, str]:
    response = client.post(
        "/api/upload",
        files={"file": (filename, BytesIO(b"fake-mp4"), "video/mp4")},
    )
    assert response.status_code == 201
    payload = response.json()
    return {
        "uploadId": payload["uploadId"],
        "filename": payload["video"]["filename"],
    }


def test_editor_generate_creates_latest_completed_draft(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key="test-gemini-key")
    uploaded = [
        upload_clip(client, "intro.mp4"),
        upload_clip(client, "problem.mp4"),
        upload_clip(client, "cta.mp4"),
    ]

    response = client.post(
        "/api/editor/generate",
        json={
            "convexProjectId": "project-123",
            "clips": [
                {
                    "clipId": f"clip-{index + 1}",
                    "uploadId": clip["uploadId"],
                    "localUploadId": clip["uploadId"],
                    "filename": clip["filename"],
                }
                for index, clip in enumerate(uploaded)
            ],
        },
    )

    assert response.status_code == 202
    draft_record = response.json()
    assert draft_record["draftId"]
    assert draft_record["projectId"] == "project-123"
    assert draft_record["status"] == "queued"

    latest = client.get("/api/editor/projects/project-123/latest-draft")

    assert latest.status_code == 200
    payload = latest.json()
    assert payload["projectId"] == "project-123"
    assert payload["status"] == "completed"
    assert payload["payload"]["export"]["videoUrl"].startswith("/storage/")
    assert payload["payload"]["storylineSummary"]
    assert payload["payload"]["orderedClips"]
    assert len(payload["payload"]["orderedClips"]) == 3
    assert payload["payload"]["orderedClips"][0]["rationale"]


def test_editor_generate_requires_configured_gemini_key(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key=None)
    uploaded = [
        upload_clip(client, "intro.mp4"),
        upload_clip(client, "problem.mp4"),
    ]

    response = client.post(
        "/api/editor/generate",
        json={
            "convexProjectId": "project-123",
            "clips": [
                {
                    "clipId": f"clip-{index + 1}",
                    "uploadId": clip["uploadId"],
                    "localUploadId": clip["uploadId"],
                    "filename": clip["filename"],
                }
                for index, clip in enumerate(uploaded)
            ],
        },
    )

    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_editor_latest_draft_returns_404_when_project_has_no_drafts(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key="test-gemini-key")

    response = client.get("/api/editor/projects/project-empty/latest-draft")

    assert response.status_code == 404
