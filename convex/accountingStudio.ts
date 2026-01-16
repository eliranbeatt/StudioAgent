import { query } from "./_generated/server";
import { v } from "convex/values";

export const getGlobalSummary = query({
  args: {
    projectStatus: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    customerId: v.optional(v.id("customers")),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("projects");
    if (args.projectStatus) {
      q = q.withIndex("by_status", (q) => q.eq("status", args.projectStatus!));
    }
    
    let projects = await q.collect();

    if (args.customerId) {
      projects = projects.filter(p => p.customerId === args.customerId);
    }
    // Default to active if not specified? Spec doesn't strictly say, but usually yes. 
    // If projectStatus is optional, maybe return all? Let's return all if not specified.

    const summaryData = await Promise.all(projects.map(async (p) => {
      // Fetch lines
      // We could use accountingLines if that's the master, but spec said materialLines + workLines.
      const materials = await ctx.db
        .query("materialLines")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();
        
      const labor = await ctx.db
        .query("workLines")
        .withIndex("by_project", (q) => q.eq("projectId", p._id))
        .collect();

      const materialsTotal = materials.reduce((sum, line) => sum + (line.plannedTotalCost ?? 0), 0);
      const laborTotal = labor.reduce((sum, line) => sum + (line.plannedTotalCost ?? 0), 0);

      const defaults = p.defaults || p.pricingDefaults || { profitPct: 0.3, overheadPct: 0.15, riskPct: 0.1 };
      
      const directCost = materialsTotal + laborTotal;
      const overhead = directCost * (defaults.overheadPct ?? 0);
      const risk = directCost * (defaults.riskPct ?? 0);
      const subTotal = directCost + overhead + risk;
      const profit = subTotal * (defaults.profitPct ?? 0);
      const sellTotal = subTotal + profit;

      return {
        projectId: p._id,
        projectName: p.name,
        customerName: p.customerName,
        status: p.status,
        materialsTotal,
        laborTotal,
        directCost,
        overheadPct: defaults.overheadPct,
        riskPct: defaults.riskPct,
        profitPct: defaults.profitPct,
        sellTotal,
      };
    }));

    // Calculate Global Totals
    const global = {
      plannedMaterialsTotal: 0,
      plannedLaborTotal: 0,
      plannedCostTotal: 0,
      sellTotal: 0,
    };

    for (const row of summaryData) {
      global.plannedMaterialsTotal += row.materialsTotal;
      global.plannedLaborTotal += row.laborTotal;
      global.plannedCostTotal += row.directCost; // Or subTotal? Spec says "plannedCostTotal". Usually means direct cost or cost basis. Let's use directCost.
      global.sellTotal += row.sellTotal;
    }

    return {
      global,
      projects: summaryData.sort((a, b) => b.sellTotal - a.sellTotal),
    };
  },
});
