from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings


logger = logging.getLogger(__name__)
_REQUEST_TIMEOUT_SECONDS = 5.0


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
                "errorMessage": str(error_message)[:500] if error_message is not None else None,
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
        if not self.enabled:
            return
        compact_payload = {key: value for key, value in payload.items() if value is not None}
        base = (self.settings.convex_site_url or "").rstrip("/")
        url = f"{base}{path}"
        try:
            response = httpx.post(
                url,
                json=compact_payload,
                headers={
                    "content-type": "application/json",
                    "x-service-secret": self.settings.convex_service_secret or "",
                },
                timeout=_REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as exc:
            logger.warning("Convex sync failed for %s: %s", path, exc)
            return
        if response.status_code >= 400:
            logger.warning(
                "Convex sync failed for %s: status=%s",
                path,
                response.status_code,
            )
