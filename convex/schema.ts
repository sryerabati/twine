import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * Convex schema for user accounts, uploads, and scans.
 *
 * Ownership rule: every row in `uploads` and `scans` is owned by a row in `users`
 * (via the `userId` field). Every public query/mutation MUST resolve the current
 * user via `getAuthUserId` and filter by that userId. FastAPI-driven writes go
 * through service-secret-authenticated functions in `service.ts` and may only
 * update rows that are already user-owned.
 */
const schema = defineSchema({
  // authTables provides: users, authAccounts, authSessions, authVerificationCodes, etc.
  ...authTables,

  uploads: defineTable({
    userId: v.id("users"),
    filename: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
    durationSec: v.optional(v.number()),
    localUploadId: v.optional(v.string()),
    convexVideoStorageId: v.optional(v.id("_storage")),
    convexThumbnailStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_localUploadId", ["localUploadId"]),

  scans: defineTable({
    userId: v.id("users"),
    uploadId: v.id("uploads"),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    localAnalysisId: v.optional(v.string()),
    viralPotential: v.optional(v.number()),
    hookScore: v.optional(v.number()),
    pacingScore: v.optional(v.number()),
    retentionEstimate: v.optional(v.number()),
    deadspaceSeconds: v.optional(v.number()),
    trimmedDurationSec: v.optional(v.number()),
    analysisUrl: v.optional(v.string()),
    overviewRecommendation: v.optional(v.string()),
    selectedCutIds: v.optional(v.array(v.string())),
    latestExportUrl: v.optional(v.string()),
    lastExportedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_localAnalysisId", ["localAnalysisId"])
    .index("by_userId_status", ["userId", "status"]),
});

export default schema;
