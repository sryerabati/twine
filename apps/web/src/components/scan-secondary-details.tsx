"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnalysisPayload, DeadspaceCut } from "@/lib/contracts";
import { formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrimMode = "speech_safe" | "lenient";

type ScanSecondaryDetailsProps = {
  payload: AnalysisPayload;
  activeCutIds: string[];
  trimMode: TrimMode;
};

const DEFAULT_VISIBLE_OPPORTUNITIES = 2;

export function ScanSecondaryDetails({
  payload,
  activeCutIds,
  trimMode,
}: ScanSecondaryDetailsProps) {
  const [showAll, setShowAll] = useState(false);
  const opportunities = buildEditOpportunities(payload);
  const visibleOpportunities = showAll
    ? opportunities
    : opportunities.slice(0, DEFAULT_VISIBLE_OPPORTUNITIES);

  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Edit opportunities</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            The highest-impact trims to tighten pacing before you export. The first two stay
            visible by default so the editing decision stays fast.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{activeCutIds.length} active</Badge>
          <Badge variant="secondary" className="border border-primary/15 bg-primary/10 text-primary">
            {trimMode === "lenient" ? "Lenient mode" : "Speech-safe mode"}
          </Badge>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border/70 rounded-[1.15rem] border border-border/70 bg-card/50 px-4">
        {visibleOpportunities.length ? (
          visibleOpportunities.map((opportunity) => (
            <EditOpportunityRow
              key={opportunity.id}
              cut={opportunity}
              active={activeCutIds.includes(opportunity.id)}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No trim opportunity crossed the threshold on this scan.
          </p>
        )}
      </div>

      {opportunities.length > DEFAULT_VISIBLE_OPPORTUNITIES ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "Show fewer cuts" : "Show all cuts"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function EditOpportunityRow({
  cut,
  active,
}: {
  cut: DeadspaceCut;
  active: boolean;
}) {
  return (
    <article
      data-testid="edit-opportunity-row"
      className="py-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-primary/80">
              {formatSeconds(cut.start)} to {formatSeconds(cut.end)}
            </p>
            <p className="text-sm font-medium text-foreground">{labelForCutType(cut)}</p>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{cut.reason}</p>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            active ? "border border-primary/15 bg-primary/10 text-primary" : "text-muted-foreground",
          )}
        >
          {active ? "Included now" : "Optional"}
        </Badge>
      </div>

      <p className="mt-2 text-sm text-foreground/85">{cut.recommendedAction}</p>
    </article>
  );
}

function buildEditOpportunities(payload: AnalysisPayload) {
  const seen = new Set<string>();
  const cuts = [
    ...(payload.cutPlan.length ? payload.cutPlan : []),
    ...payload.deadspaceCuts,
    ...payload.lowValueCuts,
  ].filter((cut) => {
    if (seen.has(cut.id)) {
      return false;
    }
    seen.add(cut.id);
    return true;
  });

  return cuts.sort((left, right) => {
    if (left.defaultSelected !== right.defaultSelected) {
      return left.defaultSelected ? -1 : 1;
    }
    if (left.type !== right.type) {
      return left.type === "deadspace" ? -1 : 1;
    }
    return left.start - right.start;
  });
}

function labelForCutType(cut: DeadspaceCut) {
  return cut.type === "deadspace" ? "Automatic trim" : "Tighten this section";
}
