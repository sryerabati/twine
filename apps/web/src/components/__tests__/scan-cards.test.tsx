import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SavedScanCards } from "@/components/scan-cards";
import type { SavedScanSummary } from "@/lib/contracts";

const baseScan: Omit<
  SavedScanSummary,
  "_id" | "filename" | "secondaryFilename" | "scanType"
> = {
  status: "completed",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  title: null,
  uploadId: "upload-1",
  secondaryUploadId: null,
  localUploadId: null,
  localAnalysisId: null,
  secondaryLocalAnalysisId: null,
  compareResult: null,
  overviewRecommendation: "Ship the strongest cut.",
  hookScore: 82,
  pacingScore: 77,
  retentionEstimate: 74,
  viralPotential: 69,
  deadspaceSeconds: 12,
  trimmedDurationSec: null,
  analysisUrl: null,
  selectedCutIds: [],
  latestExportUrl: null,
  lastExportedAt: null,
  errorMessage: null,
};

describe("SavedScanCards", () => {
  it("renders compare scans as a single saved item with compare routing", () => {
    const compareScan: SavedScanSummary = {
      ...baseScan,
      _id: "scan-compare-1",
      scanType: "compare",
      filename: "cut-a.mp4",
      secondaryFilename: "cut-b.mp4",
    };

    render(<SavedScanCards scans={[compareScan]} title="Saved scans" />);

    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByText("cut-a.mp4 · cut-b.mp4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open compare/i })).toHaveAttribute(
      "href",
      "/app/compare/scan-compare-1",
    );
  });

  it("renders single scans with the scan route", () => {
    const singleScan: SavedScanSummary = {
      ...baseScan,
      _id: "scan-single-1",
      filename: "clip.mp4",
      secondaryFilename: null,
    };

    const { container } = render(<SavedScanCards scans={[singleScan]} title="Saved scans" />);

    expect(screen.getByText("Scan")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open scan/i })).toHaveAttribute(
      "href",
      "/app/scans/scan-single-1",
    );
    expect(container.querySelectorAll(".surface-soft")).toHaveLength(0);
  });

  it("keeps long filenames wrappable inside the card layout", () => {
    const longFilenameScan: SavedScanSummary = {
      ...baseScan,
      _id: "scan-single-2",
      filename: "snaptik_7623937651409784095_v3.mp4snaptik_7623937651409784095_v3.mp4",
      secondaryFilename: null,
    };

    render(<SavedScanCards scans={[longFilenameScan]} title="Saved scans" />);

    const heading = screen.getByRole("heading", {
      name: /snaptik_7623937651409784095_v3\.mp4snaptik_7623937651409784095_v3\.mp4/i,
    });
    const article = heading.closest("article");

    expect(heading.className).toContain("[overflow-wrap:anywhere]");
    expect(article?.className).toContain("min-w-0");
    expect(article?.className).toContain("h-full");
  });

  it("uses a compact title and video preview when media is available", () => {
    const scanWithPreview: SavedScanSummary = {
      ...baseScan,
      _id: "scan-single-3",
      filename: "snaptik_7623937651409784095_v3.mp4",
      secondaryFilename: null,
      analysisUrl: "/videos/source.mp4",
      latestExportUrl: "/videos/export.mp4",
      lastExportedAt: Date.now(),
      selectedCutIds: ["cut-1", "cut-2"],
    };

    render(<SavedScanCards scans={[scanWithPreview]} title="Saved scans" />);

    const heading = screen.getByRole("heading", { name: /snaptik_7623937651409784095_v3\.mp4/i });
    expect(heading.className).toContain("line-clamp-2");
    expect(heading.className).toContain("text-lg");

    const preview = screen.getByLabelText(/scan preview for snaptik_7623937651409784095_v3\.mp4/i);
    expect(preview).toHaveAttribute("src", "/videos/export.mp4");
    expect(screen.queryByText(/ship the strongest cut\./i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /latest export/i })).not.toBeInTheDocument();
  });

  it("renders flowing skeleton cards while scans are loading", () => {
    const { container } = render(
      <SavedScanCards scans={[]} loading title="Saved scans" />,
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(5);
  });
});
