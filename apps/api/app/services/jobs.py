from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.models.contracts import (
    AnalysisResponse,
    DeadspaceCut,
    EditorClipDescriptor,
    EditorDraftExport,
    EditorDraftPayload,
    EditorDraftResponse,
    OrderedDraftClip,
)
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.media import MediaInspectionError, MediaService, SequenceClipPlan, SequenceClipTiming
from app.services.storage import StorageService
from app.services.gemini_runner import GeminiIntegrationError
from app.services.tribe_runner import TribeIntegrationError, TribeRunner


@dataclass
class PreparedEditorClip:
    descriptor: EditorClipDescriptor
    source_order: int
    source_path: Path
    duration_sec: float
    transcript_preview: str
    summary: str
    speech_coverage: float
    warnings: list[str]
    applied_cuts: list[DeadspaceCut]
    rationale: str | None = None


class AnalysisJobService:
    def __init__(
        self,
        storage: StorageService,
        runner: TribeRunner,
        engine: AnalysisEngine,
        convex_sync: ConvexSyncService,
    ) -> None:
        self.storage = storage
        self.runner = runner
        self.engine = engine
        self.convex_sync = convex_sync
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tribe-analysis")

    def enqueue(self, analysis_id: str, upload_id: str, convex_scan_id: str | None = None) -> None:
        self.executor.submit(self._run_analysis, analysis_id, upload_id, convex_scan_id)

    def run_now(self, analysis_id: str, upload_id: str, convex_scan_id: str | None = None) -> None:
        self._run_analysis(analysis_id, upload_id, convex_scan_id)

    def _run_analysis(self, analysis_id: str, upload_id: str, convex_scan_id: str | None = None) -> None:
        record = self.storage.read_analysis_record(analysis_id)
        running = record.model_copy(
            update={"status": "running", "updatedAt": datetime.now(UTC)}
        )
        self.storage.write_analysis_record(running)
        self.convex_sync.update_scan_status(
            convex_scan_id=convex_scan_id,
            status="running",
            local_analysis_id=analysis_id,
        )

        try:
            upload = self.storage.read_upload_metadata(upload_id)
            upload_paths = self.storage.upload_paths(upload_id)
            analysis = self.runner.analyze_video(upload_paths.source_path)
            artifacts = self.engine.build_payload(
                analysis_id=analysis_id,
                video=upload.video,
                source_path=upload_paths.source_path,
                result=analysis,
            )
            analysis_paths = self.storage.analysis_paths(analysis_id)
            analysis_paths.events_path.write_text(artifacts.events_csv, encoding="utf-8")
            self.storage.write_segments(analysis_id, artifacts.segments_json)
            if artifacts.preds is not None:
                self.storage.write_preds(analysis_id, artifacts.preds)
            if artifacts.provider_raw is not None:
                self.storage.write_provider_raw(analysis_id, artifacts.provider_raw)
            self.storage.write_analysis_payload(analysis_id, artifacts.payload)
            completed = AnalysisResponse(
                analysisId=analysis_id,
                status="completed",
                createdAt=record.createdAt,
                updatedAt=datetime.now(UTC),
                error=None,
                payload=artifacts.payload,
            )
            self.storage.write_analysis_record(completed)
            self.convex_sync.update_scan_status(
                convex_scan_id=convex_scan_id,
                status="completed",
                local_analysis_id=analysis_id,
            )
            self.convex_sync.attach_scan_summary(
                convex_scan_id=convex_scan_id,
                viral_potential=artifacts.payload.scores.viralPotential,
                hook_score=artifacts.payload.scores.hookScore,
                pacing_score=artifacts.payload.scores.pacingScore,
                retention_estimate=artifacts.payload.scores.retentionEstimate,
                deadspace_seconds=artifacts.payload.diagnostics.deadspaceSeconds,
                trimmed_duration_sec=artifacts.payload.diagnostics.trimmedDurationSec,
                overall_recommendation=artifacts.payload.summary.overallRecommendation,
            )
        except (GeminiIntegrationError, TribeIntegrationError, FileNotFoundError, RuntimeError) as exc:
            failed = AnalysisResponse(
                analysisId=analysis_id,
                status="failed",
                createdAt=record.createdAt,
                updatedAt=datetime.now(UTC),
                error=str(exc),
                payload=None,
            )
            self.storage.write_analysis_record(failed)
            self.convex_sync.update_scan_status(
                convex_scan_id=convex_scan_id,
                status="failed",
                local_analysis_id=analysis_id,
                error_message=str(exc),
            )


class EditorDraftJobService:
    def __init__(
        self,
        *,
        storage: StorageService,
        runner: TribeRunner,
        media: MediaService,
        engine: AnalysisEngine,
        editor_ai,
        convex_sync: ConvexSyncService,
    ) -> None:
        self.storage = storage
        self.runner = runner
        self.media = media
        self.engine = engine
        self.editor_ai = editor_ai
        self.convex_sync = convex_sync
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="editor-draft")

    def enqueue(
        self,
        project_id: str,
        draft_id: str,
        clips: list[EditorClipDescriptor],
    ) -> None:
        self.executor.submit(self._run_draft, project_id, draft_id, clips)

    def run_now(
        self,
        project_id: str,
        draft_id: str,
        clips: list[EditorClipDescriptor],
    ) -> None:
        self._run_draft(project_id, draft_id, clips)

    def _run_draft(
        self,
        project_id: str,
        draft_id: str,
        clips: list[EditorClipDescriptor],
    ) -> None:
        record = self.storage.read_editor_draft_record(draft_id)
        running = record.model_copy(
            update={"status": "running", "updatedAt": datetime.now(UTC)}
        )
        self.storage.write_editor_draft_record(running)
        self.convex_sync.update_editor_project_status(
            convex_project_id=project_id,
            status="running",
            latest_local_draft_id=draft_id,
        )

        try:
            prepared_clips = [
                self._prepare_clip(source_order=index, clip=clip)
                for index, clip in enumerate(clips)
            ]
            ordered_clips, storyline_summary, ordering_confidence, order_warnings = self._resolve_order(
                prepared_clips
            )
            draft_paths = self.storage.editor_draft_paths(draft_id)
            total_duration, timings = self.media.assemble_sequence(
                output_path=draft_paths.video_path,
                clips=[
                    SequenceClipPlan(
                        clip_id=clip.descriptor.clipId,
                        source_path=clip.source_path,
                        cuts=[(cut.start, cut.end) for cut in clip.applied_cuts],
                        total_duration_sec=clip.duration_sec,
                    )
                    for clip in ordered_clips
                ],
            )
            timings_by_clip = {timing.clip_id: timing for timing in timings}
            warnings = self._dedupe_warnings(
                [*order_warnings, *(warning for clip in ordered_clips for warning in clip.warnings)]
            )
            ordered_payload_clips = [
                self._build_ordered_clip_payload(
                    clip=clip,
                    resolved_order=index,
                    timing=timings_by_clip[clip.descriptor.clipId],
                )
                for index, clip in enumerate(ordered_clips, start=1)
            ]
            payload = EditorDraftPayload(
                export=EditorDraftExport(
                    videoUrl=self.storage.to_storage_url(draft_paths.video_path),
                    durationSec=round(total_duration, 2),
                ),
                storylineSummary=storyline_summary,
                orderingConfidence=ordering_confidence,
                orderedClips=ordered_payload_clips,
                warnings=warnings,
            )
            self.storage.write_editor_draft_payload(draft_id, payload)
            completed = EditorDraftResponse(
                draftId=draft_id,
                projectId=project_id,
                status="completed",
                createdAt=record.createdAt,
                updatedAt=datetime.now(UTC),
                error=None,
                payload=payload,
            )
            self.storage.write_editor_draft_record(completed)
            self.convex_sync.update_editor_project_status(
                convex_project_id=project_id,
                status="completed",
                latest_local_draft_id=draft_id,
            )
            self.convex_sync.attach_editor_draft_summary(
                convex_project_id=project_id,
                latest_local_draft_id=draft_id,
                latest_export_url=payload.export.videoUrl,
                storyline_summary=payload.storylineSummary,
                ordering_confidence=payload.orderingConfidence,
                warning_count=len(payload.warnings),
            )
        except (GeminiIntegrationError, TribeIntegrationError, FileNotFoundError, MediaInspectionError, RuntimeError) as exc:
            failed = EditorDraftResponse(
                draftId=draft_id,
                projectId=project_id,
                status="failed",
                createdAt=record.createdAt,
                updatedAt=datetime.now(UTC),
                error=str(exc),
                payload=None,
            )
            self.storage.write_editor_draft_record(failed)
            self.convex_sync.update_editor_project_status(
                convex_project_id=project_id,
                status="failed",
                latest_local_draft_id=draft_id,
                error_message=str(exc),
            )

    def _prepare_clip(self, *, source_order: int, clip: EditorClipDescriptor) -> PreparedEditorClip:
        upload = self.storage.read_upload_metadata(clip.localUploadId)
        upload_paths = self.storage.upload_paths(clip.localUploadId)
        ai_summary = self.editor_ai.summarize_editor_clip(upload_paths.source_path)
        speech_segments = self._speech_segments_from_ai(ai_summary, upload.video.durationSec)
        transcript_preview = self._transcript_preview_from_segments(speech_segments) or str(
            ai_summary.get("transcriptPreview") or ""
        )
        transcript_word_count = 0

        if isinstance(self.runner, TribeRunner):
            result = self.runner.analyze_video(upload_paths.source_path)
            plan = self.engine.build_editor_clip_plan(
                source_path=upload_paths.source_path,
                result=result,
            )
            transcript_preview = (
                self._transcript_preview_from_events(result)
                or transcript_preview
            )
            transcript_word_count = plan.transcript_word_count
        else:
            plan = self.engine.build_editor_clip_plan_from_speech(
                source_path=upload_paths.source_path,
                duration_sec=upload.video.durationSec,
                speech_segments=speech_segments,
            )
            transcript_word_count = plan.transcript_word_count

        summary = str(ai_summary.get("summary") or f"Clip {source_order + 1}")
        warnings = [str(item) for item in ai_summary.get("warnings", [])]
        speech_coverage = max(
            float(ai_summary.get("speechCoverage") or 0.0),
            self._speech_coverage_from_segments(speech_segments, upload.video.durationSec),
        )
        applied_cuts = self._limit_default_cuts(plan.default_cuts, upload.video.durationSec)
        if plan.default_cuts and not applied_cuts:
            warnings.append(
                "Skipped automatic deadspace cuts for this clip because they would remove almost the entire source."
            )
        if transcript_word_count < 3 or speech_coverage < 0.2:
            warnings.append(
                "Limited spoken context detected. Keeping this clip in source-order fallback mode."
            )
        return PreparedEditorClip(
            descriptor=clip,
            source_order=source_order,
            source_path=upload_paths.source_path,
            duration_sec=upload.video.durationSec,
            transcript_preview=transcript_preview,
            summary=summary,
            speech_coverage=max(speech_coverage, 0.0),
            warnings=self._dedupe_warnings(warnings),
            applied_cuts=applied_cuts,
        )

    def _resolve_order(
        self,
        clips: list[PreparedEditorClip],
    ) -> tuple[list[PreparedEditorClip], str, str, list[str]]:
        semantic_clips = [
            clip for clip in clips if clip.speech_coverage >= 0.2 and clip.transcript_preview.strip()
        ]
        supporting_clips = [clip for clip in clips if clip not in semantic_clips]

        storyline_summary = "Ordered clips into a rough-cut sequence."
        ordering_confidence = "low"
        warnings: list[str] = []
        ordered_semantic_clips = semantic_clips

        if semantic_clips:
            ordering = self.editor_ai.order_editor_clips(
                [
                    {
                        "clipId": clip.descriptor.clipId,
                        "filename": clip.descriptor.filename,
                        "summary": clip.summary,
                        "transcriptPreview": clip.transcript_preview,
                        "speechCoverage": clip.speech_coverage,
                    }
                    for clip in semantic_clips
                ]
            )
            clip_map = {clip.descriptor.clipId: clip for clip in semantic_clips}
            ordered_semantic_clips = [
                clip_map[item["clipId"]]
                for item in ordering.get("orderedClips", [])
                if item["clipId"] in clip_map
            ]
            fallback_missing = [
                clip for clip in semantic_clips if clip.descriptor.clipId not in {item.descriptor.clipId for item in ordered_semantic_clips}
            ]
            ordered_semantic_clips.extend(sorted(fallback_missing, key=lambda clip: clips.index(clip)))
            rationale_by_clip = {
                str(item["clipId"]): str(item["rationale"])
                for item in ordering.get("orderedClips", [])
            }
            storyline_summary = str(ordering.get("storylineSummary") or storyline_summary)
            ordering_confidence = str(ordering.get("orderingConfidence") or ordering_confidence)
            warnings.extend(str(item) for item in ordering.get("warnings", []))
            for clip in ordered_semantic_clips:
                clip.rationale = rationale_by_clip.get(
                    clip.descriptor.clipId,
                    "Placed to support the storyline.",
                )

        supporting_clips = sorted(supporting_clips, key=lambda clip: clip.source_order)
        for clip in supporting_clips:
            clip.rationale = "Kept in source order because transcript signal was limited."

        ordered_clips = [*ordered_semantic_clips, *supporting_clips]
        for clip in ordered_clips:
            clip.warnings = self._dedupe_warnings(clip.warnings)
        return ordered_clips, storyline_summary, ordering_confidence, self._dedupe_warnings(warnings)

    def _build_ordered_clip_payload(
        self,
        *,
        clip: PreparedEditorClip,
        resolved_order: int,
        timing: SequenceClipTiming,
    ) -> OrderedDraftClip:
        rationale = getattr(clip, "rationale", None) or (
            "Kept in source order because transcript signal was limited."
        )
        return OrderedDraftClip(
            clipId=clip.descriptor.clipId,
            uploadId=clip.descriptor.uploadId,
            filename=clip.descriptor.filename,
            sourceOrder=clip.source_order,
            resolvedOrder=resolved_order,
            rationale=str(rationale),
            transcriptPreview=clip.transcript_preview,
            summary=clip.summary,
            speechCoverage=round(clip.speech_coverage, 2),
            removedSeconds=timing.removed_seconds,
            trimmedDurationSec=timing.trimmed_duration_sec,
            outputStartSec=timing.output_start_sec,
            outputEndSec=timing.output_end_sec,
            warnings=clip.warnings,
            appliedCuts=clip.applied_cuts,
        )

    @staticmethod
    def _transcript_preview_from_events(result: TribeRunResult) -> str:
        if "text" not in result.events:
            return ""
        words = [str(value).strip() for value in result.events["text"].tolist() if str(value).strip()]
        return " ".join(words[:18]).strip()

    @staticmethod
    def _transcript_preview_from_segments(speech_segments: list[tuple[float, float, str]]) -> str:
        words: list[str] = []
        for _, _, text in speech_segments:
            words.extend(part for part in text.split() if part.strip())
            if len(words) >= 18:
                break
        return " ".join(words[:18]).strip()

    @staticmethod
    def _speech_segments_from_ai(
        ai_summary: dict[str, object],
        duration_sec: float,
    ) -> list[tuple[float, float, str]]:
        raw_segments = ai_summary.get("speechSegments")
        if not isinstance(raw_segments, list):
            return []
        normalized: list[tuple[float, float, str]] = []
        for segment in raw_segments:
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or "").strip()
            start = max(min(float(segment.get("startSec", 0.0)), duration_sec), 0.0)
            end = max(start, min(float(segment.get("endSec", start)), duration_sec))
            if not text or end - start < 0.05:
                continue
            normalized.append((round(start, 2), round(end, 2), text))
        normalized.sort(key=lambda item: item[0])
        return normalized

    @staticmethod
    def _speech_coverage_from_segments(
        speech_segments: list[tuple[float, float, str]],
        duration_sec: float,
    ) -> float:
        if duration_sec <= 0 or not speech_segments:
            return 0.0
        merged: list[tuple[float, float]] = []
        for start, end, _ in speech_segments:
            if not merged or start > merged[-1][1]:
                merged.append((start, end))
                continue
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        spoken_duration = sum(end - start for start, end in merged)
        return min(max(spoken_duration / duration_sec, 0.0), 1.0)

    @staticmethod
    def _limit_default_cuts(cuts: list[DeadspaceCut], duration_sec: float) -> list[DeadspaceCut]:
        if duration_sec <= 0.8:
            return []
        min_keep_seconds = min(duration_sec, max(0.6, duration_sec * 0.25))
        max_removed_seconds = max(0.0, duration_sec - min_keep_seconds)
        removed_seconds = 0.0
        limited: list[DeadspaceCut] = []
        for cut in sorted(cuts, key=lambda item: (item.start, item.end)):
            cut_duration = max(cut.end - cut.start, 0.0)
            if removed_seconds + cut_duration > max_removed_seconds + 1e-6:
                continue
            limited.append(cut)
            removed_seconds += cut_duration
        return limited

    @staticmethod
    def _dedupe_warnings(warnings: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for warning in warnings:
            normalized = warning.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
        return deduped
