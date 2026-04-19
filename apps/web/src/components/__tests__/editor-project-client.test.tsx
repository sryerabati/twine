import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorProjectClient } from "@/components/editor-project-client";

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("@/lib/api", () => ({
  uploadVideo: vi.fn(),
  generateEditorDraft: vi.fn(),
  fetchLatestEditorDraft: vi.fn(),
}));

describe("EditorProjectClient", () => {
  beforeEach(async () => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();

    const api = await import("@/lib/api");
    vi.mocked(api.fetchLatestEditorDraft).mockReset();
    vi.mocked(api.generateEditorDraft).mockReset();
    vi.mocked(api.uploadVideo).mockReset();
  });

  it("keeps generation disabled until the project has at least two clips", () => {
    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Draft one",
      status: "drafting",
      clipCount: 1,
      latestLocalDraftId: null,
      latestExportUrl: null,
      storylineSummary: null,
      orderingConfidence: null,
      warningCount: 0,
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2,
      clips: [
        {
          _id: "clip-row-1",
          uploadId: "upload-1",
          localUploadId: "local-upload-1",
          filename: "intro.mp4",
          durationSec: 12,
          sourceOrder: 0,
          createdAt: 1,
        },
      ],
    });
    useMutationMock.mockReturnValue(vi.fn());

    render(<EditorProjectClient projectId="project-1" />);

    expect(screen.getByRole("button", { name: /Generate rough cut/i })).toBeDisabled();
    expect(screen.getByText(/Add at least two clips/i)).toBeInTheDocument();
  });

  it("renders the completed draft review when the latest payload is available", async () => {
    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Draft one",
      status: "completed",
      clipCount: 2,
      latestLocalDraftId: "draft-1",
      latestExportUrl: "/storage/editor-drafts/draft-1/draft.mp4",
      storylineSummary: "Problem to CTA",
      orderingConfidence: "high",
      warningCount: 1,
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2,
      clips: [
        {
          _id: "clip-row-1",
          uploadId: "upload-1",
          localUploadId: "local-upload-1",
          filename: "intro.mp4",
          durationSec: 12,
          sourceOrder: 0,
          createdAt: 1,
        },
        {
          _id: "clip-row-2",
          uploadId: "upload-2",
          localUploadId: "local-upload-2",
          filename: "cta.mp4",
          durationSec: 9,
          sourceOrder: 1,
          createdAt: 2,
        },
      ],
    });
    useMutationMock.mockReturnValue(vi.fn());

    const api = await import("@/lib/api");
    vi.mocked(api.fetchLatestEditorDraft).mockResolvedValue({
      draftId: "draft-1",
      projectId: "project-1",
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      payload: {
        export: {
          videoUrl: "/storage/editor-drafts/draft-1/draft.mp4",
          durationSec: 18,
        },
        storylineSummary: "Lead with the problem, then land the CTA.",
        orderingConfidence: "high",
        warnings: ["One clip had limited speech context."],
        orderedClips: [
          {
            clipId: "clip-row-1",
            uploadId: "upload-1",
            filename: "intro.mp4",
            sourceOrder: 0,
            resolvedOrder: 1,
            rationale: "Strong opener.",
            transcriptPreview: "Here is the hook.",
            summary: "Intro",
            speechCoverage: 0.8,
            removedSeconds: 1.2,
            trimmedDurationSec: 10.8,
            outputStartSec: 0,
            outputEndSec: 10.8,
            warnings: [],
            appliedCuts: [],
          },
        ],
      },
    });

    render(<EditorProjectClient projectId="project-1" />);

    await waitFor(() => {
      expect(api.fetchLatestEditorDraft).toHaveBeenCalledWith("project-1");
    });
    expect(screen.getByText(/Lead with the problem/i)).toBeInTheDocument();
    expect(screen.getByText(/Strong opener/i)).toBeInTheDocument();
    expect(screen.getByText(/limited speech context/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open export/i })).toHaveAttribute(
      "href",
      "/storage/editor-drafts/draft-1/draft.mp4",
    );
  });
});
