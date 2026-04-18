export type AnalysisStatus = "queued" | "running" | "completed" | "failed";
export type MarkerSeverity = "low" | "medium" | "high";
export type MarkerType =
  | "strong_hook"
  | "attention_drop"
  | "deadspace_candidate"
  | "high_rewatch_moment"
  | "pacing_issue"
  | "audio_energy_drop";
export type ConfidenceBand = "low" | "medium" | "high";
export type CutType = "deadspace" | "low_value";

export type HealthResponse = {
  ok: boolean;
  analysisBackend: "tribe" | "gemini";
  pythonVersion: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  huggingFaceTokenPresent: boolean;
  geminiApiKeyPresent: boolean;
  selectedDevice: string;
  modelStatus: "unloaded" | "loaded" | "error";
  modelRepo: string;
  modelCommit: string;
  blockers: string[];
  notes: string[];
};

export type VideoAsset = {
  uploadId: string;
  filename: string;
  sourceUrl: string;
  thumbnailUrl: string;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
};

export type UploadResponse = {
  uploadId: string;
  video: VideoAsset;
};

export type HemisphereHeatmap = {
  left: number[];
  right: number[];
};

export type BrainResponsePoint = {
  stimulusTimeSec: number;
  segmentStartSec: number;
  segmentDurationSec: number;
  globalActivation: number;
  leftHemisphereActivation: number;
  rightHemisphereActivation: number;
  rollingVariance: number;
  activationDelta: number;
  spikeScore: number;
  dropScore: number;
  audioEnergy: number;
  motionScore: number;
  transcriptDensity: number;
  sceneChange: boolean;
  silenceOverlap: boolean;
  hemisphereHeatmap: HemisphereHeatmap;
};

export type Marker = {
  t: number;
  type: MarkerType;
  severity: MarkerSeverity;
  explanation: string;
  suggestion: string;
};

export type DeadspaceCut = {
  id: string;
  type: CutType;
  start: number;
  end: number;
  reason: string;
  defaultSelected: boolean;
  recommendedAction: string;
};

export type ActionBoard = {
  keep: string[];
  fixNow: string[];
  testNext: string[];
  exportPlan: string[];
};

export type TimelineSegment = {
  id: string;
  type: MarkerType | CutType;
  label: string;
  start: number;
  end: number;
  severity: MarkerSeverity;
  reason: string;
  recommendedAction: string;
  cutId: string | null;
};

export type ExportArtifact = {
  exportId: string;
  createdAt: string;
  trimmedVideoUrl: string;
  selectedCutIds: string[];
  removedSeconds: number;
  trimmedDurationSec: number;
};

export type ScoreSet = {
  hookScore: number;
  pacingScore: number;
  retentionEstimate: number;
  viralPotential: number;
  confidence: ConfidenceBand;
  helpingFactors: string[];
  hurtingFactors: string[];
};

export type AnalysisPayload = {
  analysisId: string;
  video: VideoAsset;
  brainResponse: {
    timeSeries: BrainResponsePoint[];
    meshInfo: {
      space: string;
      subject: string;
      lagCompensationSec: number;
      totalVertices: number;
    };
  };
  markers: Marker[];
  deadspaceCuts: DeadspaceCut[];
  lowValueCuts: DeadspaceCut[];
  cutPlan: DeadspaceCut[];
  actionBoard: ActionBoard;
  timelineSegments: TimelineSegment[];
  exports: ExportArtifact[];
  scores: ScoreSet;
  summary: {
    strengths: string[];
    weaknesses: string[];
    overallRecommendation: string;
  };
  artifacts: {
    rawPredictionsUrl: string | null;
    providerRawJsonUrl: string | null;
    processedJsonUrl: string;
    cutListJsonUrl: string;
    eventsCsvUrl: string;
    segmentsJsonUrl: string;
    trimmedVideoUrl: string | null;
  };
  diagnostics: {
    device: string;
    modelRepo: string;
    modelCommit: string;
    transcriptWordCount: number;
    sceneChangeCount: number;
    deadspaceSeconds: number;
    trimmedDurationSec: number | null;
    warnings: string[];
  };
};

export type AnalysisResponse = {
  analysisId: string;
  status: AnalysisStatus;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  payload: AnalysisPayload | null;
};

export type CompareResponse = {
  analysisIdA: string;
  analysisIdB: string;
  winner: "A" | "B" | "tie";
  winnerReason: string;
  recommendation: string;
  summary: string[];
  slices: Array<{
    label: string;
    winner: "A" | "B" | "tie";
    aScore: number;
    bScore: number;
  }>;
};

export type TrimRequest = {
  cutIndices?: number[] | null;
  cutIds?: string[] | null;
};

export type TrimResponse = {
  analysisId: string;
  trimmedVideoUrl: string;
  originalDurationSec: number;
  trimmedDurationSec: number;
  removedSeconds: number;
  appliedCuts: DeadspaceCut[];
};

export type CurrentUser = {
  _id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export type SavedScanSummary = {
  _id: string;
  uploadId: string;
  localUploadId: string | null;
  status: AnalysisStatus;
  localAnalysisId: string | null;
  viralPotential: number | null;
  hookScore: number | null;
  pacingScore: number | null;
  retentionEstimate: number | null;
  deadspaceSeconds: number | null;
  trimmedDurationSec: number | null;
  analysisUrl: string | null;
  overviewRecommendation: string | null;
  selectedCutIds: string[];
  latestExportUrl: string | null;
  lastExportedAt: number | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  filename: string;
};

export type SavedScanRecord = SavedScanSummary;
