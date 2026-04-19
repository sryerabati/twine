"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  videoSrc: string;
  onSeek: (time: number) => void;
  onTogglePlayback: () => void;
  onPreviewTimeChange: (time: number | null) => void;
};

const HOVER_CLOSE_DELAY_MS = 220;
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
type TimelineFrame = {
  id: string;
  timeSec: number;
  src: string | null;
};

export function RecommendationTimeline({
  currentTimeSec,
  durationSec,
  isPlaying,
  segments,
  selectedCutIds,
  videoSrc,
  onSeek,
  onTogglePlayback,
  onPreviewTimeChange,
}: RecommendationTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openSegmentId, setOpenSegmentId] = useState<string | null>(null);
  const [hoverTrackTimeSec, setHoverTrackTimeSec] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const timelineKey = `${videoSrc}:${durationSec}`;
  const placeholderFrames = useMemo(() => buildPlaceholderFrames(durationSec), [durationSec]);
  const [generatedFrameState, setGeneratedFrameState] = useState<{
    key: string;
    frames: TimelineFrame[] | null;
  }>({
    key: timelineKey,
    frames: null,
  });

  const sortedSegments = [...segments].sort((left, right) => left.start - right.start);
  const openSegment = sortedSegments.find((segment) => segment.id === openSegmentId) ?? null;
  const openSegmentTone = openSegment ? getRecommendationTone(openSegment) : null;
  const timelineFrames =
    generatedFrameState.key === timelineKey && generatedFrameState.frames
      ? generatedFrameState.frames
      : placeholderFrames;
  const playheadPercent = clampPercent(toPercent(currentTimeSec, durationSec));
  const hoverTrackPercent =
    hoverTrackTimeSec === null ? null : clampPercent(toPercent(hoverTrackTimeSec, durationSec));

  useEffect(() => {
    onPreviewTimeChange(openSegment ? getMidpoint(openSegment) : null);
  }, [onPreviewTimeChange, openSegment]);

  useEffect(() => {
    let cancelled = false;

    async function generateFrames() {
      if (!videoSrc || durationSec <= 0 || typeof document === "undefined") {
        return;
      }

      const frameTimes = buildFrameTimes(durationSec);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = videoSrc;

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      try {
        await waitForVideoMetadata(video);
        if (!video.videoWidth || !video.videoHeight) {
          return;
        }

        const targetHeight = 80;
        canvas.width = Math.max(96, Math.round((video.videoWidth / video.videoHeight) * targetHeight));
        canvas.height = targetHeight;

        const nextFrames: TimelineFrame[] = [];
        for (const timeSec of frameTimes) {
          if (cancelled) {
            return;
          }
          await seekHiddenVideo(video, timeSec);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          nextFrames.push({
            id: `frame-${timeSec.toFixed(2)}`,
            timeSec,
            src: canvas.toDataURL("image/jpeg", 0.72),
          });
        }

        if (!cancelled && nextFrames.length) {
          setGeneratedFrameState({
            key: timelineKey,
            frames: nextFrames,
          });
        }
      } catch {
        // Fall back to placeholder slots when frame extraction is unavailable.
      } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    }

    void generateFrames();

    return () => {
      cancelled = true;
    };
  }, [durationSec, timelineKey, videoSrc]);

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
    <div data-testid="recommendation-timeline" className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label={isPlaying ? "Pause video" : "Play video"}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground shadow-[4px_4px_0_0_var(--color-primary)] transition-[transform,box-shadow,background-color] hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-primary/90 hover:shadow-[3px_3px_0_0_var(--color-primary)]"
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
            Video timeline
          </p>
          <p className="text-sm text-muted-foreground">
            Scrub here instead of the native player controls. Hover a pin to open the note.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {sortedSegments.length} notes
          </div>
          <div className="sticker px-3 py-1 text-xs font-medium text-secondary-foreground">
            {formatSeconds(currentTimeSec)} / {formatSeconds(durationSec)}
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-[1.7rem] border-2 border-border bg-[#101411] p-4">
        {openSegment && openSegmentTone ? (
          <section
            data-testid="timeline-recommendation-panel"
            className="rounded-[1.45rem] border border-border bg-[#111511]/95 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.24)] animate-in fade-in slide-in-from-top-2 duration-300"
            onPointerEnter={clearCloseTimer}
            onPointerLeave={scheduleRecommendationClose}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
                  {openSegment.label}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatSeconds(openSegment.start)} to {formatSeconds(openSegment.end)}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.18em]",
                  toneBadgeClasses(openSegmentTone),
                )}
              >
                {recommendationToneLabel(openSegmentTone)}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">{openSegment.reason}</p>

            <div className="mt-3 rounded-[1rem] border border-border bg-[#181e17] p-3">
              <p className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
                <WandSparkles className="size-3.5" />
                Suggestion
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {openSegment.recommendedAction}
              </p>
            </div>
          </section>
        ) : null}

        <div className="relative overflow-hidden rounded-[1.45rem] border border-border bg-card/70">
          <div className="pointer-events-none absolute inset-x-4 top-3 z-10 flex items-center justify-between text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
            <span>Start</span>
            <span>{formatSeconds(durationSec / 2)}</span>
            <span>{formatSeconds(durationSec)}</span>
          </div>

          <div className="absolute inset-0 flex">
            {timelineFrames.map((frame) => (
              <div
                key={frame.id}
                data-testid="timeline-frame"
                className="relative h-full min-w-0 flex-1 overflow-hidden border-r border-background/15 last:border-r-0"
              >
                {frame.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frame.src}
                    alt=""
                    className="h-full w-full object-cover opacity-80"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#284232_0%,#18251d_55%,#0f1511_100%)]" />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,12,10,0.14)_0%,rgba(9,12,10,0.28)_55%,rgba(9,12,10,0.62)_100%)]" />
                <div className="absolute bottom-10 left-2 rounded-full bg-background/70 px-2 py-1 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
                  {formatSeconds(frame.timeSec)}
                </div>
              </div>
            ))}
          </div>

          <div className="relative h-[10.5rem]">
            {hoverTrackPercent !== null ? (
              <div
                className="pointer-events-none absolute bottom-4 top-0 z-[1] w-px bg-primary/30"
                style={{ left: `${hoverTrackPercent}%` }}
              />
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
                  className="absolute bottom-6 top-8 z-10 w-12 -translate-x-1/2"
                  style={{ left: `${markerPercent}%` }}
                  onPointerEnter={() => openRecommendation(segment.id)}
                  onPointerLeave={scheduleRecommendationClose}
                  onFocus={() => openRecommendation(segment.id)}
                  onBlur={scheduleRecommendationClose}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeek(segment.start);
                  }}
                >
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-0 left-1/2 h-[3.1rem] w-[1px] -translate-x-1/2 transition-all duration-300",
                      toneStemClasses(tone),
                      isOpen ? "h-[3.8rem]" : null,
                    )}
                  />
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-7 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border-2 shadow-[0_0_0_3px_rgba(255,255,255,0.04)] transition-all duration-300",
                      toneMarkerOuterClasses(tone),
                      isOpen ? "scale-110 shadow-[0_0_0_6px_rgba(255,255,255,0.06)]" : "scale-100",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_12px_currentColor]",
                        toneMarkerInnerClasses(tone),
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-[0.15rem] left-1/2 h-[4.45rem] w-8 -translate-x-1/2 rounded-[1rem] border transition-all duration-300",
                      isOpen || isSelectedCut
                        ? toneBracketClasses(tone)
                        : "border-transparent opacity-0",
                    )}
                  />
                </button>
              );
            })}

            <div
              ref={trackRef}
              role="slider"
              tabIndex={0}
              aria-label="Video timeline"
              aria-valuemin={0}
              aria-valuemax={Math.max(durationSec, 0)}
              aria-valuenow={Number(currentTimeSec.toFixed(2))}
              aria-valuetext={`${formatSeconds(currentTimeSec)} of ${formatSeconds(durationSec)}`}
              data-testid="video-timeline"
              className="absolute inset-x-3 bottom-3 z-0 h-8 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-4 focus-visible:ring-offset-[#101411]"
              onKeyDown={handleTimelineKeyDown}
              onPointerDown={(event) => {
                event.preventDefault();
                handleTimelinePointerDown(event.clientX);
              }}
              onPointerMove={(event) => {
                if (isDragging) {
                  return;
                }
                setHoverTrackTimeSec(
                  readTimelineTime(event.clientX, trackRef.current, durationSec),
                );
              }}
              onPointerLeave={() => {
                if (!isDragging) {
                  setHoverTrackTimeSec(null);
                }
              }}
            >
              <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-background/65" />
              <div
                data-testid="video-timeline-fill"
                className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_var(--color-primary)]"
                style={{ width: `${playheadPercent}%` }}
              />
              <div
                data-testid="video-timeline-thumb"
                className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary shadow-[0_0_0_3px_var(--color-secondary)]"
                style={{ left: `${playheadPercent}%` }}
              >
                <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground/85" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function clampTime(value: number, durationSec: number) {
  return Math.max(0, Math.min(durationSec, value));
}

async function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Could not load video metadata for timeline frames."));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

async function seekHiddenVideo(video: HTMLVideoElement, timeSec: number) {
  if (Math.abs(video.currentTime - timeSec) < 0.04) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Could not seek hidden video for timeline frame extraction."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = timeSec;
  });
}

function buildFrameTimes(durationSec: number) {
  const frameCount = Math.max(6, Math.min(10, Math.ceil(durationSec / 1.5)));
  if (frameCount === 1) {
    return [0];
  }

  return Array.from({ length: frameCount }, (_, index) => {
    const ratio = index / (frameCount - 1);
    return clampTime(durationSec * ratio, durationSec);
  });
}

function buildPlaceholderFrames(durationSec: number): TimelineFrame[] {
  return buildFrameTimes(durationSec).map((timeSec, index) => ({
    id: `placeholder-frame-${index}`,
    timeSec,
    src: null,
  }));
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
