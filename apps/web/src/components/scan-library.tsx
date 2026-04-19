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
      <SavedScanCards
        scans={scans ?? []}
        loading={scans === undefined}
        emptyTitle="Your library is empty"
        emptyBody="Create a scan from the dashboard to start building a reusable history."
        onDeleteScan={handleDeleteScan}
        deletingScanId={deletingScanId}
        deleteError={deleteError}
      />
    </div>
  );
}
