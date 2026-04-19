"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileWarning, LoaderCircle } from "lucide-react";

import { CompareView } from "@/components/compare-view";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResponse, CompareResponse, SavedScanRecord } from "@/lib/contracts";
import { compareAnalyses, fetchAnalysis } from "@/lib/api";

type CompareScanDetailClientProps = {
  scanId: string;
  pollIntervalMs?: number;
};

export function CompareScanDetailClient({
  scanId,
  pollIntervalMs = 2500,
}: CompareScanDetailClientProps) {
  const scan = useQuery("scans:getMineById" as never, { scanId } as never) as
    | SavedScanRecord
    | null
    | undefined;
  const saveCompareResult = useMutation("scans:saveCompareResult" as never);
  const [generatedCompare, setGeneratedCompare] = useState<CompareResponse | null>(null);
  const [analysisA, setAnalysisA] = useState<AnalysisResponse | null>(null);
  const [analysisB, setAnalysisB] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedCompare = generatedCompare ?? scan?.compareResult ?? null;

  useEffect(() => {
    if (
      scan == null ||
      scan.scanType !== "compare" ||
      resolvedCompare ||
      !scan.localAnalysisId ||
      !scan.secondaryLocalAnalysisId
    ) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const primaryAnalysisId = scan.localAnalysisId;
    const secondaryAnalysisId = scan.secondaryLocalAnalysisId;

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
        await saveCompareResult({
          scanId,
          winner: comparePayload.winner,
          winnerReason: comparePayload.winnerReason,
          recommendation: comparePayload.recommendation,
          summary: comparePayload.summary,
          slices: comparePayload.slices,
        } as never);
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
  }, [
    pollIntervalMs,
    resolvedCompare,
    saveCompareResult,
    scan,
    scanId,
  ]);

  if (scan === undefined) {
    return (
      <ShellState
        icon={<LoaderCircle className="size-8 animate-spin text-foreground" />}
        title="Loading compare workspace"
        body="Fetching the saved compare scan from Convex so the winner, recommendation, and saved breakdown can be restored."
      />
    );
  }

  if (scan === null) {
    return (
      <ShellState
        icon={<FileWarning className="size-8 text-destructive" />}
        title="Compare scan not found"
        body="This compare scan either does not exist or is not owned by the active account."
      />
    );
  }

  if (scan.scanType !== "compare") {
    return (
      <ShellState
        icon={<FileWarning className="size-8 text-destructive" />}
        title="Wrong scan type"
        body="This route is reserved for saved compare scans. Open single scans from the library instead."
      />
    );
  }

  if (error) {
    return (
      <ShellState
        badge="Compare failed"
        icon={<FileWarning className="size-8 text-destructive" />}
        title="The saved compare scan could not be finalized"
        body={error}
      />
    );
  }

  if (resolvedCompare) {
    return (
      <CompareView
        compare={resolvedCompare}
        payloadA={analysisA?.payload ?? null}
        payloadB={analysisB?.payload ?? null}
        title={scan.title ?? `${scan.filename} vs ${scan.secondaryFilename ?? "Version B"}`}
        primaryLabel={scan.filename}
        secondaryLabel={scan.secondaryFilename}
      />
    );
  }

  if (!scan.localAnalysisId || !scan.secondaryLocalAnalysisId) {
    return (
      <ShellState
        badge="Awaiting analyses"
        icon={<LoaderCircle className="size-8 animate-spin text-foreground" />}
        title="The compare scan exists before the pair is ready"
        body="This saved scan row is waiting for both analysis IDs to attach. As soon as the upload flow finishes that handoff, this page will finalize the compare result automatically."
      />
    );
  }

  return (
    <ShellState
      badge="Building compare"
      icon={<LoaderCircle className="size-8 animate-spin text-foreground" />}
      title="Scoring both versions"
      body="Polling the attached analyses until both complete, then saving the compare winner back onto this single scan row."
    />
  );
}

function ShellState({
  badge,
  icon,
  title,
  body,
}: {
  badge?: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="surface mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-[2rem] px-8 py-16 text-center text-foreground">
      {icon}
      {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
