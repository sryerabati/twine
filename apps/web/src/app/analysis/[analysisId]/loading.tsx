import { BrandShell } from "@/components/brand-shell";
import { AnalysisWorkspaceSkeleton } from "@/components/loading-states";

export default function AnalysisLoadingPage() {
  return (
    <BrandShell compact>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <AnalysisWorkspaceSkeleton
          badge="Loading analysis"
          title="Loading analysis workspace"
          body="Restoring the saved analysis payload and the editor surfaces around it."
        />
      </main>
    </BrandShell>
  );
}
