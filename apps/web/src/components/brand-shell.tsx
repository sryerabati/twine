import { PublicAuthLink } from "@/components/auth/public-auth-link";
import { BrandLockup } from "@/components/brand-lockup";

export function BrandShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background" data-compact={compact ? "true" : "false"}>
      <header className="sticky top-0 z-50 border-b-[3px] border-border bg-background/94 backdrop-blur-[18px]">
        <div className="mx-auto flex max-w-[86rem] items-center justify-between px-6 py-[0.9rem] sm:px-10 lg:px-16">
          <BrandLockup href="/" variant="cartoon" showMeta={false} />
          <nav className="flex items-center gap-3">
            <PublicAuthLink
              unauthenticatedLabel="Get started →"
              authenticatedLabel="Open app →"
              className="spring inline-flex items-center justify-center rounded-full border-[3px] border-shadow-stamp bg-primary px-[1.35em] py-[0.6em] text-[0.88rem] font-extrabold text-shadow-stamp shadow-[8px_8px_0_0_var(--shadow-stamp)] hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[11px_11px_0_0_var(--shadow-stamp)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_var(--shadow-stamp)]"
            />
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
