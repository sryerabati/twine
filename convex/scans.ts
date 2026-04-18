import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    const rows = await ctx.db
      .query("scans")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    // Hydrate each scan with its upload's filename so the history UI can render
    // in a single round-trip.
    const hydrated = await Promise.all(
      rows.map(async (row) => {
        const upload = await ctx.db.get(row.uploadId);
        return {
          _id: row._id,
          status: row.status,
          localAnalysisId: row.localAnalysisId ?? null,
          viralPotential: row.viralPotential ?? null,
          hookScore: row.hookScore ?? null,
          pacingScore: row.pacingScore ?? null,
          retentionEstimate: row.retentionEstimate ?? null,
          deadspaceSeconds: row.deadspaceSeconds ?? null,
          trimmedDurationSec: row.trimmedDurationSec ?? null,
          analysisUrl: row.analysisUrl ?? null,
          errorMessage: row.errorMessage ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          filename: upload?.filename ?? "untitled.mp4",
        };
      }),
    );
    return hydrated;
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
    return scan;
  },
});
