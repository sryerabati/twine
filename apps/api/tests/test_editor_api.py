from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.context import APIContext
from app.main import create_app
from app.models.contracts import EditorClipDescriptor
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.jobs import EditorDraftJobService, PreparedEditorClip
from app.services.media import VideoMetadata
from app.services.storage import StorageService
from tests.conftest import ImmediateEditorJobService, ImmediateJobService, StubMediaService, StubRunner


class StubEditorAI:
    def __init__(self, *, enabled: bool) -> None:
        self.enabled = enabled

    def require_editor_support(self) -> None:
        if not self.enabled:
            raise RuntimeError("GEMINI_API_KEY is required for AI Editor generation.")
        return None

    def summarize_editor_clip(self, video_path: Path) -> dict[str, object]:
        name = video_path.stem.replace("_", " ")
        return {
            "summary": f"{name} summary",
            "transcriptPreview": f"{name} transcript",
            "speechCoverage": 0.8,
            "warnings": [],
            "speechSegments": [
                {
                    "startSec": 0.0,
                    "endSec": 1.2,
                    "text": f"{name} transcript",
                }
            ],
        }

    def order_editor_clips(self, clips: list[dict[str, object]]) -> dict[str, object]:
        return {
            "storylineSummary": "Ordered into a simple UGC narrative.",
            "orderingConfidence": "high",
            "orderedClips": [
                {
                    "clipId": str(clip["clipId"]),
                    "rationale": f"Placed {clip['filename']} in order.",
                }
                for clip in clips
            ],
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
        convex_site_url=None,
        convex_service_secret=None,
        require_convex_ids=False,
    )
    convex_sync = ConvexSyncService(settings)
    storage = StorageService(settings, convex_sync=convex_sync)
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
    editor_ai = StubEditorAI(enabled=gemini_api_key is not None)
    return APIContext(
        settings=settings,
        storage=storage,
        media=media,
        runner=runner,
        engine=engine,
        jobs=jobs,
        convex_sync=convex_sync,
        editor_ai=editor_ai,
        editor_jobs=ImmediateEditorJobService(
            storage,
            runner,
            media,
            engine,
            editor_ai,
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


def test_editor_ordering_keeps_direct_transcript_response_adjacent(tmp_path: Path) -> None:
    class MisorderingEditorAI(StubEditorAI):
        def order_editor_clips(self, clips: list[dict[str, object]]) -> dict[str, object]:
            return {
                "storylineSummary": "Grouped clips by theme.",
                "orderingConfidence": "medium",
                "orderedClips": [
                    {
                        "clipId": "clip-intro",
                        "rationale": "Lead with the setup.",
                    },
                    {
                        "clipId": "clip-other",
                        "rationale": "This felt broadly related.",
                    },
                    {
                        "clipId": "clip-response",
                        "rationale": "This can come later.",
                    },
                ],
                "warnings": [],
            }

    settings = Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        gemini_api_key="test-gemini-key",
        gemini_model="gemini-3-flash-preview",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        convex_site_url=None,
        convex_service_secret=None,
        require_convex_ids=False,
    )
    convex_sync = ConvexSyncService(settings)
    storage = StorageService(settings, convex_sync=convex_sync)
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
    service = EditorDraftJobService(
        storage=storage,
        runner=runner,
        media=media,
        engine=engine,
        editor_ai=MisorderingEditorAI(enabled=True),
        convex_sync=convex_sync,
    )

    ordered, _storyline, _confidence, _warnings = service._resolve_order(
        [
            PreparedEditorClip(
                descriptor=EditorClipDescriptor(
                    clipId="clip-intro",
                    uploadId="upload-intro",
                    localUploadId="local-intro",
                    filename="intro.mp4",
                ),
                source_order=0,
                source_path=tmp_path / "intro.mp4",
                duration_sec=4.0,
                recorded_at=None,
                file_modified_at=None,
                transcript_preview="I have one last question about how you handled the pricing.",
                transcript_tail="How did you handle the pricing?",
                summary="Setup question.",
                speech_coverage=0.9,
                warnings=[],
                applied_cuts=[],
            ),
            PreparedEditorClip(
                descriptor=EditorClipDescriptor(
                    clipId="clip-response",
                    uploadId="upload-response",
                    localUploadId="local-response",
                    filename="response.mp4",
                ),
                source_order=1,
                source_path=tmp_path / "response.mp4",
                duration_sec=4.0,
                recorded_at=None,
                file_modified_at=None,
                transcript_preview="Yeah, on pricing we kept the first month simple so people could say yes.",
                transcript_tail="We kept the first month simple so people could say yes.",
                summary="Direct response.",
                speech_coverage=0.9,
                warnings=[],
                applied_cuts=[],
            ),
            PreparedEditorClip(
                descriptor=EditorClipDescriptor(
                    clipId="clip-other",
                    uploadId="upload-other",
                    localUploadId="local-other",
                    filename="other.mp4",
                ),
                source_order=2,
                source_path=tmp_path / "other.mp4",
                duration_sec=4.0,
                recorded_at=None,
                file_modified_at=None,
                transcript_preview="The turnaround time ended up being really fast for us.",
                transcript_tail="The turnaround time ended up being really fast for us.",
                summary="Separate point.",
                speech_coverage=0.9,
                warnings=[],
                applied_cuts=[],
            ),
        ]
    )

    assert [clip.descriptor.clipId for clip in ordered] == [
        "clip-intro",
        "clip-response",
        "clip-other",
    ]
    assert "response" in (ordered[1].rationale or "").lower()
