import Link from "next/link";
import { ArrowUpRight, ScanEye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BrandShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,137,74,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(87,182,193,0.12),transparent_24%),linear-gradient(180deg,#fcfbf7,#f4efe4_54%,#fbfaf7)]"
      data-compact={compact ? "true" : "false"}
    >
      <header className="sticky top-0 z-20 border-b border-border/70 bg-white/78 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <ScanEye className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-[0.22em] uppercase text-foreground">Cortent</p>
                <p className="text-xs text-muted-foreground">Clean creator scan workspace</p>
              </div>
            </Link>
            <Badge variant="secondary" className="hidden rounded-full bg-primary/10 text-primary md:inline-flex">
              Public SaaS preview
            </Badge>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/app" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
              Open app
            </Link>
            <Link href="/compare" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Compare
            </Link>
            <Link
              href="/runbook"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Runbook
            </Link>
            <Link
              href="/app/library"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Library
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
