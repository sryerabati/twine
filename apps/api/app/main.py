from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.context import APIContext
from app.routers.api import router
from app.services.analysis_engine import AnalysisEngine
from app.services.convex_sync import ConvexSyncService
from app.services.gemini_runner import GeminiRunner
from app.services.jobs import AnalysisJobService
from app.services.media import MediaService
from app.services.storage import StorageService
from app.services.tribe_runner import TribeRunner


def build_context(settings=None) -> APIContext:
    resolved_settings = settings or get_settings()
    storage = StorageService(resolved_settings)
    media = MediaService(resolved_settings)
    runner = (
        GeminiRunner(resolved_settings)
        if resolved_settings.analysis_backend == "gemini"
        else TribeRunner(resolved_settings)
    )
    engine = AnalysisEngine(storage, media)
    convex_sync = ConvexSyncService(resolved_settings)
    jobs = AnalysisJobService(storage, runner, engine, convex_sync)
    return APIContext(
        settings=resolved_settings,
        storage=storage,
        media=media,
        runner=runner,
        engine=engine,
        jobs=jobs,
        convex_sync=convex_sync,
    )


def create_app(context: APIContext | None = None) -> FastAPI:
    resolved_context = context or build_context()
    app = FastAPI(title="Content Analysis API", version="0.1.0")
    app.state.context = resolved_context
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[resolved_context.settings.allowed_origin],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )
    app.include_router(router)
    app.mount(
        "/storage",
        StaticFiles(directory=resolved_context.settings.storage_root),
        name="storage",
    )
    return app


app = create_app()
