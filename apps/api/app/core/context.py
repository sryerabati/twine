from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.core.config import Settings
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.media import MediaService
from app.services.storage import StorageService
from app.services.tribe_runner import TribeRunResult


class JobQueue(Protocol):
    def enqueue(self, analysis_id: str, upload_id: str) -> None:
        """Queue analysis work."""


class AnalysisRunner(Protocol):
    MODEL_REPO: str
    MODEL_COMMIT: str

    def has_install(self) -> bool:
        """Return whether the current backend is installed/configured enough to run."""

    def model_status(self) -> str:
        """Return loaded state."""

    def model_error(self) -> str | None:
        """Return the last model/backend error."""

    def selected_device(self) -> str:
        """Return the selected execution device."""

    def probe(self) -> Any:
        """Return a machine-readable health probe."""

    def analyze_video(self, video_path: Path) -> TribeRunResult:
        """Analyze a local video file and return normalized backend output."""


@dataclass
class APIContext:
    settings: Settings
    storage: StorageService
    media: MediaService
    runner: AnalysisRunner
    engine: AnalysisEngine
    jobs: JobQueue
    convex_sync: ConvexSyncService
