import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisView } from "@/components/analysis-view";
import { ScanSummaryHeader } from "@/components/scan-summary-header";
import type { AnalysisResponse } from "@/lib/contracts";

vi.mock("@/lib/api", () => ({
  fetchAnalysis: vi.fn(),
  trimAnalysis: vi.fn(),
}));

const completedResponse: AnalysisResponse = {
  analysisId: "analysis-1",
  status: "completed",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  error: null,
  payload: {
    analysisId: "analysis-1",
    video: {
      uploadId: "upload-1",
      filename: "clip.mp4",
      sourceUrl: "/storage/uploads/upload-1/source.mp4",
      thumbnailUrl: "/storage/uploads/upload-1/thumbnail.jpg",
      durationSec: 12,
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
          globalActivation: 0.8,
          leftHemisphereActivation: 0.78,
          rightHemisphereActivation: 0.74,
          rollingVariance: 0.2,
          activationDelta: 0.3,
          spikeScore: 0.9,
          dropScore: 0.1,
          audioEnergy: 0.8,
          motionScore: 0.7,
          transcriptDensity: 0.4,
          sceneChange: true,
          silenceOverlap: false,
          hemisphereHeatmap: {
            left: Array.from({ length: 64 }, () => 0.5),
            right: Array.from({ length: 64 }, () => 0.4),
          },
        },
      ],
    },
    markers: [
      {
        t: 0,
        type: "strong_hook",
        severity: "high",
        explanation: "Strong start.",
        suggestion: "Keep it.",
      },
    ],
    deadspaceCuts: [
      {
        id: "deadspace-1",
        type: "deadspace",
        start: 2,
        end: 3,
        reason: "Quiet stretch.",
        defaultSelected: true,
        recommendedAction: "Cut the deadspace.",
      },
    ],
    lowValueCuts: [
      {
        id: "low-value-1",
        type: "low_value",
        start: 5,
        end: 6,
        reason: "Low-value setup.",
        defaultSelected: false,
        recommendedAction: "Optionally cut this setup beat.",
      },
    ],
    cutPlan: [
      {
        id: "deadspace-1",
        type: "deadspace",
        start: 2,
        end: 3,
        reason: "Quiet stretch.",
        defaultSelected: true,
        recommendedAction: "Cut the deadspace.",
      },
      {
        id: "low-value-1",
        type: "low_value",
        start: 5,
        end: 6,
        reason: "Low-value setup.",
        defaultSelected: false,
        recommendedAction: "Optionally cut this setup beat.",
      },
    ],
    actionBoard: {
      keep: ["Strong open"],
      fixNow: ["Trim the deadspace"],
      testNext: ["Test a tighter title"],
      exportPlan: ["Default export keeps deadspace cuts selected."],
    },
    timelineSegments: [
      {
        id: "segment-deadspace-1",
        type: "deadspace",
        label: "Deadspace cut",
        start: 2,
        end: 3,
        severity: "high",
        reason: "Quiet stretch.",
        recommendedAction: "Cut the deadspace.",
        cutId: "deadspace-1",
      },
    ],
    exports: [],
    scores: {
      hookScore: 81,
      pacingScore: 70,
      retentionEstimate: 75,
      viralPotential: 72,
      confidence: "medium",
      helpingFactors: ["Strong first-three-second hook"],
      hurtingFactors: ["No major drag signal"],
    },
    summary: {
      strengths: ["Strong open"],
      weaknesses: ["No major weakness"],
      overallRecommendation: "Keep the opening spike.",
    },
    artifacts: {
      rawPredictionsUrl: null,
      providerRawJsonUrl: "/storage/provider.json",
      processedJsonUrl: "/storage/a.json",
      cutListJsonUrl: "/storage/cuts.json",
      eventsCsvUrl: "/storage/events.csv",
      segmentsJsonUrl: "/storage/segments.json",
      trimmedVideoUrl: null,
    },
    diagnostics: {
      device: "remote",
      modelRepo: "facebook/tribev2",
      modelCommit: "72399081ed3f1040c4d996cefb2864a4c46f5b8e",
      transcriptWordCount: 12,
      sceneChangeCount: 2,
      deadspaceSeconds: 0,
      trimmedDurationSec: null,
      warnings: [],
    },
  },
};

describe("AnalysisView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces native video controls with a custom transport timeline", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    const user = userEvent.setup();
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("brain-viewport")).toBeInTheDocument();
    });

    const video = document.querySelector("video");
    const timeline = screen.getByTestId("recommendation-timeline");
    expect(video).not.toBeNull();
    expect(video).not.toHaveAttribute("controls");
    expect(within(timeline).queryByText("Deadspace cut")).not.toBeInTheDocument();

    const playButton = screen.getByRole("button", { name: /play video/i });
    const slider = screen.getByRole("slider", { name: /video timeline/i });
    expect(playButton.className).toContain("bg-primary");
    expect(screen.getByTestId("video-timeline-fill").className).toContain("bg-primary");
    expect(slider).toBeInTheDocument();

    await user.click(playButton);

    expect(playSpy).toHaveBeenCalled();
    playSpy.mockRestore();
  });

  it("renders a compact saved-scan header with status, metrics, and export access", () => {
    render(
      <ScanSummaryHeader
        createdAt={Date.now()}
        filename="clip.mp4"
        hookScore={81}
        lastExportedAt={Date.now()}
        latestExportUrl="/storage/export.mp4"
        recommendation="Keep the opening spike."
        pacingScore={70}
        retentionEstimate={75}
        status="completed"
        title="Clip review"
        viralPotential={72}
      />,
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clip review" })).toBeInTheDocument();
    expect(screen.getByText("Keep the opening spike.")).toBeInTheDocument();
    expect(screen.getByText("Hook")).toBeInTheDocument();
    expect(screen.getByText("Pacing")).toBeInTheDocument();
    expect(screen.getByText("Retention")).toBeInTheDocument();
    expect(screen.getByText("Viral")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open latest export/i })).toHaveAttribute(
      "href",
      "/storage/export.mp4",
    );
    expect(screen.getByText(/Created/i)).toBeInTheDocument();
  });

  it("polls until completed and renders the payload", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis)
      .mockResolvedValueOnce({
        analysisId: "analysis-1",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      })
      .mockResolvedValueOnce(completedResponse);

    render(<AnalysisView analysisId="analysis-1" pollIntervalMs={5} />);

    expect(await screen.findByText(/Processing analysis/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("brain-viewport")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /primary analysis/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /secondary details/i })).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Strong open/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Provider response JSON/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Raw predictions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/TRIBE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini/i)).not.toBeInTheDocument();
  });

  it("seeks the video from the custom timeline", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("brain-viewport")).toBeInTheDocument();
    });

    const slider = screen.getByRole("slider", { name: /video timeline/i });
    const video = document.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();

    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 240,
      height: 24,
      top: 0,
      left: 0,
      right: 240,
      bottom: 24,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(slider, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(video?.currentTime).toBeCloseTo(6, 1);
  });

  it("shows recommendation details above the rail and renders a frame strip", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    const user = userEvent.setup();

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("brain-viewport")).toBeInTheDocument();
    });

    const marker = screen.getByRole("button", {
      name: /deadspace cut recommendation/i,
    });

    expect(screen.getAllByTestId("timeline-frame").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("timeline-recommendation-panel")).not.toBeInTheDocument();

    await user.hover(marker);

    const panel = await screen.findByTestId("timeline-recommendation-panel");
    expect(within(panel).getByText("Quiet stretch.")).toBeInTheDocument();
    expect(within(panel).getByText("Cut the deadspace.")).toBeInTheDocument();
    expect(within(panel).getByText("Changes needed")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.unhover(marker);

    expect(screen.getByTestId("timeline-recommendation-panel")).toBeInTheDocument();

    await new Promise((resolve) => window.setTimeout(resolve, 160));
    expect(screen.getByTestId("timeline-recommendation-panel")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByTestId("timeline-recommendation-panel")).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  it("renders a provider-neutral failed-analysis message", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue({
      analysisId: "analysis-2",
      status: "failed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: "TRIBE v2 could not access its Hugging Face dependencies.",
      payload: null,
    });

    render(<AnalysisView analysisId="analysis-2" />);
    expect(await screen.findByText(/The backend returned an actionable error/i)).toBeInTheDocument();
    expect(screen.queryByText(/TRIBE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hugging Face/i)).not.toBeInTheDocument();
  });
});
