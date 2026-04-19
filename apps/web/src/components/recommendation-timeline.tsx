"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, WandSparkles } from "lucide-react";

import type { TimelineSegment } from "@/lib/contracts";
import { formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

type RecommendationTimelineProps = {
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  segments: TimelineSegment[];
  selectedCutIds: string[];
  onSeek: (time: number) => void;
  onTogglePlayback: () => void;
  onPreviewTimeChange: (time: number | null) => void;
};

const HOVER_CLOSE_DELAY_MS = 520;
const KEYBOARD_SEEK_STEP_SEC = 0.5;
const POSITIVE_SEGMENT_TYPES = new Set<TimelineSegment["type"]>([
  "strong_hook",
  "high_rewatch_moment",
]);
const REQUIRED_CHANGE_TYPES = new Set<TimelineSegment["type"]>([
  "deadspace",
  "deadspace_candidate",
]);

type RecommendationTone = "good" | "recommended" | "needed";
type FlyoutDensity = "default" | "compact" | "tight";

export function RecommendationTimeline({
  currentTimeSec,
  durationSec,
  isPlaying,
  segments,
  selectedCutIds,
  onSeek,
  onTogglePlayback,
  onPreviewTimeChange,
}: RecommendationTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openSegmentId, setOpenSegmentId] = useState<string | null>(null);
  const [hoverTrackTimeSec, setHoverTrackTimeSec] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const sortedSegments = [...segments].sort((left, right) => left.start - right.start);
  const openSegment = sortedSegments.find((segment) => segment.id === openSegmentId) ?? null;
  const openSegmentTone = openSegment ? getRecommendationTone(openSegment) : null;
  const openSegmentDensity = openSegment ? getFlyoutDensity(openSegment) : "default";
  const visibleTimeSec =
    isDragging && hoverTrackTimeSec !== null ? hoverTrackTimeSec : currentTimeSec;
  const playheadPercent = clampPercent(toPercent(visibleTimeSec, durationSec));
  const openSegmentPercent =
    openSegment === null ? null : clampPercent(toPercent(getMidpoint(openSegment), durationSec));
  const noteLabel = `${sortedSegments.length} notes`;

  useEffect(() => {
    onPreviewTimeChange(openSegment ? getMidpoint(openSegment) : null);
  }, [onPreviewTimeChange, openSegment]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const nextTime = readTimelineTime(event.clientX, trackRef.current, durationSec);
      setHoverTrackTimeSec(nextTime);
      onSeek(nextTime);
    }

    function stopDragging() {
      setIsDragging(false);
      setHoverTrackTimeSec(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [durationSec, isDragging, onSeek]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openRecommendation(segmentId: string) {
    clearCloseTimer();
    setOpenSegmentId(segmentId);
  }

  function scheduleRecommendationClose() {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenSegmentId(null);
    }, HOVER_CLOSE_DELAY_MS);
  }

  function handleTimelinePointerDown(clientX: number) {
    const nextTime = readTimelineTime(clientX, trackRef.current, durationSec);
    setIsDragging(true);
    setHoverTrackTimeSec(nextTime);
    onSeek(nextTime);
  }

  function handleTimelineKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!durationSec) {
      return;
    }

    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    event.preventDefault();

    if (event.key === "Home") {
      onSeek(0);
      return;
    }

    if (event.key === "End") {
      onSeek(durationSec);
      return;
    }

    const direction = event.key === "ArrowRight" ? 1 : -1;
    onSeek(clampTime(currentTimeSec + direction * KEYBOARD_SEEK_STEP_SEC, durationSec));
  }

  return (
    <div data-testid="recommendation-timeline" className="mt-4">
      <div
        data-testid="timeline-shell"
        className="surface relative overflow-hidden rounded-[2rem] p-5 text-foreground"
      >
        <div className="pointer-events-none absolute -right-3 top-5 h-14 w-14 rotate-6 rounded-[1.35rem] border-2 border-primary bg-primary shadow-[4px_4px_0_0_var(--shadow-stamp)]" />
        <div className="pointer-events-none absolute bottom-5 left-5 h-6 w-6 rounded-full border-2 border-border bg-accent shadow-[2px_2px_0_0_var(--shadow-stamp)]" />
        <div className="pointer-events-none absolute inset-x-8 top-6 h-px bg-[linear-gradient(90deg,transparent,rgba(134,216,158,0.26),transparent)]" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label={isPlaying ? "Pause video" : "Play video"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground shadow-[4px_4px_0_0_var(--shadow-stamp)] transition-[transform,box-shadow,background-color] hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-primary/90 hover:shadow-[3px_3px_0_0_var(--shadow-stamp)]"
              onClick={onTogglePlayback}
            >
              {isPlaying ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
            </button>

            <div className="min-w-0">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
                Scan timeline
              </p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Scrub the beat map, hover a marker, and pop open the full recommendation.
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="sticker px-3 py-1 text-xs font-medium text-secondary-foreground">
                {noteLabel}
              </div>
              <div className="sticker px-3 py-1 text-xs font-medium text-secondary-foreground">
                {formatSeconds(durationSec)} clip
              </div>
            </div>
          </div>

          <div className="relative mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] xl:items-start">
            <div className="relative overflow-hidden rounded-[1.6rem] border-2 border-border bg-[linear-gradient(180deg,rgba(22,29,25,0.98),rgba(14,19,16,0.98))] shadow-[4px_4px_0_0_var(--shadow-stamp)]">
              <div
                ref={trackRef}
                role="slider"
                tabIndex={0}
                aria-label="Video timeline"
                aria-valuemin={0}
                aria-valuemax={Math.max(durationSec, 0)}
                aria-valuenow={Number(visibleTimeSec.toFixed(2))}
                aria-valuetext={`${formatSeconds(visibleTimeSec)} of ${formatSeconds(durationSec)}`}
                data-testid="timeline-scrub-surface"
                className="group relative h-[14rem] cursor-ew-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-4 focus-visible:ring-offset-card md:h-[15rem] xl:h-[16.75rem]"
                onKeyDown={handleTimelineKeyDown}
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleTimelinePointerDown(event.clientX);
                }}
              >
                <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-center justify-between text-[0.7rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  <span>Start</span>
                  <span>{formatSeconds(durationSec / 2)}</span>
                  <span>{formatSeconds(durationSec)}</span>
                </div>

                <div className="pointer-events-none absolute inset-x-0 top-0 bottom-7 bg-[radial-gradient(circle_at_18%_18%,rgba(134,216,158,0.16),transparent_25%),radial-gradient(circle_at_82%_24%,rgba(53,184,95,0.18),transparent_22%),linear-gradient(180deg,#1a251f_0%,#131915_54%,#0d120f_100%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 bottom-7 bg-[radial-gradient(circle,rgba(255,255,255,0.08)_1px,transparent_1.6px)] [background-size:18px_18px] opacity-15" />
                <div className="pointer-events-none absolute inset-x-6 top-[4.3rem] bottom-[3.8rem] rounded-[1.25rem] border-2 border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_26%,rgba(12,17,13,0.34)_100%)] shadow-[inset_0_2px_0_rgba(255,255,255,0.04)]" />
                <div className="pointer-events-none absolute inset-x-7 top-[5.15rem] bottom-[4.45rem] rounded-[1.05rem] border border-white/10 bg-[repeating-linear-gradient(90deg,rgba(134,216,158,0.14)_0,rgba(134,216,158,0.14)_calc(12.5%-5px),transparent_calc(12.5%-5px),transparent_12.5%),linear-gradient(90deg,rgba(53,184,95,0.12)_0%,rgba(115,209,143,0.14)_50%,rgba(53,184,95,0.12)_100%)]" />
                <div className="pointer-events-none absolute inset-x-6 bottom-[4.65rem] flex items-center justify-between text-[0.62rem] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                  <span>{formatSeconds(0)}</span>
                  <span>{formatSeconds(durationSec * 0.25)}</span>
                  <span>{formatSeconds(durationSec * 0.5)}</span>
                  <span>{formatSeconds(durationSec * 0.75)}</span>
                  <span>{formatSeconds(durationSec)}</span>
                </div>

                <div className="pointer-events-none absolute inset-x-5 bottom-4 z-[1] h-4 rounded-full border-2 border-border/75 bg-[linear-gradient(180deg,rgba(7,10,8,0.92),rgba(16,20,18,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),3px_3px_0_0_rgba(5,7,5,0.55)]" />

                {openSegment && openSegmentPercent !== null ? (
                  <div
                    data-testid="timeline-note-connector"
                    className="pointer-events-none absolute bottom-[2.35rem] right-4 z-[12] h-[3px] origin-left animate-in fade-in zoom-in-75 duration-200"
                    style={{
                      left: `calc(${openSegmentPercent}% + 0.2rem)`,
                      background:
                        "linear-gradient(90deg, color-mix(in srgb, currentColor 92%, transparent) 0%, color-mix(in srgb, currentColor 28%, transparent) 65%, transparent 100%)",
                      color: connectorColor(openSegmentTone),
                    }}
                  >
                    <span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-current shadow-[0_0_16px_currentColor]" />
                  </div>
                ) : null}

                {sortedSegments.map((segment) => {
                  const tone = getRecommendationTone(segment);
                  const markerPercent = clampPercent(toPercent(getMidpoint(segment), durationSec));
                  const isOpen = segment.id === openSegmentId;
                  const isSelectedCut =
                    segment.cutId !== null && selectedCutIds.includes(segment.cutId);

                  return (
                    <button
                      key={segment.id}
                      type="button"
                      aria-label={`${segment.label} recommendation at ${formatSeconds(segment.start)}`}
                      className="absolute inset-y-0 z-10 w-12 -translate-x-1/2"
                      style={{ left: `${markerPercent}%` }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onPointerEnter={() => openRecommendation(segment.id)}
                      onPointerLeave={scheduleRecommendationClose}
                      onFocus={() => openRecommendation(segment.id)}
                      onBlur={scheduleRecommendationClose}
                      onClick={(event) => {
                        event.stopPropagation();
                        openRecommendation(segment.id);
                        onSeek(getMidpoint(segment));
                      }}
                    >
                      <span
                        className={cn(
                          "pointer-events-none absolute bottom-[2rem] left-1/2 h-[3.15rem] w-[4px] -translate-x-1/2 rounded-full shadow-[1px_1px_0_0_rgba(5,7,5,0.4)] transition-all duration-300",
                          toneStemClasses(tone),
                          isOpen ? "h-[3.8rem] opacity-100" : "opacity-80",
                        )}
                      />
                      <span
                        className={cn(
                          "pointer-events-none absolute bottom-[1.65rem] left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 bg-background shadow-[2px_2px_0_0_var(--shadow-stamp),0_0_0_3px_rgba(255,255,255,0.04)] transition-all duration-300",
                          toneMarkerOuterClasses(tone),
                          isOpen ? "scale-110 shadow-[0_0_0_6px_rgba(255,255,255,0.06)]" : "scale-100",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_12px_currentColor]",
                            toneMarkerInnerClasses(tone),
                          )}
                        />
                      </span>
                      <span
                        className={cn(
                          "pointer-events-none absolute bottom-[0.55rem] left-1/2 h-6 w-8 -translate-x-1/2 rounded-full border transition-all duration-300",
                          isOpen || isSelectedCut
                            ? toneBracketClasses(tone)
                            : "border-transparent opacity-0",
                        )}
                      />
                    </button>
                  );
                })}

                <div
                  data-testid="timeline-playhead"
                  className="pointer-events-none absolute inset-y-0 z-20 w-0 -translate-x-1/2"
                  style={{ left: `${playheadPercent}%` }}
                >
                  <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border-2 border-primary bg-primary px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-primary-foreground shadow-[3px_3px_0_0_var(--shadow-stamp)]">
                    {formatSeconds(visibleTimeSec)}
                  </div>
                  <div className="absolute bottom-[1.1rem] top-11 left-1/2 w-[4px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_18px_var(--color-primary)]" />
                  <div className="absolute bottom-[0.75rem] left-1/2 h-[1.1rem] w-[1.1rem] -translate-x-1/2 rounded-full border-2 border-primary bg-background shadow-[2px_2px_0_0_var(--shadow-stamp),0_0_0_4px_rgba(53,184,95,0.14)]">
                    <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                  </div>
                </div>
              </div>
            </div>

            {openSegment && openSegmentTone ? (
              <section
                data-testid="timeline-note-flyout"
                className="surface-soft origin-left relative rounded-[1.65rem] p-5 animate-in fade-in zoom-in-95 slide-in-from-left-5 duration-300 xl:max-h-[24rem] xl:overflow-y-auto"
                onPointerEnter={clearCloseTimer}
                onPointerLeave={scheduleRecommendationClose}
              >
                <div className="pointer-events-none absolute -right-3 top-4 h-10 w-10 rotate-12 rounded-[1rem] border-2 border-primary bg-primary shadow-[3px_3px_0_0_var(--shadow-stamp)]" />
                <div className="pointer-events-none absolute bottom-4 left-4 h-4 w-4 rounded-full border-2 border-border bg-accent shadow-[2px_2px_0_0_var(--shadow-stamp)]" />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
                        {openSegment.label}
                      </p>
                      <p className="mt-2 font-heading text-xl tracking-[-0.04em] text-foreground">
                        {formatSeconds(openSegment.start)} to {formatSeconds(openSegment.end)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border-2 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.18em] shadow-[2px_2px_0_0_var(--shadow-stamp)]",
                        toneBadgeClasses(openSegmentTone),
                      )}
                    >
                      {recommendationToneLabel(openSegmentTone)}
                    </span>
                  </div>

                  <div data-testid="timeline-note-content" className="mt-5 space-y-4">
                    <p
                      data-testid="timeline-note-reason"
                      className={cn(
                        "text-muted-foreground [overflow-wrap:anywhere]",
                        flyoutReasonClasses(openSegmentDensity),
                      )}
                    >
                      {openSegment.reason}
                    </p>

                    <div
                      data-testid="timeline-note-suggestion"
                      className="border-t border-border/70 pt-4"
                    >
                      <p className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
                        <WandSparkles className="size-3.5" />
                        Suggestion
                      </p>
                      <p
                        data-testid="timeline-note-suggestion-text"
                        className={cn(
                          "mt-2 text-foreground [overflow-wrap:anywhere]",
                          flyoutSuggestionClasses(openSegmentDensity),
                        )}
                      >
                        {openSegment.recommendedAction}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function clampTime(value: number, durationSec: number) {
  return Math.max(0, Math.min(durationSec, value));
}

function getMidpoint(segment: TimelineSegment) {
  return segment.start + (segment.end - segment.start) / 2;
}

function toPercent(timeSec: number, durationSec: number) {
  if (durationSec <= 0) {
    return 0;
  }
  return (timeSec / durationSec) * 100;
}

function clampPercent(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function readTimelineTime(
  clientX: number,
  trackElement: HTMLDivElement | null,
  durationSec: number,
) {
  if (!trackElement) {
    return 0;
  }

  const bounds = trackElement.getBoundingClientRect();
  const relativeX = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0;
  return clampTime(clampPercent(relativeX * 100) / 100 * durationSec, durationSec);
}

function getRecommendationTone(segment: TimelineSegment): RecommendationTone {
  if (POSITIVE_SEGMENT_TYPES.has(segment.type)) {
    return "good";
  }

  if (REQUIRED_CHANGE_TYPES.has(segment.type) || segment.severity === "high") {
    return "needed";
  }

  return "recommended";
}

function recommendationToneLabel(tone: RecommendationTone) {
  if (tone === "good") {
    return "Good";
  }
  if (tone === "needed") {
    return "Changes needed";
  }
  return "Changes recommended";
}

function toneBadgeClasses(tone: RecommendationTone) {
  if (tone === "good") {
    return "border-primary/35 bg-primary/15 text-primary";
  }
  if (tone === "needed") {
    return "border-destructive/35 bg-destructive/15 text-destructive";
  }
  return "border-amber-400/35 bg-amber-500/15 text-amber-200";
}

function toneStemClasses(tone: RecommendationTone) {
  if (tone === "good") {
    return "bg-primary/65";
  }
  if (tone === "needed") {
    return "bg-destructive/70";
  }
  return "bg-amber-400/75";
}

function toneMarkerOuterClasses(tone: RecommendationTone) {
  if (tone === "good") {
    return "border-primary/60 bg-background";
  }
  if (tone === "needed") {
    return "border-destructive/60 bg-background";
  }
  return "border-amber-300/70 bg-background";
}

function toneMarkerInnerClasses(tone: RecommendationTone) {
  if (tone === "good") {
    return "bg-primary text-primary";
  }
  if (tone === "needed") {
    return "bg-destructive text-destructive";
  }
  return "bg-amber-400 text-amber-400";
}

function toneBracketClasses(tone: RecommendationTone) {
  if (tone === "good") {
    return "border-primary/60 opacity-100";
  }
  if (tone === "needed") {
    return "border-destructive/60 opacity-100";
  }
  return "border-amber-300/70 opacity-100";
}

function connectorColor(tone: RecommendationTone | null) {
  if (tone === "good") {
    return "rgb(53 184 95)";
  }
  if (tone === "needed") {
    return "rgb(239 68 68)";
  }
  return "rgb(250 204 21)";
}

function getFlyoutDensity(segment: TimelineSegment): FlyoutDensity {
  const textLength = segment.reason.length + segment.recommendedAction.length;
  if (textLength > 220) {
    return "tight";
  }
  if (textLength > 150) {
    return "compact";
  }
  return "default";
}

function flyoutReasonClasses(density: FlyoutDensity) {
  if (density === "tight") {
    return "text-[0.8rem] leading-5";
  }
  if (density === "compact") {
    return "text-[0.86rem] leading-[1.35rem]";
  }
  return "text-[0.92rem] leading-6";
}

function flyoutSuggestionClasses(density: FlyoutDensity) {
  if (density === "tight") {
    return "text-[0.78rem] leading-[1.2rem]";
  }
  if (density === "compact") {
    return "text-[0.84rem] leading-[1.35rem]";
  }
  return "text-[0.9rem] leading-6";
}
