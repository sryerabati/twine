import { describe, expect, it } from "vitest";

import {
  getScanHref,
  getScanTitle,
  isCompareScan,
} from "@/lib/scan-presenter";

describe("scan-presenter", () => {
  it("routes compare scans to the dedicated compare page", () => {
    expect(
      getScanHref({
        _id: "scan_compare_1",
        scanType: "compare",
      } as never),
    ).toBe("/app/compare/scan_compare_1");
  });

  it("treats legacy rows as single scans", () => {
    expect(
      getScanTitle({
        title: null,
        filename: "clip.mp4",
      } as never),
    ).toBe("clip.mp4");

    expect(isCompareScan({ scanType: undefined } as never)).toBe(false);
  });
});
