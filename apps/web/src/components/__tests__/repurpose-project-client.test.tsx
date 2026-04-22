import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepurposeProjectClient } from "@/components/repurpose-project-client";

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const updateTitleMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("@/lib/api", () => ({
  uploadVideo: vi.fn(),
  generateRepurposeResult: vi.fn(),
  fetchLatestRepurposeResult: vi.fn(),
}));

describe("RepurposeProjectClient", () => {
  beforeEach(async () => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    updateTitleMock.mockReset();
    updateTitleMock.mockResolvedValue(undefined);
    useMutationMock.mockImplementation((name: string) => {
      if (name === "repurposeProjects:updateTitle") {
        return updateTitleMock;
      }
      return vi.fn();
    });

    const api = await import("@/lib/api");
    vi.mocked(api.fetchLatestRepurposeResult).mockReset();
    vi.mocked(api.generateRepurposeResult).mockReset();
    vi.mocked(api.uploadVideo).mockReset();
  });

  it("keeps generation disabled until the project has a source upload", () => {
    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Repurpose draft",
      status: "drafting",
      sourceUploadId: null,
      sourceFilename: null,
      sourceDurationSec: null,
      latestLocalResultId: null,
      variantCount: 0,
      summary: null,
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2,
      variants: [],
    });
    render(<RepurposeProjectClient projectId="project-1" />);

    expect(screen.getByRole("button", { name: /Generate variants/i })).toBeDisabled();
    expect(
      screen.getByText(/Upload a source video before generating variants/i),
    ).toBeInTheDocument();
  });

  it("renders the completed repurpose result with a variable number of variants", async () => {
    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Repurpose draft",
      status: "completed",
      sourceUploadId: "upload-1",
      sourceFilename: "source.mp4",
      sourceDurationSec: 48,
      latestLocalResultId: "result-1",
      variantCount: 2,
      summary: "Built up to three alternate cuts from the source.",
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2,
      variants: [],
    });
    const api = await import("@/lib/api");
    vi.mocked(api.fetchLatestRepurposeResult).mockResolvedValue({
      resultId: "result-1",
      projectId: "project-1",
      status: "completed",
      stage: "completed",
      progressPercent: 100,
      statusMessage: "Repurpose variants ready to review.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      payload: {
        source: {
          sourceUploadId: "upload-1",
          filename: "source.mp4",
          durationSec: 48,
          summary: "Source summary",
          speechCoverage: 0.82,
        },
        summary: "Built up to three alternate cuts from the source.",
        warnings: [],
        variants: [
          {
            variantId: "variant-1",
            title: "Full story",
            angleSummary: "Keeps the broader source arc.",
            rationale: "Best for preserving the whole pitch.",
            durationTarget: "source",
            durationSec: 41,
            videoUrl: "/storage/repurpose-results/result-1/variant-1.mp4",
            segmentCount: 4,
            segments: [],
          },
          {
            variantId: "variant-2",
            title: "Fast hook",
            angleSummary: "Starts faster.",
            rationale: "Best for a shorter hook-led upload.",
            durationTarget: "short",
            durationSec: 20,
            videoUrl: "/storage/repurpose-results/result-1/variant-2.mp4",
            segmentCount: 2,
            segments: [],
          },
        ],
      },
    });

    render(<RepurposeProjectClient projectId="project-1" />);

    await waitFor(() => {
      expect(api.fetchLatestRepurposeResult).toHaveBeenCalledWith("project-1");
    });
    expect(screen.getByText(/Full story/i)).toBeInTheDocument();
    expect(screen.getByText(/Fast hook/i)).toBeInTheDocument();
    expect(screen.queryByText(/Proof first/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open export Full story/i })).toHaveAttribute(
      "href",
      "/storage/repurpose-results/result-1/variant-1.mp4",
    );
  });

  it("renames a repurpose project inline from the project page", async () => {
    const user = userEvent.setup();

    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Untitled repurpose project",
      status: "drafting",
      sourceUploadId: null,
      sourceFilename: null,
      sourceDurationSec: null,
      latestLocalResultId: null,
      variantCount: 0,
      summary: null,
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2,
      variants: [],
    });

    render(<RepurposeProjectClient projectId="project-1" />);

    const titleInput = screen.getByLabelText(/project title/i);
    await user.clear(titleInput);
    await user.type(titleInput, "UGC repurpose v1");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateTitleMock).toHaveBeenCalledWith({
        projectId: "project-1",
        title: "UGC repurpose v1",
      });
    });
  });
});
