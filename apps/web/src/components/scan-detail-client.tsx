"use client";

import { useMutation, useQuery } from "convex/react";
import { Download, FileWarning, LoaderCircle } from "lucide-react";

import { AnalysisView } from "@/components/analysis-view";
import { ScanStatusBadge } from "@/components/scan-cards";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { SavedScanRecord } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ScanDetailClient({ scanId }: { scanId: string }) {
  const scan = useQuery("scans:getMineById" as never, { scanId } as never) as
    | SavedScanRecord
    | null
    | undefined;
  const saveSelectedCuts = useMutation("scans:saveSelectedCuts" as never);
  const saveExportMetadata = useMutation("scans:saveExportMetadata" as never);

  if (scan === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-[2rem] border border-border/70 bg-white/90 px-8 py-16 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <LoaderCircle className="size-8 animate-spin text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight">Loading scan workspace</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Fetching the saved scan record from Convex so the editor can restore its last known state.
        </p>
      </div>
    );
  }

  if (scan === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-[2rem] border border-border/70 bg-white/90 px-8 py-16 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <FileWarning className="size-8 text-destructive" />
        <h1 className="text-3xl font-semibold tracking-tight">Scan not found</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          This scan either does not exist or is not owned by the active account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-border/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Saved scan</p>
            <h1 className="mt-3 text-5xl font-semibold tracking-tight">{scan.filename}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {scan.overviewRecommendation ??
                "This scan is still waiting on its completed payload. As soon as FastAPI attaches the local analysis ID, the full action board and cut editor will appear here."}
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
            <ScanStatusBadge status={scan.status} />
            <Badge variant="secondary">Created {formatDateTime(scan.createdAt)}</Badge>
            {scan.lastExportedAt ? (
              <Badge variant="secondary">Latest export {formatDateTime(scan.lastExportedAt)}</Badge>
            ) : null}
            {scan.latestExportUrl ? (
              <a
                href={scan.latestExportUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <Download data-icon="inline-start" />
                Open latest export
              </a>
            ) : null}
          </div>
        </div>
      </section>

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
        <div className="rounded-[2rem] border border-border/70 bg-white/88 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
          <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary">
            Analysis pending
          </Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            The durable scan record is live. The Python analysis is still attaching.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            The app created this scan row in Convex before handing work to FastAPI. Once the
            worker posts the local analysis ID back through the service bridge, the full editor and
            structured action board will hydrate automatically on this page.
          </p>
        </div>
      )}
    </div>
  );
}
