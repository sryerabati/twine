"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, GitCompareArrows, ScanEye, Sparkles } from "lucide-react";

import { SavedScanCardsSkeleton } from "@/components/loading-states";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { SavedScanSummary } from "@/lib/contracts";
import { formatDateTime, formatSeconds } from "@/lib/format";
import { getScanHref, getScanTitle, isCompareScan } from "@/lib/scan-presenter";
import { cn } from "@/lib/utils";

type SavedScanCardsProps = {
  scans: SavedScanSummary[];
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyBody?: string;
  loading?: boolean;
  limit?: number;
};

export function SavedScanCards({
  scans,
  title,
  description,
  emptyTitle = "No scans yet",
  emptyBody = "Run a scan and it will appear here with scores, exports, and compare history.",
  loading = false,
  limit,
}: SavedScanCardsProps) {
  const visibleScans = limit ? scans.slice(0, limit) : scans;

  return (
    <section className="space-y-5">
      {title ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Saved scans</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Link
            href="/app/library"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Open full library
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </div>
      ) : null}

      {loading ? (
        <SavedScanCardsSkeleton count={limit ?? 3} />
      ) : visibleScans.length ? (
        <div className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          {visibleScans.map((scan) => (
            <article
              key={scan._id}
              className="surface flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] p-5"
            >
              <ScanPreview scan={scan} />

              <div className="flex flex-wrap items-start gap-3">
                <div className="flex flex-wrap gap-2">
                  <ScanTypeBadge scanType={scan.scanType} />
                  <ScanStatusBadge status={scan.status} />
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground sm:ml-auto">
                  <Clock3 className="size-3.5" />
                  {formatDateTime(scan.createdAt)}
                </span>
              </div>

              <div className="mt-3 min-w-0">
                <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere]">
                  {getScanTitle(scan)}
                </h3>
                {getScanSubtitle(scan) ? (
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {getScanSubtitle(scan)}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-3">
                <Metric label="Hook" value={scan.hookScore} />
                <Metric label="Pacing" value={scan.pacingScore} />
                <Metric label="Viral" value={scan.viralPotential} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {scan.deadspaceSeconds !== null ? (
                  <Badge variant="secondary">Deadspace {formatSeconds(scan.deadspaceSeconds)}</Badge>
                ) : null}
                {scan.selectedCutIds.length ? (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    <Sparkles className="mr-1 size-3.5" />
                    {scan.selectedCutIds.length} cuts saved
                  </Badge>
                ) : null}
              </div>

              <div className="mt-auto flex flex-wrap gap-3 pt-6">
                <Link
                  href={getScanHref(scan)}
                  className={cn(buttonVariants({ variant: "default" }), "rounded-full")}
                >
                  {isCompareScan(scan) ? "Open compare" : "Open scan"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="surface rounded-[1.75rem] border-dashed px-8 py-12 text-center">
          <h3 className="text-2xl font-semibold tracking-tight">{emptyTitle}</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{emptyBody}</p>
        </div>
      )}
    </section>
  );
}

function ScanPreview({ scan }: { scan: SavedScanSummary }) {
  const previewUrl = scan.latestExportUrl ?? scan.analysisUrl;

  if (!previewUrl) {
    return (
      <div className="mb-4 flex aspect-video items-end overflow-hidden rounded-[1.25rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(58,173,104,0.22),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-4">
        <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
          {isCompareScan(scan) ? "Compare preview pending" : "Preview pending"}
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-[1.25rem] border border-border/70 bg-black/20">
      <video
        aria-label={`Scan preview for ${getScanTitle(scan)}`}
        className="aspect-video w-full object-cover"
        muted
        playsInline
        preload="metadata"
        src={previewUrl}
      />
    </div>
  );
}

function ScanTypeBadge({ scanType }: { scanType: SavedScanSummary["scanType"] }) {
  const compare = isCompareScan({ scanType });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
        compare
          ? "border-2 border-primary bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-primary)]"
          : "border-2 border-border bg-secondary text-secondary-foreground shadow-[2px_2px_0_0_var(--shadow-stamp)]",
      )}
    >
      {compare ? <GitCompareArrows className="size-3.5" /> : <ScanEye className="size-3.5" />}
      {compare ? "Compare" : "Scan"}
    </span>
  );
}

function getScanSubtitle(scan: SavedScanSummary) {
  if (isCompareScan(scan)) {
    return scan.secondaryFilename ? `${scan.filename} · ${scan.secondaryFilename}` : scan.filename;
  }

  return null;
}

export function ScanStatusBadge({ status }: { status: SavedScanSummary["status"] }) {
  const copy =
    status === "completed"
      ? "Completed"
      : status === "failed"
        ? "Failed"
        : status === "running"
          ? "Running"
          : "Queued";
  const tone =
    status === "completed"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-800"
      : status === "failed"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-700"
        : status === "running"
          ? "border-sky-400/25 bg-sky-400/10 text-sky-700"
          : "border-amber-400/25 bg-amber-400/10 text-amber-700";

  return (
    <span className={cn("inline-flex rounded-full border-2 px-3 py-1 text-xs font-medium shadow-[2px_2px_0_0_var(--shadow-stamp)]", tone)}>
      {copy}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <span aria-hidden="true" className="block h-px w-8 bg-border/80" />
      <p className="mt-3 text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        {value ?? "—"}
      </p>
    </div>
  );
}
