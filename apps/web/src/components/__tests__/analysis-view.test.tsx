import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisView, buildEstimatedScanProgress } from "@/components/analysis-view";
import { ScanSummaryHeader } from "@/components/scan-summary-header";
import type { AnalysisResponse } from "@/lib/contracts";

vi.mock("@/lib/api", () => ({
  fetchAnalysis: vi.fn(),
  fetchAnalysisWorld: vi.fn(),
  interviewAudienceWorld: vi.fn(),
  trimAnalysis: vi.fn(),
}));

const completedResponse: AnalysisResponse = {
  analysisId: "analysis-1",
  status: "completed",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  error: null,
  payload: {
    analysisId: "analysis-1",
    analysisMode: "read_the_room",
    video: {
      uploadId: "upload-1",
      filename: "clip.mp4",
      sourceUrl: "/storage/uploads/upload-1/source.mp4",
      thumbnailUrl: "/storage/uploads/upload-1/thumbnail.jpg",
      durationSec: 12,
      width: 1080,
      height: 1920,
      sizeBytes: 1024,
    },
    brainResponse: {
      meshInfo: {
        space: "fsaverage5",
        subject: "average",
        lagCompensationSec: 5,
        totalVertices: 128,
      },
      timeSeries: [
        {
          stimulusTimeSec: 0,
          segmentStartSec: 0,
          segmentDurationSec: 1,
          globalActivation: 0.8,
          leftHemisphereActivation: 0.78,
          rightHemisphereActivation: 0.74,
          rollingVariance: 0.2,
          activationDelta: 0.3,
          spikeScore: 0.9,
          dropScore: 0.1,
          audioEnergy: 0.8,
          motionScore: 0.7,
          transcriptDensity: 0.4,
          sceneChange: true,
          silenceOverlap: false,
          hemisphereHeatmap: {
            left: Array.from({ length: 64 }, () => 0.5),
            right: Array.from({ length: 64 }, () => 0.4),
          },
        },
      ],
    },
    audienceOutlook: {
      headline: "The room is in early, but clarity drops halfway through.",
      summary: "This mode simulates audience reaction alongside a compact brain scan summary.",
      likelyPraise: ["Strong opening line"],
      likelyPushback: ["Middle section gets muddy"],
      roomVoices: [
        {
          speaker: "Maya",
          handle: "@maya_557",
          role: "Freelance Graphic Design Student",
          platform: "Reddit",
          quote: "Wait, I've been seeing this 'Twine' app everywhere. Is it actually better than CapCut or just another AI hype tool?",
        },
        {
          speaker: "Theo",
          handle: "@theo_972",
          role: "Technical Analyst & Digital Forensic Specialist",
          platform: "Reddit",
          quote: "3 weeks into UGC and already looking for shortcuts? I get the appeal, but the claim still needs proof.",
        },
        {
          speaker: "Avery",
          handle: "@avery_327",
          role: "Marketing Analyst & Brand Strategist",
          platform: "X",
          quote: "The value proposition is strong, but they need to prove the AI angle is not just a gimmick to maintain trust.",
        },
      ],
      timeline: [
        {
          startSec: 0,
          endSec: 6,
          sentiment: 0.78,
          interest: 0.84,
          clarity: 0.72,
          trust: 0.74,
          shareIntent: 0.67,
          dropoffRisk: 0.18,
          primaryReaction: "leaning in",
          note: "The room gets the setup fast.",
        },
      ],
    },
    audienceWorld: {
      status: "ready",
      simulationId: "sim-123",
      platformBreakdown: [
        {
          platform: "reddit",
          volume: 5,
          engagement: 24,
          leaning: "mixed",
          dominantNarratives: [
            "UGC creators will save time on rough cuts with this workflow.",
            "The feature pitch is sharp, but the proof still feels thin.",
          ],
        },
        {
          platform: "twitter",
          volume: 2,
          engagement: 13,
          leaning: "negative",
          dominantNarratives: [
            "This opener would stop my scroll, but the back half needs harder proof.",
          ],
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
          liked: ["UGC creators will save time on rough cuts with this workflow."],
          blocked: ["The feature pitch is sharp, but the proof still feels thin."],
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
          liked: [],
          blocked: ["This opener would stop my scroll, but the back half needs harder proof."],
          representativeAgentIds: [2],
          momentIds: ["window-2"],
        },
      ],
      threads: [
        {
          id: "reddit-post-101",
          platform: "reddit",
          dominantStance: "mixed",
          engagement: 19,
          replyCount: 2,
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
          ],
        },
        {
          id: "twitter-post-201",
          platform: "twitter",
          dominantStance: "negative",
          engagement: 13,
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
      ],
      agents: [
        {
          id: 1,
          displayName: "Jules",
          handle: "@jules_cut",
          role: "UGC creator and freelance editor",
          platforms: ["reddit"],
          bio: "Runs creator workflows for product launches.",
          stats: {
            totalActions: 7,
            redditActions: 7,
            twitterActions: 0,
          },
        },
        {
          id: 2,
          displayName: "Nina",
          handle: "@nina_brand",
          role: "Brand strategist for consumer apps",
          platforms: ["reddit"],
          bio: "Looks for proof and trust gaps in short-form ads.",
          stats: {
            totalActions: 5,
            redditActions: 5,
            twitterActions: 0,
          },
        },
        {
          id: 3,
          displayName: "Omar",
          handle: "@omar_growth",
          role: "Growth marketer and creative analyst",
          platforms: ["reddit", "twitter"],
          bio: "Tracks hooks, drop-off, and shareability.",
          stats: {
            totalActions: 6,
            redditActions: 2,
            twitterActions: 4,
          },
        },
      ],
      interviews: [
        {
          agentId: 1,
          prompt: "What made you trust this?",
          response: "The first three seconds solved a real workflow pain immediately.",
          platform: "reddit",
          cached: true,
        },
      ],
      evidenceMoments: [
        {
          windowId: "window-1",
          startSec: 0,
          endSec: 4,
          headline: "The hook solves a real workflow pain before the room asks for proof.",
          reason: "UGC creators will save time on rough cuts with this workflow.",
          threadIds: ["reddit-post-101"],
          cohortIds: ["ugc-creators"],
          agentIds: [1],
        },
        {
          windowId: "window-2",
          startSec: 4,
          endSec: 8,
          headline: "Interest stays high, but the room starts asking for harder proof.",
          reason: "This opener would stop my scroll, but the back half needs harder proof.",
          threadIds: ["twitter-post-201"],
          cohortIds: ["growth-brand"],
          agentIds: [3],
        },
      ],
    },
    brainSummary: {
      averageActivation: 0.8,
      averageMotion: 0.7,
      averageAudioEnergy: 0.8,
      averageTranscriptDensity: 0.4,
    },
    markers: [
      {
        t: 0,
        type: "strong_hook",
        severity: "high",
        explanation: "Strong start.",
        suggestion: "Keep it.",
      },
    ],
    deadspaceCuts: [
      {
        id: "deadspace-1",
        type: "deadspace",
        start: 2,
        end: 3,
        reason: "Quiet stretch.",
        defaultSelected: true,
        recommendedAction: "Cut the deadspace.",
      },
    ],
    lowValueCuts: [
      {
        id: "low-value-1",
        type: "low_value",
        start: 5,
        end: 6,
        reason: "Low-value setup.",
        defaultSelected: false,
        recommendedAction: "Optionally cut this setup beat.",
      },
    ],
    cutPlan: [
      {
        id: "deadspace-1",
        type: "deadspace",
        start: 2,
        end: 3,
        reason: "Quiet stretch.",
        defaultSelected: true,
        recommendedAction: "Cut the deadspace.",
      },
      {
        id: "low-value-1",
        type: "low_value",
        start: 5,
        end: 6,
        reason: "Low-value setup.",
        defaultSelected: false,
        recommendedAction: "Optionally cut this setup beat.",
      },
    ],
    actionBoard: {
      keep: ["Strong open"],
      fixNow: ["Trim the deadspace"],
      testNext: ["Test a tighter title"],
      exportPlan: ["Default export keeps deadspace cuts selected."],
    },
    timelineSegments: [
      {
        id: "segment-deadspace-1",
        type: "deadspace",
        label: "Deadspace cut",
        start: 2,
        end: 3,
        severity: "high",
        reason: "Quiet stretch.",
        recommendedAction: "Cut the deadspace.",
        cutId: "deadspace-1",
      },
    ],
    exports: [],
    scores: {
      hookScore: 81,
      pacingScore: 70,
      retentionEstimate: 75,
      viralPotential: 72,
      confidence: "medium",
      helpingFactors: ["Strong first-three-second hook"],
      hurtingFactors: ["No major drag signal"],
    },
    summary: {
      strengths: ["Strong open"],
      weaknesses: ["No major weakness"],
      overallRecommendation: "Keep the opening spike.",
    },
    artifacts: {
      rawPredictionsUrl: null,
      providerRawJsonUrl: "/storage/provider.json",
      processedJsonUrl: "/storage/a.json",
      cutListJsonUrl: "/storage/cuts.json",
      eventsCsvUrl: "/storage/events.csv",
      segmentsJsonUrl: "/storage/segments.json",
      trimmedVideoUrl: null,
    },
    diagnostics: {
      device: "remote",
      modelRepo: "facebook/tribev2",
      modelCommit: "72399081ed3f1040c4d996cefb2864a4c46f5b8e",
      transcriptWordCount: 12,
      sceneChangeCount: 2,
      deadspaceSeconds: 0,
      trimmedDurationSec: null,
      warnings: [],
    },
  },
};

describe("AnalysisView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces native video controls with an editor-style frame rail", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    const user = userEvent.setup();
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });

    const video = document.querySelector("video");
    const timeline = screen.getByTestId("recommendation-timeline");
    expect(video).not.toBeNull();
    expect(video).not.toHaveAttribute("controls");
    expect(within(timeline).queryByText("Deadspace cut")).not.toBeInTheDocument();

    const playButton = screen.getByRole("button", { name: /play video/i });
    const scrubSurface = screen.getByTestId("timeline-scrub-surface");
    const timelineShell = screen.getByTestId("timeline-shell");
    const noteCount = within(timeline).getByText("1 notes");
    expect(playButton.className).toContain("bg-primary");
    expect(scrubSurface).toBeInTheDocument();
    expect(timelineShell.className).toContain("surface");
    expect(noteCount.className).toContain("sticker");
    expect(screen.getByTestId("timeline-playhead")).toBeInTheDocument();
    expect(screen.queryByTestId("video-timeline-fill")).not.toBeInTheDocument();
    expect(screen.queryByTestId("video-timeline-thumb")).not.toBeInTheDocument();

    await user.click(playButton);

    expect(playSpy).toHaveBeenCalled();
    playSpy.mockRestore();
  });

  it("prioritizes read the room copy and hides the large brain viewer for audience-mode scans", async () => {
    const { fetchAnalysis, fetchAnalysisWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({
      analysisId: "analysis-1",
      world: completedResponse.payload!.audienceWorld!,
    });

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Read the room/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId("scan-verdict-bar")).toBeInTheDocument();
    expect(screen.getByTestId("scan-action-strip")).toBeInTheDocument();
    expect(screen.getByText(/Edit opportunities/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open evidence drawer/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Threads" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Comment graph/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("brain-viewport")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show brain signal/i })).toBeInTheDocument();
    expect(screen.queryByText(/Top actions/i)).not.toBeInTheDocument();
  });

  it("recomputes the read-the-room activation estimate instead of trusting inflated legacy summaries", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue({
      ...completedResponse,
      payload: completedResponse.payload
        ? {
            ...completedResponse.payload,
            brainSummary: {
              ...completedResponse.payload.brainSummary!,
              averageActivation: 0.98,
            },
          }
        : null,
    });

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /show brain signal/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /show brain signal/i }));
    expect(screen.getByText(/Activation estimate/i)).toBeInTheDocument();
    expect(screen.queryByText(/^98$/)).not.toBeInTheDocument();
    expect(screen.getByText(/^61$/)).toBeInTheDocument();
  });

  it("removes decorative accent shapes from the analysis panels", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    const user = userEvent.setup();
    const { container } = render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });

    expect(container.querySelectorAll('[class*="rotate-6"]').length).toBe(0);
    expect(container.querySelectorAll('[class*="bg-accent"]').length).toBe(0);

    await user.click(
      screen.getByRole("button", {
        name: /deadspace cut recommendation at 2\.00s/i,
      }),
    );

    expect(await screen.findByTestId("timeline-note-flyout")).toBeInTheDocument();
    expect(container.querySelectorAll('[class*="rotate-12"]').length).toBe(0);
    expect(container.querySelectorAll('[class*="bg-accent"]').length).toBe(0);
  });

  it("renders a compact saved-scan header with status, metrics, and export access", () => {
    const { container } = render(
      <ScanSummaryHeader
        createdAt={Date.now()}
        filename="clip.mp4"
        hookScore={81}
        lastExportedAt={Date.now()}
        latestExportUrl="/storage/export.mp4"
        recommendation="Keep the opening spike."
        pacingScore={70}
        retentionEstimate={75}
        status="completed"
        title="Clip review"
        viralPotential={72}
      />,
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clip review" })).toBeInTheDocument();
    expect(screen.getByText("Keep the opening spike.")).toBeInTheDocument();
    expect(screen.getByText("Hook")).toBeInTheDocument();
    expect(screen.getByText("Pacing")).toBeInTheDocument();
    expect(screen.getByText("Retention")).toBeInTheDocument();
    expect(screen.getByText("Viral")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open latest export/i })).toHaveAttribute(
      "href",
      "/storage/export.mp4",
    );
    expect(screen.getByText(/Created/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".surface-soft")).toHaveLength(0);
  });

  it("polls until completed and renders the editor-first layout without nested soft panels", async () => {
    const { fetchAnalysis, fetchAnalysisWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysis)
      .mockResolvedValueOnce({
        analysisId: "analysis-1",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      })
      .mockResolvedValueOnce(completedResponse);
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({
      analysisId: "analysis-1",
      world: completedResponse.payload!.audienceWorld!,
    });

    const { container } = render(<AnalysisView analysisId="analysis-1" pollIntervalMs={5} />);

    expect(await screen.findByText(/Processing analysis/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /scan progress/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Read the room/i)).toBeInTheDocument();
      expect(screen.getByText(/Edit opportunities/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId("scan-verdict-bar")).toBeInTheDocument();
    expect(screen.getByTestId("scan-action-strip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open evidence drawer/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Threads" })).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("audience-world-cohort")).toHaveLength(0);
    expect(screen.queryAllByTestId("audience-world-moment-row")).toHaveLength(0);
    expect(screen.getByText(/Automatic trim/i)).toBeInTheDocument();
    expect(screen.getByText(/Quiet stretch\./i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Provider response JSON/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Action board/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Detailed segment notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Downloads/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Past exports/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Raw predictions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/TRIBE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Duration")).not.toBeInTheDocument();
    expect(screen.queryByText("Words")).not.toBeInTheDocument();
    expect(screen.queryByText("Scenes")).not.toBeInTheDocument();
    expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".surface-soft")).toHaveLength(0);
  });

  it("shows a cancel scan action while running and routes back to the library after cancellation", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    const navigation = await import("next/navigation");
    vi.mocked(fetchAnalysis).mockResolvedValue({
      analysisId: "analysis-1",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      payload: null,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AnalysisView analysisId="analysis-1" />);

    await user.click(await screen.findByRole("button", { name: /cancel scan/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/analysis/analysis-1/cancel", {
        method: "POST",
      });
      expect(navigation.useRouter().push).toHaveBeenCalledWith("/app/library");
    });
  });

  it("keeps the evidence workspace behind tabs instead of stacking every section at once", async () => {
    const { fetchAnalysis, fetchAnalysisWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({
      analysisId: "analysis-1",
      world: completedResponse.payload!.audienceWorld!,
    });

    render(<AnalysisView analysisId="analysis-1" />);

    expect(await screen.findByRole("button", { name: /open evidence drawer/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Threads" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /open evidence drawer/i }));

    expect(screen.getByRole("tab", { name: "Threads" })).toBeInTheDocument();
    expect(screen.queryByText(/Agent interviews/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Why the room turned/i)).not.toBeInTheDocument();
  });

  it("shows the top three edit opportunities first and reveals the rest on demand", async () => {
    const { fetchAnalysis, fetchAnalysisWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue({
      ...completedResponse,
      payload: completedResponse.payload
        ? {
            ...completedResponse.payload,
            deadspaceCuts: [
              ...completedResponse.payload.deadspaceCuts,
              {
                id: "deadspace-2",
                type: "deadspace",
                start: 7,
                end: 8,
                reason: "Drag in the feature explanation.",
                defaultSelected: true,
                recommendedAction: "Trim the drag.",
              },
            ],
            lowValueCuts: [
              ...completedResponse.payload.lowValueCuts,
              {
                id: "low-value-2",
                type: "low_value",
                start: 9,
                end: 10,
                reason: "Redundant proof beat.",
                defaultSelected: false,
                recommendedAction: "Collapse this proof beat.",
              },
            ],
          }
        : null,
    });
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({
      analysisId: "analysis-1",
      world: completedResponse.payload!.audienceWorld!,
    });
    const user = userEvent.setup();

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Edit opportunities/i)).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("edit-opportunity-row")).toHaveLength(2);
    expect(screen.queryByText(/Redundant proof beat\./i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show all cuts/i }));

    expect(screen.getAllByTestId("edit-opportunity-row")).toHaveLength(4);
    expect(screen.getByText(/Redundant proof beat\./i)).toBeInTheDocument();
  });

  it("loads live agent interviews for the selected room prompt", async () => {
    const { fetchAnalysis, fetchAnalysisWorld, interviewAudienceWorld } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    vi.mocked(fetchAnalysisWorld).mockResolvedValue({
      analysisId: "analysis-1",
      world: completedResponse.payload!.audienceWorld!,
    });
    vi.mocked(interviewAudienceWorld).mockResolvedValue({
      analysisId: "analysis-1",
      prompt: "What made you skeptical?",
      cached: false,
      interviews: [
        {
          agentId: 3,
          prompt: "What made you skeptical?",
          response: "The hook works, but the back half still needs harder proof before I would repost it.",
          platform: "twitter",
          cached: false,
        },
      ],
    });
    const user = userEvent.setup();

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open evidence drawer/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /open evidence drawer/i }));
    await user.click(screen.getByRole("tab", { name: "Interviews" }));
    await user.click(screen.getByRole("button", { name: /what made you skeptical\?/i }));

    await waitFor(() => {
      expect(interviewAudienceWorld).toHaveBeenCalledWith(
        "analysis-1",
        expect.objectContaining({
          agentIds: expect.arrayContaining([1, 2, 3]),
          prompt: "What made you skeptical?",
        }),
      );
    });

    expect(screen.getByText(/back half still needs harder proof/i)).toBeInTheDocument();
  });

  it("shows an estimated scan progress bar with a front-loaded curve", async () => {
    const createdAt = "2026-04-19T12:00:00.000Z";
    const early = buildEstimatedScanProgress(
      "running",
      createdAt,
      new Date("2026-04-19T12:00:06.000Z").getTime(),
    );
    const middle = buildEstimatedScanProgress(
      "running",
      createdAt,
      new Date("2026-04-19T12:00:12.000Z").getTime(),
    );
    const later = buildEstimatedScanProgress(
      "running",
      createdAt,
      new Date("2026-04-19T12:00:18.000Z").getTime(),
    );
    const longRunning = buildEstimatedScanProgress(
      "running",
      createdAt,
      new Date("2026-04-19T12:03:00.000Z").getTime(),
    );

    expect(early.label).toBe("Estimated progress");
    expect(middle.value).toBeGreaterThan(early.value);
    expect(later.value).toBeGreaterThan(middle.value);
    expect(middle.value - early.value).toBeGreaterThan(later.value - middle.value);
    expect(longRunning.value).toBeGreaterThan(92);
    expect(later.value).toBeLessThan(100);
    expect(longRunning.value).toBeLessThan(100);
  });

  it("explains that long-running read-the-room scans can take a few minutes", () => {
    const running = buildEstimatedScanProgress(
      "running",
      "2026-04-19T12:00:00.000Z",
      new Date("2026-04-19T12:03:00.000Z").getTime(),
    );

    expect(running.hint).not.toMatch(/slows down near the end/i);
    expect(running.hint).toMatch(/can take a few minutes/i);
    expect(running.hint).toMatch(/simulating the audience/i);
  });

  it("seeks the video from the custom timeline", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });

    const scrubSurface = screen.getByTestId("timeline-scrub-surface");
    const video = document.querySelector("video") as HTMLVideoElement | null;
    expect(video).not.toBeNull();

    vi.spyOn(scrubSurface, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 240,
      height: 24,
      top: 0,
      left: 0,
      right: 240,
      bottom: 24,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(scrubSurface, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(video?.currentTime).toBeCloseTo(6, 1);
  });

  it("opens recommendation details in a readable side flyout without blurry frame thumbnails", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    const user = userEvent.setup();

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });

    const marker = screen.getByRole("button", {
      name: /deadspace cut recommendation/i,
    });

    expect(screen.queryByTestId("timeline-frame")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-frame-portrait")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-note-flyout")).not.toBeInTheDocument();

    await user.hover(marker);

    const panel = await screen.findByTestId("timeline-note-flyout");
    expect(within(panel).getByText("Quiet stretch.")).toBeInTheDocument();
    expect(within(panel).getByText("Cut the deadspace.")).toBeInTheDocument();
    expect(within(panel).getByText("Changes needed")).toBeInTheDocument();
    expect(panel.className).not.toContain("xl:h-[16.75rem]");
    expect(panel.className).not.toContain("overflow-hidden");
    expect(panel.className).toContain("origin-left");
    expect(screen.getByTestId("timeline-note-connector")).toBeInTheDocument();
    expect(within(panel).getByTestId("timeline-note-content").className).not.toContain("overflow-hidden");
    expect(within(panel).getByTestId("timeline-note-suggestion").className).not.toContain("h-[8.5rem]");
    expect(within(panel).getByTestId("timeline-note-suggestion").className).not.toContain("overflow-hidden");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-recommendation-panel")).not.toBeInTheDocument();

    await user.unhover(marker);

    expect(screen.getByTestId("timeline-note-flyout")).toBeInTheDocument();

    await new Promise((resolve) => window.setTimeout(resolve, 320));
    expect(screen.getByTestId("timeline-note-flyout")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByTestId("timeline-note-flyout")).not.toBeInTheDocument();
        expect(screen.queryByTestId("timeline-note-connector")).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  it("aligns the playhead with the marker when a recommendation is clicked", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue(completedResponse);
    const user = userEvent.setup();

    render(<AnalysisView analysisId="analysis-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });

    const marker = screen.getByRole("button", {
      name: /deadspace cut recommendation/i,
    });
    const playhead = screen.getByTestId("timeline-playhead");
    const video = document.querySelector("video") as HTMLVideoElement | null;

    expect(video).not.toBeNull();

    await user.click(marker);

    await waitFor(() => {
      expect(video?.currentTime).toBeCloseTo(2.5, 1);
      expect(playhead.getAttribute("style")).toBe(marker.getAttribute("style"));
    });
  });

  it("removes deadspace from the player box using the default speech-safe cuts", async () => {
    const { fetchAnalysis, trimAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis)
      .mockResolvedValueOnce(completedResponse)
      .mockResolvedValueOnce({
        ...completedResponse,
        payload: {
          ...completedResponse.payload!,
          exports: [
            {
              exportId: "export-1",
              createdAt: "2026-04-19T10:00:00.000Z",
              trimmedVideoUrl: "/storage/trimmed-default.mp4",
              trimmedVideoStorageId: null,
              selectedCutIds: ["deadspace-1"],
              removedSeconds: 1,
              trimmedDurationSec: 11,
            },
          ],
          artifacts: {
            ...completedResponse.payload!.artifacts,
            trimmedVideoUrl: "/storage/trimmed-default.mp4",
            trimmedVideoStorageId: null,
          },
          diagnostics: {
            ...completedResponse.payload!.diagnostics,
            trimmedDurationSec: 11,
          },
        },
      });
    vi.mocked(trimAnalysis).mockResolvedValue({
      analysisId: "analysis-1",
      trimmedVideoUrl: "/storage/trimmed-default.mp4",
      originalDurationSec: 12,
      trimmedDurationSec: 11,
      removedSeconds: 1,
      appliedCuts: [completedResponse.payload!.cutPlan[0]],
    });
    const persistSelectedCuts = vi.fn().mockResolvedValue(undefined);
    const persistExport = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <AnalysisView
        analysisId="analysis-1"
        onPersistSelectedCuts={persistSelectedCuts}
        onPersistExport={persistExport}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /remove deadspace/i }));

    await waitFor(() => {
      expect(trimAnalysis).toHaveBeenCalledWith("analysis-1", ["deadspace-1"]);
    });
    expect(persistSelectedCuts).toHaveBeenCalledWith(["deadspace-1"]);
    expect(persistExport).toHaveBeenCalledWith(
      ["deadspace-1"],
      "/storage/trimmed-default.mp4",
      null,
    );
    await waitFor(() => {
      expect(document.querySelector("video")).toHaveAttribute(
        "src",
        "/storage/trimmed-default.mp4",
      );
    });
  });

  it("can switch to the lenient trim mode before removing deadspace", async () => {
    const { fetchAnalysis, trimAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis)
      .mockResolvedValueOnce(completedResponse)
      .mockResolvedValueOnce({
        ...completedResponse,
        payload: {
          ...completedResponse.payload!,
          exports: [
            {
              exportId: "export-1",
              createdAt: "2026-04-19T10:00:00.000Z",
              trimmedVideoUrl: "/storage/trimmed-lenient.mp4",
              trimmedVideoStorageId: null,
              selectedCutIds: ["deadspace-1", "low-value-1"],
              removedSeconds: 2,
              trimmedDurationSec: 10,
            },
          ],
          artifacts: {
            ...completedResponse.payload!.artifacts,
            trimmedVideoUrl: "/storage/trimmed-lenient.mp4",
            trimmedVideoStorageId: null,
          },
          diagnostics: {
            ...completedResponse.payload!.diagnostics,
            trimmedDurationSec: 10,
          },
        },
      });
    vi.mocked(trimAnalysis).mockResolvedValue({
      analysisId: "analysis-1",
      trimmedVideoUrl: "/storage/trimmed-lenient.mp4",
      originalDurationSec: 12,
      trimmedDurationSec: 10,
      removedSeconds: 2,
      appliedCuts: completedResponse.payload!.cutPlan,
    });
    const persistSelectedCuts = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <AnalysisView
        analysisId="analysis-1"
        onPersistSelectedCuts={persistSelectedCuts}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recommendation-timeline")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /more lenient/i }));

    await waitFor(() => {
      expect(persistSelectedCuts).toHaveBeenCalledWith(["deadspace-1", "low-value-1"]);
    });

    await user.click(screen.getByRole("button", { name: /remove deadspace/i }));

    await waitFor(() => {
      expect(trimAnalysis).toHaveBeenCalledWith("analysis-1", [
        "deadspace-1",
        "low-value-1",
      ]);
    });
    await waitFor(() => {
      expect(document.querySelector("video")).toHaveAttribute(
        "src",
        "/storage/trimmed-lenient.mp4",
      );
    });
  });

  it("renders a provider-neutral failed-analysis message", async () => {
    const { fetchAnalysis } = await import("@/lib/api");
    vi.mocked(fetchAnalysis).mockResolvedValue({
      analysisId: "analysis-2",
      status: "failed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: "TRIBE v2 could not access its Hugging Face dependencies.",
      payload: null,
    });

    render(<AnalysisView analysisId="analysis-2" />);
    expect(await screen.findByText(/The backend returned an actionable error/i)).toBeInTheDocument();
    expect(screen.queryByText(/TRIBE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hugging Face/i)).not.toBeInTheDocument();
  });
});
