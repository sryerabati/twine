"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LogOut, ScanEye } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/library", label: "Library" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const currentUser = useQuery("users:currentUser" as never, {}) as CurrentUser | null | undefined;
  const userLabel = currentUser?.name?.trim() || currentUser?.email || "Workspace";

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.08),transparent_18%),linear-gradient(180deg,#0a0910_0%,#09070d_48%,#050507_100%)] text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(244,114,182,0.95),rgba(236,72,153,0.62))] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_42px_rgba(236,72,153,0.24)]">
                <ScanEye className="size-5" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/90">
                  VibeCheck
                </p>
                <p className="text-xs text-white/55">Command deck for saved scans</p>
              </div>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {navigation.map((item) => {
                const active =
                  item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      buttonVariants({ variant: active ? "default" : "ghost", size: "sm" }),
                      "rounded-full",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {currentUser?.email ? (
              <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 lg:block">
                {userLabel}
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              onClick={() => void signOut()}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
