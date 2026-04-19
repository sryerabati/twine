"use client";

import type { MouseEvent } from "react";
import Link from "next/link";

import { PublicAuthLink } from "@/components/auth/public-auth-link";
import { LandingBrainModel } from "@/components/landing-brain-model";

export function LandingHero() {
  function handleWorkflowClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    const workflowSection = document.getElementById("workflow");
    workflowSection?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (window.location.hash !== "#workflow") {
      window.history.replaceState(null, "", "#workflow");
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid min-h-[calc(100svh-73px)] max-w-[92rem] gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[0.74fr_1.26fr] lg:px-16 lg:py-14 xl:px-20">
        <div className="relative z-10 flex max-w-[34rem] flex-col justify-center">
          <h1 className="mt-4 max-w-[10.6ch] font-heading text-6xl leading-[0.9] tracking-[-0.07em] text-foreground md:text-7xl lg:text-[5.7rem]">
            Read the room before you post.
          </h1>
          <p className="mt-5 max-w-[33rem] text-lg leading-8 text-muted-foreground">
            Drop in one video, make two compete, or turn raw clips into a rough cut with the AI
            editor.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <PublicAuthLink className="inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[6px_6px_0_0_var(--shadow-stamp)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_var(--shadow-stamp)]" />
            <Link
              href="#workflow"
              onClick={handleWorkflowClick}
              className="inline-flex items-center justify-center rounded-full border-2 border-border bg-card px-6 py-3 text-base font-semibold text-foreground shadow-[6px_6px_0_0_var(--shadow-stamp)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_var(--shadow-stamp)]"
            >
              See the workflow
            </Link>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-center lg:justify-end">
          <div className="surface relative w-full max-w-[42rem] overflow-hidden rounded-[2.4rem] p-4 md:p-6">
            <span className="sticker absolute left-4 top-4 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-secondary-foreground">
              Signal map
            </span>
            <div className="pt-8">
              <LandingBrainModel />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
