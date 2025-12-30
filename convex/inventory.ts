import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const reserveStock = mutation({
  args: {
    projectId: v.id("projects"),
    inventoryItemId: v.id("inventoryItems"),
    elementId: v.optional(v.id("elements")),
    materialLineId: v.optional(v.string()),
    qty: v.number(),
  },
  handler: async (ctx, args) => {
    // 1. Check availability
    const item = await ctx.db.get(args.inventoryItemId);
    if (!item) throw new Error("Inventory item not found");

    const existingReservations = await ctx.db
      .query("inventoryReservations")
      .withIndex("by_item", (q) => q.eq("inventoryItemId", args.inventoryItemId))
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .collect();

    const totalReserved = existingReservations.reduce((sum, res) => sum + res.qty, 0);
    const available = item.onHandQty - totalReserved;

    let status: "active" | "overbooked" = "active";
    if (args.qty > available) {
      status = "overbooked";
    }

    // 2. Create Reservation
    const resId = await ctx.db.insert("inventoryReservations", {
      projectId: args.projectId,
      inventoryItemId: args.inventoryItemId,
      elementId: args.elementId,
      materialLineId: args.materialLineId,
      qty: args.qty,
      status,
      computedAvailableAfter: available - args.qty,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { resId, status, availableAfter: available - args.qty };
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
