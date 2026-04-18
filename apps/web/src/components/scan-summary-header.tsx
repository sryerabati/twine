"use client";

import { Download } from "lucide-react";

import { ScanStatusBadge } from "@/components/scan-cards";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { SavedScanSummary } from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type ScanSummaryHeaderProps = {
  status: SavedScanSummary["status"];
  title: string;
  filename?: string | null;
  recommendation: string;
  hookScore: number | null;
  pacingScore: number | null;
  retentionEstimate: number | null;
  viralPotential: number | null;
  createdAt: number;
  lastExportedAt: number | null;
  latestExportUrl: string | null;
};

export function ScanSummaryHeader({
  status,
  title,
  filename,
  recommendation,
  hookScore,
  pacingScore,
  retentionEstimate,
  viralPotential,
  createdAt,
  lastExportedAt,
  latestExportUrl,
}: ScanSummaryHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-950/95 p-6 text-slate-50 shadow-[0_36px_120px_rgba(15,23,42,0.4)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,137,74,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(87,182,193,0.14),transparent_30%)]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Saved scan</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ScanStatusBadge status={status} />
            {filename ? (
              <Badge variant="secondary" className="bg-white/10 text-slate-200">
                {filename}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">{recommendation}</p>
        </div>

        <div className="w-full max-w-2xl rounded-[1.9rem] border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Key metrics</p>
            {latestExportUrl ? (
              <a
                href={latestExportUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-white/10 bg-white/5 text-slate-50 hover:bg-white/10 hover:text-white")}
              >
                <Download data-icon="inline-start" />
                Open latest export
              </a>
            ) : (
              <Badge variant="secondary" className="bg-white/10 text-slate-200">
                No export yet
              </Badge>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Hook" value={hookScore} />
            <Metric label="Pacing" value={pacingScore} />
            <Metric label="Retention" value={retentionEstimate} />
            <Metric label="Viral" value={viralPotential} />
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
            <span>Created {formatDateTime(createdAt)}</span>
            {lastExportedAt ? <span>Latest export {formatDateTime(lastExportedAt)}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value ?? "—"}</p>
    </div>
  );
}
