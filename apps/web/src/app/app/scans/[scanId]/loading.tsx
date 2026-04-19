import { ScanWorkspaceSkeleton } from "@/components/loading-states";

export default function ScanLoading() {
  return (
    <ScanWorkspaceSkeleton
      title="Loading scan workspace"
      body="Preparing the saved scan view and restoring its latest analysis state."
    />
  );
}
