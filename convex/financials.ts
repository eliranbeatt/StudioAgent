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

    // 1. Create Baseline
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

    // 2. Update Project with active baseline
    await ctx.db.patch(args.projectId, {
      activeBudgetBaselineId: baselineId,
    });

    // 3. Mark quote as approved
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

    // 1. Mark CO as approved
    await ctx.db.patch(args.changeOrderId, {
      status: "approved",
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Create Budget Adjustment Ledger entry
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

        return {
            baseline: baselineTotals,
            approvedCO: coAdjustments,
            effectiveBudget: {
                directCost: baselineTotals.directCost + coAdjustments.directCost,
                sellPrice: baselineTotals.grandTotal + coAdjustments.sellPrice
            }
        }
    }
})

export const getDraftCostBreakdown = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args.projectId);
        if (!project) return null;

        const elementDrafts = await ctx.db
            .query("elementDrafts")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .filter((q) =>
                q.or(
                    q.eq(q.field("status"), "open"),
                    q.eq(q.field("status"), "needsReview")
                )
            )
            .collect();

        const elementCosts = elementDrafts.reduce(
            (acc, draft) => {
                const snapshot = draft.workingSnapshot ?? {};
                const materials = Object.values<any>(snapshot.materials?.byId ?? {});
                const labor = Object.values<any>(snapshot.labor?.byId ?? {});
                const subcontract = Object.values<any>(snapshot.subcontract?.byId ?? {});

                for (const line of materials) {
                    if (line?.deletedAt) continue;
                    acc.materials += Number(line?.qty ?? 0) * Number(line?.unitCost ?? 0);
                }
                for (const line of labor) {
                    if (line?.deletedAt) continue;
                    acc.labor += Number(line?.qty ?? 0) * Number(line?.rate ?? 0);
                }
                for (const line of subcontract) {
                    if (line?.deletedAt) continue;
                    acc.subcontract += Number(line?.cost ?? 0);
                }
                return acc;
            },
            { materials: 0, labor: 0, subcontract: 0 }
        );

        const projectCostContainer = project.projectCostContainerId
            ? await ctx.db.get(project.projectCostContainerId)
            : null;

        let projectCostDraft = null;
        if (projectCostContainer?.currentDraftId) {
            projectCostDraft = await ctx.db.get(projectCostContainer.currentDraftId);
        }

        const projectCostSnapshot = projectCostDraft?.workingSnapshot ?? {};
        const projectMaterials = Object.values<any>(projectCostSnapshot.materials?.byId ?? {});
        const projectLabor = Object.values<any>(projectCostSnapshot.labor?.byId ?? {});
        const projectSubcontract = Object.values<any>(projectCostSnapshot.subcontract?.byId ?? {});

        const projectCosts = { materials: 0, labor: 0, subcontract: 0 };
        for (const line of projectMaterials) {
            if (line?.deletedAt) continue;
            projectCosts.materials += Number(line?.qty ?? 0) * Number(line?.unitCost ?? 0);
        }
        for (const line of projectLabor) {
            if (line?.deletedAt) continue;
            projectCosts.labor += Number(line?.qty ?? 0) * Number(line?.rate ?? 0);
        }
        for (const line of projectSubcontract) {
            if (line?.deletedAt) continue;
            projectCosts.subcontract += Number(line?.cost ?? 0);
        }

        const elementDirect =
            elementCosts.materials + elementCosts.labor + elementCosts.subcontract;
        const projectDirect =
            projectCosts.materials + projectCosts.labor + projectCosts.subcontract;

        return {
            elementDrafts: elementDrafts.length,
            elementCosts: {
                materials: elementCosts.materials,
                labor: elementCosts.labor,
                subcontract: elementCosts.subcontract,
                directCost: elementDirect,
            },
            projectCosts: {
                materials: projectCosts.materials,
                labor: projectCosts.labor,
                subcontract: projectCosts.subcontract,
                directCost: projectDirect,
            },
            totals: {
                directCost: elementDirect + projectDirect,
            },
        };
    },
});
