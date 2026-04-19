"use client";

export function LandingEditorVisual() {
  return (
    <div className="surface relative overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,rgba(18,22,20,0.98),rgba(12,17,14,0.98))] p-5 md:p-6">
      <div className="absolute inset-x-6 top-4 flex items-center justify-between">
        <span className="sticker px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-secondary-foreground">
          Rough cut engine
        </span>
        <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[0.62rem] font-mono uppercase tracking-[0.2em] text-primary/80">
          Build lane
        </span>
      </div>

      <div className="relative grid gap-4 pt-12">
        <div
          className="surface-soft animate-[float-card_8s_ease-in-out_infinite] rounded-[1.6rem] p-4"
          style={{ ["--float-rotate" as string]: "-1.5deg" }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
            Transcript-led rough cut
          </p>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-[92%] rounded-full bg-primary/30" />
            <div className="h-3 w-[78%] rounded-full bg-primary/20" />
            <div className="h-3 w-[66%] rounded-full bg-primary/25" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
          <div
            className="surface-soft animate-[float-card_9s_ease-in-out_infinite] rounded-[1.6rem] p-4"
            style={{ ["--float-rotate" as string]: "1deg" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
              Story order
            </p>
            <div className="mt-4 space-y-3">
              {["Hook", "Proof", "Offer", "CTA"].map((label, index) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-full border border-border/70 bg-background/70 px-3 py-2"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[0.68rem] font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div
              className="surface-soft animate-[float-card_7s_ease-in-out_infinite] rounded-[1.6rem] p-4"
              style={{ ["--float-rotate" as string]: "2deg" }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                Deadspace trim
              </p>
              <div className="mt-4 h-24 rounded-[1.1rem] border border-dashed border-primary/30 bg-[linear-gradient(180deg,rgba(53,184,95,0.22),rgba(53,184,95,0.04))]" />
            </div>

            <div className="rounded-[1.4rem] border-2 border-primary/35 bg-primary/12 px-4 py-3 shadow-[4px_4px_0_0_var(--shadow-stamp)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                First pass ready
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                Build a reviewable cut before the edit thread turns into guesswork.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
