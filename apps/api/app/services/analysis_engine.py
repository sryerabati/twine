from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.models.contracts import (
    AnalysisPayload,
    AnalysisSummary,
    ActionBoard,
    ArtifactLinks,
    BrainResponsePayload,
    BrainResponsePoint,
    CompareResponse,
    CompareSlice,
    ConfidenceBand,
    DeadspaceCut,
    Diagnostics,
    ExportArtifact,
    HemisphereHeatmap,
    Marker,
    MeshInfo,
    ScoreSet,
    TimelineSegment,
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
    preds: np.ndarray | None
    provider_raw: dict[str, Any] | None = None


@dataclass
class EditorClipPlan:
    cut_plan: list[DeadspaceCut]
    default_cuts: list[DeadspaceCut]
    transcript_word_count: int


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
        if result.proxyAnalysis is not None:
            return self._build_proxy_payload(
                analysis_id=analysis_id,
                video=video,
                result=result,
            )

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
        low_value_cuts = self._low_value_cuts(points, markers, cuts)
        cut_plan = sorted([*cuts, *low_value_cuts], key=lambda cut: (cut.start, cut.end))
        scores = self._scores(points, cuts, video.durationSec)
        summary = self._summary(points, markers, cuts, scores)
        action_board = self._action_board(summary, scores, cuts, low_value_cuts)
        timeline_segments = self._timeline_segments(points, markers, cut_plan)
        artifacts = ArtifactLinks(
            **self.storage.artifacts_for(
                analysis_id,
                include_raw_predictions=result.provider == "tribe",
                include_provider_raw=bool(result.providerRaw),
            )
        )
        diagnostics = Diagnostics(
            device=result.device,
            modelRepo=result.modelRepo,
            modelCommit=result.modelCommit,
            transcriptWordCount=int((result.events["type"] == "Word").sum())
            if "type" in result.events
            else 0,
            sceneChangeCount=media_features.scene_change_count,
            deadspaceSeconds=round(
                sum(cut.end - cut.start for cut in cuts),
                2,
            ),
            warnings=[*self._warnings(video, result, cuts), *result.warnings],
        )
        payload = AnalysisPayload(
            analysisId=analysis_id,
            video=video,
            brainResponse=BrainResponsePayload(
                timeSeries=points,
                meshInfo=MeshInfo(totalVertices=int(result.preds.shape[1]) if result.preds is not None else 0),
            ),
            markers=markers,
            deadspaceCuts=cuts,
            lowValueCuts=low_value_cuts,
            cutPlan=cut_plan,
            actionBoard=action_board,
            timelineSegments=timeline_segments,
            exports=[],
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
            provider_raw=result.providerRaw,
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
        low_value_cuts = self._low_value_cuts(points, markers, cuts)
        cut_plan = sorted([*cuts, *low_value_cuts], key=lambda cut: (cut.start, cut.end))
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
            lowValueCuts=low_value_cuts,
            cutPlan=cut_plan,
            actionBoard=self._action_board(summary, scores, cuts, low_value_cuts),
            timelineSegments=self._timeline_segments(points, markers, cut_plan),
            exports=[],
            scores=scores,
            summary=summary,
            artifacts=artifacts,
            diagnostics=Diagnostics(
                device=result.device,
                modelRepo=result.modelRepo,
                modelCommit=result.modelCommit,
                transcriptWordCount=int((result.events["type"] == "Word").sum())
                if "type" in result.events
                else 0,
                sceneChangeCount=media_features.scene_change_count,
                deadspaceSeconds=round(sum(cut.end - cut.start for cut in cuts), 2),
                warnings=[*self._warnings(video, result, cuts), *result.warnings],
            ),
        )

    def build_editor_clip_plan(
        self,
        *,
        source_path: Path,
        result: TribeRunResult,
    ) -> EditorClipPlan:
        if result.proxyAnalysis is not None:
            cuts = self._normalize_proxy_cuts(result.proxyAnalysis.get("deadspaceCuts", []), "deadspace")
            low_value_cuts = self._normalize_proxy_cuts(result.proxyAnalysis.get("lowValueCuts", []), "low_value")
        else:
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
            low_value_cuts = self._low_value_cuts(points, markers, cuts)

        cut_plan = sorted([*cuts, *low_value_cuts], key=lambda cut: (cut.start, cut.end))
        default_cuts = [cut for cut in cut_plan if cut.type == "deadspace" and cut.defaultSelected]
        if not default_cuts:
            default_cuts = [cut for cut in cut_plan if cut.type == "deadspace"]
        transcript_word_count = int((result.events["type"] == "Word").sum()) if "type" in result.events else 0
        return EditorClipPlan(
            cut_plan=cut_plan,
            default_cuts=default_cuts,
            transcript_word_count=transcript_word_count,
        )

    def build_editor_clip_plan_from_speech(
        self,
        *,
        source_path: Path,
        duration_sec: float,
        speech_segments: list[tuple[float, float, str]],
    ) -> EditorClipPlan:
        windows = self._editor_windows(duration_sec)
        transcript_density = self._transcript_density_from_speech_segments(
            speech_segments,
            windows,
        )
        media_features = self.media.analyze_media(
            source_path=source_path,
            windows=windows,
            transcript_density=transcript_density,
        )
        points = self._editor_points_from_media_features(windows, media_features)
        markers, cuts = self._markers_and_cuts(points)
        low_value_cuts = self._low_value_cuts(points, markers, cuts)
        cut_plan = sorted([*cuts, *low_value_cuts], key=lambda cut: (cut.start, cut.end))
        default_cuts = [cut for cut in cut_plan if cut.type == "deadspace" and cut.defaultSelected]
        if not default_cuts:
            default_cuts = [cut for cut in cut_plan if cut.type == "deadspace"]
        return EditorClipPlan(
            cut_plan=cut_plan,
            default_cuts=default_cuts,
            transcript_word_count=self._speech_segment_word_count(speech_segments),
        )

    def _build_proxy_payload(
        self,
        *,
        analysis_id: str,
        video: VideoAsset,
        result: TribeRunResult,
    ) -> AnalysisArtifacts:
        proxy = result.proxyAnalysis or {}
        timeline = proxy.get("timeline", [])
        points = self._points_from_proxy_timeline(timeline)
        markers = [
            Marker(
                t=round(float(marker["t"]), 2),
                type=marker["type"],
                severity=marker["severity"],
                explanation=str(marker["explanation"]),
                suggestion=str(marker["suggestion"]),
            )
            for marker in proxy.get("markers", [])
        ]
        cuts = self._normalize_proxy_cuts(proxy.get("deadspaceCuts", []), "deadspace")
        low_value_cuts = self._normalize_proxy_cuts(proxy.get("lowValueCuts", []), "low_value")
        if not low_value_cuts:
            low_value_cuts = self._low_value_cuts(points, markers, cuts)
        cut_plan = sorted([*cuts, *low_value_cuts], key=lambda cut: (cut.start, cut.end))
        score_payload = proxy["scores"]
        summary_payload = proxy["summary"]
        summary = AnalysisSummary(
            strengths=[str(item) for item in summary_payload.get("strengths", [])],
            weaknesses=[str(item) for item in summary_payload.get("weaknesses", [])],
            overallRecommendation=str(summary_payload["overallRecommendation"]),
        )
        scores = ScoreSet(
            hookScore=int(score_payload["hookScore"]),
            pacingScore=int(score_payload["pacingScore"]),
            retentionEstimate=int(score_payload["retentionEstimate"]),
            viralPotential=int(score_payload["viralPotential"]),
            confidence=score_payload["confidence"],
            helpingFactors=[str(item) for item in score_payload.get("helpingFactors", [])],
            hurtingFactors=[str(item) for item in score_payload.get("hurtingFactors", [])],
        )
        payload = AnalysisPayload(
            analysisId=analysis_id,
            video=video,
            brainResponse=BrainResponsePayload(
                timeSeries=points,
                meshInfo=MeshInfo(
                    space="content-analysis",
                    subject="proxy",
                    lagCompensationSec=0.0,
                    totalVertices=int(result.preds.shape[1]) if result.preds is not None else 128,
                ),
            ),
            markers=markers,
            deadspaceCuts=cuts,
            lowValueCuts=low_value_cuts,
            cutPlan=cut_plan,
            actionBoard=self._action_board_from_proxy(proxy.get("actionBoard"), summary, scores, cuts, low_value_cuts),
            timelineSegments=self._timeline_segments_from_proxy(proxy.get("timelineSegments"), points, markers, cut_plan),
            exports=[],
            scores=scores,
            summary=summary,
            artifacts=ArtifactLinks(
                **self.storage.artifacts_for(
                    analysis_id,
                    include_raw_predictions=False,
                    include_provider_raw=bool(result.providerRaw),
                )
            ),
            diagnostics=Diagnostics(
                device=result.device,
                modelRepo=result.modelRepo,
                modelCommit=result.modelCommit,
                transcriptWordCount=0,
                sceneChangeCount=sum(1 for point in points if point.sceneChange),
                deadspaceSeconds=round(sum(cut.end - cut.start for cut in cuts), 2),
                warnings=[
                    *[str(item) for item in proxy.get("warnings", [])],
                    *result.warnings,
                ],
            ),
        )
        segments_json = [
            {
                "start": round(float(window["startSec"]), 2),
                "duration": round(float(window["endSec"]) - float(window["startSec"]), 2),
                "nsEventCount": 0,
            }
            for window in timeline
        ]
        events_csv = result.events.to_csv(index=False) if not result.events.empty else "type,start,label\n"
        return AnalysisArtifacts(
            payload=payload,
            events_csv=events_csv,
            segments_json=segments_json,
            preds=None,
            provider_raw=result.providerRaw,
        )

    def compare(self, payload_a: AnalysisPayload, payload_b: AnalysisPayload) -> CompareResponse:
        slices = self._slice_comparison(payload_a, payload_b)
        winner = self._winner(payload_a, payload_b)
        if winner == "tie":
            reason = "Both versions are effectively tied on the current heuristic stack."
            recommendation = "Choose based on creative intent or run another cut with a stronger opening change."
        elif winner == "A":
            reason = "Version A wins on the weighted heuristic stack, led by hook strength and fewer weak stretches."
            recommendation = "Use A as the base cut and borrow any stronger closing beat from B if needed."
        else:
            reason = "Version B wins on the weighted heuristic stack, led by stronger hook or pacing stability."
            recommendation = "Use B as the base cut and borrow A's best early beat only if you need more contrast."
        summary = [
            f"A viral potential: {payload_a.scores.viralPotential}",
            f"B viral potential: {payload_b.scores.viralPotential}",
            f"A deadspace seconds: {round(sum(c.end - c.start for c in payload_a.deadspaceCuts), 2)}",
            f"B deadspace seconds: {round(sum(c.end - c.start for c in payload_b.deadspaceCuts), 2)}",
        ]
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
    def _transcript_density_from_speech_segments(
        speech_segments: list[tuple[float, float, str]],
        windows: list[tuple[float, float]],
    ) -> list[float]:
        if not speech_segments:
            return [0.0 for _ in windows]
        densities: list[float] = []
        for start, end in windows:
            duration = max(end - start, 1e-6)
            speech_overlap = 0.0
            weighted_words = 0.0
            for segment_start, segment_end, text in speech_segments:
                overlap = max(0.0, min(end, segment_end) - max(start, segment_start))
                if overlap <= 0:
                    continue
                speech_overlap += overlap
                segment_duration = max(segment_end - segment_start, 1e-6)
                words_per_second = max(len(text.split()), 1) / segment_duration
                weighted_words += overlap * words_per_second
            speech_ratio = min(speech_overlap / duration, 1.0)
            word_rate = min((weighted_words / duration) / 3.5, 1.0)
            densities.append(float(np.clip(0.55 * speech_ratio + 0.45 * word_rate, 0.0, 1.0)))
        return densities

    @staticmethod
    def _speech_segment_word_count(speech_segments: list[tuple[float, float, str]]) -> int:
        return sum(len(text.split()) for _, _, text in speech_segments)

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
    def _editor_points_from_media_features(
        windows: list[tuple[float, float]],
        media_features: MediaFeatures,
    ) -> list[BrainResponsePoint]:
        if not windows:
            return []
        global_activation = [
            float(
                np.clip(
                    0.5 * media_features.transcript_density[index]
                    + 0.25 * media_features.audio_energy[index]
                    + 0.2 * media_features.motion_scores[index]
                    + 0.05 * float(media_features.scene_changes[index])
                    - (0.18 if media_features.silence_overlap[index] else 0.0),
                    0.0,
                    1.0,
                )
            )
            for index in range(len(windows))
        ]
        left_activation = [
            float(np.clip(0.7 * global_activation[index] + 0.3 * media_features.motion_scores[index], 0.0, 1.0))
            for index in range(len(windows))
        ]
        right_activation = [
            float(np.clip(0.7 * global_activation[index] + 0.3 * media_features.audio_energy[index], 0.0, 1.0))
            for index in range(len(windows))
        ]
        rolling_variance = AnalysisEngine._rolling_variance(global_activation)
        activation_delta = np.diff(np.asarray(global_activation), prepend=global_activation[0])
        spike_score = AnalysisEngine._normalize_series(np.maximum(activation_delta, 0.0))
        drop_score = AnalysisEngine._normalize_series(np.maximum(-activation_delta, 0.0))

        points: list[BrainResponsePoint] = []
        for index, (start, end) in enumerate(windows):
            activation = round(global_activation[index], 4)
            points.append(
                BrainResponsePoint(
                    stimulusTimeSec=round(start, 2),
                    segmentStartSec=round(start, 2),
                    segmentDurationSec=round(max(end - start, 0.1), 2),
                    globalActivation=activation,
                    leftHemisphereActivation=round(left_activation[index], 4),
                    rightHemisphereActivation=round(right_activation[index], 4),
                    rollingVariance=round(float(rolling_variance[index]), 4),
                    activationDelta=round(float(activation_delta[index]), 4),
                    spikeScore=round(float(spike_score[index]), 4),
                    dropScore=round(float(drop_score[index]), 4),
                    audioEnergy=round(media_features.audio_energy[index], 4),
                    motionScore=round(media_features.motion_scores[index], 4),
                    transcriptDensity=round(media_features.transcript_density[index], 4),
                    sceneChange=bool(media_features.scene_changes[index]),
                    silenceOverlap=bool(media_features.silence_overlap[index]),
                    hemisphereHeatmap=HemisphereHeatmap(
                        left=[round(left_activation[index], 4) for _ in range(64)],
                        right=[round(right_activation[index], 4) for _ in range(64)],
                    ),
                )
            )
        return points

    @staticmethod
    def _editor_windows(duration_sec: float) -> list[tuple[float, float]]:
        if duration_sec <= 0:
            return [(0.0, 0.1)]
        window_duration = min(max(duration_sec / 12.0, 0.6), 1.4)
        windows: list[tuple[float, float]] = []
        cursor = 0.0
        while cursor < duration_sec - 0.05:
            end = min(duration_sec, cursor + window_duration)
            windows.append((round(cursor, 2), round(end, 2)))
            cursor = end
        return windows or [(0.0, round(duration_sec, 2))]

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
                        explanation="Early activation is strong and supported by either motion or transcript density.",
                        suggestion="Keep this opening beat intact and consider emphasizing it with text or a quicker first-frame reveal.",
                    )
                )

        for point in points:
            if point.activationDelta <= -0.25 and (
                point.motionScore <= 0.3 or point.audioEnergy <= 0.3
            ):
                markers.append(
                    Marker(
                        t=point.stimulusTimeSec,
                        type="attention_drop",
                        severity="medium",
                        explanation="Predicted activation falls sharply while motion or audio energy stays low.",
                        suggestion="Trim the pause, add a visual change, or tighten the spoken beat here.",
                    )
                )
            if (
                point.globalActivation >= 0.78
                and point.spikeScore >= 0.55
                and (point.sceneChange or point.transcriptDensity >= 0.5)
            ):
                markers.append(
                    Marker(
                        t=point.stimulusTimeSec,
                        type="high_rewatch_moment",
                        severity="medium",
                        explanation="This moment spikes strongly and coincides with a scene change or transcript burst.",
                        suggestion="Preserve this beat and consider using it in thumbnails, teasers, or cold opens.",
                    )
                )
            if point.audioEnergy <= 0.2 and point.dropScore >= 0.45:
                markers.append(
                    Marker(
                        t=point.stimulusTimeSec,
                        type="audio_energy_drop",
                        severity="low",
                        explanation="Audio energy drops materially after a more active moment.",
                        suggestion="Tighten the silence or add music, emphasis, or a faster spoken pickup.",
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
    def _low_value_cuts(
        points: list[BrainResponsePoint],
        markers: list[Marker],
        deadspace_cuts: list[DeadspaceCut],
    ) -> list[DeadspaceCut]:
        suggestions: list[DeadspaceCut] = []
        deadspace_ranges = [(cut.start, cut.end) for cut in deadspace_cuts]
        for marker in markers:
            if marker.type not in {"attention_drop", "pacing_issue", "audio_energy_drop"}:
                continue
            point = AnalysisEngine._closest_point(points, marker.t)
            if point is None:
                continue
            start = round(point.segmentStartSec, 2)
            end = round(point.segmentStartSec + max(point.segmentDurationSec, 0.8), 2)
            if any(AnalysisEngine._ranges_overlap((start, end), existing) for existing in deadspace_ranges):
                continue
            if any(AnalysisEngine._ranges_overlap((start, end), (cut.start, cut.end)) for cut in suggestions):
                continue
            suggestions.append(
                DeadspaceCut(
                    id=f"low-value-{len(suggestions) + 1}",
                    type="low_value",
                    start=start,
                    end=end,
                    reason=marker.explanation,
                    defaultSelected=False,
                    recommendedAction=marker.suggestion,
                )
            )
        if not suggestions:
            for point in points:
                start = round(point.segmentStartSec, 2)
                end = round(point.segmentStartSec + max(point.segmentDurationSec, 0.8), 2)
                if any(AnalysisEngine._ranges_overlap((start, end), existing) for existing in deadspace_ranges):
                    continue
                if point.globalActivation > 0.45 or point.transcriptDensity > 0.35:
                    continue
                suggestions.append(
                    DeadspaceCut(
                        id="low-value-1",
                        type="low_value",
                        start=start,
                        end=end,
                        reason="This beat stays comparatively weak without adding much motion, speech density, or payoff.",
                        defaultSelected=False,
                        recommendedAction="Optionally remove or compress this segment if you want a tighter export.",
                    )
                )
                break
        return suggestions[:4]

    @staticmethod
    def _points_from_proxy_timeline(timeline: list[dict[str, Any]]) -> list[BrainResponsePoint]:
        if not timeline:
            return []
        activations = [float(window["globalActivation"]) for window in timeline]
        rolling_variance = AnalysisEngine._rolling_variance(activations)
        activation_delta = np.diff(np.asarray(activations), prepend=activations[0])
        spike_score = AnalysisEngine._normalize_series(np.maximum(activation_delta, 0.0))
        drop_score = AnalysisEngine._normalize_series(np.maximum(-activation_delta, 0.0))

        points: list[BrainResponsePoint] = []
        for index, window in enumerate(timeline):
            start = float(window["startSec"])
            end = float(window["endSec"])
            activation = max(0.0, min(float(window["globalActivation"]), 1.0))
            points.append(
                BrainResponsePoint(
                    stimulusTimeSec=round(start, 2),
                    segmentStartSec=round(start, 2),
                    segmentDurationSec=round(max(end - start, 0.1), 2),
                    globalActivation=round(activation, 4),
                    leftHemisphereActivation=round(activation, 4),
                    rightHemisphereActivation=round(activation, 4),
                    rollingVariance=round(float(rolling_variance[index]), 4),
                    activationDelta=round(float(activation_delta[index]), 4),
                    spikeScore=round(float(spike_score[index]), 4),
                    dropScore=round(float(drop_score[index]), 4),
                    audioEnergy=round(float(window["audioEnergy"]), 4),
                    motionScore=round(float(window["motionScore"]), 4),
                    transcriptDensity=round(float(window["transcriptDensity"]), 4),
                    sceneChange=bool(window["sceneChange"]),
                    silenceOverlap=bool(window["silenceOverlap"]),
                    hemisphereHeatmap=HemisphereHeatmap(
                        left=[round(activation, 4) for _ in range(64)],
                        right=[round(activation, 4) for _ in range(64)],
                    ),
                )
            )
        return points

    @staticmethod
    def _finalize_plateau(
        points: list[BrainResponsePoint],
        start_index: int,
        end_index: int,
        markers: list[Marker],
    ) -> None:
        start = points[start_index]
        end = points[end_index]
        if end.segmentStartSec + end.segmentDurationSec - start.segmentStartSec < 2.0:
            return
        markers.append(
            Marker(
                t=start.stimulusTimeSec,
                type="pacing_issue",
                severity="medium",
                explanation="Activation stays flat for too long without enough motion or structural change.",
                suggestion="Compress this stretch or add a sharper visual or narrative transition.",
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
        if end - start < 0.75:
            return
        markers.append(
            Marker(
                t=start,
                type="deadspace_candidate",
                severity="high" if end - start >= 1.2 else "medium",
                explanation="This stretch is quiet, low-motion, and weakly activated for long enough to feel skippable.",
                suggestion=f"Consider cutting roughly {round(end - start, 1)}s or replacing it with a faster transition.",
            )
        )
        cuts.append(
            DeadspaceCut(
                id=f"deadspace-{len(cuts) + 1}",
                type="deadspace",
                start=round(start, 2),
                end=round(end, 2),
                reason="Likely deadspace from low activation, low motion, and low audio energy.",
                defaultSelected=True,
                recommendedAction=f"Cut roughly {round(end - start, 1)}s or cover it with a harder transition.",
            )
        )

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
    def _action_board(
        summary: AnalysisSummary,
        scores: ScoreSet,
        deadspace_cuts: list[DeadspaceCut],
        low_value_cuts: list[DeadspaceCut],
    ) -> ActionBoard:
        deadspace_seconds = round(sum(cut.end - cut.start for cut in deadspace_cuts), 1)
        low_value_seconds = round(sum(cut.end - cut.start for cut in low_value_cuts), 1)
        keep = list(summary.strengths[:2])
        if not keep:
            keep = ["Keep the strongest early spike intact."]
        fix_now = []
        if deadspace_cuts:
            fix_now.append(
                f"Remove {deadspace_seconds}s of deadspace across {len(deadspace_cuts)} default cut{'s' if len(deadspace_cuts) != 1 else ''}."
            )
        if low_value_cuts:
            fix_now.append(
                f"Review {len(low_value_cuts)} AI-flagged low-value segment{'s' if len(low_value_cuts) != 1 else ''} before export."
            )
        fix_now.extend(summary.weaknesses[:1])
        test_next = []
        if scores.hookScore < 70:
            test_next.append("Test a sharper first-two-second hook with less setup.")
        else:
            test_next.append("Keep the current hook and test a tighter first-frame title or caption.")
        if scores.pacingScore < 65:
            test_next.append("Test a faster mid-clip transition pattern to reduce flat sections.")
        else:
            test_next.append("Test a slightly shorter export to preserve pacing momentum.")
        export_plan = []
        if deadspace_cuts:
            export_plan.append("Default export keeps all deadspace cuts selected.")
        if low_value_cuts:
            export_plan.append(
                f"Optional AI trims can remove up to {low_value_seconds}s more if you want a harder edit."
            )
        else:
            export_plan.append("Optional AI trims were not necessary on this pass.")
        return ActionBoard(
            keep=keep[:3],
            fixNow=fix_now[:3] or ["No urgent edit blockers were detected."],
            testNext=test_next[:3],
            exportPlan=export_plan[:3],
        )

    @staticmethod
    def _timeline_segments(
        points: list[BrainResponsePoint],
        markers: list[Marker],
        cut_plan: list[DeadspaceCut],
    ) -> list[TimelineSegment]:
        segments: list[TimelineSegment] = []
        for cut in cut_plan:
            segments.append(
                TimelineSegment(
                    id=f"segment-{cut.id}",
                    type=cut.type,
                    label="Deadspace cut" if cut.type == "deadspace" else "Low-value segment",
                    start=cut.start,
                    end=cut.end,
                    severity="high" if cut.type == "deadspace" else "medium",
                    reason=cut.reason,
                    recommendedAction=cut.recommendedAction,
                    cutId=cut.id,
                )
            )
        for index, marker in enumerate(markers, start=1):
            point = AnalysisEngine._closest_point(points, marker.t)
            if point is None:
                continue
            start = round(point.segmentStartSec, 2)
            end = round(point.segmentStartSec + max(point.segmentDurationSec, 0.8), 2)
            segments.append(
                TimelineSegment(
                    id=f"segment-marker-{index}",
                    type=marker.type,
                    label=marker.type.replace("_", " ").title(),
                    start=start,
                    end=end,
                    severity=marker.severity,
                    reason=marker.explanation,
                    recommendedAction=marker.suggestion,
                )
            )
        segments.sort(key=lambda segment: (segment.start, segment.end))
        deduped: list[TimelineSegment] = []
        seen: set[tuple[float, str]] = set()
        for segment in segments:
            key = (round(segment.start, 2), segment.label)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(segment)
        return deduped[:12]

    @staticmethod
    def _timeline_segments_from_proxy(
        raw_segments: Any,
        points: list[BrainResponsePoint],
        markers: list[Marker],
        cut_plan: list[DeadspaceCut],
    ) -> list[TimelineSegment]:
        if not isinstance(raw_segments, list):
            return AnalysisEngine._timeline_segments(points, markers, cut_plan)
        normalized: list[TimelineSegment] = []
        for index, segment in enumerate(raw_segments, start=1):
            normalized.append(
                TimelineSegment(
                    id=str(segment.get("id") or f"proxy-segment-{index}"),
                    type=segment.get("type", "low_value"),
                    label=str(segment.get("label") or "Timeline segment"),
                    start=round(float(segment.get("start", 0.0)), 2),
                    end=round(float(segment.get("end", 0.1)), 2),
                    severity=segment.get("severity", "medium"),
                    reason=str(segment.get("reason") or "Review this portion of the clip."),
                    recommendedAction=str(
                        segment.get("recommendedAction") or "Tighten or preserve this beat based on the surrounding context."
                    ),
                    cutId=segment.get("cutId"),
                )
            )
        return normalized[:12]

    @staticmethod
    def _action_board_from_proxy(
        raw_board: Any,
        summary: AnalysisSummary,
        scores: ScoreSet,
        deadspace_cuts: list[DeadspaceCut],
        low_value_cuts: list[DeadspaceCut],
    ) -> ActionBoard:
        if not isinstance(raw_board, dict):
            return AnalysisEngine._action_board(summary, scores, deadspace_cuts, low_value_cuts)
        return ActionBoard(
            keep=[str(item) for item in raw_board.get("keep", [])][:3],
            fixNow=[str(item) for item in raw_board.get("fixNow", [])][:3],
            testNext=[str(item) for item in raw_board.get("testNext", [])][:3],
            exportPlan=[str(item) for item in raw_board.get("exportPlan", [])][:3],
        )

    @staticmethod
    def _normalize_proxy_cuts(raw_cuts: Any, cut_type: str) -> list[DeadspaceCut]:
        if not isinstance(raw_cuts, list):
            return []
        normalized: list[DeadspaceCut] = []
        for index, cut in enumerate(raw_cuts, start=1):
            normalized.append(
                DeadspaceCut(
                    id=str(cut.get("id") or f"{cut_type.replace('_', '-')}-{index}"),
                    type=cut_type,
                    start=round(float(cut["start"]), 2),
                    end=round(float(cut["end"]), 2),
                    reason=str(cut["reason"]),
                    defaultSelected=bool(cut.get("defaultSelected", cut_type == "deadspace")),
                    recommendedAction=str(
                        cut.get("recommendedAction")
                        or (
                            "Remove this section or bridge it with a harder cut."
                            if cut_type == "deadspace"
                            else "Review this segment and remove it if it weakens the overall pace."
                        )
                    ),
                )
            )
        return normalized

    @staticmethod
    def _closest_point(points: list[BrainResponsePoint], t: float) -> BrainResponsePoint | None:
        if not points:
            return None
        return min(points, key=lambda point: abs(point.stimulusTimeSec - t))

    @staticmethod
    def _ranges_overlap(a: tuple[float, float], b: tuple[float, float]) -> bool:
        return max(a[0], b[0]) < min(a[1], b[1])

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
