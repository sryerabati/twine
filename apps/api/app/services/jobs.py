from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from app.models.contracts import AnalysisResponse
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.storage import StorageService
from app.services.tribe_runner import TribeIntegrationError, TribeRunner


class AnalysisJobService:
    """Runs analyses on a background thread and (optionally) mirrors lifecycle
    events to Convex.

    Convex sync points, in order:
      1. queued  -> pushed by the router right after `enqueue`
      2. running -> pushed here when the worker picks up the job
      3. completed/failed -> pushed here at the end, plus the summary fields

    If `convex_scan_id` is None (no Convex-integrated client), every sync call
    short-circuits inside ConvexSyncService.
    """

    def __init__(
        self,
        storage: StorageService,
        runner: TribeRunner,
        engine: AnalysisEngine,
        convex: ConvexSyncService,
    ) -> None:
        self.storage = storage
        self.runner = runner
        self.engine = engine
        self.convex = convex
        self.executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="tribe-analysis"
        )

    def enqueue(
        self,
        analysis_id: str,
        upload_id: str,
        convex_scan_id: str | None = None,
    ) -> None:
        self.executor.submit(
            self._run_analysis, analysis_id, upload_id, convex_scan_id
        )

    def run_now(
        self,
        analysis_id: str,
        upload_id: str,
        convex_scan_id: str | None = None,
    ) -> None:
        self._run_analysis(analysis_id, upload_id, convex_scan_id)

    def _run_analysis(
        self,
        analysis_id: str,
        upload_id: str,
        convex_scan_id: str | None,
    ) -> None:
        record = self.storage.read_analysis_record(analysis_id)
        running = record.model_copy(
            update={"status": "running", "updatedAt": datetime.now(UTC)}
        )
        self.storage.write_analysis_record(running)

        if convex_scan_id:
            self.convex.update_scan_status(
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
            analysis_paths.events_path.write_text(
                artifacts.events_csv, encoding="utf-8"
            )
            self.storage.write_segments(analysis_id, artifacts.segments_json)
            self.storage.write_preds(analysis_id, artifacts.preds)
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

            if convex_scan_id:
                scores = artifacts.payload.scores
                diagnostics = artifacts.payload.diagnostics
                self.convex.attach_scan_summary(
                    convex_scan_id=convex_scan_id,
                    viral_potential=scores.viralPotential,
                    hook_score=scores.hookScore,
                    pacing_score=scores.pacingScore,
                    retention_estimate=scores.retentionEstimate,
                    deadspace_seconds=diagnostics.deadspaceSeconds,
                    trimmed_duration_sec=diagnostics.trimmedDurationSec,
                )
                self.convex.update_scan_status(
                    convex_scan_id=convex_scan_id,
                    status="completed",
                    local_analysis_id=analysis_id,
                )
        except (TribeIntegrationError, FileNotFoundError, RuntimeError) as exc:
            failed = AnalysisResponse(
                analysisId=analysis_id,
                status="failed",
                createdAt=record.createdAt,
                updatedAt=datetime.now(UTC),
                error=str(exc),
                payload=None,
            )
            self.storage.write_analysis_record(failed)

            if convex_scan_id:
                self.convex.update_scan_status(
                    convex_scan_id=convex_scan_id,
                    status="failed",
                    local_analysis_id=analysis_id,
                    error_message=str(exc),
                )
