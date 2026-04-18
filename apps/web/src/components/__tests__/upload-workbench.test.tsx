import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { UploadWorkbench } from "@/components/upload-workbench";

vi.mock("@/lib/api", () => ({
  fetchHealth: vi.fn(),
  uploadVideo: vi.fn(),
  startAnalysis: vi.fn(),
}));

describe("UploadWorkbench", () => {
  beforeEach(async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.fetchHealth).mockResolvedValue({
      ok: false,
      pythonVersion: "3.11.14",
      ffmpegAvailable: true,
      ffprobeAvailable: true,
      huggingFaceTokenPresent: false,
      selectedDevice: "cpu",
      modelStatus: "unloaded",
      modelRepo: "facebook/tribev2",
      modelCommit: "72399081ed3f1040c4d996cefb2864a4c46f5b8e",
      blockers: ["HUGGINGFACE_HUB_TOKEN is not set."],
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

    expect(await screen.findByRole("tab", { name: /Single cut/i })).toBeInTheDocument();
    expect(await screen.findByText(/HUGGINGFACE_HUB_TOKEN/i)).toBeInTheDocument();

    const input = screen.getAllByLabelText(/Select an MP4/i)[0];
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /Analyze single cut/i }));

    await waitFor(() => {
      expect(onSingleReady).toHaveBeenCalledWith("analysis-1");
    });
  });
});
