import { mutation } from "./_generated/server";
import { v } from "convex/values";

// --- Material Lines ---

export const addMaterialLine = mutation({
    args: {
        projectId: v.id("projects"),
        elementId: v.optional(v.id("elements")),
        itemName: v.string(),
        quantity: v.number(),
        unitCost: v.number(),
        order: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const id = await ctx.db.insert("materialLines", {
            projectId: args.projectId,
            elementId: args.elementId,
            itemName: args.itemName,
            quantity: args.quantity,
            plannedUnitCost: args.unitCost,
            plannedTotalCost: args.quantity * args.unitCost,
            createdAt: args.order ?? now, // Use order as createdAt/sort key if provided, else now
            updatedAt: now,
        });
        return id;
    },
});

export const updateMaterialLine = mutation({
    args: {
        lineId: v.id("materialLines"),
        itemName: v.optional(v.string()),
        quantity: v.optional(v.number()),
        unitCost: v.optional(v.number()),
        order: v.optional(v.number()), // Repurposing createdAt for ordering if needed, or we might need a real order field later. 
        // Note: The existing logic uses createdAt for ordering.
        elementId: v.optional(v.union(v.id("elements"), v.null())),
    },
    handler: async (ctx, args) => {
        const line = await ctx.db.get(args.lineId);
        if (!line) throw new Error("Material line not found");

        const updates: any = { updatedAt: Date.now() };
        if (args.itemName !== undefined) updates.itemName = args.itemName;
        if (args.elementId !== undefined) updates.elementId = args.elementId === null ? undefined : args.elementId;

        // Recalculate total if qty or cost changes
        let newQty = line.quantity ?? 0;
        let newCost = line.plannedUnitCost ?? 0;
        let recalc = false;

        if (args.quantity !== undefined) {
            updates.quantity = args.quantity;
            newQty = args.quantity;
            recalc = true;
        }
        if (args.unitCost !== undefined) {
            updates.plannedUnitCost = args.unitCost;
            newCost = args.unitCost;
            recalc = true;
        }
        if (recalc) {
            updates.plannedTotalCost = newQty * newCost;
        }

        if (args.order !== undefined) {
            // If the app uses sort-by-createdAt, we might treat 'order' as updating createdAt 
            // OR we should have used a dedicated field. 
            // The existing code did: `order: line.createdAt ?? index`
            // So let's update createdAt to effect reorder, unless we want to introduce a real order field (which requires schema change).
            // For minimal impact now, let's update createdAt.
            updates.createdAt = args.order;
        }

        await ctx.db.patch(args.lineId, updates);
    },
});

export const deleteMaterialLine = mutation({
    args: { lineId: v.id("materialLines") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.lineId);
    },
});


// --- Labor Lines ---

export const addWorkLine = mutation({
    args: {
        projectId: v.id("projects"),
        elementId: v.optional(v.id("elements")),
        role: v.string(),
        quantity: v.number(),
        rate: v.number(),
        order: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const id = await ctx.db.insert("workLines", {
            projectId: args.projectId,
            elementId: args.elementId,
            roleHe: args.role,
            plannedQuantity: args.quantity,
            plannedUnitCost: args.rate,
            plannedTotalCost: args.quantity * args.rate,
            createdAt: args.order ?? now,
            updatedAt: now,
        });
        return id;
    },
});

export const updateWorkLine = mutation({
    args: {
        lineId: v.id("workLines"),
        role: v.optional(v.string()),
        quantity: v.optional(v.number()),
        rate: v.optional(v.number()),
        order: v.optional(v.number()),
        elementId: v.optional(v.union(v.id("elements"), v.null())),
    },
    handler: async (ctx, args) => {
        const line = await ctx.db.get(args.lineId);
        if (!line) throw new Error("Work line not found");

        const updates: any = { updatedAt: Date.now() };
        if (args.role !== undefined) updates.roleHe = args.role;
        if (args.elementId !== undefined) updates.elementId = args.elementId === null ? undefined : args.elementId;

        let newQty = line.plannedQuantity ?? 0;
        let newRate = line.plannedUnitCost ?? 0;
        let recalc = false;

        if (args.quantity !== undefined) {
            updates.plannedQuantity = args.quantity;
            newQty = args.quantity;
            recalc = true;
        }
        if (args.rate !== undefined) {
            updates.plannedUnitCost = args.rate;
            newRate = args.rate;
            recalc = true;
        }
        if (recalc) {
            updates.plannedTotalCost = newQty * newRate;
        }

        if (args.order !== undefined) {
            updates.createdAt = args.order;
        }

        await ctx.db.patch(args.lineId, updates);
    },
});

export const deleteWorkLine = mutation({
    args: { lineId: v.id("workLines") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.lineId);
    },
});
