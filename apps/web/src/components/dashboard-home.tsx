"use client";

import Link from "next/link";
import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowUpRight, Sparkles } from "lucide-react";

import { BrainScanViewer, buildDemoBrainSeries } from "@/components/brain-scan-viewer";
import { SavedScanCards } from "@/components/scan-cards";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { UploadWorkbench } from "@/components/upload-workbench";
import type { SavedScanSummary } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const demoSeries = buildDemoBrainSeries(12);

export function DashboardHome() {
  const router = useRouter();
  const recentScans = useQuery("scans:listRecentMine" as never, {}) as
    | SavedScanSummary[]
    | undefined;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[2rem] border border-border/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary">
            Cortent workspace
          </Badge>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-tight text-balance">
            Scan creator footage, keep the strong moments, and export a tighter cut.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Every upload is stored as a user-owned scan in Convex before the Python worker starts.
            That gives you a real SaaS history: revisit scores, restore selected cuts, and keep
            each exported trim attached to the same scan record.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/library" className={cn(buttonVariants({ variant: "default" }))}>
              Open library
              <ArrowUpRight data-icon="inline-end" />
            </Link>
            <Link href="/compare" className={cn(buttonVariants({ variant: "outline" }))}>
              Secondary compare flow
            </Link>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <InsightCard title="Keep / Fix / Test" body="Gemini-normalized output ships as a structured action board, not a blob of notes." />
            <InsightCard title="Deadspace + low-value" body="Deterministic deadspace cuts stay preselected while optional AI trims stay reviewable." />
            <InsightCard title="Saved export history" body="Each export writes back to the same scan record instead of replacing the original upload." />
          </div>
        </div>

        <BrainScanViewer
          autoPlay
          points={demoSeries}
          title="Live brain-style content scan"
          description="The branded 3D viewer is decorative but useful: it tracks the same timeline signal the editor uses for cuts, hooks, and pacing calls."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <UploadWorkbench
          onSingleReady={({ scanId }) => {
            startTransition(() => {
              router.push(`/app/scans/${scanId}`);
            });
          }}
          onCompareReady={({ analysisIdA, analysisIdB }) => {
            startTransition(() => {
              router.push(`/compare?a=${analysisIdA}&b=${analysisIdB}`);
            });
          }}
        />
        <div className="rounded-[2rem] border border-border/70 bg-white/88 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Structured output</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">What each completed scan saves</h2>
          <div className="mt-6 grid gap-4">
            <ChecklistItem title="Action board" body="Keep, fix now, test next, and export plan are always present in the saved payload." />
            <ChecklistItem title="Timeline segments" body="Every issue is timestamped with severity, reason, and the action to take next." />
            <ChecklistItem title="Cut plan" body="Stable cut IDs let the editor save user selections and export by exact cut set instead of raw indices." />
            <ChecklistItem title="Past exports" body="Trimmed MP4 artifacts stay attached to the scan record so you can reopen the same analysis later." />
          </div>
        </div>
      </section>

      <SavedScanCards
        scans={recentScans ?? []}
        loading={recentScans === undefined}
        title="Recent scans"
        description="Your latest completed or in-flight analyses. Open one to edit cuts, inspect the action board, or re-download the latest export."
      />
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function ChecklistItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
      <div className="flex items-center gap-2 text-foreground">
        <Sparkles className="size-4 text-primary" />
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
