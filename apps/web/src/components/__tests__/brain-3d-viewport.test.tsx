import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Brain3DViewport } from "@/components/brain-3d-viewport";
import type { BrainResponsePoint } from "@/lib/contracts";

describe("Brain3DViewport", () => {
  it("renders named lobe labels in the non-WebGL fallback", () => {
    render(<Brain3DViewport point={null} mode="hero" />);

    const viewport = screen.getByTestId("brain-viewport");
    expect(viewport).toBeInTheDocument();
    expect(viewport.className).toContain("bg-transparent");
    expect(screen.getAllByTestId("brain-dot").length).toBeGreaterThan(40);
    expect(screen.getAllByText("Frontal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Parietal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Temporal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Occipital").length).toBeGreaterThan(0);
  });

  it("uses the region heatmap values in the fallback labels and glows", () => {
    const point: BrainResponsePoint = {
      stimulusTimeSec: 1.6,
      segmentStartSec: 1.6,
      segmentDurationSec: 1.6,
      globalActivation: 0.61,
      leftHemisphereActivation: 0.58,
      rightHemisphereActivation: 0.64,
      rollingVariance: 0.16,
      activationDelta: 0.08,
      spikeScore: 0.42,
      dropScore: 0.12,
      audioEnergy: 0.54,
      motionScore: 0.38,
      transcriptDensity: 0.29,
      sceneChange: false,
      silenceOverlap: false,
      hemisphereHeatmap: {
        left: [
          ...Array.from({ length: 16 }, () => 0.85),
          ...Array.from({ length: 16 }, () => 0.45),
          ...Array.from({ length: 16 }, () => 0.15),
          ...Array.from({ length: 16 }, () => 0.55),
        ],
        right: [
          ...Array.from({ length: 16 }, () => 0.65),
          ...Array.from({ length: 16 }, () => 0.35),
          ...Array.from({ length: 16 }, () => 0.75),
          ...Array.from({ length: 16 }, () => 0.25),
        ],
      },
    };

    render(<Brain3DViewport point={point} />);

    const viewport = screen.getByTestId("brain-viewport");
    expect(viewport).toBeInTheDocument();
    expect(screen.getAllByText("Frontal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Occipital").length).toBeGreaterThan(0);
  });
});
