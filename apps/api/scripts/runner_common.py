from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

APPS_API_ROOT = Path(__file__).resolve().parents[1]
if str(APPS_API_ROOT) not in sys.path:
    sys.path.insert(0, str(APPS_API_ROOT))

POSIX_SITE_PACKAGES = (
    APPS_API_ROOT
    / ".venv"
    / "lib"
    / f"python{sys.version_info.major}.{sys.version_info.minor}"
    / "site-packages"
)
WINDOWS_SITE_PACKAGES = APPS_API_ROOT / ".venv" / "Lib" / "site-packages"
for site_packages in (POSIX_SITE_PACKAGES, WINDOWS_SITE_PACKAGES):
    if site_packages.exists() and str(site_packages) not in sys.path:
        sys.path.insert(0, str(site_packages))

from app.core.config import get_settings
from app.core.context import APIContext
from app.main import build_context, create_app
from app.models.contracts import UploadResponse
from app.services.analysis_engine import AnalysisEngine
from app.services.gemini_runner import GeminiIntegrationError
from app.services.jobs import AnalysisJobService
from app.services.media import MediaInspectionError, MediaService
from app.services.mirofish_runner import MiroFishIntegrationError
from app.services.storage import StorageService
from app.services.tribe_runner import TribeIntegrationError, TribeRunner


class RunnerScriptError(RuntimeError):
    """Raised when a local runner command cannot proceed."""


@dataclass
class ScriptProbe:
    ok: bool
    osName: str
    analysisBackend: str
    pythonVersion: str
    pythonValid: bool
    tribev2Installed: bool
    ffmpegAvailable: bool
    ffprobeAvailable: bool
    huggingFaceTokenPresent: bool
    geminiApiKeyPresent: bool
    selectedDevice: str
    modelStatus: str
    modelRepo: str
    modelCommit: str
    modelError: str | None
    cacheDir: str
    blockers: list[str]
    notes: list[str]


def get_runtime_context() -> APIContext:
    return build_context(get_settings())


def probe_runtime(context: APIContext, os_name: str) -> ScriptProbe:
    settings = context.settings
    runner_probe = context.runner.probe()
    blockers: list[str] = []
    notes: list[str] = []
    python_version = platform.python_version()
    python_valid = sys.version_info[:2] == (3, 11)
    ffmpeg_available = shutil.which(settings.ffmpeg_bin) is not None
    ffprobe_available = shutil.which(settings.ffprobe_bin) is not None
    token_present = bool(settings.huggingface_hub_token)
    gemini_key_present = bool(settings.gemini_api_key or settings.mirofish_llm_api_key)

    if not python_valid:
        blockers.append(
            f"Python 3.11 is required. Current interpreter is {python_version}."
        )
    if settings.analysis_backend == "tribe" and not runner_probe.installed:
        blockers.append("The tribev2 package is not installed in the API environment.")
    if not ffmpeg_available:
        blockers.append("ffmpeg is not installed or not on PATH.")
    if not ffprobe_available:
        blockers.append("ffprobe is not installed or not on PATH.")
    if settings.analysis_backend == "tribe" and not token_present:
        blockers.append(
            "HUGGINGFACE_HUB_TOKEN is not set. Real TRIBE analysis and downloads require valid Hugging Face access."
        )
    if settings.analysis_backend == "gemini" and not gemini_key_present:
        blockers.append(
            "GEMINI_API_KEY is not set. Content analysis cannot call the configured remote backend."
        )
    if settings.analysis_backend == "mirofish":
        if not (settings.mirofish_base_url or settings.mirofish_repo_dir):
            blockers.append(
                "MIROFISH_BASE_URL is not set and MIROFISH_REPO_DIR is not configured."
            )
        if settings.mirofish_auto_start and not settings.mirofish_zep_api_key:
            blockers.append(
                "MIROFISH_ZEP_API_KEY is not set. Auto-starting the official MiroFish backend requires Zep Cloud."
            )
        if settings.mirofish_auto_start:
            if settings.gemini_platform == "vertex":
                adc_present = (
                    "GOOGLE_APPLICATION_CREDENTIALS" in os.environ
                    or Path.home().joinpath(".config/gcloud/application_default_credentials.json").exists()
                    or Path.home().joinpath("Library/Application Support/gcloud/application_default_credentials.json").exists()
                    or Path.home().joinpath("AppData/Roaming/gcloud/application_default_credentials.json").exists()
                )
                project_present = bool(
                    settings.mirofish_vertex_project_id
                    or os.environ.get("GOOGLE_CLOUD_PROJECT")
                    or os.environ.get("GCLOUD_PROJECT")
                )
                if not adc_present or not project_present:
                    blockers.append(
                        "Vertex-backed MiroFish auto-start needs ADC plus a project id. Set "
                        "GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`, "
                        "and set MIROFISH_VERTEX_PROJECT_ID or GOOGLE_CLOUD_PROJECT."
                    )
            elif not gemini_key_present:
                blockers.append(
                    "MIROFISH_LLM_API_KEY is not set. Auto-start needs an OpenAI-compatible LLM key; "
                    "GEMINI_API_KEY also works through Gemini's OpenAI-compatible endpoint."
                )
    if runner_probe.modelError:
        blockers.append(f"Model error: {runner_probe.modelError}")
    if settings.analysis_backend == "tribe" and settings.tribe_device == "auto":
        notes.append(
            "Device selection is automatic and defaults to CUDA when available, otherwise CPU."
        )
    elif settings.analysis_backend == "tribe":
        notes.append(f"TRIBE_DEVICE is pinned to {settings.tribe_device}.")
    elif settings.analysis_backend == "mirofish":
        notes.append(
            "MiroFish runs as an external simulation service that ingests a generated video brief "
            "and returns simulated audience reaction over time."
        )
        if settings.gemini_platform == "vertex":
            notes.append(
                "Vertex mode uses ADC-backed Google Cloud access tokens for the OpenAI-compatible endpoint."
            )
    else:
        notes.append("Content analysis runs against the configured remote backend.")
    if platform.machine().lower() == "arm64":
        notes.append("Apple Silicon is supported as a baseline, but inference may be slow.")
    if os_name == "windows":
        notes.append("Windows runner targets native Python, not WSL.")

    return ScriptProbe(
        ok=not blockers,
        osName=os_name,
        analysisBackend=settings.analysis_backend,
        pythonVersion=python_version,
        pythonValid=python_valid,
        tribev2Installed=runner_probe.installed,
        ffmpegAvailable=ffmpeg_available,
        ffprobeAvailable=ffprobe_available,
        huggingFaceTokenPresent=token_present,
        geminiApiKeyPresent=gemini_key_present,
        selectedDevice=runner_probe.selectedDevice,
        modelStatus=runner_probe.modelStatus,
        modelRepo=runner_probe.modelRepo,
        modelCommit=runner_probe.modelCommit,
        modelError=runner_probe.modelError,
        cacheDir=str(settings.cache_dir),
        blockers=blockers,
        notes=notes,
    )


def command_download(context: APIContext, os_name: str) -> dict[str, Any]:
    probe = probe_runtime(context, os_name)
    if context.settings.analysis_backend != "tribe":
        raise RunnerScriptError(
            "download is only available for the local TRIBE backend."
        )
    if not probe.huggingFaceTokenPresent:
        raise RunnerScriptError(
            "HUGGINGFACE_HUB_TOKEN is required for download. Add it to .env or the shell environment and rerun."
        )
    if not probe.pythonValid:
        raise RunnerScriptError(
            f"Python 3.11 is required. Current interpreter is {probe.pythonVersion}."
        )
    if not probe.tribev2Installed:
        raise RunnerScriptError(
            "The tribev2 package is not installed. Run `uv sync --python 3.11` in apps/api."
        )

    warmed = context.runner.warm_load()
    return {
        "status": "ok",
        "command": "download",
        "osName": os_name,
        "probe": asdict(probe_runtime(context, os_name)),
        "model": asdict(warmed),
    }


def command_probe(context: APIContext, os_name: str) -> dict[str, Any]:
    return {
        "status": "ok",
        "command": "probe",
        "osName": os_name,
        "probe": asdict(probe_runtime(context, os_name)),
    }


def command_serve(context: APIContext, os_name: str, host: str, port: int) -> int:
    probe = probe_runtime(context, os_name)
    emit_json(
        {
            "status": "starting",
            "command": "serve",
            "osName": os_name,
            "host": host,
            "port": port,
            "probe": asdict(probe),
        }
    )

    import uvicorn

    app = create_app(context)
    uvicorn.run(app, host=host, port=port, reload=False, log_level="info")
    return 0


def command_analyze(context: APIContext, os_name: str, video_path: Path) -> dict[str, Any]:
    if not video_path.exists():
        raise RunnerScriptError(f"Video file not found: {video_path}")
    if video_path.suffix.lower() not in {".mp4", ".mov"}:
        raise RunnerScriptError("Only MP4 and MOV inputs are supported.")

    settings = context.settings
    storage = context.storage
    media = context.media
    runner = context.runner
    engine = context.engine

    upload_paths = storage.create_upload_paths(video_path.name)
    shutil.copy2(video_path, upload_paths.source_path)

    try:
        if upload_paths.source_path.stat().st_size > settings.max_upload_bytes:
            storage.delete_upload(upload_paths.upload_id)
            raise RunnerScriptError("Input video exceeded the configured size limit.")

        metadata = media.inspect_video(upload_paths.source_path)
        if metadata.duration_sec > settings.max_video_seconds:
            storage.delete_upload(upload_paths.upload_id)
            raise RunnerScriptError(
                f"Clip is too long. Maximum supported duration is {settings.max_video_seconds} seconds."
            )
        media.generate_thumbnail(upload_paths.source_path, upload_paths.thumbnail_path)
    except MediaInspectionError as exc:
        storage.delete_upload(upload_paths.upload_id)
        raise RunnerScriptError(str(exc)) from exc

    video_asset = storage.video_asset_from_upload(
        upload_id=upload_paths.upload_id,
        filename=video_path.name,
        duration_sec=metadata.duration_sec,
        width=metadata.width,
        height=metadata.height,
        size_bytes=metadata.size_bytes,
        recorded_at=metadata.recorded_at,
        file_modified_at=metadata.file_modified_at,
    )
    upload_response = UploadResponse(uploadId=upload_paths.upload_id, video=video_asset)
    storage.write_upload_metadata(upload_response)

    analysis_paths = storage.create_analysis_paths()
    storage.init_analysis_record(analysis_paths.analysis_id)
    AnalysisJobService(storage, runner, engine, context.convex_sync).run_now(
        analysis_paths.analysis_id,
        upload_paths.upload_id,
    )

    record = storage.read_analysis_record(analysis_paths.analysis_id)
    payload = None
    if record.status == "completed":
        payload = storage.read_analysis_payload(analysis_paths.analysis_id)

    return {
        "status": record.status,
        "command": "analyze",
        "osName": os_name,
        "analysisId": analysis_paths.analysis_id,
        "uploadId": upload_paths.upload_id,
        "videoPath": str(video_path.resolve()),
        "record": record.model_dump(mode="json"),
        "payload": payload.model_dump(mode="json") if payload is not None else None,
        "artifacts": {
            "recordPath": str(analysis_paths.record_path),
            "payloadPath": str(analysis_paths.payload_path),
            "predictionsPath": str(analysis_paths.preds_path),
            "providerRawPath": str(analysis_paths.provider_raw_path),
            "eventsPath": str(analysis_paths.events_path),
            "segmentsPath": str(analysis_paths.segments_path),
            "cutsPath": str(analysis_paths.cuts_path),
        },
        "probe": asdict(probe_runtime(context, os_name)),
    }


def build_parser(os_name: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=f"run_tribe_{os_name}.py",
        description=f"Local {os_name} launcher for the Twine analysis backend.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("probe", help="Inspect local runtime readiness for the active backend.")
    subparsers.add_parser("download", help="Warm-download the local TRIBE model.")

    serve = subparsers.add_parser("serve", help="Start the existing FastAPI backend.")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=None)

    analyze = subparsers.add_parser(
        "analyze",
        help="Run a local smoke-test analysis for an MP4 or MOV using the existing backend pipeline.",
    )
    analyze.add_argument("--video", type=Path, required=True)

    return parser


def emit_json(payload: dict[str, Any], *, stream: Any = sys.stdout) -> None:
    stream.write(json.dumps(payload, indent=2, sort_keys=True))
    stream.write("\n")
    stream.flush()


def main(os_name: str) -> int:
    parser = build_parser(os_name)
    args = parser.parse_args()
    context = get_runtime_context()

    try:
        if args.command == "probe":
            emit_json(command_probe(context, os_name))
            return 0
        if args.command == "download":
            emit_json(command_download(context, os_name))
            return 0
        if args.command == "serve":
            port = args.port or context.settings.api_port
            return command_serve(context, os_name, args.host, port)
        if args.command == "analyze":
            emit_json(command_analyze(context, os_name, args.video))
            return 0
        raise RunnerScriptError(f"Unsupported command: {args.command}")
    except (
        GeminiIntegrationError,
        MiroFishIntegrationError,
        RunnerScriptError,
        TribeIntegrationError,
        RuntimeError,
        FileNotFoundError,
    ) as exc:
        emit_json(
            {
                "status": "error",
                "command": getattr(args, "command", None),
                "osName": os_name,
                "error": str(exc),
            },
            stream=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main(platform.system().lower()))
