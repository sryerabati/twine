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
      <header className="border-b border-primary/15 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <BrandLockup href="/" showMeta={false} />
          <nav className="flex items-center gap-3">
            <PublicAuthLink className="inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[4px_4px_0_0_var(--shadow-stamp)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_var(--shadow-stamp)]" />
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
