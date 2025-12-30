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

    // 2. Simple Skill Routing Stub
    // In a real system, this would trigger an LLM action.
    // Here we'll simulate a response based on keywords.
    
    let responseContent = "I'm processing your request. How else can I help with the project?";
    let responseType: "text" | "questions" | "changeSet" = "text";
    let skillUsed = "general_chat";

    const inputLower = args.content.toLowerCase();
    
    if (inputLower.includes("element") || inputLower.includes("create")) {
        responseContent = "I can help you create a new element. What is the title and type of the element?";
        responseType = "questions";
        skillUsed = "ideation_questions";
    } else if (inputLower.includes("budget") || inputLower.includes("cost")) {
        responseContent = "Let's look at the project financials. I see we are still in the ideation stage.";
        skillUsed = "financial_overview";
    }

    // 3. Save Agent response
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "agent",
      content: responseContent,
      type: responseType,
      channel: args.channel,
      skillUsed,
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
