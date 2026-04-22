"use client";

import { startTransition, useEffect, useState } from "react";
import { LoaderCircle, MessageSquareMore, Orbit, Users2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAnalysisWorld, interviewAudienceWorld } from "@/lib/api";
import type {
  AudienceOutlook,
  AudienceWorld,
  AudienceWorldCohort,
  AudienceWorldInterview,
  AudienceWorldThread,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

const INTERVIEW_PROMPTS = [
  "What made you trust this?",
  "What made you skeptical?",
  "What would change your mind?",
] as const;

type AudienceWorldPanelProps = {
  analysisId: string;
  audienceOutlook: AudienceOutlook;
  initialWorld?: AudienceWorld | null;
};

export function AudienceWorldPanel({
  analysisId,
  audienceOutlook,
  initialWorld,
}: AudienceWorldPanelProps) {
  const [world, setWorld] = useState<AudienceWorld | null>(initialWorld ?? null);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [momentFilter, setMomentFilter] = useState<string>("all");
  const [selectedPrompt, setSelectedPrompt] = useState<(typeof INTERVIEW_PROMPTS)[number]>(
    INTERVIEW_PROMPTS[0],
  );
  const [interviews, setInterviews] = useState<AudienceWorldInterview[]>(
    filterInterviewsByPrompt(initialWorld?.interviews ?? [], INTERVIEW_PROMPTS[0]),
  );
  const [interviewPending, setInterviewPending] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);

  useEffect(() => {
    setWorld(initialWorld ?? null);
    setInterviews(filterInterviewsByPrompt(initialWorld?.interviews ?? [], selectedPrompt));
  }, [analysisId, initialWorld, selectedPrompt]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    async function loadWorld() {
      try {
        const next = await fetchAnalysisWorld(analysisId);
        if (!active) {
          return;
        }
        startTransition(() => {
          setWorld(next.world);
          setWorldError(null);
          const matchingInterviews = filterInterviewsByPrompt(next.world.interviews, selectedPrompt);
          if (matchingInterviews.length) {
            setInterviews(matchingInterviews);
          }
        });
        if (next.world.status === "hydrating" || next.world.status === "partial") {
          timer = window.setTimeout(loadWorld, 4000);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setWorldError(error instanceof Error ? error.message : "Could not load the agent world.");
      }
    }

    if (!initialWorld || initialWorld.status === "hydrating" || initialWorld.status === "partial") {
      void loadWorld();
    }

    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [analysisId, initialWorld, selectedPrompt]);

  const platformOptions = ["all", ...new Set(world?.platformBreakdown.map((item) => item.platform) ?? [])];
  const cohortOptions = ["all", ...new Set(world?.cohorts.map((item) => item.id) ?? [])];
  const momentOptions = ["all", ...new Set(world?.evidenceMoments.map((item) => item.windowId) ?? [])];
  const activeMoment = world?.evidenceMoments.find((item) => item.windowId === momentFilter);

  const visibleThreads = (world?.threads ?? []).filter((thread) => {
    if (platformFilter !== "all" && thread.platform !== platformFilter) {
      return false;
    }
    if (cohortFilter !== "all" && !thread.participatingCohortIds.includes(cohortFilter)) {
      return false;
    }
    if (activeMoment && !activeMoment.threadIds.includes(thread.id)) {
      return false;
    }
    return true;
  });

  async function loadInterviews(prompt: (typeof INTERVIEW_PROMPTS)[number]) {
    setSelectedPrompt(prompt);
    setInterviewError(null);

    const representativeIds = pickInterviewAgentIds(world, cohortFilter);
    if (!representativeIds.length) {
      setInterviews(filterInterviewsByPrompt(world?.interviews ?? [], prompt));
      return;
    }

    setInterviewPending(true);
    try {
      const response = await interviewAudienceWorld(analysisId, {
        agentIds: representativeIds,
        prompt,
        platform: platformFilter === "all" ? undefined : platformFilter,
      });
      const nextInterviews = response.interviews;
      setInterviews(nextInterviews);
      setWorld((current) =>
        current
          ? {
              ...current,
              status: response.cached ? current.status : "ready",
              interviews: mergeInterviews(current.interviews, nextInterviews),
            }
          : current,
      );
    } catch (error) {
      setInterviewError(
        error instanceof Error ? error.message : "Could not load live agent interviews.",
      );
    } finally {
      setInterviewPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Comment graph</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              The premium layer: real post threads, cohort drift, and agent evidence pulled from the
              MiroFish world instead of a polished summary pass.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="border border-primary/15 bg-primary/10 text-primary">
              {labelForWorldStatus(world?.status)}
            </Badge>
            <Badge variant="secondary">
              {world?.threads.length ?? 0} threads
            </Badge>
          </div>
        </div>

        <div className="mt-4 rounded-[1.25rem] border border-primary/15 bg-primary/[0.06] px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-primary/80">World pulse</p>
          <p className="mt-2 max-w-4xl text-base font-medium leading-7 text-foreground">
            {audienceOutlook.headline}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <FilterRow
            label="Platform"
            options={platformOptions}
            value={platformFilter}
            onChange={setPlatformFilter}
          />
          <FilterRow
            label="Cohort"
            options={cohortOptions}
            value={cohortFilter}
            labels={Object.fromEntries((world?.cohorts ?? []).map((item) => [item.id, item.label]))}
            onChange={setCohortFilter}
          />
          <FilterRow
            label="Moment"
            options={momentOptions}
            value={momentFilter}
            onChange={setMomentFilter}
          />
        </div>

        <div
          data-testid="audience-world-comment-graph"
          className="signal-scrollbar mt-4 max-h-[42rem] space-y-4 overflow-y-auto pr-1"
        >
          {visibleThreads.length ? (
            visibleThreads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                cohortLookup={Object.fromEntries((world?.cohorts ?? []).map((item) => [item.id, item.label]))}
              />
            ))
          ) : (
            <EmptyWorldState
              title="No matching threads"
              description="Change the world filters to pull a different cluster of reactions into view."
            />
          )}
        </div>

        {worldError ? (
          <p className="mt-4 text-sm text-amber-200">{worldError}</p>
        ) : null}
      </section>

      <section className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Cohorts</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Groups pulled from real agent profiles and activity patterns, not hand-balanced personas.
            </p>
          </div>
          <Users2 className="h-5 w-5 text-primary/80" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {(world?.cohorts ?? []).slice(0, 5).map((cohort) => (
            <CohortCard key={cohort.id} cohort={cohort} />
          ))}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Agent interviews</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Ask representative agents why they leaned in, pushed back, or what would change their mind.
            </p>
          </div>
          <Orbit className="h-5 w-5 text-primary/80" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {INTERVIEW_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              size="sm"
              variant={selectedPrompt === prompt ? "default" : "outline"}
              onClick={() => void loadInterviews(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>

        {interviewError ? (
          <p className="mt-3 text-sm text-amber-200">{interviewError}</p>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {interviewPending ? (
            <div className="rounded-[1.15rem] border border-border/70 bg-card/70 p-4 text-sm text-muted-foreground">
              <LoaderCircle className="mb-3 h-4 w-4 animate-spin text-primary" />
              Querying the live world for fresh agent answers.
            </div>
          ) : null}
          {interviews.length ? (
            interviews.map((interview) => (
              <InterviewCard
                key={`${interview.agentId}-${interview.prompt}-${interview.platform ?? "room"}`}
                interview={interview}
                agent={world?.agents.find((item) => item.id === interview.agentId) ?? null}
              />
            ))
          ) : !interviewPending ? (
            <EmptyWorldState
              title="No interview loaded yet"
              description="Choose a room prompt to ask the most representative agents what moved them."
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Why the room turned</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Each key video moment paired with the thread or cohort reaction that explains the shift.
            </p>
          </div>
          <MessageSquareMore className="h-5 w-5 text-primary/80" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {(world?.evidenceMoments ?? []).map((moment) => (
            <article
              key={moment.windowId}
              data-testid="audience-world-evidence-moment"
              className="rounded-[1.15rem] border border-border/70 bg-card/70 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{moment.headline}</p>
                <Badge variant="secondary">{moment.windowId.replace("window-", "Moment ")}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{moment.reason}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-primary/80">
                {formatMomentTime(moment.startSec, moment.endSec)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  labels,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-20 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs transition-colors",
            value === option
              ? "border-primary/30 bg-primary/12 text-primary"
              : "border-border/70 bg-card/70 text-muted-foreground hover:border-primary/20 hover:text-foreground",
          )}
        >
          {option === "all" ? "All" : labels?.[option] ?? option}
        </button>
      ))}
    </div>
  );
}

function ThreadCard({
  thread,
  cohortLookup,
}: {
  thread: AudienceWorldThread;
  cohortLookup: Record<string, string>;
}) {
  return (
    <article
      data-testid="audience-world-thread"
      className="rounded-[1.2rem] border border-border/70 bg-card/70 p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{thread.rootPost.speaker}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {thread.rootPost.handle}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{thread.rootPost.role}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{thread.platform}</Badge>
          <Badge
            variant="secondary"
            className={cn(
              thread.dominantStance === "negative"
                ? "border border-amber-300/20 bg-amber-400/[0.08] text-amber-200"
                : "border border-primary/15 bg-primary/10 text-primary",
            )}
          >
            {thread.dominantStance}
          </Badge>
          <Badge variant="secondary">{thread.engagement} engagement</Badge>
        </div>
      </div>

      <div className="mt-4 rounded-[1rem] border border-border/70 bg-background/70 p-4">
        <p className="text-sm leading-7 text-foreground">{thread.rootPost.content}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {thread.participatingCohortIds.map((cohortId) => (
          <Badge key={cohortId} variant="secondary" className="border border-primary/10 bg-primary/[0.06] text-primary">
            {cohortLookup[cohortId] ?? cohortId}
          </Badge>
        ))}
      </div>

      {thread.replies.length ? (
        <div className="mt-4 space-y-3 border-l border-primary/15 pl-4">
          {thread.replies.map((reply) => (
            <div key={reply.id} className="rounded-[1rem] border border-border/70 bg-background/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{reply.speaker}</p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {reply.handle}
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{reply.content}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CohortCard({ cohort }: { cohort: AudienceWorldCohort }) {
  return (
    <article
      data-testid="audience-world-cohort"
      className="rounded-[1.15rem] border border-border/70 bg-card/70 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{cohort.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{cohort.proofThreshold}</p>
        </div>
        <Badge variant="secondary">{cohort.size} agents</Badge>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/80">Liked</p>
          <p className="mt-1">{cohort.liked[0] ?? "No dominant win surfaced yet."}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-primary/80">Blocked</p>
          <p className="mt-1">{cohort.blocked[0] ?? "No major blocker surfaced yet."}</p>
        </div>
      </div>
    </article>
  );
}

function InterviewCard({
  interview,
  agent,
}: {
  interview: AudienceWorldInterview;
  agent: AudienceWorld["agents"][number] | null;
}) {
  return (
    <article className="rounded-[1.15rem] border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{agent?.displayName ?? `Agent ${interview.agentId}`}</p>
          <p className="mt-1 text-sm text-muted-foreground">{agent?.role ?? "Simulated audience agent"}</p>
        </div>
        <Badge variant="secondary">
          {interview.cached ? "Cached answer" : "Live answer"}
        </Badge>
      </div>
      <p className="mt-4 text-sm leading-7 text-foreground">{interview.response}</p>
    </article>
  );
}

function EmptyWorldState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.15rem] border border-dashed border-border/70 bg-card/40 p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function filterInterviewsByPrompt(
  interviews: AudienceWorldInterview[],
  prompt: string,
) {
  return interviews.filter((item) => item.prompt === prompt);
}

function pickInterviewAgentIds(world: AudienceWorld | null, cohortFilter: string) {
  if (!world) {
    return [];
  }
  if (cohortFilter !== "all") {
    return world.cohorts.find((item) => item.id === cohortFilter)?.representativeAgentIds.slice(0, 3) ?? [];
  }
  return world.agents.slice(0, 3).map((item) => item.id);
}

function mergeInterviews(
  current: AudienceWorldInterview[],
  next: AudienceWorldInterview[],
) {
  const merged = new Map<string, AudienceWorldInterview>();
  for (const interview of [...current, ...next]) {
    merged.set(
      `${interview.agentId}-${interview.prompt}-${interview.platform ?? "room"}`,
      interview,
    );
  }
  return Array.from(merged.values());
}

function labelForWorldStatus(status: AudienceWorld["status"] | undefined) {
  if (status === "ready") {
    return "World ready";
  }
  if (status === "partial") {
    return "World partially hydrated";
  }
  if (status === "unavailable") {
    return "World unavailable";
  }
  return "World hydrating";
}

function formatMomentTime(startSec: number, endSec: number) {
  return `${Math.round(startSec)}s-${Math.round(endSec)}s`;
}
