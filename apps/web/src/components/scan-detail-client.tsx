"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileWarning, LoaderCircle } from "lucide-react";

import { AnalysisView } from "@/components/analysis-view";
import { ScanSummaryHeader } from "@/components/scan-summary-header";
import type { SavedScanRecord } from "@/lib/contracts";
import { fetchAnalysisByUpload } from "@/lib/api";

export function ScanDetailClient({ scanId }: { scanId: string }) {
  const scan = useQuery("scans:getMineById" as never, { scanId } as never) as
    | SavedScanRecord
    | null
    | undefined;
  const saveSelectedCuts = useMutation("scans:saveSelectedCuts" as never);
  const saveExportMetadata = useMutation("scans:saveExportMetadata" as never);

  if (scan === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-[2.5rem] border border-white/10 bg-slate-950/90 px-8 py-16 text-center text-slate-50 shadow-[0_36px_120px_rgba(15,23,42,0.35)]">
        <LoaderCircle className="size-8 animate-spin text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight text-white">Loading scan workspace</h1>
        <p className="max-w-xl text-sm text-slate-300">
          Fetching the saved scan record from Convex so the editor can restore its last known
          state.
        </p>
      </div>
    );
  }

  if (scan === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-[2.5rem] border border-white/10 bg-slate-950/90 px-8 py-16 text-center text-slate-50 shadow-[0_36px_120px_rgba(15,23,42,0.35)]">
        <FileWarning className="size-8 text-rose-300" />
        <h1 className="text-3xl font-semibold tracking-tight text-white">Scan not found</h1>
        <p className="max-w-xl text-sm text-slate-300">
          This scan either does not exist or is not owned by the active account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ScanSummaryHeader
        status={scan.status}
        title={scan.title ?? scan.filename}
        filename={scan.title ? scan.filename : null}
        recommendation={
          scan.overviewRecommendation ??
          "The saved scan is ready. Review the signal, then refine the cuts below."
        }
        hookScore={scan.hookScore}
        pacingScore={scan.pacingScore}
        retentionEstimate={scan.retentionEstimate}
        viralPotential={scan.viralPotential}
        createdAt={scan.createdAt}
        lastExportedAt={scan.lastExportedAt}
        latestExportUrl={scan.latestExportUrl}
      />

      {scan.localAnalysisId ? (
        <AnalysisView
          analysisId={scan.localAnalysisId}
          initialSelectedCutIds={scan.selectedCutIds}
          onPersistSelectedCuts={async (selectedCutIds) => {
            await saveSelectedCuts({ scanId, selectedCutIds } as never);
          }}
          onPersistExport={async (selectedCutIds, latestExportUrl) => {
            await saveExportMetadata({ scanId, selectedCutIds, latestExportUrl } as never);
          }}
        />
      ) : (
        <RecoveredScanAnalysis
          initialSelectedCutIds={scan.selectedCutIds}
          localUploadId={scan.localUploadId}
          scanId={scanId}
          onPersistExport={async (selectedCutIds, latestExportUrl) => {
            await saveExportMetadata({ scanId, selectedCutIds, latestExportUrl } as never);
          }}
          onPersistSelectedCuts={async (selectedCutIds) => {
            await saveSelectedCuts({ scanId, selectedCutIds } as never);
          }}
        />
      )}
    </div>
  );
}

function RecoveredScanAnalysis({
  scanId,
  localUploadId,
  initialSelectedCutIds,
  onPersistSelectedCuts,
  onPersistExport,
}: {
  scanId: string;
  localUploadId: string | null;
  initialSelectedCutIds: string[];
  onPersistSelectedCuts: (selectedCutIds: string[]) => Promise<void>;
  onPersistExport: (selectedCutIds: string[], latestExportUrl: string) => Promise<void>;
}) {
  const [recoveredAnalysisId, setRecoveredAnalysisId] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  useEffect(() => {
    if (!localUploadId) {
      return;
    }
    const uploadId = localUploadId;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function recover() {
      try {
        const response = await fetchAnalysisByUpload(uploadId);
        if (!active) {
          return;
        }
        setRecoveredAnalysisId(response.analysisId);
        setRecoveryError(null);
        return;
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Recovery lookup failed.";
        if (!/no completed analysis found/i.test(message)) {
          setRecoveryError(message);
        }
      }

      timer = setTimeout(recover, 2500);
    }

    void recover();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [localUploadId, scanId]);

  if (recoveredAnalysisId) {
    return (
      <AnalysisView
        analysisId={recoveredAnalysisId}
        initialSelectedCutIds={initialSelectedCutIds}
        onPersistSelectedCuts={onPersistSelectedCuts}
        onPersistExport={onPersistExport}
      />
    );
  }

  return (
    <div className="rounded-[2.5rem] border border-white/10 bg-slate-950/90 p-8 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
      <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
        Analysis pending
      </div>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">
        Analysis is still attaching.
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
        The saved scan exists, but the completed Python payload has not synced yet. This view keeps
        checking the local upload record until the analysis appears.
      </p>
      {recoveryError ? (
        <p className="mt-4 text-sm text-rose-300">{recoveryError}</p>
      ) : null}
    </div>
  );
}
