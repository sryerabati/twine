import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoomVoicesPanel, getRoomVoicePresentation } from "@/components/room-voices-panel";
import type { AudienceOutlook } from "@/lib/contracts";

const audienceOutlook: AudienceOutlook = {
  headline: "The room leans in early, then asks for clearer proof.",
  summary: "Audience simulation summary",
  likelyPraise: ["Strong first three seconds"],
  likelyPushback: ["Proof needs to land faster"],
  timeline: [],
  roomVoices: [
    {
      speaker: "Maya",
      handle: "@maya_557",
      role: "Freelance Graphic Design Student",
      platform: "Reddit",
      stance: "positive",
      quote:
        "Wait, I've been seeing this 'Twine' app everywhere. Is it actually better than CapCut or just another AI hype tool?",
    },
    {
      speaker: "Theo",
      handle: "@theo_972",
      role: "Technical Analyst & Digital Forensic Specialist",
      platform: "Reddit",
      stance: "negative",
      quote:
        "3 weeks into UGC and already looking for shortcuts? I get the appeal, but the claim still needs proof before I trust it.",
    },
    {
      speaker: "Avery",
      handle: "@avery_327",
      role: "Marketing Analyst & Brand Strategist",
      platform: "X",
      stance: "negative",
      quote:
        "The value proposition is strong, but they need to prove the AI angle is not just a gimmick if they want to keep trust high.",
    },
    {
      speaker: "Lena",
      handle: "@lena_190",
      role: "UGC Content Quality Auditor & Post-Production Specialist",
      platform: "X",
      stance: "positive",
      quote:
        "The opening gets my attention, but the ending needs a cleaner cut if they want the room to stay with it.",
    },
    {
      speaker: "Noah",
      handle: "@noah_611",
      role: "Social Creative Producer",
      platform: "Reddit",
      stance: "positive",
      quote:
        "This is close, but I still want the proof beat to arrive faster so the value proposition feels earned.",
    },
    {
      speaker: "Jules",
      handle: "@jules_408",
      role: "Creator Economy Commentator",
      platform: "X",
      stance: "negative",
      quote:
        "The positioning makes sense for UGC teams, but the AI claim has to feel more concrete before people repeat it.",
    },
  ],
};

describe("RoomVoicesPanel", () => {
  it("renders a comments-style feed with the full set of reactions", () => {
    render(<RoomVoicesPanel audienceOutlook={audienceOutlook} />);

    expect(screen.getByText(/Comments feed/i)).toBeInTheDocument();
    expect(screen.getByText("6 simulated reactions")).toBeInTheDocument();
    expect(screen.getAllByTestId("room-comment-item")).toHaveLength(6);
  });

  it("shows deterministic DiceBear avatars beside each speaker", () => {
    render(<RoomVoicesPanel audienceOutlook={audienceOutlook} />);

    expect(screen.getAllByRole("img", { name: /avatar$/i })).toHaveLength(6);
    expect(screen.getByRole("img", { name: "Maya avatar" })).toHaveAttribute("src");
  });

  it("surfaces positive and skeptical chips in the comments feed", () => {
    render(<RoomVoicesPanel audienceOutlook={audienceOutlook} />);

    expect(screen.getAllByText("Positive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Skeptical").length).toBeGreaterThan(0);
  });

  it("shows speaker role and full uncut comment bodies", () => {
    render(<RoomVoicesPanel audienceOutlook={audienceOutlook} />);

    expect(screen.getByText("Freelance Graphic Design Student")).toBeInTheDocument();

    const comment = screen.getByTestId("room-comment-body-maya_557");
    expect(comment).toHaveTextContent(
      "Wait, I've been seeing this 'Twine' app everywhere. Is it actually better than CapCut or just another AI hype tool?",
    );
    expect(comment.className).not.toContain("truncate");
    expect(comment.className).not.toContain("line-clamp");
    expect(comment.className).not.toContain("overflow-hidden");
  });

  it("marks the comments feed scroll region with the branded scrollbar skin", () => {
    render(<RoomVoicesPanel audienceOutlook={audienceOutlook} />);

    expect(screen.getByTestId("room-comments-scroll-region")).toHaveClass("signal-scrollbar");
  });

  it("normalizes family archetype personas so raw labels like dad do not leak into the feed", () => {
    render(
      <RoomVoicesPanel
        audienceOutlook={{
          ...audienceOutlook,
          roomVoices: [
            {
              speaker: "dad",
              handle: "@dad_02",
              role: "Head of Household and Financial Provider",
              platform: "Reddit",
              stance: "negative",
              quote:
                "I'm still looking at the credit card bill from this and deciding if it really saves enough time.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Parent POV")).toBeInTheDocument();
    expect(screen.getByText("Audience archetype")).toBeInTheDocument();
    expect(screen.queryByText(/^dad$/i)).not.toBeInTheDocument();
    expect(screen.queryByText("@dad_02")).not.toBeInTheDocument();
  });

  it("uses masculine avatar hints for paternal personas instead of a random feminine face", () => {
    const presentation = getRoomVoicePresentation(
      {
        speaker: "dad",
        handle: "@dad_02",
        role: "Head of Household and Financial Provider",
        platform: "Reddit",
        stance: "positive",
        quote: "Still deciding if this is worth it.",
      },
      2,
    );

    expect(presentation.displayName).toBe("Parent POV");
    expect(presentation.metaLabel).toBe("Audience archetype");
    expect(presentation.avatarOptions.top).toEqual(
      expect.arrayContaining(["shortFlat", "shortWaved", "theCaesar"]),
    );
    expect(presentation.avatarOptions.facialHairProbability).toBe(100);
  });

  it("uses explicit boy and girl youth profiles when the persona label says boy or girl", () => {
    const boyPresentation = getRoomVoicePresentation(
      {
        speaker: "boy",
        handle: "@boy_04",
        role: "Student gamer and younger sibling",
        platform: "Reddit",
        stance: "positive",
        quote: "This actually looks fast enough that I'd try it.",
      },
      1,
    );
    const girlPresentation = getRoomVoicePresentation(
      {
        speaker: "girl",
        handle: "@girl_07",
        role: "High school creator and trend watcher",
        platform: "X",
        stance: "negative",
        quote: "I get the premise, but it still feels too polished to trust yet.",
      },
      2,
    );

    expect(boyPresentation.displayName).toBe("Boy POV");
    expect(boyPresentation.metaLabel).toBe("Audience archetype");
    expect(boyPresentation.avatarOptions.top).toEqual(
      expect.arrayContaining(["shortFlat", "shortRound", "shortWaved"]),
    );
    expect(boyPresentation.avatarOptions.facialHairProbability).toBe(0);

    expect(girlPresentation.displayName).toBe("Girl POV");
    expect(girlPresentation.metaLabel).toBe("Audience archetype");
    expect(girlPresentation.avatarOptions.top).toEqual(
      expect.arrayContaining(["bob", "bun", "straight01"]),
    );
    expect(girlPresentation.avatarOptions.facialHairProbability).toBe(0);
  });
});
