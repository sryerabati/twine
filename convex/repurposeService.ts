import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

const REPURPOSE_PROJECT_STATUS = v.union(
  v.literal("drafting"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

const REPURPOSE_DURATION_TARGET = v.union(v.literal("source"), v.literal("short"));

export const updateProjectStatus = internalMutation({
  args: {
    projectId: v.id("repurposeProjects"),
    status: REPURPOSE_PROJECT_STATUS,
    latestLocalResultId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project === null) {
      throw new Error("Project not found.");
    }

    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.latestLocalResultId !== undefined) {
      patch.latestLocalResultId = args.latestLocalResultId;
    }
    if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage.slice(0, 500);
    } else if (args.status !== "failed") {
      patch.errorMessage = "";
    }

    await ctx.db.patch(args.projectId, patch);
  },
});

export const attachSummary = internalMutation({
  args: {
    projectId: v.id("repurposeProjects"),
    latestLocalResultId: v.optional(v.string()),
    sourceUploadId: v.optional(v.id("uploads")),
    sourceFilename: v.optional(v.string()),
    sourceDurationSec: v.optional(v.number()),
    summary: v.optional(v.string()),
    variants: v.array(
      v.object({
        variantKey: v.string(),
        title: v.string(),
        angleSummary: v.string(),
        durationTarget: REPURPOSE_DURATION_TARGET,
        durationSec: v.number(),
        exportUrl: v.optional(v.string()),
        exportStorageId: v.optional(v.id("_storage")),
        position: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project === null) {
      throw new Error("Project not found.");
    }

    const existingVariants = await ctx.db
      .query("repurposeVariants")
      .withIndex("by_projectId_and_position", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const variant of existingVariants) {
      await ctx.db.delete(variant._id);
    }

    const now = Date.now();
    for (const variant of args.variants) {
      await ctx.db.insert("repurposeVariants", {
        projectId: args.projectId,
        variantKey: variant.variantKey,
        title: variant.title,
        angleSummary: variant.angleSummary,
        durationTarget: variant.durationTarget,
        durationSec: variant.durationSec,
        exportUrl: variant.exportUrl,
        exportStorageId: variant.exportStorageId,
        position: variant.position,
        createdAt: now,
        updatedAt: now,
      });
    }

    const patch: Record<string, unknown> = {
      status: "completed",
      variantCount: args.variants.length,
      updatedAt: now,
    };
    if (args.latestLocalResultId !== undefined) {
      patch.latestLocalResultId = args.latestLocalResultId;
    }
    if (args.sourceUploadId !== undefined) {
      patch.sourceUploadId = args.sourceUploadId;
    }
    if (args.sourceFilename !== undefined) {
      patch.sourceFilename = args.sourceFilename;
    }
    if (args.sourceDurationSec !== undefined) {
      patch.sourceDurationSec = args.sourceDurationSec;
    }
    if (args.summary !== undefined) {
      patch.summary = args.summary;
    }

    await ctx.db.patch(args.projectId, patch);
  },
});
