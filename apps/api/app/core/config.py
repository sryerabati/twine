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

    @property
    def storage_root(self) -> Path:
        return self.uploads_dir.parent


@lru_cache
def get_settings() -> Settings:
    return Settings()
