"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AnalysisPayload,
  AnalysisResponse,
  CompareResponse,
  SavedCompareResult,
} from "@/lib/contracts";
import { compareAnalyses, fetchAnalysis } from "@/lib/api";
import { cn } from "@/lib/utils";

type CompareData = CompareResponse | SavedCompareResult;

type CompareViewProps = {
  analysisIdA?: string | null;
  analysisIdB?: string | null;
  compare?: CompareData | null;
  payloadA?: AnalysisPayload | null;
  payloadB?: AnalysisPayload | null;
  title?: string;
  primaryLabel?: string | null;
  secondaryLabel?: string | null;
  legacy?: boolean;
  pollIntervalMs?: number;
};

export function CompareView({
  analysisIdA = null,
  analysisIdB = null,
  compare = null,
  payloadA = null,
  payloadB = null,
  title,
  primaryLabel,
  secondaryLabel,
  legacy = false,
  pollIntervalMs = 2500,
}: CompareViewProps) {
  const [analysisA, setAnalysisA] = useState<AnalysisResponse | null>(null);
  const [analysisB, setAnalysisB] = useState<AnalysisResponse | null>(null);
  const [generatedCompare, setGeneratedCompare] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedCompare = generatedCompare ?? compare;
  const resolvedPayloadA = analysisA?.payload ?? payloadA;
  const resolvedPayloadB = analysisB?.payload ?? payloadB;

  useEffect(() => {
    if (resolvedCompare || !analysisIdA || !analysisIdB) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const primaryAnalysisId = analysisIdA;
    const secondaryAnalysisId = analysisIdB;

    async function load() {
      try {
        const [nextA, nextB] = await Promise.all([
          fetchAnalysis(primaryAnalysisId),
          fetchAnalysis(secondaryAnalysisId),
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

        const comparePayload = await compareAnalyses(primaryAnalysisId, secondaryAnalysisId);
        if (!active) {
          return;
        }
        setGeneratedCompare(comparePayload);
        setError(null);
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
  }, [analysisIdA, analysisIdB, pollIntervalMs, resolvedCompare]);

  if (!resolvedCompare && !analysisIdA && !analysisIdB) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <Panel>
          <Badge variant="secondary">Missing compare IDs</Badge>
          <h1 className="mt-4 font-heading text-4xl tracking-tight text-foreground">
            Add both analysis IDs to the compare URL.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Use <code>?a=&lt;analysisIdA&gt;&amp;b=&lt;analysisIdB&gt;</code> after running two
            analyses.
          </p>
        </Panel>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <Panel>
          <Badge variant="secondary" className="bg-destructive/15 text-destructive">
            Compare failed
          </Badge>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{error}</p>
        </Panel>
      </main>
    );
  }

  if (!resolvedCompare) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel>
            <Badge variant="secondary">
              {legacy ? "Legacy compare" : "Saved compare"}
            </Badge>
            <p className="mt-5 text-xs uppercase tracking-[0.28em] text-muted-foreground">Compare workspace</p>
            <h1 className="mt-3 font-heading text-4xl tracking-tight text-foreground">
              {title ?? "Generating compare summary"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              Waiting for both analysis jobs to complete so the compare workspace can lock onto one
              winner and one next action.
            </p>
          </Panel>
          <div className="grid gap-6">
            <Skeleton className="surface-soft h-40 rounded-[2rem]" />
            <Skeleton className="surface-soft h-52 rounded-[2rem]" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <CompletedCompare
      compare={resolvedCompare}
      payloadA={resolvedPayloadA}
      payloadB={resolvedPayloadB}
      title={title}
      primaryLabel={primaryLabel}
      secondaryLabel={secondaryLabel}
      legacy={legacy}
      analysisIdA={legacy ? analysisIdA : null}
      analysisIdB={legacy ? analysisIdB : null}
    />
  );
}

function CompletedCompare({
  compare,
  payloadA,
  payloadB,
  title,
  primaryLabel,
  secondaryLabel,
  legacy,
  analysisIdA,
  analysisIdB,
}: {
  compare: CompareData;
  payloadA: AnalysisPayload | null;
  payloadB: AnalysisPayload | null;
  title?: string;
  primaryLabel?: string | null;
  secondaryLabel?: string | null;
  legacy: boolean;
  analysisIdA?: string | null;
  analysisIdB?: string | null;
}) {
  const labelA = primaryLabel ?? "Version A";
  const labelB = secondaryLabel ?? "Version B";
  const hasSignalMetrics = payloadA !== null && payloadB !== null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10 lg:px-10">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel className="overflow-hidden">
          <div className="absolute -right-4 top-5 h-16 w-16 rotate-6 rounded-[1.4rem] border-2 border-primary bg-primary shadow-[4px_4px_0_0_var(--color-primary)]" />
          <div className="relative">
            <Badge variant="secondary">
              {legacy ? "Legacy compare" : "Saved compare"}
            </Badge>
            <p className="mt-5 text-xs uppercase tracking-[0.28em] text-muted-foreground">Compare workspace</p>
            <h1 className="mt-3 font-heading text-4xl tracking-tight text-foreground">
              {title ?? "Content compare"}
            </h1>
            <p className="mt-6 text-xs uppercase tracking-[0.28em] text-muted-foreground">Winner</p>
            <p className="mt-2 font-heading text-5xl tracking-tight text-foreground">
              {compare.winner === "tie" ? "Tie" : `Version ${compare.winner}`}
            </p>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{compare.winnerReason}</p>
          </div>
        </Panel>

        <Panel className="justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Next action</p>
            <p className="mt-4 text-xl leading-8 text-foreground">{compare.recommendation}</p>
          </div>
          <div className="mt-8 space-y-3 text-sm text-muted-foreground">
            <div className="surface-soft flex items-center justify-between gap-4 rounded-[1.35rem] px-4 py-3">
              <span>{labelA}</span>
              <span className="text-muted-foreground/70">A</span>
            </div>
            <div className="surface-soft flex items-center justify-between gap-4 rounded-[1.35rem] px-4 py-3">
              <span>{labelB}</span>
              <span className="text-muted-foreground/70">B</span>
            </div>
          </div>
          {legacy && analysisIdA && analysisIdB ? (
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/analysis/${analysisIdA}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open analysis A
              </Link>
              <Link href={`/analysis/${analysisIdB}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open analysis B
              </Link>
            </div>
          ) : null}
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <Panel>
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Why this wins</p>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
            {compare.summary.map((line) => (
              <li
                key={line}
                className="surface-soft rounded-[1.35rem] px-4 py-3"
              >
                {line}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Key differences</p>
              <p className="mt-2 text-sm text-muted-foreground">
                The compare run is saved as one workspace, so the breakdown stays focused on the
                decision instead of duplicating full scan detail.
              </p>
            </div>
            {legacy ? (
              <Badge variant="secondary">
                Legacy compare
              </Badge>
            ) : null}
          </div>
          <div className="mt-6 space-y-3">
            {compare.slices.map((slice) => (
              <div
                key={slice.label}
                className="surface-soft rounded-[1.5rem] px-4 py-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-medium text-foreground">{slice.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.24em] text-muted-foreground/70">
                      {slice.winner === "tie" ? "Tie" : `Winner ${slice.winner}`}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>A {slice.aScore}</p>
                    <p>B {slice.bScore}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {hasSignalMetrics ? (
        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label={`${labelA} viral`}
            value={payloadA.scores.viralPotential}
            tone={compare.winner === "A" ? "winner" : "default"}
          />
          <MetricCard
            label={`${labelB} viral`}
            value={payloadB.scores.viralPotential}
            tone={compare.winner === "B" ? "winner" : "default"}
          />
          <MetricCard label={`${labelA} hook`} value={payloadA.scores.hookScore} />
          <MetricCard label={`${labelB} hook`} value={payloadB.scores.hookScore} />
        </section>
      ) : null}
    </main>
  );
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "surface relative flex flex-col rounded-[2rem] px-6 py-6 text-foreground",
        className,
      )}
    >
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "winner";
}) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] border-2 px-4 py-5",
        tone === "winner"
          ? "border-primary bg-primary text-primary-foreground shadow-[6px_6px_0_0_var(--color-primary)]"
          : "surface-soft text-foreground",
      )}
    >
      <p className={cn("text-xs uppercase tracking-[0.24em]", tone === "winner" ? "text-primary-foreground/80" : "text-muted-foreground")}>{label}</p>
      <p className={cn("mt-3 font-heading text-4xl tracking-tight", tone === "winner" ? "text-primary-foreground" : "text-foreground")}>{value}</p>
    </div>
  );
}
