import { EditorProjectClient } from "@/components/editor-project-client";

export default async function EditorProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditorProjectClient projectId={projectId} />;
}
