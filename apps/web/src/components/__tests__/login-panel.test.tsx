import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPanel } from "@/components/auth/login-panel";

const signIn = vi.fn();

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn,
    signOut: vi.fn(),
  }),
}));

describe("LoginPanel", () => {
  beforeEach(() => {
    signIn.mockReset();
    signIn.mockResolvedValue({ signingIn: true });
  });

  it("shows a short invalid-credentials message instead of the raw auth error", async () => {
    const user = userEvent.setup();
    signIn.mockRejectedValueOnce(new Error("Invalid credentials"));

    render(<LoginPanel />);

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /enter workspace/i }));

    await waitFor(() => {
      expect(screen.getByText(/password or email was wrong/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
  });
});
