import Link from "next/link";

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
    <div className="min-h-screen bg-hero bg-grid">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className="rounded-full bg-primary/15 text-primary"
            >
              CC BY-NC 4.0 demo
            </Badge>
            <Link href="/" className="font-medium tracking-[0.24em] uppercase text-sm">
              TRIBE v2 Creator Analyzer
            </Link>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/runbook"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Runbook
            </Link>
            <Link
              href="/history"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              History
            </Link>
            {!compact ? (
              <a
                href="https://github.com/facebookresearch/tribev2"
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Official TRIBE repo
              </a>
            ) : null}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
