import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingClient } from "@/components/landing-client";

describe("LandingClient", () => {
  it("renders the flat VibeCheck poster hero without the SaaS preview card", () => {
    render(<LandingClient />);

    expect(screen.getByText(/^VibeCheck$/i)).toBeInTheDocument();
    expect(screen.getByText(/Read the room before you post\./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/Cortent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Product preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Know what hits before you ship\./i)).not.toBeInTheDocument();
  });
});
