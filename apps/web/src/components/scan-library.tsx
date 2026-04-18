"use client";

import { useQuery } from "convex/react";

import { SavedScanCards } from "@/components/scan-cards";
import type { SavedScanSummary } from "@/lib/contracts";

export function ScanLibrary() {
  const scans = useQuery("scans:listMine" as never, {}) as SavedScanSummary[] | undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/10 bg-card/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Scan library</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Saved scans and compare runs</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Reopen single scans or compare results from the same history.
        </p>
      </section>

      <SavedScanCards
        scans={scans ?? []}
        loading={scans === undefined}
        emptyTitle="Your library is empty"
        emptyBody="Create a scan from the dashboard to start building a reusable history."
      />
    </div>
  );
}
