"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisPayload, AnalysisResponse, CompareResponse } from "@/lib/contracts";
import { compareAnalyses, fetchAnalysis } from "@/lib/api";
import { cn } from "@/lib/utils";

type CompareViewProps = {
  analysisIdA: string | null;
  analysisIdB: string | null;
  pollIntervalMs?: number;
};

export function CompareView({
  analysisIdA,
  analysisIdB,
  pollIntervalMs = 2500,
}: CompareViewProps) {
  const [analysisA, setAnalysisA] = useState<AnalysisResponse | null>(null);
  const [analysisB, setAnalysisB] = useState<AnalysisResponse | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!analysisIdA || !analysisIdB) {
      return;
    }

    const idA = analysisIdA;
    const idB = analysisIdB;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const [nextA, nextB] = await Promise.all([
          fetchAnalysis(idA),
          fetchAnalysis(idB),
        ]);
        if (!active) {
          return;
        }
        setAnalysisA(nextA);
        setAnalysisB(nextB);
        const pending =
          nextA.status === "queued" ||
          nextA.status === "running" ||
          nextB.status === "queued" ||
          nextB.status === "running";
        if (pending) {
          timer = setTimeout(load, pollIntervalMs);
          return;
        }
        if (nextA.status === "failed" || nextB.status === "failed") {
          setError(nextA.error ?? nextB.error ?? "One compare input failed.");
          return;
        }
        const comparePayload = await compareAnalyses(idA, idB);
        if (active) {
          setCompare(comparePayload);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Compare failed.");
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
  }, [analysisIdA, analysisIdB, pollIntervalMs]);

  if (!analysisIdA || !analysisIdB) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <div className="surface rounded-[2rem] p-8">
          <Badge variant="secondary">Missing compare IDs</Badge>
          <h1 className="mt-4 font-heading text-4xl tracking-tight">
            Add both analysis IDs to the compare URL.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Use <code>?a=&lt;analysisIdA&gt;&amp;b=&lt;analysisIdB&gt;</code> after running two analyses.
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <div className="surface rounded-[2rem] p-8">
          <Badge variant="secondary" className="bg-destructive/15 text-destructive">
            Compare failed
          </Badge>
          <p className="mt-4 text-lg text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!analysisA || !analysisB || !compare || !analysisA.payload || !analysisB.payload) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Content Compare</p>
            <h1 className="mt-2 font-heading text-5xl tracking-tight">Generating compare summary</h1>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Skeleton className="h-[28rem] rounded-[2rem]" />
          <Skeleton className="h-[28rem] rounded-[2rem]" />
        </div>
      </main>
    );
  }

  return (
    <CompletedCompare
      compare={compare}
      payloadA={analysisA.payload}
      payloadB={analysisB.payload}
    />
  );
}

function CompletedCompare({
  compare,
  payloadA,
  payloadB,
}: {
  compare: CompareResponse;
  payloadA: AnalysisPayload;
  payloadB: AnalysisPayload;
}) {
  const chartData = useMemo(() => {
    const longest = Math.max(
      payloadA.brainResponse.timeSeries.length,
      payloadB.brainResponse.timeSeries.length,
    );
    return Array.from({ length: longest }, (_, index) => ({
      index,
      a: payloadA.brainResponse.timeSeries[index]?.globalActivation ?? null,
      b: payloadB.brainResponse.timeSeries[index]?.globalActivation ?? null,
    }));
  }, [payloadA, payloadB]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Content Compare</p>
          <h1 className="mt-3 font-heading text-5xl tracking-tight">
            Winner: {compare.winner === "tie" ? "Tie" : `Version ${compare.winner}`}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-muted-foreground">{compare.winnerReason}</p>
        </div>
        <div className="surface rounded-[2rem] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Recommendation</p>
          <p className="mt-4 text-lg text-muted-foreground">{compare.recommendation}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/analysis/${payloadA.analysisId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Open A
            </Link>
            <Link href={`/analysis/${payloadB.analysisId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Open B
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="surface rounded-[2rem] p-6">
          <p className="text-sm font-medium">Aligned activation overview</p>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="index" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} domain={[0, 1]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="a" stroke="var(--color-chart-1)" dot={false} name="Version A" />
                <Line type="monotone" dataKey="b" stroke="var(--color-chart-2)" dot={false} name="Version B" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <CompareScoreCard label="A viral estimate" value={payloadA.scores.viralPotential} />
            <CompareScoreCard label="B viral estimate" value={payloadB.scores.viralPotential} />
            <CompareScoreCard label="A hook" value={payloadA.scores.hookScore} />
            <CompareScoreCard label="B hook" value={payloadB.scores.hookScore} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="surface rounded-[2rem] p-6">
            <p className="text-sm font-medium">Where each cut wins</p>
            <div className="mt-4 flex flex-col gap-3">
              {compare.slices.map((slice) => (
                <div
                  key={slice.label}
                  className="rounded-[1.4rem] border border-border/70 bg-background/50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{slice.label}</span>
                    <Badge variant="secondary">
                      {slice.winner === "tie" ? "Tie" : `Winner ${slice.winner}`}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>A {slice.aScore}</span>
                    <span>B {slice.bScore}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface rounded-[2rem] p-6">
            <p className="text-sm font-medium">Summary</p>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
              {compare.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}

function CompareScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/50 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-heading text-4xl tracking-tight">{value}</p>
    </div>
  );
}
