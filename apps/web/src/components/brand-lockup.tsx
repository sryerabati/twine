import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandLockupProps = {
  className?: string;
  href?: string;
  variant?: "nav" | "hero" | "cartoon";
  showMeta?: boolean;
};

const variantStyles = {
  nav: {
    root: "gap-4",
    mark: "size-13 rounded-[1.55rem]",
    surface:
      "border border-white/12 bg-card ring-primary/20 shadow-[0_18px_40px_-24px_rgba(53,184,95,0.28)]",
    meta: "text-[0.6rem] tracking-[0.28em]",
    title: "text-[1.9rem] tracking-[-0.11em]",
    titleFont: "font-heading font-semibold",
    titleColor: "text-foreground",
    metaColor: "text-primary/70",
  },
  hero: {
    root: "gap-4",
    mark: "size-14 rounded-[1.65rem] md:size-16",
    surface:
      "border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(53,184,95,0.12)_55%,rgba(7,16,10,0.02))] ring-primary/15 shadow-[0_18px_40px_-24px_rgba(53,184,95,0.9)]",
    meta: "text-[0.66rem] tracking-[0.34em] md:text-[0.72rem]",
    title: "text-[2.2rem] tracking-[-0.12em] md:text-[2.7rem]",
    titleFont: "font-heading font-semibold",
    titleColor: "text-foreground",
    metaColor: "text-primary/70",
  },
  cartoon: {
    root: "gap-3",
    mark: "size-[2.2rem] rounded-[0.7rem]",
    surface:
      "border-[3px] border-border bg-[var(--cartoon-green-xdk)] ring-transparent shadow-[3px_3px_0_0_var(--shadow-stamp)]",
    meta: "text-[0.6rem] tracking-[0.28em]",
    title: "text-[1.45rem] tracking-[-0.04em]",
    titleFont: "font-cartoon font-black",
    titleColor: "text-foreground",
    metaColor: "text-primary/70",
  },
} as const;

export function BrandLockup({
  className,
  href,
  variant = "nav",
  showMeta = true,
}: BrandLockupProps) {
  const styles = variantStyles[variant];
  const content = (
    <>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden ring-1",
          styles.surface,
          styles.mark,
        )}
      >
        <Image
          src="/branding/twine-leaf-play-mark.png"
          alt=""
          aria-hidden
          width={72}
          height={72}
          className="size-[84%] object-contain translate-x-[4%] drop-shadow-[0_16px_18px_rgba(5,7,5,0.55)]"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        {showMeta ? (
          <span className={cn("font-mono uppercase", styles.metaColor, styles.meta)}>
            Creative signal
          </span>
        ) : null}
        <span className={cn(styles.titleFont, "leading-none", styles.titleColor, styles.title)}>
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
