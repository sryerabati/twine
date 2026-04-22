import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { push } from "next/navigation";

import { RepurposeHome } from "@/components/repurpose-home";

const useQueryMock = vi.fn();
const createProject = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: vi.fn((name: string) => {
    if (name === "repurposeProjects:create") {
      return createProject;
    }
    return vi.fn();
  }),
}));

describe("RepurposeHome", () => {
  beforeEach(() => {
    push.mockReset();
    useQueryMock.mockReset();
    createProject.mockReset();
    createProject.mockResolvedValue("repurpose-123");
    useQueryMock.mockReturnValue([
      {
        _id: "project-1",
        title: "UGC repurpose",
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
      },
    ]);
  });

  it("creates a repurpose project and routes into the workspace", async () => {
    const user = userEvent.setup();

    render(<RepurposeHome />);

    expect(
      screen.getByRole("heading", { name: /Turn one source video into up to three alternate cuts/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/UGC repurpose/i)).toBeInTheDocument();
    expect(screen.getByText(/2 variants/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /New project/i }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/app/repurpose/repurpose-123");
    });
  });
});
