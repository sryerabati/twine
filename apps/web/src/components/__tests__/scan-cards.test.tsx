import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SavedScanCards } from "@/components/scan-cards";
import type { SavedScanSummary } from "@/lib/contracts";

const baseScan = {
  status: "completed",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  title: null,
  overviewRecommendation: "Ship the strongest cut.",
  hookScore: 82,
  pacingScore: 77,
  viralPotential: 69,
  deadspaceSeconds: 12,
  selectedCutIds: [],
  latestExportUrl: null,
  lastExportedAt: null,
  errorMessage: null,
} as const;

describe("SavedScanCards", () => {
  it("renders compare scans as a single saved item with compare routing", () => {
    const compareScan = {
      ...baseScan,
      _id: "scan-compare-1",
      scanType: "compare",
      filename: "cut-a.mp4",
      secondaryFilename: "cut-b.mp4",
    } as SavedScanSummary;

    render(<SavedScanCards scans={[compareScan]} title="Saved scans" />);

    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByText("cut-a.mp4 · cut-b.mp4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open compare/i })).toHaveAttribute(
      "href",
      "/app/compare/scan-compare-1",
    );
  });

  it("renders single scans with the scan route", () => {
    const singleScan = {
      ...baseScan,
      _id: "scan-single-1",
      filename: "clip.mp4",
      secondaryFilename: null,
    } as SavedScanSummary;

    render(<SavedScanCards scans={[singleScan]} title="Saved scans" />);

    expect(screen.getByText("Scan")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open scan/i })).toHaveAttribute(
      "href",
      "/app/scans/scan-single-1",
    );
  });
});
