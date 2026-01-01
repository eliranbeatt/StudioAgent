import { mutation, query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const MAX_EXTRACTED_CHARS = 12000;
const MAX_SUMMARY_CHARS = 1200;

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
      createdAt: Date.now(),
    });
  },
});

export const saveUploadedFile = action({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const extracted = await extractText(ctx, args.storageId, args.contentType);
    const summary = summarizeText(extracted ?? "");

    await ctx.runMutation(internal.files.saveFileRecord, {
      projectId: args.projectId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      extractedText: extracted ?? undefined,
      summary: summary ?? undefined,
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

async function extractText(ctx: any, storageId: any, contentType: string) {
  const blob = await ctx.storage.get(storageId);
  if (!blob) return null;

  const isText =
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("csv") ||
    contentType.includes("markdown");

  if (!isText) {
    return null;
  }

  const text = await blob.text();
  return text.slice(0, MAX_EXTRACTED_CHARS);
}

function summarizeText(text: string) {
  if (!text) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const summaryLines = lines.slice(0, 10);
  const summary = summaryLines.join(" | ").slice(0, MAX_SUMMARY_CHARS);
  return summary;
}
