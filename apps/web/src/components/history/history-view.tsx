"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders the current user's scan history.
 *
 * Data source: `api.scans.listMine` — returns scans belonging to the logged-in
 * user, newest first, hydrated with filename. Convex enforces ownership inside
 * the query; if the user somehow bypasses auth their list is empty.
 *
 * Reactive: useQuery subscribes to updates, so the page re-renders as scans
 * progress through queued -> running -> completed.
 */
export function HistoryView() {
  const scans = useQuery(api.scans.listMine);

  if (scans === undefined) {
    return (
      <div className="mx-auto grid max-w-5xl gap-3 px-6 py-10 lg:px-10">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16 lg:px-10">
        <h1 className="font-heading text-4xl tracking-tight">Your scans</h1>
        <p className="mt-4 text-muted-foreground">
          You haven&apos;t run any scans yet. Head back to the{" "}
          <Link href="/" className="text-primary hover:text-primary/80">
            landing page
          </Link>{" "}
          to upload your first clip.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 lg:px-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Your activity
          </p>
          <h1 className="mt-1 font-heading text-4xl tracking-tight">Scans</h1>
        </div>
        <Link
          href="/"
          className="text-sm text-primary hover:text-primary/80"
        >
          New scan
        </Link>
      </div>

      <ol className="grid gap-3">
        {scans.map((scan) => (
          <li key={scan._id}>
            <ScanRow scan={scan} />
          </li>
        ))}
      </ol>
    </section>
  );
}

type ScanRowProps = {
  scan: {
    _id: string;
    status: "queued" | "running" | "completed" | "failed";
    localAnalysisId: string | null;
    viralPotential: number | null;
    hookScore: number | null;
    pacingScore: number | null;
    retentionEstimate: number | null;
    deadspaceSeconds: number | null;
    trimmedDurationSec: number | null;
    analysisUrl: string | null;
    errorMessage: string | null;
    createdAt: number;
    updatedAt: number;
    filename: string;
  };
};

function ScanRow({ scan }: ScanRowProps) {
  const statusVariant: "default" | "secondary" | "destructive" =
    scan.status === "completed"
      ? "default"
      : scan.status === "failed"
        ? "destructive"
        : "secondary";

  const createdLabel = new Date(scan.createdAt).toLocaleString();
  const isLinkable = scan.status === "completed" && !!scan.analysisUrl;

  const body = (
    <div className="surface flex flex-col gap-3 rounded-2xl border border-border/70 p-5 transition-colors hover:border-primary/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant} className="capitalize">
            {scan.status}
          </Badge>
          <p className="font-medium">{scan.filename}</p>
        </div>
        <p className="text-xs text-muted-foreground">{createdLabel}</p>
      </div>

      {scan.status === "completed" ? (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label="Viral" value={scan.viralPotential} />
          <Metric label="Hook" value={scan.hookScore} />
          <Metric label="Pacing" value={scan.pacingScore} />
          <Metric label="Retention" value={scan.retentionEstimate} />
        </dl>
      ) : null}

      {scan.status === "failed" && scan.errorMessage ? (
        <p className="text-sm text-destructive">{scan.errorMessage}</p>
      ) : null}
    </div>
  );

  if (isLinkable && scan.analysisUrl) {
    return (
      <Link href={scan.analysisUrl} className="block">
        {body}
      </Link>
    );
  }

  return body;
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
      <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium">
        {value === null ? "—" : value}
      </dd>
    </div>
  );
}
