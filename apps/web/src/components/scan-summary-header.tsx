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
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)] lg:items-start">
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

        <div className="w-full border-t border-border/70 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
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

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <MetaReadout label="Created" value={formatDateTime(createdAt)} />
            {lastExportedAt ? (
              <MetaReadout label="Latest export" value={formatDateTime(lastExportedAt)} />
            ) : (
              <MetaReadout label="Latest export" value="Not exported yet" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 border-t border-border/70 pt-6 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Hook" value={hookScore} />
        <Metric label="Pacing" value={pacingScore} />
        <Metric label="Retention" value={retentionEstimate} />
        <Metric label="Viral" value={viralPotential} />
      </div>
    </section>
  );
}

function MetaReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span aria-hidden="true" className="block h-px w-10 bg-border/80" />
      <p className="mt-3 text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <span aria-hidden="true" className="block h-px w-10 bg-border/80" />
      <p className="mt-3 text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value ?? "—"}</p>
    </div>
  );
}
