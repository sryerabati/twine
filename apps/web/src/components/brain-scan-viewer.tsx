"use client";

import { useEffect, useState } from "react";
import { Activity, AudioWaveform, Brain, ScanLine } from "lucide-react";

import type { BrainResponsePoint } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type BrainScanViewerProps = {
  points: BrainResponsePoint[];
  currentTimeSec?: number | null;
  autoPlay?: boolean;
  className?: string;
  title?: string;
  description?: string;
};

const EMPTY_HEATMAP = Array.from({ length: 64 }, () => 0.22);

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

  const leftNodes = buildNodes(point?.hemisphereHeatmap.left ?? EMPTY_HEATMAP, "left");
  const rightNodes = buildNodes(point?.hemisphereHeatmap.right ?? EMPTY_HEATMAP, "right");
  const sweep =
    point && points.length > 1
      ? ((point.stimulusTimeSec / points[points.length - 1].stimulusTimeSec) * 120 - 60).toFixed(2)
      : "0";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(247,242,232,0.92))] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,137,74,0.12),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(87,182,193,0.14),transparent_34%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Neural-style view</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-full border border-border/70 bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground">
          {point ? `${point.stimulusTimeSec.toFixed(1)}s focus` : "Standby"}
        </div>
      </div>

      <div className="relative mt-6 overflow-hidden rounded-[1.7rem] border border-border/70 bg-[linear-gradient(180deg,rgba(252,249,242,0.92),rgba(245,241,231,0.78))] px-4 py-6">
        <div className="absolute left-1/2 top-4 bottom-4 w-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(244,137,74,0.2),transparent_72%)] blur-2xl" />
        <div className="absolute inset-x-10 top-6 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent" />
        <div
          className="relative mx-auto aspect-[7/5] max-w-xl animate-[float-brain_7s_ease-in-out_infinite]"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="absolute inset-0 rounded-[45%] bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.65),transparent_55%)] blur-xl" />
          <div
            className="absolute inset-y-4 left-1/2 w-12 -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,transparent,rgba(87,182,193,0.18),transparent)] blur-md"
            style={{ transform: `translateX(${sweep}px)` }}
          />
          <svg viewBox="0 0 280 220" className="absolute inset-0 h-full w-full drop-shadow-[0_20px_45px_rgba(15,23,42,0.12)]">
            <defs>
              <linearGradient id="cortent-left" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(244,137,74,0.85)" />
                <stop offset="100%" stopColor="rgba(252,174,121,0.42)" />
              </linearGradient>
              <linearGradient id="cortent-right" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(87,182,193,0.84)" />
                <stop offset="100%" stopColor="rgba(145,216,223,0.34)" />
              </linearGradient>
            </defs>

            <path
              d="M136 36c-35 0-70 18-84 47-13 27-11 64 7 91 12 18 34 30 55 30 12 0 22-10 22-22V56c0-12-9-20-20-20h20Z"
              fill="url(#cortent-left)"
              opacity={0.4 + (point?.leftHemisphereActivation ?? 0.2) * 0.7}
            />
            <path
              d="M144 36c35 0 70 18 84 47 13 27 11 64-7 91-12 18-34 30-55 30-12 0-22-10-22-22V56c0-12 9-20 20-20h-20Z"
              fill="url(#cortent-right)"
              opacity={0.4 + (point?.rightHemisphereActivation ?? 0.2) * 0.7}
            />
            <path
              d="M140 42v140"
              stroke="rgba(15,23,42,0.15)"
              strokeDasharray="5 7"
              strokeWidth="2"
            />
            {leftNodes.map((node) => (
              <circle
                key={node.id}
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill="rgba(244,137,74,0.92)"
                opacity={node.opacity}
              />
            ))}
            {rightNodes.map((node) => (
              <circle
                key={node.id}
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill="rgba(87,182,193,0.92)"
                opacity={node.opacity}
              />
            ))}
          </svg>
        </div>
      </div>

      <div className="relative mt-5 grid gap-3 md:grid-cols-4">
        <SignalCard
          icon={Brain}
          label="Global activation"
          value={`${Math.round((point?.globalActivation ?? 0) * 100)} / 100`}
        />
        <SignalCard
          icon={Activity}
          label="Motion"
          value={`${Math.round((point?.motionScore ?? 0) * 100)}%`}
        />
        <SignalCard
          icon={AudioWaveform}
          label="Audio energy"
          value={`${Math.round((point?.audioEnergy ?? 0) * 100)}%`}
        />
        <SignalCard
          icon={ScanLine}
          label="Spike score"
          value={`${Math.round((point?.spikeScore ?? 0) * 100)}%`}
        />
      </div>
    </section>
  );
}

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
    <div className="rounded-[1.35rem] border border-border/70 bg-white/75 p-4">
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

function buildNodes(values: number[], hemisphere: "left" | "right") {
  return values.slice(0, 24).map((value, index) => {
    const row = Math.floor(index / 6);
    const column = index % 6;
    const direction = hemisphere === "left" ? -1 : 1;
    const anchor = hemisphere === "left" ? 126 : 154;
    const x = anchor + direction * (18 + row * 10 + (column % 3) * 5);
    const y = 52 + row * 32 + ((column % 2) * 8 - 4);

    return {
      id: `${hemisphere}-${index}`,
      x,
      y,
      radius: 2 + value * 4,
      opacity: 0.22 + value * 0.78,
    };
  });
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
