"""Shared-secret HTTP client for syncing scan lifecycle state to Convex.

Security model:
- All requests attach `x-service-secret: <CONVEX_SERVICE_SECRET>`.
- Convex `http.ts` compares the secret in constant time and rejects missing/wrong secrets.
- URLs are constructed from `settings.convex_site_url` only (never from user input).
- We never forward raw stderr/stack traces from FastAPI to Convex; only status,
  opaque IDs, and a bounded-length error message.
- This client swallows and logs HTTP/network failures instead of raising. Convex
  going down must not take down the analysis pipeline — the durable record of
  "what happened" is still in FastAPI's local storage.

Idempotency:
- Every Convex service endpoint is designed to be safely retryable. If a retry
  happens, the result is the same as a single call.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import Settings


logger = logging.getLogger(__name__)

# Bound how long a Convex call can hold up the analysis pipeline. Convex HTTP
# actions typically respond in <200ms; 5s is a generous hard ceiling.
_REQUEST_TIMEOUT_SECONDS = 5.0


class ConvexSyncService:
    """Fire-and-forget writer to Convex's service HTTP routes.

    If Convex is not configured (no site URL or secret), every method is a no-op.
    If a request fails, it's logged at WARNING level and swallowed so the
    analysis pipeline keeps running.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def enabled(self) -> bool:
        return bool(
            self._settings.convex_site_url and self._settings.convex_service_secret
        )

    def attach_upload_local_id(
        self,
        convex_upload_id: str,
        local_upload_id: str,
        duration_sec: float | None = None,
    ) -> None:
        """Tell Convex which FastAPI upload id maps to this user-owned upload row."""
        if not convex_upload_id:
            return
        payload: dict[str, Any] = {
            "uploadId": convex_upload_id,
            "localUploadId": local_upload_id,
        }
        if duration_sec is not None:
            payload["durationSec"] = float(duration_sec)
        self._post("/service/upload/attach", payload)

    def update_scan_status(
        self,
        convex_scan_id: str,
        status: str,
        local_analysis_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        """Push a lifecycle transition to Convex.

        status must be one of queued|running|completed|failed. The Convex-side
        validator will reject anything else, so we pass status through verbatim
        rather than re-validating here.
        """
        if not convex_scan_id:
            return
        payload: dict[str, Any] = {
            "scanId": convex_scan_id,
            "status": status,
        }
        if local_analysis_id is not None:
            payload["localAnalysisId"] = local_analysis_id
        if error_message is not None:
            # Cap the message before we even send it. Convex also caps to 500.
            payload["errorMessage"] = str(error_message)[:500]
        self._post("/service/scan/status", payload)

    def attach_scan_summary(
        self,
        convex_scan_id: str,
        *,
        viral_potential: int | None = None,
        hook_score: int | None = None,
        pacing_score: int | None = None,
        retention_estimate: int | None = None,
        deadspace_seconds: float | None = None,
        trimmed_duration_sec: float | None = None,
    ) -> None:
        """Push summary fields for a completed scan so the history page can render."""
        if not convex_scan_id:
            return
        payload: dict[str, Any] = {"scanId": convex_scan_id}
        if viral_potential is not None:
            payload["viralPotential"] = int(viral_potential)
        if hook_score is not None:
            payload["hookScore"] = int(hook_score)
        if pacing_score is not None:
            payload["pacingScore"] = int(pacing_score)
        if retention_estimate is not None:
            payload["retentionEstimate"] = int(retention_estimate)
        if deadspace_seconds is not None:
            payload["deadspaceSeconds"] = float(deadspace_seconds)
        if trimmed_duration_sec is not None:
            payload["trimmedDurationSec"] = float(trimmed_duration_sec)
        self._post("/service/scan/summary", payload)

    # --- internals ---

    def _post(self, path: str, payload: dict[str, Any]) -> None:
        if not self.enabled:
            logger.debug(
                "Convex sync skipped: not configured. path=%s", path
            )
            return
        base = (self._settings.convex_site_url or "").rstrip("/")
        url = f"{base}{path}"
        headers = {
            "content-type": "application/json",
            "x-service-secret": self._settings.convex_service_secret or "",
        }
        try:
            response = httpx.post(
                url,
                json=payload,
                headers=headers,
                timeout=_REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as exc:
            logger.warning("Convex sync network error: path=%s err=%s", path, exc)
            return
        if response.status_code >= 400:
            # Convex returns plain text bodies for errors. Don't blindly log the
            # body to avoid leaking anything unexpected.
            logger.warning(
                "Convex sync failed: path=%s status=%s",
                path,
                response.status_code,
            )
