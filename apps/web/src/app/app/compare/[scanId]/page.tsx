import { CompareScanDetailClient } from "@/components/compare-scan-detail-client";

export default async function CompareScanPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;

  return <CompareScanDetailClient scanId={scanId} />;
}
