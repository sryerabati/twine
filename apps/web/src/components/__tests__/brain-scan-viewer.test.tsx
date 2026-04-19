import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrainScanViewer } from "@/components/brain-scan-viewer";
import type { BrainResponsePoint } from "@/lib/contracts";

describe("BrainScanViewer", () => {
  it("renders a standby state when no brain-response points are available", () => {
    render(<BrainScanViewer points={[]} />);

    expect(screen.getByText("Standby")).toBeInTheDocument();
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
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });
});
