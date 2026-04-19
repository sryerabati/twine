"use client";

import { LandingBrainModel } from "@/components/landing-brain-model";
import { PublicAuthLink } from "@/components/auth/public-auth-link";
import { BrandLockup } from "@/components/brand-lockup";

export function LandingClient() {
  return (
    <main className="overflow-hidden bg-background">
      <section className="grid min-h-[calc(100svh-73px)] items-center gap-14 px-6 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:px-10 lg:py-16">
        <div className="max-w-xl">
          <BrandLockup variant="hero" />
          <h1 className="mt-8 max-w-[9ch] font-heading text-6xl leading-[0.9] tracking-[-0.06em] text-foreground md:text-7xl lg:text-[5.9rem]">
            Read the room before you post.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-muted-foreground">
            Drop in one cut or make two fight. Twine points at the one that actually lands.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <PublicAuthLink className="inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-[6px_6px_0_0_var(--shadow-stamp)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_var(--shadow-stamp)]" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/70">
              One upload. One verdict.
            </span>
          </div>
        </div>

        <LandingBrainModel />
      </section>
    </main>
  );
}
