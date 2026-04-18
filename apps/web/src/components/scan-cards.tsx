"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, Download, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { SavedScanSummary } from "@/lib/contracts";
import { formatDateTime, formatSeconds } from "@/lib/format";
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
  emptyBody = "Run your first upload and it will appear here with scores, selected cuts, and exports.",
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
          <Link href="/app/library" className={cn(buttonVariants({ variant: "outline" }))}>
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
              className="h-56 rounded-[1.8rem] border border-border/70 bg-white/75 shadow-[0_20px_70px_rgba(15,23,42,0.06)]"
            />
          ))}
        </div>
      ) : visibleScans.length ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {visibleScans.map((scan) => (
            <article
              key={scan._id}
              className="rounded-[1.8rem] border border-border/70 bg-white/88 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <ScanStatusBadge status={scan.status} />
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
                    {scan.filename}
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  {formatDateTime(scan.createdAt)}
                </span>
              </div>

              <p className="mt-4 min-h-14 text-sm leading-6 text-muted-foreground">
                {scan.overviewRecommendation ??
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
                <Link href={`/app/scans/${scan._id}`} className={cn(buttonVariants({ variant: "default" }))}>
                  Open scan
                </Link>
                {scan.latestExportUrl ? (
                  <a
                    href={scan.latestExportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    Latest export
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[1.9rem] border border-dashed border-border/80 bg-white/75 px-8 py-12 text-center shadow-[0_18px_55px_rgba(15,23,42,0.04)]">
          <h3 className="text-2xl font-semibold tracking-tight">{emptyTitle}</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{emptyBody}</p>
        </div>
      )}
    </section>
  );
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
      ? "bg-emerald-100 text-emerald-700"
      : status === "failed"
        ? "bg-rose-100 text-rose-700"
        : status === "running"
          ? "bg-sky-100 text-sky-700"
          : "bg-amber-100 text-amber-800";

  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", tone)}>{copy}</span>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[1.1rem] border border-border/70 bg-background/70 px-3 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        {value ?? "—"}
      </p>
    </div>
  );
}
