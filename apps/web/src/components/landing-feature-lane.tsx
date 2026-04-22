import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type LandingFeatureLaneProps = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: { label: string; description: string }[];
  visual: ReactNode;
  tone: "analysis" | "editor";
};

export function LandingFeatureLane({
  eyebrow,
  title,
  body,
  bullets,
  visual,
  tone,
}: LandingFeatureLaneProps) {
  const isEditor = tone === "editor";

  return (
    <section
      className={cn(
        "mx-auto-none",
        isEditor ? "border-y-[3px] border-border bg-muted" : "bg-background",
      )}
    >
      <div className="mx-auto max-w-[86rem] px-6 py-[4.5rem] sm:px-10 lg:px-16">
        <div
          className={cn(
            "grid items-center gap-8 lg:gap-14",
            isEditor ? "lg:grid-cols-[1.1fr_0.9fr]" : "lg:grid-cols-[0.9fr_1.1fr]",
          )}
        >
          {/* Copy */}
          <div className={cn(isEditor ? "lg:order-2" : "lg:order-1")}>
            <div className="max-w-xl">
              <span className="sticker w-fit">{eyebrow}</span>
              <h2
                className="mt-5 font-cartoon font-black text-foreground"
                style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", letterSpacing: "-0.04em", lineHeight: 1.02, maxWidth: "13ch" }}
              >
                {title}
              </h2>
              <p className="mt-5 text-[1.05rem] font-medium leading-[1.85] text-muted-foreground" style={{ maxWidth: "42rem" }}>
                {body}
              </p>
            </div>

            <dl className="mt-8 grid gap-3 sm:grid-cols-3">
              {bullets.map((item) => (
                <div
                  key={item.label}
                  className="spring rounded-[1.4rem] border-[3px] border-border bg-muted p-4 shadow-[5px_5px_0_0_var(--shadow-stamp)] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:[transform:translate(-2px,-2px)_rotate(-0.3deg)] hover:shadow-[8px_8px_0_0_var(--shadow-stamp)]"
                >
                  <dt className="text-[0.6rem] font-extrabold uppercase tracking-[0.2em] text-primary" style={{ opacity: 0.8 }}>
                    {item.label}
                  </dt>
                  <dd className="mt-2 text-[0.78rem] font-medium leading-[1.7] text-muted-foreground">
                    {item.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Visual */}
          <div className={cn("relative", isEditor ? "lg:order-1" : "lg:order-2")}>{visual}</div>
        </div>
      </div>
    </section>
  );
}
