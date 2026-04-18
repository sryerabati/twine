import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompareView } from "@/components/compare-view";
import type { AnalysisResponse } from "@/lib/contracts";

vi.mock("@/lib/api", () => ({
  fetchAnalysis: vi.fn(),
  compareAnalyses: vi.fn(),
}));

describe("CompareView", () => {
  it("renders a persisted compare result without requiring analysis payloads", () => {
    render(
      <CompareView
        compare={{
          winner: "B",
          winnerReason: "Version B keeps attention through the first five seconds.",
          recommendation: "Ship B, then test A's opening against it.",
          summary: ["B holds the opening beat longer.", "A recovers in the ending."],
          slices: [
            { label: "Opening", winner: "B", aScore: 74, bScore: 82 },
            { label: "Middle", winner: "tie", aScore: 69, bScore: 69 },
          ],
        }}
        title="Spring promo compare"
        primaryLabel="spring-a.mp4"
        secondaryLabel="spring-b.mp4"
      />,
    );

    expect(screen.getByText(/Spring promo compare/i)).toBeInTheDocument();
    expect(screen.getByText(/^Version B$/i)).toBeInTheDocument();
    expect(screen.getByText(/Ship B, then test A's opening against it./i)).toBeInTheDocument();
    expect(screen.getByText(/spring-a.mp4/i)).toBeInTheDocument();
    expect(screen.getByText(/spring-b.mp4/i)).toBeInTheDocument();
    expect(screen.getByText(/B holds the opening beat longer./i)).toBeInTheDocument();
  });

  it("renders compare summary after both analyses complete", async () => {
    const { compareAnalyses, fetchAnalysis } = await import("@/lib/api");
    const completed: Omit<AnalysisResponse, "analysisId"> = {
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      payload: {
        analysisId: "analysis-a",
        video: {
          uploadId: "upload-a",
          filename: "clip-a.mp4",
          sourceUrl: "/storage/a.mp4",
          thumbnailUrl: "/storage/a.jpg",
          durationSec: 10,
          width: 1080,
          height: 1920,
          sizeBytes: 1024,
        },
        brainResponse: {
          meshInfo: {
            space: "fsaverage5",
            subject: "average",
            lagCompensationSec: 5,
            totalVertices: 128,
          },
          timeSeries: [
            {
              stimulusTimeSec: 0,
              segmentStartSec: 0,
              segmentDurationSec: 1,
              globalActivation: 0.7,
              leftHemisphereActivation: 0.7,
              rightHemisphereActivation: 0.65,
              rollingVariance: 0.2,
              activationDelta: 0.1,
              spikeScore: 0.6,
              dropScore: 0.1,
              audioEnergy: 0.5,
              motionScore: 0.5,
              transcriptDensity: 0.4,
              sceneChange: true,
              silenceOverlap: false,
              hemisphereHeatmap: {
                left: Array.from({ length: 64 }, () => 0.5),
                right: Array.from({ length: 64 }, () => 0.5),
              },
            },
          ],
        },
        markers: [],
        deadspaceCuts: [
          {
            id: "deadspace-1",
            type: "deadspace",
            start: 1,
            end: 2,
            reason: "Low-energy beat.",
            defaultSelected: true,
            recommendedAction: "Trim the deadspace.",
          },
        ],
        lowValueCuts: [],
        cutPlan: [
          {
            id: "deadspace-1",
            type: "deadspace",
            start: 1,
            end: 2,
            reason: "Low-energy beat.",
            defaultSelected: true,
            recommendedAction: "Trim the deadspace.",
          },
        ],
        actionBoard: {
          keep: [],
          fixNow: ["Trim the deadspace."],
          testNext: [],
          exportPlan: ["Ship the default deadspace trim."],
        },
        timelineSegments: [
          {
            id: "segment-1",
            type: "deadspace",
            label: "Deadspace cut",
            start: 1,
            end: 2,
            severity: "medium",
            reason: "Low-energy beat.",
            recommendedAction: "Trim the deadspace.",
            cutId: "deadspace-1",
          },
        ],
        exports: [],
        scores: {
          hookScore: 80,
          pacingScore: 70,
          retentionEstimate: 75,
          viralPotential: 71,
          confidence: "medium",
          helpingFactors: [],
          hurtingFactors: [],
        },
        summary: {
          strengths: [],
          weaknesses: [],
          overallRecommendation: "Keep it.",
        },
        artifacts: {
          rawPredictionsUrl: null,
          providerRawJsonUrl: "/storage/a-provider.json",
          processedJsonUrl: "/storage/a.json",
          cutListJsonUrl: "/storage/a-cuts.json",
          eventsCsvUrl: "/storage/a-events.csv",
          segmentsJsonUrl: "/storage/a-segments.json",
          trimmedVideoUrl: null,
        },
        diagnostics: {
          device: "remote",
          modelRepo: "facebook/tribev2",
          modelCommit: "72399081ed3f1040c4d996cefb2864a4c46f5b8e",
          transcriptWordCount: 1,
          sceneChangeCount: 1,
          deadspaceSeconds: 0,
          trimmedDurationSec: null,
          warnings: [],
        },
      },
    };

    vi.mocked(fetchAnalysis)
      .mockResolvedValueOnce({ analysisId: "analysis-a", ...completed })
      .mockResolvedValueOnce({
        analysisId: "analysis-b",
        ...completed,
        payload: completed.payload
          ? { ...completed.payload, analysisId: "analysis-b" }
          : null,
      });
    vi.mocked(compareAnalyses).mockResolvedValue({
      analysisIdA: "analysis-a",
      analysisIdB: "analysis-b",
      winner: "A",
      winnerReason: "Version A wins on the weighted heuristic stack.",
      recommendation: "Use A as the base cut.",
      summary: ["A viral potential: 71", "B viral potential: 68"],
      slices: [
        { label: "Opening", winner: "A", aScore: 80, bScore: 70 },
        { label: "Middle", winner: "tie", aScore: 62, bScore: 62 },
        { label: "Ending", winner: "B", aScore: 59, bScore: 66 },
      ],
    });

    render(
      <CompareView
        analysisIdA="analysis-a"
        analysisIdB="analysis-b"
        title="Legacy compare bridge"
        primaryLabel="clip-a.mp4"
        secondaryLabel="clip-b.mp4"
        legacy
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Legacy compare bridge/i)).toBeInTheDocument();
      expect(screen.getByText(/Open analysis A/i)).toBeInTheDocument();
      expect(screen.getByText(/^Version A$/i)).toBeInTheDocument();
      expect(screen.getByText(/Opening/i)).toBeInTheDocument();
      expect(screen.getByText(/Use A as the base cut/i)).toBeInTheDocument();
    });
  });
});
