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

export const updateProjectPricingDefaults = mutation({
  args: {
    projectId: v.id("projects"),
    riskPct: v.number(),
    overheadPct: v.number(),
    profitPct: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      defaults: {
        riskPct: args.riskPct,
        overheadPct: args.overheadPct,
        profitPct: args.profitPct,
        excludeManagementLaborFromCost: false, // Maintain existing strictness
      },
      // Also update legacy location if it exists, for consistency
      pricingDefaults: {
        riskPct: args.riskPct,
        overheadPct: args.overheadPct,
        profitPct: args.profitPct,
        excludeManagementLaborFromCost: false,
      },
    });
  },
});

export const getFinancialSummary = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    let baselineTotals = { directCost: 0, grandTotal: 0 };
    let coAdjustments = { directCost: 0, sellPrice: 0 };

    if (project.activeBudgetBaselineId) {
      const baseline = await ctx.db.get(project.activeBudgetBaselineId);
      if (baseline) {
        baselineTotals = {
          directCost: baseline.planned.totals.directCost,
          grandTotal: baseline.planned.totals.grandTotal
        };
      }

      const adjustments = await ctx.db
        .query("budgetAdjustments")
        .withIndex("by_baseline", q => q.eq("baselineId", project.activeBudgetBaselineId!))
        .collect();

      for (const adj of adjustments) {
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
      defaults: project.defaults,
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
    const project = await ctx.db.get(args.projectId);

    // 1. Fetch core entities
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // 2. Fetch committed accounting lines (fallback/reference)
    // We now prefer materialLines/workLines if available
    const matLines = await ctx.db
      .query("materialLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const workLines = await ctx.db
      .query("workLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // 3. Fetch all open drafts for this project
    const drafts = await ctx.db
      .query("elementDrafts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "open"), q.eq(q.field("status"), "needsReview"))
      )
      .collect();

    // Index drafts by elementId
    const draftByElement = new Map<string, typeof drafts[0]>();
    for (const d of drafts) {
      draftByElement.set(d.elementId, d);
    }

    // 4. Handle Project Cost Draft (Project Level Costs)
    let projectCostDraft: any = null;
    if (project?.projectCostContainerId) {
      const container = await ctx.db.get(project.projectCostContainerId);
      if (container?.currentDraftId) {
        projectCostDraft = await ctx.db.get(container.currentDraftId);
        // Ensure it's open
        if (projectCostDraft && !["open", "needsReview"].includes(projectCostDraft.status)) {
          projectCostDraft = null;
        }
      }
    }

    // Helper to process lines from snapshot or DB
    const extractFromSnapshot = (snapshot: any, type: "materials" | "labor") => {
      const map = snapshot?.[type]?.byId ?? {};
      return Object.values(map).map((item: any) => ({
        id: item.id,
        name: item.name ?? item.role ?? "Untitled", // Handle material name vs labor role
        title: item.name ?? item.role ?? "Untitled", // For compatibility
        role: item.role,
        qty: Number(item.qty ?? 0),
        unitCost: Number(item.unitCost ?? item.rate ?? 0),
        rate: Number(item.unitCost ?? item.rate ?? 0),
        total: Number(item.qty ?? 0) * Number(item.unitCost ?? item.rate ?? 0),
        actualQty: item.actualQty,
        actualUnitCost: item.actualUnitCost,
        actualRate: item.actualRate,
        taskIds: item.links?.taskIds ?? [],
      }));
    };

    const extractFromDB = (elId: string | undefined) => {
      const relevantMaterials = matLines.filter(l => l.elementId === elId && (!elId ? !l.elementId : true));
      const relevantLabor = workLines.filter(l => l.elementId === elId && (!elId ? !l.elementId : true));

      const materials = relevantMaterials.map(l => ({
        id: l._id,
        name: l.itemName ?? "Untitled Material",
        title: l.itemName ?? "Untitled Material",
        qty: l.quantity ?? 0,
        unitCost: l.plannedUnitCost ?? 0,
        total: l.plannedTotalCost ?? (l.quantity ?? 0) * (l.plannedUnitCost ?? 0),
        taskIds: [], 
      }));

      const labor = relevantLabor.map(l => ({
        id: l._id,
        role: l.roleHe ?? "Untitled Role",
        title: l.roleHe ?? "Untitled Role",
        qty: l.plannedQuantity ?? 0,
        rate: l.plannedUnitCost ?? 0,
        total: l.plannedTotalCost ?? (l.plannedQuantity ?? 0) * (l.plannedUnitCost ?? 0),
        taskIds: [],
      }));

      return { materials, labor };
    };

    let totalMaterials = 0;
    let totalLabor = 0;

    // Process Elements
    const elementViews = elements.map(el => {
      const draft = draftByElement.get(el._id);

      let materials, labor;
      let draftId, revisionNumber;

      if (draft) {
        materials = extractFromSnapshot(draft.workingSnapshot, "materials");
        labor = extractFromSnapshot(draft.workingSnapshot, "labor");
        draftId = draft._id;
        revisionNumber = draft.revisionNumber;
      } else {
        const fromDB = extractFromDB(el._id);
        materials = fromDB.materials;
        labor = fromDB.labor;
      }

      const elMatTotal = materials.reduce((s: number, x: any) => s + x.total, 0);
      const elLabTotal = labor.reduce((s: number, x: any) => s + x.total, 0);

      totalMaterials += elMatTotal;
      totalLabor += elLabTotal;

      return {
        elementId: el._id,
        title: el.title,
        draftId,
        revisionNumber,
        materials,
        labor,
        totals: {
          materials: elMatTotal,
          labor: elLabTotal,
          total: elMatTotal + elLabTotal
        }
      };
    });

    // Process Project Level Costs
    let pcMaterials, pcLabor, pcDraftId, pcRevisionNumber;
    if (projectCostDraft) {
      pcMaterials = extractFromSnapshot(projectCostDraft.workingSnapshot, "materials");
      pcLabor = extractFromSnapshot(projectCostDraft.workingSnapshot, "labor");
      pcDraftId = projectCostDraft._id;
      pcRevisionNumber = projectCostDraft.revisionNumber;
    } else {
      // Fallback to lines with no elementId
      const fromDB = extractFromDB(undefined);
      pcMaterials = fromDB.materials;
      pcLabor = fromDB.labor;
    }

    const pcMatTotal = pcMaterials.reduce((s: number, x: any) => s + x.total, 0);
    const pcLabTotal = pcLabor.reduce((s: number, x: any) => s + x.total, 0);

    totalMaterials += pcMatTotal;
    totalLabor += pcLabTotal;

    const projectCosts = {
      draftId: pcDraftId,
      revisionNumber: pcRevisionNumber,
      materials: pcMaterials,
      labor: pcLabor,
      totals: {
        materials: pcMatTotal,
        labor: pcLabTotal,
        total: pcMatTotal + pcLabTotal,
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

export const getAccountingSectionTotals = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const lines = await ctx.db
      .query("accountingLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const sectionsMap = new Map<string, { key: string; label: string; total: number }>();
    let total = 0;

    for (const line of lines) {
      const lineTotal = Number(line.total ?? 0);
      total += lineTotal;

      const key = line.sectionKey ?? line.sectionLabelHe ?? "general";
      const label = line.sectionLabelHe ?? line.sectionKey ?? "כללי";
      const entry = sectionsMap.get(key) ?? { key, label, total: 0 };
      entry.total += lineTotal;
      sectionsMap.set(key, entry);
    }

    return {
      total,
      sections: Array.from(sectionsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
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
  const profit = directCost * defaults.profitPct;
  const sellPrice = directCost + overhead + risk + profit;

  return {
    directCost,
    overhead,
    risk,
    profit,
    sellPrice,
  };
}
