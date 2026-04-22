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
from app.services.media import MediaFeatures, VideoMetadata
from app.services.storage import StorageService
from tests.conftest import (
    ImmediateEditorJobService,
    ImmediateJobService,
    ImmediateRepurposeJobService,
    StubMediaService,
    StubRunner,
)


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
                    "endSec": 10.8,
                    "text": f"{name} transcript keeps talking through the full pitch without a major gap",
                },
                {
                    "startSec": 12.0,
                    "endSec": 15.8,
                    "text": f"{name} transcript explains the feature set",
                },
                {
                    "startSec": 17.0,
                    "endSec": 17.9,
                    "text": f"{name} transcript cuts dead space",
                },
                {
                    "startSec": 19.0,
                    "endSec": 28.8,
                    "text": f"{name} transcript closes on the proof and payoff",
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

    def plan_repurpose_variants(
        self,
        segments: list[dict[str, object]],
        *,
        source_duration_sec: float,
    ) -> dict[str, object]:
        ordered_segments = [
            {
                "segmentId": str(segment["segmentId"]),
                "rationale": f"Kept {segment['segmentId']} in order.",
            }
            for segment in segments
        ]
        return {
            "summary": "Built three alternate repurpose cuts from the source.",
            "variants": [
                {
                    "title": "Full story",
                    "angleSummary": "Keeps the broader source arc while tightening deadspace.",
                    "rationale": "Best for preserving the original setup and payoff.",
                    "durationTarget": "source",
                    "orderedSegments": ordered_segments,
                },
                {
                    "title": "Fast hook",
                    "angleSummary": "Starts faster and trims supporting beats.",
                    "rationale": "Best for a shorter hook-led upload.",
                    "durationTarget": "short",
                    "orderedSegments": ordered_segments[:2] or ordered_segments,
                },
                {
                    "title": "Proof first",
                    "angleSummary": "Leans into the strongest middle or payoff beats first.",
                    "rationale": "Best for a shorter proof-led upload.",
                    "durationTarget": "short",
                    "orderedSegments": ordered_segments[-2:] or ordered_segments,
                },
            ],
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
        repurpose_jobs=ImmediateRepurposeJobService(
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


def test_repurpose_generate_creates_latest_completed_result(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key="test-gemini-key")
    uploaded = upload_clip(client, "source.mp4")

    response = client.post(
        "/api/repurpose/generate",
        json={
            "convexProjectId": "repurpose-123",
            "sourceUploadId": "upload-row-1",
            "localUploadId": uploaded["uploadId"],
            "filename": uploaded["filename"],
        },
    )

    assert response.status_code == 202
    result_record = response.json()
    assert result_record["resultId"]
    assert result_record["projectId"] == "repurpose-123"
    assert result_record["status"] == "queued"

    latest = client.get("/api/repurpose/projects/repurpose-123/latest-result")

    assert latest.status_code == 200
    payload = latest.json()
    assert payload["projectId"] == "repurpose-123"
    assert payload["status"] == "completed"
    assert payload["payload"]["summary"]
    assert 1 <= len(payload["payload"]["variants"]) <= 3
    assert payload["payload"]["variants"][0]["title"]
    assert payload["payload"]["variants"][0]["videoUrl"].startswith("/storage/")


def test_repurpose_generate_requires_configured_gemini_key(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key=None)
    uploaded = upload_clip(client, "source.mp4")

    response = client.post(
        "/api/repurpose/generate",
        json={
            "convexProjectId": "repurpose-123",
            "sourceUploadId": "upload-row-1",
            "localUploadId": uploaded["uploadId"],
            "filename": uploaded["filename"],
        },
    )

    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_repurpose_generate_repairs_scattered_plans_into_coherent_distinct_short_variants(
    tmp_path: Path,
) -> None:
    class SmoothMediaService(StubMediaService):
        def analyze_media(
            self,
            source_path: Path,
            windows: list[tuple[float, float]],
            transcript_density: list[float],
        ):
            count = len(windows)
            return MediaFeatures(
                audio_energy=[0.9] * count,
                motion_scores=[0.7] * count,
                transcript_density=[max(value, 0.8) for value in transcript_density],
                scene_changes=[False] * count,
                silence_overlap=[False] * count,
                silence_ranges=[],
                scene_change_count=0,
            )

    class ScatteredPlanEditorAI(StubEditorAI):
        def plan_repurpose_variants(
            self,
            segments: list[dict[str, object]],
            *,
            source_duration_sec: float,
        ) -> dict[str, object]:
            ids = [str(segment["segmentId"]) for segment in segments]
            assert len(ids) >= 4
            return {
                "summary": "Built three alternate repurpose cuts from the source.",
                "variants": [
                    {
                        "title": "Scattered full story",
                        "angleSummary": "Starts early and jumps straight to the payoff.",
                        "rationale": "Deliberately scattered plan for regression coverage.",
                        "durationTarget": "source",
                        "orderedSegments": [
                            {"segmentId": ids[0], "rationale": "Open here."},
                            {"segmentId": ids[-1], "rationale": "Jump to the end."},
                        ],
                    },
                    {
                        "title": "Short A",
                        "angleSummary": "Shares the same opening as the other short.",
                        "rationale": "Deliberately overlapping plan for regression coverage.",
                        "durationTarget": "short",
                        "orderedSegments": [
                            {"segmentId": ids[0], "rationale": "Open here."},
                            {"segmentId": ids[1], "rationale": "Keep going."},
                            {"segmentId": ids[2], "rationale": "Still the same."},
                        ],
                    },
                    {
                        "title": "Short B",
                        "angleSummary": "Starts the same and then jumps ahead.",
                        "rationale": "Deliberately overlapping plan for regression coverage.",
                        "durationTarget": "short",
                        "orderedSegments": [
                            {"segmentId": ids[0], "rationale": "Open here."},
                            {"segmentId": ids[1], "rationale": "Keep going."},
                            {"segmentId": ids[-1], "rationale": "Jump ahead."},
                        ],
                    },
                ],
            }

    settings = Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        gemini_api_key="test-gemini-key",
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
    media = SmoothMediaService(
        VideoMetadata(
            duration_sec=30.0,
            width=1080,
            height=1920,
            size_bytes=1024 * 1024,
            fps=30.0,
        )
    )
    runner = StubRunner()
    engine = AnalysisEngine(storage, media)
    jobs = ImmediateJobService(storage, runner, engine)
    editor_ai = ScatteredPlanEditorAI(enabled=True)
    client = TestClient(
        create_app(
            APIContext(
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
                repurpose_jobs=ImmediateRepurposeJobService(
                    storage,
                    runner,
                    media,
                    engine,
                    editor_ai,
                ),
            )
        )
    )

    uploaded = upload_clip(client, "source.mp4")
    response = client.post(
        "/api/repurpose/generate",
        json={
            "convexProjectId": "repurpose-123",
            "sourceUploadId": "upload-row-1",
            "localUploadId": uploaded["uploadId"],
            "filename": uploaded["filename"],
        },
    )

    assert response.status_code == 202

    latest = client.get("/api/repurpose/projects/repurpose-123/latest-result")
    assert latest.status_code == 200
    payload = latest.json()["payload"]
    assert len(payload["variants"]) == 3

    short_variants = [variant for variant in payload["variants"] if variant["durationTarget"] == "short"]
    assert len(short_variants) == 2
    for variant in payload["variants"]:
        starts = [segment["startSec"] for segment in variant["segments"]]
        assert starts == sorted(starts)
    for variant in short_variants:
        for left, right in zip(variant["segments"], variant["segments"][1:]):
            assert right["startSec"] - left["endSec"] <= 1.25
    assert short_variants[0]["segments"][0]["segmentId"] != short_variants[1]["segments"][0]["segmentId"]


def test_repurpose_generate_drops_non_viable_short_variant_instead_of_fabricating_placeholder(
    tmp_path: Path,
) -> None:
    class SparsePlanEditorAI(StubEditorAI):
        def plan_repurpose_variants(
            self,
            segments: list[dict[str, object]],
            *,
            source_duration_sec: float,
        ) -> dict[str, object]:
            ids = [str(segment["segmentId"]) for segment in segments]
            return {
                "summary": "Returned only the usable repurpose cuts.",
                "variants": [
                    {
                        "title": "Full story",
                        "angleSummary": "Keeps the strongest source-order arc.",
                        "rationale": "Usable source variant.",
                        "durationTarget": "source",
                        "orderedSegments": [
                            {"segmentId": segment_id, "rationale": "Keep the coherent arc."}
                            for segment_id in ids[:4]
                        ],
                    },
                    {
                        "title": "Quick hook",
                        "angleSummary": "Shortens to the strongest opening arc.",
                        "rationale": "Usable short variant.",
                        "durationTarget": "short",
                        "orderedSegments": [
                            {"segmentId": segment_id, "rationale": "Keep the short arc."}
                            for segment_id in ids[:2]
                        ],
                    },
                    {
                        "title": "Too short tail",
                        "angleSummary": "Collapsed tail beat.",
                        "rationale": "Deliberately non-viable.",
                        "durationTarget": "short",
                        "orderedSegments": [
                            {"segmentId": ids[-1], "rationale": "Single tail sliver."},
                        ],
                    },
                ],
            }

    settings = Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        gemini_api_key="test-gemini-key",
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
            duration_sec=30.0,
            width=1080,
            height=1920,
            size_bytes=1024 * 1024,
            fps=30.0,
        )
    )
    runner = StubRunner()
    engine = AnalysisEngine(storage, media)
    jobs = ImmediateJobService(storage, runner, engine)
    editor_ai = SparsePlanEditorAI(enabled=True)
    client = TestClient(
        create_app(
            APIContext(
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
                repurpose_jobs=ImmediateRepurposeJobService(
                    storage,
                    runner,
                    media,
                    engine,
                    editor_ai,
                ),
            )
        )
    )

    uploaded = upload_clip(client, "source.mp4")
    response = client.post(
        "/api/repurpose/generate",
        json={
            "convexProjectId": "repurpose-123",
            "sourceUploadId": "upload-row-1",
            "localUploadId": uploaded["uploadId"],
            "filename": uploaded["filename"],
        },
    )

    assert response.status_code == 202

    latest = client.get("/api/repurpose/projects/repurpose-123/latest-result")
    assert latest.status_code == 200
    payload = latest.json()["payload"]
    assert 2 <= len(payload["variants"]) <= 3
    assert [variant["variantId"] for variant in payload["variants"]] == [
        f"variant-{index + 1}" for index in range(len(payload["variants"]))
    ]
    assert all(variant["videoUrl"] for variant in payload["variants"])
    assert all(variant["segmentCount"] >= 2 for variant in payload["variants"])
    short_variants = [variant for variant in payload["variants"] if variant["durationTarget"] == "short"]
    assert all(variant["durationSec"] >= 8.0 for variant in short_variants)


def test_editor_generate_surfaces_ordering_only_warning_when_no_cuts_apply(tmp_path: Path) -> None:
    class NoCutMediaService(StubMediaService):
        def analyze_media(
            self,
            source_path: Path,
            windows: list[tuple[float, float]],
            transcript_density: list[float],
        ):
            count = len(windows)
            return MediaFeatures(
                audio_energy=[0.9] * count,
                motion_scores=[0.85] * count,
                transcript_density=[0.9] * count,
                scene_changes=[True] * count,
                silence_overlap=[False] * count,
                silence_ranges=[],
                scene_change_count=count,
            )

    settings = Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        gemini_api_key="test-gemini-key",
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
    media = NoCutMediaService(
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
    editor_ai = StubEditorAI(enabled=True)
    client = TestClient(
        create_app(
            APIContext(
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
                repurpose_jobs=ImmediateRepurposeJobService(
                    storage,
                    runner,
                    media,
                    engine,
                    editor_ai,
                ),
            )
        )
    )

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

    assert response.status_code == 202
    latest = client.get("/api/editor/projects/project-123/latest-draft")
    assert latest.status_code == 200
    payload = latest.json()["payload"]
    assert any("ordering-only" in warning.lower() for warning in payload["warnings"])
    assert all(clip["removedSeconds"] == 0 for clip in payload["orderedClips"])
    assert all(clip["appliedCuts"] == [] for clip in payload["orderedClips"])


def test_editor_generate_keeps_applied_cuts_in_completed_draft_payload(tmp_path: Path) -> None:
    client, _context = build_editor_client(tmp_path, gemini_api_key="test-gemini-key")
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

    assert response.status_code == 202
    latest = client.get("/api/editor/projects/project-123/latest-draft")
    assert latest.status_code == 200
    payload = latest.json()["payload"]
    assert any(clip["removedSeconds"] > 0 for clip in payload["orderedClips"])
    assert any(clip["appliedCuts"] for clip in payload["orderedClips"])


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
