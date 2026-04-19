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

const navButtonClassName =
  "rounded-full border-[#19241d] bg-card text-foreground shadow-[5px_5px_0_0_var(--color-border)] hover:border-primary hover:bg-primary hover:text-primary-foreground hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_0_var(--color-border)] active:border-primary active:bg-secondary active:text-secondary-foreground active:shadow-[2px_2px_0_0_var(--color-border)] active:not-aria-[haspopup]:translate-x-[3px] active:not-aria-[haspopup]:translate-y-[3px]";

const activeNavButtonClassName =
  "border-primary bg-secondary text-secondary-foreground translate-x-[3px] translate-y-[3px] shadow-[2px_2px_0_0_var(--color-border)] hover:border-primary hover:bg-secondary hover:text-secondary-foreground hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0_0_var(--color-border)] active:border-primary active:bg-secondary active:text-secondary-foreground active:shadow-[2px_2px_0_0_var(--color-border)] active:not-aria-[haspopup]:translate-x-[3px] active:not-aria-[haspopup]:translate-y-[3px]";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const currentUser = useQuery("users:currentUser" as never, {}) as CurrentUser | null | undefined;
  const userLabel = currentUser?.name?.trim() || currentUser?.email || "Workspace";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b-2 border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground shadow-[4px_4px_0_0_var(--color-primary)]">
                <ScanEye className="size-5" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
                  Twine
                </p>
                <p className="text-xs text-primary/70">Command deck for saved scans</p>
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

          <div className="flex items-center gap-2">
            {currentUser?.email ? (
              <div className="hidden rounded-full border-2 border-border bg-secondary px-3 py-1.5 text-xs text-secondary-foreground shadow-[2px_2px_0_0_var(--shadow-stamp)] lg:block">
                {userLabel}
              </div>
            ) : null}
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

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
