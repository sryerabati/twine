import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrainScanViewer } from "@/components/brain-scan-viewer";
import type { BrainResponsePoint } from "@/lib/contracts";

describe("BrainScanViewer", () => {
  it("renders a standby state when no brain-response points are available", () => {
    render(<BrainScanViewer points={[]} />);

    expect(screen.getByText("Standby")).toBeInTheDocument();
    expect(screen.getByTestId("brain-scan-layout").className).toContain("xl:grid-cols-[0.82fr_1.18fr]");
    expect(screen.getByTestId("brain-scan-info-column")).toBeInTheDocument();
    expect(screen.getByTestId("brain-scan-viewport-column")).toBeInTheDocument();
    expect(screen.getAllByText("Frontal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Parietal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Temporal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Occipital").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0%")).toHaveLength(4);
  });

  it("renders derived four-region percentages for a single point", () => {
    const point: BrainResponsePoint = {
      stimulusTimeSec: 3.2,
      segmentStartSec: 3.2,
      segmentDurationSec: 1.6,
      globalActivation: 0.62,
      leftHemisphereActivation: 0.58,
      rightHemisphereActivation: 0.66,
      rollingVariance: 0.12,
      activationDelta: 0.08,
      spikeScore: 0.48,
      dropScore: 0.1,
      audioEnergy: 0.51,
      motionScore: 0.36,
      transcriptDensity: 0.27,
      sceneChange: false,
      silenceOverlap: false,
      hemisphereHeatmap: {
        left: [
          ...Array.from({ length: 16 }, () => 0.9),
          ...Array.from({ length: 16 }, () => 0.5),
          ...Array.from({ length: 16 }, () => 0.2),
          ...Array.from({ length: 16 }, () => 0.7),
        ],
        right: [
          ...Array.from({ length: 16 }, () => 0.7),
          ...Array.from({ length: 16 }, () => 0.3),
          ...Array.from({ length: 16 }, () => 0.8),
          ...Array.from({ length: 16 }, () => 0.5),
        ],
      },
    };

    render(<BrainScanViewer points={[point]} />);

    expect(screen.getByText("3.2s focus")).toBeInTheDocument();
    expect(screen.getAllByTestId("brain-region-card")).toHaveLength(4);
    expect(screen.getByTestId("brain-scan-viewport-column").className).toContain("justify-center");
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("averages all scan points inside the active focus window", () => {
    const points: BrainResponsePoint[] = [
      buildPoint({
        stimulusTimeSec: 3,
        segmentStartSec: 2.4,
        segmentDurationSec: 1.6,
        buckets: [0.2, 0.4, 0.6, 0.8],
      }),
      buildPoint({
        stimulusTimeSec: 3.8,
        segmentStartSec: 3.2,
        segmentDurationSec: 1.6,
        buckets: [0.6, 0.8, 0.2, 0.4],
      }),
      buildPoint({
        stimulusTimeSec: 7.4,
        segmentStartSec: 6.8,
        segmentDurationSec: 1.6,
        buckets: [1, 1, 1, 1],
      }),
    ];

    render(<BrainScanViewer points={points} currentTimeSec={3.4} />);

    expect(screen.getByText("3.4s avg")).toBeInTheDocument();
    expect(screen.getAllByTestId("brain-region-card")).toHaveLength(4);
    expect(screen.getAllByText("40%")).toHaveLength(2);
    expect(screen.getAllByText("60%")).toHaveLength(2);
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });
});

function buildPoint({
  stimulusTimeSec,
  segmentStartSec,
  segmentDurationSec,
  buckets,
}: {
  stimulusTimeSec: number;
  segmentStartSec: number;
  segmentDurationSec: number;
  buckets: [number, number, number, number];
}): BrainResponsePoint {
  const heatmap = buckets.flatMap((value) => Array.from({ length: 16 }, () => value));

  return {
    stimulusTimeSec,
    segmentStartSec,
    segmentDurationSec,
    globalActivation: buckets[0],
    leftHemisphereActivation: buckets[1],
    rightHemisphereActivation: buckets[2],
    rollingVariance: buckets[3],
    activationDelta: 0.08,
    spikeScore: 0.48,
    dropScore: 0.1,
    audioEnergy: 0.51,
    motionScore: 0.36,
    transcriptDensity: 0.27,
    sceneChange: false,
    silenceOverlap: false,
    hemisphereHeatmap: {
      left: heatmap,
      right: heatmap,
    },
  };
}
