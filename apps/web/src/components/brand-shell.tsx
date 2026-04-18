import Link from "next/link";

export function BrandShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background" data-compact={compact ? "true" : "false"}>
      <header className="border-b border-pink-200/10 bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-3 font-heading text-xl font-semibold tracking-tight text-pink-100"
          >
            <span className="inline-flex size-3 rounded-full border-2 border-pink-100 bg-pink-400" />
            VibeCheck
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/app"
              className="rounded-full px-3 py-2 text-sm font-medium text-pink-100/70 transition-colors hover:text-pink-50"
            >
              Login
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-full border-2 border-pink-200 bg-pink-400 px-4 py-2 text-sm font-semibold text-[#2d1322] shadow-[4px_4px_0_0_rgba(116,34,85,0.95)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_rgba(116,34,85,0.95)]"
            >
              Open dashboard
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
