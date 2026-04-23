"use client";

const personas = [
  { initials: "CM", name: "Creator Mom",   role: "Content creator · 34", color: "#86d89e", score: 92 },
  { initials: "GZ", name: "Gen Z Gamer",   role: "Gamer · 22",           color: "#35b85f", score: 71 },
  { initials: "FP", name: "Fitness Pro",   role: "Health & wellness · 28",color: "#1e6b38", score: 84 },
  { initials: "BM", name: "Brand Manager", role: "Marketing · 38",        color: "#2a4e39", score: 68 },
];

export function LandingRoomVisual() {
  return (
    <div className="surface relative w-full max-w-[42rem] p-5 md:p-6">
      <svg
        width={18}
        height={18}
        viewBox="0 0 26 26"
        className="pointer-events-none absolute right-5 top-14"
        style={{ opacity: 0.35, animation: "sparkle-spin 8s linear infinite" }}
        aria-hidden
      >
        <path
          d="M13 2 L14.1 11.9 L24 13 L14.1 14.1 L13 24 L11.9 14.1 L2 13 L11.9 11.9 Z"
          fill="var(--primary)"
        />
      </svg>

      {/* Sticker labels */}
      <div className="absolute left-5 top-5 flex items-center gap-2">
        <span className="sticker" style={{ transform: "rotate(-1.5deg)" }}>
          Read the room
        </span>
        <span className="sticker sticker-green" style={{ transform: "rotate(0.8deg)" }}>
          ● 4 readers
        </span>
      </div>

      {/* Persona rows */}
      <div className="mt-12 grid gap-2">
        {personas.map((p, index) => (
          <div
            key={p.name}
            className={[
              "surface-soft spring cursor-default flex items-center gap-3 px-4 py-3 hover:shadow-[8px_8px_0_0_var(--shadow-stamp)]",
              index === 0 &&
                "[transform:rotate(-0.4deg)] hover:[transform:translate(-2px,-2px)_rotate(-0.3deg)]",
              index === 1 &&
                "[transform:rotate(0.4deg)] hover:[transform:translate(-2px,-2px)_rotate(0.3deg)]",
              index === 2 &&
                "[transform:rotate(-0.4deg)] hover:[transform:translate(-2px,-2px)_rotate(-0.4deg)]",
              index === 3 &&
                "[transform:rotate(0.4deg)] hover:[transform:translate(-2px,-2px)_rotate(0.4deg)]",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* Avatar */}
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-border font-cartoon text-xs font-black"
              style={{ background: p.color, color: "#050705" }}
            >
              {p.initials}
            </div>
            {/* Name + role */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.82rem] font-extrabold text-foreground">{p.name}</p>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {p.role}
              </p>
            </div>
            {/* Meter + score */}
            <div className="flex shrink-0 items-center gap-2">
              <div className="h-2 w-16 overflow-hidden rounded-full border border-border bg-primary/14">
                <div className="h-full rounded-full bg-primary" style={{ width: `${p.score}%` }} />
              </div>
              <span className="font-cartoon w-8 text-right text-[0.75rem] font-black text-foreground">
                {p.score}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary bar */}
      <div className="spring mt-3 flex cursor-default items-center justify-between rounded-[1.2rem] border-2 border-primary/30 bg-primary/8 px-4 py-2.5 hover:[transform:translate(-2px,-2px)] hover:shadow-[7px_7px_0_0_var(--primary)/40]">
        <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.18em] text-primary/80">
          Avg signal strength
        </p>
        <p className="font-cartoon text-[1.1rem] font-black text-primary">79%</p>
      </div>
    </div>
  );
}
