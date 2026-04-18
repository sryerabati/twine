import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Create a pending upload record owned by the current user.
 *
 * The client calls this BEFORE sending bytes to FastAPI, so the durable
 * history of "user tried to upload a clip" is recorded even if the FastAPI
 * ingest fails. FastAPI later patches `localUploadId` via the service bridge.
 */
export const createPendingUpload = mutation({
  args: {
    filename: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated.");
    }
    // Basic input sanity: reject empty filenames or absurd sizes. The real
    // enforcement is on FastAPI; this is defense in depth.
    const trimmedFilename = args.filename.trim().slice(0, 255);
    if (!trimmedFilename) {
      throw new Error("Filename is required.");
    }
    if (args.sizeBytes < 0 || args.sizeBytes > 1_000_000_000) {
      throw new Error("Upload size is out of range.");
    }
    const uploadId = await ctx.db.insert("uploads", {
      userId,
      filename: trimmedFilename,
      contentType: args.contentType.slice(0, 100),
      sizeBytes: args.sizeBytes,
      createdAt: Date.now(),
    });
    return uploadId;
  },
});

/**
 * List uploads owned by the current user, newest first.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    return await ctx.db
      .query("uploads")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

/**
 * Fetch one upload the current user owns, or null.
 */
export const getMineById = query({
  args: { uploadId: v.id("uploads") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || upload.userId !== userId) {
      return null;
    }
    return upload;
  },
});
