import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AudienceWorldPanel } from "@/components/audience-world-panel";
import type { AudienceOutlook, AudienceWorld } from "@/lib/contracts";

vi.mock("@/lib/api", () => ({
  fetchAnalysisWorld: vi.fn(),
  interviewAudienceWorld: vi.fn(),
}));

const audienceOutlook: AudienceOutlook = {
  headline: "The room is in early, but clarity drops halfway through.",
  summary: "Compact audience summary",
  likelyPraise: ["Strong opening line"],
  likelyPushback: ["Middle section gets muddy"],
  timeline: [
    {
      startSec: 0,
      endSec: 4,
      sentiment: 0.76,
      interest: 0.82,
      clarity: 0.71,
      trust: 0.74,
      shareIntent: 0.61,
      dropoffRisk: 0.18,
      primaryReaction: "leaning in",
      note: "The room gets the setup fast.",
    },
  ],
};

const world: AudienceWorld = {
  status: "ready",
  simulationId: "sim-123",
  platformBreakdown: [
    {
      platform: "reddit",
      volume: 6,
      engagement: 25,
      leaning: "mixed",
      dominantNarratives: ["Fast opener", "Needs stronger proof"],
    },
    {
      platform: "twitter",
      volume: 3,
      engagement: 16,
      leaning: "negative",
      dominantNarratives: ["Sharp hook, weaker close"],
    },
  ],
  cohorts: [
    {
      id: "ugc-creators",
      label: "UGC creators",
      size: 2,
      leaning: "positive",
      proofThreshold: "Needs clearer proof before the claim fully lands.",
      keyConcerns: ["The ending still drags."],
      liked: ["The opener solves a real workflow pain.", "The feature reveal lands fast."],
      blocked: ["The proof beat still feels thin.", "The ending needs trimming."],
      representativeAgentIds: [1, 3],
      momentIds: ["window-1", "window-2"],
    },
    {
      id: "growth-brand",
      label: "Growth and brand operators",
      size: 1,
      leaning: "negative",
      proofThreshold: "Needs clearer proof before the claim fully lands.",
      keyConcerns: ["This opener would stop my scroll, but the back half needs harder proof."],
      liked: ["The first frame earns attention."],
      blocked: ["The AI claim does not feel concrete enough."],
      representativeAgentIds: [2],
      momentIds: ["window-2"],
    },
  ],
  threads: [
    {
      id: "reddit-post-101",
      platform: "reddit",
      dominantStance: "mixed",
      engagement: 21,
      replyCount: 3,
      participatingCohortIds: ["ugc-creators"],
      rootPost: {
        id: "reddit-post-101",
        agentId: 1,
        speaker: "Jules",
        handle: "@jules_cut",
        role: "UGC creator and freelance editor",
        platform: "reddit",
        content: "UGC creators will save time on rough cuts with this workflow.",
        createdAt: "2026-04-21T12:00:00",
        likes: 12,
        shares: 3,
      },
      replies: [
        {
          id: "reddit-comment-1001",
          agentId: 2,
          speaker: "Nina",
          handle: "@nina_brand",
          role: "Brand strategist for consumer apps",
          platform: "reddit",
          content: "I like the speed, but the ending still drags.",
          createdAt: "2026-04-21T12:01:00",
          likes: 4,
          shares: 0,
        },
        {
          id: "reddit-comment-1002",
          agentId: 3,
          speaker: "Omar",
          handle: "@omar_growth",
          role: "Growth marketer and creative analyst",
          platform: "reddit",
          content: "I would test this on my next batch because the first beat lands fast.",
          createdAt: "2026-04-21T12:02:00",
          likes: 3,
          shares: 0,
        },
        {
          id: "reddit-comment-1003",
          agentId: 4,
          speaker: "Maya",
          handle: "@maya_cut",
          role: "Creator economy analyst",
          platform: "reddit",
          content: "I need one more proof beat before I would buy the whole promise.",
          createdAt: "2026-04-21T12:03:00",
          likes: 2,
          shares: 0,
        },
      ],
    },
    {
      id: "twitter-post-201",
      platform: "twitter",
      dominantStance: "negative",
      engagement: 16,
      replyCount: 0,
      participatingCohortIds: ["growth-brand"],
      rootPost: {
        id: "twitter-post-201",
        agentId: 3,
        speaker: "Omar",
        handle: "@omar_growth",
        role: "Growth marketer and creative analyst",
        platform: "twitter",
        content: "This opener would stop my scroll, but the back half needs harder proof.",
        createdAt: "2026-04-21T12:06:00",
        likes: 9,
        shares: 4,
      },
      replies: [],
    },
    {
      id: "reddit-post-301",
      platform: "reddit",
      dominantStance: "positive",
      engagement: 11,
      replyCount: 1,
      participatingCohortIds: ["ugc-creators"],
      rootPost: {
        id: "reddit-post-301",
        agentId: 4,
        speaker: "Maya",
        handle: "@maya_cut",
        role: "Creator economy analyst",
        platform: "reddit",
        content: "The first three seconds feel useful enough that I would keep watching.",
        createdAt: "2026-04-21T12:07:00",
        likes: 7,
        shares: 1,
      },
      replies: [
        {
          id: "reddit-comment-3001",
          agentId: 1,
          speaker: "Jules",
          handle: "@jules_cut",
          role: "UGC creator and freelance editor",
          platform: "reddit",
          content: "Same. The opener does real work.",
          createdAt: "2026-04-21T12:08:00",
          likes: 3,
          shares: 0,
        },
      ],
    },
    {
      id: "twitter-post-401",
      platform: "twitter",
      dominantStance: "negative",
      engagement: 8,
      replyCount: 0,
      participatingCohortIds: ["growth-brand"],
      rootPost: {
        id: "twitter-post-401",
        agentId: 2,
        speaker: "Nina",
        handle: "@nina_brand",
        role: "Brand strategist for consumer apps",
        platform: "twitter",
        content: "The promise is interesting, but the credibility gap grows in the middle.",
        createdAt: "2026-04-21T12:09:00",
        likes: 6,
        shares: 2,
      },
      replies: [],
    },
  ],
  agents: [
    {
      id: 1,
      displayName: "Jules",
      handle: "@jules_cut",
      role: "UGC creator and freelance editor",
      platforms: ["reddit"],
      bio: "Runs creator workflows for product launches.",
      stats: { totalActions: 7, redditActions: 7, twitterActions: 0 },
    },
    {
      id: 2,
      displayName: "Nina",
      handle: "@nina_brand",
      role: "Brand strategist for consumer apps",
      platforms: ["reddit", "twitter"],
      bio: "Looks for proof and trust gaps in short-form ads.",
      stats: { totalActions: 5, redditActions: 3, twitterActions: 2 },
    },
    {
      id: 3,
      displayName: "Omar",
      handle: "@omar_growth",
      role: "Growth marketer and creative analyst",
      platforms: ["reddit", "twitter"],
      bio: "Tracks hooks, drop-off, and shareability.",
      stats: { totalActions: 6, redditActions: 2, twitterActions: 4 },
    },
  ],
  interviews: [
    {
      agentId: 1,
      prompt: "What made you trust this?",
      response:
        "The hook solved a real workflow pain immediately, and the first feature beat felt specific enough to feel useful instead of generic.",
      platform: "reddit",
      cached: true,
    },
    {
      agentId: 2,
      prompt: "What made you skeptical?",
      response:
        "The promise is interesting, but the middle still feels like positioning before proof. I need harder evidence before I would repeat the claim to a team.",
      platform: "twitter",
      cached: true,
    },
  ],
  evidenceMoments: Array.from({ length: 8 }, (_, index) => ({
    windowId: `window-${index + 1}`,
    startSec: index * 2,
    endSec: index * 2 + 2,
    headline: `Moment ${index + 1} shifts the room`,
    reason: index % 2 === 0 ? "The hook sharpens." : "The proof softens.",
    threadIds: [index % 2 === 0 ? "reddit-post-101" : "twitter-post-201"],
    cohortIds: [index % 2 === 0 ? "ugc-creators" : "growth-brand"],
    agentIds: [index % 2 === 0 ? 1 : 2],
  })),
};

describe("AudienceWorldPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts collapsed and only shows two representative threads after opening the drawer", async () => {
    const { fetchAnalysisWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({ analysisId: "analysis-1", world });
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={world}
      />,
    );

    expect(screen.getByRole("button", { name: /open evidence drawer/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Threads" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));

    expect(screen.getByRole("tab", { name: "Threads" })).toHaveAttribute("data-active");
    expect(screen.getAllByTestId("audience-world-thread")).toHaveLength(2);
    expect(screen.queryByText(/The promise is interesting, but the credibility gap grows in the middle\./i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show all threads/i }));

    expect(screen.getAllByTestId("audience-world-thread")).toHaveLength(4);
    expect(screen.getByText(/The promise is interesting, but the credibility gap grows in the middle\./i)).toBeInTheDocument();
  });

  it("expands an individual thread inline to reveal the remaining replies", async () => {
    const { fetchAnalysisWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({ analysisId: "analysis-1", world });
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={world}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    expect(screen.queryByText(/I need one more proof beat before I would buy the whole promise\./i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand thread for jules/i }));

    expect(screen.getByText(/I need one more proof beat before I would buy the whole promise\./i)).toBeInTheDocument();
  });

  it("switches to a single-response interview view and lets the user expand the full answer", async () => {
    const { fetchAnalysisWorld, interviewAudienceWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({ analysisId: "analysis-1", world });
    vi.mocked(interviewAudienceWorld).mockResolvedValue({
      analysisId: "analysis-1",
      prompt: "What made you skeptical?",
      cached: false,
      interviews: [
        {
          agentId: 2,
          prompt: "What made you skeptical?",
          response:
            "The promise is interesting, but the middle still feels like positioning before proof. I need harder evidence before I would repeat the claim to a team. That trust gap is what keeps me from fully buying the angle right now.",
          platform: "twitter",
          cached: false,
        },
      ],
    });
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={world}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    await user.click(screen.getByRole("tab", { name: "Interviews" }));
    expect(screen.queryByText(/What made you trust this\?/i)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /what made you skeptical\?/i }));

    await waitFor(() => {
      expect(interviewAudienceWorld).toHaveBeenCalled();
    });

    const response = screen.getByTestId("audience-world-interview-response");
    expect(within(response).getByText("Nina")).toBeInTheDocument();
    expect(screen.getAllByTestId("audience-world-interview-response")).toHaveLength(1);

    const preview = screen.getByTestId("audience-world-interview-preview");
    expect(preview.className).toContain("line-clamp");

    await user.click(screen.getByRole("button", { name: /read full response/i }));

    expect(preview.className).not.toContain("line-clamp");
  });

  it("loads a new interview when the user selects a different agent without a cached response", async () => {
    const { fetchAnalysisWorld, interviewAudienceWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({ analysisId: "analysis-1", world });
    vi.mocked(interviewAudienceWorld).mockResolvedValue({
      analysisId: "analysis-1",
      prompt: "What made you trust this?",
      cached: false,
      interviews: [
        {
          agentId: 3,
          prompt: "What made you trust this?",
          response:
            "The first five seconds frame the product as a workflow shortcut instead of hype, which makes the promise feel usable right away.",
          platform: "twitter",
          cached: false,
        },
      ],
    });
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={world}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    await user.click(screen.getByRole("tab", { name: "Interviews" }));

    expect(screen.getByTestId("audience-world-interview-response")).toHaveTextContent("Jules");

    await user.click(screen.getByRole("button", { name: /omar/i }));

    await waitFor(() => {
      expect(interviewAudienceWorld).toHaveBeenCalledWith("analysis-1", {
        agentIds: [3],
        prompt: "What made you trust this?",
        platform: undefined,
      });
    });

    expect(await screen.findByTestId("audience-world-interview-response")).toHaveTextContent("Omar");
    expect(screen.getByText(/workflow shortcut instead of hype/i)).toBeInTheDocument();
  });

  it("prefers the first available matching interview over the first representative agent", async () => {
    const { fetchAnalysisWorld } = await import("@/lib/api");
    const sparseInterviewWorld: AudienceWorld = {
      ...world,
      cohorts: [
        {
          ...world.cohorts[0],
          representativeAgentIds: [3, 1],
        },
        world.cohorts[1],
      ],
      interviews: [
        {
          agentId: 1,
          prompt: "What made you trust this?",
          response:
            "The hook solved a real workflow pain immediately, and the first feature beat felt specific enough to feel useful instead of generic.",
          platform: "reddit",
          cached: true,
        },
      ],
    };
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({
      analysisId: "analysis-1",
      world: sparseInterviewWorld,
    });
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={sparseInterviewWorld}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    await user.click(screen.getByRole("tab", { name: "Interviews" }));

    expect(screen.getByTestId("audience-world-interview-response")).toHaveTextContent("Jules");
    expect(screen.queryByText(/no interview loaded yet/i)).not.toBeInTheDocument();
  });

  it("keeps the selected agent visible when no interview is available for that prompt", async () => {
    const { fetchAnalysisWorld, interviewAudienceWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({ analysisId: "analysis-1", world });
    vi.mocked(interviewAudienceWorld).mockRejectedValue(
      new Error("Live interviews are unavailable and no cached responses matched this prompt."),
    );
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={world}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    await user.click(screen.getByRole("tab", { name: "Interviews" }));
    await user.click(screen.getByRole("button", { name: /omar/i }));

    await waitFor(() => {
      expect(interviewAudienceWorld).toHaveBeenCalledWith("analysis-1", {
        agentIds: [3],
        prompt: "What made you trust this?",
        platform: undefined,
      });
    });

    expect(
      screen.getByText("Live interviews are unavailable and no cached responses matched this prompt."),
    ).toBeInTheDocument();
    expect(screen.getByText("No interview available for Omar")).toBeInTheDocument();
  });

  it("renders the moments tab as a vertical timeline and reveals more than six moments on demand", async () => {
    const { fetchAnalysisWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({ analysisId: "analysis-1", world });
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={world}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    await user.click(screen.getByRole("tab", { name: "Moments" }));

    expect(screen.getAllByTestId("audience-world-moment-row")).toHaveLength(6);
    expect(screen.queryByText(/Moment 8 shifts the room/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show all moments/i }));

    expect(screen.getAllByTestId("audience-world-moment-row")).toHaveLength(8);
    expect(screen.getByText(/Moment 8 shifts the room/i)).toBeInTheDocument();
  });

  it("does not emit duplicate-key warnings when a cohort repeats the same insight text", async () => {
    const { fetchAnalysisWorld } = await import("@/lib/api");
    const duplicateWorld: AudienceWorld = {
      ...world,
      cohorts: [
        {
          ...world.cohorts[0],
          liked: [
            "AI analysis with a brain scan sounds like a marketing buzzword. I want to see the actual processing logic behind how it identifies high-value frames before I trust the output.",
            "AI analysis with a brain scan sounds like a marketing buzzword. I want to see the actual processing logic behind how it identifies high-value frames before I trust the output.",
          ],
          blocked: [
            "Wait, she's only been doing UGC for three weeks? Is this app actually that intuitive for beginners or is this just a really good hook? Curiosity peaked.",
            "Wait, she's only been doing UGC for three weeks? Is this app actually that intuitive for beginners or is this just a really good hook? Curiosity peaked.",
          ],
        },
      ],
    };
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({ analysisId: "analysis-1", world: duplicateWorld });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <AudienceWorldPanel
        analysisId="analysis-1"
        audienceOutlook={audienceOutlook}
        initialWorld={duplicateWorld}
      />,
    );

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    await user.click(screen.getByRole("tab", { name: "Cohorts" }));

    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("Encountered two children with the same key"),
    );

    consoleError.mockRestore();
  });
});
