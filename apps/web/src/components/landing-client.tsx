"use client";

import Link from "next/link";
import { ArrowRight, Brain, LibraryBig, Scissors, Sparkles } from "lucide-react";

import { BrainScanViewer, buildDemoBrainSeries } from "@/components/brain-scan-viewer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const demoSeries = buildDemoBrainSeries(12);

export function LandingClient() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-6 py-12 lg:px-10 lg:py-16">
      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="rounded-[2.4rem] border border-border/70 bg-white/92 p-8 shadow-[0_28px_90px_rgba(15,23,42,0.08)] lg:p-10">
          <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary">
            Cortent
          </Badge>
          <h1 className="mt-6 max-w-4xl text-6xl font-semibold leading-[0.9] tracking-tight text-balance md:text-7xl">
            Content analysis that looks and feels like a brain scan.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Cortent is a clean creator SaaS for short-form video. Upload a clip, get structured
            keep/fix/test/export guidance, remove deadspace automatically, and save every scan in a
            durable Convex-backed library.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
              Open the app
              <ArrowRight data-icon="inline-end" />
            </Link>
            <Link href="/app/library" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              View scan library
            </Link>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            <LandingFact
              icon={Brain}
              title="3D brain-style viewer"
              body="A branded scan surface that mirrors live attention signal without pretending to be medical."
            />
            <LandingFact
              icon={Scissors}
              title="Deadspace editor"
              body="Deterministic deadspace cuts export by default, with optional AI low-value removals kept separate."
            />
            <LandingFact
              icon={LibraryBig}
              title="Real SaaS history"
              body="Convex stores uploads, scans, selected cut plans, and export metadata so work survives local cleanup."
            />
          </div>
        </div>

        <BrainScanViewer
          autoPlay
          points={demoSeries}
          title="A clean, branded signal model"
          description="The landing experience introduces the same viewer the saved scan workspace uses: structured, bright, and synced to the clip timeline."
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <div className="rounded-[2rem] border border-border/70 bg-white/88 p-7 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Action board</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Structured output, not vague notes</h2>
          <div className="mt-6 grid gap-3">
            <ActionBoardPreview title="Keep" items={["Strong opening sentence", "Early camera reset", "Fast first visual change"]} />
            <ActionBoardPreview title="Fix now" items={["Trim idle deadspace", "Tighten the setup beat", "Move the strongest proof earlier"]} />
            <ActionBoardPreview title="Test next" items={["Swap the headline phrase", "Try faster caption pacing", "Open with the before/after reveal"]} />
            <ActionBoardPreview title="Export plan" items={["Ship deadspace cuts by default", "Optionally add AI low-value trims", "Save export back to this scan"]} />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[2rem] border border-border/70 bg-white/88 p-7 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Timeline editor</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Deadspace first. Optional AI trims second.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Cortent keeps deterministic deadspace cuts preselected so exports are conservative by
              default. Lower-confidence low-value suggestions stay visible, actionable, and off
              until you explicitly choose them.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ProcessCard
              title="Default cut plan"
              body="Stable cut IDs, timestamps, and reasons are written into the saved scan so the editor can restore your latest decision set."
            />
            <ProcessCard
              title="Past exports"
              body="Every trimmed MP4 attaches back to the same saved scan record instead of replacing the original upload."
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function LandingFact({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Brain;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="size-4 text-primary" />
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function ActionBoardPreview({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.45rem] border border-border/70 bg-background/70 p-4">
      <div className="flex items-center gap-2 text-foreground">
        <Sparkles className="size-4 text-primary" />
        <p className="font-semibold">{title}</p>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <p key={item} className="text-sm leading-6 text-muted-foreground">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function ProcessCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.6rem] border border-border/70 bg-white/88 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.05)]">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
