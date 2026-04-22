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

import { AudienceWorldPanel } from "@/components/audience-world-panel";
import { BrainScanViewer } from "@/components/brain-scan-viewer";
import { AnalysisWorkspaceSkeleton } from "@/components/loading-states";
import { RecommendationTimeline } from "@/components/recommendation-timeline";
import { ScanSecondaryDetails } from "@/components/scan-secondary-details";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { fetchAnalysis, trimAnalysis } from "@/lib/api";
import { formatSeconds } from "@/lib/format";
import type {
  AnalysisPayload,
  AnalysisResponse,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

type TrimMode = "speech_safe" | "lenient";
type AnalysisChartDatum = {
  t: number;
  activation?: number;
  motion?: number;
  audio?: number;
  sentiment?: number;
  interest?: number;
  trust?: number;
  dropoffRisk?: number;
};

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
  const value =
    34 +
    58 * easeOutProgress(runningElapsedSec, 18) +
    6 * easeOutProgress(Math.max(0, runningElapsedSec - 30), 90);
  const hint =
    runningElapsedSec >= 90
      ? "Still running. Read the room is simulating the audience and writing the final report. This stage can take a few minutes."
      : runningElapsedSec >= 30
        ? "Building the room and simulating reactions. Read the room runs can take a few minutes before the workspace opens."
        : "Reading reactions, pacing, and scene changes. Finalizing the scan output so the workspace can open.";
  return {
    value: clampProgress(value, 34, 98),
    label: "Estimated progress",
    hint,
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
  const playerSourceUrl = latestExport?.trimmedVideoUrl ?? payload.video.sourceUrl;
  const analysisMode = payload.analysisMode ?? "brain_scan";
  const isReadTheRoom = analysisMode === "read_the_room";
  const topActions = deriveTopActions(payload);
  const isPortraitClip = payload.video.height >= payload.video.width;
  const chartData: AnalysisChartDatum[] = payload.brainResponse.timeSeries.map((point) => ({
    t: Number(point.stimulusTimeSec.toFixed(2)),
    activation: point.globalActivation,
    motion: point.motionScore,
    audio: point.audioEnergy,
  }));
  const audienceChartData: AnalysisChartDatum[] =
    payload.audienceOutlook?.timeline.map((point) => ({
      t: Number(point.startSec.toFixed(2)),
      sentiment: point.sentiment,
      interest: point.interest,
      trust: point.trust,
      dropoffRisk: point.dropoffRisk,
    })) ?? [];

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
    <div className="space-y-6">
      <section className="surface rounded-[2.5rem] p-6 text-foreground">
        <section
          data-testid="scan-verdict-bar"
          className="flex flex-col gap-3 rounded-[1.45rem] border border-border/70 bg-background/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                {isReadTheRoom ? "Read the room" : "Primary analysis"}
              </p>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {payload.video.filename}
              </p>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-foreground/90">
              {isReadTheRoom
                ? (payload.audienceOutlook?.headline ?? payload.summary.overallRecommendation)
                : payload.summary.overallRecommendation}
            </p>
          </div>

          <Badge
            variant="secondary"
            className={trimMode === "lenient" ? "w-fit bg-primary/15 text-primary" : "w-fit"}
          >
            {describeTrimBadge(trimMode, activeCutIds.length)}
          </Badge>
        </section>

        <div
          className={
            isReadTheRoom
              ? "mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_22rem]"
              : "mt-5 space-y-6"
          }
        >
          <div className="min-w-0 space-y-4">
            <section className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Inspect the video</p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Check the exact beat, scrub the clip, and decide whether the next cut should stay or go.
                  </p>
                </div>

                {isReadTheRoom ? null : (
                  <PlayerControlStack
                    activeCutIds={activeCutIds}
                    latestExport={latestExport}
                    onExport={onExport}
                    onTrimModeChange={onTrimModeChange}
                    trimMode={trimMode}
                    trimPending={trimPending}
                  />
                )}
              </div>

              {trimError && !isReadTheRoom ? (
                <div className="mb-4 rounded-[1.25rem] border-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                  {trimError}
                </div>
              ) : null}

              <div
                data-testid="player-stage"
                className={cn(
                  "mx-auto",
                  isPortraitClip ? "w-full max-w-[24rem]" : "w-full max-w-5xl",
                )}
              >
                <video
                  ref={videoRef}
                  className={cn(
                    "w-full rounded-[1.5rem] border-2 border-border bg-black object-contain",
                    isPortraitClip ? "aspect-[9/16]" : "aspect-video",
                  )}
                  preload="metadata"
                  playsInline
                  src={playerSourceUrl}
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
            </section>

            {isReadTheRoom ? (
              <ActionStrip
                actions={topActions}
                onSelect={(action) => {
                  if (typeof action.focusTimeSec === "number") {
                    seekToTime(action.focusTimeSec);
                  }
                }}
              />
            ) : null}

            <ScanSecondaryDetails
              payload={payload}
              activeCutIds={activeCutIds}
              trimMode={trimMode}
            />

            <section className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {isReadTheRoom ? "Audience sentiment timeline" : "Activation timeline"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {isReadTheRoom
                      ? "Use this when you need to confirm where the room warms up or starts slipping."
                      : "Global activation, motion, and audio context."}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={isReadTheRoom ? audienceChartData : chartData}>
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
                      dataKey={isReadTheRoom ? "sentiment" : "activation"}
                      stroke="var(--color-chart-1)"
                      strokeWidth={3}
                      dot={false}
                      name={isReadTheRoom ? "Audience sentiment" : "Global activation"}
                    />
                    <Line
                      type="monotone"
                      dataKey={isReadTheRoom ? "interest" : "motion"}
                      stroke="var(--color-chart-2)"
                      strokeWidth={2}
                      dot={false}
                      name={isReadTheRoom ? "Interest" : "Motion"}
                    />
                    <Line
                      type="monotone"
                      dataKey={isReadTheRoom ? "trust" : "audio"}
                      stroke="var(--color-chart-3)"
                      strokeWidth={2}
                      dot={false}
                      name={isReadTheRoom ? "Trust" : "Audio"}
                    />
                    {isReadTheRoom ? (
                      <Line
                        type="monotone"
                        dataKey="dropoffRisk"
                        stroke="var(--color-chart-4)"
                        strokeWidth={2}
                        dot={false}
                        name="Drop-off risk"
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {isReadTheRoom ? (
              <BrainSignalUtility payload={payload} />
            ) : (
              <BrainScanViewer
                points={payload.brainResponse.timeSeries}
                currentTimeSec={focusTimeSec}
                title="Brain scan"
                description="Scrub the edit rail or hover markers to keep the signal view in sync."
              />
            )}
          </div>

          {isReadTheRoom ? (
            <DecisionRailCompact
              actions={topActions}
              activeCutIds={activeCutIds}
              latestExport={latestExport}
              onExport={onExport}
              onTrimModeChange={onTrimModeChange}
              payload={payload}
              trimError={trimError}
              trimMode={trimMode}
              trimPending={trimPending}
            />
          ) : null}
        </div>
      </section>

      {isReadTheRoom && payload.audienceOutlook ? (
        <AudienceWorldPanel
          analysisId={payload.analysisId}
          audienceOutlook={payload.audienceOutlook}
          initialWorld={payload.audienceWorld ?? null}
        />
      ) : null}
    </div>
  );
}

type TopAction = {
  id: string;
  title: string;
  rationale: string;
  tone: "fix" | "protect" | "test";
  timeLabel?: string | null;
  focusTimeSec?: number | null;
};

function ActionStrip({
  actions,
  onSelect,
}: {
  actions: TopAction[];
  onSelect: (action: TopAction) => void;
}) {
  if (!actions.length) {
    return null;
  }

  return (
    <section
      data-testid="scan-action-strip"
      className="rounded-[1.35rem] border border-border/70 bg-background/70 p-3"
    >
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onSelect(action)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-start rounded-[1rem] border px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.06]",
              action.tone === "fix"
                ? "border-amber-300/20 bg-amber-400/[0.06]"
                : "border-border/70 bg-card/50",
            )}
          >
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {action.tone === "fix" ? "Fix now" : action.tone === "protect" ? "Protect" : "Test"}
            </span>
            <span className="mt-2 text-sm font-medium text-foreground">{action.title}</span>
            {action.timeLabel ? (
              <span className="mt-1 text-xs uppercase tracking-[0.18em] text-primary/80">
                {action.timeLabel}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function PlayerControlStack({
  trimMode,
  trimPending,
  activeCutIds,
  latestExport,
  onTrimModeChange,
  onExport,
}: {
  trimMode: TrimMode;
  trimPending: boolean;
  activeCutIds: string[];
  latestExport: AnalysisPayload["exports"][number] | null;
  onTrimModeChange: (mode: TrimMode) => Promise<void>;
  onExport: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2 lg:items-end">
      <Button
        type="button"
        variant={trimMode === "lenient" ? "default" : "outline"}
        size="sm"
        aria-pressed={trimMode === "lenient"}
        onClick={() => void onTrimModeChange(trimMode === "lenient" ? "speech_safe" : "lenient")}
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
  );
}

function DecisionRailCompact({
  actions,
  payload,
  trimMode,
  trimPending,
  trimError,
  activeCutIds,
  latestExport,
  onTrimModeChange,
  onExport,
}: {
  actions: TopAction[];
  payload: AnalysisPayload;
  trimMode: TrimMode;
  trimPending: boolean;
  trimError: string | null;
  activeCutIds: string[];
  latestExport: AnalysisPayload["exports"][number] | null;
  onTrimModeChange: (mode: TrimMode) => Promise<void>;
  onExport: () => Promise<void>;
}) {
  const primaryAction = actions[0] ?? null;
  const secondaryAction = actions[1] ?? null;
  const praiseItems = (payload.audienceOutlook?.likelyPraise.length
    ? payload.audienceOutlook?.likelyPraise
    : ["No strong win surfaced from this pass."]).slice(0, 2);
  const pushbackItems = (payload.audienceOutlook?.likelyPushback.length
    ? payload.audienceOutlook?.likelyPushback
    : ["No dominant risk surfaced from this pass."]).slice(0, 2);

  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <div className="rounded-[1.35rem] border border-border/70 bg-background/70 p-4">
        <p className="text-sm font-medium text-foreground">What to do</p>
        {primaryAction ? (
          <>
            <p className="mt-3 text-base font-medium text-foreground">{primaryAction.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{primaryAction.rationale}</p>
            {primaryAction.timeLabel ? (
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-primary/80">
                {primaryAction.timeLabel}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {payload.summary.overallRecommendation}
          </p>
        )}

        {secondaryAction ? (
          <div className="mt-4 border-t border-border/70 pt-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Watch-out</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{secondaryAction.rationale}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-[1.35rem] border border-border/70 bg-background/70 p-4">
        <div className="grid gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">What landed</p>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {praiseItems.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
          <div className="border-t border-border/70 pt-4">
            <p className="text-sm font-medium text-foreground">What lost trust</p>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {pushbackItems.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[1.35rem] border border-border/70 bg-background/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Export plan</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Make the cut and export from here.</p>
          </div>
          <Badge variant="secondary">{activeCutIds.length} active</Badge>
        </div>

        <div className="mt-4 space-y-3">
          <Button
            type="button"
            variant={trimMode === "lenient" ? "default" : "outline"}
            size="sm"
            aria-pressed={trimMode === "lenient"}
            onClick={() => void onTrimModeChange(trimMode === "lenient" ? "speech_safe" : "lenient")}
          >
            <WandSparkles data-icon="inline-start" />
            More lenient
          </Button>

          <Button
            type="button"
            size="lg"
            onClick={() => void onExport()}
            disabled={trimPending || !activeCutIds.length}
            className="w-full"
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
              className={buttonVariants({ variant: "outline", size: "lg" }) + " w-full"}
            >
              Latest export
            </a>
          ) : null}

          {trimError ? (
            <div className="rounded-[1rem] border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {trimError}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function BrainSignalUtility({ payload }: { payload: AnalysisPayload }) {
  const [open, setOpen] = useState(false);
  const summary =
    payload.analysisMode === "read_the_room"
      ? deriveReadTheRoomBrainSummary(payload)
      : (payload.brainSummary ?? deriveBrainSummaryFromPoints(payload.brainResponse.timeSeries));

  return (
    <section className="rounded-[1.35rem] border border-border/70 bg-background/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Brain signal</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Whole-video averages only. Open it when you need the side signal.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "default" : "outline"}
          size="sm"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide brain signal" : "Show brain signal"}
        </Button>
      </div>

      {open ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryStat
            label={payload.analysisMode === "read_the_room" ? "Activation estimate" : "Activation"}
            value={summary.averageActivation}
          />
          <SummaryStat label="Motion" value={summary.averageMotion} />
          <SummaryStat label="Audio" value={summary.averageAudioEnergy} />
          <SummaryStat label="Transcript" value={summary.averageTranscriptDensity} />
        </div>
      ) : null}
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{Math.round(value * 100)}</p>
    </div>
  );
}

function deriveTopActions(payload: AnalysisPayload): TopAction[] {
  const actions: TopAction[] = [];
  const seen = new Set<string>();

  const primaryCut = derivePrimaryCut(payload);
  if (primaryCut) {
    actions.push({
      id: `cut-${primaryCut.id}`,
      title: primaryCut.type === "deadspace" ? "Trim the quiet stretch" : "Tighten the softest section",
      rationale: primaryCut.recommendedAction || primaryCut.reason,
      tone: "fix",
      timeLabel: `${formatSeconds(primaryCut.start)} to ${formatSeconds(primaryCut.end)}`,
      focusTimeSec: primaryCut.start,
    });
  }

  const pushback = payload.audienceOutlook?.likelyPushback[0] ?? payload.summary.weaknesses[0] ?? null;
  if (pushback) {
    actions.push({
      id: "pushback",
      title: "Clarify the weakest beat",
      rationale: pushback,
      tone: "fix",
      timeLabel: findWeakestMomentLabel(payload),
      focusTimeSec: findWeakestMomentStart(payload),
    });
  }

  const praise = payload.audienceOutlook?.likelyPraise[0] ?? payload.summary.strengths[0] ?? null;
  if (praise) {
    actions.push({
      id: "praise",
      title: "Protect what already lands",
      rationale: praise,
      tone: "protect",
      timeLabel: findStrongestMomentLabel(payload),
      focusTimeSec: findStrongestMomentStart(payload),
    });
  }

  const testNext = payload.actionBoard.testNext[0] ?? null;
  if (testNext) {
    actions.push({
      id: "test-next",
      title: "Run one follow-up test",
      rationale: testNext,
      tone: "test",
      timeLabel: findWeakestMomentLabel(payload),
      focusTimeSec: findWeakestMomentStart(payload),
    });
  }

  return actions.filter((action) => {
    const key = `${action.title}-${action.rationale}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function derivePrimaryCut(payload: AnalysisPayload) {
  const seen = new Set<string>();
  const cuts = [
    ...(payload.cutPlan.length ? payload.cutPlan : []),
    ...payload.deadspaceCuts,
    ...payload.lowValueCuts,
  ].filter((cut) => {
    if (seen.has(cut.id)) {
      return false;
    }
    seen.add(cut.id);
    return true;
  });

  return cuts.sort((left, right) => {
    if (left.defaultSelected !== right.defaultSelected) {
      return left.defaultSelected ? -1 : 1;
    }
    if (left.type !== right.type) {
      return left.type === "deadspace" ? -1 : 1;
    }
    return left.start - right.start;
  })[0] ?? null;
}

function findWeakestMomentLabel(payload: AnalysisPayload) {
  const worldMoment = payload.audienceWorld?.evidenceMoments[1] ?? payload.audienceWorld?.evidenceMoments[0] ?? null;
  if (worldMoment) {
    return `${formatSeconds(worldMoment.startSec)} to ${formatSeconds(worldMoment.endSec)}`;
  }
  const audienceMoment = [...(payload.audienceOutlook?.timeline ?? [])].sort(
    (left, right) => right.dropoffRisk - left.dropoffRisk || left.trust - right.trust,
  )[0];
  if (audienceMoment) {
    return `${formatSeconds(audienceMoment.startSec)} to ${formatSeconds(audienceMoment.endSec)}`;
  }
  const cut = derivePrimaryCut(payload);
  return cut ? `${formatSeconds(cut.start)} to ${formatSeconds(cut.end)}` : null;
}

function findWeakestMomentStart(payload: AnalysisPayload) {
  const worldMoment = payload.audienceWorld?.evidenceMoments[1] ?? payload.audienceWorld?.evidenceMoments[0] ?? null;
  if (worldMoment) {
    return worldMoment.startSec;
  }
  const audienceMoment = [...(payload.audienceOutlook?.timeline ?? [])].sort(
    (left, right) => right.dropoffRisk - left.dropoffRisk || left.trust - right.trust,
  )[0];
  if (audienceMoment) {
    return audienceMoment.startSec;
  }
  const cut = derivePrimaryCut(payload);
  return cut?.start ?? null;
}

function findStrongestMomentLabel(payload: AnalysisPayload) {
  const worldMoment = payload.audienceWorld?.evidenceMoments[0] ?? null;
  if (worldMoment) {
    return `${formatSeconds(worldMoment.startSec)} to ${formatSeconds(worldMoment.endSec)}`;
  }
  const audienceMoment = [...(payload.audienceOutlook?.timeline ?? [])].sort(
    (left, right) => right.interest - left.interest || right.trust - left.trust,
  )[0];
  if (audienceMoment) {
    return `${formatSeconds(audienceMoment.startSec)} to ${formatSeconds(audienceMoment.endSec)}`;
  }
  const marker = payload.markers[0];
  return marker ? formatSeconds(marker.t) : null;
}

function findStrongestMomentStart(payload: AnalysisPayload) {
  const worldMoment = payload.audienceWorld?.evidenceMoments[0] ?? null;
  if (worldMoment) {
    return worldMoment.startSec;
  }
  const audienceMoment = [...(payload.audienceOutlook?.timeline ?? [])].sort(
    (left, right) => right.interest - left.interest || right.trust - left.trust,
  )[0];
  if (audienceMoment) {
    return audienceMoment.startSec;
  }
  return payload.markers[0]?.t ?? null;
}

function deriveBrainSummaryFromPoints(points: AnalysisPayload["brainResponse"]["timeSeries"]) {
  const averages = points.reduce(
    (accumulator, point) => ({
      activation: accumulator.activation + point.globalActivation,
      motion: accumulator.motion + point.motionScore,
      audio: accumulator.audio + point.audioEnergy,
      transcript: accumulator.transcript + point.transcriptDensity,
    }),
    { activation: 0, motion: 0, audio: 0, transcript: 0 },
  );
  const count = Math.max(points.length, 1);
  return {
    averageActivation: averages.activation / count,
    averageMotion: averages.motion / count,
    averageAudioEnergy: averages.audio / count,
    averageTranscriptDensity: averages.transcript / count,
  };
}

function deriveReadTheRoomBrainSummary(payload: AnalysisPayload) {
  const points = payload.brainResponse.timeSeries;
  const audienceTimeline = payload.audienceOutlook?.timeline ?? [];
  const averages = points.reduce(
    (accumulator, point, index) => {
      const rawActivation = audienceTimeline[index]?.sentiment ?? point.globalActivation;
      return {
        activation:
          accumulator.activation +
          estimateProxyActivation({
            rawActivation,
            motion: point.motionScore,
            audio: point.audioEnergy,
            transcript: point.transcriptDensity,
            sceneChange: point.sceneChange,
            silenceOverlap: point.silenceOverlap,
          }),
        motion: accumulator.motion + point.motionScore,
        audio: accumulator.audio + point.audioEnergy,
        transcript: accumulator.transcript + point.transcriptDensity,
      };
    },
    { activation: 0, motion: 0, audio: 0, transcript: 0 },
  );
  const count = Math.max(points.length, 1);
  return {
    averageActivation: averages.activation / count,
    averageMotion: averages.motion / count,
    averageAudioEnergy: averages.audio / count,
    averageTranscriptDensity: averages.transcript / count,
  };
}

function estimateProxyActivation({
  rawActivation,
  motion,
  audio,
  transcript,
  sceneChange,
  silenceOverlap,
}: {
  rawActivation: number;
  motion: number;
  audio: number;
  transcript: number;
  sceneChange: boolean;
  silenceOverlap: boolean;
}) {
  const blended =
    0.34 * clamp01(rawActivation) +
    0.24 * clamp01(motion) +
    0.18 * clamp01(audio) +
    0.16 * clamp01(transcript) +
    0.08 * Number(sceneChange);
  const adjusted = silenceOverlap ? blended - 0.12 : blended;
  const compressed = 0.1 + 0.72 / (1 + Math.exp(-6.5 * (adjusted - 0.58)));
  return Math.min(0.82, Math.max(0.08, compressed));
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
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
