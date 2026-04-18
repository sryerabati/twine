"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingClient() {
  return (
    <main className="flex min-h-[calc(100svh-72px)] flex-col justify-end px-6 py-10 lg:px-10 lg:py-14">
      <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">VibeCheck</p>
          <h1 className="mt-6 text-6xl font-semibold leading-[0.9] tracking-tight text-white md:text-7xl">
            Know what hits before you ship.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
            Upload one cut or run an A/B test. VibeCheck gives you the verdict, the moments that
            matter, and the next move.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/app" className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
              Open dashboard
            </Link>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/8 bg-white/5 p-6 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Product preview</p>
          <p className="mt-3 text-lg text-white">
            Winner, top signal, and next action all above the fold.
          </p>
        </div>
      </section>
    </main>
  );
}
