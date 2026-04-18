"use client";

import { useRouter } from "next/navigation";

import { UploadWorkbench } from "@/components/upload-workbench";

export function LandingClient() {
  const router = useRouter();

  return (
    <UploadWorkbench
      onSingleReady={(analysisId) => router.push(`/analysis/${analysisId}`)}
      onCompareReady={(analysisIdA, analysisIdB) =>
        router.push(`/compare?a=${analysisIdA}&b=${analysisIdB}`)
      }
    />
  );
}
