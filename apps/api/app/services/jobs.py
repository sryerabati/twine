from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
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
    recorded_at: datetime | None
    file_modified_at: datetime | None
    transcript_preview: str
    transcript_tail: str
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
