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
from app.models.contracts import AnalysisPayload, AnalysisResponse, UploadResponse, VideoAsset


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
    preds_path: Path
    provider_raw_path: Path
    events_path: Path
    segments_path: Path
    cuts_path: Path
    trimmed_video_path: Path


class StorageService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.ensure_directories()

    def ensure_directories(self) -> None:
        self.settings.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.settings.results_dir.mkdir(parents=True, exist_ok=True)
        self.settings.cache_dir.mkdir(parents=True, exist_ok=True)

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
            preds_path=directory / "preds.npy",
            provider_raw_path=directory / "provider-response.json",
            events_path=directory / "events.csv",
            segments_path=directory / "segments.json",
            cuts_path=directory / "cut-list.json",
            trimmed_video_path=directory / "trimmed.mp4",
        )

    def analysis_paths(self, analysis_id: str) -> AnalysisPaths:
        self._validate_analysis_id(analysis_id)
        directory = self.settings.results_dir / analysis_id
        return AnalysisPaths(
            analysis_id=analysis_id,
            directory=directory,
            record_path=directory / "record.json",
            payload_path=directory / "payload.json",
            preds_path=directory / "preds.npy",
            provider_raw_path=directory / "provider-response.json",
            events_path=directory / "events.csv",
            segments_path=directory / "segments.json",
            cuts_path=directory / "cut-list.json",
            trimmed_video_path=directory / "trimmed.mp4",
        )

    @staticmethod
    def _validate_analysis_id(analysis_id: str) -> None:
        """Reject anything that is not a clean hex id to prevent path traversal."""
        if not analysis_id or not all(ch in "0123456789abcdef" for ch in analysis_id.lower()):
            raise FileNotFoundError(f"Analysis {analysis_id!r} not found")
        if len(analysis_id) > 64:
            raise FileNotFoundError(f"Analysis {analysis_id!r} not found")

    def upload_paths(self, upload_id: str) -> UploadPaths:
        self._validate_analysis_id(upload_id)
        directory = self.settings.uploads_dir / upload_id
        source_candidates = sorted(directory.glob("source.*"))
        if not source_candidates:
            raise FileNotFoundError(f"Upload {upload_id} not found")
        return UploadPaths(
            upload_id=upload_id,
            directory=directory,
            source_path=source_candidates[0],
            thumbnail_path=directory / "thumbnail.jpg",
            metadata_path=directory / "upload.json",
        )

    def write_upload_metadata(self, payload: UploadResponse) -> None:
        paths = self.upload_paths(payload.uploadId)
        dump_json(paths.metadata_path, payload.model_dump(mode="json"))

    def read_upload_metadata(self, upload_id: str) -> UploadResponse:
        paths = self.upload_paths(upload_id)
        return UploadResponse.model_validate(load_json(paths.metadata_path))

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

    def write_analysis_record(self, record: AnalysisResponse) -> None:
        paths = self.analysis_paths(record.analysisId)
        dump_json(paths.record_path, record.model_dump(mode="json"))

    def read_analysis_record(self, analysis_id: str) -> AnalysisResponse:
        paths = self.analysis_paths(analysis_id)
        if not paths.record_path.exists():
            raise FileNotFoundError(f"Analysis {analysis_id} not found")
        data = load_json(paths.record_path)
        return AnalysisResponse.model_validate(data)

    def write_analysis_payload(self, analysis_id: str, payload: AnalysisPayload) -> None:
        paths = self.analysis_paths(analysis_id)
        dump_json(paths.payload_path, payload.model_dump(mode="json"))
        dump_json(paths.cuts_path, [cut.model_dump(mode="json") for cut in payload.cutPlan])

    def read_analysis_payload(self, analysis_id: str) -> AnalysisPayload:
        path = self.analysis_paths(analysis_id).payload_path
        if not path.exists():
            raise FileNotFoundError(f"Analysis payload {analysis_id} not found")
        return AnalysisPayload.model_validate(load_json(path))

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
        return latest

    def write_segments(self, analysis_id: str, payload: list[dict[str, Any]]) -> None:
        dump_json(self.analysis_paths(analysis_id).segments_path, payload)

    def write_preds(self, analysis_id: str, preds: np.ndarray) -> None:
        np.save(self.analysis_paths(analysis_id).preds_path, preds)

    def write_provider_raw(self, analysis_id: str, payload: dict[str, Any]) -> None:
        dump_json(self.analysis_paths(analysis_id).provider_raw_path, payload)

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

    def video_asset_from_upload(
        self,
        upload_id: str,
        filename: str,
        duration_sec: float,
        width: int,
        height: int,
        size_bytes: int,
    ) -> VideoAsset:
        paths = self.upload_paths(upload_id)
        return VideoAsset(
            uploadId=upload_id,
            filename=filename,
            sourceUrl=self.to_storage_url(paths.source_path),
            thumbnailUrl=self.to_storage_url(paths.thumbnail_path),
            durationSec=duration_sec,
            width=width,
            height=height,
            sizeBytes=size_bytes,
        )
