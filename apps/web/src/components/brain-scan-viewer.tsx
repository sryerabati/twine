"use client";

import { useEffect, useState } from "react";
import { Activity, AudioWaveform, Brain, Waves } from "lucide-react";

import { Brain3DViewport } from "@/components/brain-3d-viewport";
import type { BrainResponsePoint } from "@/lib/contracts";
import { deriveBrainRegionActivations } from "@/lib/brain-regions";
import { cn } from "@/lib/utils";

type BrainScanViewerProps = {
  points: BrainResponsePoint[];
  currentTimeSec?: number | null;
  autoPlay?: boolean;
  className?: string;
  title?: string;
  description?: string;
};

export function buildDemoBrainSeries(length = 10): BrainResponsePoint[] {
  return Array.from({ length }, (_, index) => {
    const t = index * 1.6;
    const activation = 0.42 + (Math.sin(index * 0.65) + 1) * 0.22;
    const left = 0.38 + (Math.sin(index * 0.7) + 1) * 0.2;
    const right = 0.34 + (Math.cos(index * 0.75) + 1) * 0.22;

    return {
      stimulusTimeSec: t,
      segmentStartSec: t,
      segmentDurationSec: 1.6,
      globalActivation: activation,
      leftHemisphereActivation: left,
      rightHemisphereActivation: right,
      rollingVariance: 0.24,
      activationDelta: 0.16,
      spikeScore: 0.58 + (Math.sin(index) + 1) * 0.12,
      dropScore: 0.22 + (Math.cos(index * 0.8) + 1) * 0.06,
      audioEnergy: 0.44 + (Math.cos(index * 0.55) + 1) * 0.17,
      motionScore: 0.41 + (Math.sin(index * 0.48) + 1) * 0.18,
      transcriptDensity: 0.33 + (Math.sin(index * 0.31) + 1) * 0.15,
      sceneChange: index % 3 === 0,
      silenceOverlap: index % 5 === 0,
      hemisphereHeatmap: {
        left: buildHeatmap(index * 0.35),
        right: buildHeatmap(index * 0.52 + 0.8),
      },
    };
  });
}

export function BrainScanViewer({
  points,
  currentTimeSec,
  autoPlay = false,
  className,
  title = "3D signal view",
  description = "A branded brain scan that mirrors the strongest live attention signal.",
}: BrainScanViewerProps) {
  const [autoIndex, setAutoIndex] = useState(0);

  useEffect(() => {
    if (!autoPlay || points.length < 2 || currentTimeSec !== undefined) {
      return;
    }

    const timer = window.setInterval(() => {
      setAutoIndex((value) => (value + 1) % points.length);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [autoPlay, currentTimeSec, points.length]);

  const point =
    points.length === 0
      ? null
      : currentTimeSec === undefined || currentTimeSec === null
        ? points[autoIndex]
        : findClosestPoint(points, currentTimeSec);
  const regions = deriveBrainRegionActivations(point?.hemisphereHeatmap);

  return (
    <section
      className={cn(
        "surface relative overflow-hidden rounded-[2rem] p-5 text-foreground",
        className,
      )}
    >
      <div className="absolute -right-3 top-5 h-14 w-14 rotate-6 rounded-[1.35rem] border-2 border-primary bg-primary shadow-[4px_4px_0_0_var(--shadow-stamp)]" />
      <div className="absolute bottom-5 left-5 h-6 w-6 rounded-full border-2 border-border bg-accent shadow-[2px_2px_0_0_var(--shadow-stamp)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            3D activation view
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="sticker px-3 py-1 text-xs font-medium text-secondary-foreground">
          {point ? `${point.stimulusTimeSec.toFixed(1)}s focus` : "Standby"}
        </div>
      </div>

      <Brain3DViewport point={point} mode="panel" className="mt-6 px-4 py-5" />

      <div className="relative mt-5 grid gap-3 md:grid-cols-4">
        {regions.map((region, index) => (
          <SignalCard
            key={region.id}
            icon={REGION_ICONS[index]}
            label={region.label}
            value={formatPercent(region.value)}
          />
        ))}
      </div>
    </section>
  );
}

const REGION_ICONS = [Brain, Activity, AudioWaveform, Waves] as const;

function SignalCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Brain;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-soft rounded-[1.35rem] p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <span className="text-xs uppercase tracking-[0.24em]">{label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function findClosestPoint(points: BrainResponsePoint[], currentTimeSec: number) {
  return points.reduce((closest, point) =>
    Math.abs(point.stimulusTimeSec - currentTimeSec) <
    Math.abs(closest.stimulusTimeSec - currentTimeSec)
      ? point
      : closest,
  );
}

function buildHeatmap(seed: number) {
  return Array.from({ length: 64 }, (_, index) => {
    const wave = Math.sin(seed + index * 0.31) * 0.18;
    const fold = Math.cos(seed * 0.9 + index * 0.14) * 0.11;
    return clamp01(0.48 + wave + fold);
  });
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatPercent(value: number | null | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`;
}
