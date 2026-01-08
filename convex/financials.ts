import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const approveQuoteAsBaseline = mutation({
  args: {
    projectId: v.id("projects"),
    quoteId: v.id("quoteVersions"),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Quote not found");

    const baselineId = await ctx.db.insert("budgetBaselines", {
      projectId: args.projectId,
      quoteVersionId: args.quoteId,
      status: "approved",
      sourceElementVersionIds: quote.sourceElementVersionIds,
      sourceProjectCostVersionId: quote.sourceProjectCostVersionId,
      planned: {
        totals: quote.totals,
      },
      approvedAt: Date.now(),
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.projectId, {
      activeBudgetBaselineId: baselineId,
    });

    await ctx.db.patch(args.quoteId, {
      status: "approved",
    });

    return baselineId;
  },
});

export const createChangeOrder = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    deltaDirectCost: v.number(),
    deltaSellPrice: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("changeOrders", {
      projectId: args.projectId,
      title: args.title,
      status: "draft",
      financials: {
        deltaDirectCost: args.deltaDirectCost,
        deltaSellPrice: args.deltaSellPrice,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const approveChangeOrder = mutation({
  args: {
    changeOrderId: v.id("changeOrders"),
  },
  handler: async (ctx, args) => {
    const co = await ctx.db.get(args.changeOrderId);
    if (!co) throw new Error("CO not found");
    if (co.status !== "draft") throw new Error("CO not in draft");

    const project = await ctx.db.get(co.projectId);
    if (!project?.activeBudgetBaselineId) throw new Error("No active baseline to adjust");

    await ctx.db.patch(args.changeOrderId, {
      status: "approved",
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("budgetAdjustments", {
      projectId: co.projectId,
      baselineId: project.activeBudgetBaselineId,
      changeOrderId: args.changeOrderId,
      delta: co.financials,
      approvedAt: Date.now(),
      createdAt: Date.now(),
    });

    return { ok: true };
  },
});

export const getFinancialSummary = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args.projectId);
        if(!project) return null;

        let baselineTotals = { directCost: 0, grandTotal: 0 };
        let coAdjustments = { directCost: 0, sellPrice: 0 };

        if(project.activeBudgetBaselineId) {
            const baseline = await ctx.db.get(project.activeBudgetBaselineId);
            if(baseline) {
                baselineTotals = {
                    directCost: baseline.planned.totals.directCost,
                    grandTotal: baseline.planned.totals.grandTotal
                };
            }

            const adjustments = await ctx.db
                .query("budgetAdjustments")
                .withIndex("by_baseline", q => q.eq("baselineId", project.activeBudgetBaselineId!))
                .collect();
            
            for(const adj of adjustments) {
                coAdjustments.directCost += adj.delta.deltaDirectCost;
                coAdjustments.sellPrice += adj.delta.deltaSellPrice;
            }
        }

        const draftBreakdown = await computeDraftCostBreakdown(ctx, args.projectId);
        const forecastDirect = draftBreakdown?.totals.directCost ?? 0;
        const forecast = applyMargins(forecastDirect, project.defaults);
        const effectiveBudget = {
            directCost: baselineTotals.directCost + coAdjustments.directCost,
            sellPrice: baselineTotals.grandTotal + coAdjustments.sellPrice,
        };

        const variance = {
            approvedCO: {
                directCost: coAdjustments.directCost,
                sellPrice: coAdjustments.sellPrice,
            },
            unapproved: {
                directCost: forecast.directCost - effectiveBudget.directCost,
                sellPrice: forecast.sellPrice - effectiveBudget.sellPrice,
            },
        };

        return {
            baseline: baselineTotals,
            approvedCO: coAdjustments,
            effectiveBudget,
            forecast,
            variance,
            breakdown: draftBreakdown,
        }
    }
})

export const getDraftCostBreakdown = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        return await computeDraftCostBreakdown(ctx, args.projectId);
    },
});

export const getAccountingView = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
      
    const lines = await ctx.db
      .query("accountingLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const linesByElement = new Map<string, typeof lines>();
    let totalMaterials = 0;
    let totalLabor = 0;

    const projectCostLines: typeof lines = [];

    for (const line of lines) {
        if (line.elementId) {
            const list = linesByElement.get(line.elementId) ?? [];
            list.push(line);
            linesByElement.set(line.elementId, list);
        } else {
            projectCostLines.push(line);
        }
        if (line.type === "material") totalMaterials += line.total;
        if (line.type === "labor") totalLabor += line.total;
    }

    const elementViews = elements.map(el => {
        const elLines = linesByElement.get(el._id) ?? [];
        const materials = elLines.filter(l => l.type === "material").map(l => ({
            id: l._id,
            name: l.title,
            qty: l.qty,
            unitCost: l.unitCost,
            total: l.total,
        }));
        const labor = elLines.filter(l => l.type === "labor").map(l => ({
            id: l._id,
            role: l.title,
            qty: l.qty,
            rate: l.unitCost,
            total: l.total,
        }));
        
        const elMatTotal = materials.reduce((s, x) => s + x.total, 0);
        const elLabTotal = labor.reduce((s, x) => s + x.total, 0);

        return {
            elementId: el._id,
            title: el.title,
            materials,
            labor,
            totals: {
                materials: elMatTotal,
                labor: elLabTotal,
                total: elMatTotal + elLabTotal
            }
        };
    });

    const projectCosts = {
        materials: projectCostLines.filter(l => l.type === "material").map(l => ({
            id: l._id,
            name: l.title,
            qty: l.qty,
            unitCost: l.unitCost,
            total: l.total,
        })),
        labor: projectCostLines.filter(l => l.type === "labor").map(l => ({
            id: l._id,
            role: l.title,
            qty: l.qty,
            rate: l.unitCost,
            total: l.total,
        })),
        totals: {
            materials: projectCostLines.filter(l => l.type === "material").reduce((s,x) => s + x.total, 0),
            labor: projectCostLines.filter(l => l.type === "labor").reduce((s,x) => s + x.total, 0),
            total: projectCostLines.reduce((s,x) => s + x.total, 0),
        }
    };

    return {
        totals: {
            materials: totalMaterials,
            labor: totalLabor,
            total: totalMaterials + totalLabor
        },
        elements: elementViews,
        projectCosts,
    };
  },
});

async function computeDraftCostBreakdown(ctx: any, projectId: any) {
    const lines = await ctx.db
        .query("accountingLines")
        .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
        .collect();

    const totals = lines.reduce(
        (acc: any, line: any) => {
            const cost = line.total ?? 0;
            if (line.type === "material") acc.materials += cost;
            else if (line.type === "labor") acc.labor += cost;
            else if (line.type === "subcontract") acc.subcontract += cost;
            return acc;
        },
        { materials: 0, labor: 0, subcontract: 0 }
    );

    const directCost = totals.materials + totals.labor + totals.subcontract;

    return {
        elementDrafts: 0, // Legacy concept
        elementCosts: totals, // Simplified: All costs are in accountingLines
        projectCosts: { materials: 0, labor: 0, subcontract: 0, directCost: 0 }, // If we distinguish project vs element costs later
        totals: {
            directCost,
        },
    };
}

function applyMargins(
    directCost: number,
    defaults: { overheadPct: number; riskPct: number; profitPct: number }
) {
    const overhead = directCost * defaults.overheadPct;
    const risk = directCost * defaults.riskPct;
    const profit = (directCost + overhead + risk) * defaults.profitPct;
    const sellPrice = directCost + overhead + risk + profit;
    return {
        directCost,
        overhead,
        risk,
        profit,
        sellPrice,
    };
}