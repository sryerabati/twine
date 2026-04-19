import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompareScanDetailClient } from "@/components/compare-scan-detail-client";

const { useQuery, useMutation, fetchAnalysis, compareAnalyses } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  fetchAnalysis: vi.fn(),
  compareAnalyses: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: (...args: unknown[]) => useMutation(...args),
}));

vi.mock("@/lib/api", () => ({
  fetchAnalysis,
  compareAnalyses,
}));

vi.mock("@/components/compare-view", () => ({
  CompareView: ({
    compare,
    title,
    primaryLabel,
    secondaryLabel,
  }: {
    compare: { recommendation: string; winner: string };
    title?: string;
    primaryLabel?: string | null;
    secondaryLabel?: string | null;
  }) => (
    <div>
      <div>{title ?? "Untitled compare"}</div>
      <div>{primaryLabel}</div>
      <div>{secondaryLabel}</div>
      <div>{compare.winner}</div>
      <div>{compare.recommendation}</div>
    </div>
  ),
}));

describe("CompareScanDetailClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutation.mockReturnValue(vi.fn().mockResolvedValue("scan_compare_1"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a saved compare result immediately when Convex already has it", async () => {
    useQuery.mockReturnValue({
      _id: "scan_compare_1",
      scanType: "compare",
      title: "Hook compare",
      filename: "hook-a.mp4",
      secondaryFilename: "hook-b.mp4",
      status: "completed",
      localAnalysisId: "analysis_a",
      secondaryLocalAnalysisId: "analysis_b",
      compareResult: {
        winner: "A",
        winnerReason: "A lands the opening better.",
        recommendation: "Ship A.",
        summary: ["A wins the open."],
        slices: [{ label: "Opening", winner: "A", aScore: 91, bScore: 76 }],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    render(<CompareScanDetailClient scanId="scan_compare_1" />);

    expect(await screen.findByText(/Hook compare/i)).toBeInTheDocument();
    expect(screen.getByText(/Ship A./i)).toBeInTheDocument();
    expect(fetchAnalysis).not.toHaveBeenCalled();
    expect(compareAnalyses).not.toHaveBeenCalled();
  });

  it("polls analyses, persists the compare result, and then renders the workspace", async () => {
    vi.useFakeTimers();
    const saveCompareResult = vi.fn().mockResolvedValue("scan_compare_1");
    useMutation.mockReturnValue(saveCompareResult);
    useQuery.mockReturnValue({
      _id: "scan_compare_1",
      scanType: "compare",
      title: "Hook compare",
      filename: "hook-a.mp4",
      secondaryFilename: "hook-b.mp4",
      status: "running",
      localAnalysisId: "analysis_a",
      secondaryLocalAnalysisId: "analysis_b",
      compareResult: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    fetchAnalysis
      .mockResolvedValueOnce({
        analysisId: "analysis_a",
        status: "running",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      })
      .mockResolvedValueOnce({
        analysisId: "analysis_b",
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      })
      .mockResolvedValueOnce({
        analysisId: "analysis_a",
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      })
      .mockResolvedValueOnce({
        analysisId: "analysis_b",
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      });
    compareAnalyses.mockResolvedValue({
      analysisIdA: "analysis_a",
      analysisIdB: "analysis_b",
      winner: "B",
      winnerReason: "B is more stable through the first beat.",
      recommendation: "Ship B.",
      summary: ["B holds attention longer."],
      slices: [{ label: "Opening", winner: "B", aScore: 75, bScore: 88 }],
    });

    render(<CompareScanDetailClient scanId="scan_compare_1" pollIntervalMs={2500} />);

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchAnalysis).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2500);
    await Promise.resolve();
    await Promise.resolve();

    expect(compareAnalyses).toHaveBeenCalledWith("analysis_a", "analysis_b");
    expect(saveCompareResult).toHaveBeenCalledWith({
      scanId: "scan_compare_1",
      winner: "B",
      winnerReason: "B is more stable through the first beat.",
      recommendation: "Ship B.",
      summary: ["B holds attention longer."],
      slices: [{ label: "Opening", winner: "B", aScore: 75, bScore: 88 }],
    });
    expect(screen.getByText(/Ship B./i)).toBeInTheDocument();
  });

  it("renders a skeleton workspace while the compare scan record is loading", () => {
    useQuery.mockReturnValue(undefined);
    const { container } = render(<CompareScanDetailClient scanId="scan_compare_1" />);

    expect(screen.getByRole("heading", { name: /Loading compare workspace/i })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3);
  });
});
