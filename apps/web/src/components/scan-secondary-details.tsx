"use client";

import { AlertTriangle, Check, Download, LoaderCircle, Scissors } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { AnalysisPayload, DeadspaceCut, TimelineSegment } from "@/lib/contracts";
import { formatDateTime, formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

type ScanSecondaryDetailsProps = {
  payload: AnalysisPayload;
  selectedCutIds: string[];
  trimError: string | null;
  trimPending: boolean;
  onExport: () => Promise<void>;
  onToggleCut: (cutId: string) => Promise<void>;
  onPreviewTimeChange: (time: number | null) => void;
  onJumpToTime: (time: number) => void;
};

export function ScanSecondaryDetails({
  payload,
  selectedCutIds,
  trimError,
  trimPending,
  onExport,
  onToggleCut,
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
          {selectedCutIds.length} selected
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
        <div className="surface-soft rounded-[1.7rem] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Guidance</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The action board stays compact so the strongest notes remain visible without
                taking over the page.
              </p>
            </div>
            <Badge variant="secondary">
              Action board
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ActionColumn title="Keep" items={payload.actionBoard.keep} />
            <ActionColumn title="Fix now" items={payload.actionBoard.fixNow} />
            <ActionColumn title="Test next" items={payload.actionBoard.testNext} />
            <ActionColumn title="Export plan" items={payload.actionBoard.exportPlan} />
          </div>
        </div>

        <div className="surface-soft rounded-[1.7rem] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Cuts</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Deadspace stays selected by default. Optional AI trims remain review-only until
                you choose them.
              </p>
            </div>
            <Badge variant="secondary" className="bg-primary/15 text-primary">
              {selectedCutIds.length} active
            </Badge>
          </div>

          <div className="mt-4 space-y-3">
            {payload.deadspaceCuts.length ? (
              payload.deadspaceCuts.map((cut) => (
                <SelectableCutCard
                  key={cut.id}
                  cut={cut}
                  selected={selectedCutIds.includes(cut.id)}
                  title="Default deadspace trim"
                  onToggle={onToggleCut}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No deterministic deadspace cut crossed the threshold on this scan.
              </p>
            )}
          </div>

          <Separator className="my-5 bg-border" />

          <div>
            <p className="text-sm font-medium text-foreground">Optional AI trims</p>
            <div className="mt-4 space-y-3">
              {payload.lowValueCuts.length ? (
                payload.lowValueCuts.map((cut) => (
                  <SelectableCutCard
                    key={cut.id}
                    cut={cut}
                    selected={selectedCutIds.includes(cut.id)}
                    title="AI suggestion"
                    onToggle={onToggleCut}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No extra low-value sections were suggested by the AI on this run.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              onClick={() => void onExport()}
              disabled={trimPending || !selectedCutIds.length}
            >
              {trimPending ? (
                <>
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  Exporting trim
                </>
              ) : (
                <>
                  <Scissors data-icon="inline-start" />
                  Export selected trim
                </>
              )}
            </Button>
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

          {trimError ? (
            <div className="mt-4 flex items-start gap-2 rounded-[1.25rem] border-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4" />
              <span>{trimError}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="surface-soft rounded-[1.7rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Detailed segment notes</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Use the marker timeline above for quick hover previews, then scan these rows when
                you want the full list. Click a row to jump the video.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {payload.timelineSegments.length ? (
              payload.timelineSegments.map((segment) => (
                <TimelineRow
                  key={segment.id}
                  segment={segment}
                  selected={segment.cutId ? selectedCutIds.includes(segment.cutId) : false}
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

        <section className="surface-soft rounded-[1.7rem] p-4">
          <p className="text-sm font-medium text-foreground">Downloads</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Keep the raw artifacts close without promoting them into the main workspace.
          </p>

          <div className="mt-4 flex flex-col gap-2">
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
            <>
              <Separator className="my-5 bg-border" />
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Past exports</p>
                {payload.exports
                  .slice()
                  .reverse()
                  .map((exportItem) => (
                    <div
                      key={exportItem.exportId}
                      className="surface rounded-[1.35rem] p-4"
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
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function ActionColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="surface rounded-[1.35rem] p-4">
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

function SelectableCutCard({
  cut,
  selected,
  title,
  onToggle,
}: {
  cut: DeadspaceCut;
  selected: boolean;
  title: string;
  onToggle: (cutId: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-[1.45rem] border-2 p-4 text-left transition-[transform,box-shadow,border-color,background-color]",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-[4px_4px_0_0_var(--color-primary)]"
          : "border-border bg-card text-foreground shadow-[4px_4px_0_0_var(--shadow-stamp)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--shadow-stamp)]",
      )}
      onClick={() => void onToggle(cut.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("text-xs uppercase tracking-[0.24em]", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{title}</p>
          <p className={cn("mt-2 font-semibold", selected ? "text-primary-foreground" : "text-foreground")}>
            {formatSeconds(cut.start)} to {formatSeconds(cut.end)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border-2 px-3 py-1 text-xs font-medium",
            selected
              ? "border-primary bg-white text-primary"
              : "border-border bg-secondary text-secondary-foreground",
          )}
        >
          {selected ? "Selected" : "Optional"}
        </span>
      </div>
      <p className={cn("mt-3 text-sm", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{cut.reason}</p>
      <p className={cn("mt-2 text-sm", selected ? "text-primary-foreground" : "text-foreground")}>{cut.recommendedAction}</p>
    </button>
  );
}

function TimelineRow({
  segment,
  selected,
  onHover,
  onJump,
}: {
  segment: TimelineSegment;
  selected: boolean;
  onHover: (time: number | null) => void;
  onJump: (time: number) => void;
}) {
  const midpoint = segment.start + (segment.end - segment.start) / 2;

  return (
    <button
      type="button"
      className="w-full rounded-[1.45rem] border-2 border-border bg-card p-4 text-left text-foreground shadow-[4px_4px_0_0_var(--shadow-stamp)] transition-[transform,box-shadow,border-color] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--shadow-stamp)]"
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
            {selected ? (
              <Badge variant="secondary" className="bg-primary/15 text-primary">
                selected cut
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
