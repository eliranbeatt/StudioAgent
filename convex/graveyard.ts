import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { applyChangeSetInternal } from "./drafts";

export const listPending = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("graveyardItems")
      .withIndex("by_project_status", (q) => 
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
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

    const selectedOption = item.options.find((o: any) => o.id === args.selectedOptionId);
    if (!selectedOption) throw new Error("Invalid option selected");

    // 1. Mark as resolved
    await ctx.db.patch(args.graveyardItemId, {
        status: "resolved",
        selectedOptionId: args.selectedOptionId,
        resolvedAt: Date.now(),
        // resolvedBy: ... (user context)
    });

    // 2. Apply the chosen fix as a new ChangeSet
    // @ts-ignore
    const draft = await ctx.db.get(item.draftId);
    if (!draft) throw new Error("Draft missing");

    const result = await applyChangeSetInternal(ctx, {
      draftType: item.draftType,
      draftId: item.draftId,
      projectId: item.projectId,
      patchOps: selectedOption.patchOps,
      baseRevisionNumber: draft.revisionNumber,
      createdFrom: { tab: "Graveyard", stage: "decision" },
      createdBy: { type: "system", source: "graveyard" },
      reason: `Graveyard decision: ${item.kind}`,
    });

    return { ok: true, applied: result };
  },
});
