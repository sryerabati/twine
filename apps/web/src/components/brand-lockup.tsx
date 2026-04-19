import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandLockupProps = {
  className?: string;
  href?: string;
  variant?: "nav" | "hero";
};

const variantStyles = {
  nav: {
    root: "gap-3",
    mark: "size-11 rounded-[1.35rem]",
    meta: "text-[0.6rem] tracking-[0.28em]",
    title: "text-[1.55rem] tracking-[-0.11em]",
  },
  hero: {
    root: "gap-4",
    mark: "size-14 rounded-[1.65rem] md:size-16",
    meta: "text-[0.66rem] tracking-[0.34em] md:text-[0.72rem]",
    title: "text-[2.2rem] tracking-[-0.12em] md:text-[2.7rem]",
  },
} as const;

export function BrandLockup({
  className,
  href,
  variant = "nav",
}: BrandLockupProps) {
  const styles = variantStyles[variant];
  const content = (
    <>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(53,184,95,0.12)_55%,rgba(7,16,10,0.02))] ring-1 ring-primary/15 shadow-[0_18px_40px_-24px_rgba(53,184,95,0.9)]",
          styles.mark,
        )}
      >
        <img
          src="/branding/twine-mark.png"
          alt=""
          aria-hidden="true"
          className="size-[90%] object-contain drop-shadow-[0_16px_18px_rgba(5,7,5,0.55)]"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("font-mono uppercase text-primary/70", styles.meta)}>
          Creative signal
        </span>
        <span className={cn("font-heading font-semibold leading-none text-foreground", styles.title)}>
          Twine
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="Twine"
        className={cn("inline-flex items-center", styles.root, className)}
      >
        {content}
      </Link>
    );
  }

  return <div className={cn("inline-flex items-center", styles.root, className)}>{content}</div>;
}
