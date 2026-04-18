import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

async function listMineScans(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("scans")
    .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId as never))
    .order("desc")
    .take(50);

  return await Promise.all(
    rows.map(async (row) => {
      const upload = await ctx.db.get(row.uploadId);
      return {
        _id: row._id,
        uploadId: row.uploadId,
        status: row.status,
        localAnalysisId: row.localAnalysisId ?? null,
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
        filename: upload?.filename ?? "untitled.mp4",
      };
    }),
  );
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
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    return scanId;
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
    const upload = await ctx.db.get(scan.uploadId);
    return {
      ...scan,
      filename: upload?.filename ?? "untitled.mp4",
      selectedCutIds: scan.selectedCutIds ?? [],
      latestExportUrl: scan.latestExportUrl ?? null,
      lastExportedAt: scan.lastExportedAt ?? null,
      overviewRecommendation: scan.overviewRecommendation ?? null,
    };
  },
});
