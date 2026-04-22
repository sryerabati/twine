from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(REPO_ROOT / ".env.local")),
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
    analysis_backend: Literal["tribe", "gemini", "mirofish"] = Field(
        default="tribe",
        alias="ANALYSIS_BACKEND",
    )
    tribe_device: str = Field(default="auto", alias="TRIBE_DEVICE")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_platform: Literal["developer", "vertex"] = Field(
        default="developer",
        alias="GEMINI_PLATFORM",
    )
    gemini_model: str = Field(default="gemini-2.5-pro", alias="GEMINI_MODEL")
    gemini_fallback_model: str | None = Field(
        default="gemini-2.5-flash-lite",
        alias="GEMINI_FALLBACK_MODEL",
    )
    mirofish_base_url: str | None = Field(default=None, alias="MIROFISH_BASE_URL")
    mirofish_repo_dir: Path | None = Field(default=None, alias="MIROFISH_REPO_DIR")
    mirofish_auto_start: bool = Field(default=False, alias="MIROFISH_AUTO_START")
    mirofish_timeout_seconds: int = Field(default=900, alias="MIROFISH_TIMEOUT_SECONDS")
    mirofish_poll_seconds: float = Field(default=3.0, alias="MIROFISH_POLL_SECONDS")
    mirofish_simulation_max_rounds: int = Field(default=10, alias="MIROFISH_SIMULATION_MAX_ROUNDS")
    mirofish_llm_api_key: str | None = Field(default=None, alias="MIROFISH_LLM_API_KEY")
    mirofish_llm_base_url: str | None = Field(default=None, alias="MIROFISH_LLM_BASE_URL")
    mirofish_llm_model_name: str | None = Field(default=None, alias="MIROFISH_LLM_MODEL_NAME")
    mirofish_vertex_project_id: str | None = Field(default=None, alias="MIROFISH_VERTEX_PROJECT_ID")
    mirofish_vertex_location: str = Field(default="global", alias="MIROFISH_VERTEX_LOCATION")
    mirofish_zep_api_key: str | None = Field(default=None, alias="MIROFISH_ZEP_API_KEY")
    editor_ai_provider: Literal["gemini", "nvidia"] = Field(
        default="gemini",
        alias="EDITOR_AI_PROVIDER",
    )
    nvidia_api_key: str | None = Field(default=None, alias="NVIDIA_API_KEY")
    nvidia_model: str = Field(
        default="google/gemma-3n-e4b-it",
        alias="NVIDIA_MODEL",
    )
    gemini_max_retries: int = Field(default=2, alias="GEMINI_MAX_RETRIES", ge=0, le=8)
    gemini_retry_base_seconds: float = Field(
        default=2.0,
        alias="GEMINI_RETRY_BASE_SECONDS",
        gt=0,
    )
    max_video_seconds: int = Field(default=120, alias="TRIBE_MAX_VIDEO_SECONDS")
    max_upload_bytes: int = Field(default=50_000_000, alias="TRIBE_MAX_UPLOAD_BYTES")
    huggingface_hub_token: str | None = Field(
        default=None,
        alias="HUGGINGFACE_HUB_TOKEN",
    )
    ffmpeg_bin: str = Field(default="ffmpeg", alias="FFMPEG_BIN")
    ffprobe_bin: str = Field(default="ffprobe", alias="FFPROBE_BIN")
    analysis_poll_interval_ms: int = Field(default=2500, alias="TRIBE_POLL_INTERVAL_MS")
    convex_site_url: str | None = Field(default=None, alias="CONVEX_SITE_URL")
    convex_service_secret: str | None = Field(default=None, alias="CONVEX_SERVICE_SECRET")
    require_convex_ids: bool = Field(default=True, alias="REQUIRE_CONVEX_IDS")

    @field_validator("uploads_dir", "results_dir", "cache_dir", "mirofish_repo_dir", mode="before")
    @classmethod
    def resolve_repo_relative_storage_path(cls, value: str | Path | None) -> Path | None:
        if value is None:
            return None
        path = value if isinstance(value, Path) else Path(value)
        if path.is_absolute():
            return path
        return REPO_ROOT / path

    @field_validator(
        "gemini_fallback_model",
        "mirofish_base_url",
        "mirofish_llm_api_key",
        "mirofish_llm_base_url",
        "mirofish_llm_model_name",
        "mirofish_vertex_project_id",
        "mirofish_zep_api_key",
        "nvidia_api_key",
        mode="before",
    )
    @classmethod
    def normalize_optional_model_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @property
    def storage_root(self) -> Path:
        return self.uploads_dir.parent

    @property
    def convex_sync_enabled(self) -> bool:
        return bool(self.convex_site_url and self.convex_service_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
