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
    scanType: v.optional(v.union(v.literal("single"), v.literal("compare"))),
    displayName: v.optional(v.string()),
    secondaryUploadId: v.optional(v.id("uploads")),
    secondaryLocalAnalysisId: v.optional(v.string()),
    compareResult: v.optional(
      v.object({
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
      }),
    ),
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
    .index("by_userId_scanType_createdAt", ["userId", "scanType", "createdAt"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_localAnalysisId", ["localAnalysisId"])
    .index("by_userId_status", ["userId", "status"]),

  editorProjects: defineTable({
    userId: v.id("users"),
    title: v.string(),
    status: v.union(
      v.literal("drafting"),
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    latestLocalDraftId: v.optional(v.string()),
    latestExportUrl: v.optional(v.string()),
    storylineSummary: v.optional(v.string()),
    orderingConfidence: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    ),
    warningCount: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_status", ["userId", "status"]),

  editorProjectClips: defineTable({
    projectId: v.id("editorProjects"),
    uploadId: v.id("uploads"),
    sourceOrder: v.number(),
    filenameSnapshot: v.string(),
    durationSecSnapshot: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_projectId_and_sourceOrder", ["projectId", "sourceOrder"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"]),
});

export default schema;
