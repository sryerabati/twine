"use client";

import type { MouseEvent } from "react";
import Link from "next/link";

import { PublicAuthLink } from "@/components/auth/public-auth-link";
import { LandingRoomVisual } from "@/components/landing-room-visual";

function Sparkle({
  size = 24,
  opacity = 0.55,
  speed = 9,
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

export function LandingHero() {
  function handleWorkflowClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.location.hash !== "#workflow") {
      window.history.replaceState(null, "", "#workflow");
    }
  }

  return (
    <section className="relative overflow-hidden bg-background cartoon-dot-bg">
      {/* Sparkles */}
      <Sparkle size={26} opacity={0.55} speed={9} className="left-[6%] top-[14%]" />
      <Sparkle size={16} opacity={0.4} speed={6} reverse className="left-[12%] top-[52%]" />
      <Sparkle size={20} opacity={0.38} speed={11} className="right-[8%] top-[12%]" />

      <div className="mx-auto grid min-h-[calc(100svh-3.6rem)] max-w-[86rem] gap-10 px-6 py-14 sm:px-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16 lg:px-16">
        {/* Left: copy */}
        <div
          className="relative z-10 flex max-w-[34rem] flex-col justify-center"
          style={{ animation: "pop-in 0.5s cubic-bezier(.34,1.56,.64,1) 0.05s both" }}
        >
          <span className="sticker w-fit" style={{ transform: "rotate(-1deg)" }}>
            Creative signal
          </span>

          <h1 className="mt-5 font-cartoon font-black text-foreground" style={{ fontSize: "clamp(3rem, 6vw, 5.6rem)", letterSpacing: "-0.05em", lineHeight: 0.96 }}>
            Read the{" "}
            <span className="relative inline-block text-primary">
              room
              <svg
                aria-hidden
                className="absolute bottom-[-3px] left-0 w-full"
                height="8"
                viewBox="0 0 100 8"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 4 Q12.5 0 25 4 Q37.5 8 50 4 Q62.5 0 75 4 Q87.5 8 100 4"
                  fill="none"
                  stroke="#35b85f"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </span>{" "}
            before you post.
          </h1>

          <p className="mt-5 text-[1.05rem] font-medium leading-[1.85] text-muted-foreground" style={{ maxWidth: "34rem" }}>
            Drop in one video, make two compete, or turn raw clips into a rough cut with the AI
            editor.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <PublicAuthLink
              unauthenticatedLabel="Get started free →"
              authenticatedLabel="Open dashboard →"
              className="spring inline-flex items-center justify-center rounded-full border-[3px] border-shadow-stamp bg-primary px-[1.6em] py-[0.72em] font-cartoon text-[1rem] font-extrabold text-shadow-stamp shadow-[8px_8px_0_0_var(--shadow-stamp)] hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[11px_11px_0_0_var(--shadow-stamp)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_var(--shadow-stamp)]"
            />
            <Link
              href="#workflow"
              onClick={handleWorkflowClick}
              className="spring inline-flex items-center justify-center rounded-full border-[3px] border-border bg-card px-[1.6em] py-[0.72em] font-cartoon text-[1rem] font-extrabold text-foreground shadow-[8px_8px_0_0_var(--shadow-stamp)] hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[11px_11px_0_0_var(--shadow-stamp)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_var(--shadow-stamp)]"
            >
              See the workflow
            </Link>
          </div>
        </div>

        {/* Right: hero card */}
        <div
          className="relative z-10 flex items-center justify-center lg:justify-end"
          style={{ animation: "pop-in 0.5s cubic-bezier(.34,1.56,.64,1) 0.18s both" }}
        >
          <LandingRoomVisual />
        </div>
      </div>
    </section>
  );
}
