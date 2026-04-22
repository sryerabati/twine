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
      "Put hooks, trims, or CTAs head to head when instinct isn't enough to choose.",
  },
  {
    label: "Build the next pass",
    description:
      "Turn raw clips into a rough cut with transcript-guided ordering and deadspace trims.",
  },
];

const analysisPoints = [
  {
    label: "Hook pressure",
    description:
      "Catch whether the opening earns the next few seconds before the post is already out.",
  },
  {
    label: "A/B judgment",
    description:
      "Put two directions side by side when the team is split and vibes aren't enough.",
  },
  {
    label: "Clarity drift",
    description:
      "See where messaging softens or pacing slips before the cut ships.",
  },
];

const editorPoints = [
  {
    label: "Transcript-led cut",
    description:
      "Start from what was actually said so the first pass has structure instead of just trims.",
  },
  {
    label: "Deadspace trim",
    description:
      "Strip the obvious pauses so your first review starts closer to the right rhythm.",
  },
  {
    label: "Story order",
    description:
      "Hand over a cut with a workable sequence, not a folder of clips and a hope.",
  },
];

function Sparkle({
  size = 24,
  opacity = 0.5,
  speed = 7,
  reverse = false,
  className = "",
}: {
  size?: number;
  opacity?: number;
  speed?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      className={`pointer-events-none absolute ${className}`}
      style={{
        opacity,
        animation: `sparkle-spin ${speed}s linear infinite${reverse ? " reverse" : ""}`,
      }}
      aria-hidden
    >
      <path
        d="M13 2 L14.1 11.9 L24 13 L14.1 14.1 L13 24 L11.9 14.1 L2 13 L11.9 11.9 Z"
        fill="var(--primary)"
      />
    </svg>
  );
}

export function LandingClient() {
  return (
    <>
      <main className="overflow-x-hidden bg-background">
        <LandingHero />
        <LandingBridge markers={bridgeMarkers} />

        {/* Scan lane */}
        <LandingFeatureLane
          eyebrow="Scan lane"
          title="Scan the cut before it goes live."
          body="Pick the hook, pace, and framing that actually deserves to ship. Pressure-test one edit or compare two versions before live performance makes the call for you."
          bullets={analysisPoints}
          tone="analysis"
          visual={
            <div className="surface relative overflow-hidden p-5 md:p-6">
              <span className="sticker absolute left-5 top-5" style={{ transform: "rotate(-1deg)" }}>
                Scan board
              </span>

              <div className="grid gap-4 pt-10">
                {/* Winner grid */}
                <div className="surface-soft p-4">
                  <p className="text-[0.58rem] font-extrabold uppercase tracking-[0.2em] text-primary" style={{ opacity: 0.8 }}>
                    Pick the winner
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div
                      className="spring cursor-default rounded-[1.2rem] border-[3px] border-primary bg-primary/9 px-4 py-4 hover:[transform:scale(1.025)_rotate(-0.4deg)]"
                    >
                      <p className="text-sm font-extrabold text-foreground">Cut A ✓</p>
                      <p className="mt-1.5 text-[0.78rem] font-medium leading-6 text-muted-foreground">
                        Sharper hook, clearer offer, stronger opening pace.
                      </p>
                    </div>
                    <div
                      className="spring cursor-default rounded-[1.2rem] border-[3px] border-border bg-background/50 px-4 py-4 hover:[transform:scale(1.025)_rotate(-0.4deg)]"
                    >
                      <p className="text-sm font-extrabold text-foreground">Cut B</p>
                      <p className="mt-1.5 text-[0.78rem] font-medium leading-6 text-muted-foreground">
                        Slower start, softer transition into the proof beat.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Meters */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Hook pressure", pct: 84 },
                    { label: "Pacing", pct: 71 },
                    { label: "Clarity", pct: 91 },
                  ].map((item) => (
                    <div key={item.label} className="surface-soft p-4">
                      <p className="text-[0.58rem] font-extrabold uppercase tracking-[0.2em] text-primary" style={{ opacity: 0.8 }}>
                        {item.label}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full border border-border bg-primary/14">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
        />

        {/* Build lane */}
        <LandingFeatureLane
          eyebrow="Build lane"
          title="Build the first pass while it's still fresh."
          body="Cut deadspace, find the story, and hand over a usable first pass while raw clips are still easy to shape."
          bullets={editorPoints}
          tone="editor"
          visual={<LandingEditorVisual />}
        />

        {/* CTA band */}
        <section className="bg-background py-[4rem] pb-[5rem]">
          <div className="mx-auto max-w-[86rem] px-6 sm:px-10 lg:px-16">
            <div className="surface cartoon-dot-bg relative overflow-hidden px-8 py-10 lg:flex lg:items-end lg:justify-between lg:px-12">
              <Sparkle size={28} opacity={0.45} speed={7} className="right-6 top-5" />
              <Sparkle size={18} opacity={0.35} speed={5} reverse className="bottom-4 left-6" />

              <div className="max-w-2xl">
                <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.22em] text-primary" style={{ opacity: 0.75 }}>
                  Post with a stronger point of view
                </p>
                <p className="mt-4 text-[1rem] font-medium leading-[1.9] text-foreground">
                  Scan the version you have. Build the version you need next. Twine keeps both moves in
                  one playful workflow instead of splitting judgment and editing into separate tools.
                </p>
              </div>

              <div className="mt-6 shrink-0 lg:mt-0 lg:ml-8">
                <PublicAuthLink
                  unauthenticatedLabel="Get started free →"
                  authenticatedLabel="Open dashboard →"
                  className="spring inline-flex items-center justify-center rounded-full border-[3px] border-shadow-stamp bg-primary px-[2em] py-[0.8em] font-cartoon text-[1rem] font-extrabold text-shadow-stamp shadow-[8px_8px_0_0_var(--shadow-stamp)] hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[11px_11px_0_0_var(--shadow-stamp)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_var(--shadow-stamp)]"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-[3px] border-border bg-background py-6 text-center">
        <p className="text-[0.76rem] font-semibold text-muted-foreground">
          <strong className="font-black text-primary">Twine</strong> · © 2026 — Read the room.
        </p>
      </footer>
    </>
  );
}
