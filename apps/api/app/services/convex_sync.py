from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings


logger = logging.getLogger(__name__)


class ConvexSyncService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return self.settings.convex_sync_enabled

    def attach_upload_local_id(
        self,
        *,
        convex_upload_id: str | None,
        local_upload_id: str,
        duration_sec: float | None,
    ) -> None:
        if not self.enabled or not convex_upload_id:
            return
        self._post(
            "/service/upload/attach",
            {
                "uploadId": convex_upload_id,
                "localUploadId": local_upload_id,
                "durationSec": duration_sec,
            },
        )

    def update_scan_status(
        self,
        *,
        convex_scan_id: str | None,
        status: str,
        local_analysis_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        if not self.enabled or not convex_scan_id:
            return
        self._post(
            "/service/scan/status",
            {
                "scanId": convex_scan_id,
                "status": status,
                "localAnalysisId": local_analysis_id,
                "errorMessage": error_message,
            },
        )

    def attach_scan_summary(
        self,
        *,
        convex_scan_id: str | None,
        viral_potential: int | None,
        hook_score: int | None,
        pacing_score: int | None,
        retention_estimate: int | None,
        deadspace_seconds: float | None,
        trimmed_duration_sec: float | None,
        overall_recommendation: str | None,
    ) -> None:
        if not self.enabled or not convex_scan_id:
            return
        self._post(
            "/service/scan/summary",
            {
                "scanId": convex_scan_id,
                "viralPotential": viral_potential,
                "hookScore": hook_score,
                "pacingScore": pacing_score,
                "retentionEstimate": retention_estimate,
                "deadspaceSeconds": deadspace_seconds,
                "trimmedDurationSec": trimmed_duration_sec,
                "overallRecommendation": overall_recommendation,
            },
        )

    def _post(self, path: str, payload: dict[str, Any]) -> None:
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    f"{self.settings.convex_site_url}{path}",
                    json=payload,
                    headers={"x-service-secret": self.settings.convex_service_secret or ""},
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Convex sync failed for %s: %s", path, exc)
