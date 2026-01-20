import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const createConversation = mutation({
  args: { 
    projectId: v.id("projects"), 
    title: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("agentConversations", {
      projectId: args.projectId,
      title: args.title ?? "New Conversation",
      mode: "chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("agentConversations"),
    text: v.string(),
    asRole: v.optional(v.union(v.literal("user"), v.literal("assistant"))),
  },
  handler: async (ctx, args) => {
    const role = args.asRole ?? "user";
    
    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: role,
      text: args.text,
      createdAt: Date.now(),
    });

    // Update conversation timestamp
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });

    // Trigger Flow Runner if user message
    if (role === "user") {
      const conversation = await ctx.db.get(args.conversationId);
      if (conversation) {
        // Find active flow run for this project
        const flowRun = await ctx.db
          .query("flowRuns")
          .withIndex("by_project_status", (q) => 
            q.eq("projectId", conversation.projectId).eq("status", "running")
          )
          .first();

        if (flowRun) {
           // Schedule a tick to process the new context
           await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, { 
             runId: flowRun._id 
           });
        }
      }
    }
  },
});

export const listMessages = query({
  args: { conversationId: v.id("agentConversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

export const startProjectFlow = mutation({
  args: { 
    projectId: v.id("projects"),
    initialGate: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Check if already running
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_project_status", (q) => 
        q.eq("projectId", args.projectId).eq("status", "running")
      )
      .first();

    if (existing) {
      return { flowRunId: existing._id, status: "already_running" };
    }

    // Call internal logic to create run
    // Using flowRuns.create logic but exposing it here
    const runId = await ctx.db.insert("flowRuns", {
      projectId: args.projectId,
      status: "running",
      currentGateId: args.initialGate ?? "G0",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      toggles: { autoRun: true, useWebSearch: false }
    });

    // Start the runner
    await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, { runId });

    return { flowRunId: runId, status: "started" };
  },
});
