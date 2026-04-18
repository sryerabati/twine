"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function LandingClient() {
  return (
    <main className="overflow-hidden bg-background">
      <section className="grid min-h-[calc(100svh-73px)] items-center gap-14 px-6 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:px-10 lg:py-16">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-pink-200 bg-[#21131f] px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-pink-100 shadow-[4px_4px_0_0_rgba(116,34,85,0.9)]">
            <span className="size-2.5 rounded-full bg-pink-300" />
            VibeCheck
          </div>
          <h1 className="mt-8 max-w-[9ch] font-heading text-6xl leading-[0.9] tracking-[-0.06em] text-[#fff8fc] md:text-7xl lg:text-[5.9rem]">
            Read the room before you post.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-[#d8b8c8]">
            Drop in one cut or make two fight. VibeCheck points at the one that actually lands.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-full border-2 border-pink-200 bg-pink-400 px-6 py-3 text-base font-semibold text-[#2d1322] shadow-[6px_6px_0_0_rgba(116,34,85,0.95)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_rgba(116,34,85,0.95)]"
            >
              Open dashboard
            </Link>
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-pink-100/70">
              One upload. One verdict.
            </span>
          </div>
        </div>

        <ScanBuddyArtwork />
      </section>
    </main>
  );
}

function ScanBuddyArtwork() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-[430px] w-full max-w-[620px]">
      <Sticker className="left-2 top-12 -rotate-8" label="Hook" />
      <Sticker className="right-10 top-4 rotate-6" label="A/B" tone="light" />
      <Sticker className="bottom-12 left-8 rotate-[-10deg]" label="Drag" tone="dark" />
      <Sticker className="bottom-4 right-12 rotate-[8deg]" label="Ship it" />

      <div className="absolute inset-x-12 inset-y-8 animate-[poster-bob_6s_ease-in-out_infinite] rounded-[42%_58%_53%_47%/44%_36%_64%_56%] border-[3px] border-pink-100 bg-[#241523] shadow-[10px_10px_0_0_rgba(255,143,199,0.2)]">
        <div className="absolute left-10 top-10 flex items-center gap-2 rounded-full border-2 border-pink-100 bg-pink-300 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-[#311326]">
          Vibe radar
        </div>

        <div className="absolute left-[24%] top-[34%] size-[4.5rem] rounded-full border-[3px] border-pink-100 bg-[#fff3fa]" />
        <div className="absolute right-[24%] top-[34%] size-[4.5rem] rounded-full border-[3px] border-pink-100 bg-[#fff3fa]" />
        <div className="absolute left-[29.5%] top-[39.5%] size-7 rounded-full bg-[#2d1322]" />
        <div className="absolute right-[29.5%] top-[39.5%] size-7 rounded-full bg-[#2d1322]" />

        <div className="absolute left-[18%] top-[54%] size-10 rounded-full bg-pink-300/80" />
        <div className="absolute right-[18%] top-[54%] size-10 rounded-full bg-pink-300/80" />

        <div className="absolute left-1/2 top-[56%] h-7 w-[7.5rem] -translate-x-1/2 rounded-full border-[3px] border-pink-100 bg-[#120d14]" />
        <div className="absolute left-[28%] top-[22%] h-3 w-12 rounded-full bg-pink-100" />
        <div className="absolute right-[28%] top-[22%] h-3 w-12 rounded-full bg-pink-100" />

        <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 gap-3">
          <SignalBar className="h-10 w-8" />
          <SignalBar className="h-14 w-8" />
          <SignalBar className="h-[4.5rem] w-8" />
          <SignalBar className="h-12 w-8" />
        </div>
      </div>
    </div>
  );
}

function Sticker({
  label,
  className,
  tone = "default",
}: {
  label: string;
  className?: string;
  tone?: "default" | "light" | "dark";
}) {
  return (
    <div
      className={cn(
        "absolute inline-flex items-center justify-center rounded-full border-2 px-4 py-2 text-sm font-black uppercase tracking-[0.18em] shadow-[4px_4px_0_0_rgba(0,0,0,0.35)]",
        tone === "light" &&
          "border-pink-100 bg-[#fff3fa] text-[#39162b]",
        tone === "dark" &&
          "border-pink-100 bg-[#2b1727] text-pink-100",
        tone === "default" &&
          "border-pink-100 bg-pink-300 text-[#39162b]",
        className,
      )}
    >
      {label}
    </div>
  );
}

function SignalBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-full border-[3px] border-pink-100 bg-pink-300 shadow-[4px_4px_0_0_rgba(0,0,0,0.2)]",
        className,
      )}
    />
  );
}
