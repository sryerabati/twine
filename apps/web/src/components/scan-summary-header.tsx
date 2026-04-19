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
    <section className="surface relative overflow-hidden rounded-[2.5rem] p-6 text-foreground">
      <span aria-hidden="true" className="absolute right-6 top-6 size-4 rounded-full border-2 border-primary bg-primary shadow-[3px_3px_0_0_var(--color-primary)]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Saved scan</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ScanStatusBadge status={status} />
            {filename ? (
              <Badge variant="outline">
                {filename}
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{recommendation}</p>
        </div>

        <div className="surface-soft w-full max-w-2xl rounded-[1.9rem] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Key metrics</p>
            {latestExportUrl ? (
              <a
                href={latestExportUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Download data-icon="inline-start" />
                Open latest export
              </a>
            ) : (
              <Badge variant="outline">
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

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
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
    <div className="surface-soft rounded-[1.35rem] px-3 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value ?? "—"}</p>
    </div>
  );
}
