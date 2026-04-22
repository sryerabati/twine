import { RepurposeProjectClient } from "@/components/repurpose-project-client";

export default async function RepurposeProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <RepurposeProjectClient projectId={projectId} />;
}
