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
    <section className="mx-auto max-w-[84rem] px-6 py-14 sm:px-10 lg:px-16 lg:py-18 xl:px-20">
      <div
        className={cn(
          "grid items-center gap-8 lg:gap-12",
          isEditor ? "lg:grid-cols-[0.92fr_1.08fr]" : "lg:grid-cols-[1.08fr_0.92fr]",
        )}
      >
        <div className={cn(isEditor ? "lg:order-2" : "lg:order-1")}>
          <div className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/75">
              {eyebrow}
            </p>
            <h2 className="mt-4 max-w-[13ch] font-heading text-4xl leading-[0.95] tracking-[-0.06em] text-foreground md:text-5xl">
              {title}
            </h2>
            <p className="mt-5 max-w-[42rem] text-base leading-8 text-muted-foreground md:text-lg">
              {body}
            </p>
          </div>

          <dl className="mt-8 grid gap-4 md:grid-cols-3">
            {bullets.map((item) => (
              <div key={item.label} className="surface-soft rounded-[1.5rem] p-4">
                <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-primary/75">
                  {item.label}
                </dt>
                <dd className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={cn("relative", isEditor ? "lg:order-1" : "lg:order-2")}>{visual}</div>
      </div>
    </section>
  );
}
