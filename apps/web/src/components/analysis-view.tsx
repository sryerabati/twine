"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
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
import { ScanSecondaryDetails } from "@/components/scan-secondary-details";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAnalysis, trimAnalysis } from "@/lib/api";
import type {
  AnalysisPayload,
  AnalysisResponse,
} from "@/lib/contracts";
import { formatSeconds } from "@/lib/format";
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
      <div className="rounded-[2.5rem] border border-white/10 bg-slate-950/90 p-8 text-slate-50 shadow-[0_36px_120px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Analysis workspace</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
              Processing analysis
            </h1>
            <p className="mt-3 text-sm text-slate-300">
              Waiting for FastAPI to finish the scan output for analysis `{analysisId.slice(0, 8)}`.
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full bg-white/10 text-slate-200">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {status === "queued" ? "Queued" : "Running"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.2)]">
          <Skeleton className="h-72 w-full rounded-[1.6rem]" />
          <Skeleton className="mt-6 h-64 w-full rounded-[1.6rem]" />
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.2)]">
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[2.5rem] border border-white/10 bg-slate-950/90 p-8 text-slate-50 shadow-[0_36px_120px_rgba(15,23,42,0.35)]">
      <Badge variant="secondary" className="w-fit rounded-full bg-rose-500/15 text-rose-200">
        Analysis failed
      </Badge>
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          The backend returned an actionable error.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{message}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/app"
          className={cn(
            buttonVariants({ variant: "default" }),
            "bg-white text-slate-950 hover:bg-slate-200",
          )}
        >
          Back to app
        </Link>
        <Link
          href="/runbook"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "border-white/10 bg-white/5 text-slate-50 hover:bg-white/10 hover:text-white",
          )}
        >
          Open runbook
        </Link>
      </div>
    </div>
  );
}

function CompletedAnalysis({
  activeTimeSec,
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
      <section className="rounded-[2.5rem] border border-white/10 bg-slate-950/95 p-6 text-slate-50 shadow-[0_36px_120px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Primary analysis
            </h2>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              {payload.video.filename}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              {payload.summary.overallRecommendation}
            </p>
          </div>

          <Badge variant="secondary" className="bg-white/10 text-slate-200">
            {selectedCutIds.length} selected
          </Badge>
        </div>

        <div className="mt-6 space-y-6">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4">
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-[1.5rem] border border-white/10 bg-black"
              controls
              preload="metadata"
              src={payload.video.sourceUrl}
              onTimeUpdate={(event) => onActiveTimeChange(event.currentTarget.currentTime)}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SignalStat label="Duration" value={formatSeconds(payload.video.durationSec)} />
              <SignalStat label="Words" value={`${payload.diagnostics.transcriptWordCount}`} />
              <SignalStat label="Scenes" value={`${payload.diagnostics.sceneChangeCount}`} />
              <SignalStat label="Confidence" value={payload.scores.confidence} />
            </div>
          </div>

          <BrainScanViewer
            points={payload.brainResponse.timeSeries}
            currentTimeSec={focusTimeSec}
            title="Brain scan"
            description="Scrub the video or hover a timeline row to keep the signal view in sync."
          />

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">Activation timeline</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Global activation, motion, and audio context.
                </p>
              </div>
            </div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
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
                      borderColor: "rgba(255,255,255,0.08)",
                      backgroundColor: "rgba(15,23,42,0.96)",
                      color: "white",
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
      </section>

      <ScanSecondaryDetails
        payload={payload}
        selectedCutIds={selectedCutIds}
        trimError={trimError}
        trimPending={trimPending}
        onExport={onExport}
        onToggleCut={onToggleCut}
        onPreviewTimeChange={onPreviewTimeChange}
        onJumpToTime={jumpToTime}
      />
    </div>
  );
}

function SignalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-slate-950/45 px-3 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-white">{value}</p>
    </div>
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
