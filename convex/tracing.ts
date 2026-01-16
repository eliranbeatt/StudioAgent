import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    limit: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.union(v.literal("success"), v.literal("failed"))),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    let q = ctx.db.query("llmTraces").order("desc");

    if (args.projectId) {
      q = q.filter((q) => q.eq(q.field("projectId"), args.projectId));
    }

    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }

    const traces = await q.take(limit);

    // Return summary only to save bandwidth
    return traces.map((t) => ({
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
    }));
  },
});

export const get = query({
  args: { id: v.id("llmTraces") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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
      .collect();

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
