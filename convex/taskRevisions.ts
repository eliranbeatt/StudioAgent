import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const getByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskRevisions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("status"), "draft"))
      .collect();
  },
});

export const upsertDraft = mutation({
  args: {
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    baseVersionHash: v.string(),
    patch: v.any(),
    source: v.union(v.literal("human"), v.literal("agent")),
    agentRunId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingDraft = await ctx.db
      .query("taskRevisions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("status"), "draft"))
      .first();

    if (existingDraft) {
      // Merge patch
      const mergedPatch = { ...existingDraft.patch, ...args.patch };
      await ctx.db.patch(existingDraft._id, {
        patch: mergedPatch,
        updatedAt: Date.now(),
        // Update source/agent if changed? Keep original creator or update to latest editor?
        // For now, let's just update the patch.
      });
      return existingDraft._id;
    } else {
      const id = await ctx.db.insert("taskRevisions", {
        projectId: args.projectId,
        taskId: args.taskId,
        baseVersionHash: args.baseVersionHash,
        patch: args.patch,
        source: args.source,
        agentRunId: args.agentRunId,
        status: "draft",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return id;
    }
  },
});

export const discard = mutation({
  args: { revisionId: v.id("taskRevisions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.revisionId, {
      status: "discarded",
      updatedAt: Date.now(),
    });
  },
});

export const apply = mutation({
  args: { revisionId: v.id("taskRevisions") },
  handler: async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId);
    if (!revision) throw new Error("Revision not found");
    if (revision.status !== "draft") throw new Error("Revision is not in draft status");

    const task = await ctx.db.get(revision.taskId);
    if (!task) throw new Error("Task not found");

    // TODO: Verify baseVersionHash. For now we skip strict hash check or we need a way to compute it.
    // In a real impl, we would hash the task fields and compare.
    // if (computeHash(task) !== revision.baseVersionHash) { ... }

    // Apply patch
    await ctx.db.patch(task._id, {
        ...revision.patch,
        updatedAt: Date.now(),
    });

    await ctx.db.patch(revision._id, {
      status: "applied",
      updatedAt: Date.now(),
    });
  },
});
