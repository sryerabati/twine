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


class VideoAsset(BaseModel):
    uploadId: str
    filename: str
    sourceUrl: str
    thumbnailUrl: str
    durationSec: float
    width: int
    height: int
    sizeBytes: int


class UploadResponse(BaseModel):
    uploadId: str
    video: VideoAsset


class AnalyzeRequest(BaseModel):
    uploadId: str


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
    start: float
    end: float
    reason: str


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
    rawPredictionsUrl: str
    processedJsonUrl: str
    cutListJsonUrl: str
    eventsCsvUrl: str
    segmentsJsonUrl: str


class Diagnostics(BaseModel):
    device: str
    modelRepo: str
    modelCommit: str
    transcriptWordCount: int
    sceneChangeCount: int
    deadspaceSeconds: float
    warnings: list[str]


class AnalysisPayload(BaseModel):
    analysisId: str
    video: VideoAsset
    brainResponse: BrainResponsePayload
    markers: list[Marker]
    deadspaceCuts: list[DeadspaceCut]
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
    pythonVersion: str
    ffmpegAvailable: bool
    ffprobeAvailable: bool
    huggingFaceTokenPresent: bool
    selectedDevice: str
    modelStatus: Literal["unloaded", "loaded", "error"]
    modelRepo: str
    modelCommit: str
    blockers: list[str]
    notes: list[str]


class CompareRequest(BaseModel):
    analysisIdA: str
    analysisIdB: str


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
