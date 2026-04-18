from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.core.config import Settings
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.media import MediaService
from app.services.storage import StorageService
from app.services.tribe_runner import TribeRunner


class JobQueue(Protocol):
    def enqueue(self, analysis_id: str, upload_id: str) -> None:
        """Queue analysis work."""


@dataclass
class APIContext:
    settings: Settings
    storage: StorageService
    media: MediaService
    runner: TribeRunner
    engine: AnalysisEngine
    jobs: JobQueue
    convex: ConvexSyncService
