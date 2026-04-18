import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Service-authenticated mutations called by FastAPI over HTTP.
 *
 * DO NOT expose these as `mutation` (public). They are declared as
 * `internalMutation` and only reachable through the shared-secret HTTP routes
 * defined in `http.ts`. The HTTP layer is responsible for validating
 * `CONVEX_SERVICE_SECRET` before forwarding a request here.
 *
 * Every function here is write-only and idempotent-friendly: FastAPI may retry
 * on network blips and the outcome must be the same as a single call.
 */

const SCAN_STATUS = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

/**
 * Attach FastAPI's local upload id to a pending upload row.
 */
export const attachUploadLocalId = internalMutation({
  args: {
    uploadId: v.id("uploads"),
    localUploadId: v.string(),
    durationSec: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null) {
      throw new Error("Upload not found.");
    }
    await ctx.db.patch(args.uploadId, {
      localUploadId: args.localUploadId,
      durationSec: args.durationSec,
    });
  },
});

/**
 * Update a scan's lifecycle state.
 *
 * FastAPI calls this on every state transition (queued -> running -> completed/failed).
 */
export const updateScanStatus = internalMutation({
  args: {
    scanId: v.id("scans"),
    status: SCAN_STATUS,
    localAnalysisId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (scan === null) {
      throw new Error("Scan not found.");
    }
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.localAnalysisId !== undefined) {
      patch.localAnalysisId = args.localAnalysisId;
      patch.analysisUrl = `/analysis/${args.localAnalysisId}`;
    }
    if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage.slice(0, 500);
    }
    await ctx.db.patch(args.scanId, patch);
  },
});

/**
 * Attach a completed scan's summary fields for history rendering.
 */
export const attachScanSummary = internalMutation({
  args: {
    scanId: v.id("scans"),
    viralPotential: v.optional(v.number()),
    hookScore: v.optional(v.number()),
    pacingScore: v.optional(v.number()),
    retentionEstimate: v.optional(v.number()),
    deadspaceSeconds: v.optional(v.number()),
    trimmedDurationSec: v.optional(v.number()),
    overallRecommendation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId);
    if (scan === null) {
      throw new Error("Scan not found.");
    }
    await ctx.db.patch(args.scanId, {
      viralPotential: args.viralPotential,
      hookScore: args.hookScore,
      pacingScore: args.pacingScore,
      retentionEstimate: args.retentionEstimate,
      deadspaceSeconds: args.deadspaceSeconds,
      trimmedDurationSec: args.trimmedDurationSec,
      overviewRecommendation: args.overallRecommendation,
      updatedAt: Date.now(),
    });
  },
});
