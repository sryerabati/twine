import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UploadDropzone } from "@/components/upload-dropzone";
import { UploadWorkbench } from "@/components/upload-workbench";

const createPendingUpload = vi.fn();
const createPendingScan = vi.fn();
const createPendingCompareScan = vi.fn();
const attachCompareAnalysisIds = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: vi.fn((name: string) => {
    if (name === "uploads:createPendingUpload") {
      return createPendingUpload;
    }
    if (name === "scans:createPendingScan") {
      return createPendingScan;
    }
    if (name === "scans:createPendingCompareScan") {
      return createPendingCompareScan;
    }
    if (name === "scans:attachCompareAnalysisIds") {
      return attachCompareAnalysisIds;
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
    createPendingCompareScan.mockReset();
    attachCompareAnalysisIds.mockReset();
    createPendingUpload
      .mockResolvedValueOnce("convex-upload-1")
      .mockResolvedValueOnce("convex-upload-2")
      .mockResolvedValue("convex-upload-3");
    createPendingScan.mockResolvedValue("scan-1");
    createPendingCompareScan.mockResolvedValue("compare-scan-1");
    attachCompareAnalysisIds.mockResolvedValue("compare-scan-1");

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
    vi.mocked(api.uploadVideo)
      .mockResolvedValueOnce({
        uploadId: "upload-a",
        video: {
          uploadId: "upload-a",
          filename: "clip-a.mp4",
          sourceUrl: "/storage/uploads/upload-a/source.mp4",
          thumbnailUrl: "/storage/uploads/upload-a/thumbnail.jpg",
          durationSec: 12,
          width: 1080,
          height: 1920,
          sizeBytes: 1024,
        },
      })
      .mockResolvedValueOnce({
        uploadId: "upload-b",
        video: {
          uploadId: "upload-b",
          filename: "clip-b.mp4",
          sourceUrl: "/storage/uploads/upload-b/source.mp4",
          thumbnailUrl: "/storage/uploads/upload-b/thumbnail.jpg",
          durationSec: 12,
          width: 1080,
          height: 1920,
          sizeBytes: 1024,
        },
      })
      .mockResolvedValue({
        uploadId: "upload-c",
        video: {
          uploadId: "upload-c",
          filename: "clip-c.mp4",
          sourceUrl: "/storage/uploads/upload-c/source.mp4",
          thumbnailUrl: "/storage/uploads/upload-c/thumbnail.jpg",
          durationSec: 12,
          width: 1080,
          height: 1920,
          sizeBytes: 1024,
        },
      });
    vi.mocked(api.startAnalysis)
      .mockResolvedValueOnce({
        analysisId: "analysis-a",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      })
      .mockResolvedValueOnce({
        analysisId: "analysis-b",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      })
      .mockResolvedValue({
        analysisId: "analysis-c",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
        payload: null,
      });
  });

  it("routes single uploads to the scan page", async () => {
    const onSingleReady = vi.fn();
    const onCompareReady = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <UploadWorkbench
        onSingleReady={onSingleReady}
        onCompareReady={onCompareReady}
      />,
    );

    expect(await screen.findByText(/Drop a clip/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Single upload$/i })).toBeInTheDocument();

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    await user.upload(input as HTMLInputElement, file);
    await user.click(screen.getByRole("button", { name: /Start scan/i }));

    await waitFor(() => {
      expect(onSingleReady).toHaveBeenCalledWith({
        scanId: "scan-1",
        analysisId: "analysis-a",
      });
    });
  });

  it("creates one compare scan and attaches both analysis ids", async () => {
    const onSingleReady = vi.fn();
    const onCompareReady = vi.fn();
    const user = userEvent.setup();

    const api = await import("@/lib/api");

    const { container } = render(
      <UploadWorkbench
        onSingleReady={onSingleReady}
        onCompareReady={onCompareReady}
      />,
    );

    await user.click(screen.getByRole("button", { name: /A\/B test/i }));

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], {
      target: {
        files: [new File(["video-a"], "intro-cut.mp4", { type: "video/mp4" })],
      },
    });
    fireEvent.change(inputs[1], {
      target: {
        files: [new File(["video-b"], "alt-cut.mp4", { type: "video/mp4" })],
      },
    });
    expect(screen.getByRole("button", { name: /Start compare/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Start compare/i }));

    await waitFor(() => {
      expect(createPendingUpload).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.uploadVideo).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(createPendingCompareScan).toHaveBeenCalledWith({
        primaryUploadId: "convex-upload-1",
        secondaryUploadId: "convex-upload-2",
        title: "intro-cut vs alt-cut",
      });
      expect(vi.mocked(api.startAnalysis)).toHaveBeenCalledWith("upload-a", {
        syncToConvexScan: false,
      });
      expect(vi.mocked(api.startAnalysis)).toHaveBeenCalledWith("upload-b", {
        syncToConvexScan: false,
      });
      const attachArgs = attachCompareAnalysisIds.mock.calls[0]?.[0] as
        | {
            scanId: string;
            analysisIdA: string;
            analysisIdB: string;
          }
        | undefined;
      expect(attachArgs).toMatchObject({ scanId: "compare-scan-1" });
      expect(new Set([attachArgs?.analysisIdA, attachArgs?.analysisIdB])).toEqual(
        new Set(["analysis-a", "analysis-b"]),
      );
      expect(onCompareReady).toHaveBeenCalledWith({
        compareScanId: "compare-scan-1",
      });
    });
  });

  it("uses the same segmented toggle interaction for both modes", async () => {
    const user = userEvent.setup();

    render(
      <UploadWorkbench
        onSingleReady={vi.fn()}
        onCompareReady={vi.fn()}
      />,
    );

    const singleButton = await screen.findByRole("button", { name: /^Single upload$/i });
    const compareButton = screen.getByRole("button", { name: /A\/B test/i });

    expect(singleButton).toHaveClass("bg-secondary", "text-secondary-foreground", "shadow-none");
    expect(compareButton).toHaveClass("bg-transparent", "border-transparent", "shadow-none");

    await user.click(compareButton);

    expect(singleButton).toHaveClass("bg-transparent", "border-transparent", "shadow-none");
    expect(compareButton).toHaveClass("bg-secondary", "text-secondary-foreground", "shadow-none");
  });
});

describe("UploadDropzone", () => {
  it("renders a flatter upload block without a nested dashed panel", () => {
    const { container } = render(
      <UploadDropzone
        label="Primary clip"
        description="Upload one clip."
        file={null}
        onFileChange={vi.fn()}
      />,
    );

    expect(container.querySelector('[class*="border-dashed"]')).toBeNull();
  });

  it("renders browse files as a quiet inline action instead of a raised button", () => {
    render(
      <UploadDropzone
        label="Primary clip"
        description="Upload one clip."
        file={null}
        onFileChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Browse files/i })).toHaveClass(
      "h-auto",
      "border-transparent",
      "bg-transparent",
      "px-0",
      "py-0",
      "shadow-none",
    );
  });

  it("opens the file picker from the browse button", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <UploadDropzone
        label="Primary clip"
        description="Upload one clip."
        file={null}
        onFileChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Browse files/i }));

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("accepts a dropped file", () => {
    const onFileChange = vi.fn();
    render(
      <UploadDropzone
        label="Primary clip"
        description="Upload one clip."
        file={null}
        onFileChange={onFileChange}
      />,
    );

    const file = new File(["video"], "drop.mp4", { type: "video/mp4" });
    fireEvent.drop(screen.getByRole("button", { name: /Primary clip/i }), {
      dataTransfer: {
        files: [file],
        types: ["Files"],
      },
    });

    expect(onFileChange).toHaveBeenCalledWith(file);
  });
});

it("removes extra decorative accents from the upload workspace", async () => {
  const onSingleReady = vi.fn();
  const onCompareReady = vi.fn();
  const { container } = render(
    <UploadWorkbench
      onSingleReady={onSingleReady}
      onCompareReady={onCompareReady}
    />,
  );

  await screen.findByText(/Drop a clip/i);

  expect(container.querySelector('[class*="absolute right-6 top-6"]')).toBeNull();
  expect(container.querySelector('[class*="absolute bottom-6 right-12"]')).toBeNull();
});
