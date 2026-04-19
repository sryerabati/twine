import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

const EDITOR_PROJECT_STATUS = v.union(
  v.literal("drafting"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

const ORDERING_CONFIDENCE = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

export const updateProjectStatus = internalMutation({
  args: {
    projectId: v.id("editorProjects"),
    status: EDITOR_PROJECT_STATUS,
    latestLocalDraftId: v.optional(v.string()),
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
    if (args.latestLocalDraftId !== undefined) {
      patch.latestLocalDraftId = args.latestLocalDraftId;
    }
    if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage.slice(0, 500);
    }

    await ctx.db.patch(args.projectId, patch);
  },
});

export const attachDraftSummary = internalMutation({
  args: {
    projectId: v.id("editorProjects"),
    latestLocalDraftId: v.optional(v.string()),
    latestExportUrl: v.optional(v.string()),
    storylineSummary: v.optional(v.string()),
    orderingConfidence: v.optional(ORDERING_CONFIDENCE),
    warningCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project === null) {
      throw new Error("Project not found.");
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    if (args.latestLocalDraftId !== undefined) {
      patch.latestLocalDraftId = args.latestLocalDraftId;
    }
    if (args.latestExportUrl !== undefined) {
      patch.latestExportUrl = args.latestExportUrl;
    }
    if (args.storylineSummary !== undefined) {
      patch.storylineSummary = args.storylineSummary;
    }
    if (args.orderingConfidence !== undefined) {
      patch.orderingConfidence = args.orderingConfidence;
    }
    if (args.warningCount !== undefined) {
      patch.warningCount = args.warningCount;
    }

    await ctx.db.patch(args.projectId, patch);
  },
});
