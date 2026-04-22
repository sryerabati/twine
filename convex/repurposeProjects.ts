import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

type RepurposeProjectSummary = {
  _id: Id<"repurposeProjects">;
  title: string;
  status: Doc<"repurposeProjects">["status"];
  sourceUploadId: Id<"uploads"> | null;
  sourceFilename: string | null;
  sourceDurationSec: number | null;
  latestLocalResultId: string | null;
  variantCount: number;
  summary: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

type RepurposeVariantRow = {
  _id: Id<"repurposeVariants">;
  variantKey: string;
  title: string;
  angleSummary: string;
  durationTarget: "source" | "short";
  durationSec: number;
  exportUrl: string | null;
  position: number;
};

type RepurposeProjectDetail = RepurposeProjectSummary & {
  variants: RepurposeVariantRow[];
};

const DEFAULT_PROJECT_TITLE = "Untitled repurpose project";

async function requireOwnedProject(
  ctx: MutationCtx,
  userId: Id<"users">,
  projectId: Id<"repurposeProjects">,
) {
  const project = await ctx.db.get(projectId);
  if (project === null || project.userId !== userId) {
    throw new Error("Project not found.");
  }
  return project;
}

async function buildProjectSummary(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"repurposeProjects">,
): Promise<RepurposeProjectSummary> {
  const variantCount =
    project.variantCount ??
    (
      await ctx.db
        .query("repurposeVariants")
        .withIndex("by_projectId_and_position", (q) => q.eq("projectId", project._id))
        .collect()
    ).length;

  return {
    _id: project._id,
    title: project.title,
    status: project.status,
    sourceUploadId: project.sourceUploadId ?? null,
    sourceFilename: project.sourceFilename ?? null,
    sourceDurationSec: project.sourceDurationSec ?? null,
    latestLocalResultId: project.latestLocalResultId ?? null,
    variantCount,
    summary: project.summary?.trim() ? project.summary : null,
    errorMessage: project.errorMessage?.trim() ? project.errorMessage : null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export const create = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    const now = Date.now();
    return await ctx.db.insert("repurposeProjects", {
      userId,
      title: args.title?.trim() || DEFAULT_PROJECT_TITLE,
      status: "drafting",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const attachSourceUpload = mutation({
  args: {
    projectId: v.id("repurposeProjects"),
    uploadId: v.id("uploads"),
    filenameSnapshot: v.string(),
    durationSecSnapshot: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    const project = await requireOwnedProject(ctx, userId, args.projectId);
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || upload.userId !== userId) {
      throw new Error("Upload not found.");
    }

    const existingVariants = await ctx.db
      .query("repurposeVariants")
      .withIndex("by_projectId_and_position", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const variant of existingVariants) {
      await ctx.db.delete(variant._id);
    }

    await ctx.db.replace(args.projectId, {
      userId: project.userId,
      title: project.title,
      status: "drafting",
      sourceUploadId: args.uploadId,
      sourceFilename: args.filenameSnapshot.trim() || upload.filename,
      sourceDurationSec: args.durationSecSnapshot ?? upload.durationSec,
      variantCount: 0,
      summary: "",
      errorMessage: "",
      createdAt: project.createdAt,
      updatedAt: Date.now(),
    });
  },
});

export const listRecentMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const projects = await ctx.db
      .query("repurposeProjects")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    return await Promise.all(projects.map(async (project) => buildProjectSummary(ctx, project)));
  },
});

export const getMineById = query({
  args: {
    projectId: v.id("repurposeProjects"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const project = await ctx.db.get(args.projectId);
    if (project === null || project.userId !== userId) {
      return null;
    }

    const summary = await buildProjectSummary(ctx, project);
    const variants = await ctx.db
      .query("repurposeVariants")
      .withIndex("by_projectId_and_position", (q) => q.eq("projectId", args.projectId))
      .collect();
    const detailedVariants = await Promise.all(
      variants.map(async (variant) => ({
        _id: variant._id,
        variantKey: variant.variantKey,
        title: variant.title,
        angleSummary: variant.angleSummary,
        durationTarget: variant.durationTarget,
        durationSec: variant.durationSec,
        exportUrl: variant.exportStorageId
          ? await ctx.storage.getUrl(variant.exportStorageId)
          : variant.exportUrl ?? null,
        position: variant.position,
      })),
    );

    return {
      ...summary,
      variants: detailedVariants,
    } satisfies RepurposeProjectDetail;
  },
});

export const queueGeneration = mutation({
  args: {
    projectId: v.id("repurposeProjects"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    const project = await requireOwnedProject(ctx, userId, args.projectId);
    if (!project.sourceUploadId) {
      throw new Error("Upload a source video before generating repurpose variants.");
    }

    const upload = await ctx.db.get(project.sourceUploadId);
    if (upload === null || upload.userId !== userId) {
      throw new Error("Source upload not found.");
    }
    if (!upload.localUploadId) {
      throw new Error("The source upload must finish uploading before generation can start.");
    }

    await ctx.db.patch(args.projectId, {
      status: "queued",
      errorMessage: "",
      updatedAt: Date.now(),
    });

    return {
      projectId: project._id,
      sourceUploadId: project.sourceUploadId,
      localUploadId: upload.localUploadId,
      filename: project.sourceFilename ?? upload.filename,
    };
  },
});

export const updateTitle = mutation({
  args: {
    projectId: v.id("repurposeProjects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    await requireOwnedProject(ctx, userId, args.projectId);
    const title = args.title.trim();
    if (!title) {
      throw new Error("Project title cannot be empty.");
    }
    await ctx.db.patch(args.projectId, {
      title,
      updatedAt: Date.now(),
    });
  },
});
