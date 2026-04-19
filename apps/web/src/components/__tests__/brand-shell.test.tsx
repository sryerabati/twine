import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrandShell } from "@/components/brand-shell";

let authState: "authenticated" | "unauthenticated" = "unauthenticated";
const previousConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

vi.mock("convex/react", () => ({
  AuthLoading: () => null,
  Authenticated: ({ children }: { children: ReactNode }) =>
    authState === "authenticated" ? <>{children}</> : null,
  Unauthenticated: ({ children }: { children: ReactNode }) =>
    authState === "unauthenticated" ? <>{children}</> : null,
}));

describe("BrandShell", () => {
  beforeEach(() => {
    authState = "unauthenticated";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_CONVEX_URL = previousConvexUrl;
  });

  it("renders a single primary login CTA for signed-out visitors", () => {
    render(
      <BrandShell>
        <div>home</div>
      </BrandShell>,
    );

    expect(screen.getByRole("link", { name: /^Twine$/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Log in/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open dashboard/i })).not.toBeInTheDocument();
  });

  it("renders an open dashboard CTA for authenticated visitors", () => {
    authState = "authenticated";

    render(
      <BrandShell>
        <div>home</div>
      </BrandShell>,
    );

    expect(screen.getByRole("link", { name: /Open dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Log in/i })).not.toBeInTheDocument();
  });
});
