export type AnalysisStatus = "queued" | "running" | "completed" | "failed";
export type AnalysisMode = "brain_scan" | "read_the_room";
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
  analysisBackend: "tribe" | "gemini" | "mirofish";
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
  sourceStorageId?: string | null;
  thumbnailStorageId?: string | null;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
  recordedAt?: string | null;
  fileModifiedAt?: string | null;
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

export type BrainSignalSummary = {
  averageActivation: number;
  averageMotion: number;
  averageAudioEnergy: number;
  averageTranscriptDensity: number;
};

export type AudienceTimelinePoint = {
  startSec: number;
  endSec: number;
  sentiment: number;
  interest: number;
  clarity: number;
  trust: number;
  shareIntent: number;
  dropoffRisk: number;
  primaryReaction: string;
  note: string;
};

export type AudienceVoice = {
  speaker: string;
  handle: string;
  role: string;
  platform: string;
  stance?: "positive" | "negative";
  quote: string;
};

export type AudienceOutlook = {
  headline: string;
  summary: string;
  likelyPraise: string[];
  likelyPushback: string[];
  timeline: AudienceTimelinePoint[];
  roomVoices?: AudienceVoice[];
};

export type AudienceWorldPlatformBreakdown = {
  platform: string;
  volume: number;
  engagement: number;
  leaning: string;
  dominantNarratives: string[];
};

export type AudienceWorldCohort = {
  id: string;
  label: string;
  size: number;
  leaning: string;
  proofThreshold: string;
  keyConcerns: string[];
  liked: string[];
  blocked: string[];
  representativeAgentIds: number[];
  momentIds: string[];
};

export type AudienceWorldComment = {
  id: string;
  agentId?: number | null;
  speaker: string;
  handle: string;
  role: string;
  platform: string;
  content: string;
  createdAt?: string | null;
  likes: number;
  shares: number;
};

export type AudienceWorldThread = {
  id: string;
  platform: string;
  dominantStance: string;
  engagement: number;
  replyCount: number;
  participatingCohortIds: string[];
  rootPost: AudienceWorldComment;
  replies: AudienceWorldComment[];
};

export type AudienceWorldAgentStats = {
  totalActions: number;
  redditActions: number;
  twitterActions: number;
};

export type AudienceWorldAgent = {
  id: number;
  displayName: string;
  handle: string;
  role: string;
  platforms: string[];
  bio?: string | null;
  stats: AudienceWorldAgentStats;
};

export type AudienceWorldInterview = {
  agentId: number;
  prompt: string;
  response: string;
  platform?: string | null;
  cached: boolean;
};

export type AudienceWorldEvidenceMoment = {
  windowId: string;
  startSec: number;
  endSec: number;
  headline: string;
  reason: string;
  threadIds: string[];
  cohortIds: string[];
  agentIds: number[];
};

export type AudienceWorld = {
  status: "hydrating" | "ready" | "partial" | "unavailable";
  simulationId: string;
  platformBreakdown: AudienceWorldPlatformBreakdown[];
  cohorts: AudienceWorldCohort[];
  threads: AudienceWorldThread[];
  agents: AudienceWorldAgent[];
  interviews: AudienceWorldInterview[];
  evidenceMoments: AudienceWorldEvidenceMoment[];
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
  trimmedVideoStorageId?: string | null;
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
  analysisMode?: AnalysisMode;
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
  audienceOutlook?: AudienceOutlook | null;
  audienceWorld?: AudienceWorld | null;
  brainSummary?: BrainSignalSummary | null;
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
    trimmedVideoStorageId?: string | null;
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

export type AudienceWorldResponse = {
  analysisId: string;
  world: AudienceWorld;
};

export type AudienceWorldInterviewResponse = {
  analysisId: string;
  prompt: string;
  cached: boolean;
  interviews: AudienceWorldInterview[];
};

export type ScanType = "single" | "compare";

export type SavedCompareResult = {
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
  trimmedVideoStorageId?: string | null;
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
  scanType?: ScanType;
  title: string | null;
  filename: string;
  secondaryFilename: string | null;
  thumbnailUrl: string | null;
  secondaryThumbnailUrl: string | null;
  uploadId: string;
  secondaryUploadId: string | null;
  localUploadId: string | null;
  status: AnalysisStatus;
  localAnalysisId: string | null;
  secondaryLocalAnalysisId: string | null;
  compareResult: SavedCompareResult | null;
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
};

export type SavedScanRecord = SavedScanSummary;

export type EditorProjectStatus = "drafting" | "queued" | "running" | "completed" | "failed";
export type EditorDraftStage =
  | "queued"
  | "preparing_clips"
  | "ordering_story"
  | "rendering_video"
  | "finalizing"
  | "completed"
  | "failed";

export type EditorProjectClip = {
  _id: string;
  uploadId: string;
  localUploadId: string | null;
  filename: string;
  durationSec: number | null;
  sourceOrder: number;
  createdAt: number;
};

export type EditorProjectSummary = {
  _id: string;
  title: string;
  status: EditorProjectStatus;
  clipCount: number;
  latestLocalDraftId: string | null;
  latestExportUrl: string | null;
  storylineSummary: string | null;
  orderingConfidence: ConfidenceBand | null;
  warningCount: number;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

export type EditorProjectDetail = EditorProjectSummary & {
  clips: EditorProjectClip[];
};

export type OrderedDraftClip = {
  clipId: string;
  uploadId: string;
  filename: string;
  sourceOrder: number;
  resolvedOrder: number;
  rationale: string;
  transcriptPreview: string;
  summary: string;
  speechCoverage: number;
  removedSeconds: number;
  trimmedDurationSec: number;
  outputStartSec: number;
  outputEndSec: number;
  recordedAt?: string | null;
  fileModifiedAt?: string | null;
  warnings: string[];
  appliedCuts: DeadspaceCut[];
};

export type EditorDraftPayload = {
  export: {
    videoUrl: string;
    videoStorageId?: string | null;
    durationSec: number;
  };
  storylineSummary: string;
  orderingConfidence: ConfidenceBand;
  orderedClips: OrderedDraftClip[];
  warnings: string[];
};

export type EditorDraftResponse = {
  draftId: string;
  projectId: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: EditorDraftStage | null;
  progressPercent: number | null;
  statusMessage: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  payload: EditorDraftPayload | null;
};

export type RepurposeProjectStatus =
  | "drafting"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type RepurposeProjectVariant = {
  _id: string;
  variantKey: string;
  title: string;
  angleSummary: string;
  durationTarget: "source" | "short";
  durationSec: number;
  exportUrl: string | null;
  position: number;
};

export type RepurposeProjectSummary = {
  _id: string;
  title: string;
  status: RepurposeProjectStatus;
  sourceUploadId: string | null;
  sourceFilename: string | null;
  sourceDurationSec: number | null;
  latestLocalResultId: string | null;
  variantCount: number;
  summary: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

export type RepurposeProjectDetail = RepurposeProjectSummary & {
  variants: RepurposeProjectVariant[];
};

export type RepurposeStage =
  | "queued"
  | "preparing_source"
  | "planning_variants"
  | "rendering_variants"
  | "finalizing"
  | "completed"
  | "failed";

export type RepurposeResultSegment = {
  segmentId: string;
  startSec: number;
  endSec: number;
  transcriptPreview: string;
  summary: string;
};

export type RepurposeResultVariant = {
  variantId: string;
  title: string;
  angleSummary: string;
  rationale: string;
  durationTarget: "source" | "short";
  durationSec: number;
  videoUrl: string;
  videoStorageId?: string | null;
  segmentCount: number;
  segments: RepurposeResultSegment[];
};

export type RepurposeResultPayload = {
  source: {
    sourceUploadId: string;
    filename: string;
    durationSec: number;
    summary: string;
    speechCoverage: number;
  };
  summary: string;
  variants: RepurposeResultVariant[];
  warnings: string[];
};

export type RepurposeResultResponse = {
  resultId: string;
  projectId: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: RepurposeStage | null;
  progressPercent: number | null;
  statusMessage: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  payload: RepurposeResultPayload | null;
};
