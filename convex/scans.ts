import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

type ScanSummary = {
  _id: Doc<"scans">["_id"];
  scanType?: Doc<"scans">["scanType"];
  title: string | null;
  filename: string;
  secondaryFilename: string | null;
  uploadId: Doc<"scans">["uploadId"];
  secondaryUploadId: Doc<"scans">["secondaryUploadId"] | null;
  localUploadId: string | null;
  status: Doc<"scans">["status"];
  localAnalysisId: string | null;
  secondaryLocalAnalysisId: string | null;
  compareResult: Doc<"scans">["compareResult"] | null;
  viralPotential: number | null;
  hookScore: number | null;
  pacingScore: number | null;
  retentionEstimate: number | null;
  deadspaceSeconds: number | null;
  trimmedDurationSec: number | null;
  analysisUrl: string | null;
  overviewRecommendation: string | null;
  selectedCutIds: string[];
  latestExportUrl: string | null;
  lastExportedAt: number | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

async function summarizeScan(ctx: QueryCtx, row: Doc<"scans">): Promise<ScanSummary> {
  const [primaryUpload, secondaryUpload] = await Promise.all([
    ctx.db.get(row.uploadId),
    row.secondaryUploadId ? ctx.db.get(row.secondaryUploadId) : Promise.resolve(null),
  ]);

  return {
    _id: row._id,
    scanType: row.scanType,
    title: row.displayName ?? null,
    filename: primaryUpload?.filename ?? "untitled.mp4",
    secondaryFilename: secondaryUpload?.filename ?? null,
    uploadId: row.uploadId,
    secondaryUploadId: row.secondaryUploadId ?? null,
    localUploadId: primaryUpload?.localUploadId ?? null,
    status: row.status,
    localAnalysisId: row.localAnalysisId ?? null,
    secondaryLocalAnalysisId: row.secondaryLocalAnalysisId ?? null,
    compareResult: row.compareResult ?? null,
    viralPotential: row.viralPotential ?? null,
    hookScore: row.hookScore ?? null,
    pacingScore: row.pacingScore ?? null,
    retentionEstimate: row.retentionEstimate ?? null,
    deadspaceSeconds: row.deadspaceSeconds ?? null,
    trimmedDurationSec: row.trimmedDurationSec ?? null,
    analysisUrl: row.analysisUrl ?? null,
    overviewRecommendation: row.overviewRecommendation ?? null,
    selectedCutIds: row.selectedCutIds ?? [],
    latestExportUrl: row.latestExportUrl ?? null,
    lastExportedAt: row.lastExportedAt ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listMineScans(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("scans")
    .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId as never))
    .order("desc")
    .take(50);

  return await Promise.all(rows.map(async (row) => summarizeScan(ctx, row)));
}

/**
 * Create a pending scan record owned by the current user.
 *
 * Called by the client right before POSTing to /api/analyze. FastAPI later
 * patches `localAnalysisId`, `status`, and summary fields via the service bridge.
 */
export const createPendingScan = mutation({
  args: {
    uploadId: v.id("uploads"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }
    // Ownership: the upload must belong to the current user.
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || upload.userId !== userId) {
      throw new Error("Upload not found.");
    }
    const now = Date.now();
    const scanId = await ctx.db.insert("scans", {
      userId,
      uploadId: args.uploadId,
      scanType: "single",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    return scanId;
  },
});

export const createPendingCompareScan = mutation({
  args: {
    primaryUploadId: v.id("uploads"),
    secondaryUploadId: v.id("uploads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    const [primaryUpload, secondaryUpload] = await Promise.all([
      ctx.db.get(args.primaryUploadId),
      ctx.db.get(args.secondaryUploadId),
    ]);

    if (
      primaryUpload === null ||
      secondaryUpload === null ||
      primaryUpload.userId !== userId ||
      secondaryUpload.userId !== userId
    ) {
      throw new Error("Upload not found.");
    }

    const now = Date.now();
    return await ctx.db.insert("scans", {
      userId,
      uploadId: args.primaryUploadId,
      secondaryUploadId: args.secondaryUploadId,
      scanType: "compare",
      displayName: args.title,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const saveSelectedCuts = mutation({
  args: {
    scanId: v.id("scans"),
    selectedCutIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }
    const scan = await ctx.db.get(args.scanId);
    if (scan === null || scan.userId !== userId) {
      throw new Error("Scan not found.");
    }
    await ctx.db.patch(args.scanId, {
      selectedCutIds: args.selectedCutIds,
      updatedAt: Date.now(),
    });
    return args.scanId;
  },
});

export const attachCompareAnalysisIds = mutation({
  args: {
    scanId: v.id("scans"),
    analysisIdA: v.string(),
    analysisIdB: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }
    const scan = await ctx.db.get(args.scanId);
    if (scan === null || scan.userId !== userId) {
      throw new Error("Scan not found.");
    }

    await ctx.db.patch(args.scanId, {
      localAnalysisId: args.analysisIdA,
      secondaryLocalAnalysisId: args.analysisIdB,
      status: "running",
      updatedAt: Date.now(),
    });
    return args.scanId;
  },
});

export const saveCompareResult = mutation({
  args: {
    scanId: v.id("scans"),
    winner: v.union(v.literal("A"), v.literal("B"), v.literal("tie")),
    winnerReason: v.string(),
    recommendation: v.string(),
    summary: v.array(v.string()),
    slices: v.array(
      v.object({
        label: v.string(),
        winner: v.union(v.literal("A"), v.literal("B"), v.literal("tie")),
        aScore: v.number(),
        bScore: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }
    const scan = await ctx.db.get(args.scanId);
    if (scan === null || scan.userId !== userId) {
      throw new Error("Scan not found.");
    }

    await ctx.db.patch(args.scanId, {
      status: "completed",
      compareResult: {
        winner: args.winner,
        winnerReason: args.winnerReason,
        recommendation: args.recommendation,
        summary: args.summary,
        slices: args.slices,
      },
      overviewRecommendation: args.recommendation,
      updatedAt: Date.now(),
    });
    return args.scanId;
  },
});

export const saveExportMetadata = mutation({
  args: {
    scanId: v.id("scans"),
    selectedCutIds: v.array(v.string()),
    latestExportUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }
    const scan = await ctx.db.get(args.scanId);
    if (scan === null || scan.userId !== userId) {
      throw new Error("Scan not found.");
    }
    await ctx.db.patch(args.scanId, {
      selectedCutIds: args.selectedCutIds,
      latestExportUrl: args.latestExportUrl,
      lastExportedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return args.scanId;
  },
});

/**
 * List scans owned by the current user, newest first, with the matching upload.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    return await listMineScans(ctx, userId);
  },
});

export const listRecentMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    const rows = await listMineScans(ctx, userId);
    return rows.slice(0, 6);
  },
});

/**
 * Get a single scan by id, only if the current user owns it.
 */
export const getMineById = query({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const scan = await ctx.db.get(args.scanId);
    if (scan === null || scan.userId !== userId) {
      return null;
    }
    return await summarizeScan(ctx, scan);
  },
});
