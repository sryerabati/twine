"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LogOut } from "lucide-react";

import { BrandLockup } from "@/components/brand-lockup";
import { WorkspaceIdentitySkeleton } from "@/components/loading-states";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/library", label: "Library" },
  { href: "/app/repurpose", label: "Repurpose" },
  { href: "/app/editor", label: "AI Editor" },
];

const navButtonClassName =
  "spring rounded-full border-[3px] border-border bg-card font-cartoon font-extrabold text-foreground shadow-[5px_5px_0_0_var(--shadow-stamp)] hover:border-primary hover:bg-primary hover:text-shadow-stamp hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[7px_7px_0_0_var(--shadow-stamp)]";

const activeNavButtonClassName =
  "border-primary bg-primary text-shadow-stamp -translate-x-[2px] -translate-y-[2px] shadow-[7px_7px_0_0_var(--shadow-stamp)]";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const currentUser = useQuery("users:currentUser" as never, {}) as CurrentUser | null | undefined;
  const userLabel = currentUser?.name?.trim() || currentUser?.email || "Workspace";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b-2 border-primary/20 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4 lg:px-10">
          <div className="flex min-w-0 items-center gap-4 lg:gap-6">
            <BrandLockup href="/" variant="cartoon" showMeta={false} />
            <nav className="hidden items-center gap-1 md:flex">
              {navigation.map((item) => {
                const active =
                  item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      navButtonClassName,
                      active && activeNavButtonClassName,
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {currentUser === undefined ? (
              <WorkspaceIdentitySkeleton />
            ) : currentUser?.email ? (
              <div className="hidden rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs text-foreground/80 shadow-[0_14px_32px_-28px_rgba(53,184,95,0.95)] lg:block">
                {userLabel}
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="border-primary/25 bg-background/70 shadow-[0_14px_32px_-28px_rgba(53,184,95,0.95)] hover:border-primary/45 hover:bg-primary/10"
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
