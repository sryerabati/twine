import type { HemisphereHeatmap } from "@/lib/contracts";

export type BrainRegionId = "frontal" | "parietal" | "temporal" | "occipital";

export type BrainRegionActivation = {
  id: BrainRegionId;
  label: string;
  left: number;
  right: number;
  value: number;
};

const REGION_SIZE = 16;
const HEATMAP_LENGTH = 64;

export const BRAIN_REGION_ORDER: BrainRegionId[] = [
  "frontal",
  "parietal",
  "temporal",
  "occipital",
];

export const BRAIN_REGION_LABELS: Record<BrainRegionId, string> = {
  frontal: "Frontal",
  parietal: "Parietal",
  temporal: "Temporal",
  occipital: "Occipital",
};

export function deriveBrainRegionActivations(
  heatmap?: HemisphereHeatmap | null,
): BrainRegionActivation[] {
  const left = normalizeHeatmap(heatmap?.left);
  const right = normalizeHeatmap(heatmap?.right);

  return BRAIN_REGION_ORDER.map((id, index) => {
    const start = index * REGION_SIZE;
    const leftValue = averageBucket(left, start);
    const rightValue = averageBucket(right, start);

    return {
      id,
      label: BRAIN_REGION_LABELS[id],
      left: leftValue,
      right: rightValue,
      value: roundToFourDecimals((leftValue + rightValue) / 2),
    };
  });
}

function normalizeHeatmap(values?: number[]) {
  return Array.from({ length: HEATMAP_LENGTH }, (_, index) => clamp01(values?.[index] ?? 0));
}

function averageBucket(values: number[], start: number) {
  let total = 0;

  for (let index = start; index < start + REGION_SIZE; index += 1) {
    total += values[index] ?? 0;
  }

  return roundToFourDecimals(total / REGION_SIZE);
}

function roundToFourDecimals(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
