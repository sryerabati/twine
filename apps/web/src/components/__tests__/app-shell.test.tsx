import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
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

    const dashboardLink = screen.getByRole("link", { name: /Dashboard/i });
    const libraryLink = screen.getByRole("link", { name: /Library/i });

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
  });
});
