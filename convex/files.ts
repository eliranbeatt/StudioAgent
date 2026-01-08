import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";




export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveFileRecord = internalMutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    extractedText: v.optional(v.string()),
    summary: v.optional(v.string()),
    extractedInfo: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("projectFiles", {
      projectId: args.projectId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      extractedText: args.extractedText,
      summary: args.summary,
      extractedInfo: args.extractedInfo,
      createdAt: Date.now(),
    });
  },
});



export const listProjectFiles = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const deleteProjectFile = action({
  args: { fileId: v.id("projectFiles") },
  handler: async (ctx, args) => {
    const file = await ctx.runQuery(internal.files.getFileRecord, { fileId: args.fileId });
    if (!file) {
      return { ok: false };
    }

    await ctx.storage.delete(file.storageId);
    await ctx.runMutation(internal.files.deleteFileRecord, { fileId: args.fileId });
    return { ok: true };
  },
});

export const getProjectContext = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(10);

    return files.map((file) => ({
      fileName: file.fileName,
      summary: file.summary ?? "",
    }));
  },
});

export const getFileRecord = internalQuery({
  args: { fileId: v.id("projectFiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId);
  },
});

export const deleteFileRecord = internalMutation({
  args: { fileId: v.id("projectFiles") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.fileId);
  },
});


