from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


AnalysisStatus = Literal["queued", "running", "completed", "failed"]
MarkerSeverity = Literal["low", "medium", "high"]
MarkerType = Literal[
    "strong_hook",
    "attention_drop",
    "deadspace_candidate",
    "high_rewatch_moment",
    "pacing_issue",
    "audio_energy_drop",
]
ConfidenceBand = Literal["low", "medium", "high"]
CutType = Literal["deadspace", "low_value"]


class VideoAsset(BaseModel):
    uploadId: str
    filename: str
    sourceUrl: str
    thumbnailUrl: str
    durationSec: float
    width: int
    height: int
    sizeBytes: int
    recordedAt: datetime | None = None
    fileModifiedAt: datetime | None = None


class UploadResponse(BaseModel):
    uploadId: str
    video: VideoAsset


class AnalyzeRequest(BaseModel):
    uploadId: str
    convexScanId: str | None = None
    syncToConvexScan: bool = True


class HemisphereHeatmap(BaseModel):
    left: list[float] = Field(min_length=64, max_length=64)
    right: list[float] = Field(min_length=64, max_length=64)


class BrainResponsePoint(BaseModel):
    stimulusTimeSec: float
    segmentStartSec: float
    segmentDurationSec: float
    globalActivation: float
    leftHemisphereActivation: float
    rightHemisphereActivation: float
    rollingVariance: float
    activationDelta: float
    spikeScore: float
    dropScore: float
    audioEnergy: float
    motionScore: float
    transcriptDensity: float
    sceneChange: bool
    silenceOverlap: bool
    hemisphereHeatmap: HemisphereHeatmap


class MeshInfo(BaseModel):
    space: str = "fsaverage5"
    subject: str = "average"
    lagCompensationSec: float = 5.0
    totalVertices: int


class BrainResponsePayload(BaseModel):
    timeSeries: list[BrainResponsePoint]
    meshInfo: MeshInfo


class Marker(BaseModel):
    t: float
    type: MarkerType
    severity: MarkerSeverity
    explanation: str
    suggestion: str


class DeadspaceCut(BaseModel):
    id: str
    type: CutType = "deadspace"
    start: float
    end: float
    reason: str
    defaultSelected: bool = True
    recommendedAction: str = "Remove this section or bridge it with a harder cut."


class ActionBoard(BaseModel):
    keep: list[str] = Field(default_factory=list)
    fixNow: list[str] = Field(default_factory=list)
    testNext: list[str] = Field(default_factory=list)
    exportPlan: list[str] = Field(default_factory=list)


class TimelineSegment(BaseModel):
    id: str
    type: MarkerType | CutType
    label: str
    start: float
    end: float
    severity: MarkerSeverity
    reason: str
    recommendedAction: str
    cutId: str | None = None


class ExportArtifact(BaseModel):
    exportId: str
    createdAt: datetime
    trimmedVideoUrl: str
    selectedCutIds: list[str]
    removedSeconds: float
    trimmedDurationSec: float


class ScoreSet(BaseModel):
    hookScore: int
    pacingScore: int
    retentionEstimate: int
    viralPotential: int
    confidence: ConfidenceBand
    helpingFactors: list[str]
    hurtingFactors: list[str]


class AnalysisSummary(BaseModel):
    strengths: list[str]
    weaknesses: list[str]
    overallRecommendation: str


class ArtifactLinks(BaseModel):
    rawPredictionsUrl: str | None = None
    providerRawJsonUrl: str | None = None
    processedJsonUrl: str
    cutListJsonUrl: str
    eventsCsvUrl: str
    segmentsJsonUrl: str
    trimmedVideoUrl: str | None = None


class Diagnostics(BaseModel):
    device: str
    modelRepo: str
    modelCommit: str
    transcriptWordCount: int
    sceneChangeCount: int
    deadspaceSeconds: float
    trimmedDurationSec: float | None = None
    warnings: list[str]


class AnalysisPayload(BaseModel):
    analysisId: str
    video: VideoAsset
    brainResponse: BrainResponsePayload
    markers: list[Marker]
    deadspaceCuts: list[DeadspaceCut] = Field(default_factory=list)
    lowValueCuts: list[DeadspaceCut] = Field(default_factory=list)
    cutPlan: list[DeadspaceCut] = Field(default_factory=list)
    actionBoard: ActionBoard = Field(default_factory=ActionBoard)
    timelineSegments: list[TimelineSegment] = Field(default_factory=list)
    exports: list[ExportArtifact] = Field(default_factory=list)
    scores: ScoreSet
    summary: AnalysisSummary
    artifacts: ArtifactLinks
    diagnostics: Diagnostics


class AnalysisResponse(BaseModel):
    analysisId: str
    status: AnalysisStatus
    createdAt: datetime
    updatedAt: datetime
    error: str | None = None
    payload: AnalysisPayload | None = None


class HealthResponse(BaseModel):
    ok: bool
    analysisBackend: Literal["tribe", "gemini"]
    pythonVersion: str
    ffmpegAvailable: bool
    ffprobeAvailable: bool
    huggingFaceTokenPresent: bool
    geminiApiKeyPresent: bool
    selectedDevice: str
    modelStatus: Literal["unloaded", "loaded", "error"]
    modelRepo: str
    modelCommit: str
    blockers: list[str]
    notes: list[str]


class CompareRequest(BaseModel):
    analysisIdA: str
    analysisIdB: str


class TrimRequest(BaseModel):
    """Request to trim a video using a subset of detected deadspace cuts."""

    cutIndices: list[int] | None = None
    cutIds: list[str] | None = None


class TrimResponse(BaseModel):
    analysisId: str
    trimmedVideoUrl: str
    originalDurationSec: float
    trimmedDurationSec: float
    removedSeconds: float
    appliedCuts: list[DeadspaceCut]


class CompareSlice(BaseModel):
    label: str
    winner: Literal["A", "B", "tie"]
    aScore: int
    bScore: int


class CompareResponse(BaseModel):
    analysisIdA: str
    analysisIdB: str
    winner: Literal["A", "B", "tie"]
    winnerReason: str
    recommendation: str
    summary: list[str]
    slices: list[CompareSlice]


EditorProjectStatus = Literal["drafting", "queued", "running", "completed", "failed"]
EditorDraftStatus = Literal["queued", "running", "completed", "failed"]
EditorDraftStage = Literal[
    "queued",
    "preparing_clips",
    "ordering_story",
    "rendering_video",
    "finalizing",
    "completed",
    "failed",
]
OrderingConfidence = Literal["low", "medium", "high"]


class EditorClipDescriptor(BaseModel):
    clipId: str
    uploadId: str
    localUploadId: str
    filename: str


class EditorGenerateRequest(BaseModel):
    convexProjectId: str
    clips: list[EditorClipDescriptor] = Field(min_length=2)


class EditorDraftExport(BaseModel):
    videoUrl: str
    durationSec: float


class OrderedDraftClip(BaseModel):
    clipId: str
    uploadId: str
    filename: str
    sourceOrder: int
    resolvedOrder: int
    rationale: str
    transcriptPreview: str
    summary: str
    speechCoverage: float
    removedSeconds: float
    trimmedDurationSec: float
    outputStartSec: float
    outputEndSec: float
    recordedAt: datetime | None = None
    fileModifiedAt: datetime | None = None
    warnings: list[str] = Field(default_factory=list)
    appliedCuts: list[DeadspaceCut] = Field(default_factory=list)


class EditorDraftPayload(BaseModel):
    export: EditorDraftExport
    storylineSummary: str
    orderingConfidence: OrderingConfidence
    orderedClips: list[OrderedDraftClip]
    warnings: list[str] = Field(default_factory=list)


class EditorDraftResponse(BaseModel):
    draftId: str
    projectId: str
    status: EditorDraftStatus
    stage: EditorDraftStage | None = None
    progressPercent: int | None = Field(default=None, ge=0, le=100)
    statusMessage: str | None = None
    createdAt: datetime
    updatedAt: datetime
    error: str | None = None
    payload: EditorDraftPayload | None = None
