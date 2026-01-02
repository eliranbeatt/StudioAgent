import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

type SuggestedInput = {
  title: string;
  type?: string;
};

export const listSuggested = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("suggestedElements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const addSuggestionsFromMessageInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    messageId: v.id("messages"),
    suggestions: v.array(
      v.object({
        title: v.string(),
        type: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (!args.suggestions.length) return { ok: true, created: 0 };
    const now = Date.now();
    let created = 0;
    for (const suggestion of args.suggestions) {
      const title = suggestion.title.trim();
      if (!title) continue;
      await ctx.db.insert("suggestedElements", {
        projectId: args.projectId,
        title,
        type: normalizeElementType(suggestion.type),
        status: "pending",
        sourceMessageId: args.messageId,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }
    return { ok: true, created };
  },
});

export const approveSuggestedElement = mutation({
  args: {
    suggestionId: v.id("suggestedElements"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw new Error("Suggestion not found.");
    if (suggestion.status !== "pending") {
      throw new Error("Suggestion already processed.");
    }

    const now = Date.now();
    const elementId = await ctx.db.insert("elements", {
      projectId: suggestion.projectId,
      title: suggestion.title,
      type: normalizeElementType(suggestion.type),
      status: "drafting",
      tags: ["suggested"],
      createdAt: now,
      updatedAt: now,
    });

    const draftId = await ctx.db.insert("elementDrafts", {
      elementId,
      projectId: suggestion.projectId,
      status: "open",
      revisionNumber: 1,
      createdFrom: { tab: "Studio", stage: "suggested" },
      workingSnapshot: {
        title: suggestion.title,
        tasks: { byId: {} },
        labor: { byId: {} },
        materials: { byId: {} },
        subcontract: { byId: {} },
        notes: [],
        meta: { version: 1 },
      },
      schemaVersion: 1,
      createdBy: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(elementId, { currentDraftId: draftId });

    await ctx.db.patch(args.suggestionId, {
      status: "approved",
      approvedElementId: elementId,
      updatedAt: now,
    });

    return { ok: true, elementId, draftId };
  },
});

export const rejectSuggestedElement = mutation({
  args: {
    suggestionId: v.id("suggestedElements"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw new Error("Suggestion not found.");
    if (suggestion.status !== "pending") {
      throw new Error("Suggestion already processed.");
    }
    await ctx.db.patch(args.suggestionId, {
      status: "rejected",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

function normalizeElementType(input?: string) {
  const allowed = new Set([
    "build",
    "rent",
    "print",
    "transport",
    "install",
    "subcontract",
    "mixed",
  ]);
  const value = (input ?? "").trim().toLowerCase();
  return allowed.has(value) ? (value as any) : "build";
}
