from __future__ import annotations

import platform
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.core.context import APIContext
from app.models.contracts import (
    AnalyzeRequest,
    AnalysisResponse,
    CompareRequest,
    CompareResponse,
    HealthResponse,
    UploadResponse,
)
from app.services.media import MediaInspectionError


router = APIRouter(prefix="/api")


def get_context(request: Request) -> APIContext:
    return request.app.state.context


@router.get("/health", response_model=HealthResponse)
def health(context: APIContext = Depends(get_context)) -> HealthResponse:
    settings = context.settings
    runner = context.runner
    blockers = []
    notes = []
    ffmpeg_available = shutil.which(settings.ffmpeg_bin) is not None
    ffprobe_available = shutil.which(settings.ffprobe_bin) is not None
    if not ffmpeg_available:
        blockers.append("ffmpeg is not installed or not on PATH.")
    if not ffprobe_available:
        blockers.append("ffprobe is not installed or not on PATH.")
    if not settings.huggingface_hub_token:
        blockers.append(
            "HUGGINGFACE_HUB_TOKEN is not set. Real TRIBE analysis will fail without valid Hugging Face access."
        )
    if not runner.has_install():
        blockers.append(
            "The tribev2 package is not installed in the API environment."
        )
    if runner.model_error():
        blockers.append(f"Model error: {runner.model_error()}")
    if settings.tribe_device == "auto":
        notes.append(
            "Device selection is automatic and defaults to CUDA when available, otherwise CPU."
        )
    else:
        notes.append(f"TRIBE_DEVICE is pinned to {settings.tribe_device}.")
    if platform.machine().lower() == "arm64":
        notes.append("Apple Silicon is supported as a baseline, but CPU inference may be slow.")
    return HealthResponse(
        ok=not blockers,
        pythonVersion=platform.python_version(),
        ffmpegAvailable=ffmpeg_available,
        ffprobeAvailable=ffprobe_available,
        huggingFaceTokenPresent=bool(settings.huggingface_hub_token),
        selectedDevice=runner.selected_device(),
        modelStatus=runner.model_status(),
        modelRepo=runner.MODEL_REPO if hasattr(runner, "MODEL_REPO") else "facebook/tribev2",
        modelCommit=runner.MODEL_COMMIT if hasattr(runner, "MODEL_COMMIT") else "72399081ed3f1040c4d996cefb2864a4c46f5b8e",
        blockers=blockers,
        notes=notes,
    )


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    file: UploadFile = File(...),
    context: APIContext = Depends(get_context),
) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Only MP4 uploads are supported in v1.")

    storage = context.storage
    media = context.media
    settings = context.settings
    paths = await storage.save_upload(file)
    if paths.source_path.stat().st_size > settings.max_upload_bytes:
        storage.delete_upload(paths.upload_id)
        raise HTTPException(status_code=413, detail="Upload exceeded the configured size limit.")

    try:
        metadata = media.inspect_video(paths.source_path)
        if metadata.duration_sec > settings.max_video_seconds:
            storage.delete_upload(paths.upload_id)
            raise HTTPException(
                status_code=400,
                detail=f"Clip is too long. Maximum supported duration is {settings.max_video_seconds} seconds.",
            )
        media.generate_thumbnail(paths.source_path, paths.thumbnail_path)
    except MediaInspectionError as exc:
        storage.delete_upload(paths.upload_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    video = storage.video_asset_from_upload(
        upload_id=paths.upload_id,
        filename=file.filename,
        duration_sec=metadata.duration_sec,
        width=metadata.width,
        height=metadata.height,
        size_bytes=metadata.size_bytes,
    )
    response = UploadResponse(uploadId=paths.upload_id, video=video)
    storage.write_upload_metadata(response)
    return response


@router.post("/analyze", response_model=AnalysisResponse, status_code=status.HTTP_202_ACCEPTED)
def analyze_video(
    request: AnalyzeRequest,
    context: APIContext = Depends(get_context),
) -> AnalysisResponse:
    storage = context.storage
    jobs = context.jobs
    try:
        storage.read_upload_metadata(request.uploadId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Upload not found.") from exc
    paths = storage.create_analysis_paths()
    record = storage.init_analysis_record(paths.analysis_id)
    jobs.enqueue(paths.analysis_id, request.uploadId)
    return record


@router.get("/analysis/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(
    analysis_id: str,
    context: APIContext = Depends(get_context),
) -> AnalysisResponse:
    storage = context.storage
    try:
        record = storage.read_analysis_record(analysis_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Analysis not found.") from exc
    if record.status == "completed" and record.payload is None:
        try:
            payload = storage.read_analysis_payload(analysis_id)
        except FileNotFoundError:
            raise HTTPException(
                status_code=409,
                detail="Analysis is marked completed but its payload is missing.",
            ) from None
        record = record.model_copy(update={"payload": payload})
    return record


@router.post("/compare", response_model=CompareResponse)
def compare_analyses(
    request: CompareRequest,
    context: APIContext = Depends(get_context),
) -> CompareResponse:
    storage = context.storage
    engine = context.engine
    try:
        record_a = storage.read_analysis_record(request.analysisIdA)
        record_b = storage.read_analysis_record(request.analysisIdB)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="One or both analyses were not found.") from exc
    if record_a.status != "completed" or record_b.status != "completed":
        raise HTTPException(status_code=409, detail="Both analyses must be completed before compare.")
    try:
        analysis_a = storage.read_analysis_payload(request.analysisIdA)
        analysis_b = storage.read_analysis_payload(request.analysisIdB)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="One or both analyses were not found.") from exc
    return engine.compare(analysis_a, analysis_b)
