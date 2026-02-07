import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const list = query({
  args: {
    limit: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.union(v.literal("success"), v.literal("failed"))),
    runId: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit || 50, 500); // Cap at 500

    let q = ctx.db.query("llmTraces").order("desc");

    if (args.projectId) {
      q = q.filter((q) => q.eq(q.field("projectId"), args.projectId));
    }

    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }

    if (args.runId) {
      q = q.filter((q) => q.eq(q.field("runId"), args.runId));
    }

    const paginationOpts = {
      numItems: limit,
      cursor: args.cursor ?? null,
    };
    const paginated = await q.paginate(paginationOpts);

    // Return summary only to save bandwidth
    return {
      traces: paginated.page.map((t) => ({
        _id: t._id,
        _creationTime: t._creationTime, // Convex system field
        projectId: t.projectId,
        provider: t.provider,
        model: t.model,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        latencyMs: t.latencyMs,
        status: t.status,
        error: t.error,
        runId: t.runId,
        cost: t.cost,
      })),
      continueCursor: paginated.continueCursor,
      isDone: paginated.isDone,
    };
  },
});

export const get = query({
  args: { id: v.id("llmTraces") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const latestByConversation = query({
  args: {
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("llmTraces")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .first();
  },
});

export const analytics = query({
  args: {
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const traces = await ctx.db
      .query("llmTraces")
      .order("desc")
      .filter((q) => q.gte(q.field("_creationTime"), args.since))
      .take(100);

    return traces.map((t) => ({
      _id: t._id,
      _creationTime: t._creationTime,
      projectId: t.projectId,
      model: t.model,
      provider: t.provider,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      status: t.status,
    }));
  },
});

// Get unique run IDs with their project IDs for dropdown population
export const listRunIds = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Limit to 50 items to avoid reading too much data (limit is 16MB)
    // traces can be very large
    const scanLimit = Math.min(args.limit || 20, 50);

    const traces = await ctx.db.query("llmTraces")
      .order("desc")
      .take(scanLimit);

    // Deduplicate and build mapping
    const runIdMap = new Map<string, { runId: string; projectId: string | null }>();
    traces.forEach(t => {
      if (t.runId && !runIdMap.has(t.runId)) {
        runIdMap.set(t.runId, { runId: t.runId, projectId: t.projectId as string | null });
      }
    });
    return Array.from(runIdMap.values());
  },
});

// Analytics query with filters and pagination - no time limit for full history
export const analyticsFiltered = query({
  args: {
    projectId: v.optional(v.id("projects")),
    runId: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit || 500, 2000);
    let q = ctx.db.query("llmTraces").order("desc");

    if (args.projectId) {
      q = q.filter((q) => q.eq(q.field("projectId"), args.projectId));
    }
    if (args.runId) {
      q = q.filter((q) => q.eq(q.field("runId"), args.runId));
    }

    const paginationOpts = {
      numItems: limit,
      cursor: args.cursor ?? null,
    };
    const paginated = await q.paginate(paginationOpts);

    return {
      traces: paginated.page.map(t => ({
        _id: t._id,
        _creationTime: t._creationTime,
        projectId: t.projectId,
        runId: t.runId,
        model: t.model,
        provider: t.provider,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        status: t.status,
      })),
      continueCursor: paginated.continueCursor,
      isDone: paginated.isDone,
    };
  },
});
