import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScanDetailClient } from "@/components/scan-detail-client";

const { useQuery, useMutation, fetchAnalysisByUpload } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  fetchAnalysisByUpload: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: (...args: unknown[]) => useMutation(...args),
}));

vi.mock("@/lib/api", () => ({
  fetchAnalysisByUpload,
}));

vi.mock("@/components/analysis-view", () => ({
  AnalysisView: ({ analysisId }: { analysisId: string }) => (
    <div>Recovered analysis {analysisId}</div>
  ),
}));

describe("ScanDetailClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutation.mockReturnValue(vi.fn());
  });

  it("recovers a completed local analysis when Convex missed the local analysis id", async () => {
    useQuery.mockReturnValue({
      _id: "scan_123",
      uploadId: "upload_123",
      localUploadId: "local_upload_123",
      status: "queued",
      localAnalysisId: null,
      viralPotential: null,
      hookScore: null,
      pacingScore: null,
      retentionEstimate: null,
      deadspaceSeconds: null,
      trimmedDurationSec: null,
      analysisUrl: null,
      overviewRecommendation: null,
      selectedCutIds: [],
      latestExportUrl: null,
      lastExportedAt: null,
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      filename: "clip.mp4",
    });

    fetchAnalysisByUpload.mockResolvedValue({
      analysisId: "analysis_123",
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      payload: null,
    });

    render(<ScanDetailClient scanId="scan_123" />);

    await waitFor(() => {
      expect(screen.getByText(/Recovered analysis analysis_123/i)).toBeInTheDocument();
    });
    expect(fetchAnalysisByUpload).toHaveBeenCalledWith("local_upload_123");
  });

  it("renders a skeleton workspace while the saved scan is loading", () => {
    useQuery.mockReturnValue(undefined);
    const { container } = render(<ScanDetailClient scanId="scan_123" />);

    expect(screen.getByRole("heading", { name: /Loading scan workspace/i })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3);
  });
});
