import { describe, expect, it } from "vitest";

import {
  assertCompareScanReadyToFinalize,
  assertCompareScanTarget,
} from "../../../../../convex/scans";

describe("compare scan invariants", () => {
  it("rejects non-compare scans when attaching compare analyses", () => {
    expect(() =>
      assertCompareScanTarget({
        scanType: "single",
        secondaryUploadId: "upload_2",
      } as never),
    ).toThrow("compare scan");
  });

  it("rejects compare scans without a secondary upload", () => {
    expect(() =>
      assertCompareScanTarget({
        scanType: "compare",
        secondaryUploadId: undefined,
      } as never),
    ).toThrow("secondary upload");
  });

  it("rejects compare scans that are missing analysis ids before finalization", () => {
    expect(() =>
      assertCompareScanReadyToFinalize({
        scanType: "compare",
        secondaryUploadId: "upload_2",
        localAnalysisId: "analysis_a",
        secondaryLocalAnalysisId: undefined,
      } as never),
    ).toThrow("analysis IDs");
  });
});
