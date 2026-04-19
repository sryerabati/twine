"use client";

import { LandingBrainModel } from "@/components/landing-brain-model";
import { PublicAuthLink } from "@/components/auth/public-auth-link";

const workflowSignals = [
  {
    label: "Scan one cut",
    description:
      "Upload a single video to read hook pressure, pacing, and clarity before it goes live.",
  },
  {
    label: "Compare two edits",
    description:
      "Put variations head to head when you're choosing between hooks, trims, captions, or CTAs.",
  },
  {
    label: "Ship with context",
    description:
      "Give creators, editors, and brand partners a shared reason for why one version is stronger.",
  },
];

const audiences = [
  {
    title: "UGC creators",
    description:
      "Pressure-test hooks, offers, and story flow before you post or send a cut back to a brand.",
  },
  {
    title: "Content teams",
    description:
      "Move through variations faster and stop turning edit reviews into opinion battles.",
  },
  {
    title: "Editors and strategists",
    description:
      "See where attention slips, explain it clearly, and hand over a stronger next version.",
  },
];

export function LandingClient() {
  return (
    <main className="overflow-x-hidden bg-background">
      <section>
        <div className="mx-auto grid min-h-[calc(100svh-73px)] max-w-[90rem] items-center gap-14 px-8 py-12 sm:px-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-24 lg:px-16 lg:py-16 xl:gap-28 xl:px-20">
          <div className="max-w-[44rem]">
            <h1 className="max-w-[13.4ch] font-heading text-6xl leading-[0.9] tracking-[-0.06em] text-foreground md:text-7xl lg:text-[5.9rem]">
              Read the room before you post.
            </h1>
            <p className="mt-5 max-w-[40rem] text-lg leading-8 text-muted-foreground">
              Drop in one video or make two compete. Twine tells you which one will actually land.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <PublicAuthLink className="inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[6px_6px_0_0_var(--shadow-stamp)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_var(--shadow-stamp)]" />
            </div>
          </div>

          <div className="flex w-full justify-center lg:justify-end">
            <div className="w-full max-w-[40rem] xl:max-w-[43rem]">
              <LandingBrainModel />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-primary/15 bg-[linear-gradient(180deg,rgba(18,22,20,0.98),rgba(18,22,20,0.7))]">
        <div className="mx-auto grid max-w-[76rem] gap-10 px-10 py-16 sm:px-12 lg:grid-cols-[0.84fr_1.16fr] lg:px-20 lg:py-20 xl:px-24">
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">
              What Twine is
            </p>
            <h2 className="mt-4 max-w-[12ch] font-heading text-4xl leading-tight tracking-[-0.06em] text-foreground md:text-5xl">
              A decision tool for short-form video.
            </h2>
          </div>

          <div className="space-y-8">
            <div className="max-w-2xl space-y-5 text-base leading-8 text-muted-foreground md:text-lg">
              <p>
                Twine is built for content and UGC creators who have to make posting decisions
                fast. Instead of waiting for live performance to tell you what worked, it helps you
                judge the strength of a cut before it ships.
              </p>
              <p>
                Run a single scan when you want a read on one edit, or compare two versions when
                you are choosing between hooks, trims, captions, or CTAs. The goal is simple:
                clearer creative calls, less guessing, and fewer weak posts making it out the door.
              </p>
            </div>

            <dl className="grid gap-6 sm:grid-cols-3">
              {workflowSignals.map((item) => (
                <div key={item.label} className="border-t border-primary/25 pt-4">
                  <dt className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/75">
                    {item.label}
                  </dt>
                  <dd className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[76rem] px-10 py-16 sm:px-12 lg:px-20 lg:py-20 xl:px-24">
        <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/70">
              Who it is for
            </p>
            <h2 className="mt-4 max-w-[13ch] font-heading text-4xl leading-tight tracking-[-0.06em] text-foreground md:text-5xl">
              Built for people shipping content on a schedule.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground md:text-lg">
              Twine is most useful when the work is frequent, subjective, and high volume, exactly
              the environment most creator teams already live in.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {audiences.map((audience) => (
              <article key={audience.title} className="border-l-2 border-primary/25 pl-5">
                <h3 className="text-xl font-semibold tracking-[-0.04em] text-foreground">
                  {audience.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {audience.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-primary/15 pt-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary/70">
              Post with a stronger point of view
            </p>
            <p className="mt-4 text-lg leading-8 text-foreground">
              If your team is choosing between cuts by instinct alone, Twine gives you a faster way
              to decide what deserves to ship.
            </p>
          </div>
          <PublicAuthLink
            className="inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[6px_6px_0_0_var(--shadow-stamp)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_var(--shadow-stamp)]"
            authenticatedLabel="Open dashboard"
            unauthenticatedLabel="Start with Twine"
          />
        </div>
      </section>
    </main>
  );
}
