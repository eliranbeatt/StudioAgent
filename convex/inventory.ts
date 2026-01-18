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

export const listInventoryItems = query({
  handler: async (ctx) => {
    return await ctx.db.query("inventoryItems").order("desc").collect();
  },
});

export const createInventoryItem = mutation({
  args: {
    name: v.string(),
    templateId: v.optional(v.id("materialTemplates")),
    variantId: v.optional(v.id("materialVariants")),
    uomCode: v.union(
      v.literal("ea"),
      v.literal("sheet"),
      v.literal("m"),
      v.literal("m2"),
      v.literal("sqm"),
      v.literal("m3"),
      v.literal("kg"),
      v.literal("l"),
      v.literal("set"),
      v.literal("box"),
      v.literal("roll"),
      v.literal("pack"),
      v.literal("job"),
      v.literal("hour")
    ),
    initialQty: v.number(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("inventoryItems", {
      name: args.name,
      templateId: args.templateId,
      variantId: args.variantId,
      uomCode: args.uomCode,
      onHandQty: args.initialQty,
      location: args.location,
      notes: args.notes,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateInventoryStock = mutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    newQty: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.inventoryItemId, {
      onHandQty: args.newQty,
      updatedAt: Date.now(),
    });
  },
});
