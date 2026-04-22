from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
import shutil
from typing import Any
from uuid import uuid4

import numpy as np
from fastapi import UploadFile

from app.core.config import Settings
from app.core.serialization import dump_json, load_json
from app.models.contracts import (
    AnalysisPayload,
    AnalysisResponse,
    AudienceWorldPayload,
    EditorDraftPayload,
    EditorDraftResponse,
    UploadResponse,
    VideoAsset,
)
from app.services.convex_sync import ConvexSyncService


@dataclass
class UploadPaths:
    upload_id: str
    directory: Path
    source_path: Path
    thumbnail_path: Path
    metadata_path: Path


@dataclass
class AnalysisPaths:
    analysis_id: str
    directory: Path
    record_path: Path
    payload_path: Path
    world_path: Path
    preds_path: Path
    provider_raw_path: Path
    events_path: Path
    segments_path: Path
    cuts_path: Path
    trimmed_video_path: Path


@dataclass
class EditorDraftPaths:
    draft_id: str
    directory: Path
    record_path: Path
    payload_path: Path
    video_path: Path


@dataclass
class StoredMedia:
    storage_id: str | None
    url: str


class StorageService:
    def __init__(
        self,
        settings: Settings,
        convex_sync: ConvexSyncService | None = None,
    ) -> None:
        self.settings = settings
        self.convex_sync = convex_sync
        self.ensure_directories()

    def ensure_directories(self) -> None:
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.settings.results_dir.mkdir(parents=True, exist_ok=True)
        self.settings.cache_dir.mkdir(parents=True, exist_ok=True)
        (self.settings.storage_root / "editor-drafts").mkdir(parents=True, exist_ok=True)

    def create_upload_paths(self, filename: str) -> UploadPaths:
        upload_id = uuid4().hex
        directory = self.settings.uploads_dir / upload_id
        directory.mkdir(parents=True, exist_ok=True)
        suffix = Path(filename).suffix.lower() or ".mp4"
        return UploadPaths(
            upload_id=upload_id,
            directory=directory,
            source_path=directory / f"source{suffix}",
            thumbnail_path=directory / "thumbnail.jpg",
            metadata_path=directory / "upload.json",
        )

    async def save_upload(self, file: UploadFile) -> UploadPaths:
        paths = self.create_upload_paths(file.filename or "upload.mp4")
        with paths.source_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
        await file.close()
        return paths

    def delete_upload(self, upload_id: str) -> None:
        shutil.rmtree(self.settings.uploads_dir / upload_id, ignore_errors=True)

    def create_analysis_paths(self) -> AnalysisPaths:
        analysis_id = uuid4().hex
        directory = self.settings.results_dir / analysis_id
        directory.mkdir(parents=True, exist_ok=True)
        return AnalysisPaths(
            analysis_id=analysis_id,
            directory=directory,
            record_path=directory / "record.json",
            payload_path=directory / "payload.json",
            world_path=directory / "world.json",
            preds_path=directory / "preds.npy",
            provider_raw_path=directory / "provider-response.json",
            events_path=directory / "events.csv",
            segments_path=directory / "segments.json",
            cuts_path=directory / "cut-list.json",
            trimmed_video_path=directory / "trimmed.mp4",
        )

    def create_editor_draft_paths(self) -> EditorDraftPaths:
        draft_id = uuid4().hex
        directory = self.settings.storage_root / "editor-drafts" / draft_id
        directory.mkdir(parents=True, exist_ok=True)
        return EditorDraftPaths(
            draft_id=draft_id,
            directory=directory,
            record_path=directory / "record.json",
            payload_path=directory / "payload.json",
            video_path=directory / "draft.mp4",
        )

    def analysis_paths(self, analysis_id: str) -> AnalysisPaths:
        self._validate_analysis_id(analysis_id)
        directory = self.settings.results_dir / analysis_id
        return AnalysisPaths(
            analysis_id=analysis_id,
            directory=directory,
            record_path=directory / "record.json",
            payload_path=directory / "payload.json",
            world_path=directory / "world.json",
            preds_path=directory / "preds.npy",
            provider_raw_path=directory / "provider-response.json",
            events_path=directory / "events.csv",
            segments_path=directory / "segments.json",
            cuts_path=directory / "cut-list.json",
            trimmed_video_path=directory / "trimmed.mp4",
        )

    def editor_draft_paths(self, draft_id: str) -> EditorDraftPaths:
        self._validate_analysis_id(draft_id)
        directory = self.settings.storage_root / "editor-drafts" / draft_id
        return EditorDraftPaths(
            draft_id=draft_id,
            directory=directory,
            record_path=directory / "record.json",
            payload_path=directory / "payload.json",
            video_path=directory / "draft.mp4",
        )

    @staticmethod
    def _validate_analysis_id(analysis_id: str) -> None:
        """Reject anything that is not a clean hex id to prevent path traversal."""
        if not analysis_id or not all(ch in "0123456789abcdef" for ch in analysis_id.lower()):
            raise FileNotFoundError(f"Analysis {analysis_id!r} not found")
        if len(analysis_id) > 64:
            raise FileNotFoundError(f"Analysis {analysis_id!r} not found")

    def _upload_directory(self, upload_id: str) -> Path:
        self._validate_analysis_id(upload_id)
        return self.settings.uploads_dir / upload_id

    def _upload_metadata_path(self, upload_id: str) -> Path:
        return self._upload_directory(upload_id) / "upload.json"

    def _download_cached_upload_file(
        self,
        *,
        upload_id: str,
        storage_id: str | None,
        destination: Path,
        label: str,
    ) -> None:
        if storage_id is None or self.convex_sync is None or not self.convex_sync.enabled:
            raise FileNotFoundError(f"Upload {upload_id} {label} not found")
        self.convex_sync.download_file(storage_id, destination)

    def upload_paths(self, upload_id: str) -> UploadPaths:
        directory = self._upload_directory(upload_id)
        metadata_path = directory / "upload.json"
        source_candidates = sorted(directory.glob("source.*"))
        upload_metadata: UploadResponse | None = None
        if source_candidates:
            source_path = source_candidates[0]
        else:
            if not metadata_path.exists():
                raise FileNotFoundError(f"Upload {upload_id} not found")
            upload_metadata = self.read_upload_metadata(upload_id)
            suffix = Path(upload_metadata.video.filename).suffix.lower() or ".mp4"
            source_path = directory / f"source{suffix}"
            if not source_path.exists():
                self._download_cached_upload_file(
                    upload_id=upload_id,
                    storage_id=upload_metadata.video.sourceStorageId,
                    destination=source_path,
                    label="source",
                )
        thumbnail_path = directory / "thumbnail.jpg"
        if not thumbnail_path.exists() and metadata_path.exists():
            upload_metadata = upload_metadata or self.read_upload_metadata(upload_id)
            if upload_metadata.video.thumbnailStorageId:
                self._download_cached_upload_file(
                    upload_id=upload_id,
                    storage_id=upload_metadata.video.thumbnailStorageId,
                    destination=thumbnail_path,
                    label="thumbnail",
                )
        return UploadPaths(
            upload_id=upload_id,
            directory=directory,
            source_path=source_path,
            thumbnail_path=thumbnail_path,
            metadata_path=metadata_path,
        )

    def write_upload_metadata(self, payload: UploadResponse) -> None:
        metadata_path = self._upload_metadata_path(payload.uploadId)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        dump_json(metadata_path, payload.model_dump(mode="json"))

    def read_upload_metadata(self, upload_id: str) -> UploadResponse:
        metadata_path = self._upload_metadata_path(upload_id)
        if not metadata_path.exists():
            raise FileNotFoundError(f"Upload {upload_id} not found")
        return UploadResponse.model_validate(load_json(metadata_path))

    def init_analysis_record(self, analysis_id: str) -> AnalysisResponse:
        now = datetime.now(UTC)
        record = AnalysisResponse(
            analysisId=analysis_id,
            status="queued",
            createdAt=now,
            updatedAt=now,
            error=None,
            payload=None,
        )
        self.write_analysis_record(record)
        return record

    def init_editor_draft_record(self, draft_id: str, project_id: str) -> EditorDraftResponse:
        now = datetime.now(UTC)
        record = EditorDraftResponse(
            draftId=draft_id,
            projectId=project_id,
            status="queued",
            stage="queued",
            progressPercent=5,
            statusMessage="Queued for rough-cut generation.",
            createdAt=now,
            updatedAt=now,
            error=None,
            payload=None,
        )
        self.write_editor_draft_record(record)
        return record

    def write_analysis_record(self, record: AnalysisResponse) -> None:
        paths = self.analysis_paths(record.analysisId)
        dump_json(paths.record_path, record.model_dump(mode="json"))

    def read_analysis_record(self, analysis_id: str) -> AnalysisResponse:
        paths = self.analysis_paths(analysis_id)
        if not paths.record_path.exists():
            raise FileNotFoundError(f"Analysis {analysis_id} not found")
        data = load_json(paths.record_path)
        return AnalysisResponse.model_validate(data)

    def write_editor_draft_record(self, record: EditorDraftResponse) -> None:
        paths = self.editor_draft_paths(record.draftId)
        dump_json(paths.record_path, record.model_dump(mode="json"))

    def read_editor_draft_record(self, draft_id: str) -> EditorDraftResponse:
        paths = self.editor_draft_paths(draft_id)
        if not paths.record_path.exists():
            raise FileNotFoundError(f"Editor draft {draft_id} not found")
        return EditorDraftResponse.model_validate(load_json(paths.record_path))

    def write_analysis_payload(self, analysis_id: str, payload: AnalysisPayload) -> None:
        paths = self.analysis_paths(analysis_id)
        dump_json(paths.payload_path, payload.model_dump(mode="json"))
        dump_json(paths.cuts_path, [cut.model_dump(mode="json") for cut in payload.cutPlan])
        if payload.audienceWorld is not None:
            world = (
                payload.audienceWorld
                if isinstance(payload.audienceWorld, AudienceWorldPayload)
                else AudienceWorldPayload.model_validate(payload.audienceWorld)
            )
            dump_json(paths.world_path, world.model_dump(mode="json"))

    def read_analysis_payload(self, analysis_id: str) -> AnalysisPayload:
        path = self.analysis_paths(analysis_id).payload_path
        if not path.exists():
            raise FileNotFoundError(f"Analysis payload {analysis_id} not found")
        return AnalysisPayload.model_validate(load_json(path))

    def write_analysis_world(self, analysis_id: str, payload: AudienceWorldPayload | dict[str, Any]) -> None:
        world = (
            payload
            if isinstance(payload, AudienceWorldPayload)
            else AudienceWorldPayload.model_validate(payload)
        )
        dump_json(self.analysis_paths(analysis_id).world_path, world.model_dump(mode="json"))

    def read_analysis_world(self, analysis_id: str) -> AudienceWorldPayload:
        path = self.analysis_paths(analysis_id).world_path
        if not path.exists():
            raise FileNotFoundError(f"Analysis world {analysis_id} not found")
        return AudienceWorldPayload.model_validate(load_json(path))

    def write_editor_draft_payload(self, draft_id: str, payload: EditorDraftPayload) -> None:
        dump_json(self.editor_draft_paths(draft_id).payload_path, payload.model_dump(mode="json"))

    def read_editor_draft_payload(self, draft_id: str) -> EditorDraftPayload:
        path = self.editor_draft_paths(draft_id).payload_path
        if not path.exists():
            raise FileNotFoundError(f"Editor draft payload {draft_id} not found")
        return EditorDraftPayload.model_validate(load_json(path))

    def find_latest_analysis_for_upload(self, upload_id: str) -> AnalysisResponse:
        self._validate_analysis_id(upload_id)

        latest: AnalysisResponse | None = None
        for record_path in sorted(self.settings.results_dir.glob("*/record.json")):
            data = load_json(record_path)
            record = AnalysisResponse.model_validate(data)
            if record.status != "completed":
                continue

            payload_path = record_path.parent / "payload.json"
            if not payload_path.exists():
                continue

            payload = AnalysisPayload.model_validate(load_json(payload_path))
            if payload.video.uploadId != upload_id:
                continue

            hydrated = record.model_copy(update={"payload": payload})
            if latest is None or hydrated.updatedAt > latest.updatedAt:
                latest = hydrated

        if latest is None:
            raise FileNotFoundError(f"No completed analysis found for upload {upload_id!r}")
        return self.hydrate_analysis_response(latest)

    def find_latest_editor_draft_for_project(self, project_id: str) -> EditorDraftResponse:
        latest: EditorDraftResponse | None = None
        editor_drafts_root = self.settings.storage_root / "editor-drafts"
        if not editor_drafts_root.exists():
            raise FileNotFoundError(f"No editor drafts found for project {project_id!r}")

        for record_path in sorted(editor_drafts_root.glob("*/record.json")):
            record = EditorDraftResponse.model_validate(load_json(record_path))
            if record.projectId != project_id:
                continue

            hydrated = record
            payload_path = record_path.parent / "payload.json"
            if record.status == "completed" and payload_path.exists():
                hydrated = record.model_copy(
                    update={"payload": EditorDraftPayload.model_validate(load_json(payload_path))}
                )

            if latest is None or hydrated.updatedAt > latest.updatedAt:
                latest = hydrated

        if latest is None:
            raise FileNotFoundError(f"No editor drafts found for project {project_id!r}")
        return self.hydrate_editor_draft_response(latest)

    def write_segments(self, analysis_id: str, payload: list[dict[str, Any]]) -> None:
        dump_json(self.analysis_paths(analysis_id).segments_path, payload)

    def write_preds(self, analysis_id: str, preds: np.ndarray) -> None:
        np.save(self.analysis_paths(analysis_id).preds_path, preds)

    def write_provider_raw(self, analysis_id: str, payload: dict[str, Any]) -> None:
        dump_json(self.analysis_paths(analysis_id).provider_raw_path, payload)

    def read_provider_raw(self, analysis_id: str) -> dict[str, Any]:
        path = self.analysis_paths(analysis_id).provider_raw_path
        if not path.exists():
            raise FileNotFoundError(f"Provider raw payload {analysis_id} not found")
        data = load_json(path)
        if not isinstance(data, dict):
            raise FileNotFoundError(f"Provider raw payload {analysis_id} is invalid")
        return data

    def artifacts_for(
        self,
        analysis_id: str,
        *,
        include_raw_predictions: bool = True,
        include_provider_raw: bool = False,
    ) -> dict[str, str | None]:
        paths = self.analysis_paths(analysis_id)
        artifacts = {
            "rawPredictionsUrl": self.to_storage_url(paths.preds_path)
            if include_raw_predictions
            else None,
            "providerRawJsonUrl": self.to_storage_url(paths.provider_raw_path)
            if include_provider_raw
            else None,
            "processedJsonUrl": self.to_storage_url(paths.payload_path),
            "cutListJsonUrl": self.to_storage_url(paths.cuts_path),
            "eventsCsvUrl": self.to_storage_url(paths.events_path),
            "segmentsJsonUrl": self.to_storage_url(paths.segments_path),
        }
        if paths.trimmed_video_path.exists():
            artifacts["trimmedVideoUrl"] = self.to_storage_url(paths.trimmed_video_path)
        return artifacts

    def to_storage_url(self, path: Path) -> str:
        relative = path.relative_to(self.settings.storage_root)
        return f"/storage/{relative.as_posix()}"

    def store_media_file(self, path: Path, *, content_type: str | None = None) -> StoredMedia:
        if self.convex_sync is not None and self.convex_sync.enabled:
            storage_id = self.convex_sync.upload_file(path, content_type=content_type)
            url = self.convex_sync.resolve_storage_urls([storage_id]).get(storage_id)
            if not url:
                raise RuntimeError(f"Convex did not return a URL for {path.name}.")
            return StoredMedia(storage_id=storage_id, url=url)
        return StoredMedia(storage_id=None, url=self.to_storage_url(path))

    def delete_upload_cache(self, upload_id: str) -> None:
        directory = self._upload_directory(upload_id)
        for source_path in directory.glob("source.*"):
            source_path.unlink(missing_ok=True)
        (directory / "thumbnail.jpg").unlink(missing_ok=True)

    def hydrate_upload_response(self, response: UploadResponse) -> UploadResponse:
        if self.convex_sync is None or not self.convex_sync.enabled:
            return response
        storage_ids = [
            storage_id
            for storage_id in [
                response.video.sourceStorageId,
                response.video.thumbnailStorageId,
            ]
            if storage_id
        ]
        if not storage_ids:
            return response
        try:
            urls = self.convex_sync.resolve_storage_urls(storage_ids)
        except RuntimeError:
            return response
        video = response.video.model_copy(
            update={
                "sourceUrl": urls.get(response.video.sourceStorageId) or response.video.sourceUrl,
                "thumbnailUrl": urls.get(response.video.thumbnailStorageId)
                or response.video.thumbnailUrl,
            }
        )
        return response.model_copy(update={"video": video})

    def hydrate_analysis_response(self, record: AnalysisResponse) -> AnalysisResponse:
        if self.convex_sync is None or not self.convex_sync.enabled or record.payload is None:
            return record
        storage_ids = [
            storage_id
            for storage_id in [
                record.payload.video.sourceStorageId,
                record.payload.video.thumbnailStorageId,
                record.payload.artifacts.trimmedVideoStorageId,
                *(export.trimmedVideoStorageId for export in record.payload.exports),
            ]
            if storage_id
        ]
        if not storage_ids:
            return record
        try:
            urls = self.convex_sync.resolve_storage_urls(storage_ids)
        except RuntimeError:
            return record
        payload = record.payload
        video = payload.video.model_copy(
            update={
                "sourceUrl": urls.get(payload.video.sourceStorageId) or payload.video.sourceUrl,
                "thumbnailUrl": urls.get(payload.video.thumbnailStorageId)
                or payload.video.thumbnailUrl,
            }
        )
        artifacts = payload.artifacts.model_copy(
            update={
                "trimmedVideoUrl": urls.get(payload.artifacts.trimmedVideoStorageId)
                or payload.artifacts.trimmedVideoUrl,
            }
        )
        exports = [
            export.model_copy(
                update={
                    "trimmedVideoUrl": urls.get(export.trimmedVideoStorageId)
                    or export.trimmedVideoUrl,
                }
            )
            for export in payload.exports
        ]
        next_payload = payload.model_copy(
            update={
                "video": video,
                "artifacts": artifacts,
                "exports": exports,
            }
        )
        return record.model_copy(update={"payload": next_payload})

    def hydrate_editor_draft_response(self, record: EditorDraftResponse) -> EditorDraftResponse:
        if self.convex_sync is None or not self.convex_sync.enabled or record.payload is None:
            return record
        storage_id = record.payload.export.videoStorageId
        if not storage_id:
            return record
        try:
            url = self.convex_sync.resolve_storage_urls([storage_id]).get(storage_id)
        except RuntimeError:
            return record
        if not url:
            return record
        export = record.payload.export.model_copy(update={"videoUrl": url})
        payload = record.payload.model_copy(update={"export": export})
        return record.model_copy(update={"payload": payload})

    def video_asset_from_upload(
        self,
        upload_id: str,
        filename: str,
        duration_sec: float,
        width: int,
        height: int,
        size_bytes: int,
        *,
        recorded_at: datetime | None = None,
        file_modified_at: datetime | None = None,
        source_storage_id: str | None = None,
        thumbnail_storage_id: str | None = None,
        source_url: str | None = None,
        thumbnail_url: str | None = None,
    ) -> VideoAsset:
        paths = self.upload_paths(upload_id)
        return VideoAsset(
            uploadId=upload_id,
            filename=filename,
            sourceUrl=source_url or self.to_storage_url(paths.source_path),
            thumbnailUrl=thumbnail_url or self.to_storage_url(paths.thumbnail_path),
            sourceStorageId=source_storage_id,
            thumbnailStorageId=thumbnail_storage_id,
            durationSec=duration_sec,
            width=width,
            height=height,
            sizeBytes=size_bytes,
            recordedAt=recorded_at,
            fileModifiedAt=file_modified_at,
        )
