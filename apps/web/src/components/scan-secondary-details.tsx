"use client";

import { Badge } from "@/components/ui/badge";
import type { AnalysisPayload, DeadspaceCut } from "@/lib/contracts";
import { formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrimMode = "speech_safe" | "lenient";

type ScanSecondaryDetailsProps = {
  payload: AnalysisPayload;
  activeCutIds: string[];
  trimMode: TrimMode;
};

export function ScanSecondaryDetails({
  payload,
  activeCutIds,
  trimMode,
}: ScanSecondaryDetailsProps) {
  return (
    <section className="surface rounded-[2.4rem] p-6 text-foreground">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Secondary details
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Trim decisions that change what the simulated audience will feel in the final cut.
          </p>
        </div>
        <Badge variant="secondary">
          {activeCutIds.length} in current trim
        </Badge>
      </div>

      <div className="mt-6 space-y-5 border-t border-border/70 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Cuts</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Speech-safe deadspace trims run automatically. Lenient mode adds only the extra AI
              cuts that make the audience-facing export tighter.
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
      </div>
    </section>
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
