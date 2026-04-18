"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, LoaderCircle, MoveRight } from "lucide-react";
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

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisPayload, AnalysisResponse } from "@/lib/contracts";
import { fetchAnalysis } from "@/lib/api";
import { formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

type AnalysisViewProps = {
  analysisId: string;
  pollIntervalMs?: number;
};

export function AnalysisView({
  analysisId,
  pollIntervalMs = 2500,
}: AnalysisViewProps) {
  const [response, setResponse] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return <AnalysisError message={error} />;
  }

  if (!response || response.status === "queued" || response.status === "running") {
    const status = response?.status === "running" ? "running" : "queued";
    return <AnalysisLoading analysisId={analysisId} status={status} />;
  }

  if (response.status === "failed" || !response.payload) {
    return (
      <AnalysisError
        message={
          response.error ??
          "Analysis failed before a payload was written. Check the backend logs and health endpoint."
        }
      />
    );
  }

  return <CompletedAnalysis payload={response.payload} />;
}

function AnalysisLoading({
  analysisId,
  status,
}: {
  analysisId: string;
  status: "queued" | "running";
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Analysis workspace
          </p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">Processing {analysisId.slice(0, 8)}</h1>
        </div>
        <Badge variant="secondary">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          {status === "queued" ? "Queued" : "Running"}
        </Badge>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="surface rounded-[2rem] p-6">
          <Skeleton className="h-72 w-full rounded-[1.5rem]" />
          <Skeleton className="mt-6 h-56 w-full rounded-[1.5rem]" />
        </div>
        <div className="surface rounded-[2rem] p-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-4 h-24 w-full rounded-[1.4rem]" />
          <Skeleton className="mt-4 h-24 w-full rounded-[1.4rem]" />
          <Skeleton className="mt-4 h-24 w-full rounded-[1.4rem]" />
        </div>
      </div>
    </main>
  );
}

function AnalysisError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
      <div className="surface rounded-[2rem] p-8">
        <Badge variant="secondary" className="bg-destructive/15 text-destructive">
          Analysis failed
        </Badge>
        <h1 className="mt-4 font-heading text-4xl tracking-tight">The backend returned an actionable error.</h1>
        <p className="mt-4 max-w-3xl text-lg text-muted-foreground">{message}</p>
        <div className="mt-8 flex gap-3">
          <Link href="/" className={cn(buttonVariants({ variant: "default" }))}>
            Back to upload
          </Link>
          <Link href="/runbook" className={cn(buttonVariants({ variant: "outline" }))}>
            Open runbook
          </Link>
        </div>
      </div>
    </main>
  );
}

function CompletedAnalysis({ payload }: { payload: AnalysisPayload }) {
  const chartData = useMemo(
    () =>
      payload.brainResponse.timeSeries.map((point) => ({
        t: Number(point.stimulusTimeSec.toFixed(2)),
        activation: point.globalActivation,
        motion: point.motionScore,
        audio: point.audioEnergy,
      })),
    [payload.brainResponse.timeSeries],
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Single analysis
          </p>
          <h1 className="mt-3 font-heading text-5xl tracking-tight">{payload.video.filename}</h1>
          <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
            Visualizes predicted average-subject cortical response over time. Timeline markers and viral
            estimates are application heuristics layered on top.
          </p>
        </div>
        <div className="surface rounded-[2rem] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Scores</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ScoreChip label="Hook" value={payload.scores.hookScore} />
            <ScoreChip label="Pacing" value={payload.scores.pacingScore} />
            <ScoreChip label="Retention" value={payload.scores.retentionEstimate} />
            <ScoreChip label="Viral estimate" value={payload.scores.viralPotential} />
          </div>
          <Separator className="my-5" />
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Confidence {payload.scores.confidence}</Badge>
            <Badge variant="secondary">{payload.diagnostics.device}</Badge>
            <Badge variant="secondary">
              Lag {payload.brainResponse.meshInfo.lagCompensationSec}s
            </Badge>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="surface rounded-[2rem] p-6">
          <video
            className="aspect-video w-full rounded-[1.5rem] border border-border/70 bg-black"
            controls
            preload="metadata"
            src={payload.video.sourceUrl}
          />
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Activation timeline</p>
                <p className="text-sm text-muted-foreground">
                  Global response plus motion and audio context for edit decisions.
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
                      borderColor: "rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(14, 20, 32, 0.92)",
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
          <Separator className="my-6" />
          <div>
            <p className="text-sm font-medium">Hemisphere heat-strip</p>
            <p className="mt-1 text-sm text-muted-foreground">
              64-bin left/right downsampled cortical summaries per timestep.
            </p>
            <HeatStrip payload={payload} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="surface rounded-[2rem] p-6">
            <p className="text-sm font-medium">Recommendation</p>
            <p className="mt-3 text-lg text-muted-foreground">
              {payload.summary.overallRecommendation}
            </p>
            <div className="mt-5 grid gap-4">
              <InfoList title="Strengths" items={payload.summary.strengths} />
              <InfoList title="Weaknesses" items={payload.summary.weaknesses} />
            </div>
          </section>

          <section className="surface rounded-[2rem] p-6">
            <p className="text-sm font-medium">Markers</p>
            <div className="mt-4 flex flex-col gap-3">
              {payload.markers.map((marker) => (
                <div
                  key={`${marker.type}-${marker.t}`}
                  className="rounded-[1.4rem] border border-border/70 bg-background/50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{marker.type.replaceAll("_", " ")}</Badge>
                      <span className="text-sm text-muted-foreground">{formatSeconds(marker.t)}</span>
                    </div>
                    <Badge variant="secondary">{marker.severity}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{marker.explanation}</p>
                  <p className="mt-2 text-sm">{marker.suggestion}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="surface rounded-[2rem] p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Deadspace cuts</p>
              <Link
                href={`/compare?a=${payload.analysisId}&b=${payload.analysisId}`}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Explore compare
                <MoveRight data-icon="inline-end" />
              </Link>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {payload.deadspaceCuts.length ? (
                payload.deadspaceCuts.map((cut) => (
                  <div
                    key={`${cut.start}-${cut.end}`}
                    className="rounded-[1.4rem] border border-border/70 bg-background/50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">
                        {formatSeconds(cut.start)} – {formatSeconds(cut.end)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{cut.reason}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No cut range crossed the deterministic deadspace threshold.
                </p>
              )}
            </div>
          </section>

          <section className="surface rounded-[2rem] p-6">
            <p className="text-sm font-medium">Diagnostics and export</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="secondary">Words {payload.diagnostics.transcriptWordCount}</Badge>
              <Badge variant="secondary">Scenes {payload.diagnostics.sceneChangeCount}</Badge>
              <Badge variant="secondary">
                Deadspace {formatSeconds(payload.diagnostics.deadspaceSeconds)}
              </Badge>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <ExportLink href={payload.artifacts.processedJsonUrl} label="Download processed JSON" />
              <ExportLink href={payload.artifacts.cutListJsonUrl} label="Download cut list JSON" />
              <ExportLink href={payload.artifacts.eventsCsvUrl} label="Download event CSV" />
              <ExportLink href={payload.artifacts.rawPredictionsUrl} label="Download raw predictions" />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/50 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-heading text-4xl tracking-tight">{value}</p>
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{title}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="text-sm text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeatStrip({ payload }: { payload: AnalysisPayload }) {
  const columns = payload.brainResponse.timeSeries.length;
  return (
    <div className="mt-4 overflow-x-auto rounded-[1.4rem] border border-border/70 bg-background/40 p-4">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(18px, 1fr))` }}
      >
        {payload.brainResponse.timeSeries.map((point) => (
          <div key={`left-${point.stimulusTimeSec}`} className="flex flex-col gap-1">
            <div
              className="h-12 rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, var(--color-chart-1) ${Math.round(point.leftHemisphereActivation * 100)}%, transparent)` }}
            />
            <div
              className="h-12 rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, var(--color-chart-2) ${Math.round(point.rightHemisphereActivation * 100)}%, transparent)` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <span>Left hemisphere</span>
        <span>Right hemisphere</span>
      </div>
    </div>
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
