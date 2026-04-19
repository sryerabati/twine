import type {
  AnalysisResponse,
  CompareResponse,
  EditorDraftResponse,
  HealthResponse,
  TrimResponse,
  UploadResponse,
} from "@/lib/contracts";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health", { cache: "no-store" });
}

export async function uploadVideo(
  file: File,
  convexUploadId?: string,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (convexUploadId) {
    formData.append("convexUploadId", convexUploadId);
  }
  return request<UploadResponse>("/api/upload", {
    method: "POST",
    body: formData,
  });
}

export async function startAnalysis(
  uploadId: string,
  options?: {
    convexScanId?: string;
    syncToConvexScan?: boolean;
  },
): Promise<AnalysisResponse> {
  return request<AnalysisResponse>("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uploadId,
      convexScanId: options?.convexScanId,
      syncToConvexScan: options?.syncToConvexScan ?? true,
    }),
  });
}

export async function fetchAnalysis(analysisId: string): Promise<AnalysisResponse> {
  return request<AnalysisResponse>(`/api/analysis/${analysisId}`, {
    cache: "no-store",
  });
}

export async function fetchAnalysisByUpload(uploadId: string): Promise<AnalysisResponse> {
  return request<AnalysisResponse>(`/api/analysis/by-upload/${uploadId}`, {
    cache: "no-store",
  });
}

export async function trimAnalysis(
  analysisId: string,
  cutIds?: string[],
): Promise<TrimResponse> {
  return request<TrimResponse>(`/api/analysis/${analysisId}/trim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cutIds }),
  });
}

export async function compareAnalyses(
  analysisIdA: string,
  analysisIdB: string,
): Promise<CompareResponse> {
  return request<CompareResponse>("/api/compare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ analysisIdA, analysisIdB }),
  });
}

export async function generateEditorDraft(
  convexProjectId: string,
  clips: Array<{
    clipId: string;
    uploadId: string;
    localUploadId: string;
    filename: string;
  }>,
): Promise<EditorDraftResponse> {
  return request<EditorDraftResponse>("/api/editor/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      convexProjectId,
      clips,
    }),
  });
}

export async function fetchLatestEditorDraft(projectId: string): Promise<EditorDraftResponse> {
  return request<EditorDraftResponse>(`/api/editor/projects/${projectId}/latest-draft`, {
    cache: "no-store",
  });
}
