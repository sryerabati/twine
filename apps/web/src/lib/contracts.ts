export type AnalysisStatus = "queued" | "running" | "completed" | "failed";

export type HealthResponse = {
  ok: boolean;
  pythonVersion: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  huggingFaceTokenPresent: boolean;
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
  type:
    | "strong_hook"
    | "attention_drop"
    | "deadspace_candidate"
    | "high_rewatch_moment"
    | "pacing_issue"
    | "audio_energy_drop";
  severity: "low" | "medium" | "high";
  explanation: string;
  suggestion: string;
};

export type DeadspaceCut = {
  start: number;
  end: number;
  reason: string;
};

export type ScoreSet = {
  hookScore: number;
  pacingScore: number;
  retentionEstimate: number;
  viralPotential: number;
  confidence: "low" | "medium" | "high";
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
  scores: ScoreSet;
  summary: {
    strengths: string[];
    weaknesses: string[];
    overallRecommendation: string;
  };
  artifacts: {
    rawPredictionsUrl: string;
    processedJsonUrl: string;
    cutListJsonUrl: string;
    eventsCsvUrl: string;
    segmentsJsonUrl: string;
  };
  diagnostics: {
    device: string;
    modelRepo: string;
    modelCommit: string;
    transcriptWordCount: number;
    sceneChangeCount: number;
    deadspaceSeconds: number;
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
