import { BrandShell } from "@/components/brand-shell";
import { CompareWorkspaceSkeleton } from "@/components/loading-states";

export default function LegacyCompareLoading() {
  return (
    <BrandShell compact>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <CompareWorkspaceSkeleton
          badge="Loading compare"
          title="Loading compare workspace"
          body="Preparing both analysis inputs so the compare decision can render."
        />
      </main>
    </BrandShell>
  );
}
