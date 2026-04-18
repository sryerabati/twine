import { BrandShell } from "@/components/brand-shell";
import { AnalysisView } from "@/components/analysis-view";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;

  return (
    <BrandShell compact>
      <AnalysisView analysisId={analysisId} />
    </BrandShell>
  );
}
