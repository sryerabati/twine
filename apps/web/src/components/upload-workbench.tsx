"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { GitCompareArrows, LoaderCircle, Scissors, Upload, Zap } from "lucide-react";

import { HealthBanner } from "@/components/health-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchHealth, startAnalysis, uploadVideo } from "@/lib/api";
import type { HealthResponse } from "@/lib/contracts";
import { formatBytes } from "@/lib/format";

type UploadWorkbenchProps = {
  onSingleReady: (result: { scanId: string; analysisId: string }) => void;
  onCompareReady: (result: {
    scanIdA: string;
    scanIdB: string;
    analysisIdA: string;
    analysisIdB: string;
  }) => void;
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
  const createPendingUpload = useMutation("uploads:createPendingUpload" as never);
  const createPendingScan = useMutation("scans:createPendingScan" as never);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [single, setSingle] = useState<FileState>(emptyFileState);
  const [compareA, setCompareA] = useState<FileState>(emptyFileState);
  const [compareB, setCompareB] = useState<FileState>(emptyFileState);
  const [actionError, setActionError] = useState<string | null>(null);

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
      return "Checking backend readiness";
    }
    if (health.blockers.length) {
      return `${health.blockers.length} blocker${health.blockers.length > 1 ? "s" : ""} detected`;
    }
    return `${health.analysisBackend === "gemini" ? "Remote" : "Local"} • ${health.modelStatus}`;
  }, [health]);

  async function createDurableScan(file: File) {
    const convexUploadId = (await createPendingUpload({
      filename: file.name,
      contentType: file.type || "video/mp4",
      sizeBytes: file.size,
    } as never)) as string;

    const upload = await uploadVideo(file, convexUploadId);
    const scanId = (await createPendingScan({ uploadId: convexUploadId } as never)) as string;
    const analysis = await startAnalysis(upload.uploadId, scanId);

    return {
      scanId,
      analysisId: analysis.analysisId,
    };
  }

  async function handleSingle() {
    if (!single.file) {
      return;
    }
    setActionError(null);
    setSingle({ file: single.file, status: "uploading" });
    try {
      const result = await createDurableScan(single.file);
      setSingle({ file: single.file, status: "analyzing" });
      startTransition(() => onSingleReady(result));
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
      const [scanA, scanB] = await Promise.all([
        createDurableScan(compareA.file),
        createDurableScan(compareB.file),
      ]);
      setCompareA({ file: compareA.file, status: "analyzing" });
      setCompareB({ file: compareB.file, status: "analyzing" });
      startTransition(() =>
        onCompareReady({
          scanIdA: scanA.scanId,
          scanIdB: scanB.scanId,
          analysisIdA: scanA.analysisId,
          analysisIdB: scanB.analysisId,
        }),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Compare flow failed.");
      setCompareA((current) => ({ ...current, status: "idle" }));
      setCompareB((current) => ({ ...current, status: "idle" }));
    }
  }

  return (
    <section className="rounded-[2rem] border border-border/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">New scan</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Upload and analyze</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Upload a clip, create a durable scan row in Convex, then let FastAPI generate the full
            action board, timeline segments, and cut plan.
          </p>
        </div>
        <Badge variant="secondary" className="rounded-full bg-accent/10 text-foreground">
          {healthSummary}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <WorkbenchFact icon={Zap} label="Action-first output" body="Keep, fix now, test next, and export plan are structured fields." />
        <WorkbenchFact icon={Scissors} label="Smarter trims" body="Deadspace stays selected by default; optional AI low-value cuts stay reviewable." />
        <WorkbenchFact icon={GitCompareArrows} label="Secondary compare" body="A/B compare still works, but scan history remains centered on single saved workspaces." />
      </div>

      <div className="mt-6">
        <HealthBanner health={health} />
        {healthError ? (
          <p className="mt-3 text-sm text-destructive">
            Could not load health status: {healthError}
          </p>
        ) : null}
      </div>

      <Separator className="my-6" />

      <Tabs defaultValue="single">
        <TabsList variant="line">
          <TabsTrigger value="single">
            <Upload data-icon="inline-start" />
            One saved scan
          </TabsTrigger>
          <TabsTrigger value="compare">
            <GitCompareArrows data-icon="inline-start" />
            Two-video compare
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-6">
          <UploadCard
            title="Single video analysis"
            description="Best for the durable SaaS flow. The upload gets a user-owned scan record, a saved selection state, and a reusable export history."
            state={single}
            onFileChange={(file) => setSingle({ file, status: "idle" })}
          />
          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              This creates the Convex upload row first, then starts FastAPI analysis with the linked scan ID.
            </p>
            <Button onClick={handleSingle} disabled={disabledSingle}>
              {single.status === "idle" ? (
                <>
                  <Upload data-icon="inline-start" />
                  Analyze video
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
              description="First cut or alternate opening."
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
              Each upload still creates its own saved scan record before the compare summary is generated.
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

      {actionError ? <p className="mt-4 text-sm text-destructive">{actionError}</p> : null}

      <Separator className="my-6" />
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>No bundled sample clip.</span>
        <Link href="/runbook" className="text-primary hover:text-primary/80">
          Prepare a test MP4
        </Link>
      </div>
    </section>
  );
}

function WorkbenchFact({
  icon: Icon,
  label,
  body,
}: {
  icon: typeof Upload;
  label: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="size-4 text-primary" />
        <p className="font-semibold">{label}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
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
    <div className="rounded-[1.5rem] border border-border/70 bg-background/50 p-5">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <label className="mt-5 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.4rem] border border-dashed border-border bg-white/80 px-6 py-8 text-center transition-colors hover:border-primary/60">
        <Upload className="size-5 text-primary" />
        <span className="font-medium">{state.file ? state.file.name : "Select an MP4"}</span>
        <span className="text-sm text-muted-foreground">
          {state.file
            ? `${formatBytes(state.file.size)} • ${state.file.type || "video/mp4"}`
            : "Up to 60 seconds for the current MVP"}
        </span>
        <input
          className="sr-only"
          type="file"
          accept="video/mp4"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </label>
      {state.file ? (
        <div className="mt-4 rounded-2xl border border-border/70 bg-white/75 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{state.file.name}</p>
          <p className="mt-1">{formatBytes(state.file.size)} • Durable scan will be created before analysis</p>
        </div>
      ) : null}
    </div>
  );
}
