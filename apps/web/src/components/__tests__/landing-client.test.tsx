import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingClient } from "@/components/landing-client";

describe("LandingClient", () => {
  it("renders the VibeCheck poster hero and direct dashboard CTA", () => {
    render(<LandingClient />);

    expect(screen.getByText(/^VibeCheck$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cortent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View scan library/i)).not.toBeInTheDocument();
  });
});
