import type { SavedScanSummary } from "@/lib/contracts";

export function isCompareScan(scan: Pick<SavedScanSummary, "scanType">): boolean {
  return scan.scanType === "compare";
}

export function getScanHref(scan: Pick<SavedScanSummary, "_id" | "scanType">): string {
  return isCompareScan(scan) ? `/app/compare/${scan._id}` : `/app/scans/${scan._id}`;
}

export function normalizeScanTitle(title: string | null | undefined, filename: string): string {
  const normalizedTitle = title?.trim();
  return normalizedTitle ? normalizedTitle : filename;
}

export function getScanTitle(scan: Pick<SavedScanSummary, "title" | "filename">): string {
  return normalizeScanTitle(scan.title, scan.filename);
}
