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
from app.services.jobs import AnalysisJobService
from app.services.media import MediaFeatures, VideoMetadata
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

    def analyze_media(
        self,
        source_path: Path,
        windows: list[tuple[float, float]],
        transcript_density: list[float],
    ) -> MediaFeatures:
        count = len(windows)
        return MediaFeatures(
            audio_energy=[0.7, 0.9, 0.2, 0.15, 0.85, 0.25][:count],
            motion_scores=[0.3, 0.8, 0.1, 0.08, 0.7, 0.2][:count],
            transcript_density=transcript_density,
            scene_changes=[False, True, False, False, True, False][:count],
            silence_overlap=[False, False, True, True, False, False][:count],
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
    def __init__(
        self,
        storage: StorageService,
        runner: StubRunner,
        engine: AnalysisEngine,
        convex: ConvexSyncService,
    ) -> None:
        self._delegate = AnalysisJobService(storage, runner, engine, convex)

    def enqueue(
        self,
        analysis_id: str,
        upload_id: str,
        convex_scan_id: str | None = None,
    ) -> None:
        self._delegate.run_now(analysis_id, upload_id, convex_scan_id)


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
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
        # Existing tests pre-date Convex integration; keep them working by not
        # forcing Convex IDs. Tests that exercise Convex behavior set this
        # explicitly or use the real ConvexSyncService with a mock transport.
        require_convex_ids=False,
        convex_site_url=None,
        convex_service_secret=None,
    )


@pytest.fixture
def test_context(test_settings: Settings) -> APIContext:
    storage = StorageService(test_settings)
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
    convex = ConvexSyncService(test_settings)
    jobs = ImmediateJobService(storage, runner, engine, convex)
    return APIContext(
        settings=test_settings,
        storage=storage,
        media=media,
        runner=runner,
        engine=engine,
        jobs=jobs,
        convex=convex,
    )


@pytest.fixture
def client(test_context: APIContext) -> TestClient:
    app = create_app(test_context)
    return TestClient(app)
