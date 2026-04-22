from __future__ import annotations

import pandas as pd
import numpy as np

from app.services.analysis_engine import AnalysisEngine
from app.services.media import MediaFeatures
from app.services.tribe_runner import SegmentSnapshot, TribeRunResult


def test_engine_generates_heatmaps_markers_and_scores(test_context) -> None:
    engine = AnalysisEngine(test_context.storage, test_context.media)
    upload_paths = test_context.storage.create_upload_paths("sample.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="sample.mp4",
        duration_sec=12.0,
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    analysis_paths = test_context.storage.create_analysis_paths()

    result = TribeRunResult(
        preds=np.array(
            [
                np.full(128, 0.15, dtype=np.float32),
                np.full(128, 0.95, dtype=np.float32),
                np.full(128, 0.12, dtype=np.float32),
                np.full(128, 0.08, dtype=np.float32),
                np.full(128, 0.88, dtype=np.float32),
                np.full(128, 0.22, dtype=np.float32),
            ]
        ),
        events=pd.DataFrame(
            [
                {"type": "Word", "start": 0.5},
                {"type": "Word", "start": 1.0},
                {"type": "Word", "start": 4.4},
            ]
        ),
        segments=[
            SegmentSnapshot(start=float(index), duration=1.0, nsEventCount=1)
            for index in range(6)
        ],
        device="cpu",
    )
    features = MediaFeatures(
        audio_energy=[0.4, 0.9, 0.2, 0.1, 0.85, 0.2],
        motion_scores=[0.3, 0.75, 0.15, 0.08, 0.7, 0.2],
        transcript_density=[0.3, 0.7, 0.1, 0.05, 0.45, 0.12],
        scene_changes=[False, True, False, False, True, False],
        silence_overlap=[False, False, True, True, False, False],
        silence_ranges=[(2.0, 3.1)],
        scene_change_count=2,
    )

    payload = engine.build_payload_from_features(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        result=result,
        media_features=features,
    )

    assert len(payload.brainResponse.timeSeries) == 6
    assert len(payload.brainResponse.timeSeries[0].hemisphereHeatmap.left) == 64
    assert payload.scores.viralPotential >= 0
    assert payload.summary.overallRecommendation
    assert any(marker.type in {"strong_hook", "deadspace_candidate"} for marker in payload.markers)
    assert payload.actionBoard.keep
    assert payload.actionBoard.fixNow
    assert payload.timelineSegments
    assert all(segment.recommendedAction for segment in payload.timelineSegments)
    assert payload.cutPlan
    assert any(cut.type == "deadspace" and cut.defaultSelected for cut in payload.cutPlan)
    assert any(cut.type == "low_value" and not cut.defaultSelected for cut in payload.cutPlan)
    assert all(cut.id for cut in payload.cutPlan)


def test_proxy_payload_compresses_brain_activation_without_muting_room_sentiment(test_context) -> None:
    engine = AnalysisEngine(test_context.storage, test_context.media)
    upload_paths = test_context.storage.create_upload_paths("proxy.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="proxy.mp4",
        duration_sec=8.0,
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    analysis_paths = test_context.storage.create_analysis_paths()

    result = TribeRunResult(
        preds=np.zeros((2, 128), dtype=np.float32),
        events=pd.DataFrame(columns=["type", "start"]),
        segments=[
            SegmentSnapshot(start=0.0, duration=4.0, nsEventCount=0),
            SegmentSnapshot(start=4.0, duration=4.0, nsEventCount=0),
        ],
        device="remote",
    )
    result.proxyAnalysis = {
        "summary": {
            "overallRecommendation": "Strong interest early, then some skepticism.",
            "strengths": ["Strong first beat"],
            "weaknesses": ["Trust softens later"],
        },
        "scores": {
            "hookScore": 84,
            "pacingScore": 66,
            "retentionEstimate": 71,
            "viralPotential": 75,
            "confidence": "medium",
            "helpingFactors": ["The first beat is sticky"],
            "hurtingFactors": ["The payoff needs more proof"],
        },
        "timeline": [
            {
                "startSec": 0.0,
                "endSec": 4.0,
                "globalActivation": 0.94,
                "motionScore": 0.58,
                "audioEnergy": 0.63,
                "transcriptDensity": 0.47,
                "sceneChange": True,
                "silenceOverlap": False,
                "note": "The room leans in fast.",
            },
            {
                "startSec": 4.0,
                "endSec": 8.0,
                "globalActivation": 0.87,
                "motionScore": 0.41,
                "audioEnergy": 0.48,
                "transcriptDensity": 0.39,
                "sceneChange": False,
                "silenceOverlap": False,
                "note": "The room still watches, but belief is softer.",
            },
        ],
        "markers": [],
        "deadspaceCuts": [],
        "warnings": [],
    }

    artifacts = engine.build_payload(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        source_path=upload_paths.source_path,
        result=result,
    )

    assert artifacts.payload.analysisMode == "read_the_room"
    assert artifacts.payload.audienceOutlook is not None
    assert artifacts.payload.brainSummary is not None
    assert artifacts.payload.audienceOutlook.timeline[0].sentiment == 0.94
    assert artifacts.payload.audienceOutlook.timeline[1].sentiment == 0.87
    assert artifacts.payload.brainSummary.averageActivation < 0.75
    assert artifacts.payload.brainSummary.averageActivation < np.mean([0.94, 0.87])


def test_proxy_cut_normalization_requires_at_least_hundred_ms() -> None:
    cuts = AnalysisEngine._normalize_proxy_cuts(
        [
            {
                "id": "too-short",
                "start": 1.0,
                "end": 1.09,
                "reason": "Ignore this tiny cut.",
            },
            {
                "id": "kept",
                "start": 2.0,
                "end": 2.1,
                "reason": "Keep this cut.",
            },
        ],
        "deadspace",
    )

    assert [cut.id for cut in cuts] == ["kept"]
    assert cuts[0].start == 2.0
    assert cuts[0].end == 2.1
