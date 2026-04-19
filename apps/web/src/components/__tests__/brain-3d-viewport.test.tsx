import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Brain3DViewport } from "@/components/brain-3d-viewport";
import type { BrainResponsePoint } from "@/lib/contracts";

describe("Brain3DViewport", () => {
  it("renders named lobe labels in the non-WebGL fallback", () => {
    render(<Brain3DViewport point={null} mode="hero" />);

    const viewport = screen.getByTestId("brain-viewport");
    expect(viewport).toBeInTheDocument();
    expect(viewport.className).toContain("bg-transparent");
    expect(screen.getAllByTestId("brain-dot").length).toBeGreaterThan(850);
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

  it("renders fallback dot positions with hydration-safe precision", () => {
    render(<Brain3DViewport point={null} mode="hero" />);

    const firstDot = screen.getAllByTestId("brain-dot")[0];
    expect(firstDot).toBeDefined();
    expect(firstDot?.getAttribute("style")).not.toMatch(/\d+\.\d{4,}%/);
  });

  it("makes highly activated regions visibly brighter than low-activation regions", () => {
    const lowFrontalPoint = buildPointForRegionProfile({
      frontal: 0.12,
      parietal: 0.12,
      temporal: 0.12,
      occipital: 0.12,
    });
    const highFrontalPoint = buildPointForRegionProfile({
      frontal: 0.95,
      parietal: 0.12,
      temporal: 0.12,
      occipital: 0.12,
    });

    render(<Brain3DViewport point={lowFrontalPoint} />);
    const lowBrightness = readDotBrightnessNear(22, 24);

    cleanup();

    render(<Brain3DViewport point={highFrontalPoint} />);
    const highBrightness = readDotBrightnessNear(22, 24);

    expect(highBrightness - lowBrightness).toBeGreaterThan(35);
  });
});

function buildPointForRegionProfile(levels: Record<"frontal" | "parietal" | "temporal" | "occipital", number>): BrainResponsePoint {
  return {
    stimulusTimeSec: 1.6,
    segmentStartSec: 1.6,
    segmentDurationSec: 1.6,
    globalActivation: (levels.frontal + levels.parietal + levels.temporal + levels.occipital) / 4,
    leftHemisphereActivation: (levels.frontal + levels.parietal + levels.temporal + levels.occipital) / 4,
    rightHemisphereActivation: (levels.frontal + levels.parietal + levels.temporal + levels.occipital) / 4,
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
        ...Array.from({ length: 16 }, () => levels.frontal),
        ...Array.from({ length: 16 }, () => levels.parietal),
        ...Array.from({ length: 16 }, () => levels.temporal),
        ...Array.from({ length: 16 }, () => levels.occipital),
      ],
      right: [
        ...Array.from({ length: 16 }, () => levels.frontal),
        ...Array.from({ length: 16 }, () => levels.parietal),
        ...Array.from({ length: 16 }, () => levels.temporal),
        ...Array.from({ length: 16 }, () => levels.occipital),
      ],
    },
  };
}

function readDotBrightnessNear(targetLeft: number, targetTop: number) {
  const dots = screen.getAllByTestId("brain-dot");
  const closestDot = dots
    .map((dot) => ({
      dot,
      left: Number.parseFloat(dot.style.left),
      top: Number.parseFloat(dot.style.top),
    }))
    .sort((left, right) => {
      const leftDistance = Math.hypot(left.left - targetLeft, left.top - targetTop);
      const rightDistance = Math.hypot(right.left - targetLeft, right.top - targetTop);
      return leftDistance - rightDistance;
    })[0];

  const rgb = closestDot?.dot.style.backgroundColor.match(/\d+/g)?.map((value) => Number.parseInt(value, 10));

  expect(rgb).toBeDefined();

  return Math.round(((rgb?.[0] ?? 0) + (rgb?.[1] ?? 0) + (rgb?.[2] ?? 0)) / 3);
}
