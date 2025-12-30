import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { reserveStockInternal } from "./inventory_helpers";

export const reserveStock = mutation({
  args: {
    projectId: v.id("projects"),
    inventoryItemId: v.id("inventoryItems"),
    elementId: v.optional(v.id("elements")),
    materialLineId: v.optional(v.string()),
    qty: v.number(),
  },
  handler: async (ctx, args) => {
    return await reserveStockInternal(ctx, {
      projectId: args.projectId,
      inventoryItemId: args.inventoryItemId,
      elementId: args.elementId,
      materialLineId: args.materialLineId,
      qty: args.qty,
    });
  },
});

export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventoryReservations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});
