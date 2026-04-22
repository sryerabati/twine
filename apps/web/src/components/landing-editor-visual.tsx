"use client";

export function LandingEditorVisual() {
  return (
    <div className="surface relative overflow-hidden bg-[linear-gradient(160deg,var(--card)_0%,#0c1411_100%)] p-5 md:p-6">
      {/* Header */}
      <div className="absolute inset-x-5 top-5 flex items-center justify-between">
        <span className="sticker" style={{ transform: "rotate(-0.8deg)" }}>
          Rough cut engine
        </span>
        <span className="rounded-full border-2 border-primary/22 bg-primary/7 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-primary/80">
          Build lane
        </span>
      </div>

      <div className="relative grid gap-4 pt-14">
        {/* Chip 1: Transcript */}
        <div
          className="surface-soft animate-[float-card_8s_ease-in-out_infinite] p-4"
          style={{ ["--float-rotate" as string]: "-1.2deg", animationDelay: "-2s" }}
        >
          <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.2em] text-primary" style={{ opacity: 0.8 }}>
            Transcript-led rough cut
          </p>
          <div className="mt-4 space-y-2">
            <div className="h-2 rounded-full bg-primary/30" style={{ width: "90%" }} />
            <div className="h-2 rounded-full bg-primary/20" style={{ width: "75%" }} />
            <div className="h-2 rounded-full bg-primary/25" style={{ width: "62%" }} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
          {/* Chip 2: Story order */}
          <div
            className="surface-soft animate-[float-card_9.5s_ease-in-out_infinite] p-4"
            style={{ ["--float-rotate" as string]: "0.9deg", animationDelay: "-4s" }}
          >
            <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.2em] text-primary" style={{ opacity: 0.8 }}>
              Story order
            </p>
            <div className="mt-4 space-y-2.5">
              {[
                { n: 1, label: "Hook" },
                { n: 2, label: "Proof" },
                { n: 3, label: "Offer" },
                { n: 4, label: "CTA" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2.5 rounded-full border border-border/70 bg-background/70 px-3 py-1.5"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6rem] font-black text-shadow-stamp">
                    {item.n}
                  </span>
                  <span className="text-[0.82rem] font-semibold text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {/* Chip 3: Deadspace */}
            <div
              className="surface-soft animate-[float-card_7.2s_ease-in-out_infinite] p-4"
              style={{ ["--float-rotate" as string]: "1.8deg" }}
            >
              <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.2em] text-primary" style={{ opacity: 0.8 }}>
                Deadspace trim
              </p>
              <div className="mt-4 h-20 rounded-[1rem] border-2 border-dashed border-border bg-[linear-gradient(180deg,rgba(53,184,95,0.16),rgba(53,184,95,0.03))]" />
            </div>

            {/* Highlight */}
            <div className="rounded-[1.4rem] border-[3px] border-primary bg-primary/9 px-4 py-3 shadow-[5px_5px_0_0_var(--shadow-stamp)]">
              <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.2em] text-primary" style={{ opacity: 0.8 }}>
                First pass ready
              </p>
              <p className="mt-2 text-[0.82rem] font-medium leading-6 text-foreground">
                Build a reviewable cut before the edit thread turns into guesswork.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
