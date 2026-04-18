import { ScanDetailClient } from "@/components/scan-detail-client";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;

  return <ScanDetailClient scanId={scanId} />;
}
