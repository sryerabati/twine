import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPathname } from "next/navigation";

import { AppShell } from "@/components/app-shell";

const signOut = vi.fn();
const useQueryMock = vi.fn();

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signOut,
  }),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

describe("AppShell", () => {
  beforeEach(() => {
    setPathname("/app");
    signOut.mockReset();
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({
      email: "shreyas@example.com",
      name: "Shreyas",
    });
  });

  it("renders nav pills with a physical hover press and a latched pressed current page", () => {
    render(
      <AppShell>
        <div>Workspace content</div>
      </AppShell>,
    );

    const brandLink = screen.getByRole("link", { name: /^Twine$/i });

    expect(brandLink).toHaveAttribute("href", "/");
    expect(brandLink.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("twine-mark.png"),
    );
    expect(brandLink.querySelector("img")).toHaveClass("translate-x-[4%]");
    expect(brandLink).toHaveClass("gap-4");
    expect(brandLink.querySelector("img")?.parentElement).toHaveClass(
      "size-13",
      "rounded-[1.55rem]",
      "bg-white",
    );
    expect(within(brandLink).getByText(/^Twine$/i)).toHaveClass("text-[1.9rem]");
    expect(screen.queryByText(/Command deck for saved scans/i)).not.toBeInTheDocument();

    const dashboardLink = screen.getByRole("link", { name: /Dashboard/i });
    const libraryLink = screen.getByRole("link", { name: /Library/i });
    const editorLink = screen.getByRole("link", { name: /AI Editor/i });

    expect(dashboardLink).toHaveClass(
      "bg-secondary",
      "text-secondary-foreground",
      "translate-x-[3px]",
      "translate-y-[3px]",
      "shadow-[2px_2px_0_0_var(--color-border)]",
      "hover:bg-secondary",
      "hover:translate-x-[3px]",
      "hover:translate-y-[3px]",
    );
    expect(libraryLink).toHaveClass(
      "border-[#19241d]",
      "bg-card",
      "shadow-[5px_5px_0_0_var(--color-border)]",
      "hover:bg-primary",
      "hover:text-primary-foreground",
      "hover:translate-x-[2px]",
      "hover:translate-y-[2px]",
      "hover:shadow-[3px_3px_0_0_var(--color-border)]",
      "active:bg-secondary",
      "active:not-aria-[haspopup]:translate-x-[3px]",
      "active:not-aria-[haspopup]:translate-y-[3px]",
      "active:shadow-[2px_2px_0_0_var(--color-border)]",
    );
    expect(editorLink).toHaveAttribute("href", "/app/editor");
  });

  it("renders a header skeleton while the workspace identity is loading", () => {
    useQueryMock.mockReturnValue(undefined);
    const { container } = render(
      <AppShell>
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1);
  });
});
