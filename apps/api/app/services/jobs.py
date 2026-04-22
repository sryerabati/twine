from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from datetime import UTC, datetime
import math
from pathlib import Path
import re

from app.models.contracts import (
    AnalysisResponse,
    DeadspaceCut,
    EditorClipDescriptor,
    EditorDraftExport,
    EditorDraftPayload,
    EditorDraftResponse,
    OrderedDraftClip,
    RepurposeResultPayload,
    RepurposeResultResponse,
    RepurposeSegmentSummary,
    RepurposeSourceSummary,
    RepurposeVariant,
)
from app.services.analysis_engine import AnalysisEngine, EditorialWindow
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
    recorded_at: datetime | None
    file_modified_at: datetime | None
    transcript_preview: str
    transcript_tail: str
    summary: str
    speech_coverage: float
    warnings: list[str]
    applied_cuts: list[DeadspaceCut]
    rationale: str | None = None


@dataclass
class RepurposeSourceDescriptor:
    source_upload_id: str
    local_upload_id: str
    filename: str


@dataclass
class PreparedRepurposeSegment:
    segment_id: str
    start_sec: float
    end_sec: float
    transcript_preview: str
    summary: str
    timeline_index: int = 0
    speech_seconds: float = 0.0
    speech_start_sec: float | None = None
    speech_end_sec: float | None = None
    deadspace_ratio: float = 0.0
    scene_break_before: bool = False
    scene_break_after: bool = False
    bridge_only: bool = False

    @property
    def duration_sec(self) -> float:
        return max(self.end_sec - self.start_sec, 0.0)

    @property
    def score(self) -> float:
        return (
            self.speech_seconds * 1.5
            + self.duration_sec * max(1.0 - self.deadspace_ratio, 0.0)
            - (0.6 if self.bridge_only else 0.0)
        )


@dataclass
class ResolvedRepurposeVariantPlan:
    title: str
    angle_summary: str
    rationale: str
    duration_target: str
    ordered_segments: list[PreparedRepurposeSegment]


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
        self.hydration_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mirofish-world")

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
            if artifacts.payload.analysisMode == "read_the_room":
                self.hydration_executor.submit(self._hydrate_world, analysis_id)
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

    def _hydrate_world(self, analysis_id: str) -> None:
        hydrate_world = getattr(self.runner, "hydrate_audience_world", None)
        if not callable(hydrate_world):
            return
        try:
            record = self.storage.read_analysis_record(analysis_id)
            payload = record.payload or self.storage.read_analysis_payload(analysis_id)
            provider_raw = self.storage.read_provider_raw(analysis_id)
        except FileNotFoundError:
            return

        simulation_id = str(provider_raw.get("simulationId") or "").strip()
        if not simulation_id:
            return

        windows = [
            {
                "windowIndex": index + 1,
                "startSec": point.startSec,
                "endSec": point.endSec,
                "note": point.note,
            }
            for index, point in enumerate(payload.audienceOutlook.timeline if payload.audienceOutlook else [])
        ]

        try:
            world = hydrate_world(
                simulation_id,
                windows=windows,
                include_cached_interviews=True,
            )
        except RuntimeError:
            if payload.audienceWorld is None:
                return
            world = payload.audienceWorld.model_dump(mode="json")
            world["status"] = "unavailable"

        next_payload = payload.model_copy(update={"audienceWorld": world})
        self.storage.write_analysis_world(analysis_id, world)
        self.storage.write_analysis_payload(analysis_id, next_payload)
        self.storage.write_analysis_record(
            record.model_copy(
                update={
                    "updatedAt": datetime.now(UTC),
                    "payload": next_payload,
                }
            )
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
        record = self._update_draft_record(
            draft_id,
            status="running",
            stage="preparing_clips",
            progress_percent=12,
            status_message="Reviewing clips for transcript cues and deadspace.",
        )
        self.convex_sync.update_editor_project_status(
            convex_project_id=project_id,
            status="running",
            latest_local_draft_id=draft_id,
        )

        try:
            prepared_clips: list[PreparedEditorClip] = []
            for index, clip in enumerate(clips):
                self._update_draft_record(
                    draft_id,
                    status="running",
                    stage="preparing_clips",
                    progress_percent=min(55, 18 + int(((index + 1) / max(len(clips), 1)) * 32)),
                    status_message=f"Preparing clip {index + 1} of {len(clips)}.",
                )
                prepared_clips.append(self._prepare_clip(source_order=index, clip=clip))

            self._update_draft_record(
                draft_id,
                status="running",
                stage="ordering_story",
                progress_percent=66,
                status_message="Resolving the story order across all uploaded clips.",
            )
            ordered_clips, storyline_summary, ordering_confidence, order_warnings = self._resolve_order(
                prepared_clips
            )
            self._update_draft_record(
                draft_id,
                status="running",
                stage="rendering_video",
                progress_percent=84,
                status_message="Rendering the combined rough cut video.",
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
            if not any(clip.applied_cuts for clip in ordered_clips):
                warnings = self._dedupe_warnings(
                    [
                        *warnings,
                        "No safe deadspace cuts were applied; this draft is ordering-only.",
                    ]
                )
            self._update_draft_record(
                draft_id,
                status="running",
                stage="finalizing",
                progress_percent=94,
                status_message="Finalizing export metadata and review details.",
            )
            ordered_payload_clips = [
                self._build_ordered_clip_payload(
                    clip=clip,
                    resolved_order=index,
                    timing=timings_by_clip[clip.descriptor.clipId],
                )
                for index, clip in enumerate(ordered_clips, start=1)
            ]
            stored_draft_video = self.storage.store_media_file(
                draft_paths.video_path,
                content_type="video/mp4",
            )
            payload = EditorDraftPayload(
                export=EditorDraftExport(
                    videoUrl=stored_draft_video.url,
                    videoStorageId=stored_draft_video.storage_id,
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
                stage="completed",
                progressPercent=100,
                statusMessage="Rough cut ready to review.",
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
                latest_export_storage_id=payload.export.videoStorageId,
                storyline_summary=payload.storylineSummary,
                ordering_confidence=payload.orderingConfidence,
                warning_count=len(payload.warnings),
            )
            if stored_draft_video.storage_id:
                draft_paths.video_path.unlink(missing_ok=True)
        except (GeminiIntegrationError, TribeIntegrationError, FileNotFoundError, MediaInspectionError, RuntimeError) as exc:
            current_record = self.storage.read_editor_draft_record(draft_id)
            failed = EditorDraftResponse(
                draftId=draft_id,
                projectId=project_id,
                status="failed",
                stage="failed",
                progressPercent=current_record.progressPercent,
                statusMessage="Rough cut generation failed.",
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

    def _update_draft_record(
        self,
        draft_id: str,
        *,
        status: str | None = None,
        stage: str | None = None,
        progress_percent: int | None = None,
        status_message: str | None = None,
    ) -> EditorDraftResponse:
        record = self.storage.read_editor_draft_record(draft_id)
        update: dict[str, object] = {
            "updatedAt": datetime.now(UTC),
        }
        if status is not None:
            update["status"] = status
        if stage is not None:
            update["stage"] = stage
        if progress_percent is not None:
            update["progressPercent"] = progress_percent
        if status_message is not None:
            update["statusMessage"] = status_message
        next_record = record.model_copy(update=update)
        self.storage.write_editor_draft_record(next_record)
        return next_record

    def _prepare_clip(self, *, source_order: int, clip: EditorClipDescriptor) -> PreparedEditorClip:
        upload = self.storage.read_upload_metadata(clip.localUploadId)
        upload_paths = self.storage.upload_paths(clip.localUploadId)
        recorded_at = upload.video.recordedAt
        file_modified_at = upload.video.fileModifiedAt
        if recorded_at is None or file_modified_at is None:
            inspected_metadata = self.media.inspect_video(upload_paths.source_path)
            recorded_at = recorded_at or inspected_metadata.recorded_at
            file_modified_at = file_modified_at or inspected_metadata.file_modified_at
        ai_summary = self.editor_ai.summarize_editor_clip(upload_paths.source_path)
        speech_segments = self._speech_segments_from_ai(ai_summary, upload.video.durationSec)
        transcript_preview = self._transcript_preview_from_segments(speech_segments) or str(
            ai_summary.get("transcriptPreview") or ""
        )
        transcript_tail = self._transcript_tail_from_segments(speech_segments) or transcript_preview
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
            transcript_tail = (
                self._transcript_tail_from_events(result)
                or transcript_tail
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
                "Limited spoken context detected. Metadata or original order will be used as a fallback."
            )
        return PreparedEditorClip(
            descriptor=clip,
            source_order=source_order,
            source_path=upload_paths.source_path,
            duration_sec=upload.video.durationSec,
            recorded_at=recorded_at,
            file_modified_at=file_modified_at,
            transcript_preview=transcript_preview,
            transcript_tail=transcript_tail,
            summary=summary,
            speech_coverage=max(speech_coverage, 0.0),
            warnings=self._dedupe_warnings(warnings),
            applied_cuts=applied_cuts,
        )

    def _resolve_order(
        self,
        clips: list[PreparedEditorClip],
    ) -> tuple[list[PreparedEditorClip], str, str, list[str]]:
        storyline_summary = "Ordered clips into a rough-cut sequence."
        ordering_confidence = "low"
        warnings: list[str] = []
        ordered_clips = clips

        if clips:
            ordering = self.editor_ai.order_editor_clips(
                [
                    {
                        "clipId": clip.descriptor.clipId,
                        "filename": clip.descriptor.filename,
                        "sourceOrder": clip.source_order,
                        "summary": clip.summary,
                        "transcriptPreview": clip.transcript_preview,
                        "transcriptStart": clip.transcript_preview,
                        "transcriptEnd": clip.transcript_tail,
                        "speechCoverage": clip.speech_coverage,
                        "recordedAt": self._serialize_datetime(clip.recorded_at),
                        "fileModifiedAt": self._serialize_datetime(clip.file_modified_at),
                    }
                    for clip in clips
                ]
            )
            clip_map = {clip.descriptor.clipId: clip for clip in clips}
            seen_clip_ids: set[str] = set()
            ordered_clips = []
            for item in ordering.get("orderedClips", []):
                clip_id = str(item["clipId"])
                if clip_id not in clip_map or clip_id in seen_clip_ids:
                    continue
                ordered_clips.append(clip_map[clip_id])
                seen_clip_ids.add(clip_id)
            fallback_missing = [
                clip
                for clip in clips
                if clip.descriptor.clipId not in seen_clip_ids
            ]
            ordered_clips.extend(sorted(fallback_missing, key=self._fallback_order_key))
            rationale_by_clip = {
                str(item["clipId"]): str(item["rationale"])
                for item in ordering.get("orderedClips", [])
            }
            storyline_summary = str(ordering.get("storylineSummary") or storyline_summary)
            ordering_confidence = str(ordering.get("orderingConfidence") or ordering_confidence)
            warnings.extend(str(item) for item in ordering.get("warnings", []))
            ordered_clips, repaired_clip_ids = self._repair_direct_script_followups(ordered_clips, clips)

            for clip in ordered_clips:
                if clip.descriptor.clipId in repaired_clip_ids:
                    clip.rationale = (
                        "Kept immediately after the prior clip because the script reads like a direct response or continuation."
                    )
                    continue
                if clip.descriptor.clipId in rationale_by_clip:
                    clip.rationale = rationale_by_clip[clip.descriptor.clipId]
                    continue
                if clip.speech_coverage < 0.2 or not clip.transcript_preview.strip():
                    if self._has_chronology_metadata(clip):
                        clip.rationale = (
                            "Placed using clip chronology metadata because spoken context was limited."
                        )
                    else:
                        clip.rationale = (
                            "Kept near its original position because spoken context was limited."
                        )
                    continue
                clip.rationale = "Placed to support the storyline."

        for clip in ordered_clips:
            clip.warnings = self._dedupe_warnings(clip.warnings)
        return ordered_clips, storyline_summary, ordering_confidence, self._dedupe_warnings(warnings)

    def _repair_direct_script_followups(
        self,
        ordered_clips: list[PreparedEditorClip],
        original_clips: list[PreparedEditorClip],
    ) -> tuple[list[PreparedEditorClip], set[str]]:
        repaired = list(ordered_clips)
        repaired_clip_ids: set[str] = set()
        chronology = sorted(original_clips, key=self._fallback_order_key)
        for first, second in zip(chronology, chronology[1:]):
            if not self._should_lock_script_pair(first, second):
                continue
            first_index = self._clip_index(repaired, first.descriptor.clipId)
            second_index = self._clip_index(repaired, second.descriptor.clipId)
            if first_index < 0 or second_index < 0 or second_index == first_index + 1:
                continue
            moving = repaired.pop(second_index)
            if second_index < first_index:
                first_index -= 1
            repaired.insert(first_index + 1, moving)
            repaired_clip_ids.add(moving.descriptor.clipId)
        return repaired, repaired_clip_ids

    def _build_ordered_clip_payload(
        self,
        *,
        clip: PreparedEditorClip,
        resolved_order: int,
        timing: SequenceClipTiming,
    ) -> OrderedDraftClip:
        rationale = getattr(clip, "rationale", None) or (
            "Placed using metadata or original order because transcript signal was limited."
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
            recordedAt=clip.recorded_at,
            fileModifiedAt=clip.file_modified_at,
            warnings=clip.warnings,
            appliedCuts=clip.applied_cuts,
        )

    @staticmethod
    def _serialize_datetime(value: datetime | None) -> str | None:
        return value.isoformat() if value is not None else None

    @staticmethod
    def _has_chronology_metadata(clip: PreparedEditorClip) -> bool:
        return clip.recorded_at is not None or clip.file_modified_at is not None

    def _fallback_order_key(self, clip: PreparedEditorClip) -> tuple[int, float, int]:
        chronology = clip.recorded_at or clip.file_modified_at
        if chronology is None:
            return (1, float(clip.source_order), clip.source_order)
        return (0, chronology.timestamp(), clip.source_order)

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
    def _transcript_tail_from_events(result: TribeRunResult) -> str:
        if "text" not in result.events:
            return ""
        words = [str(value).strip() for value in result.events["text"].tolist() if str(value).strip()]
        return " ".join(words[-18:]).strip()

    @staticmethod
    def _transcript_tail_from_segments(speech_segments: list[tuple[float, float, str]]) -> str:
        words: list[str] = []
        for _, _, text in speech_segments:
            words.extend(part for part in text.split() if part.strip())
        return " ".join(words[-18:]).strip()

    @staticmethod
    def _clip_index(clips: list[PreparedEditorClip], clip_id: str) -> int:
        for index, clip in enumerate(clips):
            if clip.descriptor.clipId == clip_id:
                return index
        return -1

    def _should_lock_script_pair(
        self,
        first: PreparedEditorClip,
        second: PreparedEditorClip,
    ) -> bool:
        if first.speech_coverage < 0.2 or second.speech_coverage < 0.2:
            return False
        handoff = first.transcript_tail or first.transcript_preview
        response = second.transcript_preview or second.summary
        if not handoff.strip() or not response.strip():
            return False
        shared_anchor_count = self._shared_anchor_count(handoff, response)
        question_or_handoff = self._looks_like_question_or_handoff(handoff)
        response_like = self._looks_like_response_or_continuation(response)
        if question_or_handoff and shared_anchor_count >= 1:
            return True
        if response_like and (question_or_handoff or shared_anchor_count >= 1):
            return True
        return False

    @staticmethod
    def _looks_like_question_or_handoff(text: str) -> bool:
        normalized = text.strip().lower()
        if not normalized:
            return False
        if "?" in normalized:
            return True
        if normalized.endswith((" and", " so", " because", " but")):
            return True
        return any(
            phrase in normalized
            for phrase in (
                "one last question",
                "quick question",
                "how did",
                "why did",
                "what did",
                "what was",
                "how was",
                "tell me",
                "walk me through",
                "can you explain",
                "can you talk about",
            )
        )

    @staticmethod
    def _looks_like_response_or_continuation(text: str) -> bool:
        normalized = text.strip().lower()
        if not normalized:
            return False
        first_three = " ".join(re.findall(r"[a-z0-9']+", normalized)[:3])
        return any(
            first_three.startswith(prefix)
            for prefix in (
                "yeah",
                "yes",
                "yep",
                "no",
                "right",
                "exactly",
                "totally",
                "absolutely",
                "definitely",
                "honestly",
                "basically",
                "so",
                "and",
                "but",
                "because",
                "that's",
                "that is",
                "this is",
                "it is",
                "to answer",
                "the answer",
            )
        )

    @staticmethod
    def _shared_anchor_count(left: str, right: str) -> int:
        stop_words = {
            "a",
            "an",
            "about",
            "and",
            "are",
            "because",
            "did",
            "for",
            "from",
            "had",
            "have",
            "how",
            "i",
            "is",
            "it",
            "last",
            "of",
            "on",
            "one",
            "or",
            "question",
            "so",
            "that",
            "the",
            "this",
            "to",
            "was",
            "we",
            "what",
            "you",
            "your",
        }
        left_tokens = {
            token
            for token in re.findall(r"[a-z0-9']+", left.lower())
            if len(token) > 2 and token not in stop_words
        }
        right_tokens = {
            token
            for token in re.findall(r"[a-z0-9']+", right.lower())
            if len(token) > 2 and token not in stop_words
        }
        return len(left_tokens & right_tokens)

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


class RepurposeJobService:
    MAX_EDITORIAL_SEGMENT_SEC = 3.5
    MAX_BRIDGE_SEGMENT_SEC = 0.8
    MIN_SPOKEN_BEAT_SEC = 1.2
    MIN_BRIDGE_BEAT_SEC = 0.5
    MIN_SHORT_VARIANT_SEC = 8.0
    MIN_SHORT_SPOKEN_SEC = 3.0
    MIN_SOURCE_VARIANT_RATIO = 0.6
    MAX_VARIANTS = 3
    SPEECH_HEAD_PAD_SEC = 0.12
    SPEECH_TAIL_PAD_SEC = 0.16

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
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="repurpose-result")

    def enqueue(
        self,
        project_id: str,
        result_id: str,
        source: RepurposeSourceDescriptor,
    ) -> None:
        self.executor.submit(self._run_result, project_id, result_id, source)

    def run_now(
        self,
        project_id: str,
        result_id: str,
        source: RepurposeSourceDescriptor,
    ) -> None:
        self._run_result(project_id, result_id, source)

    def _run_result(
        self,
        project_id: str,
        result_id: str,
        source: RepurposeSourceDescriptor,
    ) -> None:
        record = self._update_result_record(
            result_id,
            status="running",
            stage="preparing_source",
            progress_percent=14,
            status_message="Reviewing the source video for reusable beats.",
        )
        self.convex_sync.update_repurpose_project_status(
            convex_project_id=project_id,
            status="running",
            latest_local_result_id=result_id,
        )

        try:
            upload = self.storage.read_upload_metadata(source.local_upload_id)
            upload_paths = self.storage.upload_paths(source.local_upload_id)
            source_metadata = self.media.inspect_video(upload_paths.source_path)
            source_duration_sec = float(
                upload.video.durationSec if upload.video.durationSec > 0 else source_metadata.duration_sec
            )
            source_fps = float(source_metadata.fps)
            ai_summary = self.editor_ai.summarize_editor_clip(upload_paths.source_path)
            speech_segments = EditorDraftJobService._speech_segments_from_ai(
                ai_summary,
                source_duration_sec,
            )
            clip_plan = self.engine.build_editor_clip_plan_from_speech(
                source_path=upload_paths.source_path,
                duration_sec=source_duration_sec,
                speech_segments=speech_segments,
            )
            window_features = self.engine.build_editor_window_features_from_speech(
                source_path=upload_paths.source_path,
                duration_sec=source_duration_sec,
                speech_segments=speech_segments,
            )
            default_cuts = EditorDraftJobService._limit_default_cuts(
                clip_plan.default_cuts,
                source_duration_sec,
            )
            candidate_segments = self._build_candidate_segments(
                duration_sec=source_duration_sec,
                speech_segments=speech_segments,
                default_cuts=default_cuts,
                window_features=window_features,
            )
            if not candidate_segments:
                raise RuntimeError("Could not derive any reusable source segments from this video.")

            self._update_result_record(
                result_id,
                status="running",
                stage="planning_variants",
                progress_percent=48,
                status_message="Choosing the strongest repurpose angles.",
            )
            plan = self.editor_ai.plan_repurpose_variants(
                [
                    {
                        "segmentId": segment.segment_id,
                        "startSec": segment.start_sec,
                        "endSec": segment.end_sec,
                        "durationSec": round(segment.duration_sec, 2),
                        "transcriptPreview": segment.transcript_preview,
                        "summary": segment.summary,
                        "timelineIndex": segment.timeline_index,
                        "speechSeconds": round(segment.speech_seconds, 2),
                        "deadspaceRatio": round(segment.deadspace_ratio, 3),
                        "sceneBreakBefore": segment.scene_break_before,
                        "sceneBreakAfter": segment.scene_break_after,
                        "bridgeOnly": segment.bridge_only,
                    }
                    for segment in candidate_segments
                ],
                source_duration_sec=source_duration_sec,
            )

            self._update_result_record(
                result_id,
                status="running",
                stage="rendering_variants",
                progress_percent=78,
                status_message="Rendering repurposed variants from the source footage.",
            )
            result_paths = self.storage.repurpose_result_paths(result_id)
            variants = self._render_variants(
                result_paths=result_paths,
                source_path=upload_paths.source_path,
                source_duration_sec=source_duration_sec,
                source_fps=source_fps,
                segments=candidate_segments,
                plan=plan,
                speech_segments=speech_segments,
                default_cuts=default_cuts,
            )
            warnings = self._build_repurpose_warnings(
                variants=variants,
                source_duration_sec=source_duration_sec,
                speech_coverage=EditorDraftJobService._speech_coverage_from_segments(
                    speech_segments,
                    source_duration_sec,
                ),
            )

            self._update_result_record(
                result_id,
                status="running",
                stage="finalizing",
                progress_percent=94,
                status_message="Finalizing exports and project summary.",
            )
            payload = RepurposeResultPayload(
                source=RepurposeSourceSummary(
                    sourceUploadId=source.source_upload_id,
                    filename=source.filename,
                    durationSec=round(source_duration_sec, 2),
                    summary=str(ai_summary.get("summary") or f"{source.filename} source"),
                    speechCoverage=round(
                        max(
                            float(ai_summary.get("speechCoverage") or 0.0),
                            EditorDraftJobService._speech_coverage_from_segments(
                                speech_segments,
                                source_duration_sec,
                            ),
                        ),
                        2,
                    ),
                ),
                summary=str(plan.get("summary") or "Generated alternate cuts from the source video."),
                variants=variants,
                warnings=warnings,
            )
            self.storage.write_repurpose_result_payload(result_id, payload)
            completed = RepurposeResultResponse(
                resultId=result_id,
                projectId=project_id,
                status="completed",
                stage="completed",
                progressPercent=100,
                statusMessage="Repurpose variants ready to review.",
                createdAt=record.createdAt,
                updatedAt=datetime.now(UTC),
                error=None,
                payload=payload,
            )
            self.storage.write_repurpose_result_record(completed)
            self.convex_sync.update_repurpose_project_status(
                convex_project_id=project_id,
                status="completed",
                latest_local_result_id=result_id,
            )
            self.convex_sync.attach_repurpose_summary(
                convex_project_id=project_id,
                latest_local_result_id=result_id,
                source_upload_id=source.source_upload_id,
                source_filename=source.filename,
                source_duration_sec=round(source_duration_sec, 2),
                summary=payload.summary,
                variants=[
                    {
                        "variantKey": variant.variantId,
                        "title": variant.title,
                        "angleSummary": variant.angleSummary,
                        "durationTarget": variant.durationTarget,
                        "durationSec": variant.durationSec,
                        "exportUrl": variant.videoUrl,
                        "exportStorageId": variant.videoStorageId,
                        "position": index,
                    }
                    for index, variant in enumerate(variants)
                ],
            )
            for variant in variants:
                if variant.videoStorageId:
                    result_paths.variant_video_path(variant.variantId).unlink(missing_ok=True)
        except (GeminiIntegrationError, TribeIntegrationError, FileNotFoundError, MediaInspectionError, RuntimeError) as exc:
            current_record = self.storage.read_repurpose_result_record(result_id)
            failed = RepurposeResultResponse(
                resultId=result_id,
                projectId=project_id,
                status="failed",
                stage="failed",
                progressPercent=current_record.progressPercent,
                statusMessage="Repurpose generation failed.",
                createdAt=record.createdAt,
                updatedAt=datetime.now(UTC),
                error=str(exc),
                payload=None,
            )
            self.storage.write_repurpose_result_record(failed)
            self.convex_sync.update_repurpose_project_status(
                convex_project_id=project_id,
                status="failed",
                latest_local_result_id=result_id,
                error_message=str(exc),
            )

    def _update_result_record(
        self,
        result_id: str,
        *,
        status: str | None = None,
        stage: str | None = None,
        progress_percent: int | None = None,
        status_message: str | None = None,
    ) -> RepurposeResultResponse:
        record = self.storage.read_repurpose_result_record(result_id)
        update: dict[str, object] = {
            "updatedAt": datetime.now(UTC),
        }
        if status is not None:
            update["status"] = status
        if stage is not None:
            update["stage"] = stage
        if progress_percent is not None:
            update["progressPercent"] = progress_percent
        if status_message is not None:
            update["statusMessage"] = status_message
        next_record = record.model_copy(update=update)
        self.storage.write_repurpose_result_record(next_record)
        return next_record

    def _build_candidate_segments(
        self,
        *,
        duration_sec: float,
        speech_segments: list[tuple[float, float, str]],
        default_cuts: list[DeadspaceCut],
        window_features: list[EditorialWindow] | None = None,
    ) -> list[PreparedRepurposeSegment]:
        if duration_sec <= 0:
            return []

        windows = window_features or []
        scene_break_starts = {
            round(window.start_sec, 2)
            for window in windows
            if window.scene_change
        }
        scene_break_ends = {
            round(window.end_sec, 2)
            for window in windows
            if window.scene_change
        }

        normalized_speech = [
            (
                round(max(min(start, duration_sec), 0.0), 2),
                round(max(min(end, duration_sec), 0.0), 2),
                str(text).strip(),
            )
            for start, end, text in sorted(speech_segments, key=lambda item: (item[0], item[1]))
            if str(text).strip() and end - start >= MediaService.MIN_CUT_DURATION_SEC
        ]
        if not normalized_speech:
            return [
                PreparedRepurposeSegment(
                    segment_id=f"segment-{index}",
                    start_sec=round(start, 2),
                    end_sec=round(end, 2),
                    transcript_preview=self._transcript_for_window(speech_segments, start, end),
                    summary=self._transcript_for_window(speech_segments, start, end) or "Visual bridge",
                    timeline_index=index - 1,
                    speech_seconds=round(self._speech_overlap_seconds(speech_segments, start, end), 2),
                    deadspace_ratio=round(self._deadspace_overlap_ratio(default_cuts, start, end), 3),
                    bridge_only=not self._transcript_for_window(speech_segments, start, end),
                )
                for index, (start, end) in enumerate(self._fallback_windows(duration_sec), start=1)
            ]

        beats: list[PreparedRepurposeSegment] = []
        for speech_index, (start, end, text) in enumerate(normalized_speech, start=1):
            next_segment = PreparedRepurposeSegment(
                segment_id=f"speech-{speech_index}",
                start_sec=start,
                end_sec=end,
                transcript_preview=text,
                summary=text,
                speech_seconds=round(max(end - start, 0.0), 2),
                speech_start_sec=start,
                speech_end_sec=end,
                deadspace_ratio=round(self._deadspace_overlap_ratio(default_cuts, start, end), 3),
                scene_break_before=round(start, 2) in scene_break_starts,
                scene_break_after=round(end, 2) in scene_break_ends,
                bridge_only=False,
            )
            if beats and self._should_merge_spoken_beats(
                beats[-1],
                next_segment,
                default_cuts=default_cuts,
                window_features=windows,
            ):
                beats[-1] = self._merge_repurpose_segments(beats[-1], next_segment)
                continue
            beats.append(next_segment)

        beats = self._enforce_minimum_spoken_beats(
            beats,
            default_cuts=default_cuts,
            window_features=windows,
        )
        bridges = self._build_bridge_segments(
            beats=beats,
            default_cuts=default_cuts,
            window_features=windows,
        )
        combined = self._source_order_segments([*beats, *bridges])
        if combined:
            return [
                replace(segment, segment_id=f"segment-{index}", timeline_index=index - 1)
                for index, segment in enumerate(combined, start=1)
            ]

        return [
            PreparedRepurposeSegment(
                segment_id=f"segment-{index}",
                start_sec=round(start, 2),
                end_sec=round(end, 2),
                transcript_preview=self._transcript_for_window(speech_segments, start, end),
                summary=self._transcript_for_window(speech_segments, start, end) or "Visual bridge",
                timeline_index=index - 1,
                speech_seconds=round(self._speech_overlap_seconds(speech_segments, start, end), 2),
                deadspace_ratio=round(self._deadspace_overlap_ratio(default_cuts, start, end), 3),
                bridge_only=not self._transcript_for_window(speech_segments, start, end),
            )
            for index, (start, end) in enumerate(self._fallback_windows(duration_sec), start=1)
        ]

    @classmethod
    def _should_merge_spoken_beats(
        cls,
        left: PreparedRepurposeSegment,
        right: PreparedRepurposeSegment,
        *,
        default_cuts: list[DeadspaceCut],
        window_features: list[EditorialWindow],
    ) -> bool:
        gap_sec = max(right.start_sec - left.end_sec, 0.0)
        if gap_sec >= 0.5:
            return False
        if cls._deadspace_overlap_ratio(default_cuts, left.end_sec, right.start_sec) >= 0.5:
            return False
        if cls._window_has_scene_change(window_features, left.end_sec, right.start_sec):
            return False
        overlap_score = cls._transcript_overlap_score(left.transcript_preview, right.transcript_preview)
        if overlap_score >= 0.7:
            return True
        shared_anchor_count = EditorDraftJobService._shared_anchor_count(
            left.transcript_preview,
            right.transcript_preview,
        )
        if gap_sec <= 0.2 and shared_anchor_count >= 3:
            return True
        if (
            gap_sec <= 0.25
            and EditorDraftJobService._looks_like_question_or_handoff(left.transcript_preview)
            and EditorDraftJobService._looks_like_response_or_continuation(right.transcript_preview)
        ):
            return True
        return False

    @classmethod
    def _merge_repurpose_segments(
        cls,
        left: PreparedRepurposeSegment,
        right: PreparedRepurposeSegment,
    ) -> PreparedRepurposeSegment:
        duration = max(right.end_sec - left.start_sec, 1e-6)
        left_duration = left.duration_sec
        right_duration = right.duration_sec
        transcript_preview = cls._merge_transcript_preview(left.transcript_preview, right.transcript_preview)
        speech_start_sec = left.speech_start_sec if left.speech_start_sec is not None else right.speech_start_sec
        speech_end_sec = right.speech_end_sec if right.speech_end_sec is not None else left.speech_end_sec
        return replace(
            left,
            end_sec=right.end_sec,
            transcript_preview=transcript_preview,
            summary=transcript_preview or left.summary or right.summary,
            speech_seconds=round(left.speech_seconds + right.speech_seconds, 2),
            speech_start_sec=speech_start_sec,
            speech_end_sec=speech_end_sec,
            deadspace_ratio=round(
                (
                    (left.deadspace_ratio * left_duration)
                    + (right.deadspace_ratio * right_duration)
                )
                / duration,
                3,
            ),
            scene_break_after=right.scene_break_after,
            bridge_only=left.bridge_only and right.bridge_only,
        )

    @classmethod
    def _merge_transcript_preview(cls, left: str, right: str) -> str:
        left_clean = left.strip()
        right_clean = right.strip()
        if not left_clean:
            return right_clean
        if not right_clean:
            return left_clean
        if right_clean.lower() in left_clean.lower():
            return left_clean
        if left_clean.lower() in right_clean.lower():
            return right_clean
        words = [*left_clean.split(), *right_clean.split()]
        return " ".join(words[:24]).strip()

    @classmethod
    def _enforce_minimum_spoken_beats(
        cls,
        beats: list[PreparedRepurposeSegment],
        *,
        default_cuts: list[DeadspaceCut],
        window_features: list[EditorialWindow],
    ) -> list[PreparedRepurposeSegment]:
        if not beats:
            return []
        normalized = list(beats)
        index = 0
        while index < len(normalized):
            segment = normalized[index]
            if segment.duration_sec >= cls.MIN_SPOKEN_BEAT_SEC:
                index += 1
                continue

            previous_end_sec = normalized[index - 1].end_sec if index > 0 else 0.0
            next_start_sec = normalized[index + 1].start_sec if index + 1 < len(normalized) else segment.end_sec
            deficit_sec = cls.MIN_SPOKEN_BEAT_SEC - segment.duration_sec
            available_before = max(segment.start_sec - previous_end_sec, 0.0)
            available_after = max(next_start_sec - segment.end_sec, 0.0)
            extend_before = min(deficit_sec / 2.0, available_before)
            extend_after = min(deficit_sec - extend_before, available_after)
            remaining_deficit = deficit_sec - extend_before - extend_after
            if remaining_deficit > 1e-6 and available_before > extend_before:
                extra_before = min(remaining_deficit, available_before - extend_before)
                extend_before += extra_before
                remaining_deficit -= extra_before
            if remaining_deficit > 1e-6 and available_after > extend_after:
                extra_after = min(remaining_deficit, available_after - extend_after)
                extend_after += extra_after
                remaining_deficit -= extra_after
            if extend_before + extend_after >= deficit_sec - 1e-6:
                normalized[index] = replace(
                    segment,
                    start_sec=round(segment.start_sec - extend_before, 2),
                    end_sec=round(segment.end_sec + extend_after, 2),
                    deadspace_ratio=round(
                        cls._deadspace_overlap_ratio(
                            default_cuts,
                            segment.start_sec - extend_before,
                            segment.end_sec + extend_after,
                        ),
                        3,
                    ),
                )
                index += 1
                continue

            merged = False
            if index + 1 < len(normalized) and cls._should_merge_short_spoken_beat(
                segment,
                normalized[index + 1],
                default_cuts=default_cuts,
                window_features=window_features,
            ):
                normalized[index + 1] = cls._merge_repurpose_segments(segment, normalized[index + 1])
                normalized.pop(index)
                merged = True
            elif index > 0 and cls._should_merge_short_spoken_beat(
                normalized[index - 1],
                segment,
                default_cuts=default_cuts,
                window_features=window_features,
            ):
                normalized[index - 1] = cls._merge_repurpose_segments(normalized[index - 1], segment)
                normalized.pop(index)
                merged = True

            if not merged:
                normalized.pop(index)
            elif index > 0:
                index -= 1
        return normalized

    @classmethod
    def _should_merge_short_spoken_beat(
        cls,
        left: PreparedRepurposeSegment,
        right: PreparedRepurposeSegment,
        *,
        default_cuts: list[DeadspaceCut],
        window_features: list[EditorialWindow],
    ) -> bool:
        gap_sec = max(right.start_sec - left.end_sec, 0.0)
        if gap_sec > 0.35:
            return False
        if cls._deadspace_overlap_ratio(default_cuts, left.end_sec, right.start_sec) >= 0.45:
            return False
        if cls._window_has_scene_change(window_features, left.end_sec, right.start_sec):
            return False
        return True

    @classmethod
    def _build_bridge_segments(
        cls,
        *,
        beats: list[PreparedRepurposeSegment],
        default_cuts: list[DeadspaceCut],
        window_features: list[EditorialWindow],
    ) -> list[PreparedRepurposeSegment]:
        bridges: list[PreparedRepurposeSegment] = []
        for bridge_index, (left, right) in enumerate(zip(beats, beats[1:]), start=1):
            start_sec = round(left.end_sec, 2)
            end_sec = round(right.start_sec, 2)
            duration_sec = max(end_sec - start_sec, 0.0)
            if duration_sec < cls.MIN_BRIDGE_BEAT_SEC or duration_sec > cls.MAX_BRIDGE_SEGMENT_SEC:
                continue
            if cls._deadspace_overlap_ratio(default_cuts, start_sec, end_sec) >= 0.5:
                continue
            if cls._window_silence_ratio(window_features, start_sec, end_sec) >= 0.5:
                continue
            bridges.append(
                PreparedRepurposeSegment(
                    segment_id=f"bridge-{bridge_index}",
                    start_sec=start_sec,
                    end_sec=end_sec,
                    transcript_preview="",
                    summary="Visual bridge",
                    speech_seconds=0.0,
                    speech_start_sec=None,
                    speech_end_sec=None,
                    deadspace_ratio=round(cls._deadspace_overlap_ratio(default_cuts, start_sec, end_sec), 3),
                    scene_break_before=left.scene_break_after,
                    scene_break_after=right.scene_break_before,
                    bridge_only=True,
                )
            )
        return bridges

    @staticmethod
    def _fallback_windows(duration_sec: float) -> list[tuple[float, float]]:
        segment_count = 3 if duration_sec <= 18 else 4
        step = max(duration_sec / segment_count, 1.0)
        windows: list[tuple[float, float]] = []
        start = 0.0
        while start < duration_sec - 0.05:
            end = min(duration_sec, start + step)
            windows.append((start, end))
            start = end
        return windows

    @staticmethod
    def _transcript_for_window(
        speech_segments: list[tuple[float, float, str]],
        start_sec: float,
        end_sec: float,
    ) -> str:
        words: list[str] = []
        for segment_start, segment_end, text in speech_segments:
            overlap = max(0.0, min(end_sec, segment_end) - max(start_sec, segment_start))
            if overlap <= 0:
                continue
            words.extend(part for part in text.split() if part.strip())
            if len(words) >= 18:
                break
        return " ".join(words[:18]).strip()

    @staticmethod
    def _speech_overlap_seconds(
        speech_segments: list[tuple[float, float, str]],
        start_sec: float,
        end_sec: float,
    ) -> float:
        overlap_seconds = 0.0
        for segment_start, segment_end, _ in speech_segments:
            overlap_seconds += max(0.0, min(end_sec, segment_end) - max(start_sec, segment_start))
        return overlap_seconds

    @classmethod
    def _speech_overlap_ratio(
        cls,
        speech_segments: list[tuple[float, float, str]],
        start_sec: float,
        end_sec: float,
    ) -> float:
        window_duration = max(end_sec - start_sec, 1e-6)
        return min(max(cls._speech_overlap_seconds(speech_segments, start_sec, end_sec) / window_duration, 0.0), 1.0)

    @staticmethod
    def _deadspace_overlap_ratio(
        cuts: list[DeadspaceCut],
        start_sec: float,
        end_sec: float,
    ) -> float:
        window_duration = max(end_sec - start_sec, 1e-6)
        overlap_seconds = 0.0
        for cut in cuts:
            overlap_seconds += max(0.0, min(end_sec, cut.end) - max(start_sec, cut.start))
        return min(max(overlap_seconds / window_duration, 0.0), 1.0)

    @staticmethod
    def _window_has_scene_change(
        window_features: list[EditorialWindow],
        start_sec: float,
        end_sec: float,
    ) -> bool:
        if end_sec < start_sec:
            return False
        for window in window_features:
            if not window.scene_change:
                continue
            if max(start_sec, window.start_sec) <= min(end_sec, window.end_sec) + 1e-6:
                return True
        return False

    @staticmethod
    def _window_silence_ratio(
        window_features: list[EditorialWindow],
        start_sec: float,
        end_sec: float,
    ) -> float:
        duration_sec = max(end_sec - start_sec, 1e-6)
        overlap_sec = 0.0
        for window in window_features:
            if not window.silence_overlap:
                continue
            overlap_sec += max(0.0, min(end_sec, window.end_sec) - max(start_sec, window.start_sec))
        return min(max(overlap_sec / duration_sec, 0.0), 1.0)

    @staticmethod
    def _transcript_overlap_score(left: str, right: str) -> float:
        left_tokens = re.findall(r"[a-z0-9']+", left.lower())
        right_tokens = re.findall(r"[a-z0-9']+", right.lower())
        if not left_tokens or not right_tokens:
            return 0.0
        left_set = set(left_tokens)
        right_set = set(right_tokens)
        overlap = len(left_set & right_set)
        return overlap / max(min(len(left_set), len(right_set)), 1)

    def _render_variants(
        self,
        *,
        result_paths,
        source_path: Path,
        source_duration_sec: float,
        source_fps: float,
        segments: list[PreparedRepurposeSegment],
        plan: dict[str, object],
        speech_segments: list[tuple[float, float, str]],
        default_cuts: list[DeadspaceCut],
    ) -> list[RepurposeVariant]:
        short_target = 20.0 if source_duration_sec > 30 else max(10.0, min(20.0, source_duration_sec * 0.6))
        variant_plans = self._resolve_variant_plans(
            plan=plan,
            segments=segments,
            source_duration_sec=source_duration_sec,
            short_target=short_target,
            speech_segments=speech_segments,
            default_cuts=default_cuts,
        )
        variants: list[RepurposeVariant] = []

        for index, variant_plan in enumerate(variant_plans, start=1):
            variant_id = f"variant-{index}"
            clip_plans = self._build_variant_sequence_clip_plans(
                ordered_segments=variant_plan.ordered_segments,
                source_path=source_path,
                source_duration_sec=source_duration_sec,
                source_fps=source_fps,
            )
            if not clip_plans:
                raise RuntimeError(
                    f"Repurpose variant {variant_id} did not contain any renderable source intervals."
                )
            total_duration, _timings = self.media.assemble_sequence(
                output_path=result_paths.variant_video_path(variant_id),
                clips=clip_plans,
            )
            stored_video = self.storage.store_media_file(
                result_paths.variant_video_path(variant_id),
                content_type="video/mp4",
            )
            variants.append(
                RepurposeVariant(
                    variantId=variant_id,
                    title=variant_plan.title,
                    angleSummary=variant_plan.angle_summary,
                    rationale=variant_plan.rationale,
                    durationTarget="source" if variant_plan.duration_target == "source" else "short",
                    durationSec=round(total_duration, 2),
                    videoUrl=stored_video.url,
                    videoStorageId=stored_video.storage_id,
                    segmentCount=len(variant_plan.ordered_segments),
                    segments=[
                        RepurposeSegmentSummary(
                            segmentId=segment.segment_id,
                            startSec=segment.start_sec,
                            endSec=segment.end_sec,
                            transcriptPreview=segment.transcript_preview,
                            summary=segment.summary,
                        )
                        for segment in variant_plan.ordered_segments
                    ],
                )
            )
        return variants

    def _resolve_variant_plans(
        self,
        *,
        plan: dict[str, object],
        segments: list[PreparedRepurposeSegment],
        source_duration_sec: float,
        short_target: float,
        speech_segments: list[tuple[float, float, str]],
        default_cuts: list[DeadspaceCut],
    ) -> list[ResolvedRepurposeVariantPlan]:
        ordered_segments = self._source_order_segments(segments)
        source_target = max(source_duration_sec * 0.8, source_duration_sec - 4.0)
        fallback_source_segments = self._fit_source_variant(
            ordered_segments,
            fallback_segments=ordered_segments,
            target_duration=source_target,
        )
        fallback_short_hook = self._best_contiguous_arc(
            ordered_segments,
            target_duration=short_target,
            source_duration_sec=source_duration_sec,
            prefer_late=False,
            duration_target="short",
            speech_segments=speech_segments,
            default_cuts=default_cuts,
        )
        fallback_short_proof = self._best_contiguous_arc(
            ordered_segments,
            target_duration=short_target,
            source_duration_sec=source_duration_sec,
            prefer_late=True,
            duration_target="short",
            speech_segments=speech_segments,
            default_cuts=default_cuts,
            avoid_segment_ids={segment.segment_id for segment in fallback_short_hook},
        )
        raw_variants = plan.get("variants", [])
        if not isinstance(raw_variants, list):
            raw_variants = []
        source_raw = raw_variants[0] if raw_variants and isinstance(raw_variants[0], dict) else {}
        source_segments_candidate = self._sanitize_planned_segments(
            raw_variant=source_raw,
            segments=ordered_segments,
        )
        source_segments_candidate = self._repair_variant_segments(
            ordered_segments=source_segments_candidate,
            all_segments=ordered_segments,
            speech_segments=speech_segments,
            default_cuts=default_cuts,
        )
        source_segments_candidate = self._fit_source_variant(
            source_segments_candidate or fallback_source_segments,
            fallback_segments=ordered_segments,
            target_duration=source_target,
        )
        if not self._variant_is_valid(
            ordered_segments=source_segments_candidate,
            speech_segments=speech_segments,
            default_cuts=default_cuts,
            max_blocks=3,
            duration_target="source",
            source_duration_sec=source_duration_sec,
        ):
            source_segments_candidate = fallback_source_segments

        resolved: list[ResolvedRepurposeVariantPlan] = [
            ResolvedRepurposeVariantPlan(
                title=str(source_raw.get("title") or "Full story"),
                angle_summary=str(source_raw.get("angleSummary") or "Fallback source-led cut."),
                rationale=str(
                    source_raw.get("rationale")
                    or "Generated from the strongest source-order arc because the planned source cut was weak."
                ),
                duration_target="source",
                ordered_segments=source_segments_candidate,
            )
        ]

        short_slot_defaults = [
            (
                raw_variants[1] if len(raw_variants) > 1 and isinstance(raw_variants[1], dict) else {},
                fallback_short_hook,
                False,
                "Quick hook",
                "Fallback early hook-led cut.",
                "Generated from the strongest early contiguous beats because the planned short cut was weak.",
            ),
            (
                raw_variants[2] if len(raw_variants) > 2 and isinstance(raw_variants[2], dict) else {},
                fallback_short_proof,
                True,
                "Proof cut",
                "Fallback later proof-led cut.",
                "Generated from the strongest later contiguous beats because the planned short cut was weak.",
            ),
        ]

        short_variants: list[ResolvedRepurposeVariantPlan] = []
        for raw_variant, fallback_segments, prefer_late, title, angle_summary, rationale in short_slot_defaults:
            selected_segments = self._sanitize_planned_segments(
                raw_variant=raw_variant,
                segments=ordered_segments,
            )
            selected_segments = self._repair_variant_segments(
                ordered_segments=selected_segments,
                all_segments=ordered_segments,
                speech_segments=speech_segments,
                default_cuts=default_cuts,
            )
            selected_segments = self._trim_variant_to_duration(
                selected_segments or fallback_segments,
                target_duration=short_target,
                min_segment_duration=self.MIN_SPOKEN_BEAT_SEC,
                duration_target="short",
            )
            if not self._variant_is_valid(
                ordered_segments=selected_segments,
                speech_segments=speech_segments,
                default_cuts=default_cuts,
                max_blocks=2,
                duration_target="short",
                source_duration_sec=source_duration_sec,
            ):
                replacement = fallback_segments
                if short_variants:
                    replacement = self._best_contiguous_arc(
                        ordered_segments,
                        target_duration=short_target,
                        source_duration_sec=source_duration_sec,
                        prefer_late=prefer_late,
                        duration_target="short",
                        speech_segments=speech_segments,
                        default_cuts=default_cuts,
                        avoid_segment_ids={segment.segment_id for segment in short_variants[0].ordered_segments},
                    )
                selected_segments = replacement

            if not self._variant_is_valid(
                ordered_segments=selected_segments,
                speech_segments=speech_segments,
                default_cuts=default_cuts,
                max_blocks=2,
                duration_target="short",
                source_duration_sec=source_duration_sec,
            ):
                continue

            short_variants.append(
                ResolvedRepurposeVariantPlan(
                    title=str(raw_variant.get("title") or title),
                    angle_summary=str(raw_variant.get("angleSummary") or angle_summary),
                    rationale=str(raw_variant.get("rationale") or rationale),
                    duration_target="short",
                    ordered_segments=selected_segments,
                )
            )

        if len(short_variants) >= 2:
            first_variant = short_variants[0]
            second_variant = short_variants[1]
            if (
                self._overlap_ratio(first_variant.ordered_segments, second_variant.ordered_segments) > 0.75
                or (
                    first_variant.ordered_segments
                    and second_variant.ordered_segments
                    and first_variant.ordered_segments[0].segment_id == second_variant.ordered_segments[0].segment_id
                )
            ):
                replacement_segments = self._best_contiguous_arc(
                    ordered_segments,
                    target_duration=short_target,
                    source_duration_sec=source_duration_sec,
                    prefer_late=True,
                    duration_target="short",
                    speech_segments=speech_segments,
                    default_cuts=default_cuts,
                    avoid_segment_ids={segment.segment_id for segment in first_variant.ordered_segments},
                )
                if self._variant_is_valid(
                    ordered_segments=replacement_segments,
                    speech_segments=speech_segments,
                    default_cuts=default_cuts,
                    max_blocks=2,
                    duration_target="short",
                    source_duration_sec=source_duration_sec,
                ):
                    short_variants[1] = ResolvedRepurposeVariantPlan(
                        title=second_variant.title,
                        angle_summary=second_variant.angle_summary,
                        rationale=second_variant.rationale,
                        duration_target="short",
                        ordered_segments=replacement_segments,
                    )
                else:
                    short_variants.pop()

        resolved.extend(short_variants)
        return resolved[: self.MAX_VARIANTS]

    @staticmethod
    def _sanitize_planned_segments(
        *,
        raw_variant: dict[str, object],
        segments: list[PreparedRepurposeSegment],
    ) -> list[PreparedRepurposeSegment]:
        segment_map = {segment.segment_id: segment for segment in segments}
        ordered_segments: list[PreparedRepurposeSegment] = []
        seen_segment_ids: set[str] = set()
        for item in raw_variant.get("orderedSegments", []):
            if not isinstance(item, dict):
                continue
            segment_id = str(item.get("segmentId") or "")
            if not segment_id or segment_id in seen_segment_ids or segment_id not in segment_map:
                continue
            ordered_segments.append(segment_map[segment_id])
            seen_segment_ids.add(segment_id)
        return ordered_segments

    @classmethod
    def _repair_variant_segments(
        cls,
        *,
        ordered_segments: list[PreparedRepurposeSegment],
        all_segments: list[PreparedRepurposeSegment],
        speech_segments: list[tuple[float, float, str]],
        default_cuts: list[DeadspaceCut],
    ) -> list[PreparedRepurposeSegment]:
        selected = cls._collapse_redundant_adjacent_segments(cls._source_order_segments(ordered_segments))
        if not selected:
            return []

        repaired = [selected[0]]
        for segment in selected[1:]:
            previous = repaired[-1]
            if segment.timeline_index <= previous.timeline_index:
                continue
            gap_sec = max(segment.start_sec - previous.end_sec, 0.0)
            if gap_sec > 1.0 and not cls._is_low_value_gap(
                previous.end_sec,
                segment.start_sec,
                speech_segments=speech_segments,
                default_cuts=default_cuts,
            ):
                for candidate in all_segments:
                    if candidate.timeline_index <= previous.timeline_index:
                        continue
                    if candidate.timeline_index >= segment.timeline_index:
                        break
                    if candidate.bridge_only and candidate.duration_sec > cls.MAX_BRIDGE_SEGMENT_SEC:
                        continue
                    repaired.append(candidate)
            repaired.append(segment)
        return cls._collapse_redundant_adjacent_segments(cls._source_order_segments(repaired))

    @classmethod
    def _variant_is_valid(
        cls,
        *,
        ordered_segments: list[PreparedRepurposeSegment],
        speech_segments: list[tuple[float, float, str]],
        default_cuts: list[DeadspaceCut],
        max_blocks: int,
        duration_target: str,
        source_duration_sec: float,
    ) -> bool:
        if not ordered_segments:
            return False
        source_order = cls._source_order_segments(ordered_segments)
        if [segment.segment_id for segment in source_order] != [segment.segment_id for segment in ordered_segments]:
            return False
        if len(cls._variant_blocks(source_order)) > max_blocks:
            return False
        if any(
            segment.duration_sec < cls._minimum_segment_duration(segment) - 1e-6
            for segment in source_order
        ):
            return False
        if cls._has_redundant_adjacent_slice(source_order):
            return False
        for previous, current in zip(source_order, source_order[1:]):
            gap_sec = max(current.start_sec - previous.end_sec, 0.0)
            if gap_sec > 1.0 and not cls._is_low_value_gap(
                previous.end_sec,
                current.start_sec,
                speech_segments=speech_segments,
                default_cuts=default_cuts,
            ):
                return False
        total_duration = sum(segment.duration_sec for segment in source_order)
        spoken_duration = sum(segment.speech_seconds for segment in source_order)
        meaningful_beats = sum(1 for segment in source_order if cls._is_meaningful_segment(segment))
        if duration_target == "source":
            return total_duration >= source_duration_sec * cls.MIN_SOURCE_VARIANT_RATIO
        return (
            total_duration >= cls.MIN_SHORT_VARIANT_SEC
            and spoken_duration >= cls.MIN_SHORT_SPOKEN_SEC
            and meaningful_beats >= 2
        )

    @staticmethod
    def _variant_blocks(
        ordered_segments: list[PreparedRepurposeSegment],
    ) -> list[list[PreparedRepurposeSegment]]:
        if not ordered_segments:
            return []
        blocks: list[list[PreparedRepurposeSegment]] = [[ordered_segments[0]]]
        for segment in ordered_segments[1:]:
            previous = blocks[-1][-1]
            if segment.start_sec - previous.end_sec > 1.0:
                blocks.append([segment])
                continue
            blocks[-1].append(segment)
        return blocks

    @classmethod
    def _is_low_value_gap(
        cls,
        start_sec: float,
        end_sec: float,
        *,
        speech_segments: list[tuple[float, float, str]],
        default_cuts: list[DeadspaceCut],
    ) -> bool:
        if end_sec - start_sec <= 1.0:
            return True
        deadspace_ratio = cls._deadspace_overlap_ratio(default_cuts, start_sec, end_sec)
        speech_ratio = cls._speech_overlap_ratio(speech_segments, start_sec, end_sec)
        return deadspace_ratio >= 0.6 or speech_ratio <= 0.15

    @classmethod
    def _minimum_segment_duration(cls, segment: PreparedRepurposeSegment) -> float:
        return cls.MIN_BRIDGE_BEAT_SEC if segment.bridge_only else cls.MIN_SPOKEN_BEAT_SEC

    @staticmethod
    def _is_meaningful_segment(segment: PreparedRepurposeSegment) -> bool:
        return not segment.bridge_only and (
            segment.speech_seconds >= 0.5 or bool(segment.transcript_preview.strip())
        )

    @classmethod
    def _has_redundant_adjacent_slice(cls, ordered_segments: list[PreparedRepurposeSegment]) -> bool:
        for left, right in zip(ordered_segments, ordered_segments[1:]):
            if right.start_sec - left.end_sec > 0.2:
                continue
            if cls._transcript_overlap_score(left.transcript_preview, right.transcript_preview) >= 0.7:
                return True
        return False

    @classmethod
    def _collapse_redundant_adjacent_segments(
        cls,
        ordered_segments: list[PreparedRepurposeSegment],
    ) -> list[PreparedRepurposeSegment]:
        if not ordered_segments:
            return []
        collapsed = [ordered_segments[0]]
        for segment in ordered_segments[1:]:
            previous = collapsed[-1]
            if (
                segment.start_sec - previous.end_sec <= 0.2
                and cls._transcript_overlap_score(previous.transcript_preview, segment.transcript_preview) >= 0.7
            ):
                collapsed[-1] = cls._merge_repurpose_segments(previous, segment)
                continue
            collapsed.append(segment)
        return collapsed

    @staticmethod
    def _source_order_segments(
        segments: list[PreparedRepurposeSegment],
    ) -> list[PreparedRepurposeSegment]:
        ordered: list[PreparedRepurposeSegment] = []
        seen_ids: set[str] = set()
        for segment in sorted(segments, key=lambda item: (item.timeline_index, item.start_sec, item.end_sec)):
            if segment.segment_id in seen_ids:
                continue
            seen_ids.add(segment.segment_id)
            ordered.append(segment)
        return ordered

    @classmethod
    def _fit_source_variant(
        cls,
        ordered_segments: list[PreparedRepurposeSegment],
        *,
        fallback_segments: list[PreparedRepurposeSegment],
        target_duration: float,
    ) -> list[PreparedRepurposeSegment]:
        selected = cls._ensure_source_length_variant(
            ordered_segments,
            fallback_segments=fallback_segments,
            target_duration=target_duration,
        )
        if sum(segment.duration_sec for segment in selected) > target_duration * 1.15:
            return cls._trim_variant_to_duration(
                selected,
                target_duration=target_duration,
                duration_target="source",
            )
        return selected

    @staticmethod
    def _ensure_source_length_variant(
        ordered_segments: list[PreparedRepurposeSegment],
        *,
        fallback_segments: list[PreparedRepurposeSegment],
        target_duration: float,
    ) -> list[PreparedRepurposeSegment]:
        selected_ids = {segment.segment_id for segment in ordered_segments}
        duration = sum(segment.duration_sec for segment in ordered_segments)
        for segment in fallback_segments:
            if duration >= target_duration:
                break
            if segment.segment_id in selected_ids:
                continue
            selected_ids.add(segment.segment_id)
            duration += segment.duration_sec
        return [
            segment
            for segment in fallback_segments
            if segment.segment_id in selected_ids
        ]

    @classmethod
    def _trim_variant_to_duration(
        cls,
        ordered_segments: list[PreparedRepurposeSegment],
        *,
        target_duration: float,
        min_segment_duration: float | None = None,
        duration_target: str = "short",
    ) -> list[PreparedRepurposeSegment]:
        selected = cls._source_order_segments(list(ordered_segments))
        if not selected:
            return []

        while sum(segment.duration_sec for segment in selected) > target_duration + 1e-6 and selected:
            overage = sum(segment.duration_sec for segment in selected) - target_duration
            changed = False

            last_segment = selected[-1]
            safe_min_duration = max(
                min_segment_duration or cls._minimum_segment_duration(last_segment),
                cls._minimum_segment_duration(last_segment),
            )
            min_end_sec = cls._segment_safe_min_end(
                last_segment,
                min_segment_duration=safe_min_duration,
            )
            trimmable = max(last_segment.end_sec - min_end_sec, 0.0)
            if trimmable > 1e-6:
                trim_amount = min(trimmable, overage)
                selected[-1] = cls._trim_segment_end(
                    last_segment,
                    last_segment.end_sec - trim_amount,
                    min_end_sec=min_end_sec,
                )
                changed = True
            if changed:
                continue

            for index in range(len(selected) - 1, -1, -1):
                if not selected[index].bridge_only or len(selected) <= 1:
                    continue
                selected.pop(index)
                changed = True
                break
            if changed:
                continue

            blocks = cls._variant_blocks(selected)
            if len(blocks) > 1:
                tail_block = blocks[-1]
                candidate = [segment for block in blocks[:-1] for segment in block]
                if candidate and sum(segment.duration_sec for segment in candidate) >= target_duration - 1.0:
                    selected = candidate
                    changed = True
            if changed:
                continue

            if len(selected) > 1:
                selected.pop()
                changed = True
            if not changed:
                break

        return [
            segment
            for segment in selected
            if segment.duration_sec >= cls._minimum_segment_duration(segment) - 1e-6
        ]

    @staticmethod
    def _trim_segment_end(
        segment: PreparedRepurposeSegment,
        end_sec: float,
        *,
        min_end_sec: float | None = None,
    ) -> PreparedRepurposeSegment:
        end_floor = min_end_sec if min_end_sec is not None else segment.start_sec + MediaService.MIN_CUT_DURATION_SEC
        new_end_sec = min(max(end_sec, end_floor), segment.end_sec)
        if segment.duration_sec <= 0:
            return segment
        ratio = max(new_end_sec - segment.start_sec, 0.0) / segment.duration_sec
        return replace(
            segment,
            end_sec=round(new_end_sec, 2),
            speech_seconds=round(segment.speech_seconds * ratio, 2),
            speech_end_sec=min(segment.speech_end_sec, round(new_end_sec, 2))
            if segment.speech_end_sec is not None
            else None,
            bridge_only=segment.bridge_only and (new_end_sec - segment.start_sec) <= RepurposeJobService.MAX_BRIDGE_SEGMENT_SEC,
        )

    @classmethod
    def _segment_safe_min_end(
        cls,
        segment: PreparedRepurposeSegment,
        *,
        min_segment_duration: float,
    ) -> float:
        minimum_end = segment.start_sec + max(min_segment_duration, MediaService.MIN_CUT_DURATION_SEC)
        if segment.speech_end_sec is not None:
            minimum_end = max(minimum_end, segment.speech_end_sec + cls.SPEECH_TAIL_PAD_SEC)
        return min(max(minimum_end, segment.start_sec), segment.end_sec)

    @classmethod
    def _best_contiguous_arc(
        cls,
        segments: list[PreparedRepurposeSegment],
        *,
        target_duration: float,
        source_duration_sec: float,
        prefer_late: bool,
        duration_target: str,
        speech_segments: list[tuple[float, float, str]] | None = None,
        default_cuts: list[DeadspaceCut] | None = None,
        avoid_segment_ids: set[str] | None = None,
    ) -> list[PreparedRepurposeSegment]:
        ordered_segments = cls._source_order_segments(segments)
        best_arc: list[PreparedRepurposeSegment] = []
        best_score = float("-inf")
        max_blocks = 3 if duration_target == "source" else 2
        for start_index in range(len(ordered_segments)):
            current: list[PreparedRepurposeSegment] = []
            current_duration = 0.0
            current_blocks = 0
            for segment in ordered_segments[start_index:]:
                if current:
                    gap_sec = segment.start_sec - current[-1].end_sec
                    if gap_sec > 1.0:
                        if (
                            speech_segments is None
                            or default_cuts is None
                            or not cls._is_low_value_gap(
                                current[-1].end_sec,
                                segment.start_sec,
                                speech_segments=speech_segments,
                                default_cuts=default_cuts,
                            )
                        ):
                            break
                        if current_blocks + 1 > max_blocks:
                            break
                        current_blocks += 1
                elif not current:
                    current_blocks = 1
                current.append(segment)
                current_duration += segment.duration_sec
                score = cls._score_arc(
                    current,
                    target_duration=target_duration,
                    source_duration_sec=source_duration_sec,
                    prefer_late=prefer_late,
                    avoid_segment_ids=avoid_segment_ids or set(),
                )
                candidate = cls._trim_variant_to_duration(
                    current,
                    target_duration=target_duration,
                    duration_target=duration_target,
                )
                if not cls._meets_variant_duration_requirements(
                    candidate,
                    duration_target=duration_target,
                    source_duration_sec=source_duration_sec,
                ):
                    if current_duration >= target_duration * 1.3:
                        break
                    continue
                if score > best_score:
                    best_score = score
                    best_arc = list(candidate)
                if current_duration >= target_duration * 1.3:
                    break
        if not best_arc:
            if duration_target == "short":
                return []
            return cls._trim_variant_to_duration(
                ordered_segments,
                target_duration=target_duration,
                duration_target=duration_target,
            )
        return cls._trim_variant_to_duration(
            best_arc,
            target_duration=target_duration,
            duration_target=duration_target,
        )

    @classmethod
    def _meets_variant_duration_requirements(
        cls,
        ordered_segments: list[PreparedRepurposeSegment],
        *,
        duration_target: str,
        source_duration_sec: float,
    ) -> bool:
        total_duration = sum(segment.duration_sec for segment in ordered_segments)
        if duration_target == "source":
            return total_duration >= source_duration_sec * cls.MIN_SOURCE_VARIANT_RATIO
        spoken_duration = sum(segment.speech_seconds for segment in ordered_segments)
        meaningful_beats = sum(1 for segment in ordered_segments if cls._is_meaningful_segment(segment))
        return (
            total_duration >= cls.MIN_SHORT_VARIANT_SEC
            and spoken_duration >= cls.MIN_SHORT_SPOKEN_SEC
            and meaningful_beats >= 2
        )

    @classmethod
    def _score_arc(
        cls,
        arc: list[PreparedRepurposeSegment],
        *,
        target_duration: float,
        source_duration_sec: float,
        prefer_late: bool,
        avoid_segment_ids: set[str],
    ) -> float:
        duration = sum(segment.duration_sec for segment in arc)
        speech = sum(segment.speech_seconds for segment in arc)
        deadspace_penalty = sum(segment.duration_sec * segment.deadspace_ratio for segment in arc)
        bridge_penalty = sum(0.4 for segment in arc if segment.bridge_only)
        overlap_penalty = sum(segment.duration_sec for segment in arc if segment.segment_id in avoid_segment_ids) * 4.0
        start_position = arc[0].start_sec / max(source_duration_sec, 1.0)
        position_bonus = start_position if prefer_late else (1.0 - start_position)
        duration_penalty = abs(duration - target_duration) * 0.35
        return (speech * 1.4) + (duration * 0.3) + position_bonus - deadspace_penalty - bridge_penalty - overlap_penalty - duration_penalty

    @staticmethod
    def _overlap_ratio(
        left: list[PreparedRepurposeSegment],
        right: list[PreparedRepurposeSegment],
    ) -> float:
        left_duration = sum(segment.duration_sec for segment in left)
        right_duration = sum(segment.duration_sec for segment in right)
        denominator = min(left_duration, right_duration)
        if denominator <= 1e-6:
            return 0.0
        overlap = 0.0
        for left_segment in left:
            for right_segment in right:
                overlap += max(0.0, min(left_segment.end_sec, right_segment.end_sec) - max(left_segment.start_sec, right_segment.start_sec))
        return overlap / denominator

    @classmethod
    def _build_variant_sequence_clip_plans(
        cls,
        *,
        ordered_segments: list[PreparedRepurposeSegment],
        source_path: Path,
        source_duration_sec: float,
        source_fps: float,
    ) -> list[SequenceClipPlan]:
        intervals = cls._normalize_variant_intervals(
            ordered_segments=ordered_segments,
            source_duration_sec=source_duration_sec,
            source_fps=source_fps,
        )
        return [
            SequenceClipPlan(
                clip_id=f"repurpose-range-{index + 1}",
                source_path=source_path,
                cuts=cls._cuts_for_interval(
                    keep_start=start_sec,
                    keep_end=end_sec,
                    total_duration_sec=source_duration_sec,
                ),
                total_duration_sec=source_duration_sec,
            )
            for index, (start_sec, end_sec) in enumerate(intervals)
        ]

    @classmethod
    def _normalize_variant_intervals(
        cls,
        *,
        ordered_segments: list[PreparedRepurposeSegment],
        source_duration_sec: float,
        source_fps: float,
    ) -> list[tuple[float, float]]:
        if source_duration_sec <= 0:
            return []

        frame_duration_sec = (1.0 / source_fps) if source_fps > 0 else 0.0
        merge_tolerance_sec = (frame_duration_sec / 2.0) if frame_duration_sec > 0 else 1e-3
        normalized: list[tuple[float, float]] = []
        source_order = cls._source_order_segments(ordered_segments)

        for index, segment in enumerate(source_order):
            raw_start_sec = max(0.0, min(segment.start_sec, source_duration_sec))
            raw_end_sec = max(0.0, min(segment.end_sec, source_duration_sec))
            if raw_end_sec - raw_start_sec <= 0:
                continue

            previous_kept_end = source_order[index - 1].end_sec if index > 0 else 0.0
            next_kept_start = (
                source_order[index + 1].start_sec
                if index + 1 < len(source_order)
                else source_duration_sec
            )
            speech_protected = segment.speech_seconds > 0 or bool(segment.transcript_preview.strip())
            start_sec = raw_start_sec
            end_sec = raw_end_sec
            if speech_protected:
                speech_start_sec = segment.speech_start_sec if segment.speech_start_sec is not None else raw_start_sec
                speech_end_sec = segment.speech_end_sec if segment.speech_end_sec is not None else raw_end_sec
                start_sec = max(previous_kept_end, min(raw_start_sec, speech_start_sec - cls.SPEECH_HEAD_PAD_SEC))
                end_sec = min(next_kept_start, max(raw_end_sec, speech_end_sec + cls.SPEECH_TAIL_PAD_SEC))
            if frame_duration_sec > 0:
                if speech_protected:
                    start_sec = cls._snap_backward_to_frame(start_sec, frame_duration_sec, source_duration_sec)
                    end_sec = cls._snap_forward_to_frame(end_sec, frame_duration_sec, source_duration_sec)
                else:
                    start_sec = cls._snap_forward_to_frame(start_sec, frame_duration_sec, source_duration_sec)
                    end_sec = cls._snap_backward_to_frame(end_sec, frame_duration_sec, source_duration_sec)

            start_sec = max(start_sec, previous_kept_end)
            end_sec = min(end_sec, next_kept_start)

            if end_sec - start_sec < cls._minimum_segment_duration(segment) - 1e-6:
                continue

            if normalized:
                previous_start_sec, previous_end_sec = normalized[-1]
                if (
                    start_sec >= previous_start_sec
                    and start_sec <= previous_end_sec + merge_tolerance_sec
                ):
                    normalized[-1] = (previous_start_sec, max(previous_end_sec, end_sec))
                    continue

            normalized.append((start_sec, end_sec))

        return normalized

    @staticmethod
    def _snap_forward_to_frame(
        value_sec: float,
        frame_duration_sec: float,
        max_duration_sec: float,
    ) -> float:
        frame_index = math.ceil((value_sec / frame_duration_sec) - 1e-9)
        snapped = frame_index * frame_duration_sec
        return min(max(snapped, 0.0), max_duration_sec)

    @staticmethod
    def _snap_backward_to_frame(
        value_sec: float,
        frame_duration_sec: float,
        max_duration_sec: float,
    ) -> float:
        frame_index = math.floor((value_sec / frame_duration_sec) + 1e-9)
        snapped = frame_index * frame_duration_sec
        return min(max(snapped, 0.0), max_duration_sec)

    @staticmethod
    def _cuts_for_interval(
        *,
        keep_start: float,
        keep_end: float,
        total_duration_sec: float,
    ) -> list[tuple[float, float]]:
        cuts: list[tuple[float, float]] = []
        if keep_start > 0.01:
            cuts.append((0.0, keep_start))
        if keep_end < total_duration_sec - 0.01:
            cuts.append((keep_end, total_duration_sec))
        return cuts

    @staticmethod
    def _build_repurpose_warnings(
        *,
        variants: list[RepurposeVariant],
        source_duration_sec: float,
        speech_coverage: float,
    ) -> list[str]:
        warnings: list[str] = []
        if speech_coverage < 0.2:
            warnings.append(
                "Limited spoken context was detected, so repurpose angles relied more heavily on timeline heuristics."
            )
        if source_duration_sec > 30:
            short_variants = [variant for variant in variants if variant.durationTarget == "short"]
            if any(variant.durationSec > 26 for variant in short_variants):
                warnings.append(
                    "One or more short variants stayed above the ideal 20-second target because the source beats did not compress cleanly."
                )
        return EditorDraftJobService._dedupe_warnings(warnings)
