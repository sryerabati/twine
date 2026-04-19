"use client";

import { Check, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { AnalysisPayload, DeadspaceCut, TimelineSegment } from "@/lib/contracts";
import { formatDateTime, formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrimMode = "speech_safe" | "lenient";

type ScanSecondaryDetailsProps = {
  payload: AnalysisPayload;
  activeCutIds: string[];
  trimMode: TrimMode;
  onPreviewTimeChange: (time: number | null) => void;
  onJumpToTime: (time: number) => void;
};

export function ScanSecondaryDetails({
  payload,
  activeCutIds,
  trimMode,
  onPreviewTimeChange,
  onJumpToTime,
}: ScanSecondaryDetailsProps) {
  const latestExport = payload.exports[payload.exports.length - 1] ?? null;

  return (
    <section className="surface rounded-[2.4rem] p-6 text-foreground">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Secondary details
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Cuts, guidance, and exports.</p>
        </div>
        <Badge variant="secondary">
          {activeCutIds.length} in current trim
        </Badge>
      </div>

      <div className="mt-6 grid gap-8 xl:grid-cols-[1.04fr_0.96fr]">
        <div className="space-y-5 border-t border-border/70 pt-6 xl:border-r xl:border-t-0 xl:pr-6 xl:pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Guidance</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The action board stays visible without turning the whole lower half of the page into
                a stack of cards.
              </p>
            </div>
            <Badge variant="secondary">
              Action board
            </Badge>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <ActionColumn title="Keep" items={payload.actionBoard.keep} />
            <ActionColumn title="Fix now" items={payload.actionBoard.fixNow} />
            <ActionColumn title="Test next" items={payload.actionBoard.testNext} />
            <ActionColumn title="Export plan" items={payload.actionBoard.exportPlan} />
          </div>
        </div>

        <div className="space-y-5 border-t border-border/70 pt-6 xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Cuts</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Speech-safe deadspace trims run automatically. Lenient mode adds the AI low-value
                cuts when you want the export to hold onto only the important parts.
              </p>
            </div>
            <Badge variant="secondary" className="bg-primary/15 text-primary">
              {trimMode === "lenient" ? "Lenient mode" : "Speech-safe mode"}
            </Badge>
          </div>

          <div className="space-y-4">
            {payload.deadspaceCuts.length ? (
              payload.deadspaceCuts.map((cut) => (
                <CutPlanRow
                  key={cut.id}
                  cut={cut}
                  active={activeCutIds.includes(cut.id)}
                  title="Automatic deadspace trim"
                  activeLabel="Included automatically"
                  inactiveLabel="Not active"
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No deterministic deadspace cut crossed the threshold on this scan.
              </p>
            )}
          </div>

          <div className="border-t border-border/70 pt-5">
            <p className="text-sm font-medium text-foreground">Lenient add-on trims</p>
            <div className="mt-4 space-y-4">
              {payload.lowValueCuts.length ? (
                payload.lowValueCuts.map((cut) => (
                  <CutPlanRow
                    key={cut.id}
                    cut={cut}
                    active={activeCutIds.includes(cut.id)}
                    title="AI suggestion"
                    activeLabel="Included in lenient mode"
                    inactiveLabel="Lenient mode only"
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No extra low-value sections were suggested by the AI on this run.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-border/70 pt-5">
            <p className="text-sm text-muted-foreground">
              Run the trim from the player box above. This panel stays focused on why each cut is
              included.
            </p>
            {latestExport ? (
              <a
                href={latestExport.trimmedVideoUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <Download data-icon="inline-start" />
                Latest export
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 border-t border-border/70 pt-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-5 xl:border-r xl:border-border/70 xl:pr-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Detailed segment notes</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Use the marker rail above for quick previews, then scan these rows when you want
                the full list. Click a row to jump the video.
              </p>
            </div>
          </div>

          <div className="space-y-0">
            {payload.timelineSegments.length ? (
              payload.timelineSegments.map((segment) => (
                <TimelineRow
                  key={segment.id}
                  segment={segment}
                  active={segment.cutId ? activeCutIds.includes(segment.cutId) : false}
                  onHover={onPreviewTimeChange}
                  onJump={onJumpToTime}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                The backend returned no timeline segments for this analysis.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-5 border-t border-border/70 pt-6 xl:border-t-0 xl:pl-6 xl:pt-0">
          <div>
            <p className="text-sm font-medium text-foreground">Downloads</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Keep the raw artifacts close without promoting them into the main workspace.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <ExportLink href={payload.artifacts.processedJsonUrl} label="Analysis JSON" />
            <ExportLink href={payload.artifacts.cutListJsonUrl} label="Cut list JSON" />
            <ExportLink href={payload.artifacts.eventsCsvUrl} label="Event CSV" />
            {payload.artifacts.providerRawJsonUrl ? (
              <ExportLink
                href={payload.artifacts.providerRawJsonUrl}
                label="Provider response JSON"
              />
            ) : null}
            {payload.artifacts.rawPredictionsUrl ? (
              <ExportLink href={payload.artifacts.rawPredictionsUrl} label="Raw predictions" />
            ) : null}
          </div>

          {payload.exports.length ? (
            <div className="space-y-4 border-t border-border/70 pt-5">
              <p className="text-sm font-medium text-foreground">Past exports</p>
              {payload.exports
                .slice()
                .reverse()
                .map((exportItem) => (
                  <div
                    key={exportItem.exportId}
                    className="border-t border-border/70 pt-4 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          Trimmed to {formatSeconds(exportItem.trimmedDurationSec)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Removed {formatSeconds(exportItem.removedSeconds)} •{" "}
                          {formatDateTime(exportItem.createdAt)}
                        </p>
                      </div>
                      <a
                        href={exportItem.trimmedVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Open
                      </a>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Cut set: {exportItem.selectedCutIds.join(", ")}
                    </p>
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function ActionColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{title}</p>
      <div className="mt-3 flex flex-col gap-2">
        {items.length ? (
          items.map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 text-primary" />
              <span>{item}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No items in this lane.</p>
        )}
      </div>
    </div>
  );
}

function CutPlanRow({
  cut,
  active,
  title,
  activeLabel,
  inactiveLabel,
}: {
  cut: DeadspaceCut;
  active: boolean;
  title: string;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full border-t border-border/70 pt-4 pl-4 text-left first:border-t-0 first:pt-0",
        active
          ? "before:absolute before:bottom-0 before:left-0 before:top-4 before:w-0.5 before:rounded-full before:bg-primary first:before:top-0"
          : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{title}</p>
          <p className="mt-2 font-semibold text-foreground">
            {formatSeconds(cut.start)} to {formatSeconds(cut.end)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            active
              ? "border-primary bg-white text-primary"
              : "border-border bg-secondary text-secondary-foreground",
          )}
        >
          {active ? activeLabel : inactiveLabel}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{cut.reason}</p>
      <p className="mt-2 text-sm text-foreground">{cut.recommendedAction}</p>
    </div>
  );
}

function TimelineRow({
  segment,
  active,
  onHover,
  onJump,
}: {
  segment: TimelineSegment;
  active: boolean;
  onHover: (time: number | null) => void;
  onJump: (time: number) => void;
}) {
  const midpoint = segment.start + (segment.end - segment.start) / 2;

  return (
    <button
      type="button"
      className="w-full border-t border-border/70 py-4 text-left text-foreground transition-colors first:border-t-0 first:pt-0 hover:bg-muted/15"
      onMouseEnter={() => onHover(midpoint)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onJump(segment.start)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {segment.label}
            </Badge>
            <Badge variant="secondary">
              {formatSeconds(segment.start)} to {formatSeconds(segment.end)}
            </Badge>
            {active ? (
              <Badge variant="secondary" className="bg-primary/15 text-primary">
                in current trim
              </Badge>
            ) : null}
          </div>
          <p className="mt-3 font-medium text-foreground">{segment.reason}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            segment.severity === "high"
              ? "bg-rose-500/15 text-rose-200"
              : segment.severity === "medium"
                ? "bg-amber-500/15 text-amber-200"
                : "bg-sky-500/15 text-sky-200",
          )}
        >
          {segment.severity}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{segment.recommendedAction}</p>
    </button>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "justify-start")}
      target="_blank"
      rel="noreferrer"
    >
      <Download data-icon="inline-start" />
      {label}
    </a>
  );
}
