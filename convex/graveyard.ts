import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listPending = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("graveyardItems")
      .withIndex("by_project_status", (q) => 
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
      .order("desc")
      .collect();
  },
});

export const resolve = mutation({
  args: {
    graveyardItemId: v.id("graveyardItems"),
    selectedOptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.graveyardItemId);
    if (!item) throw new Error("Graveyard item not found");
    if (item.status !== "pending") throw new Error("Item already resolved");

    const option = item.options.find((o) => o.id === args.selectedOptionId);
    if (!option) throw new Error("Invalid option selected");

    const now = Date.now();

    // If the option has patchOps, we should technically apply them. 
    // For now, we'll just mark it as resolved. 
    // In a full implementation, this might spawn a ChangeSet or apply updates directly.
    // Given the specs mentioned "graveyard decisions emit ChangeSets", we might want to do that.
    // However, to unblock the UI, we'll just mark resolved.

    if (option.patchOps && option.patchOps.length > 0) {
       await ctx.db.insert("changeSets", {
        projectId: item.projectId,
        stage: "IDEATION", // Default or needs to be derived?
        status: "PROPOSED", // Or applied directly?
        ops: option.patchOps.map(op => ({ kind: "auto.graveyard", payload: op })),
        reason_he: `Graveyard resolution: ${item.title} -> ${option.label}`,
        createdAt: now,
      });
    }

    await ctx.db.patch(args.graveyardItemId, {
      status: "resolved",
      chosenOptionId: args.selectedOptionId,
      resolvedAt: now,
    });
  },
});
