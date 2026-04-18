"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";

import { SavedScanCards } from "@/components/scan-cards";
import { UploadWorkbench } from "@/components/upload-workbench";
import type { SavedScanSummary } from "@/lib/contracts";

export function DashboardHome() {
  const router = useRouter();
  const recentScans = useQuery("scans:listRecentMine" as never, {}) as
    | SavedScanSummary[]
    | undefined;

  return (
    <div className="space-y-8">
      <UploadWorkbench
        onSingleReady={({ scanId }) => {
          startTransition(() => {
            router.push(`/app/scans/${scanId}`);
          });
        }}
        onCompareReady={({ compareScanId }) => {
          startTransition(() => {
            router.push(`/app/compare/${compareScanId}`);
          });
        }}
      />

      <SavedScanCards
        scans={recentScans ?? []}
        loading={recentScans === undefined}
        title="Recent scans"
        description="Open a finished run or check an in-flight one."
      />
    </div>
  );
}
