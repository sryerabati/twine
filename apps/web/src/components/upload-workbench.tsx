"use client";

import { startTransition, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { GitCompareArrows, LoaderCircle, Upload } from "lucide-react";

import { UploadDropzone } from "@/components/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchHealth, startAnalysis, uploadVideo } from "@/lib/api";

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
  const [healthError, setHealthError] = useState<string | null>(null);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [single, setSingle] = useState<FileState>(emptyFileState);
  const [compareA, setCompareA] = useState<FileState>(emptyFileState);
  const [compareB, setCompareB] = useState<FileState>(emptyFileState);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then(() => undefined)
      .catch((error: Error) => {
        if (!cancelled) {
          setHealthError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      const analysis = await startAnalysis(asset.uploadId, {
        convexScanId: scanId,
      });

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
        startAnalysis(primaryAsset.uploadId, { syncToConvexScan: false }),
        startAnalysis(secondaryAsset.uploadId, { syncToConvexScan: false }),
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
    <section className="surface rounded-[2.4rem] p-6 text-foreground lg:p-8">
      <div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary">
              Upload workspace
            </Badge>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground">
              Drop a clip. Save a scan.
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Single upload is the default path. A/B test stays available, but out of the way.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "single" ? "secondary" : "ghost"}
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
          <p className="mt-3 text-sm text-destructive">Health check failed: {healthError}</p>
        ) : null}

        <div className="mt-6 border-t border-border/70 pt-6">
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

        <div className="mt-6 flex flex-col gap-4 border-t border-border/70 pt-5 lg:flex-row lg:items-end lg:justify-between">
          <div>{actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}</div>

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
      </div>
    </section>
  );
}
