import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getConvexClient = vi.fn();
const reactProviderSpy = vi.fn();
const nextjsProviderSpy = vi.fn();

vi.mock("@/lib/convex", () => ({
  getConvexClient,
}));

vi.mock("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: ({ children }: { children: ReactNode }) => {
    reactProviderSpy();
    return <div data-testid="react-auth-provider">{children}</div>;
  },
}));

vi.mock("@convex-dev/auth/nextjs", () => ({
  ConvexAuthNextjsProvider: ({ children }: { children: ReactNode }) => {
    nextjsProviderSpy();
    return <div data-testid="nextjs-auth-provider">{children}</div>;
  },
}));

describe("ConvexClientProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps the app with the React auth provider when Convex is configured", async () => {
    getConvexClient.mockReturnValue({
      action: vi.fn(),
      address: "https://example.convex.cloud",
      logger: undefined,
    });

    const { ConvexClientProvider } = await import("@/app/ConvexClientProvider");

    render(
      <ConvexClientProvider>
        <div>private area</div>
      </ConvexClientProvider>,
    );

    expect(screen.getByTestId("react-auth-provider")).toBeInTheDocument();
    expect(screen.queryByTestId("nextjs-auth-provider")).not.toBeInTheDocument();
    expect(screen.getByText("private area")).toBeInTheDocument();
    expect(reactProviderSpy).toHaveBeenCalledTimes(1);
  });

  it("renders children directly when Convex is not configured", async () => {
    getConvexClient.mockReturnValue(null);

    const { ConvexClientProvider } = await import("@/app/ConvexClientProvider");

    render(
      <ConvexClientProvider>
        <div>public area</div>
      </ConvexClientProvider>,
    );

    expect(screen.getByText("public area")).toBeInTheDocument();
    expect(screen.queryByTestId("react-auth-provider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nextjs-auth-provider")).not.toBeInTheDocument();
  });
});
