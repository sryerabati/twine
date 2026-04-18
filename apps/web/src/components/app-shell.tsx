"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowUpRight, Library, LogOut, ScanEye, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/library", label: "Library" },
  { href: "/compare", label: "Compare" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const currentUser = useQuery("users:currentUser" as never, {}) as CurrentUser | null | undefined;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,137,74,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(87,182,193,0.12),transparent_24%),linear-gradient(180deg,#fcfbf7,#f4efe4_48%,#fbfaf7)]">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <ScanEye className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-[0.22em] text-foreground uppercase">
                  Cortent
                </p>
                <p className="text-xs text-muted-foreground">Content, viewed like a brain scan.</p>
              </div>
            </Link>
            <nav className="hidden items-center gap-2 md:flex">
              {navigation.map((item) => {
                const active =
                  item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      buttonVariants({ variant: active ? "default" : "ghost", size: "sm" }),
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {currentUser?.email ? (
              <div className="hidden rounded-full border border-border/70 bg-white/80 px-4 py-2 text-sm text-muted-foreground lg:block">
                {currentUser.name ?? currentUser.email}
              </div>
            ) : null}
            <Link href="/runbook" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden md:inline-flex")}>
              Runbook
              <ArrowUpRight data-icon="inline-end" />
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void signOut()}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
        {children}
      </main>

      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 pb-10 pt-2 text-sm text-muted-foreground lg:px-10">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Structured creator analysis, durable scan history, export-ready trims.
        </div>
        <div className="flex items-center gap-2">
          <Library className="size-4" />
          Convex-backed SaaS workspace
        </div>
      </footer>
    </div>
  );
}
