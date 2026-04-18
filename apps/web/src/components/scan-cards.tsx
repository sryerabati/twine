"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, Download, GitCompareArrows, ScanEye, Sparkles } from "lucide-react";

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
            className={cn(
              buttonVariants({ variant: "outline" }),
              "rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white",
            )}
          >
            Open full library
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-56 rounded-[1.75rem] border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]"
            />
          ))}
        </div>
      ) : visibleScans.length ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {visibleScans.map((scan) => (
            <article
              key={scan._id}
              className="rounded-[1.75rem] border border-white/10 bg-card/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ScanTypeBadge scanType={scan.scanType} />
                    <ScanStatusBadge status={scan.status} />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-foreground">
                      {getScanTitle(scan)}
                    </h3>
                    {getScanSubtitle(scan) ? (
                      <p className="mt-1 text-sm text-muted-foreground">{getScanSubtitle(scan)}</p>
                    ) : null}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  {formatDateTime(scan.createdAt)}
                </span>
              </div>

              <p className="mt-4 min-h-14 text-sm leading-6 text-muted-foreground">
                {scan.compareResult?.recommendation ??
                  scan.overviewRecommendation ??
                  "Analysis is still syncing. Open the scan to follow the timeline and export plan."}
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <Metric label="Hook" value={scan.hookScore} />
                <Metric label="Pacing" value={scan.pacingScore} />
                <Metric label="Viral" value={scan.viralPotential} />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {scan.deadspaceSeconds !== null ? (
                  <Badge variant="secondary">Deadspace {formatSeconds(scan.deadspaceSeconds)}</Badge>
                ) : null}
                {scan.lastExportedAt ? (
                  <Badge variant="secondary" className="bg-accent/10 text-foreground">
                    <Download className="mr-1 size-3.5" />
                    Exported {formatDateTime(scan.lastExportedAt)}
                  </Badge>
                ) : null}
                {scan.selectedCutIds.length ? (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    <Sparkles className="mr-1 size-3.5" />
                    {scan.selectedCutIds.length} cuts saved
                  </Badge>
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={getScanHref(scan)}
                  className={cn(buttonVariants({ variant: "default" }), "rounded-full")}
                >
                  {isCompareScan(scan) ? "Open compare" : "Open scan"}
                </Link>
                {scan.latestExportUrl ? (
                  <a
                    href={scan.latestExportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white",
                    )}
                  >
                    Latest export
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[1.75rem] border border-dashed border-white/15 bg-white/5 px-8 py-12 text-center shadow-[0_18px_55px_rgba(0,0,0,0.2)]">
          <h3 className="text-2xl font-semibold tracking-tight">{emptyTitle}</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{emptyBody}</p>
        </div>
      )}
    </section>
  );
}

function ScanTypeBadge({ scanType }: { scanType: SavedScanSummary["scanType"] }) {
  const compare = isCompareScan({ scanType });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
        compare
          ? "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100"
          : "border-white/10 bg-white/5 text-white/70",
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
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
      : status === "failed"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
        : status === "running"
          ? "border-sky-400/25 bg-sky-400/10 text-sky-100"
          : "border-amber-400/25 bg-amber-400/10 text-amber-100";

  return (
    <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", tone)}>
      {copy}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        {value ?? "—"}
      </p>
    </div>
  );
}
