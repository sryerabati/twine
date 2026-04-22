import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

describe("tabs", () => {
  it("renders the line variant as a flat segmented control instead of a stamped pill bar", () => {
    render(
      <Tabs defaultValue="threads">
        <TabsList variant="line">
          <TabsTrigger value="threads">Threads</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(screen.getByRole("tablist")).toHaveClass("shadow-none");
    expect(screen.getByRole("tablist")).not.toHaveClass(
      "border-2",
      "shadow-[4px_4px_0_0_var(--color-primary)]",
    );

    expect(screen.getByRole("tab", { name: "Threads" })).not.toHaveClass(
      "data-active:bg-primary",
      "data-active:shadow-[3px_3px_0_0_var(--color-primary)]",
    );
  });
});
