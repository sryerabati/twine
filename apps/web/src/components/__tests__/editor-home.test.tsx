import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { push } from "next/navigation";

import { EditorHome } from "@/components/editor-home";

const useQueryMock = vi.fn();
const createProject = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: vi.fn((name: string) => {
    if (name === "editorProjects:create") {
      return createProject;
    }
    return vi.fn();
  }),
}));

describe("EditorHome", () => {
  beforeEach(() => {
    push.mockReset();
    useQueryMock.mockReset();
    createProject.mockReset();
    createProject.mockResolvedValue("project-123");
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
});
