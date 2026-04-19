import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

type EditorProjectSummary = {
  _id: Id<"editorProjects">;
  title: string;
  status: Doc<"editorProjects">["status"];
  clipCount: number;
  latestLocalDraftId: string | null;
  latestExportUrl: string | null;
  storylineSummary: string | null;
  orderingConfidence: "low" | "medium" | "high" | null;
  warningCount: number;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

type EditorProjectClip = {
  _id: Id<"editorProjectClips">;
  uploadId: Id<"uploads">;
  localUploadId: string | null;
  filename: string;
  durationSec: number | null;
  sourceOrder: number;
  createdAt: number;
};

type EditorProjectDetail = EditorProjectSummary & {
  clips: EditorProjectClip[];
};

async function requireOwnedProject(
  ctx: MutationCtx,
  userId: Id<"users">,
  projectId: Id<"editorProjects">,
) {
  const project = await ctx.db.get(projectId);
  if (project === null || project.userId !== userId) {
    throw new Error("Project not found.");
  }
  return project;
}

async function buildProjectSummary(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"editorProjects">,
): Promise<EditorProjectSummary> {
  const clipCount = (
    await ctx.db
      .query("editorProjectClips")
      .withIndex("by_projectId_and_sourceOrder", (q) => q.eq("projectId", project._id))
      .collect()
  ).length;

  return {
    _id: project._id,
    title: project.title,
    status: project.status,
    clipCount,
    latestLocalDraftId: project.latestLocalDraftId ?? null,
    latestExportUrl: project.latestExportStorageId
      ? await ctx.storage.getUrl(project.latestExportStorageId)
      : project.latestExportUrl ?? null,
    storylineSummary: project.storylineSummary ?? null,
    orderingConfidence: project.orderingConfidence ?? null,
    warningCount: project.warningCount ?? 0,
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
    return await ctx.db.insert("editorProjects", {
      userId,
      title: args.title?.trim() || "Untitled AI editor project",
      status: "drafting",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addClip = mutation({
  args: {
    projectId: v.id("editorProjects"),
    uploadId: v.id("uploads"),
    filenameSnapshot: v.string(),
    durationSecSnapshot: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    await requireOwnedProject(ctx, userId, args.projectId);
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || upload.userId !== userId) {
      throw new Error("Upload not found.");
    }

    const existing = await ctx.db
      .query("editorProjectClips")
      .withIndex("by_projectId_and_sourceOrder", (q) => q.eq("projectId", args.projectId))
      .collect();
    const duplicate = existing.find((clip) => clip.uploadId === args.uploadId);
    if (duplicate) {
      throw new Error("This clip is already in the project.");
    }

    const now = Date.now();
    const sourceOrder =
      existing.reduce((highest, clip) => Math.max(highest, clip.sourceOrder), -1) + 1;
    const clipId = await ctx.db.insert("editorProjectClips", {
      projectId: args.projectId,
      uploadId: args.uploadId,
      sourceOrder,
      filenameSnapshot: args.filenameSnapshot.trim() || upload.filename,
      durationSecSnapshot: args.durationSecSnapshot,
      createdAt: now,
    });
    await ctx.db.patch(args.projectId, {
      status: "drafting",
      warningCount: 0,
      errorMessage: "",
      updatedAt: now,
    });
    return clipId;
  },
});

export const removeClip = mutation({
  args: {
    projectId: v.id("editorProjects"),
    clipId: v.id("editorProjectClips"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    await requireOwnedProject(ctx, userId, args.projectId);
    const clip = await ctx.db.get(args.clipId);
    if (clip === null || clip.projectId !== args.projectId) {
      throw new Error("Clip not found.");
    }
    await ctx.db.delete(args.clipId);

    const remaining = await ctx.db
      .query("editorProjectClips")
      .withIndex("by_projectId_and_sourceOrder", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const [index, row] of remaining.entries()) {
      if (row.sourceOrder !== index) {
        await ctx.db.patch(row._id, { sourceOrder: index });
      }
    }

    await ctx.db.patch(args.projectId, {
      status: "drafting",
      warningCount: 0,
      errorMessage: "",
      updatedAt: Date.now(),
    });
    return args.clipId;
  },
});

export const updateTitle = mutation({
  args: {
    projectId: v.id("editorProjects"),
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

export const deleteProject = mutation({
  args: {
    projectId: v.id("editorProjects"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    await requireOwnedProject(ctx, userId, args.projectId);
    const clips = await ctx.db
      .query("editorProjectClips")
      .withIndex("by_projectId_and_sourceOrder", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const clip of clips) {
      await ctx.db.delete(clip._id);
    }
    await ctx.db.delete(args.projectId);
    return args.projectId;
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
      .query("editorProjects")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    return await Promise.all(projects.map(async (project) => buildProjectSummary(ctx, project)));
  },
});

export const getMineById = query({
  args: {
    projectId: v.id("editorProjects"),
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
    const clips = await ctx.db
      .query("editorProjectClips")
      .withIndex("by_projectId_and_sourceOrder", (q) => q.eq("projectId", args.projectId))
      .collect();

    const detailedClips = await Promise.all(
      clips.map(async (clip) => {
        const upload = await ctx.db.get(clip.uploadId);
        return {
          _id: clip._id,
          uploadId: clip.uploadId,
          localUploadId: upload?.localUploadId ?? null,
          filename: clip.filenameSnapshot,
          durationSec: clip.durationSecSnapshot ?? upload?.durationSec ?? null,
          sourceOrder: clip.sourceOrder,
          createdAt: clip.createdAt,
        } satisfies EditorProjectClip;
      }),
    );

    return {
      ...summary,
      clips: detailedClips,
    } satisfies EditorProjectDetail;
  },
});

export const queueGeneration = mutation({
  args: {
    projectId: v.id("editorProjects"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }

    const project = await requireOwnedProject(ctx, userId, args.projectId);
    const clips = await ctx.db
      .query("editorProjectClips")
      .withIndex("by_projectId_and_sourceOrder", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (clips.length < 2) {
      throw new Error("Add at least two clips before generating a rough cut.");
    }

    const uploadMap: Record<string, Doc<"uploads"> | null> = {};
    for (const clip of clips) {
      uploadMap[clip._id] = await ctx.db.get(clip.uploadId);
    }

    const missingLocalUpload = clips.find((clip) => !(uploadMap[clip._id]?.localUploadId));
    if (missingLocalUpload) {
      throw new Error("Every clip must finish uploading before generation can start.");
    }

    await ctx.db.patch(project._id, {
      status: "queued",
      errorMessage: "",
      updatedAt: Date.now(),
    });

    return {
      projectId: project._id,
      clips: clips.map((clip) => ({
        clipId: clip._id,
        uploadId: clip.uploadId,
        localUploadId: uploadMap[clip._id]?.localUploadId ?? "",
        filename: clip.filenameSnapshot,
      })),
    };
  },
});
