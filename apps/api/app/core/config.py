from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    api_port: int = Field(default=8000, alias="API_PORT")
    web_port: int = Field(default=3000, alias="WEB_PORT")
    uploads_dir: Path = Field(
        default=REPO_ROOT / "storage" / "uploads",
        alias="TRIBE_UPLOADS_DIR",
    )
    results_dir: Path = Field(
        default=REPO_ROOT / "storage" / "analyses",
        alias="TRIBE_RESULTS_DIR",
    )
    cache_dir: Path = Field(
        default=REPO_ROOT / "storage" / "cache",
        alias="TRIBE_CACHE_DIR",
    )
    allowed_origin: str = Field(
        default="http://localhost:3000",
        alias="TRIBE_ALLOWED_ORIGIN",
    )
    tribe_device: str = Field(default="auto", alias="TRIBE_DEVICE")
    max_video_seconds: int = Field(default=60, alias="TRIBE_MAX_VIDEO_SECONDS")
    max_upload_bytes: int = Field(default=250_000_000, alias="TRIBE_MAX_UPLOAD_BYTES")
    huggingface_hub_token: str | None = Field(
        default=None,
        alias="HUGGINGFACE_HUB_TOKEN",
    )
    ffmpeg_bin: str = Field(default="ffmpeg", alias="FFMPEG_BIN")
    ffprobe_bin: str = Field(default="ffprobe", alias="FFPROBE_BIN")
    analysis_poll_interval_ms: int = Field(default=2500, alias="TRIBE_POLL_INTERVAL_MS")

    # --- Convex sync bridge ---
    # `convex_site_url` is the .convex.site origin where HTTP routes are mounted.
    # `convex_service_secret` authenticates FastAPI -> Convex writes.
    # Both are optional at startup so tests and local-only runs still work; the
    # ConvexSyncService itself enforces they are set whenever a sync is attempted.
    convex_site_url: str | None = Field(default=None, alias="CONVEX_SITE_URL")
    convex_service_secret: str | None = Field(
        default=None, alias="CONVEX_SERVICE_SECRET"
    )
    # When True, /api/upload and /api/analyze require Convex IDs in their request
    # bodies. Defaults to True so the demo enforces per-user scan history.
    # Set `REQUIRE_CONVEX_IDS=false` to run the backend standalone (for tests or
    # local experimentation without Convex).
    require_convex_ids: bool = Field(default=True, alias="REQUIRE_CONVEX_IDS")

    @property
    def storage_root(self) -> Path:
        return self.uploads_dir.parent


@lru_cache
def get_settings() -> Settings:
    return Settings()
