"use client";

import { useEffect, useMemo, useState } from "react";

import { Brain3DViewport } from "@/components/brain-3d-viewport";
import { buildDemoBrainSeries } from "@/components/brain-scan-viewer";
import { cn } from "@/lib/utils";

export function LandingBrainModel() {
  const points = useMemo(() => buildDemoBrainSeries(14), []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % points.length);
    }, 1900);

    return () => window.clearInterval(timer);
  }, [points.length]);

  return (
    <div aria-hidden="true" className="relative mx-auto h-[460px] w-full max-w-[680px]">
      <SignalChip className="left-6 top-14" label="Signal" />
      <SignalChip className="right-10 top-20" label="A/B" tone="subtle" />
      <SignalChip className="left-12 bottom-14" label="Hooks" tone="subtle" />
      <Brain3DViewport point={points[index] ?? null} mode="hero" className="h-full w-full" />
    </div>
  );
}

function SignalChip({
  label,
  className,
  tone = "default",
}: {
  label: string;
  className?: string;
  tone?: "default" | "subtle";
}) {
  return (
    <div
      className={cn(
        "absolute z-10 rounded-full border px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.24em] shadow-[4px_4px_0_0_var(--shadow-stamp)] backdrop-blur-sm animate-[poster-wiggle_7s_ease-in-out_infinite]",
        tone === "default"
          ? "border-primary/55 bg-card/92 text-foreground"
          : "border-border bg-card/78 text-muted-foreground",
        className,
      )}
    >
      {label}
    </div>
  );
}
