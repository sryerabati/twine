"use client";

import { startTransition, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAnalysisWorld, interviewAudienceWorld } from "@/lib/api";
import type {
  AudienceOutlook,
  AudienceWorld,
  AudienceWorldAgent,
  AudienceWorldCohort,
  AudienceWorldInterview,
  AudienceWorldThread,
} from "@/lib/contracts";
import { formatSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

const INTERVIEW_PROMPTS = [
  "What made you trust this?",
  "What made you skeptical?",
  "What would change your mind?",
] as const;
const INTERVIEWS_NOT_READY_MESSAGE =
  "Interviews aren't ready yet for this prompt. Re-scan this video to generate them.";

const DEFAULT_VISIBLE_THREADS = 2;
const DEFAULT_VISIBLE_MOMENTS = 6;

type EvidenceTab = "threads" | "cohorts" | "interviews" | "moments";
type AudienceWorldPanelProps = {
  analysisId: string;
  audienceOutlook: AudienceOutlook;
  initialWorld?: AudienceWorld | null;
};

function resolveInterviewError(error: unknown, fallbackMessage: string): string {
  const message = error instanceof Error ? error.message : fallbackMessage;
  if (
    message.includes("Live interviews are unavailable") &&
    message.includes("no cached responses matched this prompt")
  ) {
    return INTERVIEWS_NOT_READY_MESSAGE;
  }
  return message;
}

export function AudienceWorldPanel({
  analysisId,
  audienceOutlook,
  initialWorld,
}: AudienceWorldPanelProps) {
  const [world, setWorld] = useState<AudienceWorld | null>(initialWorld ?? null);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("threads");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [momentFilter, setMomentFilter] = useState<string>("all");
  const [showAllThreads, setShowAllThreads] = useState(false);
  const [expandedThreadIds, setExpandedThreadIds] = useState<string[]>([]);
  const [showAllMoments, setShowAllMoments] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<(typeof INTERVIEW_PROMPTS)[number]>(
    INTERVIEW_PROMPTS[0],
  );
  const [selectedInterviewAgentId, setSelectedInterviewAgentId] = useState<number | null>(null);
  const [hasManualInterviewSelection, setHasManualInterviewSelection] = useState(false);
  const [expandedInterviewKey, setExpandedInterviewKey] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<AudienceWorldInterview[]>(
    filterInterviewsByPrompt(initialWorld?.interviews ?? [], INTERVIEW_PROMPTS[0]),
  );
  const [interviewPending, setInterviewPending] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this resets local view state when the source analysis changes.
    setWorld(initialWorld ?? null);
    setIsOpen(false);
    setShowAllThreads(false);
    setShowAllMoments(false);
    setExpandedThreadIds([]);
    setSelectedInterviewAgentId(null);
    setHasManualInterviewSelection(false);
    setExpandedInterviewKey(null);
    setInterviewError(null);
  }, [analysisId, initialWorld]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the visible interview list is keyed by the selected prompt.
    setInterviews(filterInterviewsByPrompt(initialWorld?.interviews ?? [], selectedPrompt));
  }, [initialWorld, selectedPrompt]);

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
  const cohortLookup = Object.fromEntries((world?.cohorts ?? []).map((item) => [item.id, item.label]));
  const cohortOptions = ["all", ...Object.keys(cohortLookup)];
  const momentOptions = ["all", ...new Set(world?.evidenceMoments.map((item) => item.windowId) ?? [])];
  const activeMoment = world?.evidenceMoments.find((item) => item.windowId === momentFilter) ?? null;
  const agentLookup = new Map((world?.agents ?? []).map((item) => [item.id, item]));

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

  const visibleCohorts = (world?.cohorts ?? []).filter((cohort) => {
    if (cohortFilter !== "all" && cohort.id !== cohortFilter) {
      return false;
    }
    if (activeMoment && !activeMoment.cohortIds.includes(cohort.id)) {
      return false;
    }
    if (platformFilter !== "all") {
      const cohortAgents = cohort.representativeAgentIds
        .map((id) => agentLookup.get(id))
        .filter((agent): agent is AudienceWorldAgent => Boolean(agent));
      if (cohortAgents.length && !cohortAgents.some((agent) => agent.platforms.includes(platformFilter))) {
        return false;
      }
    }
    return true;
  });

  const visibleMoments = (world?.evidenceMoments ?? []).filter((moment) => {
    if (momentFilter !== "all" && moment.windowId !== momentFilter) {
      return false;
    }
    if (cohortFilter !== "all" && !moment.cohortIds.includes(cohortFilter)) {
      return false;
    }
    if (platformFilter !== "all") {
      const momentThreads = (world?.threads ?? []).filter((thread) => moment.threadIds.includes(thread.id));
      if (momentThreads.length && !momentThreads.some((thread) => thread.platform === platformFilter)) {
        return false;
      }
    }
    return true;
  });

  const interviewAgents = pickInterviewAgents(world, visibleCohorts, cohortFilter, platformFilter, activeMoment);
  const selectedInterview =
    selectedInterviewAgentId === null
      ? interviews[0] ?? null
      : interviews.find((item) => item.agentId === selectedInterviewAgentId) ?? null;
  const selectedInterviewAgent =
    (selectedInterviewAgentId === null
      ? null
      : interviewAgents.find((agent) => agent.id === selectedInterviewAgentId)) ??
    (selectedInterview ? agentLookup.get(selectedInterview.agentId) ?? null : null);
  const selectedInterviewKey = selectedInterview
    ? `${selectedInterview.agentId}-${selectedInterview.prompt}-${selectedInterview.platform ?? "room"}`
    : null;

  useEffect(() => {
    const availableIds = interviewAgents.map((agent) => agent.id);
    if (!availableIds.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the selected interview target must stay aligned with the filtered agent list.
      setSelectedInterviewAgentId(null);
      setHasManualInterviewSelection(false);
      return;
    }

    if (
      hasManualInterviewSelection &&
      selectedInterviewAgentId !== null &&
      availableIds.includes(selectedInterviewAgentId)
    ) {
      return;
    }

    const nextSelectedAgentId = pickDefaultInterviewAgentId(interviews, availableIds);
    if (hasManualInterviewSelection) {
      setHasManualInterviewSelection(false);
    }
    if (selectedInterviewAgentId !== nextSelectedAgentId) {
      setSelectedInterviewAgentId(nextSelectedAgentId);
    }
  }, [hasManualInterviewSelection, interviewAgents, interviews, selectedInterviewAgentId]);

  async function loadInterviews(prompt: (typeof INTERVIEW_PROMPTS)[number]) {
    setSelectedPrompt(prompt);
    setExpandedInterviewKey(null);
    setInterviewError(null);

    const representativeIds = Array.from(
      new Set([
        ...(selectedInterviewAgentId === null ? [] : [selectedInterviewAgentId]),
        ...interviewAgents.map((agent) => agent.id),
      ]),
    ).slice(0, 3);
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
      setInterviewError(resolveInterviewError(error, "Could not load live agent interviews."));
    } finally {
      setInterviewPending(false);
    }
  }

  async function selectInterviewAgent(agentId: number) {
    setSelectedInterviewAgentId(agentId);
    setHasManualInterviewSelection(true);
    setExpandedInterviewKey(null);
    setInterviewError(null);

    const existingInterview =
      interviews.find((item) => item.agentId === agentId) ??
      filterInterviewsByPrompt(world?.interviews ?? [], selectedPrompt).find((item) => item.agentId === agentId);
    if (existingInterview) {
      return;
    }

    setInterviewPending(true);
    try {
      const response = await interviewAudienceWorld(analysisId, {
        agentIds: [agentId],
        prompt: selectedPrompt,
        platform: platformFilter === "all" ? undefined : platformFilter,
      });
      setInterviews((current) => mergeInterviews(current, response.interviews));
      setWorld((current) =>
        current
          ? {
              ...current,
              status: response.cached ? current.status : "ready",
              interviews: mergeInterviews(current.interviews, response.interviews),
            }
          : current,
      );
    } catch (error) {
      setInterviewError(resolveInterviewError(error, "Could not load an agent interview."));
    } finally {
      setInterviewPending(false);
    }
  }

  return (
    <section className="rounded-[1.5rem] border-[3px] border-border/70 bg-background/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Room evidence</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Open this only when you need proof. The main edit decision should already be clear
            before you come down here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border border-primary/15 bg-primary/10 text-primary">
            {labelForWorldStatus(world?.status)}
          </Badge>
          <Badge variant="secondary">{world?.threads.length ?? 0} threads</Badge>
        </div>
      </div>

      <div className="mt-4 rounded-[1.2rem] border-[3px] border-border/70 bg-card/40 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="sticker sticker-green">Evidence preview</span>
            <p className="mt-2 text-sm leading-6 text-foreground">{audienceOutlook.headline}</p>
          </div>
          <Button
            type="button"
            variant={isOpen ? "default" : "outline"}
            size="sm"
            aria-expanded={isOpen}
            aria-controls="room-evidence-panel"
            onClick={() => setIsOpen((current) => !current)}
          >
            {isOpen ? "Collapse evidence drawer" : "Open evidence drawer"}
          </Button>
        </div>
      </div>

      {isOpen ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as EvidenceTab)}
          className="mt-5"
        >
          <div
            id="room-evidence-panel"
            className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
          >
            <TabsList variant="line" className="w-full justify-start sm:w-fit">
              <TabsTrigger value="threads">Threads</TabsTrigger>
              <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
              <TabsTrigger value="interviews">Interviews</TabsTrigger>
              <TabsTrigger value="moments">Moments</TabsTrigger>
            </TabsList>

            <FilterToolbar
              cohortLookup={cohortLookup}
              cohortOptions={cohortOptions}
              cohortValue={cohortFilter}
              momentOptions={momentOptions}
              momentValue={momentFilter}
              platformOptions={platformOptions}
              platformValue={platformFilter}
              onCohortChange={setCohortFilter}
              onMomentChange={setMomentFilter}
              onPlatformChange={setPlatformFilter}
            />
          </div>

          {worldError ? (
            <p className="mt-4 text-sm text-amber-200">{worldError}</p>
          ) : null}

          <TabsContent value="threads" className="mt-5 space-y-3">
            {visibleThreads.length ? (
              <>
                {visibleThreads
                  .slice(0, showAllThreads ? visibleThreads.length : DEFAULT_VISIBLE_THREADS)
                  .map((thread) => (
                    <ThreadCard
                      key={thread.id}
                      cohortLookup={cohortLookup}
                      expanded={expandedThreadIds.includes(thread.id)}
                      onToggleExpanded={() =>
                        setExpandedThreadIds((current) =>
                          current.includes(thread.id)
                            ? current.filter((item) => item !== thread.id)
                            : [...current, thread.id],
                        )
                      }
                      thread={thread}
                    />
                  ))}

                {visibleThreads.length > DEFAULT_VISIBLE_THREADS ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllThreads((current) => !current)}
                  >
                    {showAllThreads ? "Show fewer threads" : "Show all threads"}
                  </Button>
                ) : null}
              </>
            ) : (
              <EmptyWorldState
                title="No matching threads"
                description="Change the filters to pull a different slice of the room into view."
              />
            )}
          </TabsContent>

          <TabsContent value="cohorts" className="mt-5">
            {visibleCohorts.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleCohorts.slice(0, 4).map((cohort) => (
                  <CohortCard
                    key={cohort.id}
                    cohort={cohort}
                    representatives={cohort.representativeAgentIds
                      .map((id) => agentLookup.get(id))
                      .filter((agent): agent is AudienceWorldAgent => Boolean(agent))}
                  />
                ))}
              </div>
            ) : (
              <EmptyWorldState
                title="No matching cohorts"
                description="The current filters remove every cohort from this evidence slice."
              />
            )}
          </TabsContent>

          <TabsContent value="interviews" className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2">
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
              <p className="text-sm text-amber-200">{interviewError}</p>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
              <div className="space-y-2">
                {interviewAgents.length ? (
                  interviewAgents.map((agent) => {
                    const selected = agent.id === (selectedInterviewAgentId ?? selectedInterview?.agentId);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => void selectInterviewAgent(agent.id)}
                        className={cn(
                          "spring w-full rounded-[0.95rem] border-[3px] px-3 py-3 text-left shadow-[5px_5px_0_0_var(--shadow-stamp)] transition-colors hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[8px_8px_0_0_var(--shadow-stamp)]",
                          selected
                            ? "border-primary/30 bg-primary/12 text-foreground"
                            : "border-border/70 bg-card/40 text-muted-foreground hover:border-primary/20 hover:text-foreground",
                        )}
                      >
                        <p className="text-sm font-medium">{agent.displayName}</p>
                        <p className="mt-1 text-xs leading-5">{agent.role}</p>
                      </button>
                    );
                  })
                ) : (
                  <EmptyWorldState
                    title="No representative agents"
                    description="The current filter combination does not expose any interview targets."
                  />
                )}
              </div>

              <div className="rounded-[1rem] border-[3px] border-border/70 bg-card/40 p-4">
                {interviewPending ? (
                  <div className="text-sm text-muted-foreground">
                    <LoaderCircle className="mb-3 h-4 w-4 animate-spin text-primary" />
                    Querying the live world for fresh agent answers.
                  </div>
                ) : selectedInterview ? (
                  <article data-testid="audience-world-interview-response">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {agentLookup.get(selectedInterview.agentId)?.displayName ?? `Agent ${selectedInterview.agentId}`}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {agentLookup.get(selectedInterview.agentId)?.role ?? "Simulated audience agent"}
                        </p>
                      </div>
                      <span className={cn(selectedInterview.cached ? "sticker" : "sticker sticker-green")}>
                        {selectedInterview.cached ? "Cached" : "Live"}
                      </span>
                    </div>

                    <p
                      data-testid="audience-world-interview-preview"
                      className={cn(
                        "mt-4 text-sm leading-7 text-foreground",
                        expandedInterviewKey !== selectedInterviewKey ? "line-clamp-6" : "",
                      )}
                    >
                      {selectedInterview.response}
                    </p>

                    {selectedInterview.response.length > 220 ? (
                      <div className="mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setExpandedInterviewKey((current) =>
                              current === selectedInterviewKey ? null : selectedInterviewKey,
                            )
                          }
                        >
                          {expandedInterviewKey === selectedInterviewKey ? "Collapse response" : "Read full response"}
                        </Button>
                      </div>
                    ) : null}
                  </article>
                ) : (
                  <EmptyWorldState
                    title={
                      selectedInterviewAgent
                        ? `No interview available for ${selectedInterviewAgent.displayName}`
                        : "No interview loaded yet"
                    }
                    description={
                      selectedInterviewAgent
                        ? "Try a different prompt or representative agent to inspect the room in more detail."
                        : "Pick a prompt and a representative agent to inspect the room in more detail."
                    }
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="moments" className="mt-5 space-y-2">
            {visibleMoments.length ? (
              <>
                {visibleMoments
                  .slice(0, showAllMoments ? visibleMoments.length : DEFAULT_VISIBLE_MOMENTS)
                  .map((moment) => (
                    <MomentRow
                      key={moment.windowId}
                      cohortLookup={cohortLookup}
                      moment={moment}
                      threadLookup={new Map((world?.threads ?? []).map((thread) => [thread.id, thread]))}
                    />
                  ))}

                {visibleMoments.length > DEFAULT_VISIBLE_MOMENTS ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllMoments((current) => !current)}
                  >
                    {showAllMoments ? "Show fewer moments" : "Show all moments"}
                  </Button>
                ) : null}
              </>
            ) : (
              <EmptyWorldState
                title="No matching moments"
                description="No evidence moments match the current filter combination."
              />
            )}
          </TabsContent>
        </Tabs>
      ) : null}
    </section>
  );
}

function FilterToolbar({
  platformOptions,
  platformValue,
  cohortOptions,
  cohortValue,
  momentOptions,
  momentValue,
  cohortLookup,
  onPlatformChange,
  onCohortChange,
  onMomentChange,
}: {
  platformOptions: string[];
  platformValue: string;
  cohortOptions: string[];
  cohortValue: string;
  momentOptions: string[];
  momentValue: string;
  cohortLookup: Record<string, string>;
  onPlatformChange: (value: string) => void;
  onCohortChange: (value: string) => void;
  onMomentChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:w-[30rem]">
      <ToolbarSelect
        label="Platform"
        value={platformValue}
        options={platformOptions.map((option) => ({
          label: option === "all" ? "All platforms" : option,
          value: option,
        }))}
        onChange={onPlatformChange}
      />
      <ToolbarSelect
        label="Cohort"
        value={cohortValue}
        options={cohortOptions.map((option) => ({
          label: option === "all" ? "All cohorts" : cohortLookup[option] ?? option,
          value: option,
        }))}
        onChange={onCohortChange}
      />
      <ToolbarSelect
        label="Moment"
        value={momentValue}
        options={momentOptions.map((option) => ({
          label: option === "all" ? "All moments" : option.replace("window-", "Moment "),
          value: option,
        }))}
        onChange={onMomentChange}
      />
    </div>
  );
}

function ToolbarSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="sticker">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[0.95rem] border-[3px] border-border/70 bg-card/80 px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ThreadCard({
  thread,
  cohortLookup,
  expanded,
  onToggleExpanded,
}: {
  thread: AudienceWorldThread;
  cohortLookup: Record<string, string>;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const visibleReplies = expanded ? thread.replies : thread.replies.slice(0, 1);

  return (
    <article
      data-testid="audience-world-thread"
      className="rounded-[1rem] border-[3px] border-border/70 bg-card/40 p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{thread.rootPost.speaker}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {thread.rootPost.handle}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{thread.rootPost.role}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border border-primary/15 bg-primary/10 text-primary">
            {thread.platform}
          </Badge>
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
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {thread.engagement} engagement
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-[0.95rem] border-[3px] border-border/70 bg-background/60 p-3">
        <p className={cn("text-sm leading-6 text-foreground", !expanded ? "line-clamp-3" : "")}>
          {thread.rootPost.content}
        </p>
      </div>

      {thread.participatingCohortIds.length ? (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {thread.participatingCohortIds.map((cohortId) => cohortLookup[cohortId] ?? cohortId).join(" · ")}
        </p>
      ) : null}

      {visibleReplies.length ? (
        <div className="mt-3 space-y-2 border-l border-primary/15 pl-3">
          {visibleReplies.map((reply) => (
            <div key={reply.id} className="rounded-[0.95rem] border-[3px] border-border/70 bg-background/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{reply.speaker}</p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {reply.handle}
                </p>
              </div>
              <p className={cn("mt-2 text-sm leading-6 text-muted-foreground", !expanded ? "line-clamp-2" : "")}>
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {thread.replies.length > 1 ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleExpanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} thread for ${thread.rootPost.speaker}`}
          >
            {expanded ? "Collapse thread" : "Expand thread"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function CohortCard({
  cohort,
  representatives,
}: {
  cohort: AudienceWorldCohort;
  representatives: AudienceWorldAgent[];
}) {
  return (
    <article
      data-testid="audience-world-cohort"
      className="rounded-[1rem] border-[3px] border-border/70 bg-card/40 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{cohort.label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{cohort.proofThreshold}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {cohort.size} agents
          </span>
          <Badge
            variant="secondary"
            className={cn(
              cohort.leaning === "negative"
                ? "border border-amber-300/20 bg-amber-400/[0.08] text-amber-200"
                : "border border-primary/15 bg-primary/10 text-primary",
            )}
          >
            {cohort.leaning}
          </Badge>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div>
          <span className="sticker sticker-green">What landed</span>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {(cohort.liked.length ? cohort.liked : ["No dominant win surfaced yet."])
              .slice(0, 2)
              .map((item, index) => (
                <li key={`${cohort.id}-liked-${index}`}>{item}</li>
              ))}
          </ul>
        </div>
        <div>
          <span className="sticker">What blocked trust</span>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {(cohort.blocked.length ? cohort.blocked : ["No major blocker surfaced yet."])
              .slice(0, 2)
              .map((item, index) => (
                <li key={`${cohort.id}-blocked-${index}`}>{item}</li>
              ))}
          </ul>
        </div>
      </div>

      {representatives.length ? (
        <p className="mt-4 text-xs leading-6 text-muted-foreground">
          Representative agents: {representatives.map((agent) => agent.displayName).join(", ")}
        </p>
      ) : null}
    </article>
  );
}

function MomentRow({
  moment,
  cohortLookup,
  threadLookup,
}: {
  moment: AudienceWorld["evidenceMoments"][number];
  cohortLookup: Record<string, string>;
  threadLookup: Map<string, AudienceWorldThread>;
}) {
  const firstThread = moment.threadIds[0] ? threadLookup.get(moment.threadIds[0]) : null;
  return (
    <article
      data-testid="audience-world-moment-row"
      className="border-l border-primary/20 pl-4 py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{moment.headline}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{moment.reason}</p>
        </div>
        <p className="text-xs uppercase tracking-[0.22em] text-primary/80">
          {formatMomentTime(moment.startSec, moment.endSec)}
        </p>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        {firstThread ? `${firstThread.platform} thread` : "Room evidence"} ·{" "}
        {(moment.cohortIds.map((cohortId) => cohortLookup[cohortId] ?? cohortId).join(", ")) || "General room"}
      </p>
    </article>
  );
}

function EmptyWorldState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.15rem] border-[3px] border-dashed border-border/70 bg-card/40 p-4">
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

function pickInterviewAgents(
  world: AudienceWorld | null,
  visibleCohorts: AudienceWorldCohort[],
  cohortFilter: string,
  platformFilter: string,
  activeMoment: AudienceWorld["evidenceMoments"][number] | null,
) {
  if (!world) {
    return [];
  }

  let candidateIds: number[] = [];
  if (activeMoment) {
    candidateIds = activeMoment.agentIds;
  } else if (cohortFilter !== "all") {
    candidateIds =
      world.cohorts.find((item) => item.id === cohortFilter)?.representativeAgentIds ?? [];
  } else if (visibleCohorts.length) {
    candidateIds = visibleCohorts.flatMap((cohort) => cohort.representativeAgentIds);
  }

  const candidates = (candidateIds.length
    ? candidateIds.map((id) => world.agents.find((agent) => agent.id === id)).filter(Boolean)
    : world.agents
  ).filter((agent): agent is AudienceWorldAgent => Boolean(agent));

  return candidates.filter((agent) => {
    if (platformFilter !== "all" && !agent.platforms.includes(platformFilter)) {
      return false;
    }
    return true;
  });
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

function pickDefaultInterviewAgentId(interviews: AudienceWorldInterview[], availableIds: number[]) {
  return interviews.find((interview) => availableIds.includes(interview.agentId))?.agentId ?? availableIds[0] ?? null;
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
  return `${formatSeconds(startSec)} to ${formatSeconds(endSec)}`;
}
