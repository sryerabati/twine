import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingClient } from "@/components/landing-client";

let authState: "authenticated" | "unauthenticated" = "unauthenticated";
const previousConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

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
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = previousConvexUrl;
  });

  it("renders a login CTA for signed-out visitors", () => {
    render(<LandingClient />);

    expect(screen.getByText(/Read the room before you post\./i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /A decision and editing tool for short-form video\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Built for people shipping content on a schedule\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/turn raw clips into a rough cut with the AI editor/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Build a rough cut/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /UGC creators/i })).toBeInTheDocument();
    expect(screen.getByTestId("brain-viewport")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start with Twine/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cortent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Product preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Know what hits before you ship\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vibe radar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Creative signal/i)).not.toBeInTheDocument();
  });

  it("renders an open dashboard CTA for authenticated visitors", () => {
    authState = "authenticated";

    render(<LandingClient />);

    expect(screen.getAllByRole("link", { name: /Open dashboard/i })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Log in/i })).not.toBeInTheDocument();
  });
});
