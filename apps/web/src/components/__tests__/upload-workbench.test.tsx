import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { UploadWorkbench } from "@/components/upload-workbench";

const createPendingUpload = vi.fn();
const createPendingScan = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: vi.fn((name: string) => {
    if (name === "uploads:createPendingUpload") {
      return createPendingUpload;
    }
    if (name === "scans:createPendingScan") {
      return createPendingScan;
    }
    return vi.fn();
  }),
}));

vi.mock("@/lib/api", () => ({
  fetchHealth: vi.fn(),
  uploadVideo: vi.fn(),
  startAnalysis: vi.fn(),
}));

describe("UploadWorkbench", () => {
  beforeEach(async () => {
    createPendingUpload.mockReset();
    createPendingScan.mockReset();
    createPendingUpload.mockResolvedValue("convex-upload-1");
    createPendingScan.mockResolvedValue("scan-1");
    const api = await import("@/lib/api");
    vi.mocked(api.fetchHealth).mockResolvedValue({
      ok: false,
      analysisBackend: "gemini",
      pythonVersion: "3.11.14",
      ffmpegAvailable: true,
      ffprobeAvailable: true,
      huggingFaceTokenPresent: false,
      geminiApiKeyPresent: true,
      selectedDevice: "remote",
      modelStatus: "unloaded",
      modelRepo: "google/gemini-2.5-pro",
      modelCommit: "api",
      blockers: [],
      notes: [],
    });
    vi.mocked(api.uploadVideo).mockResolvedValue({
      uploadId: "upload-1",
      video: {
        uploadId: "upload-1",
        filename: "clip.mp4",
        sourceUrl: "/storage/uploads/upload-1/source.mp4",
        thumbnailUrl: "/storage/uploads/upload-1/thumbnail.jpg",
        durationSec: 12,
        width: 1080,
        height: 1920,
        sizeBytes: 1024,
      },
    });
    vi.mocked(api.startAnalysis).mockResolvedValue({
      analysisId: "analysis-1",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      payload: null,
    });
  });

  it("renders health information and triggers single-upload analysis", async () => {
    const onSingleReady = vi.fn();
    const onCompareReady = vi.fn();
    const user = userEvent.setup();

    render(
      <UploadWorkbench
        onSingleReady={onSingleReady}
        onCompareReady={onCompareReady}
      />,
    );

    expect(await screen.findByRole("tab", { name: /One saved scan/i })).toBeInTheDocument();
    expect(screen.getByText(/Upload and analyze/i)).toBeInTheDocument();
    expect(screen.queryByText(/TRIBE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meta/i)).not.toBeInTheDocument();

    const input = screen.getAllByLabelText(/Select an MP4/i)[0];
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /Analyze video/i }));

    await waitFor(() => {
      expect(onSingleReady).toHaveBeenCalledWith({
        scanId: "scan-1",
        analysisId: "analysis-1",
      });
    });
  });
});
