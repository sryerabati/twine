import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  IBM_Plex_Mono: () => ({ variable: "--font-ibm-plex-mono" }),
  Manrope: () => ({ variable: "--font-manrope" }),
  Sora: () => ({ variable: "--font-heading-display" }),
}));

describe("app metadata", () => {
  it("points the site icon at the white-background Twine mark", async () => {
    const { metadata } = await import("@/app/layout");

    expect(metadata.icons).toMatchObject({
      apple: "/branding/twine-leaf-play-icon.png",
      shortcut: "/branding/twine-leaf-play-icon.png",
    });
  });
});
