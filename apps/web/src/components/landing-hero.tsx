"use client";

import type { MouseEvent } from "react";
import Link from "next/link";

import { PublicAuthLink } from "@/components/auth/public-auth-link";
import { LandingBrainModel } from "@/components/landing-brain-model";

const heroStats = [
  { val: "84%", label: "Hook" },
  { val: "71%", label: "Pace" },
  { val: "91%", label: "Clarity" },
];

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
            <span
              style={{
                color: "var(--primary)",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='10' viewBox='0 0 120 10'%3E%3Cpath d='M0 5 Q15 1 30 5 Q45 9 60 5 Q75 1 90 5 Q105 9 120 5' fill='none' stroke='%2335b85f' stroke-width='2.5'/%3E%3C/svg%3E\")",
                backgroundRepeat: "repeat-x",
                backgroundPosition: "bottom -2px center",
                paddingBottom: "12px",
              }}
            >
              room
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
          <div className="surface relative w-full max-w-[42rem] p-5 md:p-6">
            <div className="absolute left-5 top-5 flex items-center gap-2">
              <span className="sticker">Signal map</span>
              <span className="sticker sticker-green">● Live</span>
            </div>

            {/* Brain visualization area */}
            <div className="relative mt-8 overflow-hidden rounded-[1.6rem] border-[3px] border-dashed border-border bg-[linear-gradient(135deg,var(--cartoon-green-xdk)_0%,rgba(30,107,56,0.12)_100%)]" style={{ aspectRatio: "16/11" }}>
              {/* Glow blob */}
              <div
                className="absolute left-1/2 top-1/2 h-[65%] w-[65%] -translate-x-1/2 -translate-y-1/2"
                style={{
                  borderRadius: "42% 58% 63% 37% / 36% 42% 58% 64%",
                  background: "radial-gradient(ellipse, rgba(53,184,95,0.18) 0%, transparent 70%)",
                  animation: "brain-orbit 12s ease-in-out infinite",
                }}
              />

              {/* SVG network diagram */}
              <svg viewBox="0 0 200 130" className="absolute inset-0 h-full w-full" aria-hidden>
                <ellipse cx="100" cy="65" rx="88" ry="53" fill="none" stroke="#35b85f" strokeWidth="2.5" />
                <ellipse cx="100" cy="65" rx="63" ry="38" fill="none" stroke="#2a4e39" strokeWidth="2" />
                <ellipse cx="100" cy="65" rx="44" ry="29" fill="rgba(53,184,95,0.06)" />
                <circle cx="100" cy="28" r="5" fill="#35b85f" />
                <circle cx="142" cy="82" r="4" fill="#86d89e" />
                <circle cx="62" cy="84" r="4" fill="#35b85f" />
                <line x1="100" y1="28" x2="142" y2="82" stroke="#2a4e39" strokeWidth="1.5" strokeDasharray="3 4" />
                <line x1="142" y1="82" x2="62" y2="84" stroke="#2a4e39" strokeWidth="1.5" strokeDasharray="3 4" />
                <line x1="62" y1="84" x2="100" y2="28" stroke="#2a4e39" strokeWidth="1.5" strokeDasharray="3 4" />
              </svg>

              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                Signal analysis
              </p>
            </div>

            {/* Stat row */}
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {heroStats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-[1rem] border-2 border-border bg-muted px-3 py-2.5 shadow-[3px_3px_0_0_var(--shadow-stamp)]"
                >
                  <p className="font-cartoon text-[1.3rem] font-black tracking-[-0.04em] text-foreground">
                    {s.val}
                  </p>
                  <p className="text-[0.54rem] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
