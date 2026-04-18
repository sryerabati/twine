import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthGate } from "@/components/auth/auth-gate";

let authState: "loading" | "authenticated" | "unauthenticated" = "unauthenticated";

vi.mock("convex/react", () => ({
  Authenticated: ({ children }: { children: ReactNode }) =>
    authState === "authenticated" ? <>{children}</> : null,
  Unauthenticated: ({ children }: { children: ReactNode }) =>
    authState === "unauthenticated" ? <>{children}</> : null,
  AuthLoading: ({ children }: { children: ReactNode }) =>
    authState === "loading" ? <>{children}</> : null,
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe("AuthGate", () => {
  it("renders setup guidance when the Convex URL is missing", () => {
    const previous = process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    render(
      <AuthGate>
        <div>private area</div>
      </AuthGate>,
    );
    expect(screen.getByText(/Connect Convex to unlock auth/i)).toBeInTheDocument();
    process.env.NEXT_PUBLIC_CONVEX_URL = previous;
  });

  it("renders the login panel when the user is signed out", () => {
    authState = "unauthenticated";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    render(
      <AuthGate>
        <div>private area</div>
      </AuthGate>,
    );
    expect(screen.getByText(/Sign in to Cortent/i)).toBeInTheDocument();
    expect(screen.queryByText(/private area/i)).not.toBeInTheDocument();
  });

  it("renders children when the user is authenticated", () => {
    authState = "authenticated";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    render(
      <AuthGate>
        <div>private area</div>
      </AuthGate>,
    );
    expect(screen.getByText(/private area/i)).toBeInTheDocument();
  });
});
