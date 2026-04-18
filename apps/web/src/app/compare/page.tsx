import { BrandShell } from "@/components/brand-shell";
import { CompareView } from "@/components/compare-view";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;

  return (
    <BrandShell compact>
      <CompareView analysisIdA={a ?? null} analysisIdB={b ?? null} />
    </BrandShell>
  );
}
