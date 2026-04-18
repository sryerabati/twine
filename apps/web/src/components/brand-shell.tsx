import Link from "next/link";

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
      className="min-h-screen bg-[radial-gradient(circle_at_72%_18%,rgba(255,194,214,0.12),transparent_20%),radial-gradient(circle_at_18%_88%,rgba(198,108,149,0.1),transparent_26%),linear-gradient(180deg,#07070c_0%,#0d0b14_52%,#130f18_100%)]"
      data-compact={compact ? "true" : "false"}
    >
      <header className="sticky top-0 z-20 border-b border-white/8 bg-black/30 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.32em] text-primary">
            VibeCheck
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/app" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Login
            </Link>
            <Link href="/app" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
              Open dashboard
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
