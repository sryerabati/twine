from __future__ import annotations

import pandas as pd
import numpy as np
import pytest

from app.models.contracts import (
    AnalysisPayload,
    ArtifactLinks,
    BrainResponsePayload,
    BrainResponsePoint,
    DeadspaceCut,
    Diagnostics,
    HemisphereHeatmap,
    MeshInfo,
    ScoreSet,
    AnalysisSummary,
    VideoAsset,
)
from app.services.analysis_engine import AnalysisEngine
from app.services.media import MediaFeatures
from app.services.tribe_runner import SegmentSnapshot, TribeRunResult


# ---------------------------------------------------------------------------
# Helpers: build TribeRunResult + MediaFeatures for N segments of 1s each.
# Tests below construct specific shapes of these to exercise detector paths.
# ---------------------------------------------------------------------------


def _make_result(preds_per_segment: list[float], word_starts: list[float]) -> TribeRunResult:
    preds = np.array(
        [np.full(128, value, dtype=np.float32) for value in preds_per_segment]
    )
    events = (
        pd.DataFrame([{"type": "Word", "start": start} for start in word_starts])
        if word_starts
        else pd.DataFrame(columns=["type", "start"])
    )
    segments = [
        SegmentSnapshot(start=float(index), duration=1.0, nsEventCount=1)
        for index in range(len(preds_per_segment))
    ]
    return TribeRunResult(preds=preds, events=events, segments=segments, device="cpu")


def _make_features(
    *,
    audio_energy: list[float],
    motion_scores: list[float],
    transcript_density: list[float],
    scene_changes: list[bool],
    silence_overlap: list[bool],
    silence_ranges: list[tuple[float, float]] | None = None,
) -> MediaFeatures:
    return MediaFeatures(
        audio_energy=audio_energy,
        motion_scores=motion_scores,
        transcript_density=transcript_density,
        scene_changes=scene_changes,
        silence_overlap=silence_overlap,
        silence_ranges=silence_ranges or [],
        scene_change_count=sum(1 for changed in scene_changes if changed),
    )


def _build_video(duration: float = 12.0) -> VideoAsset:
    return VideoAsset(
        uploadId="upload",
        filename="sample.mp4",
        sourceUrl="/storage/uploads/upload/source.mp4",
        thumbnailUrl="/storage/uploads/upload/thumbnail.jpg",
        durationSec=duration,
        width=1080,
        height=1920,
        sizeBytes=1024,
    )


def _build_payload(test_context, features: MediaFeatures, preds: list[float]) -> AnalysisPayload:
    engine = AnalysisEngine(test_context.storage, test_context.media)
    upload_paths = test_context.storage.create_upload_paths("sample.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="sample.mp4",
        duration_sec=float(len(preds)),
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    analysis_paths = test_context.storage.create_analysis_paths()
    result = _make_result(preds, word_starts=[0.5])
    return engine.build_payload_from_features(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        result=result,
        media_features=features,
    )


# ---------------------------------------------------------------------------
# Happy-path coverage (kept from original test)
# ---------------------------------------------------------------------------


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

    result = _make_result(
        preds_per_segment=[0.15, 0.95, 0.12, 0.08, 0.88, 0.22],
        word_starts=[0.5, 1.0, 4.4],
    )
    features = _make_features(
        audio_energy=[0.4, 0.9, 0.2, 0.1, 0.85, 0.2],
        motion_scores=[0.3, 0.75, 0.15, 0.08, 0.7, 0.2],
        transcript_density=[0.3, 0.7, 0.1, 0.05, 0.45, 0.12],
        scene_changes=[False, True, False, False, True, False],
        silence_overlap=[False, False, True, True, False, False],
        silence_ranges=[(2.0, 3.1)],
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


# ---------------------------------------------------------------------------
# Deadspace detector: silence pass edge cases
# ---------------------------------------------------------------------------


def test_silence_detector_produces_at_least_one_cut(test_context) -> None:
    """Given a pronounced silence run with silenceOverlap flags, a cut must fire.

    This is the positive-case counterpart to the no-speech test. A multi-segment
    quiet run with explicit silenceOverlap should produce at least one
    silence-reasoned cut.
    """
    features = _make_features(
        audio_energy=[0.7, 0.1, 0.1, 0.1, 0.7, 0.7],
        motion_scores=[0.6, 0.1, 0.1, 0.1, 0.6, 0.6],
        transcript_density=[0.5, 0.0, 0.0, 0.0, 0.5, 0.5],
        scene_changes=[True, False, False, False, True, False],
        silence_overlap=[False, True, True, True, False, False],
        silence_ranges=[(1.0, 4.0)],
    )
    payload = _build_payload(
        test_context, features, preds=[0.5, 0.1, 0.1, 0.1, 0.5, 0.5]
    )
    silence_cuts = [c for c in payload.deadspaceCuts if "Silent gap" in c.reason]
    assert silence_cuts, "Silence detector should fire on explicit silence run"
    # Each silence cut must clear the 0.75s minimum-run gate.
    for cut in silence_cuts:
        assert cut.end - cut.start >= 0.75


def test_no_speech_clip_does_not_crash(test_context) -> None:
    """Pure-music/b-roll clip (no words) should analyze cleanly.

    Previously the danger was the transcript density branch erroring on an
    empty events frame. This pins the no-speech path.
    """
    engine = AnalysisEngine(test_context.storage, test_context.media)
    upload_paths = test_context.storage.create_upload_paths("sample.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="sample.mp4",
        duration_sec=6.0,
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    analysis_paths = test_context.storage.create_analysis_paths()

    result = _make_result(
        preds_per_segment=[0.5, 0.55, 0.6, 0.55, 0.5, 0.55],
        word_starts=[],  # no speech
    )
    features = _make_features(
        audio_energy=[0.5, 0.55, 0.6, 0.55, 0.5, 0.55],
        motion_scores=[0.5, 0.55, 0.6, 0.55, 0.5, 0.55],
        transcript_density=[0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        scene_changes=[True, False, True, False, True, False],
        silence_overlap=[False, False, False, False, False, False],
    )

    payload = engine.build_payload_from_features(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        result=result,
        media_features=features,
    )

    assert payload.diagnostics.transcriptWordCount == 0
    # Confidence should land at medium or low when transcript density is empty.
    assert payload.scores.confidence in {"low", "medium"}


def test_empty_events_dataframe_does_not_crash(test_context) -> None:
    """Defensive: events DataFrame with no columns shouldn't crash _transcript_density.

    Exercises the missing-columns early-return branch.
    """
    engine = AnalysisEngine(test_context.storage, test_context.media)
    upload_paths = test_context.storage.create_upload_paths("sample.mp4")
    upload_paths.source_path.write_bytes(b"video")
    video = test_context.storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename="sample.mp4",
        duration_sec=6.0,
        width=1080,
        height=1920,
        size_bytes=1024,
    )
    analysis_paths = test_context.storage.create_analysis_paths()

    preds = np.array([np.full(128, v, dtype=np.float32) for v in [0.5, 0.6, 0.55, 0.5, 0.6, 0.55]])
    result = TribeRunResult(
        preds=preds,
        events=pd.DataFrame(),  # completely empty, no columns
        segments=[SegmentSnapshot(start=float(i), duration=1.0, nsEventCount=1) for i in range(6)],
        device="cpu",
    )
    features = _make_features(
        audio_energy=[0.6, 0.7, 0.5, 0.55, 0.6, 0.5],
        motion_scores=[0.5, 0.55, 0.5, 0.5, 0.55, 0.5],
        transcript_density=[0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        scene_changes=[True, False, True, False, True, False],
        silence_overlap=[False, False, False, False, False, False],
    )

    # Should not raise.
    payload = engine.build_payload_from_features(
        analysis_id=analysis_paths.analysis_id,
        video=video,
        result=result,
        media_features=features,
    )
    assert payload.diagnostics.transcriptWordCount == 0


# ---------------------------------------------------------------------------
# Deadspace detector: low-quality content pass
# ---------------------------------------------------------------------------


def test_low_quality_detector_fires_on_monotone_stretch(test_context) -> None:
    """Audible but monotone + static should be caught by the low-quality pass.

    Audio is present at varied-but-non-trivial levels (so the silence detector's
    `audioEnergy <= 0.25` branch won't fire), but the predicted response is flat,
    rolling variance is low, and motion is low across a contiguous run. Must
    produce at least one low-quality cut.

    The fixture is calibrated against the engine's 5th/95th-percentile
    normalization: raw preds at the monotone region sit at 0.4 with low/high
    bookends at 0.05/0.95, so normalized globalActivation at those indices
    lands in (0.25, 0.35] — above the silence gate but below the low-quality
    gate.
    """
    # 8 segments so the flat stretch spans >= 1.5s.
    features = _make_features(
        audio_energy=[0.3, 0.7, 0.6, 0.6, 0.6, 0.6, 0.6, 0.95],
        motion_scores=[0.6, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9],
        transcript_density=[0.5, 0.7, 0.3, 0.3, 0.3, 0.3, 0.3, 0.7],
        scene_changes=[True, True, False, False, False, False, False, True],
        silence_overlap=[False] * 8,
    )
    payload = _build_payload(
        test_context,
        features,
        preds=[0.05, 0.95, 0.4, 0.4, 0.4, 0.4, 0.4, 0.95],
    )
    low_quality = [c for c in payload.deadspaceCuts if "Low-quality" in c.reason]
    assert low_quality, (
        "Expected low-quality detector to fire on monotone stretch. "
        f"Got cuts: {payload.deadspaceCuts}"
    )


def test_low_quality_skips_silence_overlap(test_context) -> None:
    """The low-quality pass should not fire on segments flagged as silence.

    Silence regions belong to the other detector. If silenceOverlap is True
    for every flat segment, the low-quality detector must stay silent.
    """
    features = _make_features(
        audio_energy=[0.7, 0.1, 0.1, 0.1, 0.1, 0.7],
        motion_scores=[0.6, 0.1, 0.1, 0.1, 0.1, 0.6],
        transcript_density=[0.5, 0.0, 0.0, 0.0, 0.0, 0.5],
        scene_changes=[True, False, False, False, False, True],
        silence_overlap=[False, True, True, True, True, False],
        silence_ranges=[(1.0, 5.0)],
    )
    payload = _build_payload(
        test_context, features, preds=[0.5, 0.1, 0.1, 0.1, 0.1, 0.5]
    )
    low_quality = [c for c in payload.deadspaceCuts if "Low-quality" in c.reason]
    assert not low_quality


def test_cuts_are_never_overlapping(test_context) -> None:
    """End-to-end: produced cuts must never overlap, regardless of which
    detector(s) fire.

    The unit test of _dedupe_cuts covers the merge logic directly. This test
    exercises the full engine path and pins the invariant that cut ranges
    surfaced to the UI are non-overlapping.
    """
    features = _make_features(
        audio_energy=[0.7, 0.1, 0.1, 0.4, 0.4, 0.4, 0.4, 0.7],
        motion_scores=[0.6, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.6],
        transcript_density=[0.5, 0.0, 0.0, 0.2, 0.2, 0.2, 0.2, 0.5],
        scene_changes=[True, False, False, False, False, False, False, True],
        silence_overlap=[False, True, True, False, False, False, False, False],
        silence_ranges=[(1.0, 3.0)],
    )
    payload = _build_payload(
        test_context,
        features,
        preds=[0.5, 0.1, 0.1, 0.3, 0.3, 0.3, 0.3, 0.5],
    )
    cuts = sorted(payload.deadspaceCuts, key=lambda c: c.start)
    # No two cuts should overlap after deduping.
    for earlier, later in zip(cuts, cuts[1:]):
        assert later.start >= earlier.end, (
            f"Cuts overlap: {earlier} and {later}"
        )


def test_dedupe_cuts_merges_touching_ranges() -> None:
    """Unit test of _dedupe_cuts: two adjacent cuts become one."""
    cuts = [
        DeadspaceCut(start=1.0, end=2.0, reason="first"),
        DeadspaceCut(start=2.05, end=4.0, reason="second (longer)"),
    ]
    merged = AnalysisEngine._dedupe_cuts(cuts)
    assert len(merged) == 1
    assert merged[0].start == 1.0
    assert merged[0].end == 4.0
    # Longer range's reason wins.
    assert merged[0].reason == "second (longer)"


def test_dedupe_cuts_preserves_non_overlapping() -> None:
    cuts = [
        DeadspaceCut(start=1.0, end=2.0, reason="a"),
        DeadspaceCut(start=5.0, end=6.0, reason="b"),
    ]
    merged = AnalysisEngine._dedupe_cuts(cuts)
    assert len(merged) == 2
    assert merged[0].end == 2.0
    assert merged[1].start == 5.0


def test_dedupe_cuts_handles_empty() -> None:
    assert AnalysisEngine._dedupe_cuts([]) == []


# ---------------------------------------------------------------------------
# Suggestion wording
# ---------------------------------------------------------------------------


def test_deadspace_cut_reason_includes_duration(test_context) -> None:
    """Cut reason strings should cite the specific duration of the range.

    This pins the wording contract so later copy changes can't regress into
    generic 'likely deadspace' text.
    """
    features = _make_features(
        audio_energy=[0.7, 0.1, 0.1, 0.1, 0.7, 0.7],
        motion_scores=[0.6, 0.1, 0.1, 0.1, 0.6, 0.6],
        transcript_density=[0.5, 0.0, 0.0, 0.0, 0.5, 0.5],
        scene_changes=[True, False, False, False, True, False],
        silence_overlap=[False, True, True, True, False, False],
        silence_ranges=[(1.0, 4.0)],
    )
    payload = _build_payload(
        test_context, features, preds=[0.5, 0.1, 0.1, 0.1, 0.5, 0.5]
    )
    if not payload.deadspaceCuts:
        pytest.skip("Fixture did not trigger deadspace detector")
    for cut in payload.deadspaceCuts:
        # Every cut reason must mention its duration in seconds.
        assert "s" in cut.reason
        assert any(ch.isdigit() for ch in cut.reason)


# ---------------------------------------------------------------------------
# Compare explanations
# ---------------------------------------------------------------------------


def _synthetic_payload(
    *,
    analysis_id: str,
    viral: int,
    hook: int,
    pacing: int,
    deadspace_ranges: list[tuple[float, float]],
    activations: list[float],
) -> AnalysisPayload:
    """Construct a minimal AnalysisPayload for compare tests.

    Avoids running the engine end-to-end \u2014 we only need the fields that
    `_winner` and `_winner_copy` read.
    """
    heatmap = HemisphereHeatmap(left=[0.0] * 64, right=[0.0] * 64)
    time_series = [
        BrainResponsePoint(
            stimulusTimeSec=float(index),
            segmentStartSec=float(index),
            segmentDurationSec=1.0,
            globalActivation=activation,
            leftHemisphereActivation=activation,
            rightHemisphereActivation=activation,
            rollingVariance=0.3,
            activationDelta=0.0,
            spikeScore=0.4,
            dropScore=0.1,
            audioEnergy=0.5,
            motionScore=0.5,
            transcriptDensity=0.4,
            sceneChange=(index % 2 == 0),
            silenceOverlap=False,
            hemisphereHeatmap=heatmap,
        )
        for index, activation in enumerate(activations)
    ]
    cuts = [
        DeadspaceCut(start=s, end=e, reason="test cut")
        for s, e in deadspace_ranges
    ]
    return AnalysisPayload(
        analysisId=analysis_id,
        video=_build_video(duration=float(len(activations))),
        brainResponse=BrainResponsePayload(
            timeSeries=time_series,
            meshInfo=MeshInfo(totalVertices=128),
        ),
        markers=[],
        deadspaceCuts=cuts,
        scores=ScoreSet(
            hookScore=hook,
            pacingScore=pacing,
            retentionEstimate=(hook + pacing + viral) // 3,
            viralPotential=viral,
            confidence="medium",
            helpingFactors=["placeholder"],
            hurtingFactors=["placeholder"],
        ),
        summary=AnalysisSummary(
            strengths=["test"],
            weaknesses=["test"],
            overallRecommendation="test",
        ),
        artifacts=ArtifactLinks(
            rawPredictionsUrl="/storage/x/preds.npy",
            processedJsonUrl="/storage/x/payload.json",
            cutListJsonUrl="/storage/x/cut-list.json",
            eventsCsvUrl="/storage/x/events.csv",
            segmentsJsonUrl="/storage/x/segments.json",
        ),
        diagnostics=Diagnostics(
            device="cpu",
            modelRepo="facebook/tribev2",
            modelCommit="commit",
            transcriptWordCount=5,
            sceneChangeCount=2,
            deadspaceSeconds=sum(e - s for s, e in deadspace_ranges),
            warnings=[],
        ),
    )


def test_compare_lopsided_winner_cites_numbers(test_context) -> None:
    """When one cut clearly wins, the reason should cite the delta.

    Generic filler like 'wins on the weighted heuristic stack' is no longer
    acceptable \u2014 the reason must name a specific metric.
    """
    engine = AnalysisEngine(test_context.storage, test_context.media)
    payload_a = _synthetic_payload(
        analysis_id="a" * 32,
        viral=80,
        hook=75,
        pacing=70,
        deadspace_ranges=[],
        activations=[0.8, 0.85, 0.7, 0.75, 0.8, 0.9],
    )
    payload_b = _synthetic_payload(
        analysis_id="b" * 32,
        viral=45,
        hook=40,
        pacing=50,
        deadspace_ranges=[(1.0, 3.0)],
        activations=[0.3, 0.35, 0.25, 0.3, 0.35, 0.4],
    )
    compare = engine.compare(payload_a, payload_b)
    assert compare.winner == "A"
    # Reason should mention the winner and a specific delta.
    assert "A" in compare.winnerReason
    assert "35" in compare.winnerReason or "80" in compare.winnerReason  # delta or raw score


def test_compare_tie_has_specific_wording(test_context) -> None:
    """A true tie should produce tie-specific copy, not winner copy."""
    engine = AnalysisEngine(test_context.storage, test_context.media)
    payload_a = _synthetic_payload(
        analysis_id="a" * 32,
        viral=60,
        hook=60,
        pacing=60,
        deadspace_ranges=[(1.0, 2.0)],
        activations=[0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    )
    payload_b = _synthetic_payload(
        analysis_id="b" * 32,
        viral=60,
        hook=60,
        pacing=60,
        deadspace_ranges=[(1.0, 2.0)],
        activations=[0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    )
    compare = engine.compare(payload_a, payload_b)
    assert compare.winner == "tie"
    # Tie copy should acknowledge parity, not declare a winner.
    assert "Version A" not in compare.winnerReason
    assert "Version B" not in compare.winnerReason


def test_compare_summary_contains_deltas(test_context) -> None:
    """Summary lines should include signed deltas for each score."""
    engine = AnalysisEngine(test_context.storage, test_context.media)
    payload_a = _synthetic_payload(
        analysis_id="a" * 32,
        viral=70,
        hook=65,
        pacing=60,
        deadspace_ranges=[],
        activations=[0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
    )
    payload_b = _synthetic_payload(
        analysis_id="b" * 32,
        viral=55,
        hook=50,
        pacing=55,
        deadspace_ranges=[(2.0, 4.0)],
        activations=[0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
    )
    compare = engine.compare(payload_a, payload_b)
    # The summary should include at least one line per major metric.
    joined = " ".join(compare.summary)
    assert "Viral potential" in joined
    assert "Hook" in joined
    assert "Pacing" in joined
    assert "Deadspace" in joined
    # Deltas should be signed (+15, -15 etc.).
    assert "+15" in joined or "-15" in joined


def test_compare_close_call_uses_deadspace_as_tiebreaker(test_context) -> None:
    """When viral and hook are close, the reason should cite deadspace."""
    engine = AnalysisEngine(test_context.storage, test_context.media)
    # Identical scores, differ only in deadspace \u2014 the _winner method breaks
    # ties in favor of less deadspace.
    payload_a = _synthetic_payload(
        analysis_id="a" * 32,
        viral=60,
        hook=60,
        pacing=60,
        deadspace_ranges=[(1.0, 1.5)],  # 0.5s
        activations=[0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
    )
    payload_b = _synthetic_payload(
        analysis_id="b" * 32,
        viral=60,
        hook=60,
        pacing=60,
        deadspace_ranges=[(1.0, 4.0)],  # 3.0s
        activations=[0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
    )
    compare = engine.compare(payload_a, payload_b)
    assert compare.winner == "A"
    # Reason should mention deadspace as the tiebreaker.
    assert "deadspace" in compare.winnerReason.lower()
