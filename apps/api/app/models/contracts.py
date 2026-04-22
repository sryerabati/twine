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
AudienceWorldStatus = Literal["hydrating", "ready", "partial", "unavailable"]


class VideoAsset(BaseModel):
    uploadId: str
    filename: str
    sourceUrl: str
    thumbnailUrl: str
    sourceStorageId: str | None = None
    thumbnailStorageId: str | None = None
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


class BrainSignalSummary(BaseModel):
    averageActivation: float
    averageMotion: float
    averageAudioEnergy: float
    averageTranscriptDensity: float


class AudienceTimelinePoint(BaseModel):
    startSec: float
    endSec: float
    sentiment: float
    interest: float
    clarity: float
    trust: float
    shareIntent: float
    dropoffRisk: float
    primaryReaction: str
    note: str


class AudienceVoice(BaseModel):
    speaker: str
    handle: str
    role: str
    platform: str
    stance: Literal["positive", "negative"] = "positive"
    quote: str


class AudienceOutlook(BaseModel):
    headline: str
    summary: str
    likelyPraise: list[str]
    likelyPushback: list[str]
    timeline: list[AudienceTimelinePoint]
    roomVoices: list[AudienceVoice] = Field(default_factory=list)


class AudienceWorldPlatformBreakdown(BaseModel):
    platform: str
    volume: int
    engagement: int
    leaning: str
    dominantNarratives: list[str] = Field(default_factory=list)


class AudienceWorldCohort(BaseModel):
    id: str
    label: str
    size: int
    leaning: str
    proofThreshold: str
    keyConcerns: list[str] = Field(default_factory=list)
    liked: list[str] = Field(default_factory=list)
    blocked: list[str] = Field(default_factory=list)
    representativeAgentIds: list[int] = Field(default_factory=list)
    momentIds: list[str] = Field(default_factory=list)


class AudienceWorldComment(BaseModel):
    id: str
    agentId: int | None = None
    speaker: str
    handle: str
    role: str
    platform: str
    content: str
    createdAt: datetime | None = None
    likes: int = 0
    shares: int = 0


class AudienceWorldThread(BaseModel):
    id: str
    platform: str
    dominantStance: str
    engagement: int
    replyCount: int = 0
    participatingCohortIds: list[str] = Field(default_factory=list)
    rootPost: AudienceWorldComment
    replies: list[AudienceWorldComment] = Field(default_factory=list)


class AudienceWorldAgentStats(BaseModel):
    totalActions: int = 0
    redditActions: int = 0
    twitterActions: int = 0


class AudienceWorldAgent(BaseModel):
    id: int
    displayName: str
    handle: str
    role: str
    platforms: list[str] = Field(default_factory=list)
    bio: str | None = None
    stats: AudienceWorldAgentStats = Field(default_factory=AudienceWorldAgentStats)


class AudienceWorldInterview(BaseModel):
    agentId: int
    prompt: str
    response: str
    platform: str | None = None
    cached: bool = True


class AudienceWorldEvidenceMoment(BaseModel):
    windowId: str
    startSec: float
    endSec: float
    headline: str
    reason: str
    threadIds: list[str] = Field(default_factory=list)
    cohortIds: list[str] = Field(default_factory=list)
    agentIds: list[int] = Field(default_factory=list)


class AudienceWorldPayload(BaseModel):
    status: AudienceWorldStatus
    simulationId: str
    platformBreakdown: list[AudienceWorldPlatformBreakdown] = Field(default_factory=list)
    cohorts: list[AudienceWorldCohort] = Field(default_factory=list)
    threads: list[AudienceWorldThread] = Field(default_factory=list)
    agents: list[AudienceWorldAgent] = Field(default_factory=list)
    interviews: list[AudienceWorldInterview] = Field(default_factory=list)
    evidenceMoments: list[AudienceWorldEvidenceMoment] = Field(default_factory=list)



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
    trimmedVideoStorageId: str | None = None
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
    trimmedVideoStorageId: str | None = None


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
    analysisMode: Literal["brain_scan", "read_the_room"] = "brain_scan"
    video: VideoAsset
    brainResponse: BrainResponsePayload
    audienceOutlook: AudienceOutlook | None = None
    audienceWorld: AudienceWorldPayload | None = None
    brainSummary: BrainSignalSummary | None = None
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


class AudienceWorldResponse(BaseModel):
    analysisId: str
    world: AudienceWorldPayload


class AudienceWorldInterviewRequest(BaseModel):
    agentIds: list[int] = Field(min_length=1)
    prompt: str
    platform: str | None = None


class AudienceWorldInterviewResponse(BaseModel):
    analysisId: str
    prompt: str
    cached: bool
    interviews: list[AudienceWorldInterview] = Field(default_factory=list)


class HealthResponse(BaseModel):
    ok: bool
    analysisBackend: Literal["tribe", "gemini", "mirofish"]
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
    trimmedVideoStorageId: str | None = None
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
RepurposeResultStatus = Literal["queued", "running", "completed", "failed"]
RepurposeStage = Literal[
    "queued",
    "preparing_source",
    "planning_variants",
    "rendering_variants",
    "finalizing",
    "completed",
    "failed",
]
RepurposeDurationTarget = Literal["source", "short"]


class EditorClipDescriptor(BaseModel):
    clipId: str
    uploadId: str
    localUploadId: str
    filename: str


class EditorGenerateRequest(BaseModel):
    convexProjectId: str
    clips: list[EditorClipDescriptor] = Field(min_length=2)


class RepurposeGenerateRequest(BaseModel):
    convexProjectId: str
    sourceUploadId: str
    localUploadId: str
    filename: str


class EditorDraftExport(BaseModel):
    videoUrl: str
    videoStorageId: str | None = None
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


class RepurposeSourceSummary(BaseModel):
    sourceUploadId: str
    filename: str
    durationSec: float
    summary: str
    speechCoverage: float


class RepurposeSegmentSummary(BaseModel):
    segmentId: str
    startSec: float
    endSec: float
    transcriptPreview: str
    summary: str


class RepurposeVariant(BaseModel):
    variantId: str
    title: str
    angleSummary: str
    rationale: str
    durationTarget: RepurposeDurationTarget
    durationSec: float
    videoUrl: str
    videoStorageId: str | None = None
    segmentCount: int
    segments: list[RepurposeSegmentSummary] = Field(default_factory=list)


class RepurposeResultPayload(BaseModel):
    source: RepurposeSourceSummary
    summary: str
    variants: list[RepurposeVariant] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RepurposeResultResponse(BaseModel):
    resultId: str
    projectId: str
    status: RepurposeResultStatus
    stage: RepurposeStage | None = None
    progressPercent: int | None = Field(default=None, ge=0, le=100)
    statusMessage: str | None = None
    createdAt: datetime
    updatedAt: datetime
    error: str | None = None
    payload: RepurposeResultPayload | None = None
