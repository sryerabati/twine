"use client";

import { LandingBridge } from "@/components/landing-bridge";
import { LandingEditorVisual } from "@/components/landing-editor-visual";
import { LandingFeatureLane } from "@/components/landing-feature-lane";
import { LandingHero } from "@/components/landing-hero";
import { PublicAuthLink } from "@/components/auth/public-auth-link";

const bridgeMarkers = [
  {
    label: "Read one cut",
    description:
      "See hook pressure, pacing, and clarity before the post goes live and the comments do the diagnosing for you.",
  },
  {
    label: "Compare two edits",
    description:
      "Put hooks, trims, captions, or CTAs head to head when instinct alone is not enough to choose.",
  },
  {
    label: "Build the next pass",
    description:
      "Turn raw clips into a rough cut with transcript-guided ordering, deadspace trims, and a version your team can actually review.",
  },
];

const analysisPoints = [
  {
    label: "Hook pressure",
    description:
      "Catch whether the opening earns the next few seconds before the post is already out in the world.",
  },
  {
    label: "A/B judgment",
    description:
      "Put two directions side by side when the team is split between versions and vibes are not enough.",
  },
  {
    label: "Clarity drift",
    description:
      "See where messaging softens, pacing slips, or the offer loses its shape before the cut ships.",
  },
];

const editorPoints = [
  {
    label: "Transcript-led rough cut",
    description:
      "Start from what was actually said so the first pass has structure instead of just trims.",
  },
  {
    label: "Deadspace trim",
    description:
      "Strip the obvious pauses and drag so your first review starts closer to the right rhythm.",
  },
  {
    label: "Story order",
    description:
      "Hand over a cut with a workable sequence, not a folder of clips and a hope that someone finds the arc.",
  },
];

export function LandingClient() {
  return (
    <main className="overflow-x-hidden bg-background">
      <LandingHero />
      <LandingBridge markers={bridgeMarkers} />
      <LandingFeatureLane
        eyebrow="Scan lane"
        title="Scan the cut before it goes live."
        body="Pick the hook, pace, and framing that actually deserves to ship. Twine helps teams pressure-test one edit or compare two versions before live performance makes the call for you."
        bullets={analysisPoints}
        tone="analysis"
        visual={
          <div className="surface relative overflow-hidden rounded-[2.1rem] p-5 md:p-6">
            <span className="sticker absolute left-4 top-4 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-secondary-foreground">
              Scan board
            </span>
            <div className="grid gap-4 pt-10">
              <div className="surface-soft rounded-[1.5rem] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                  Pick the winner
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.2rem] border-2 border-primary bg-primary/12 px-4 py-5">
                    <p className="text-sm font-semibold text-foreground">Cut A</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Sharper hook, clearer offer, stronger opening pace.
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border-2 border-border bg-background/65 px-4 py-5">
                    <p className="text-sm font-semibold text-foreground">Cut B</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Slower start, softer transition into the proof beat.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {["Hook pressure", "Pacing", "Clarity"].map((item) => (
                  <div key={item} className="surface-soft rounded-[1.4rem] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                      {item}
                    </p>
                    <div className="mt-4 h-2 rounded-full bg-primary/15">
                      <div className="h-2 rounded-full bg-primary" style={{ width: "72%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      />
      <LandingFeatureLane
        eyebrow="Build lane"
        title="Build the first pass while the footage is still fresh."
        body="Cut deadspace, find the story, and hand over a usable first pass while raw clips are still easy to shape. The editor lane turns scattered footage into something your team can react to immediately."
        bullets={editorPoints}
        tone="editor"
        visual={<LandingEditorVisual />}
      />

      <section className="mx-auto max-w-[84rem] px-6 pb-18 pt-8 sm:px-10 lg:px-16 xl:px-20">
        <div className="surface flex flex-col gap-6 rounded-[2.2rem] px-6 py-8 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/75">
              Post with a stronger point of view
            </p>
            <p className="mt-4 text-lg leading-8 text-foreground">
              Scan the version you have. Build the version you need next. Twine keeps both moves in
              one playful workflow instead of splitting judgment and editing into separate tools.
            </p>
          </div>
          <PublicAuthLink
            className="inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[6px_6px_0_0_var(--shadow-stamp)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_var(--shadow-stamp)]"
          />
        </div>
      </section>
    </main>
  );
}
