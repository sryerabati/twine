import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingClient } from "@/components/landing-client";

let authState: "authenticated" | "unauthenticated" = "unauthenticated";
const previousConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const scrollIntoView = vi.fn();
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

vi.mock("convex/react", () => ({
  AuthLoading: () => null,
  Authenticated: ({ children }: { children: ReactNode }) =>
    authState === "authenticated" ? <>{children}</> : null,
  Unauthenticated: ({ children }: { children: ReactNode }) =>
    authState === "unauthenticated" ? <>{children}</> : null,
}));

describe("LandingClient", () => {
  beforeEach(() => {
    authState = "unauthenticated";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = previousConvexUrl;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  });

  it("renders a login CTA for signed-out visitors", () => {
    render(<LandingClient />);

    expect(screen.getByText(/Read the room before you post\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/Drop in one video, make two compete, or turn raw clips into a rough cut with the AI editor\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Two lanes\. One stronger post\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Scan the cut before it goes live\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Build the first pass while the footage is still fresh\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Hook pressure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Transcript-led rough cut/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Cut deadspace, find the story, and hand over a usable first pass/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Pick the hook, pace, and framing that actually deserves to ship/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Rough cut engine/i).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("brain-viewport")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /Log in/i })).toHaveLength(2);
    expect(screen.getByRole("link", { name: /See the workflow/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cortent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Product preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Know what hits before you ship\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vibe radar/i)).not.toBeInTheDocument();
  });

  it("renders an open dashboard CTA for authenticated visitors", () => {
    authState = "authenticated";

    render(<LandingClient />);

    expect(screen.getAllByRole("link", { name: /Open dashboard/i })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Log in/i })).not.toBeInTheDocument();
  });

  it("smoothly scrolls to the workflow section on repeated clicks", () => {
    render(<LandingClient />);

    const workflowLink = screen.getByRole("link", { name: /See the workflow/i });

    fireEvent.click(workflowLink);
    fireEvent.click(workflowLink);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenNthCalledWith(1, { behavior: "smooth", block: "start" });
    expect(scrollIntoView).toHaveBeenNthCalledWith(2, { behavior: "smooth", block: "start" });
  });
});
