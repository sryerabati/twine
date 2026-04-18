from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from app.models.contracts import AnalysisResponse
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.storage import StorageService
from app.services.gemini_runner import GeminiIntegrationError
from app.services.tribe_runner import TribeIntegrationError, TribeRunner


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
