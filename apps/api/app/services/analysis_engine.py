from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from app.models.contracts import (
    AnalysisPayload,
    AnalysisSummary,
    ArtifactLinks,
    BrainResponsePayload,
    BrainResponsePoint,
    CompareResponse,
    CompareSlice,
    ConfidenceBand,
    DeadspaceCut,
    Diagnostics,
    HemisphereHeatmap,
    Marker,
    MeshInfo,
    ScoreSet,
    VideoAsset,
)
from app.services.media import MediaFeatures, MediaService
from app.services.storage import StorageService
from app.services.tribe_runner import MODEL_COMMIT, MODEL_REPO, TribeRunResult


@dataclass
class AnalysisArtifacts:
    payload: AnalysisPayload
    events_csv: str
    segments_json: list[dict[str, float | int]]
    preds: np.ndarray


class AnalysisEngine:
    def __init__(self, storage: StorageService, media: MediaService) -> None:
        self.storage = storage
        self.media = media

    def build_payload(
        self,
        analysis_id: str,
        video: VideoAsset,
        source_path: Path,
        result: TribeRunResult,
    ) -> AnalysisArtifacts:
        windows = [
            (segment.start, segment.start + segment.duration)
            for segment in result.segments
        ]
        transcript_density = self._transcript_density(result.events, windows)
        media_features = self.media.analyze_media(
            source_path=source_path,
            windows=windows,
            transcript_density=transcript_density,
        )

        points = self._brain_response_points(result, media_features)
        markers, cuts = self._markers_and_cuts(points)
        scores = self._scores(points, cuts, video.durationSec)
        summary = self._summary(points, markers, cuts, scores)
        artifacts = ArtifactLinks(**self.storage.artifacts_for(analysis_id))
        diagnostics = Diagnostics(
            device=result.device,
            modelRepo=MODEL_REPO,
            modelCommit=MODEL_COMMIT,
            transcriptWordCount=int((result.events["type"] == "Word").sum())
            if "type" in result.events
            else 0,
            sceneChangeCount=media_features.scene_change_count,
            deadspaceSeconds=round(
                sum(cut.end - cut.start for cut in cuts),
                2,
            ),
            warnings=self._warnings(video, result, cuts),
        )
        payload = AnalysisPayload(
            analysisId=analysis_id,
            video=video,
            brainResponse=BrainResponsePayload(
                timeSeries=points,
                meshInfo=MeshInfo(totalVertices=int(result.preds.shape[1])),
            ),
            markers=markers,
            deadspaceCuts=cuts,
            scores=scores,
            summary=summary,
            artifacts=artifacts,
            diagnostics=diagnostics,
        )
        return AnalysisArtifacts(
            payload=payload,
            events_csv=result.events.to_csv(index=False),
            segments_json=[
                {
                    "start": segment.start,
                    "duration": segment.duration,
                    "nsEventCount": segment.nsEventCount,
                }
                for segment in result.segments
            ],
            preds=result.preds,
        )

    def build_payload_from_features(
        self,
        analysis_id: str,
        video: VideoAsset,
        result: TribeRunResult,
        media_features: MediaFeatures,
    ) -> AnalysisPayload:
        points = self._brain_response_points(result, media_features)
        markers, cuts = self._markers_and_cuts(points)
        scores = self._scores(points, cuts, video.durationSec)
        summary = self._summary(points, markers, cuts, scores)
        artifacts = ArtifactLinks(**self.storage.artifacts_for(analysis_id))
        return AnalysisPayload(
            analysisId=analysis_id,
            video=video,
            brainResponse=BrainResponsePayload(
                timeSeries=points,
                meshInfo=MeshInfo(totalVertices=int(result.preds.shape[1])),
            ),
            markers=markers,
            deadspaceCuts=cuts,
            scores=scores,
            summary=summary,
            artifacts=artifacts,
            diagnostics=Diagnostics(
                device=result.device,
                modelRepo=MODEL_REPO,
                modelCommit=MODEL_COMMIT,
                transcriptWordCount=int((result.events["type"] == "Word").sum())
                if "type" in result.events
                else 0,
                sceneChangeCount=media_features.scene_change_count,
                deadspaceSeconds=round(sum(cut.end - cut.start for cut in cuts), 2),
                warnings=self._warnings(video, result, cuts),
            ),
        )

    def compare(self, payload_a: AnalysisPayload, payload_b: AnalysisPayload) -> CompareResponse:
        slices = self._slice_comparison(payload_a, payload_b)
        winner = self._winner(payload_a, payload_b)
        reason, recommendation, summary = self._winner_copy(
            payload_a, payload_b, winner, slices
        )
        return CompareResponse(
            analysisIdA=payload_a.analysisId,
            analysisIdB=payload_b.analysisId,
            winner=winner,
            winnerReason=reason,
            recommendation=recommendation,
            summary=summary,
            slices=slices,
        )

    @staticmethod
    def _winner_copy(
        payload_a: AnalysisPayload,
        payload_b: AnalysisPayload,
        winner: str,
        slices: list[CompareSlice],
    ) -> tuple[str, str, list[str]]:
        """Build human-facing winner reason, recommendation, and summary lines.

        Cites specific deltas (viral, hook) and names which slices the winner
        actually took, so the copy reads like analysis rather than filler.
        """
        viral_delta = payload_a.scores.viralPotential - payload_b.scores.viralPotential
        hook_delta = payload_a.scores.hookScore - payload_b.scores.hookScore
        pacing_delta = payload_a.scores.pacingScore - payload_b.scores.pacingScore
        deadspace_a = round(sum(c.end - c.start for c in payload_a.deadspaceCuts), 1)
        deadspace_b = round(sum(c.end - c.start for c in payload_b.deadspaceCuts), 1)

        slice_wins_a = [s.label for s in slices if s.winner == "A"]
        slice_wins_b = [s.label for s in slices if s.winner == "B"]

        if winner == "tie":
            reason = (
                f"Both cuts land on viral potential {payload_a.scores.viralPotential} "
                f"with no decisive edge on hook or deadspace."
            )
            recommendation = (
                "Pick based on creative intent, or run a third cut that changes the opening beat to "
                "break the tie."
            )
        else:
            won = payload_a if winner == "A" else payload_b
            lost = payload_b if winner == "A" else payload_a
            winning_slices = slice_wins_a if winner == "A" else slice_wins_b
            abs_viral = abs(viral_delta)
            abs_hook = abs(hook_delta)

            # Pick the driver: viral gap first, then hook, then deadspace.
            if abs_viral >= 5:
                driver = (
                    f"Version {winner} leads on viral potential by {abs_viral} points "
                    f"({won.scores.viralPotential} vs {lost.scores.viralPotential})"
                )
            elif abs_hook >= 5:
                driver = (
                    f"Version {winner} wins on the opening hook by {abs_hook} points "
                    f"({won.scores.hookScore} vs {lost.scores.hookScore})"
                )
            else:
                won_deadspace = deadspace_a if winner == "A" else deadspace_b
                lost_deadspace = deadspace_b if winner == "A" else deadspace_a
                driver = (
                    f"Versions are close on score; {winner} wins on less deadspace "
                    f"({won_deadspace:.1f}s vs {lost_deadspace:.1f}s)"
                )

            if len(winning_slices) == 3:
                slice_note = "It takes all three slices: opening, middle, and ending."
            elif len(winning_slices) == 2:
                slice_note = f"It wins the {winning_slices[0].lower()} and {winning_slices[1].lower()}."
            elif len(winning_slices) == 1:
                slice_note = f"The edge comes from the {winning_slices[0].lower()}."
            else:
                slice_note = "No single slice carries it — the win is on aggregate heuristics."

            reason = f"{driver}. {slice_note}"

            if winner == "A":
                recommendation = (
                    f"Use A as the base cut. If B has a stronger "
                    f"{'ending' if 'Ending' in slice_wins_b else 'middle' if 'Middle' in slice_wins_b else 'moment'}, "
                    f"borrow it; otherwise ship A."
                )
            else:
                recommendation = (
                    f"Use B as the base cut. Pull A's best beat in only if it's materially stronger "
                    f"than what B already has."
                )

        summary: list[str] = [
            f"Viral potential: A {payload_a.scores.viralPotential} vs B {payload_b.scores.viralPotential} "
            f"(Δ {viral_delta:+d}).",
            f"Hook: A {payload_a.scores.hookScore} vs B {payload_b.scores.hookScore} (Δ {hook_delta:+d}).",
            f"Pacing: A {payload_a.scores.pacingScore} vs B {payload_b.scores.pacingScore} (Δ {pacing_delta:+d}).",
            f"Deadspace: A {deadspace_a:.1f}s vs B {deadspace_b:.1f}s.",
        ]
        for slice_ in slices:
            winner_text = "tie" if slice_.winner == "tie" else f"Version {slice_.winner}"
            summary.append(
                f"{slice_.label}: {winner_text} (A {slice_.aScore} vs B {slice_.bScore})."
            )
        return reason, recommendation, summary

    @staticmethod
    def _transcript_density(events: pd.DataFrame, windows: list[tuple[float, float]]) -> list[float]:
        if "type" not in events.columns or "start" not in events.columns:
            return [0.0 for _ in windows]
        words = events[events["type"] == "Word"]
        if words.empty:
            return [0.0 for _ in windows]
        densities = []
        for start, end in windows:
            in_window = words[(words["start"] >= start) & (words["start"] < end)]
            duration = max(end - start, 1e-6)
            densities.append(float(len(in_window) / duration))
        return AnalysisEngine._normalize_series(densities)

    @staticmethod
    def _brain_response_points(
        result: TribeRunResult,
        media_features: MediaFeatures,
    ) -> list[BrainResponsePoint]:
        preds = np.asarray(result.preds, dtype=np.float32)
        n_vertices = preds.shape[1]
        half = n_vertices // 2
        left = np.abs(preds[:, :half])
        right = np.abs(preds[:, half:])
        global_activation = AnalysisEngine._normalize_series(np.mean(np.abs(preds), axis=1))
        left_activation = AnalysisEngine._normalize_series(np.mean(left, axis=1))
        right_activation = AnalysisEngine._normalize_series(np.mean(right, axis=1))
        rolling_variance = AnalysisEngine._rolling_variance(global_activation)
        activation_delta = np.diff(np.asarray(global_activation), prepend=global_activation[0])
        spike_score = AnalysisEngine._normalize_series(np.maximum(activation_delta, 0.0))
        drop_score = AnalysisEngine._normalize_series(np.maximum(-activation_delta, 0.0))
        heatmaps = [
            HemisphereHeatmap(
                left=AnalysisEngine._bin_vertices(left[index], 64),
                right=AnalysisEngine._bin_vertices(right[index], 64),
            )
            for index in range(preds.shape[0])
        ]

        points: list[BrainResponsePoint] = []
        for index, segment in enumerate(result.segments):
            points.append(
                BrainResponsePoint(
                    stimulusTimeSec=max(round(segment.start - 5.0, 2), 0.0),
                    segmentStartSec=round(segment.start, 2),
                    segmentDurationSec=round(segment.duration, 2),
                    globalActivation=round(global_activation[index], 4),
                    leftHemisphereActivation=round(left_activation[index], 4),
                    rightHemisphereActivation=round(right_activation[index], 4),
                    rollingVariance=round(float(rolling_variance[index]), 4),
                    activationDelta=round(float(activation_delta[index]), 4),
                    spikeScore=round(spike_score[index], 4),
                    dropScore=round(drop_score[index], 4),
                    audioEnergy=round(media_features.audio_energy[index], 4),
                    motionScore=round(media_features.motion_scores[index], 4),
                    transcriptDensity=round(media_features.transcript_density[index], 4),
                    sceneChange=bool(media_features.scene_changes[index]),
                    silenceOverlap=bool(media_features.silence_overlap[index]),
                    hemisphereHeatmap=heatmaps[index],
                )
            )
        return points

    @staticmethod
    def _markers_and_cuts(points: list[BrainResponsePoint]) -> tuple[list[Marker], list[DeadspaceCut]]:
        markers: list[Marker] = []
        cuts: list[DeadspaceCut] = []
        if not points:
            return markers, cuts

        first_three = [
            point
            for point in points
            if point.stimulusTimeSec <= 3.0
        ]
        if first_three:
            strongest = max(
                first_three,
                key=lambda point: point.globalActivation + point.spikeScore,
            )
            if strongest.globalActivation >= 0.7 and (
                strongest.motionScore >= 0.45 or strongest.transcriptDensity >= 0.45
            ):
                markers.append(
                    Marker(
                        t=strongest.stimulusTimeSec,
                        type="strong_hook",
                        severity="high",
                        explanation=(
                            f"At {strongest.stimulusTimeSec:.1f}s the predicted response sits at "
                            f"{int(round(strongest.globalActivation * 100))}/100 with "
                            f"{'motion' if strongest.motionScore >= 0.45 else 'dialogue'} carrying it."
                        ),
                        suggestion="Keep this opening beat intact. Reinforce it with on-screen text or a faster first-frame reveal.",
                    )
                )

        for point in points:
            if point.activationDelta <= -0.25 and (
                point.motionScore <= 0.3 or point.audioEnergy <= 0.3
            ):
                reason_bit = (
                    "motion drops off"
                    if point.motionScore <= 0.3 and point.audioEnergy > 0.3
                    else "audio energy drops off"
                    if point.audioEnergy <= 0.3 and point.motionScore > 0.3
                    else "both motion and audio drop off"
                )
                markers.append(
                    Marker(
                        t=point.stimulusTimeSec,
                        type="attention_drop",
                        severity="medium",
                        explanation=(
                            f"At {point.stimulusTimeSec:.1f}s predicted attention falls sharply and {reason_bit}."
                        ),
                        suggestion="Tighten the pause, cut to a new shot, or land the next spoken beat sooner.",
                    )
                )
            if (
                point.globalActivation >= 0.78
                and point.spikeScore >= 0.55
                and (point.sceneChange or point.transcriptDensity >= 0.5)
            ):
                driver = "scene change" if point.sceneChange else "a tight burst of dialogue"
                markers.append(
                    Marker(
                        t=point.stimulusTimeSec,
                        type="high_rewatch_moment",
                        severity="medium",
                        explanation=(
                            f"{point.stimulusTimeSec:.1f}s spikes to "
                            f"{int(round(point.globalActivation * 100))}/100 on a {driver}."
                        ),
                        suggestion="Preserve this beat. It's a candidate for the thumbnail, teaser, or cold open.",
                    )
                )
            if point.audioEnergy <= 0.2 and point.dropScore >= 0.45:
                markers.append(
                    Marker(
                        t=point.stimulusTimeSec,
                        type="audio_energy_drop",
                        severity="low",
                        explanation=(
                            f"Audio energy collapses to {int(round(point.audioEnergy * 100))}/100 "
                            f"right after a more active moment."
                        ),
                        suggestion="Shorten the gap, add a music sting, or push the next line in faster.",
                    )
                )

        plateau_start = None
        for index, point in enumerate(points):
            is_flat = point.rollingVariance <= 0.12 and point.globalActivation <= 0.45
            if is_flat and plateau_start is None:
                plateau_start = index
            elif not is_flat and plateau_start is not None:
                AnalysisEngine._finalize_plateau(points, plateau_start, index - 1, markers)
                plateau_start = None
        if plateau_start is not None:
            AnalysisEngine._finalize_plateau(points, plateau_start, len(points) - 1, markers)

        # Pass 1: silence-based deadspace. Quiet + static + weakly activated.
        deadspace_start = None
        for index, point in enumerate(points):
            deadspace = (
                point.globalActivation <= 0.25
                and point.motionScore <= 0.25
                and (point.audioEnergy <= 0.25 or point.silenceOverlap)
            )
            if deadspace and deadspace_start is None:
                deadspace_start = index
            elif not deadspace and deadspace_start is not None:
                AnalysisEngine._finalize_deadspace(points, deadspace_start, index - 1, markers, cuts)
                deadspace_start = None
        if deadspace_start is not None:
            AnalysisEngine._finalize_deadspace(points, deadspace_start, len(points) - 1, markers, cuts)

        # Pass 2: low-quality content. Audio may be present but the stretch is
        # monotone and visually flat — think a talking head that drones without
        # variation over a static shot. We require a longer run (>=1.5s) and a
        # strict rolling-variance floor so this doesn't fire on every mid-range
        # second. We also skip any range that overlaps an existing silence cut
        # to avoid double-flagging the same stretch.
        low_quality_start = None
        for index, point in enumerate(points):
            is_low_quality = (
                point.rollingVariance <= 0.10
                and point.globalActivation <= 0.35
                and point.motionScore <= 0.25
                and not point.silenceOverlap
            )
            if is_low_quality and low_quality_start is None:
                low_quality_start = index
            elif not is_low_quality and low_quality_start is not None:
                AnalysisEngine._finalize_low_quality(
                    points, low_quality_start, index - 1, markers, cuts
                )
                low_quality_start = None
        if low_quality_start is not None:
            AnalysisEngine._finalize_low_quality(
                points, low_quality_start, len(points) - 1, markers, cuts
            )

        # Merge/dedupe cuts so pass 1 and pass 2 don't overlap in the output.
        cuts = AnalysisEngine._dedupe_cuts(cuts)

        deduped = []
        seen = set()
        for marker in sorted(markers, key=lambda marker: (marker.t, marker.type)):
            key = (round(marker.t, 1), marker.type)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(marker)
        return deduped[:12], cuts[:6]

    @staticmethod
    def _finalize_plateau(
        points: list[BrainResponsePoint],
        start_index: int,
        end_index: int,
        markers: list[Marker],
    ) -> None:
        start = points[start_index]
        end = points[end_index]
        span = end.segmentStartSec + end.segmentDurationSec - start.segmentStartSec
        if span < 2.0:
            return
        markers.append(
            Marker(
                t=start.stimulusTimeSec,
                type="pacing_issue",
                severity="medium",
                explanation=(
                    f"From {start.stimulusTimeSec:.1f}s the response stays flat for about {span:.1f}s "
                    f"with little motion or structural change."
                ),
                suggestion="Compress this stretch, insert a cut-away, or push a harder transition.",
            )
        )

    @staticmethod
    def _finalize_deadspace(
        points: list[BrainResponsePoint],
        start_index: int,
        end_index: int,
        markers: list[Marker],
        cuts: list[DeadspaceCut],
    ) -> None:
        start_point = points[start_index]
        end_point = points[end_index]
        start = start_point.stimulusTimeSec
        end = end_point.stimulusTimeSec + end_point.segmentDurationSec
        span = end - start
        # Minimum run length: don't flag sub-0.75s breath gaps.
        if span < 0.75:
            return
        markers.append(
            Marker(
                t=start,
                type="deadspace_candidate",
                severity="high" if span >= 1.2 else "medium",
                explanation=(
                    f"{start:.1f}–{end:.1f}s reads as quiet, low-motion, and weakly activated "
                    f"for {span:.1f}s — long enough to feel skippable."
                ),
                suggestion=f"Cut this {span:.1f}s stretch or replace it with a faster transition.",
            )
        )
        cuts.append(
            DeadspaceCut(
                start=round(start, 2),
                end=round(end, 2),
                reason=(
                    f"Silent gap: {span:.1f}s of low audio, low motion, and weak predicted response."
                ),
            )
        )

    @staticmethod
    def _finalize_low_quality(
        points: list[BrainResponsePoint],
        start_index: int,
        end_index: int,
        markers: list[Marker],
        cuts: list[DeadspaceCut],
    ) -> None:
        """Flag a stretch as low-quality content: audible but monotone and visually static.

        Distinct from the silence-based deadspace detector: this fires on talking
        heads that drone without variation, long b-roll without narrative payoff,
        or any audible stretch where the predicted response and motion both stay
        flat for long enough to feel skippable.

        Requires a minimum 1.5s run so single sleepy segments don't trigger it.
        """
        start_point = points[start_index]
        end_point = points[end_index]
        start = start_point.stimulusTimeSec
        end = end_point.stimulusTimeSec + end_point.segmentDurationSec
        span = end - start
        if span < 1.5:
            return
        markers.append(
            Marker(
                t=start,
                type="deadspace_candidate",
                severity="high" if span >= 2.5 else "medium",
                explanation=(
                    f"{start:.1f}–{end:.1f}s is audible but monotone — predicted response and "
                    f"motion both stay flat for {span:.1f}s."
                ),
                suggestion=(
                    f"Tighten this {span:.1f}s stretch: cut away, change the shot, or drop the "
                    f"weakest line entirely."
                ),
            )
        )
        cuts.append(
            DeadspaceCut(
                start=round(start, 2),
                end=round(end, 2),
                reason=(
                    f"Low-quality stretch: {span:.1f}s of monotone audio with flat response and little motion."
                ),
            )
        )

    @staticmethod
    def _dedupe_cuts(cuts: list[DeadspaceCut]) -> list[DeadspaceCut]:
        """Merge overlapping/adjacent cuts so the two passes don't double-cover a stretch.

        When two ranges overlap or touch, keep the union and prefer the reason
        string of the longer contributing range (more informative).
        """
        if not cuts:
            return []
        ordered = sorted(cuts, key=lambda cut: (cut.start, cut.end))
        merged: list[DeadspaceCut] = [ordered[0]]
        for cut in ordered[1:]:
            last = merged[-1]
            # Treat a gap of <=0.1s as touching — ffmpeg will smooth it anyway.
            if cut.start <= last.end + 0.1:
                new_start = min(last.start, cut.start)
                new_end = max(last.end, cut.end)
                # Keep the reason from whichever input covered more ground.
                if (cut.end - cut.start) > (last.end - last.start):
                    reason = cut.reason
                else:
                    reason = last.reason
                merged[-1] = DeadspaceCut(
                    start=round(new_start, 2),
                    end=round(new_end, 2),
                    reason=reason,
                )
            else:
                merged.append(cut)
        return merged

    @staticmethod
    def _scores(
        points: list[BrainResponsePoint],
        cuts: list[DeadspaceCut],
        duration_sec: float,
    ) -> ScoreSet:
        if not points:
            return ScoreSet(
                hookScore=0,
                pacingScore=0,
                retentionEstimate=0,
                viralPotential=0,
                confidence="low",
                helpingFactors=["No signal windows were produced for this clip."],
                hurtingFactors=["The clip did not generate enough usable analysis windows."],
            )
        first_three = [point for point in points if point.stimulusTimeSec <= 3.0]
        hook_score = int(round(
            100
            * np.mean([
                np.mean([point.globalActivation for point in first_three]) if first_three else 0.0,
                np.mean([point.spikeScore for point in first_three]) if first_three else 0.0,
                np.mean([point.motionScore for point in first_three]) if first_three else 0.0,
                np.mean([point.transcriptDensity for point in first_three]) if first_three else 0.0,
            ])
        ))
        activation_consistency = max(
            0.0,
            1.0 - float(np.std([point.globalActivation for point in points])) * 1.35,
        )
        pacing_score = int(round(
            100
            * np.mean([
                activation_consistency,
                1.0 - float(np.mean([point.rollingVariance <= 0.12 for point in points])) * 0.8,
                float(np.mean([point.sceneChange for point in points])) * 0.6 + 0.2,
            ])
        ))
        deadspace_seconds = sum(cut.end - cut.start for cut in cuts)
        deadspace_penalty = np.clip(deadspace_seconds / max(duration_sec, 1.0), 0.0, 1.0)
        scene_cadence = np.clip(float(np.mean([point.sceneChange for point in points])) * 1.6, 0.0, 1.0)
        audio_dynamics = np.clip(float(np.mean([point.audioEnergy for point in points])) * 1.2, 0.0, 1.0)
        transcript_density = np.clip(float(np.mean([point.transcriptDensity for point in points])) * 1.1, 0.0, 1.0)
        viral = int(round(
            25 * (hook_score / 100)
            + 20 * activation_consistency
            + 15 * (pacing_score / 100)
            + 15 * (1 - deadspace_penalty)
            + 10 * scene_cadence
            + 10 * audio_dynamics
            + 5 * transcript_density
        ))
        retention = int(round(np.mean([hook_score, pacing_score, viral])))
        confidence: ConfidenceBand
        if len(points) >= 8 and transcript_density >= 0.3 and audio_dynamics >= 0.3:
            confidence = "high"
        elif len(points) >= 4:
            confidence = "medium"
        else:
            confidence = "low"

        helping_factors = []
        hurting_factors = []
        if hook_score >= 70:
            helping_factors.append("Strong first-three-second hook")
        if pacing_score >= 65:
            helping_factors.append("Pacing stays relatively active")
        if scene_cadence >= 0.55:
            helping_factors.append("Scene changes arrive often enough to refresh attention")
        if deadspace_penalty >= 0.2:
            hurting_factors.append("Too much likely deadspace")
        if audio_dynamics <= 0.35:
            hurting_factors.append("Audio energy stays too flat")
        if transcript_density <= 0.2:
            hurting_factors.append("Transcript density is light, reducing verbal momentum")
        if not helping_factors:
            helping_factors.append("Mid-clip activation peaks provide salvageable moments")
        if not hurting_factors:
            hurting_factors.append("No major drag signal, but the score is still heuristic")

        return ScoreSet(
            hookScore=int(np.clip(hook_score, 0, 100)),
            pacingScore=int(np.clip(pacing_score, 0, 100)),
            retentionEstimate=int(np.clip(retention, 0, 100)),
            viralPotential=int(np.clip(viral, 0, 100)),
            confidence=confidence,
            helpingFactors=helping_factors[:3],
            hurtingFactors=hurting_factors[:3],
        )

    @staticmethod
    def _summary(
        points: list[BrainResponsePoint],
        markers: list[Marker],
        cuts: list[DeadspaceCut],
        scores: ScoreSet,
    ) -> AnalysisSummary:
        strengths = []
        weaknesses = []
        if scores.hookScore >= 70:
            strengths.append("The opening reads as a strong hook across activation and pace signals.")
        if any(marker.type == "high_rewatch_moment" for marker in markers):
            strengths.append("There is at least one standout replay-worthy moment worth preserving.")
        if scores.pacingScore >= 65:
            strengths.append("Overall pacing is reasonably stable for a short-form cut.")
        if cuts:
            weaknesses.append(
                f"About {round(sum(cut.end - cut.start for cut in cuts), 1)}s looks skippable and is a trim candidate."
            )
        if scores.hurtingFactors:
            weaknesses.extend(scores.hurtingFactors[:2])
        recommendation = (
            "Trim the largest deadspace range, keep the strongest early spike, and tighten any low-audio plateau."
            if cuts
            else "Preserve the opening spike and consider sharpening the weakest transition to lift the overall score."
        )
        return AnalysisSummary(
            strengths=strengths[:3] or ["The clip has usable activation peaks that can anchor an edit."],
            weaknesses=weaknesses[:3] or ["No obvious deadspace, but the score remains heuristic rather than predictive."],
            overallRecommendation=recommendation,
        )

    @staticmethod
    def _warnings(
        video: VideoAsset,
        result: TribeRunResult,
        cuts: list[DeadspaceCut],
    ) -> list[str]:
        warnings = []
        if video.durationSec > 45:
            warnings.append("Longer clips run slower locally, especially on CPU or Apple Silicon.")
        if result.preds.shape[0] < 4:
            warnings.append("Very short clips produce sparse signal windows, so heuristics are lower confidence.")
        if not cuts:
            warnings.append("No deadspace range crossed the deterministic trim threshold.")
        return warnings

    @staticmethod
    def _slice_comparison(
        payload_a: AnalysisPayload,
        payload_b: AnalysisPayload,
    ) -> list[CompareSlice]:
        slices = []
        for label, lower, upper in (
            ("Opening", 0.0, 0.25),
            ("Middle", 0.25, 0.75),
            ("Ending", 0.75, 1.01),
        ):
            a_score = AnalysisEngine._slice_score(payload_a, lower, upper)
            b_score = AnalysisEngine._slice_score(payload_b, lower, upper)
            if a_score == b_score:
                winner = "tie"
            else:
                winner = "A" if a_score > b_score else "B"
            slices.append(
                CompareSlice(label=label, winner=winner, aScore=a_score, bScore=b_score)
            )
        return slices

    @staticmethod
    def _slice_score(payload: AnalysisPayload, lower: float, upper: float) -> int:
        duration = max(payload.video.durationSec, 1.0)
        candidates = [
            point.globalActivation + 0.6 * point.spikeScore + 0.3 * point.motionScore
            for point in payload.brainResponse.timeSeries
            if lower <= point.segmentStartSec / duration < upper
        ]
        if not candidates:
            return 0
        return int(round(np.mean(candidates) * 100))

    @staticmethod
    def _winner(payload_a: AnalysisPayload, payload_b: AnalysisPayload) -> str:
        primary = payload_a.scores.viralPotential - payload_b.scores.viralPotential
        if primary:
            return "A" if primary > 0 else "B"
        hook_delta = payload_a.scores.hookScore - payload_b.scores.hookScore
        if hook_delta:
            return "A" if hook_delta > 0 else "B"
        deadspace_a = sum(cut.end - cut.start for cut in payload_a.deadspaceCuts)
        deadspace_b = sum(cut.end - cut.start for cut in payload_b.deadspaceCuts)
        if deadspace_a != deadspace_b:
            return "A" if deadspace_a < deadspace_b else "B"
        return "tie"

    @staticmethod
    def _normalize_series(values: list[float] | np.ndarray) -> list[float]:
        array = np.asarray(values, dtype=np.float32)
        if array.size == 0:
            return []
        low = float(np.percentile(array, 5))
        high = float(np.percentile(array, 95))
        if np.isclose(high, low):
            return [0.0 for _ in array]
        normalized = np.clip((array - low) / (high - low), 0.0, 1.0)
        return normalized.astype(float).tolist()

    @staticmethod
    def _rolling_variance(values: list[float]) -> list[float]:
        output = []
        for index in range(len(values)):
            start = max(index - 1, 0)
            end = min(index + 2, len(values))
            output.append(float(np.var(values[start:end])))
        return AnalysisEngine._normalize_series(output)

    @staticmethod
    def _bin_vertices(values: np.ndarray, bins: int) -> list[float]:
        chunks = np.array_split(values, bins)
        return [
            round(float(np.mean(chunk)), 4) if chunk.size else 0.0
            for chunk in chunks
        ]
