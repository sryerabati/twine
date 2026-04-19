import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { push } from "next/navigation";

import { EditorHome } from "@/components/editor-home";

const useQueryMock = vi.fn();
const createProject = vi.fn();
const updateTitle = vi.fn();
const deleteProject = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: vi.fn((name: string) => {
    if (name === "editorProjects:create") {
      return createProject;
    }
    if (name === "editorProjects:updateTitle") {
      return updateTitle;
    }
    if (name === "editorProjects:deleteProject") {
      return deleteProject;
    }
    return vi.fn();
  }),
}));

describe("EditorHome", () => {
  beforeEach(() => {
    push.mockReset();
    useQueryMock.mockReset();
    createProject.mockReset();
    updateTitle.mockReset();
    deleteProject.mockReset();
    createProject.mockResolvedValue("project-123");
    updateTitle.mockResolvedValue(undefined);
    deleteProject.mockResolvedValue(undefined);
    useQueryMock.mockReturnValue([
      {
        _id: "project-1",
        title: "UGC rough cut",
        status: "completed",
        clipCount: 3,
        latestLocalDraftId: "draft-1",
        latestExportUrl: "/storage/editor-drafts/draft-1/draft.mp4",
        storylineSummary: "Problem, proof, CTA",
        orderingConfidence: "high",
        warningCount: 0,
        errorMessage: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
  });

  it("creates a project and routes into the editor workspace", async () => {
    const user = userEvent.setup();

    render(<EditorHome />);

    expect(screen.getByText(/AI Editor/i)).toBeInTheDocument();
    expect(screen.getByText(/UGC rough cut/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /New project/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/app/editor/project-123");
    });
  });

  it("renames a project inline from the dashboard", async () => {
    const user = userEvent.setup();

    render(<EditorHome />);

    await user.click(screen.getByRole("button", { name: /rename ugc rough cut/i }));
    const input = screen.getByDisplayValue("UGC rough cut");
    await user.clear(input);
    await user.type(input, "UGC first draft");
    await user.click(screen.getByRole("button", { name: /save title/i }));

    await waitFor(() => {
      expect(updateTitle).toHaveBeenCalledWith({
        projectId: "project-1",
        title: "UGC first draft",
      });
    });
  });

  it("opens a delete modal and deletes a project after confirmation", async () => {
    const user = userEvent.setup();

    render(<EditorHome />);

    await user.click(screen.getByRole("button", { name: /delete ugc rough cut/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/this removes the project from your ai editor dashboard/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete project/i }));

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith({
        projectId: "project-1",
      });
    });
  });

  it("closes the delete modal without deleting when cancelled", async () => {
    const user = userEvent.setup();

    render(<EditorHome />);

    await user.click(screen.getByRole("button", { name: /delete ugc rough cut/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(deleteProject).not.toHaveBeenCalled();
  });
});
