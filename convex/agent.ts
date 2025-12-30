import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const getOrCreateConversation = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("conversations", {
      projectId: args.projectId,
      status: "active",
      stage: "ideation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    channel: v.union(v.literal("free"), v.literal("structured")),
  },
  handler: async (ctx, args) => {
    // 1. Save user message
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      type: "text",
      channel: args.channel,
      createdAt: Date.now(),
    });

    // 2. Simple Skill Routing + structured intake (no LLM yet)
    let responseContent = "I'm processing your request. How else can I help with the project?";
    let responseType: "text" | "questions" | "changeSet" = "text";
    let skillUsed = "general_chat";
    let metadata: any = undefined;

    const inputLower = args.content.toLowerCase();
    const structuredFields =
      args.channel === "structured" ? parseStructuredFields(args.content) : {};
    const conversation = await ctx.db.get(args.conversationId);
    const projectId = conversation?.projectId;

    if (args.channel === "structured") {
      if (structuredFields.title && projectId) {
        const elementType = normalizeElementType(structuredFields.type);
        const elementId = await ctx.db.insert("elements", {
          projectId,
          title: structuredFields.title,
          type: elementType,
          status: "drafting",
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const draftId = await ctx.db.insert("elementDrafts", {
          elementId,
          projectId,
          status: "open",
          revisionNumber: 1,
          createdFrom: { tab: "Studio", stage: "structured" },
          workingSnapshot: {
            title: structuredFields.title,
            tasks: { byId: {} },
            labor: { byId: {} },
            materials: { byId: {} },
            subcontract: { byId: {} },
            notes: [],
            meta: { version: 1 },
          },
          schemaVersion: 1,
          createdBy: undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await ctx.db.patch(elementId, { currentDraftId: draftId });

        responseContent = `Created element "${structuredFields.title}" (${elementType}). You can add tasks, materials, and labor next.`;
        responseType = "text";
        skillUsed = "create_element";
        metadata = { createdElementId: elementId, draftId };
      } else if (structuredFields.title && !projectId) {
        responseContent = "Missing project context. Please refresh the page and try again.";
        responseType = "text";
        skillUsed = "system_error";
      } else {
        responseContent = "Answer these and I will create the element:";
        responseType = "questions";
        skillUsed = "ideation_questions";
        metadata = {
          questions: [
            { id: "title", label: "Element title", required: true },
            { id: "type", label: "Element type (build|print|install|subcontract|mixed)", required: true },
            { id: "dimensions", label: "Dimensions or size (optional)", required: false },
            { id: "finish", label: "Finish / materials preference (optional)", required: false },
          ],
          hint: "Reply in this format: title: ... | type: ... | dimensions: ...",
        };
      }
    } else if (inputLower.includes("budget") || inputLower.includes("cost")) {
      responseContent = "I can summarize financials in the Accounting tab and flag missing cost lines.";
      skillUsed = "financial_overview";
    } else if (inputLower.includes("task")) {
      responseContent = "Tell me which element to add tasks to, and the task list.";
      skillUsed = "task_planning";
    }

    // 3. Save Agent response
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "agent",
      content: responseContent,
      type: responseType,
      channel: args.channel,
      skillUsed,
      metadata,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
  },
});

export const getConversation = query({
    args: { id: v.id("conversations") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    }
})

function parseStructuredFields(content: string) {
  const fields: Record<string, string> = {};
  const parts = content.split(/[|\n]/);
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.split(/[:=]/);
    if (!rawKey || rawValue.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(":").trim();
    if (!value) continue;
    fields[key] = value;
  }
  return fields;
}

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
