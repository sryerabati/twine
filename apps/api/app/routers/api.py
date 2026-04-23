from __future__ import annotations

import os
import platform
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.core.context import APIContext
from app.models.contracts import (
    AnalyzeRequest,
    AnalysisPayload,
    AnalysisResponse,
    AudienceWorldInterview,
    AudienceWorldInterviewRequest,
    AudienceWorldInterviewResponse,
    AudienceWorldPayload,
    AudienceWorldResponse,
    AudienceVoice,
    CompareRequest,
    CompareResponse,
    EditorDraftResponse,
    EditorGenerateRequest,
    ExportArtifact,
    HealthResponse,
    RepurposeGenerateRequest,
    RepurposeResultResponse,
    TrimRequest,
    TrimResponse,
    UploadResponse,
)
from app.services.gemini_runner import GeminiIntegrationError
from app.services.media import MediaInspectionError
from app.services.jobs import RepurposeSourceDescriptor


router = APIRouter(prefix="/api")
ANALYSIS_RUNNING_TIMEOUT = timedelta(minutes=10)


def get_context(request: Request) -> APIContext:
    return request.app.state.context


@router.get("/health", response_model=HealthResponse)
def health(context: APIContext = Depends(get_context)) -> HealthResponse:
    settings = context.settings
    runner = context.runner
    analysis_backend = settings.analysis_backend
    blockers = []
    notes = []
    ffmpeg_available = shutil.which(settings.ffmpeg_bin) is not None
    ffprobe_available = shutil.which(settings.ffprobe_bin) is not None
    if not ffmpeg_available:
        blockers.append("ffmpeg is not installed or not on PATH.")
    if not ffprobe_available:
        blockers.append("ffprobe is not installed or not on PATH.")
    if analysis_backend == "tribe":
        if not settings.huggingface_hub_token:
            blockers.append(
                "HUGGINGFACE_HUB_TOKEN is not set. Real TRIBE analysis will fail without valid Hugging Face access."
            )
        if not runner.has_install():
            blockers.append(
                "The tribev2 package is not installed in the API environment."
            )
    elif analysis_backend == "gemini":
        if not settings.gemini_api_key:
            blockers.append(
                "GEMINI_API_KEY is not set. Content analysis cannot call the configured remote backend."
            )
    else:
        if not (settings.mirofish_base_url or settings.mirofish_repo_dir):
            blockers.append(
                "MIROFISH_BASE_URL is not set and MIROFISH_REPO_DIR is not configured. "
                "Set one of them to use the official MiroFish backend."
            )
        if settings.mirofish_auto_start and not settings.mirofish_zep_api_key:
            blockers.append(
                "MIROFISH_ZEP_API_KEY is not set. The official MiroFish backend requires Zep Cloud."
            )
        if settings.mirofish_auto_start:
            if settings.gemini_platform == "vertex":
                if not (
                    settings.mirofish_vertex_project_id
                    or settings.mirofish_llm_base_url
                    or Path.home().joinpath(".config/gcloud/application_default_credentials.json").exists()
                    or Path.home().joinpath("Library/Application Support/gcloud/application_default_credentials.json").exists()
                    or Path.home().joinpath("AppData/Roaming/gcloud/application_default_credentials.json").exists()
                    or "GOOGLE_APPLICATION_CREDENTIALS" in os.environ
                    or "GOOGLE_CLOUD_PROJECT" in os.environ
                ):
                    blockers.append(
                        "Vertex-backed MiroFish needs ADC plus a project id. Set GOOGLE_APPLICATION_CREDENTIALS "
                        "or run `gcloud auth application-default login`, and set MIROFISH_VERTEX_PROJECT_ID or GOOGLE_CLOUD_PROJECT."
                    )
            elif not (settings.mirofish_llm_api_key or settings.gemini_api_key):
                blockers.append(
                    "MIROFISH_LLM_API_KEY is not set. Auto-starting the official MiroFish backend "
                    "needs an OpenAI-compatible LLM key; GEMINI_API_KEY also works via Gemini's OpenAI endpoint."
                )
    if runner.model_error():
        blockers.append(f"Model error: {runner.model_error()}")
    if analysis_backend == "tribe" and settings.tribe_device == "auto":
        notes.append(
            "Device selection is automatic and defaults to CUDA when available, otherwise CPU."
        )
    elif analysis_backend == "tribe":
        notes.append(f"TRIBE_DEVICE is pinned to {settings.tribe_device}.")
    elif analysis_backend == "mirofish":
        notes.append(
            "MiroFish runs as an external simulation service. It accepts a generated video brief, "
            "builds a graph, runs the simulation, and then returns a structured audience-outlook report."
        )
        if settings.gemini_platform == "vertex":
            notes.append(
                "Vertex mode uses the Vertex OpenAI-compatible endpoint with a short-lived Google Cloud access token, "
                "not a long-lived API key."
            )
        elif settings.gemini_api_key and not settings.mirofish_llm_api_key:
            notes.append(
                "Auto-start can reuse GEMINI_API_KEY through Gemini's OpenAI-compatible endpoint for the MiroFish LLM."
            )
    else:
        notes.append("Content analysis runs against the configured remote backend.")
    if platform.machine().lower() == "arm64":
        notes.append("Apple Silicon is supported as a baseline, but CPU inference may be slow.")
    return HealthResponse(
        ok=not blockers,
        analysisBackend=analysis_backend,
        pythonVersion=platform.python_version(),
        ffmpegAvailable=ffmpeg_available,
        ffprobeAvailable=ffprobe_available,
        huggingFaceTokenPresent=bool(settings.huggingface_hub_token),
        geminiApiKeyPresent=bool(
            settings.gemini_api_key
            or settings.mirofish_llm_api_key
            or settings.gemini_platform == "vertex"
        ),
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
    convex_upload_id: str | None = Form(default=None, alias="convexUploadId"),
    client_modified_at: datetime | None = Form(default=None, alias="clientModifiedAt"),
    context: APIContext = Depends(get_context),
) -> UploadResponse:
    settings = context.settings
    if settings.require_convex_ids and not convex_upload_id:
        raise HTTPException(
            status_code=400,
            detail="convexUploadId is required. Log in and let the app create a pending upload first.",
        )
    if convex_upload_id is not None:
        if len(convex_upload_id) > 64 or any(
            ord(ch) < 0x20 or ord(ch) > 0x7E for ch in convex_upload_id
        ):
            raise HTTPException(status_code=400, detail="Invalid convexUploadId.")
    if not file.filename or not file.filename.lower().endswith((".mp4", ".mov")):
        raise HTTPException(status_code=400, detail="Only MP4 and MOV uploads are supported in v1.")

    storage = context.storage
    media = context.media
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

    try:
        stored_source = storage.store_media_file(
            paths.source_path,
            content_type=file.content_type or "video/mp4",
        )
        stored_thumbnail = storage.store_media_file(
            paths.thumbnail_path,
            content_type="image/jpeg",
        )
    except RuntimeError as exc:
        storage.delete_upload(paths.upload_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    video = storage.video_asset_from_upload(
        upload_id=paths.upload_id,
        filename=file.filename,
        duration_sec=metadata.duration_sec,
        width=metadata.width,
        height=metadata.height,
        size_bytes=metadata.size_bytes,
        recorded_at=metadata.recorded_at,
        file_modified_at=client_modified_at or metadata.file_modified_at,
        source_storage_id=stored_source.storage_id,
        thumbnail_storage_id=stored_thumbnail.storage_id,
        source_url=stored_source.url,
        thumbnail_url=stored_thumbnail.url,
    )
    response = storage.hydrate_upload_response(UploadResponse(uploadId=paths.upload_id, video=video))
    storage.write_upload_metadata(response)
    context.convex_sync.attach_upload_local_id(
        convex_upload_id=convex_upload_id,
        local_upload_id=paths.upload_id,
        duration_sec=metadata.duration_sec,
        video_storage_id=stored_source.storage_id,
        thumbnail_storage_id=stored_thumbnail.storage_id,
    )
    if stored_source.storage_id or stored_thumbnail.storage_id:
        storage.delete_upload_cache(paths.upload_id)
    return response


@router.post("/analyze", response_model=AnalysisResponse, status_code=status.HTTP_202_ACCEPTED)
def analyze_video(
    request: AnalyzeRequest,
    context: APIContext = Depends(get_context),
) -> AnalysisResponse:
    storage = context.storage
    jobs = context.jobs
    settings = context.settings
    if settings.require_convex_ids and request.syncToConvexScan and not request.convexScanId:
        raise HTTPException(
            status_code=400,
            detail="convexScanId is required. Log in and let the app create a pending scan first.",
        )
    if request.convexScanId is not None:
        if len(request.convexScanId) > 64 or any(
            ord(ch) < 0x20 or ord(ch) > 0x7E for ch in request.convexScanId
        ):
            raise HTTPException(status_code=400, detail="Invalid convexScanId.")
    try:
        storage.read_upload_metadata(request.uploadId)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Upload not found.") from exc
    convex_scan_id = request.convexScanId if request.syncToConvexScan else None
    paths = storage.create_analysis_paths()
    record = storage.init_analysis_record(paths.analysis_id)
    context.convex_sync.update_scan_status(
        convex_scan_id=convex_scan_id,
        status="queued",
        local_analysis_id=paths.analysis_id,
    )
    jobs.enqueue(paths.analysis_id, request.uploadId, convex_scan_id)
    return record


@router.post("/editor/generate", response_model=EditorDraftResponse, status_code=status.HTTP_202_ACCEPTED)
def generate_editor_draft(
    request: EditorGenerateRequest,
    context: APIContext = Depends(get_context),
) -> EditorDraftResponse:
    storage = context.storage
    try:
        context.editor_ai.require_editor_support()
    except (GeminiIntegrationError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    for clip in request.clips:
        try:
            storage.read_upload_metadata(clip.localUploadId)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404,
                detail=f"Local upload {clip.localUploadId} was not found.",
            ) from exc

    draft_paths = storage.create_editor_draft_paths()
    record = storage.init_editor_draft_record(draft_paths.draft_id, request.convexProjectId)
    context.convex_sync.update_editor_project_status(
        convex_project_id=request.convexProjectId,
        status="queued",
        latest_local_draft_id=draft_paths.draft_id,
    )
    context.editor_jobs.enqueue(
        request.convexProjectId,
        draft_paths.draft_id,
        request.clips,
    )
    return record


@router.post("/repurpose/generate", response_model=RepurposeResultResponse, status_code=status.HTTP_202_ACCEPTED)
def generate_repurpose_result(
    request: RepurposeGenerateRequest,
    context: APIContext = Depends(get_context),
) -> RepurposeResultResponse:
    storage = context.storage
    try:
        context.editor_ai.require_editor_support()
    except (GeminiIntegrationError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        storage.read_upload_metadata(request.localUploadId)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Local upload {request.localUploadId} was not found.",
        ) from exc

    result_paths = storage.create_repurpose_result_paths()
    record = storage.init_repurpose_result_record(result_paths.result_id, request.convexProjectId)
    context.convex_sync.update_repurpose_project_status(
        convex_project_id=request.convexProjectId,
        status="queued",
        latest_local_result_id=result_paths.result_id,
    )
    context.repurpose_jobs.enqueue(
        request.convexProjectId,
        result_paths.result_id,
        RepurposeSourceDescriptor(
            source_upload_id=request.sourceUploadId,
            local_upload_id=request.localUploadId,
            filename=request.filename,
        ),
    )
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
    if record.status == "running" and datetime.now(UTC) - record.updatedAt > ANALYSIS_RUNNING_TIMEOUT:
        record = record.model_copy(
            update={
                "status": "failed",
                "error": "Analysis timed out — server may have restarted. Please re-run the scan.",
                "updatedAt": datetime.now(UTC),
            }
        )
        storage.write_analysis_record(record)
    if record.status == "completed" and record.payload is None:
        try:
            payload = storage.read_analysis_payload(analysis_id)
        except FileNotFoundError:
            raise HTTPException(
                status_code=409,
                detail="Analysis is marked completed but its payload is missing.",
            ) from None
        record = record.model_copy(update={"payload": payload})
    record = _maybe_attach_audience_world(record, context)
    record = _maybe_backfill_room_voices(record, context)
    return storage.hydrate_analysis_response(record)


@router.post("/analysis/{analysis_id}/cancel", response_model=AnalysisResponse)
def cancel_analysis(
    analysis_id: str,
    context: APIContext = Depends(get_context),
) -> AnalysisResponse:
    storage = context.storage
    try:
        record = storage.read_analysis_record(analysis_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Analysis not found.") from exc
    if record.status == "running":
        record = record.model_copy(
            update={
                "status": "failed",
                "error": "Cancelled by user.",
                "updatedAt": datetime.now(UTC),
            }
        )
        storage.write_analysis_record(record)
    return storage.hydrate_analysis_response(record)


@router.get("/analysis/by-upload/{upload_id}", response_model=AnalysisResponse)
def get_analysis_by_upload(
    upload_id: str,
    context: APIContext = Depends(get_context),
) -> AnalysisResponse:
    storage = context.storage
    try:
        record = storage.find_latest_analysis_for_upload(upload_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="No completed analysis found for this upload yet.",
        ) from exc
    record = _maybe_attach_audience_world(record, context)
    return _maybe_backfill_room_voices(record, context)


@router.get("/analysis/{analysis_id}/world", response_model=AudienceWorldResponse)
def get_analysis_world(
    analysis_id: str,
    context: APIContext = Depends(get_context),
) -> AudienceWorldResponse:
    try:
        record = context.storage.read_analysis_record(analysis_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Analysis not found.") from exc
    if record.status != "completed":
        raise HTTPException(status_code=409, detail="Analysis must complete before the world is available.")
    if record.payload is None:
        try:
            record = record.model_copy(update={"payload": context.storage.read_analysis_payload(analysis_id)})
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Analysis payload not found.") from exc
    record = _maybe_attach_audience_world(record, context)
    record = _maybe_refresh_audience_world(record, context)
    if record.payload is None or record.payload.audienceWorld is None:
        raise HTTPException(status_code=404, detail="No audience world is available for this analysis yet.")
    return AudienceWorldResponse(analysisId=analysis_id, world=record.payload.audienceWorld)


@router.post(
    "/analysis/{analysis_id}/world/interviews",
    response_model=AudienceWorldInterviewResponse,
)
def interview_analysis_world(
    analysis_id: str,
    request: AudienceWorldInterviewRequest,
    context: APIContext = Depends(get_context),
) -> AudienceWorldInterviewResponse:
    try:
        record = context.storage.read_analysis_record(analysis_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Analysis not found.") from exc
    if record.status != "completed":
        raise HTTPException(status_code=409, detail="Analysis must complete before agent interviews are available.")
    if record.payload is None:
        try:
            record = record.model_copy(update={"payload": context.storage.read_analysis_payload(analysis_id)})
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Analysis payload not found.") from exc
    record = _maybe_attach_audience_world(record, context)
    world = record.payload.audienceWorld if record.payload else None
    if world is None:
        raise HTTPException(status_code=404, detail="No audience world is available for this analysis yet.")

    simulation_id = str(world.simulationId).strip()
    if not simulation_id:
        try:
            provider_raw = context.storage.read_provider_raw(analysis_id)
        except FileNotFoundError:
            provider_raw = {}
        simulation_id = str(provider_raw.get("simulationId") or "").strip()
    if not simulation_id:
        raise HTTPException(status_code=404, detail="Simulation id is not available for this analysis.")

    interview_agents = getattr(context.runner, "interview_agents", None)
    if callable(interview_agents):
        try:
            live_interviews = interview_agents(
                simulation_id,
                agent_ids=request.agentIds,
                prompt=request.prompt,
                platform=request.platform,
            )
        except RuntimeError:
            live_interviews = []
        if live_interviews:
            merged_world = _merge_interviews_into_world(world, live_interviews)
            _persist_world_update(analysis_id, record, merged_world, context)
            return AudienceWorldInterviewResponse(
                analysisId=analysis_id,
                prompt=request.prompt,
                cached=False,
                interviews=[AudienceWorldInterview.model_validate(item) for item in live_interviews],
            )

    cached_interviews = [
        interview
        for interview in world.interviews
        if interview.agentId in request.agentIds
        and interview.prompt == request.prompt
        and (request.platform is None or interview.platform == request.platform)
    ]
    if cached_interviews:
        return AudienceWorldInterviewResponse(
            analysisId=analysis_id,
            prompt=request.prompt,
            cached=True,
            interviews=cached_interviews,
        )
    raise HTTPException(status_code=503, detail="Live interviews are unavailable and no cached responses matched this prompt.")


@router.get("/editor/projects/{project_id}/latest-draft", response_model=EditorDraftResponse)
def get_latest_editor_draft(
    project_id: str,
    context: APIContext = Depends(get_context),
) -> EditorDraftResponse:
    try:
        return context.storage.find_latest_editor_draft_for_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Editor draft not found.") from exc


@router.get("/repurpose/projects/{project_id}/latest-result", response_model=RepurposeResultResponse)
def get_latest_repurpose_result(
    project_id: str,
    context: APIContext = Depends(get_context),
) -> RepurposeResultResponse:
    try:
        return context.storage.find_latest_repurpose_result_for_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Repurpose result not found.") from exc


def _maybe_backfill_room_voices(record: AnalysisResponse, context: APIContext) -> AnalysisResponse:
    payload = record.payload
    if (
        record.status != "completed"
        or payload is None
        or payload.analysisMode != "read_the_room"
        or payload.audienceOutlook is None
        or len(payload.audienceOutlook.roomVoices) >= 10
    ):
        return record

    load_room_voices = getattr(context.runner, "_load_room_voices", None)
    if not callable(load_room_voices):
        return record

    try:
        provider_raw = context.storage.read_provider_raw(record.analysisId)
    except FileNotFoundError:
        return record

    simulation_id = str(provider_raw.get("simulationId") or "").strip()
    if not simulation_id:
        return record

    try:
        room_voices = load_room_voices(simulation_id, classify_with_gemini=True)
    except TypeError:
        room_voices = load_room_voices(simulation_id)
    if len(room_voices) <= len(payload.audienceOutlook.roomVoices):
        return record

    audience_outlook = payload.audienceOutlook.model_copy(
        update={
            "roomVoices": [AudienceVoice.model_validate(item) for item in room_voices[:10]],
        }
    )
    next_payload = payload.model_copy(update={"audienceOutlook": audience_outlook})
    context.storage.write_analysis_payload(record.analysisId, next_payload)
    return record.model_copy(update={"payload": next_payload})


def _maybe_attach_audience_world(record: AnalysisResponse, context: APIContext) -> AnalysisResponse:
    payload = record.payload
    if record.status != "completed" or payload is None or payload.analysisMode != "read_the_room":
        return record

    try:
        stored_world = context.storage.read_analysis_world(record.analysisId)
    except FileNotFoundError:
        return record

    current_world = payload.audienceWorld
    if current_world is not None and not _should_upgrade_world(current_world, stored_world):
        return record

    next_payload = payload.model_copy(update={"audienceWorld": stored_world})
    context.storage.write_analysis_payload(record.analysisId, next_payload)
    return record.model_copy(update={"payload": next_payload})


def _maybe_refresh_audience_world(record: AnalysisResponse, context: APIContext) -> AnalysisResponse:
    payload = record.payload
    if record.status != "completed" or payload is None or payload.analysisMode != "read_the_room":
        return record

    world = payload.audienceWorld
    if world is None:
        return record

    if world.status == "ready" and len(world.cohorts) >= 3 and len(world.threads) >= 1 and len(world.interviews) >= 1:
        return record

    hydrate_world = getattr(context.runner, "hydrate_audience_world", None)
    if not callable(hydrate_world):
        return record

    simulation_id = str(world.simulationId).strip()
    if not simulation_id:
        try:
            provider_raw = context.storage.read_provider_raw(record.analysisId)
        except FileNotFoundError:
            provider_raw = {}
        simulation_id = str(provider_raw.get("simulationId") or "").strip()
    if not simulation_id:
        return record

    try:
        refreshed = hydrate_world(
            simulation_id,
            windows=_world_windows(payload),
            include_cached_interviews=True,
        )
    except RuntimeError:
        return record

    candidate = AudienceWorldPayload.model_validate(refreshed)
    if not _should_upgrade_world(world, candidate):
        return record

    _persist_world_update(record.analysisId, record, candidate, context)
    next_payload = payload.model_copy(update={"audienceWorld": candidate})
    return record.model_copy(update={"payload": next_payload})


def _should_upgrade_world(current: AudienceWorldPayload, candidate: AudienceWorldPayload) -> bool:
    status_rank = {"unavailable": 0, "hydrating": 1, "partial": 2, "ready": 3}
    if status_rank.get(candidate.status, 0) > status_rank.get(current.status, 0):
        return True
    return (
        len(candidate.threads) > len(current.threads)
        or len(candidate.cohorts) > len(current.cohorts)
        or len(candidate.agents) > len(current.agents)
        or len(candidate.interviews) > len(current.interviews)
        or len(candidate.evidenceMoments) > len(current.evidenceMoments)
    )


def _world_windows(payload: AnalysisPayload) -> list[dict[str, object]]:
    if payload.audienceOutlook is None:
        return []
    return [
        {
            "windowIndex": index,
            "startSec": moment.startSec,
            "endSec": moment.endSec,
            "note": moment.note,
        }
        for index, moment in enumerate(payload.audienceOutlook.timeline, start=1)
    ]


def _merge_interviews_into_world(
    world: AudienceWorldPayload,
    interviews: list[dict[str, object]],
) -> AudienceWorldPayload:
    merged: dict[tuple[int, str, str | None], AudienceWorldInterview] = {
        (item.agentId, item.prompt, item.platform): item for item in world.interviews
    }
    for item in interviews:
        interview = AudienceWorldInterview.model_validate(item)
        merged[(interview.agentId, interview.prompt, interview.platform)] = interview
    status = "ready" if merged else world.status
    return world.model_copy(
        update={
            "status": status,
            "interviews": list(merged.values()),
        }
    )


def _persist_world_update(
    analysis_id: str,
    record: AnalysisResponse,
    world: AudienceWorldPayload,
    context: APIContext,
) -> None:
    context.storage.write_analysis_world(analysis_id, world)
    if record.payload is None:
        return
    next_payload = record.payload.model_copy(update={"audienceWorld": world})
    context.storage.write_analysis_payload(analysis_id, next_payload)


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
    all_cuts = payload.cutPlan or payload.deadspaceCuts
    if not all_cuts:
        raise HTTPException(
            status_code=409,
            detail="This analysis has no deadspace cuts to apply.",
        )

    # Bounds-check cut indices. Default: apply every default-selected cut.
    if request.cutIds is not None:
        selected_cuts = []
        seen_ids: set[str] = set()
        cuts_by_id = {cut.id: cut for cut in all_cuts}
        for cut_id in request.cutIds:
            cut = cuts_by_id.get(cut_id)
            if cut is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid cut id {cut_id}.",
                )
            if cut_id in seen_ids:
                continue
            seen_ids.add(cut_id)
            selected_cuts.append(cut)
        if not selected_cuts:
            raise HTTPException(status_code=400, detail="At least one cut must be selected.")
    elif request.cutIndices is None:
        selected_cuts = [cut for cut in all_cuts if cut.defaultSelected]
        if not selected_cuts:
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

    try:
        stored_trimmed_video = storage.store_media_file(
            analysis_paths.trimmed_video_path,
            content_type="video/mp4",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Patch the payload so later reads surface the trimmed artifact.
    updated_artifacts = payload.artifacts.model_copy(
        update={
            "trimmedVideoUrl": stored_trimmed_video.url,
            "trimmedVideoStorageId": stored_trimmed_video.storage_id,
        }
    )
    updated_diagnostics = payload.diagnostics.model_copy(
        update={"trimmedDurationSec": round(new_duration, 2)}
    )
    updated_exports = [
        *payload.exports,
        ExportArtifact(
            exportId=uuid4().hex,
            createdAt=datetime.now(UTC),
            trimmedVideoUrl=stored_trimmed_video.url,
            trimmedVideoStorageId=stored_trimmed_video.storage_id,
            selectedCutIds=[cut.id for cut in selected_cuts],
            removedSeconds=round(payload.video.durationSec - new_duration, 2),
            trimmedDurationSec=round(new_duration, 2),
        ),
    ]
    updated_payload = payload.model_copy(
        update={
            "artifacts": updated_artifacts,
            "diagnostics": updated_diagnostics,
            "exports": updated_exports,
        }
    )
    storage.write_analysis_payload(analysis_id, updated_payload)
    # Also refresh the record so GET /api/analysis/{id} returns the updated
    # payload without needing a cache bust. The record is the source of truth
    # that the getter returns to clients.
    refreshed_record = record.model_copy(update={"payload": updated_payload})
    storage.write_analysis_record(refreshed_record)
    if stored_trimmed_video.storage_id:
        analysis_paths.trimmed_video_path.unlink(missing_ok=True)

    return TrimResponse(
        analysisId=analysis_id,
        trimmedVideoUrl=updated_artifacts.trimmedVideoUrl or "",
        trimmedVideoStorageId=stored_trimmed_video.storage_id,
        originalDurationSec=round(payload.video.durationSec, 2),
        trimmedDurationSec=round(new_duration, 2),
        removedSeconds=round(payload.video.durationSec - new_duration, 2),
        appliedCuts=selected_cuts,
    )
