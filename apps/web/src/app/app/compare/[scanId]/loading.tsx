import { CompareWorkspaceSkeleton } from "@/components/loading-states";

export default function CompareLoading() {
  return (
    <CompareWorkspaceSkeleton
      title="Loading compare workspace"
      body="Preparing the saved compare run and restoring the winner summary."
    />
  );
}
