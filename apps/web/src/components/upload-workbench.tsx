"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { ArrowUpRight, GitCompareArrows, LoaderCircle, Upload } from "lucide-react";

import { UploadDropzone } from "@/components/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchHealth, startAnalysis, uploadVideo } from "@/lib/api";
import type { HealthResponse } from "@/lib/contracts";

type UploadWorkbenchProps = {
  onSingleReady: (result: { scanId: string; analysisId: string }) => void;
  onCompareReady: (result: { compareScanId: string }) => void;
};

type FileState = {
  file: File | null;
  status: "idle" | "uploading" | "analyzing";
};

type UploadedAsset = {
  convexUploadId: string;
  uploadId: string;
};

const emptyFileState: FileState = { file: null, status: "idle" };

function normalizeFileStem(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim() || filename;
}

function buildCompareTitle(primaryFilename: string, secondaryFilename: string) {
  const primaryStem = normalizeFileStem(primaryFilename).slice(0, 18);
  const secondaryStem = normalizeFileStem(secondaryFilename).slice(0, 18);
  return `${primaryStem} vs ${secondaryStem}`;
}

export function UploadWorkbench({
  onSingleReady,
  onCompareReady,
}: UploadWorkbenchProps) {
  const createPendingUpload = useMutation("uploads:createPendingUpload" as never);
  const createPendingScan = useMutation("scans:createPendingScan" as never);
  const createPendingCompareScan = useMutation("scans:createPendingCompareScan" as never);
  const attachCompareAnalysisIds = useMutation("scans:attachCompareAnalysisIds" as never);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [mode, setMode] = useState<"single" | "compare">("single");
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

  const healthSummary = useMemo(() => {
    if (!health) {
      return "Checking";
    }
    if (health.blockers.length) {
      return `${health.blockers.length} blocker${health.blockers.length > 1 ? "s" : ""}`;
    }
    return `${health.analysisBackend === "gemini" ? "Remote" : "Local"} · ${health.modelStatus}`;
  }, [health]);

  const singleDisabled = !single.file || single.status !== "idle";
  const compareDisabled =
    !compareA.file ||
    !compareB.file ||
    compareA.status !== "idle" ||
    compareB.status !== "idle";

  async function prepareUpload(file: File): Promise<UploadedAsset> {
    const convexUploadId = (await createPendingUpload({
      filename: file.name,
      contentType: file.type || "video/mp4",
      sizeBytes: file.size,
    } as never)) as string;

    const uploaded = await uploadVideo(file, convexUploadId);
    return {
      convexUploadId,
      uploadId: uploaded.uploadId,
    };
  }

  async function handleSingle() {
    if (!single.file) {
      return;
    }

    setActionError(null);
    setSingle({ file: single.file, status: "uploading" });

    try {
      const asset = await prepareUpload(single.file);
      const scanId = (await createPendingScan({ uploadId: asset.convexUploadId } as never)) as string;
      const analysis = await startAnalysis(asset.uploadId, scanId);

      setSingle({ file: single.file, status: "analyzing" });
      startTransition(() => {
        onSingleReady({ scanId, analysisId: analysis.analysisId });
      });
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
      const [primaryAsset, secondaryAsset] = await Promise.all([
        prepareUpload(compareA.file),
        prepareUpload(compareB.file),
      ]);

      const compareScanId = (await createPendingCompareScan({
        primaryUploadId: primaryAsset.convexUploadId,
        secondaryUploadId: secondaryAsset.convexUploadId,
        title: buildCompareTitle(compareA.file.name, compareB.file.name),
      } as never)) as string;

      const [analysisA, analysisB] = await Promise.all([
        startAnalysis(primaryAsset.uploadId),
        startAnalysis(secondaryAsset.uploadId),
      ]);

      await attachCompareAnalysisIds({
        scanId: compareScanId,
        analysisIdA: analysisA.analysisId,
        analysisIdB: analysisB.analysisId,
      } as never);

      setCompareA({ file: compareA.file, status: "analyzing" });
      setCompareB({ file: compareB.file, status: "analyzing" });
      startTransition(() => {
        onCompareReady({ compareScanId });
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Compare flow failed.");
      setCompareA({ file: compareA.file, status: "idle" });
      setCompareB({ file: compareB.file, status: "idle" });
    }
  }

  return (
    <section className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-slate-950 p-6 text-slate-100 shadow-[0_32px_120px_rgba(2,6,23,0.45)] lg:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(244,114,182,0.08),transparent_32%)]" />
      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Badge
              variant="secondary"
              className="rounded-full border border-pink-300/20 bg-pink-500/15 text-pink-100"
            >
              Upload workspace
            </Badge>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-white">
              Drop a clip. Save a scan.
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Single upload is the default path. A/B test stays available, but out of the way.
            </p>
          </div>

          <Badge
            variant="secondary"
            className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-slate-200"
          >
            {healthSummary}
          </Badge>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "single" ? "default" : "outline"}
            onClick={() => setMode("single")}
          >
            Single upload
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "compare" ? "secondary" : "ghost"}
            onClick={() => setMode("compare")}
          >
            <GitCompareArrows data-icon="inline-start" />
            A/B test
          </Button>
        </div>

        {healthError ? (
          <p className="mt-3 text-sm text-rose-300">Health check failed: {healthError}</p>
        ) : null}

        <div className="mt-6">
          {mode === "single" ? (
            <UploadDropzone
              label="Single upload clip"
              description="Upload one clip to create a saved scan and launch analysis."
              file={single.file}
              status={single.status}
              onFileChange={(file) => setSingle({ file, status: "idle" })}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <UploadDropzone
                label="Primary clip"
                description="First version for the compare scan."
                file={compareA.file}
                status={compareA.status}
                onFileChange={(file) => setCompareA({ file, status: "idle" })}
              />
              <UploadDropzone
                label="Secondary clip"
                description="Second version for the compare scan."
                file={compareB.file}
                status={compareB.status}
                onFileChange={(file) => setCompareB({ file, status: "idle" })}
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm leading-6 text-slate-300">
            {mode === "single"
              ? "The upload row is created first, then analysis starts against that scan."
              : "Both files upload first, then one compare scan is persisted and linked to both analyses."}
          </p>

          {mode === "single" ? (
            <Button onClick={handleSingle} disabled={singleDisabled}>
              {single.status === "idle" ? (
                <>
                  <Upload data-icon="inline-start" />
                  Start scan
                </>
              ) : (
                <>
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  {single.status === "uploading" ? "Uploading" : "Queueing"}
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleCompare} disabled={compareDisabled}>
              {compareA.status === "idle" && compareB.status === "idle" ? (
                <>
                  <GitCompareArrows data-icon="inline-start" />
                  Start compare
                </>
              ) : (
                <>
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  {compareA.status === "uploading" ? "Uploading" : "Queueing"}
                </>
              )}
            </Button>
          )}
        </div>

        {actionError ? <p className="mt-4 text-sm text-rose-300">{actionError}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span>No bundled sample clip.</span>
          <Link href="/runbook" className="inline-flex items-center gap-1 text-pink-200 hover:text-pink-100">
            Prepare a test MP4
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
