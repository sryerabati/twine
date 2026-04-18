import type {
  AnalysisResponse,
  CompareResponse,
  HealthResponse,
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
  convexUploadId: string,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  // FastAPI reads this field and, when REQUIRE_CONVEX_IDS=true, 400s if absent.
  // Field name is camelCase to match the backend router's expected key.
  formData.append("convexUploadId", convexUploadId);
  return request<UploadResponse>("/api/upload", {
    method: "POST",
    body: formData,
  });
}

export async function startAnalysis(
  uploadId: string,
  convexScanId: string,
): Promise<AnalysisResponse> {
  return request<AnalysisResponse>("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uploadId, convexScanId }),
  });
}

export async function fetchAnalysis(analysisId: string): Promise<AnalysisResponse> {
  return request<AnalysisResponse>(`/api/analysis/${analysisId}`, {
    cache: "no-store",
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
