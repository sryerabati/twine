import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("does not show a stale project error once a completed draft payload is available", async () => {
    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Draft one",
      status: "completed",
      clipCount: 2,
      latestLocalDraftId: "draft-1",
      latestExportUrl: "/storage/editor-drafts/draft-1/draft.mp4",
      storylineSummary: "Problem to CTA",
      orderingConfidence: "high",
      warningCount: 0,
      errorMessage:
        "Content analysis backend rate limit reached (HTTP 429). The app will retry automatically.",
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
        warnings: [],
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
    expect(
      screen.queryByText(/Content analysis backend rate limit reached \(HTTP 429\)/i),
    ).not.toBeInTheDocument();
  });

  it("opens untitled projects in inline rename mode and saves the new name", async () => {
    const updateTitleMock = vi.fn().mockResolvedValue(undefined);
    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Untitled AI editor project",
      status: "drafting",
      clipCount: 0,
      latestLocalDraftId: null,
      latestExportUrl: null,
      storylineSummary: null,
      orderingConfidence: null,
      warningCount: 0,
      errorMessage: null,
      createdAt: 1,
      updatedAt: 2,
      clips: [],
    });
    useMutationMock.mockImplementation((name: string) => {
      if (name === "editorProjects:updateTitle") {
        return updateTitleMock;
      }
      return vi.fn();
    });

    const user = userEvent.setup();
    render(<EditorProjectClient projectId="project-1" />);

    const titleInput = screen.getByRole("textbox", { name: /Project title/i });
    expect(titleInput).toHaveValue("Untitled AI editor project");
    expect(screen.getByText(/Give this draft a real name/i)).toBeInTheDocument();

    await user.clear(titleInput);
    await user.type(titleInput, "UGC draft v1");
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateTitleMock).toHaveBeenCalledWith({
        projectId: "project-1",
        title: "UGC draft v1",
      });
    });
  });

  it("scrolls to the draft review when generation starts", async () => {
    useQueryMock.mockReturnValue({
      _id: "project-1",
      title: "Draft one",
      status: "drafting",
      clipCount: 2,
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

    const queueGenerationMock = vi.fn().mockResolvedValue({
      projectId: "project-1",
      clips: [
        {
          clipId: "clip-row-1",
          uploadId: "upload-1",
          localUploadId: "local-upload-1",
          filename: "intro.mp4",
        },
        {
          clipId: "clip-row-2",
          uploadId: "upload-2",
          localUploadId: "local-upload-2",
          filename: "cta.mp4",
        },
      ],
    });
    useMutationMock.mockImplementation((name: string) => {
      if (name === "editorProjects:queueGeneration") {
        return queueGenerationMock;
      }
      return vi.fn();
    });

    const api = await import("@/lib/api");
    vi.mocked(api.generateEditorDraft).mockResolvedValue({
      draftId: "draft-1",
      projectId: "project-1",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      progressPercent: 5,
      stage: "queued",
      statusMessage: "Queued for generation.",
      payload: null,
    });
    vi.mocked(api.fetchLatestEditorDraft).mockResolvedValue({
      draftId: "draft-1",
      projectId: "project-1",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      progressPercent: 5,
      stage: "queued",
      statusMessage: "Queued for generation.",
      payload: null,
    });

    const scrollToMock = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const header = document.createElement("header");
    const main = document.createElement("main");
    header.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1440,
      bottom: 88,
      width: 1440,
      height: 88,
      toJSON: () => ({}),
    }));
    main.style.paddingTop = "32px";
    document.body.append(header, main);
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 140,
    });

    try {
      const user = userEvent.setup();
      render(<EditorProjectClient projectId="project-1" />, { container: main });
      const draftReviewSection = screen
        .getByRole("heading", { name: /Latest generated edit/i })
        .closest("section");

      expect(draftReviewSection).not.toBeNull();
      draftReviewSection!.getBoundingClientRect = vi.fn(() => ({
        x: 0,
        y: 620,
        top: 620,
        left: 0,
        right: 1280,
        bottom: 1120,
        width: 1280,
        height: 500,
        toJSON: () => ({}),
      }));

      await user.click(screen.getByRole("button", { name: /Generate rough cut/i }));

      await waitFor(() => {
        expect(screen.getByText(/Queued for generation\./i)).toBeInTheDocument();
        expect(scrollToMock).toHaveBeenCalledWith({
          top: 640,
          behavior: "smooth",
        });
      });
    } finally {
      scrollToMock.mockRestore();
      main.remove();
      header.remove();
    }
  });
});
