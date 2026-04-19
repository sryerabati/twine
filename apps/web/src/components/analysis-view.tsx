"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Scissors, WandSparkles } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BrainScanViewer } from "@/components/brain-scan-viewer";
import { AnalysisWorkspaceSkeleton } from "@/components/loading-states";
import { RecommendationTimeline } from "@/components/recommendation-timeline";
import { ScanSecondaryDetails } from "@/components/scan-secondary-details";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { fetchAnalysis, trimAnalysis } from "@/lib/api";
import type {
  AnalysisPayload,
  AnalysisResponse,
} from "@/lib/contracts";

type TrimMode = "speech_safe" | "lenient";

type AnalysisViewProps = {
  analysisId: string;
  pollIntervalMs?: number;
  initialSelectedCutIds?: string[];
  onPersistSelectedCuts?: (selectedCutIds: string[]) => Promise<void> | void;
  onPersistExport?: (
    selectedCutIds: string[],
    latestExportUrl: string,
    latestExportStorageId?: string | null,
  ) => Promise<void> | void;
};

export function AnalysisView({
  analysisId,
  pollIntervalMs = 2500,
  initialSelectedCutIds,
  onPersistSelectedCuts,
  onPersistExport,
}: AnalysisViewProps) {
  const [response, setResponse] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trimModeByAnalysis, setTrimModeByAnalysis] = useState<Record<string, TrimMode>>({});
  const [trimPending, setTrimPending] = useState(false);
  const [trimError, setTrimError] = useState<string | null>(null);
  const [activeTimeSec, setActiveTimeSec] = useState(0);
  const [previewTimeSec, setPreviewTimeSec] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const next = await fetchAnalysis(analysisId);
        if (!active) {
          return;
        }
        setResponse(next);
        setError(null);

        if (next.status === "queued" || next.status === "running") {
          timer = setTimeout(load, pollIntervalMs);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load analysis.");
        }
      }
    }

    void load();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [analysisId, pollIntervalMs]);

  async function reloadAnalysis() {
    const next = await fetchAnalysis(analysisId);
    setResponse(next);
  }

  const trimMode = deriveTrimMode(
    response,
    initialSelectedCutIds,
    trimModeByAnalysis,
  );
  const activeCutIds = deriveActiveCutIds(response, trimMode);

  async function handleTrimModeChange(nextMode: TrimMode) {
    if (response?.status !== "completed" || !response.payload) {
      return;
    }
    const nextCutIds = getTrimCutIds(response.payload, nextMode);
    setTrimModeByAnalysis((current) => ({
      ...current,
      [response.analysisId]: nextMode,
    }));
    setTrimError(null);
    try {
      await onPersistSelectedCuts?.(nextCutIds);
    } catch (persistError) {
      setTrimError(
        persistError instanceof Error
          ? persistError.message
          : "Could not save the automatic trim mode.",
      );
    }
  }

  async function handleExport() {
    if (!activeCutIds.length) {
      setTrimError(
        trimMode === "speech_safe"
          ? "No speech-safe deadspace was detected for automatic removal."
          : "No lenient trim cuts are available on this scan.",
      );
      return;
    }

    setTrimPending(true);
    setTrimError(null);

    try {
      await onPersistSelectedCuts?.(activeCutIds);
      const result = await trimAnalysis(analysisId, activeCutIds);
      await onPersistExport?.(
        activeCutIds,
        result.trimmedVideoUrl,
        result.trimmedVideoStorageId ?? null,
      );
      await reloadAnalysis();
    } catch (exportError) {
      setTrimError(
        exportError instanceof Error ? exportError.message : "Trim export failed.",
      );
    } finally {
      setTrimPending(false);
    }
  }

  if (error) {
    return <AnalysisError message={error} />;
  }

  if (!response || response.status === "queued" || response.status === "running") {
    return (
      <AnalysisLoading
        analysisId={analysisId}
        createdAt={response?.createdAt}
        status={response?.status === "running" ? "running" : "queued"}
      />
    );
  }

  if (response.status === "failed" || !response.payload) {
    return <AnalysisError message={formatAnalysisError(response.error)} />;
  }

  return (
    <CompletedAnalysis
      activeTimeSec={activeTimeSec}
      activeCutIds={activeCutIds}
      payload={response.payload}
      previewTimeSec={previewTimeSec}
      trimMode={trimMode}
      trimError={trimError}
      trimPending={trimPending}
      videoRef={videoRef}
      onActiveTimeChange={setActiveTimeSec}
      onExport={handleExport}
      onPreviewTimeChange={setPreviewTimeSec}
      onTrimModeChange={handleTrimModeChange}
    />
  );
}

function AnalysisLoading({
  analysisId,
  status,
  createdAt,
}: {
  analysisId: string;
  status: "queued" | "running";
  createdAt?: string | null;
}) {
  const progress = useEstimatedScanProgress(status, createdAt);

  return (
    <AnalysisWorkspaceSkeleton
      badge={status === "queued" ? "Queued" : "Running"}
      title="Processing analysis"
      body={`Waiting for FastAPI to finish the scan output for analysis \`${analysisId.slice(0, 8)}\`.`}
      progress={progress}
    />
  );
}

function useEstimatedScanProgress(
  status: "queued" | "running",
  createdAt?: string | null,
) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 600);

    return () => {
      window.clearInterval(timer);
    };
  }, [createdAt, status]);

  return buildEstimatedScanProgress(status, createdAt, nowMs);
}

export function buildEstimatedScanProgress(
  status: "queued" | "running",
  createdAt: string | null | undefined,
  nowMs: number,
) {
  const createdAtMs = createdAt ? Number(new Date(createdAt)) : Number.NaN;
  const elapsedSec = Number.isFinite(createdAtMs) ? Math.max(0, (nowMs - createdAtMs) / 1000) : 0;

  if (status === "queued") {
    const value = 6 + 28 * easeOutProgress(elapsedSec, 4.8);
    return {
      value: clampProgress(value, 6, 34),
      label: "Estimated progress",
      hint: "Queueing and warming the scan. It moves quickly at first, then settles as the analysis spins up.",
    };
  }

  const runningElapsedSec = Math.max(0, elapsedSec - 4);
  const value = 34 + 58 * easeOutProgress(runningElapsedSec, 18);
  return {
    value: clampProgress(value, 34, 92),
    label: "Estimated progress",
    hint: "Reading reactions, pacing, and scene changes. The bar slows down near the end and only completes when the scan does.",
  };
}

function easeOutProgress(elapsedSec: number, curveSec: number) {
  return 1 - Math.exp(-elapsedSec / curveSec);
}

function clampProgress(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function AnalysisError({ message }: { message: string }) {
  return (
    <div className="surface mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[2.5rem] p-8 text-foreground">
      <Badge variant="destructive" className="w-fit">
        Analysis failed
      </Badge>
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          The backend returned an actionable error.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{message}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/app" className={buttonVariants({ variant: "default" })}>
          Back to app
        </Link>
        <Link href="/runbook" className={buttonVariants({ variant: "outline" })}>
          Open runbook
        </Link>
      </div>
    </div>
  );
}

function CompletedAnalysis({
  activeTimeSec,
  activeCutIds,
  payload,
  previewTimeSec,
  trimMode,
  trimError,
  trimPending,
  videoRef,
  onActiveTimeChange,
  onExport,
  onPreviewTimeChange,
  onTrimModeChange,
}: {
  activeTimeSec: number;
  activeCutIds: string[];
  payload: AnalysisPayload;
  previewTimeSec: number | null;
  trimMode: TrimMode;
  trimError: string | null;
  trimPending: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onActiveTimeChange: (time: number) => void;
  onExport: () => Promise<void>;
  onPreviewTimeChange: (time: number | null) => void;
  onTrimModeChange: (mode: TrimMode) => Promise<void>;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const focusTimeSec = previewTimeSec ?? activeTimeSec;
  const latestExport = payload.exports[payload.exports.length - 1] ?? null;
  const chartData = payload.brainResponse.timeSeries.map((point) => ({
    t: Number(point.stimulusTimeSec.toFixed(2)),
    activation: point.globalActivation,
    motion: point.motionScore,
    audio: point.audioEnergy,
  }));

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let frameId = 0;

    const syncPlayback = () => {
      const currentTime = videoRef.current?.currentTime;
      if (currentTime !== undefined) {
        onActiveTimeChange(currentTime);
      }
      if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
        frameId = requestAnimationFrame(syncPlayback);
      }
    };

    frameId = requestAnimationFrame(syncPlayback);
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isPlaying, onActiveTimeChange, videoRef]);

  function seekToTime(time: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    onActiveTimeChange(time);
  }

  async function togglePlayback() {
    if (!videoRef.current) {
      return;
    }

    if (videoRef.current.paused || videoRef.current.ended) {
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    videoRef.current.pause();
    setIsPlaying(false);
  }

  return (
    <div className="space-y-8">
      <section className="surface rounded-[2.5rem] p-6 text-foreground">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Primary analysis
            </h2>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
              {payload.video.filename}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {payload.summary.overallRecommendation}
            </p>
          </div>

          <Badge
            variant="secondary"
            className={trimMode === "lenient" ? "w-fit bg-primary/15 text-primary" : "w-fit"}
          >
            {describeTrimBadge(trimMode, activeCutIds.length)}
          </Badge>
        </div>

        <div className="mt-6 space-y-8 border-t border-border/70 pt-6">
          <div>
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Player</p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Remove deadspace in one click. Default mode only cuts speech-safe pauses so the
                  wording stays intact. Turn on the more lenient pass to keep only the important
                  parts.
                </p>
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <Button
                  type="button"
                  variant={trimMode === "lenient" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={trimMode === "lenient"}
                  onClick={() =>
                    void onTrimModeChange(trimMode === "lenient" ? "speech_safe" : "lenient")
                  }
                >
                  <WandSparkles data-icon="inline-start" />
                  More lenient
                </Button>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => void onExport()}
                    disabled={trimPending || !activeCutIds.length}
                  >
                    {trimPending ? (
                      <>
                        <LoaderCircle data-icon="inline-start" className="animate-spin" />
                        Removing deadspace
                      </>
                    ) : (
                      <>
                        <Scissors data-icon="inline-start" />
                        Remove deadspace
                      </>
                    )}
                  </Button>

                  {latestExport ? (
                    <a
                      href={latestExport.trimmedVideoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline", size: "lg" })}
                    >
                      Latest export
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            {trimError ? (
              <div className="mb-4 rounded-[1.25rem] border-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                {trimError}
              </div>
            ) : null}

            <video
              ref={videoRef}
              className="aspect-video w-full rounded-[1.5rem] border-2 border-border bg-black"
              preload="metadata"
              playsInline
              src={payload.video.sourceUrl}
              onClick={() => void togglePlayback()}
              onLoadedMetadata={(event) => onActiveTimeChange(event.currentTarget.currentTime)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onSeeked={(event) => onActiveTimeChange(event.currentTarget.currentTime)}
              onTimeUpdate={(event) => onActiveTimeChange(event.currentTarget.currentTime)}
            />

            <RecommendationTimeline
              currentTimeSec={activeTimeSec}
              durationSec={payload.video.durationSec}
              isPlaying={isPlaying}
              segments={payload.timelineSegments}
              selectedCutIds={activeCutIds}
              onSeek={seekToTime}
              onTogglePlayback={togglePlayback}
              onPreviewTimeChange={onPreviewTimeChange}
            />
          </div>

          <BrainScanViewer
            points={payload.brainResponse.timeSeries}
            currentTimeSec={focusTimeSec}
            title="Brain scan"
            description="Scrub the edit rail or hover markers to keep the signal view in sync."
          />

          <div className="border-t border-border/70 pt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Activation timeline</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Global activation, motion, and audio context.
                </p>
              </div>
            </div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="rgba(255,247,251,0.08)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}s`}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 1]}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 18,
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-card)",
                      color: "var(--color-foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ color: "var(--color-muted-foreground)" }} />
                  <Line
                    type="monotone"
                    dataKey="activation"
                    stroke="var(--color-chart-1)"
                    strokeWidth={3}
                    dot={false}
                    name="Global activation"
                  />
                  <Line
                    type="monotone"
                    dataKey="motion"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={false}
                    name="Motion"
                  />
                  <Line
                    type="monotone"
                    dataKey="audio"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2}
                    dot={false}
                    name="Audio"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <ScanSecondaryDetails
        payload={payload}
        activeCutIds={activeCutIds}
        trimMode={trimMode}
        onPreviewTimeChange={onPreviewTimeChange}
        onJumpToTime={seekToTime}
      />
    </div>
  );
}

function deriveTrimMode(
  response: AnalysisResponse | null,
  initialSelectedCutIds: string[] | undefined,
  trimModeByAnalysis: Record<string, TrimMode>,
) {
  if (response?.status !== "completed" || !response.payload) {
    return "speech_safe";
  }

  return (
    trimModeByAnalysis[response.analysisId] ??
    inferTrimModeFromSavedCuts(response.payload, initialSelectedCutIds)
  );
}

function formatAnalysisError(message: string | null | undefined) {
  if (!message) {
    return "Analysis failed before a payload was written. Check the backend logs and health endpoint.";
  }
  if (/tribe|gemini|hugging face|llama/i.test(message)) {
    return "The selected content-analysis backend could not finish this upload. Check the runbook and local health status, then try again.";
  }
  return message;
}

function deriveActiveCutIds(
  response: AnalysisResponse | null,
  trimMode: TrimMode,
) {
  if (response?.status !== "completed" || !response.payload) {
    return [];
  }

  return getTrimCutIds(response.payload, trimMode);
}

function getTrimCutIds(payload: AnalysisPayload, trimMode: TrimMode) {
  const allCuts = payload.cutPlan.length ? payload.cutPlan : payload.deadspaceCuts;
  if (trimMode === "lenient") {
    return allCuts.map((cut) => cut.id);
  }
  return allCuts.filter((cut) => cut.defaultSelected).map((cut) => cut.id);
}

function inferTrimModeFromSavedCuts(
  payload: AnalysisPayload,
  savedCutIds: string[] | undefined,
): TrimMode {
  if (!savedCutIds?.length) {
    return "speech_safe";
  }

  const defaultCutIds = new Set(getTrimCutIds(payload, "speech_safe"));
  return savedCutIds.some((cutId) => !defaultCutIds.has(cutId))
    ? "lenient"
    : "speech_safe";
}

function describeTrimBadge(trimMode: TrimMode, count: number) {
  if (count <= 0) {
    return trimMode === "lenient" ? "No lenient trims" : "No speech-safe trims";
  }

  const suffix = count === 1 ? "trim" : "trims";
  return trimMode === "lenient"
    ? `${count} important-part ${suffix}`
    : `${count} speech-safe ${suffix}`;
}
