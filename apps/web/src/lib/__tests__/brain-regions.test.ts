import { describe, expect, it } from "vitest";

import {
  BRAIN_REGION_ORDER,
  deriveBrainRegionActivations,
} from "@/lib/brain-regions";

describe("brain-regions", () => {
  it("maps left and right heatmaps into ordered bilateral region activations", () => {
    const left = [
      ...Array.from({ length: 16 }, () => 1.2),
      ...Array.from({ length: 16 }, () => 0.8),
      ...Array.from({ length: 16 }, () => 0.4),
      ...Array.from({ length: 16 }, () => -0.2),
    ];
    const right = [
      ...Array.from({ length: 16 }, () => 0.6),
      ...Array.from({ length: 16 }, () => 0.2),
      ...Array.from({ length: 16 }, () => 1),
      ...Array.from({ length: 16 }, () => 0.4),
    ];

    const regions = deriveBrainRegionActivations({ left, right });

    expect(regions.map((region) => region.id)).toEqual(BRAIN_REGION_ORDER);
    expect(regions.map((region) => region.value)).toEqual([0.8, 0.5, 0.7, 0.2]);
    expect(regions.map((region) => region.left)).toEqual([1, 0.8, 0.4, 0]);
    expect(regions.map((region) => region.right)).toEqual([0.6, 0.2, 1, 0.4]);
  });

  it("pads short heatmaps and clamps invalid values into the supported range", () => {
    const regions = deriveBrainRegionActivations({
      left: [NaN, Infinity, -1, 0.5],
      right: [0.25],
    });

    expect(regions.map((region) => region.left)).toEqual([0.0313, 0, 0, 0]);
    expect(regions.map((region) => region.right)).toEqual([0.0156, 0, 0, 0]);
    expect(regions.map((region) => region.value)).toEqual([0.0235, 0, 0, 0]);
  });
});
