import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateQuote = mutation({
  args: {
    projectId: v.id("projects"),
    elementVersionIds: v.array(v.id("elementVersions")),
    projectCostVersionId: v.optional(v.id("projectCostVersions")),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    let totalDirectCost = 0;
    const sections: any[] = [];

    // 1. Aggregate Elements
    for (const evId of args.elementVersionIds) {
      const version = await ctx.db.get(evId);
      if (version) {
        // Simple aggregation logic from snapshot
        const snapshot = version.snapshot;
        const mats = Object.values(snapshot.materials?.byId || {});
        const labs = Object.values(snapshot.labor?.byId || {});

        const elementDirectCost = 
            mats.reduce((sum: number, m: any) => sum + (m.qty * m.unitCost), 0) +
            labs.reduce((sum: number, l: any) => sum + (l.qty * l.rate), 0);

        totalDirectCost += elementDirectCost;
        
        sections.push({
          title: snapshot.title || "Untitled Element",
          directCost: elementDirectCost,
          versionId: evId,
        });
      }
    }

    // 2. Apply Project Margins
    const overhead = totalDirectCost * project.defaults.overheadPct;
    const risk = totalDirectCost * project.defaults.riskPct;
    const profit = (totalDirectCost + overhead + risk) * project.defaults.profitPct;
    const grandTotal = totalDirectCost + overhead + risk + profit;

    // 3. Save Quote
    const quoteId = await ctx.db.insert("quoteVersions", {
      projectId: args.projectId,
      status: "generated",
      sourceElementVersionIds: args.elementVersionIds,
      sourceProjectCostVersionId: args.projectCostVersionId,
      language: "he",
      sections: { items: sections },
      totals: {
        directCost: totalDirectCost,
        overhead,
        risk,
        profit,
        grandTotal,
      },
      createdAt: Date.now(),
    });

    return quoteId;
  },
});

export const listQuotes = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});
