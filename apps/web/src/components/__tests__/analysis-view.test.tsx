import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisView } from "@/components/analysis-view";

vi.mock("@/lib/api", () => ({
  fetchAnalysis: vi.fn(),
}));

describe("AnalysisView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      .mockResolvedValueOnce({
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
          deadspaceCuts: [],
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
            rawPredictionsUrl: "/storage/a.npy",
            processedJsonUrl: "/storage/a.json",
            cutListJsonUrl: "/storage/cuts.json",
            eventsCsvUrl: "/storage/events.csv",
            segmentsJsonUrl: "/storage/segments.json",
          },
          diagnostics: {
            device: "cpu",
            modelRepo: "facebook/tribev2",
            modelCommit: "72399081ed3f1040c4d996cefb2864a4c46f5b8e",
            transcriptWordCount: 12,
            sceneChangeCount: 2,
            deadspaceSeconds: 0,
            warnings: [],
          },
        },
      });

    render(<AnalysisView analysisId="analysis-1" pollIntervalMs={5} />);

    expect(await screen.findByText(/Processing analysis/i)).toBeInTheDocument();
    expect(await screen.findByText(/Activation timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Strong open/i)).toBeInTheDocument();
  });

  it("renders actionable failed-analysis text", async () => {
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
    expect(await screen.findByText(/Hugging Face dependencies/i)).toBeInTheDocument();
  });
});
