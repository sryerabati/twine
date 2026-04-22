from __future__ import annotations

from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.core.context import APIContext
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.media import MediaFeatures, VideoMetadata
from app.services.storage import StorageService
from app.services.tribe_runner import (
    SegmentSnapshot,
    TribeProbe,
    TribeRunResult,
)
from scripts.runner_common import (
    RunnerScriptError,
    command_analyze,
    command_download,
    probe_runtime,
)
from tests.conftest import ImmediateEditorJobService, ImmediateRepurposeJobService, StubEditorAI


class StubMediaService:
    def __init__(self, metadata: VideoMetadata) -> None:
        self.metadata = metadata

    def inspect_video(self, path: Path) -> VideoMetadata:
        return self.metadata

    def generate_thumbnail(self, source_path: Path, output_path: Path) -> None:
        output_path.write_bytes(b"thumbnail")

    def trim_deadspace(
        self,
        source_path: Path,
        output_path: Path,
        cuts: list[tuple[float, float]],
        total_duration_sec: float,
    ) -> float:
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
            audio_energy=[0.6, 0.8, 0.2, 0.1][:count],
            motion_scores=[0.2, 0.7, 0.1, 0.05][:count],
            transcript_density=transcript_density,
            scene_changes=[False, True, False, False][:count],
            silence_overlap=[False, False, True, True][:count],
            silence_ranges=[(2.0, 3.2)],
            scene_change_count=1,
        )


class StubRunner:
    def __init__(
        self,
        *,
        install_present: bool = True,
        token_loaded: bool = True,
        model_error_text: str | None = None,
    ) -> None:
        self.install_present = install_present
        self.token_loaded = token_loaded
        self.model_error_text = model_error_text

    def has_install(self) -> bool:
        return self.install_present

    def model_status(self) -> str:
        return "loaded" if self.token_loaded else "unloaded"

    def model_error(self) -> str | None:
        return self.model_error_text

    def selected_device(self) -> str:
        return "cpu"

    def probe(self) -> TribeProbe:
        return TribeProbe(
            installed=self.install_present,
            modelStatus=self.model_status(),
            modelError=self.model_error(),
            selectedDevice=self.selected_device(),
            modelRepo="facebook/tribev2",
            modelCommit="72399081ed3f1040c4d996cefb2864a4c46f5b8e",
        )

    def warm_load(self) -> TribeProbe:
        if not self.install_present:
            raise RuntimeError("tribev2 missing")
        self.token_loaded = True
        return self.probe()

    def analyze_video(self, video_path: Path) -> TribeRunResult:
        preds = np.array(
            [
                np.full(128, 0.2, dtype=np.float32),
                np.full(128, 0.85, dtype=np.float32),
                np.full(128, 0.12, dtype=np.float32),
                np.full(128, 0.25, dtype=np.float32),
            ]
        )
        events = pd.DataFrame(
            [
                {"type": "Word", "start": 0.25},
                {"type": "Word", "start": 1.25},
            ]
        )
        segments = [
            SegmentSnapshot(start=float(index), duration=1.0, nsEventCount=1)
            for index in range(len(preds))
        ]
        return TribeRunResult(preds=preds, events=events, segments=segments, device="cpu")


def make_settings(tmp_path: Path, *, token: str | None) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        max_video_seconds=60,
        huggingface_hub_token=token,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        convex_site_url=None,
        convex_service_secret=None,
    )


def make_context(
    tmp_path: Path,
    *,
    token: str | None,
    install_present: bool = True,
) -> APIContext:
    settings = make_settings(tmp_path, token=token)
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
    runner = StubRunner(install_present=install_present)
    engine = AnalysisEngine(storage, media)
    convex_sync = ConvexSyncService(settings)
    editor_ai = StubEditorAI()
    editor_jobs = ImmediateEditorJobService(storage, runner, media, engine, editor_ai)
    repurpose_jobs = ImmediateRepurposeJobService(storage, runner, media, engine, editor_ai)
    return APIContext(
        settings=settings,
        storage=storage,
        media=media,
        runner=runner,
        engine=engine,
        jobs=None,
        convex_sync=convex_sync,
        editor_ai=editor_ai,
        editor_jobs=editor_jobs,
        repurpose_jobs=repurpose_jobs,
    )


def test_download_requires_hugging_face_token(tmp_path: Path) -> None:
    context = make_context(tmp_path, token=None)

    with pytest.raises(RunnerScriptError, match="HUGGINGFACE_HUB_TOKEN"):
        command_download(context, "windows")


def test_download_requires_tribev2_install(tmp_path: Path) -> None:
    context = make_context(tmp_path, token="hf_test_token", install_present=False)

    with pytest.raises(RunnerScriptError, match="tribev2 package is not installed"):
        command_download(context, "windows")


def test_probe_reports_expected_fields(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    context = make_context(tmp_path, token="hf_test_token")
    monkeypatch.setattr(
        "scripts.runner_common.shutil.which",
        lambda binary: f"/usr/bin/{binary}",
    )

    report = probe_runtime(context, "windows")

    assert report.osName == "windows"
    assert report.pythonValid is True
    assert report.tribev2Installed is True
    assert report.huggingFaceTokenPresent is True
    assert report.selectedDevice == "cpu"
    assert report.modelRepo == "facebook/tribev2"
    assert report.modelCommit == "72399081ed3f1040c4d996cefb2864a4c46f5b8e"
    assert report.ffmpegAvailable is True
    assert report.ffprobeAvailable is True
    assert isinstance(report.blockers, list)
    assert isinstance(report.notes, list)


def test_analyze_writes_artifacts_with_stubbed_context(tmp_path: Path) -> None:
    context = make_context(tmp_path, token="hf_test_token")
    video_path = tmp_path / "clip.mp4"
    video_path.write_bytes(b"video")

    result = command_analyze(context, "mac", video_path)

    assert result["status"] == "completed"
    assert result["analysisId"]
    assert result["uploadId"]
    assert Path(result["artifacts"]["recordPath"]).exists()
    assert Path(result["artifacts"]["payloadPath"]).exists()
    assert Path(result["artifacts"]["predictionsPath"]).exists()
    assert Path(result["artifacts"]["eventsPath"]).exists()
    assert Path(result["artifacts"]["segmentsPath"]).exists()
    assert Path(result["artifacts"]["cutsPath"]).exists()


def test_analyze_accepts_mov_inputs(tmp_path: Path) -> None:
    context = make_context(tmp_path, token="hf_test_token")
    video_path = tmp_path / "clip.mov"
    video_path.write_bytes(b"video")

    result = command_analyze(context, "mac", video_path)

    assert result["status"] == "completed"
    assert result["payload"]["video"]["filename"] == "clip.mov"
