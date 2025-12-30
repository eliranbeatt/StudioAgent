import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    clientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("projects", {
      name: args.name,
      clientName: args.clientName,
      status: "active",
      currency: "NIS",
      defaults: {
        profitPct: 0.3,
        overheadPct: 0.15,
        riskPct: 0.1,
        excludeManagementLaborFromCost: true,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").collect();
  },
});

export const getStats = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    const pendingGraveyard = await ctx.db
      .query("graveyardItems")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.id).eq("status", "pending")
      )
      .collect();

    return {
      elementCount: elements.length,
      graveyardCount: pendingGraveyard.length,
    };
  },
});

