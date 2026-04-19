import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type WorkspaceSkeletonProps = {
  badge?: string;
  eyebrow?: string;
  title: string;
  body: string;
  progress?: {
    ariaLabel?: string;
    value: number;
    label: string;
    hint: string;
  };
};

export function WorkspaceIdentitySkeleton() {
  return (
    <div className="hidden rounded-full border-2 border-border bg-secondary/35 px-3 py-2 shadow-[2px_2px_0_0_var(--shadow-stamp)] lg:flex">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16 bg-foreground/10" />
        <Skeleton className="h-3 w-24 bg-foreground/10" />
      </div>
    </div>
  );
}

export function AuthLoadingSkeleton() {
  return (
    <div className="surface mx-auto flex w-full max-w-md flex-col gap-5 rounded-[1.75rem] p-8">
      <Badge variant="secondary" className="w-fit">
        Secure workspace
      </Badge>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Loading Twine</h1>
        <p className="text-sm text-muted-foreground">Restoring auth and saved scans.</p>
      </div>
      <div className="surface-soft rounded-[1.4rem] p-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-12 w-full rounded-[1rem]" />
        <Skeleton className="mt-3 h-12 w-full rounded-[1rem]" />
        <Skeleton className="mt-4 h-10 w-full rounded-full" />
      </div>
    </div>
  );
}

export function SavedScanCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
      {Array.from({ length: count }, (_, index) => (
        <article
          key={index}
          className="surface flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] p-6"
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-7 w-[4.5rem] rounded-full" />
              <Skeleton className="h-7 w-[5.5rem] rounded-full" />
            </div>
            <Skeleton className="h-4 w-28 sm:ml-auto" />
          </div>

          <div className="mt-4 min-w-0">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>

          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>

          <div className="mt-5 grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-3">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-32 rounded-full" />
          </div>

          <div className="mt-auto flex flex-wrap gap-3 pt-6">
            <Skeleton className="h-11 w-28 rounded-full" />
            <Skeleton className="h-11 w-32 rounded-full" />
          </div>
        </article>
      ))}
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-8">
      <section className="surface rounded-[2.4rem] p-6 text-foreground lg:p-8">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary">Upload workspace</Badge>
              <h1 className="text-3xl font-semibold tracking-tight">Loading your command deck</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Restoring the upload workbench and recent scan history.
              </p>
            </div>
            <Skeleton className="h-9 w-36 rounded-full" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <UploadLaneSkeleton />
            <UploadLaneSkeleton />
          </div>

          <div className="flex flex-col gap-4 border-t border-border/70 pt-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-11 w-36 rounded-full" />
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Saved scans</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Recent scans</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Pulling your latest completed runs and in-flight scans.
            </p>
          </div>
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>
        <SavedScanCardsSkeleton />
      </section>
    </div>
  );
}

export function LibraryPageSkeleton() {
  return (
    <div className="space-y-6">
      <section className="surface rounded-[1.75rem] p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Scan library</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Saved scans and compare runs</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Rebuilding your scan history so you can jump back into any saved workspace.
        </p>
      </section>
      <SavedScanCardsSkeleton />
    </div>
  );
}

export function ScanWorkspaceSkeleton({
  badge = "Loading scan workspace",
  eyebrow = "Scan workspace",
  title,
  body,
}: WorkspaceSkeletonProps) {
  return (
    <WorkspaceSkeleton
      badge={badge}
      eyebrow={eyebrow}
      title={title}
      body={body}
    />
  );
}

export function CompareWorkspaceSkeleton({
  badge = "Loading compare workspace",
  eyebrow = "Compare workspace",
  title,
  body,
}: WorkspaceSkeletonProps) {
  return (
    <WorkspaceSkeleton
      badge={badge}
      eyebrow={eyebrow}
      title={title}
      body={body}
    />
  );
}

export function AnalysisWorkspaceSkeleton({
  badge,
  eyebrow = "Analysis workspace",
  title,
  body,
  progress,
}: WorkspaceSkeletonProps) {
  return (
    <WorkspaceSkeleton
      badge={badge}
      eyebrow={eyebrow}
      title={title}
      body={body}
      progress={progress}
    />
  );
}

function WorkspaceSkeleton({
  badge,
  eyebrow,
  title,
  body,
  progress,
}: WorkspaceSkeletonProps) {
  return (
    <div className="space-y-6">
      <div className="surface rounded-[2.5rem] p-8 text-foreground">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">{eyebrow}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{body}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-52 max-w-full" />
            </div>

            {progress ? (
              <div className="mt-6 max-w-2xl rounded-[1.5rem] border border-border/80 bg-card/45 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">
                      {progress.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{progress.hint}</p>
                  </div>
                  <p
                    data-testid="analysis-progress-value"
                    className="text-2xl font-semibold tracking-tight text-foreground"
                  >
                    {Math.round(progress.value)}%
                  </p>
                </div>

                <div
                  aria-label={progress.ariaLabel ?? "Scan progress"}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.round(progress.value)}
                  className="mt-4 h-3 overflow-hidden rounded-full border border-border bg-[#151a16]"
                  data-testid="analysis-progress-bar"
                  role="progressbar"
                >
                  <div
                    data-testid="analysis-progress-fill"
                    className="h-full rounded-full bg-[linear-gradient(90deg,#35b85f_0%,#73d18f_48%,#c8f0d0_100%)] transition-[width] duration-700 ease-out"
                    style={{ width: `${progress.value}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-soft rounded-[2rem] p-6">
          <Skeleton className="h-72 w-full rounded-[1.6rem]" />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Skeleton className="h-14 rounded-[1.2rem]" />
            <Skeleton className="h-14 rounded-[1.2rem]" />
            <Skeleton className="h-14 rounded-[1.2rem]" />
          </div>
          <Skeleton className="mt-6 h-56 w-full rounded-[1.6rem]" />
        </div>

        <div className="surface-soft rounded-[2rem] p-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-4 h-24 w-full rounded-[1.4rem]" />
          <Skeleton className="mt-4 h-24 w-full rounded-[1.4rem]" />
          <Skeleton className="mt-4 h-24 w-full rounded-[1.4rem]" />
          <Skeleton className="mt-6 h-11 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

function UploadLaneSkeleton() {
  return (
    <div className="surface-soft rounded-[1.75rem] p-5">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-5 h-32 w-full rounded-[1.4rem]" />
      <div className="mt-4 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="min-w-0">
      <span aria-hidden="true" className="block h-px w-8 bg-border/80" />
      <Skeleton className="mt-3 h-3 w-12" />
      <Skeleton className="mt-2 h-6 w-10" />
    </div>
  );
}
