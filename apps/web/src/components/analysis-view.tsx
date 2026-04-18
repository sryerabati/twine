"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  LoaderCircle,
  Scissors,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAnalysis, trimAnalysis } from "@/lib/api";
import type {
  AnalysisPayload,
  AnalysisResponse,
  DeadspaceCut,
  TimelineSegment,
} from "@/lib/contracts";
import { formatDateTime, formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

type AnalysisViewProps = {
  analysisId: string;
  pollIntervalMs?: number;
  initialSelectedCutIds?: string[];
  onPersistSelectedCuts?: (selectedCutIds: string[]) => Promise<void> | void;
  onPersistExport?: (
    selectedCutIds: string[],
    latestExportUrl: string,
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
  const [selectedCutIdsByAnalysis, setSelectedCutIdsByAnalysis] = useState<
    Record<string, string[]>
  >({});
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

  async function handleToggleCut(cutId: string) {
    if (response?.status !== "completed" || !response.payload) {
      return;
    }
    const currentSelectedCutIds = deriveSelectedCutIds(
      response,
      initialSelectedCutIds,
      selectedCutIdsByAnalysis,
    );
    const next = currentSelectedCutIds.includes(cutId)
      ? currentSelectedCutIds.filter((value) => value !== cutId)
      : [...currentSelectedCutIds, cutId];
    setSelectedCutIdsByAnalysis((current) => ({
      ...current,
      [response.analysisId]: next,
    }));
    setTrimError(null);
    try {
      await onPersistSelectedCuts?.(next);
    } catch (persistError) {
      setTrimError(
        persistError instanceof Error
          ? persistError.message
          : "Could not save the selected cut plan.",
      );
    }
  }

  async function handleExport() {
    if (!selectedCutIds.length) {
      setTrimError("Select at least one cut before exporting.");
      return;
    }

    setTrimPending(true);
    setTrimError(null);

    try {
      await onPersistSelectedCuts?.(selectedCutIds);
      const result = await trimAnalysis(analysisId, selectedCutIds);
      await onPersistExport?.(selectedCutIds, result.trimmedVideoUrl);
      await reloadAnalysis();
    } catch (exportError) {
      setTrimError(
        exportError instanceof Error ? exportError.message : "Trim export failed.",
      );
    } finally {
      setTrimPending(false);
    }
  }

  const selectedCutIds = deriveSelectedCutIds(
    response,
    initialSelectedCutIds,
    selectedCutIdsByAnalysis,
  );

  if (error) {
    return <AnalysisError message={error} />;
  }

  if (!response || response.status === "queued" || response.status === "running") {
    return (
      <AnalysisLoading
        analysisId={analysisId}
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
      analysisId={analysisId}
      payload={response.payload}
      previewTimeSec={previewTimeSec}
      selectedCutIds={selectedCutIds}
      trimError={trimError}
      trimPending={trimPending}
      videoRef={videoRef}
      onActiveTimeChange={setActiveTimeSec}
      onExport={handleExport}
      onPreviewTimeChange={setPreviewTimeSec}
      onToggleCut={handleToggleCut}
    />
  );
}

function AnalysisLoading({
  analysisId,
  status,
}: {
  analysisId: string;
  status: "queued" | "running";
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-border/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Analysis workspace
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Processing analysis</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Waiting for FastAPI to finish the action board, timeline segments, and cut plan for
              analysis `{analysisId.slice(0, 8)}`.
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {status === "queued" ? "Queued" : "Running"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-border/70 bg-white/88 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
          <Skeleton className="h-72 w-full rounded-[1.6rem]" />
          <Skeleton className="mt-6 h-64 w-full rounded-[1.6rem]" />
        </div>
        <div className="rounded-[2rem] border border-border/70 bg-white/88 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-4 h-28 w-full rounded-[1.4rem]" />
          <Skeleton className="mt-4 h-28 w-full rounded-[1.4rem]" />
          <Skeleton className="mt-4 h-28 w-full rounded-[1.4rem]" />
        </div>
      </div>
    </div>
  );
}

function AnalysisError({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[2rem] border border-border/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <Badge variant="secondary" className="w-fit rounded-full bg-destructive/10 text-destructive">
        Analysis failed
      </Badge>
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">The backend returned an actionable error.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{message}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/app" className={cn(buttonVariants({ variant: "default" }))}>
          Back to app
        </Link>
        <Link href="/runbook" className={cn(buttonVariants({ variant: "outline" }))}>
          Open runbook
        </Link>
      </div>
    </div>
  );
}

function CompletedAnalysis({
  activeTimeSec,
  analysisId,
  payload,
  previewTimeSec,
  selectedCutIds,
  trimError,
  trimPending,
  videoRef,
  onActiveTimeChange,
  onExport,
  onPreviewTimeChange,
  onToggleCut,
}: {
  activeTimeSec: number;
  analysisId: string;
  payload: AnalysisPayload;
  previewTimeSec: number | null;
  selectedCutIds: string[];
  trimError: string | null;
  trimPending: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onActiveTimeChange: (time: number) => void;
  onExport: () => Promise<void>;
  onPreviewTimeChange: (time: number | null) => void;
  onToggleCut: (cutId: string) => Promise<void>;
}) {
  const focusTimeSec = previewTimeSec ?? activeTimeSec;
  const chartData = payload.brainResponse.timeSeries.map((point) => ({
    t: Number(point.stimulusTimeSec.toFixed(2)),
    activation: point.globalActivation,
    motion: point.motionScore,
    audio: point.audioEnergy,
  }));
  const latestExport = payload.exports[payload.exports.length - 1] ?? null;

  function jumpToTime(time: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play().catch(() => {
        videoRef.current?.pause();
      });
    }
    onActiveTimeChange(time);
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Scan workspace</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight">{payload.video.filename}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            The saved workspace pairs a live video review with a branded 3D brain-style scan,
            structured actions, and a cut plan that keeps deadspace trims preselected by default.
          </p>
        </div>

        <div className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Scoreboard</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ScoreChip label="Hook" value={payload.scores.hookScore} />
            <ScoreChip label="Pacing" value={payload.scores.pacingScore} />
            <ScoreChip label="Retention" value={payload.scores.retentionEstimate} />
            <ScoreChip label="Viral" value={payload.scores.viralPotential} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge variant="secondary">Confidence {payload.scores.confidence}</Badge>
            <Badge variant="secondary">{payload.diagnostics.device}</Badge>
            <Badge variant="secondary">{payload.cutPlan.length} total cuts</Badge>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-[1.5rem] border border-border/70 bg-black"
              controls
              preload="metadata"
              src={payload.video.sourceUrl}
              onTimeUpdate={(event) => onActiveTimeChange(event.currentTarget.currentTime)}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="secondary">Duration {formatSeconds(payload.video.durationSec)}</Badge>
              <Badge variant="secondary">Words {payload.diagnostics.transcriptWordCount}</Badge>
              <Badge variant="secondary">Scenes {payload.diagnostics.sceneChangeCount}</Badge>
            </div>
          </div>

          <BrainScanViewer
            points={payload.brainResponse.timeSeries}
            currentTimeSec={focusTimeSec}
            title="3D brain scan"
            description="Hover a timeline row or scrub the video to drive the current signal view."
          />

          <div className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Activation timeline</p>
                <p className="text-sm text-muted-foreground">
                  Global activation with motion and audio context across the full clip.
                </p>
              </div>
              <Badge variant="secondary">{analysisId.slice(0, 8)}</Badge>
            </div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}s`}
                  />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 1]} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 18,
                      borderColor: "rgba(15,23,42,0.08)",
                      backgroundColor: "rgba(255,255,255,0.96)",
                    }}
                  />
                  <Legend />
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

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold text-foreground">Action board</p>
            <div className="mt-4 grid gap-3">
              <ActionColumn title="Keep" items={payload.actionBoard.keep} />
              <ActionColumn title="Fix now" items={payload.actionBoard.fixNow} />
              <ActionColumn title="Test next" items={payload.actionBoard.testNext} />
              <ActionColumn title="Export plan" items={payload.actionBoard.exportPlan} />
            </div>
          </section>

          <section className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold text-foreground">Recommendation</p>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              {payload.summary.overallRecommendation}
            </p>
            <Separator className="my-5" />
            <div className="grid gap-4 md:grid-cols-2">
              <InfoList title="Strengths" items={payload.summary.strengths} />
              <InfoList title="Weaknesses" items={payload.summary.weaknesses} />
            </div>
          </section>

          <section className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Export workspace</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Deadspace cuts stay selected by default. Add AI low-value trims only when you
                  want a more aggressive export.
                </p>
              </div>
              <Badge variant="secondary">{selectedCutIds.length} selected</Badge>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => void onExport()} disabled={trimPending || !selectedCutIds.length}>
                {trimPending ? (
                  <>
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                    Exporting trim
                  </>
                ) : (
                  <>
                    <Scissors data-icon="inline-start" />
                    Export selected trim
                  </>
                )}
              </Button>
              {latestExport ? (
                <a
                  href={latestExport.trimmedVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  <Download data-icon="inline-start" />
                  Latest export
                </a>
              ) : null}
            </div>

            {trimError ? (
              <div className="mt-4 flex items-start gap-2 rounded-[1.25rem] border border-destructive/20 bg-destructive/8 p-4 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4" />
                <span>{trimError}</span>
              </div>
            ) : null}

            <Separator className="my-5" />
            <div className="flex flex-col gap-2">
              <ExportLink href={payload.artifacts.processedJsonUrl} label="Download analysis JSON" />
              <ExportLink href={payload.artifacts.cutListJsonUrl} label="Download cut list JSON" />
              <ExportLink href={payload.artifacts.eventsCsvUrl} label="Download event CSV" />
              {payload.artifacts.providerRawJsonUrl ? (
                <ExportLink
                  href={payload.artifacts.providerRawJsonUrl}
                  label="Download provider response JSON"
                />
              ) : null}
              {payload.artifacts.rawPredictionsUrl ? (
                <ExportLink href={payload.artifacts.rawPredictionsUrl} label="Download raw predictions" />
              ) : null}
            </div>

            {payload.exports.length ? (
              <>
                <Separator className="my-5" />
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Past exports</p>
                  {payload.exports
                    .slice()
                    .reverse()
                    .map((exportItem) => (
                      <div
                        key={exportItem.exportId}
                        className="rounded-[1.4rem] border border-border/70 bg-background/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              Trimmed to {formatSeconds(exportItem.trimmedDurationSec)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Removed {formatSeconds(exportItem.removedSeconds)} • {formatDateTime(exportItem.createdAt)}
                            </p>
                          </div>
                          <a
                            href={exportItem.trimmedVideoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                          >
                            Open
                          </a>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Cut set: {exportItem.selectedCutIds.join(", ")}
                        </p>
                      </div>
                    ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Cut plan</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Default deadspace trims are selected already; optional AI trims are review-only
                until you choose them.
              </p>
            </div>
            <Badge variant="secondary">{selectedCutIds.length} active</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {payload.deadspaceCuts.length ? (
              payload.deadspaceCuts.map((cut) => (
                <SelectableCutCard
                  key={cut.id}
                  cut={cut}
                  selected={selectedCutIds.includes(cut.id)}
                  title="Default deadspace trim"
                  onToggle={onToggleCut}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No deterministic deadspace cut crossed the threshold on this scan.
              </p>
            )}
          </div>

          <Separator className="my-6" />
          <div>
            <p className="text-sm font-semibold text-foreground">Optional AI trims</p>
            <div className="mt-4 space-y-3">
              {payload.lowValueCuts.length ? (
                payload.lowValueCuts.map((cut) => (
                  <SelectableCutCard
                    key={cut.id}
                    cut={cut}
                    selected={selectedCutIds.includes(cut.id)}
                    title="AI suggestion"
                    onToggle={onToggleCut}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No extra low-value sections were suggested by the AI on this run.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-foreground">Timeline segments</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Hover a row to sync the 3D scan. Click a row to jump the video.
          </p>

          <div className="mt-5 space-y-3">
            {payload.timelineSegments.length ? (
              payload.timelineSegments.map((segment) => (
                <TimelineRow
                  key={segment.id}
                  segment={segment}
                  selected={
                    segment.cutId ? selectedCutIds.includes(segment.cutId) : false
                  }
                  onHover={onPreviewTimeChange}
                  onJump={jumpToTime}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                The backend returned no timeline segments for this analysis.
              </p>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.3rem] border border-border/70 bg-background/70 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function ActionColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{title}</p>
      <div className="mt-3 flex flex-col gap-2">
        {items.length ? (
          items.map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 text-primary" />
              <span>{item}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No items in this lane.</p>
        )}
      </div>
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.3rem] border border-border/70 bg-background/70 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{title}</p>
      <div className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <p key={item} className="text-sm text-muted-foreground">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function SelectableCutCard({
  cut,
  selected,
  title,
  onToggle,
}: {
  cut: DeadspaceCut;
  selected: boolean;
  title: string;
  onToggle: (cutId: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-[1.45rem] border p-4 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/8"
          : "border-border/70 bg-background/70 hover:border-primary/30",
      )}
      onClick={() => void onToggle(cut.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{title}</p>
          <p className="mt-2 font-semibold text-foreground">
            {formatSeconds(cut.start)} to {formatSeconds(cut.end)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {selected ? "Selected" : "Optional"}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{cut.reason}</p>
      <p className="mt-2 text-sm text-foreground">{cut.recommendedAction}</p>
    </button>
  );
}

function TimelineRow({
  segment,
  selected,
  onHover,
  onJump,
}: {
  segment: TimelineSegment;
  selected: boolean;
  onHover: (time: number | null) => void;
  onJump: (time: number) => void;
}) {
  const midpoint = segment.start + (segment.end - segment.start) / 2;

  return (
    <button
      type="button"
      className="w-full rounded-[1.45rem] border border-border/70 bg-background/70 p-4 text-left transition-colors hover:border-primary/30"
      onMouseEnter={() => onHover(midpoint)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onJump(segment.start)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{segment.label}</Badge>
            <Badge variant="secondary">
              {formatSeconds(segment.start)} to {formatSeconds(segment.end)}
            </Badge>
            {selected ? (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                selected cut
              </Badge>
            ) : null}
          </div>
          <p className="mt-3 font-medium text-foreground">{segment.reason}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            segment.severity === "high"
              ? "bg-rose-100 text-rose-700"
              : segment.severity === "medium"
                ? "bg-amber-100 text-amber-800"
                : "bg-sky-100 text-sky-700",
          )}
        >
          {segment.severity}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{segment.recommendedAction}</p>
    </button>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "justify-start")}
      target="_blank"
      rel="noreferrer"
    >
      <Download data-icon="inline-start" />
      {label}
    </a>
  );
}

function deriveSelectedCutIds(
  response: AnalysisResponse | null,
  initialSelectedCutIds: string[] | undefined,
  selectedCutIdsByAnalysis: Record<string, string[]>,
) {
  if (response?.status !== "completed" || !response.payload) {
    return [];
  }

  return (
    selectedCutIdsByAnalysis[response.analysisId] ??
    (initialSelectedCutIds && initialSelectedCutIds.length > 0
      ? initialSelectedCutIds
      : response.payload.cutPlan.filter((cut) => cut.defaultSelected).map((cut) => cut.id))
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
