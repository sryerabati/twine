"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Film, GitCompareArrows, LoaderCircle, Upload } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { HealthBanner } from "@/components/health-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchHealth, startAnalysis, uploadVideo } from "@/lib/api";
import type { HealthResponse } from "@/lib/contracts";
import { formatBytes } from "@/lib/format";

type UploadWorkbenchProps = {
  onSingleReady: (analysisId: string) => void;
  onCompareReady: (analysisIdA: string, analysisIdB: string) => void;
};

type FileState = {
  file: File | null;
  status: "idle" | "uploading" | "analyzing";
};

const emptyFileState: FileState = { file: null, status: "idle" };

export function UploadWorkbench({
  onSingleReady,
  onCompareReady,
}: UploadWorkbenchProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [single, setSingle] = useState<FileState>(emptyFileState);
  const [compareA, setCompareA] = useState<FileState>(emptyFileState);
  const [compareB, setCompareB] = useState<FileState>(emptyFileState);
  const [actionError, setActionError] = useState<string | null>(null);

  // Convex mutations: create durable pending rows BEFORE we hit FastAPI so the
  // user's history always reflects the attempt, even if the backend call fails.
  // FastAPI is configured with REQUIRE_CONVEX_IDS=true, so missing IDs will
  // hard-fail on the server; we mirror that by aborting the flow here if the
  // Convex mutation throws (e.g., unauthenticated, validation, network).
  const createPendingUpload = useMutation(api.uploads.createPendingUpload);
  const createPendingScan = useMutation(api.scans.createPendingScan);

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((response) => {
        if (!cancelled) {
          setHealth(response);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setHealthError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const disabledSingle = !single.file || single.status !== "idle";
  const disabledCompare =
    !compareA.file ||
    !compareB.file ||
    compareA.status !== "idle" ||
    compareB.status !== "idle";

  const healthSummary = useMemo(() => {
    if (!health) {
      return "Checking local backend readiness";
    }
    if (health.blockers.length) {
      return `${health.blockers.length} blocker${health.blockers.length > 1 ? "s" : ""} detected`;
    }
    return `Device ${health.selectedDevice} • model ${health.modelStatus}`;
  }, [health]);

  async function handleSingle() {
    if (!single.file) {
      return;
    }
    setActionError(null);
    setSingle({ file: single.file, status: "uploading" });
    try {
      // 1) Register the pending upload in Convex first. This persists the
      //    attempt under the current user's account before any bytes move.
      const convexUploadId = await createPendingUpload({
        filename: single.file.name,
        contentType: single.file.type || "video/mp4",
        sizeBytes: single.file.size,
      });
      // 2) Send the file to FastAPI, threading the Convex ID through so the
      //    backend can link its local row to the Convex record.
      const upload = await uploadVideo(single.file, convexUploadId);
      setSingle({ file: single.file, status: "analyzing" });
      // 3) Create the pending scan row in Convex, tied to the same upload.
      const convexScanId = await createPendingScan({
        uploadId: convexUploadId,
      });
      // 4) Kick off analysis on FastAPI with the Convex scan ID.
      const analysis = await startAnalysis(upload.uploadId, convexScanId);
      startTransition(() => onSingleReady(analysis.analysisId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Upload failed.");
      setSingle({ file: single.file, status: "idle" });
    }
  }

  async function handleCompare() {
    if (!compareA.file || !compareB.file) {
      return;
    }
    setActionError(null);
    setCompareA({ file: compareA.file, status: "uploading" });
    setCompareB({ file: compareB.file, status: "uploading" });
    try {
      // Create two distinct Convex upload rows — one per file. Each cut gets
      // its own row in history so A/B runs aren't conflated with single cuts.
      const [convexUploadIdA, convexUploadIdB] = await Promise.all([
        createPendingUpload({
          filename: compareA.file.name,
          contentType: compareA.file.type || "video/mp4",
          sizeBytes: compareA.file.size,
        }),
        createPendingUpload({
          filename: compareB.file.name,
          contentType: compareB.file.type || "video/mp4",
          sizeBytes: compareB.file.size,
        }),
      ]);
      const [uploadA, uploadB] = await Promise.all([
        uploadVideo(compareA.file, convexUploadIdA),
        uploadVideo(compareB.file, convexUploadIdB),
      ]);
      setCompareA({ file: compareA.file, status: "analyzing" });
      setCompareB({ file: compareB.file, status: "analyzing" });
      // One scan per cut. The compare summary is derived app-side from both
      // analyses; no third scan row is created for the comparison itself.
      const [convexScanIdA, convexScanIdB] = await Promise.all([
        createPendingScan({ uploadId: convexUploadIdA }),
        createPendingScan({ uploadId: convexUploadIdB }),
      ]);
      const [analysisA, analysisB] = await Promise.all([
        startAnalysis(uploadA.uploadId, convexScanIdA),
        startAnalysis(uploadB.uploadId, convexScanIdB),
      ]);
      startTransition(() => onCompareReady(analysisA.analysisId, analysisB.analysisId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Compare flow failed.");
      setCompareA((current) => ({ ...current, status: "idle" }));
      setCompareB((current) => ({ ...current, status: "idle" }));
    }
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-20">
      <div className="flex flex-col justify-between gap-10">
        <div className="max-w-2xl">
          <Badge variant="secondary" className="rounded-full bg-primary/15 text-primary">
            Short-form creator tooling
          </Badge>
          <h1 className="mt-6 max-w-4xl font-heading text-5xl leading-[0.92] tracking-tight text-balance md:text-7xl">
            Simulate predicted brain response before you post the cut.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Upload one short-form video or compare two cuts side by side. TRIBE v2 powers the
            cortical response estimate; the product layers on pacing, deadspace, and hook
            heuristics for creator decisions.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="surface rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Direct model output</p>
            <p className="mt-2 font-medium">Predicted fsaverage5 average-subject response over time.</p>
          </div>
          <div className="surface rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">App heuristics</p>
            <p className="mt-2 font-medium">Deadspace ranges, pacing flags, and viral estimate are app-side logic.</p>
          </div>
          <div className="surface rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Demo limits</p>
            <p className="mt-2 font-medium">Non-commercial, not medical, not mind-reading, and optimized for short MP4s.</p>
          </div>
        </div>

        <HealthBanner health={health} />
        {healthError ? (
          <p className="text-sm text-destructive">
            Could not load health status: {healthError}
          </p>
        ) : null}
      </div>

      <div className="surface rounded-[2rem] p-6 shadow-2xl shadow-black/20 lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Local workbench</p>
            <h2 className="mt-2 font-heading text-3xl tracking-tight">Upload and analyze</h2>
          </div>
          <Badge variant="secondary">{healthSummary}</Badge>
        </div>
        <Separator className="my-6" />
        <Tabs defaultValue="single">
          <TabsList variant="line">
            <TabsTrigger value="single">
              <Film data-icon="inline-start" />
              Single cut
            </TabsTrigger>
            <TabsTrigger value="compare">
              <GitCompareArrows data-icon="inline-start" />
              A/B compare
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-6">
            <UploadCard
              title="Single video analysis"
              description="Upload one MP4, trigger TRIBE analysis, then inspect the timeline workspace."
              state={single}
              onFileChange={(file) => setSingle({ file, status: "idle" })}
            />
            <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                The backend will validate duration, generate a thumbnail, and queue local inference.
              </p>
              <Button onClick={handleSingle} disabled={disabledSingle}>
                {single.status === "idle" ? (
                  <>
                    <Upload data-icon="inline-start" />
                    Analyze single cut
                  </>
                ) : (
                  <>
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                    {single.status === "uploading" ? "Uploading" : "Queuing analysis"}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="compare" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <UploadCard
                title="Version A"
                description="First cut or opening option."
                state={compareA}
                onFileChange={(file) => setCompareA({ file, status: "idle" })}
              />
              <UploadCard
                title="Version B"
                description="Second cut for A/B comparison."
                state={compareB}
                onFileChange={(file) => setCompareB({ file, status: "idle" })}
              />
            </div>
            <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Each upload is analyzed independently, then the compare summary is generated without rerunning TRIBE.
              </p>
              <Button onClick={handleCompare} disabled={disabledCompare}>
                {compareA.status === "idle" && compareB.status === "idle" ? (
                  <>
                    <GitCompareArrows data-icon="inline-start" />
                    Analyze both cuts
                  </>
                ) : (
                  <>
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                    {compareA.status === "uploading" ? "Uploading cuts" : "Queuing compare"}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {actionError ? (
          <p className="mt-4 text-sm text-destructive">{actionError}</p>
        ) : null}

        <Separator className="my-6" />
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>No bundled demo clip.</span>
          <Link href="/runbook" className="text-primary hover:text-primary/80">
            Prepare a sample clip
          </Link>
          <span>•</span>
          <a
            href="https://huggingface.co/facebook/tribev2"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary/80"
          >
            Model card
          </a>
        </div>
      </div>
    </section>
  );
}

function UploadCard({
  title,
  description,
  state,
  onFileChange,
}: {
  title: string;
  description: string;
  state: FileState;
  onFileChange: (file: File | null) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-background/40 p-5">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <label className="mt-5 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.4rem] border border-dashed border-border bg-background/50 px-6 py-8 text-center transition-colors hover:border-primary/60">
        <Upload className="size-5 text-primary" />
        <span className="font-medium">
          {state.file ? state.file.name : "Select an MP4"}
        </span>
        <span className="text-sm text-muted-foreground">
          {state.file
            ? `${formatBytes(state.file.size)} • ${state.file.type || "video/mp4"}`
            : "Up to 60 seconds for the MVP"}
        </span>
        <input
          className="sr-only"
          type="file"
          accept="video/mp4"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </label>
      {state.file ? (
        <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{state.file.name}</p>
          <p className="mt-1">{formatBytes(state.file.size)} • Analyze after upload</p>
        </div>
      ) : null}
    </div>
  );
}
