from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings


logger = logging.getLogger(__name__)
_SERVICE_REQUEST_TIMEOUT_SECONDS = 5.0
_TRANSFER_TIMEOUT_SECONDS = 120.0


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
        video_storage_id: str | None = None,
        thumbnail_storage_id: str | None = None,
    ) -> None:
        if not self.enabled or not convex_upload_id:
            return
        self._post(
            "/service/upload/attach",
            {
                "uploadId": convex_upload_id,
                "localUploadId": local_upload_id,
                "durationSec": duration_sec,
                "videoStorageId": video_storage_id,
                "thumbnailStorageId": thumbnail_storage_id,
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

    def update_editor_project_status(
        self,
        *,
        convex_project_id: str | None,
        status: str,
        latest_local_draft_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        if not self.enabled or not convex_project_id:
            return
        self._post(
            "/service/editor-project/status",
            {
                "projectId": convex_project_id,
                "status": status,
                "latestLocalDraftId": latest_local_draft_id,
                "errorMessage": str(error_message)[:500] if error_message is not None else None,
            },
        )

    def attach_editor_draft_summary(
        self,
        *,
        convex_project_id: str | None,
        latest_local_draft_id: str | None,
        latest_export_url: str | None,
        latest_export_storage_id: str | None,
        storyline_summary: str | None,
        ordering_confidence: str | None,
        warning_count: int | None,
    ) -> None:
        if not self.enabled or not convex_project_id:
            return
        self._post(
            "/service/editor-project/draft-summary",
            {
                "projectId": convex_project_id,
                "latestLocalDraftId": latest_local_draft_id,
                "latestExportUrl": latest_export_url,
                "latestExportStorageId": latest_export_storage_id,
                "storylineSummary": storyline_summary,
                "orderingConfidence": ordering_confidence,
                "warningCount": warning_count,
            },
        )

    def update_repurpose_project_status(
        self,
        *,
        convex_project_id: str | None,
        status: str,
        latest_local_result_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        if not self.enabled or not convex_project_id:
            return
        self._post(
            "/service/repurpose-project/status",
            {
                "projectId": convex_project_id,
                "status": status,
                "latestLocalResultId": latest_local_result_id,
                "errorMessage": str(error_message)[:500] if error_message is not None else None,
            },
        )

    def attach_repurpose_summary(
        self,
        *,
        convex_project_id: str | None,
        latest_local_result_id: str | None,
        source_upload_id: str | None,
        source_filename: str | None,
        source_duration_sec: float | None,
        summary: str | None,
        variants: list[dict[str, Any]],
    ) -> None:
        if not self.enabled or not convex_project_id:
            return
        self._post(
            "/service/repurpose-project/summary",
            {
                "projectId": convex_project_id,
                "latestLocalResultId": latest_local_result_id,
                "sourceUploadId": source_upload_id,
                "sourceFilename": source_filename,
                "sourceDurationSec": source_duration_sec,
                "summary": summary,
                "variants": variants,
            },
        )

    def create_storage_upload_url(self) -> str:
        response = self._post_json_response("/service/storage/upload-url", {})
        upload_url = response.get("uploadUrl")
        if not isinstance(upload_url, str) or not upload_url:
            raise RuntimeError("Convex did not return an upload URL.")
        return upload_url

    def resolve_storage_urls(self, storage_ids: list[str]) -> dict[str, str | None]:
        unique_storage_ids = list(dict.fromkeys(storage_id for storage_id in storage_ids if storage_id))
        if not unique_storage_ids:
            return {}
        response = self._post_json_response("/service/storage/urls", {"storageIds": unique_storage_ids})
        payload = response.get("urls")
        if not isinstance(payload, dict):
            raise RuntimeError("Convex did not return storage URLs.")
        return {
            storage_id: (value if isinstance(value, str) else None)
            for storage_id, value in payload.items()
        }

    def upload_file(self, path: Path, *, content_type: str | None = None) -> str:
        if not self.enabled:
            raise RuntimeError("Convex storage is not configured.")
        upload_url = self.create_storage_upload_url()
        with path.open("rb") as file_handle:
            try:
                response = httpx.post(
                    upload_url,
                    content=file_handle,
                    headers={"content-type": content_type or "application/octet-stream"},
                    timeout=_TRANSFER_TIMEOUT_SECONDS,
                )
            except httpx.HTTPError as exc:
                raise RuntimeError(f"Convex upload failed for {path.name}: {exc}") from exc
        if response.status_code >= 400:
            raise RuntimeError(
                f"Convex upload failed for {path.name}: status={response.status_code}"
            )
        storage_id = response.json().get("storageId")
        if not isinstance(storage_id, str) or not storage_id:
            raise RuntimeError(f"Convex upload did not return a storageId for {path.name}.")
        return storage_id

    def download_file(self, storage_id: str, destination: Path) -> None:
        if not self.enabled:
            raise RuntimeError("Convex storage is not configured.")
        url = self.resolve_storage_urls([storage_id]).get(storage_id)
        if not url:
            raise FileNotFoundError(f"Convex storage file {storage_id!r} was not found.")
        try:
            response = httpx.get(url, timeout=_TRANSFER_TIMEOUT_SECONDS)
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Convex download failed for {storage_id}: {exc}") from exc
        if response.status_code >= 400:
            raise RuntimeError(
                f"Convex download failed for {storage_id}: status={response.status_code}"
            )
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(response.content)

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
                timeout=_SERVICE_REQUEST_TIMEOUT_SECONDS,
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

    def _post_json_response(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("Convex storage is not configured.")
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
                timeout=_SERVICE_REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Convex request failed for {path}: {exc}") from exc
        if response.status_code >= 400:
            raise RuntimeError(f"Convex request failed for {path}: status={response.status_code}")
        return response.json()
