import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convexServer = vi.hoisted(() => ({
  mutation: vi.fn((definition) => definition),
  query: vi.fn((definition) => definition),
}));

const auth = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
}));

vi.mock("../../../../../convex/_generated/server", () => convexServer);
vi.mock("@convex-dev/auth/server", () => auth);

let scansModule: typeof import("../../../../../convex/scans");

function makeMutationCtx(db: {
  get: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
}) {
  return { db } as never;
}

describe("compare scan handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    auth.getAuthUserId.mockResolvedValue("user_1");
    scansModule ??= await import("../../../../../convex/scans");
  });

  it("trims compare titles on write and omits blank titles from the stored row", async () => {
    const get = vi.fn(async (id: string) => {
      if (id === "upload_1") {
        return { _id: "upload_1", userId: "user_1" };
      }
      if (id === "upload_2") {
        return { _id: "upload_2", userId: "user_1" };
      }
      return null;
    });
    const insert = vi.fn().mockResolvedValue("scan_1");
    const patch = vi.fn();
    const query = vi.fn();
    const ctx = makeMutationCtx({ get, insert, patch, query });

    await scansModule.createPendingCompareScan.handler(ctx, {
      primaryUploadId: "upload_1",
      secondaryUploadId: "upload_2",
      title: "  Compare A  ",
    });

    expect(insert).toHaveBeenCalledWith(
      "scans",
      expect.objectContaining({
        userId: "user_1",
        uploadId: "upload_1",
        secondaryUploadId: "upload_2",
        scanType: "compare",
        status: "queued",
        displayName: "Compare A",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }),
    );

    await scansModule.createPendingCompareScan.handler(ctx, {
      primaryUploadId: "upload_1",
      secondaryUploadId: "upload_2",
      title: "   ",
    });

    expect(insert).toHaveBeenLastCalledWith(
      "scans",
      expect.objectContaining({
        userId: "user_1",
        uploadId: "upload_1",
        secondaryUploadId: "upload_2",
        scanType: "compare",
        status: "queued",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }),
    );
    expect(insert.mock.calls[1][1]).not.toHaveProperty("displayName");
  });

  it("rejects non-compare rows when attaching compare analyses", async () => {
    const get = vi.fn().mockResolvedValue({
      _id: "scan_1",
      userId: "user_1",
      scanType: "single",
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const query = vi.fn();
    const ctx = makeMutationCtx({ get, insert, patch, query });

    await expect(
      scansModule.attachCompareAnalysisIds.handler(ctx, {
        scanId: "scan_1",
        analysisIdA: "analysis_a",
        analysisIdB: "analysis_b",
      }),
    ).rejects.toThrow("compare scan");
  });

  it("patches compare analysis ids on a valid compare scan", async () => {
    const get = vi.fn().mockResolvedValue({
      _id: "scan_2",
      userId: "user_1",
      scanType: "compare",
      secondaryUploadId: "upload_2",
      status: "queued",
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const query = vi.fn();
    const ctx = makeMutationCtx({ get, insert, patch, query });

    await expect(
      scansModule.attachCompareAnalysisIds.handler(ctx, {
        scanId: "scan_2",
        analysisIdA: "analysis_a",
        analysisIdB: "analysis_b",
      }),
    ).resolves.toBe("scan_2");

    expect(patch).toHaveBeenCalledWith("scan_2", {
      localAnalysisId: "analysis_a",
      secondaryLocalAnalysisId: "analysis_b",
      status: "running",
      updatedAt: 1700000000000,
    });
  });

  it("rejects compare scans that are missing analysis ids before finalization", async () => {
    const get = vi.fn().mockResolvedValue({
      _id: "scan_2",
      userId: "user_1",
      scanType: "compare",
      secondaryUploadId: "upload_2",
      localAnalysisId: "analysis_a",
      secondaryLocalAnalysisId: null,
      status: "running",
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const query = vi.fn();
    const ctx = makeMutationCtx({ get, insert, patch, query });

    await expect(
      scansModule.saveCompareResult.handler(ctx, {
        scanId: "scan_2",
        winner: "A",
        winnerReason: "Better hooks",
        recommendation: "Use A",
        summary: ["A"],
        slices: [
          {
            label: "Hooks",
            winner: "A",
            aScore: 10,
            bScore: 8,
          },
        ],
      }),
    ).rejects.toThrow("analysis IDs");
  });

  it("patches compare result fields on a valid completed compare scan", async () => {
    const get = vi.fn().mockResolvedValue({
      _id: "scan_3",
      userId: "user_1",
      scanType: "compare",
      secondaryUploadId: "upload_2",
      localAnalysisId: "analysis_a",
      secondaryLocalAnalysisId: "analysis_b",
      status: "running",
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const query = vi.fn();
    const ctx = makeMutationCtx({ get, insert, patch, query });

    await expect(
      scansModule.saveCompareResult.handler(ctx, {
        scanId: "scan_3",
        winner: "B",
        winnerReason: "Better pacing",
        recommendation: "Use B",
        summary: ["B"],
        slices: [
          {
            label: "Pacing",
            winner: "B",
            aScore: 7,
            bScore: 9,
          },
        ],
      }),
    ).resolves.toBe("scan_3");

    expect(patch).toHaveBeenCalledWith("scan_3", {
      status: "completed",
      compareResult: {
        winner: "B",
        winnerReason: "Better pacing",
        recommendation: "Use B",
        summary: ["B"],
        slices: [
          {
            label: "Pacing",
            winner: "B",
            aScore: 7,
            bScore: 9,
          },
        ],
      },
      overviewRecommendation: "Use B",
      updatedAt: 1700000000000,
    });
  });

  it("rejects compare analysis attachment on completed rows", async () => {
    const get = vi.fn().mockResolvedValue({
      _id: "scan_4",
      userId: "user_1",
      scanType: "compare",
      secondaryUploadId: "upload_2",
      status: "completed",
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const query = vi.fn();
    const ctx = makeMutationCtx({ get, insert, patch, query });

    await expect(
      scansModule.attachCompareAnalysisIds.handler(ctx, {
        scanId: "scan_4",
        analysisIdA: "analysis_a",
        analysisIdB: "analysis_b",
      }),
    ).rejects.toThrow("queued");
  });

  it("rejects compare result finalization on completed rows", async () => {
    const get = vi.fn().mockResolvedValue({
      _id: "scan_5",
      userId: "user_1",
      scanType: "compare",
      secondaryUploadId: "upload_2",
      localAnalysisId: "analysis_a",
      secondaryLocalAnalysisId: "analysis_b",
      status: "completed",
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const query = vi.fn();
    const ctx = makeMutationCtx({ get, insert, patch, query });

    await expect(
      scansModule.saveCompareResult.handler(ctx, {
        scanId: "scan_5",
        winner: "A",
        winnerReason: "Already done",
        recommendation: "Use A",
        summary: ["A"],
        slices: [
          {
            label: "Hooks",
            winner: "A",
            aScore: 9,
            bScore: 8,
          },
        ],
      }),
    ).rejects.toThrow("running");
  });

  it("keeps compare scans out of the recent scan list", async () => {
    const paginate = vi.fn().mockResolvedValue({
      page: [
        {
          _id: "scan_compare_1",
          userId: "user_1",
          uploadId: "upload_compare",
          scanType: "compare",
          secondaryUploadId: "upload_compare_2",
          status: "completed",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
        {
          _id: "scan_single_1",
          userId: "user_1",
          uploadId: "upload_single",
          scanType: "single",
          status: "completed",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ],
      continueCursor: null,
      isDone: true,
    });
    const order = vi.fn(() => ({ paginate }));
    const withIndex = vi.fn(() => ({ order }));
    const query = vi.fn(() => ({ withIndex }));
    const get = vi.fn(async (id: string) => {
      if (id === "upload_single") {
        return {
          _id: "upload_single",
          userId: "user_1",
          filename: "single.mp4",
          localUploadId: "local_single",
        };
      }
      return null;
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const ctx = { db: { get, insert, patch, query } } as never;

    const result = await scansModule.listRecentMine.handler(ctx, {});

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("scan_single_1");
    expect(result[0].filename).toBe("single.mp4");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps paging until enough single scans are collected", async () => {
    const pages = [
      {
        page: Array.from({ length: 20 }, (_, index) => ({
          _id: `scan_compare_page1_${index}`,
          userId: "user_1",
          uploadId: `upload_compare_page1_${index}`,
          scanType: "compare" as const,
          secondaryUploadId: `upload_compare_page1_${index}_b`,
          status: "completed" as const,
          createdAt: 1700000000000 - index,
          updatedAt: 1700000000000 - index,
        })),
        continueCursor: "cursor-2",
        isDone: false,
      },
      {
        page: [
          {
            _id: "scan_single_1",
            userId: "user_1",
            uploadId: "upload_single_1",
            scanType: "single" as const,
            status: "completed" as const,
            createdAt: 1699999999000,
            updatedAt: 1699999999000,
          },
          {
            _id: "scan_single_2",
            userId: "user_1",
            uploadId: "upload_single_2",
            scanType: "single" as const,
            status: "completed" as const,
            createdAt: 1699999998000,
            updatedAt: 1699999998000,
          },
        ],
        continueCursor: null,
        isDone: true,
      },
    ];
    const paginate = vi.fn().mockResolvedValueOnce(pages[0]).mockResolvedValueOnce(pages[1]);
    const order = vi.fn(() => ({ paginate }));
    const withIndex = vi.fn(() => ({ order }));
    const query = vi.fn(() => ({ withIndex }));
    const get = vi.fn(async (id: string) => {
      if (id === "upload_single_1") {
        return {
          _id: "upload_single_1",
          userId: "user_1",
          filename: "single-1.mp4",
          localUploadId: "local_single_1",
        };
      }
      if (id === "upload_single_2") {
        return {
          _id: "upload_single_2",
          userId: "user_1",
          filename: "single-2.mp4",
          localUploadId: "local_single_2",
        };
      }
      return null;
    });
    const insert = vi.fn();
    const patch = vi.fn();
    const ctx = { db: { get, insert, patch, query } } as never;

    const result = await scansModule.listMine.handler(ctx, {});

    expect(result).toHaveLength(2);
    expect(result.map((scan) => scan._id)).toEqual(["scan_single_1", "scan_single_2"]);
    expect(paginate).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
