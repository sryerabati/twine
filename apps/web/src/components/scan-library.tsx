"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { SavedScanCards } from "@/components/scan-cards";
import type { SavedScanSummary } from "@/lib/contracts";

export function ScanLibrary() {
  const deleteScan = useMutation("scans:deleteMine" as never);
  const scans = useQuery("scans:listMine" as never, {}) as SavedScanSummary[] | undefined;
  const [deletingScanId, setDeletingScanId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const resolvedScans = scans ?? [];
  const sortedScans = resolvedScans
    .slice()
    .sort((left, right) => right.createdAt - left.createdAt);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeekScans = sortedScans.filter((scan) => scan.createdAt >= sevenDaysAgo);
  const earlierScans = sortedScans.filter((scan) => scan.createdAt < sevenDaysAgo);
  const shouldGroup = sortedScans.length > 6;

  async function handleDeleteScan(scanId: string) {
    setDeletingScanId(scanId);
    setDeleteError(null);
    try {
      await deleteScan({ scanId } as never);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete scan.";
      setDeleteError(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setDeletingScanId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <span className="sticker">Library</span>
        <h1 className="font-cartoon text-[1.8rem] font-black text-foreground">
          {resolvedScans.length} saved scan{resolvedScans.length === 1 ? "" : "s"}
        </h1>
        <p className="text-sm text-muted-foreground">Sorted by most recent first</p>
      </section>

      {scans === undefined ? (
        <SavedScanCards
          scans={[]}
          loading
          emptyTitle="Your library is empty"
          emptyBody="Create a scan from the dashboard to start building a reusable history."
          onDeleteScan={handleDeleteScan}
          deletingScanId={deletingScanId}
          deleteError={deleteError}
        />
      ) : shouldGroup ? (
        <div className="space-y-8">
          {thisWeekScans.length ? (
            <section className="space-y-4">
              <h3 className="sticker sticker-green w-fit">This week</h3>
              <SavedScanCards
                scans={thisWeekScans}
                emptyTitle="Your library is empty"
                emptyBody="Create a scan from the dashboard to start building a reusable history."
                onDeleteScan={handleDeleteScan}
                deletingScanId={deletingScanId}
                deleteError={deleteError}
              />
            </section>
          ) : null}

          {earlierScans.length ? (
            <section className="space-y-4">
              <h3 className="sticker sticker-green w-fit">Earlier</h3>
              <SavedScanCards
                scans={earlierScans}
                emptyTitle="Your library is empty"
                emptyBody="Create a scan from the dashboard to start building a reusable history."
                onDeleteScan={handleDeleteScan}
                deletingScanId={deletingScanId}
                deleteError={deleteError}
              />
            </section>
          ) : null}
        </div>
      ) : (
        <SavedScanCards
          scans={sortedScans}
          emptyTitle="Your library is empty"
          emptyBody="Create a scan from the dashboard to start building a reusable history."
          onDeleteScan={handleDeleteScan}
          deletingScanId={deletingScanId}
          deleteError={deleteError}
        />
      )}
    </div>
  );
}
