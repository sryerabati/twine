import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

describe("cartoon visual primitives", () => {
  it("renders the primary button with chunky border, full rounding, and offset shadow", () => {
    render(<Button>Open dashboard</Button>);

    expect(screen.getByRole("button", { name: /Open dashboard/i })).toHaveClass(
      "rounded-full",
      "border-2",
      "shadow-[4px_4px_0_0_var(--color-primary)]",
    );
  });

  it("renders outline buttons as flat secondary controls", () => {
    render(<Button variant="outline">Browse files</Button>);

    expect(screen.getByRole("button", { name: /Browse files/i })).toHaveClass(
      "rounded-full",
      "border-2",
      "shadow-none",
    );
    expect(screen.getByRole("button", { name: /Browse files/i })).not.toHaveClass(
      "shadow-[4px_4px_0_0_var(--color-primary)]",
      "active:not-aria-[haspopup]:translate-x-[2px]",
    );
  });

  it("renders badges as sticker-like pills", () => {
    render(<Badge>Saved scan</Badge>);

    expect(screen.getByText(/Saved scan/i)).toHaveClass(
      "rounded-full",
      "border-2",
      "shadow-[2px_2px_0_0_var(--color-primary)]",
    );
  });
});
