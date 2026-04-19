from __future__ import annotations

from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.core.context import APIContext
from app.main import create_app
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.jobs import AnalysisJobService, EditorDraftJobService
from app.services.media import MediaFeatures, SequenceClipPlan, SequenceClipTiming, VideoMetadata
from app.services.storage import StorageService
from app.services.tribe_runner import SegmentSnapshot, TribeRunResult


class StubMediaService:
    def __init__(self, metadata: VideoMetadata) -> None:
        self.metadata = metadata

    def inspect_video(self, path: Path) -> VideoMetadata:
        return self.metadata

    def generate_thumbnail(self, source_path: Path, output_path: Path) -> None:
        output_path.write_bytes(b"fake-thumbnail")

    def trim_deadspace(
        self,
        source_path: Path,
        output_path: Path,
        cuts: list[tuple[float, float]],
        total_duration_sec: float,
    ) -> float:
        # Tests don't exercise real ffmpeg; write a placeholder file and return
        # a plausible duration so the contract is exercised.
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake-trimmed-mp4")
        removed = sum(max(0.0, end - start) for start, end in cuts)
        return max(0.0, total_duration_sec - removed)

    def assemble_sequence(
        self,
        *,
        output_path: Path,
        clips: list[SequenceClipPlan],
    ) -> tuple[float, list[SequenceClipTiming]]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake-editor-draft")
        timings: list[SequenceClipTiming] = []
        cursor = 0.0
        for clip in clips:
            trimmed_duration = max(
                0.0,
                clip.total_duration_sec - sum(max(0.0, end - start) for start, end in clip.cuts),
            )
            timings.append(
                SequenceClipTiming(
                    clip_id=clip.clip_id,
                    trimmed_duration_sec=round(trimmed_duration, 2),
                    removed_seconds=round(clip.total_duration_sec - trimmed_duration, 2),
                    output_start_sec=round(cursor, 2),
                    output_end_sec=round(cursor + trimmed_duration, 2),
                )
            )
            cursor += trimmed_duration
        return round(cursor, 2), timings

    def analyze_media(
        self,
        source_path: Path,
        windows: list[tuple[float, float]],
        transcript_density: list[float],
    ) -> MediaFeatures:
        count = len(windows)
        def series(values: list[float] | list[bool]) -> list[float] | list[bool]:
            if not values:
                return [0.0] * count
            return [values[min(index, len(values) - 1)] for index in range(count)]
        return MediaFeatures(
            audio_energy=series([0.7, 0.9, 0.2, 0.15, 0.85, 0.25]),
            motion_scores=series([0.3, 0.8, 0.1, 0.08, 0.7, 0.2]),
            transcript_density=transcript_density,
            scene_changes=series([False, True, False, False, True, False]),
            silence_overlap=series([False, False, True, True, False, False]),
            silence_ranges=[(2.0, 3.4)],
            scene_change_count=2,
        )


class StubRunner:
    MODEL_REPO = "facebook/tribev2"
    MODEL_COMMIT = "72399081ed3f1040c4d996cefb2864a4c46f5b8e"

    def __init__(self) -> None:
        self._error: str | None = None

    def has_install(self) -> bool:
        return False

    def model_status(self) -> str:
        return "unloaded"

    def model_error(self) -> str | None:
        return self._error

    def selected_device(self) -> str:
        return "cpu"

    def analyze_video(self, video_path: Path) -> TribeRunResult:
        preds = np.array(
            [
                np.full(128, 0.15, dtype=np.float32),
                np.full(128, 0.9, dtype=np.float32),
                np.full(128, 0.18, dtype=np.float32),
                np.full(128, 0.1, dtype=np.float32),
                np.full(128, 0.82, dtype=np.float32),
                np.full(128, 0.25, dtype=np.float32),
            ]
        )
        events = pd.DataFrame(
            [
                {"type": "Word", "start": 0.2},
                {"type": "Word", "start": 1.1},
                {"type": "Word", "start": 4.2},
            ]
        )
        segments = [
            SegmentSnapshot(start=float(index), duration=1.0, nsEventCount=1)
            for index in range(len(preds))
        ]
        return TribeRunResult(preds=preds, events=events, segments=segments, device="cpu")


class ImmediateJobService:
    def __init__(self, storage: StorageService, runner: StubRunner, engine: AnalysisEngine) -> None:
        self._delegate = AnalysisJobService(storage, runner, engine, ConvexSyncService(storage.settings))

    def enqueue(self, analysis_id: str, upload_id: str, convex_scan_id: str | None = None) -> None:
        self._delegate.run_now(analysis_id, upload_id, convex_scan_id)


class StubEditorAI:
    def require_editor_support(self) -> None:
        return None

    def summarize_editor_clip(self, video_path: Path) -> dict[str, object]:
        stem = video_path.stem.replace("_", " ")
        return {
            "summary": f"{stem} summary",
            "transcriptPreview": f"{stem} transcript",
            "speechCoverage": 0.75,
            "warnings": [],
        }

    def order_editor_clips(self, clips: list[dict[str, object]]) -> dict[str, object]:
        return {
            "storylineSummary": "Ordered into a creator-friendly sequence.",
            "orderingConfidence": "high",
            "orderedClips": [
                {
                    "clipId": str(clip["clipId"]),
                    "rationale": f"Placed {clip['filename']} in narrative order.",
                }
                for clip in clips
            ],
            "warnings": [],
        }


class ImmediateEditorJobService:
    def __init__(
        self,
        storage: StorageService,
        runner: StubRunner,
        media: StubMediaService,
        engine: AnalysisEngine,
        editor_ai: StubEditorAI,
    ) -> None:
        self._delegate = EditorDraftJobService(
            storage=storage,
            runner=runner,
            media=media,
            engine=engine,
            editor_ai=editor_ai,
            convex_sync=ConvexSyncService(storage.settings),
        )

    def enqueue(self, project_id: str, draft_id: str, clips: list[object]) -> None:
        self._delegate.run_now(project_id, draft_id, clips)  # type: ignore[arg-type]


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
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
        convex_site_url=None,
        convex_service_secret=None,
        require_convex_ids=False,
    )


@pytest.fixture
def test_context(test_settings: Settings) -> APIContext:
    convex_sync = ConvexSyncService(test_settings)
    storage = StorageService(test_settings, convex_sync=convex_sync)
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
    editor_ai = StubEditorAI()
    editor_jobs = ImmediateEditorJobService(storage, runner, media, engine, editor_ai)
    return APIContext(
        settings=test_settings,
        storage=storage,
        media=media,
        runner=runner,
        engine=engine,
        jobs=jobs,
        convex_sync=convex_sync,
        editor_ai=editor_ai,
        editor_jobs=editor_jobs,
    )


@pytest.fixture
def client(test_context: APIContext) -> TestClient:
    app = create_app(test_context)
    return TestClient(app)
