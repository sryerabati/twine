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
    TrimRequest,
    TrimResponse,
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


@router.post("/analysis/{analysis_id}/trim", response_model=TrimResponse)
def trim_analysis(
    analysis_id: str,
    request: TrimRequest,
    context: APIContext = Depends(get_context),
) -> TrimResponse:
    """Produce a trimmed MP4 that removes the selected deadspace cuts.

    Security notes:
    - analysis_id is validated as a clean hex id by StorageService (blocks path traversal).
    - ffmpeg is invoked with an argument list, never a shell string.
    - cutIndices are bounds-checked against the stored cut list.
    - ffmpeg stderr is not leaked to the client response.
    """
    storage = context.storage
    media = context.media

    try:
        record = storage.read_analysis_record(analysis_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Analysis not found.") from exc
    if record.status != "completed":
        raise HTTPException(
            status_code=409,
            detail="Analysis must be completed before trimming.",
        )

    try:
        payload = storage.read_analysis_payload(analysis_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Analysis payload missing.") from exc

    all_cuts = payload.deadspaceCuts
    if not all_cuts:
        raise HTTPException(
            status_code=409,
            detail="This analysis has no deadspace cuts to apply.",
        )

    # Bounds-check cut indices. Default: apply every detected cut.
    if request.cutIndices is None:
        selected_cuts = list(all_cuts)
    else:
        selected_cuts = []
        seen: set[int] = set()
        for index in request.cutIndices:
            if not isinstance(index, int) or index < 0 or index >= len(all_cuts):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid cut index {index}.",
                )
            if index in seen:
                continue
            seen.add(index)
            selected_cuts.append(all_cuts[index])
        if not selected_cuts:
            raise HTTPException(status_code=400, detail="At least one cut must be selected.")

    # Locate the source video via the upload metadata tied to this analysis.
    try:
        upload_paths = storage.upload_paths(payload.video.uploadId)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=410,
            detail="Source upload is no longer available on disk.",
        ) from exc

    analysis_paths = storage.analysis_paths(analysis_id)
    try:
        new_duration = media.trim_deadspace(
            source_path=upload_paths.source_path,
            output_path=analysis_paths.trimmed_video_path,
            cuts=[(cut.start, cut.end) for cut in selected_cuts],
            total_duration_sec=payload.video.durationSec,
        )
    except MediaInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Patch the payload so later reads surface the trimmed artifact.
    updated_artifacts = payload.artifacts.model_copy(
        update={"trimmedVideoUrl": storage.to_storage_url(analysis_paths.trimmed_video_path)}
    )
    updated_diagnostics = payload.diagnostics.model_copy(
        update={"trimmedDurationSec": round(new_duration, 2)}
    )
    updated_payload = payload.model_copy(
        update={"artifacts": updated_artifacts, "diagnostics": updated_diagnostics}
    )
    storage.write_analysis_payload(analysis_id, updated_payload)
    # Also refresh the record so GET /api/analysis/{id} returns the updated
    # payload without needing a cache bust. The record is the source of truth
    # that the getter returns to clients.
    refreshed_record = record.model_copy(update={"payload": updated_payload})
    storage.write_analysis_record(refreshed_record)

    return TrimResponse(
        analysisId=analysis_id,
        trimmedVideoUrl=updated_artifacts.trimmedVideoUrl or "",
        originalDurationSec=round(payload.video.durationSec, 2),
        trimmedDurationSec=round(new_duration, 2),
        removedSeconds=round(payload.video.durationSec - new_duration, 2),
        appliedCuts=selected_cuts,
    )
