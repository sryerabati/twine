"use client";

import { useQuery } from "convex/react";

import { SavedScanCards } from "@/components/scan-cards";
import type { SavedScanSummary } from "@/lib/contracts";

export function ScanLibrary() {
  const scans = useQuery("scans:listMine" as never, {}) as SavedScanSummary[] | undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-border/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Scan library</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight">Past scans and exports</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          This is the durable SaaS history layer. Scans are user-owned in Convex, so you can reopen
          completed analysis workspaces, keep selected trim plans, and jump back into the export flow.
        </p>
      </section>

      <SavedScanCards
        scans={scans ?? []}
        loading={scans === undefined}
        emptyTitle="Your library is empty"
        emptyBody="Create a scan from the dashboard to start building a reusable history of structured recommendations and exports."
      />
    </div>
  );
}
