import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

export const approveQuoteAsBaseline = mutation({
  args: {
    projectId: v.id("projects"),
    quoteId: v.id("quoteVersions"),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error("Quote not found");

    const approvedBreakdown = await computeApprovedBreakdown(ctx, quote);
    const plannedTotals = {
      ...(quote.totals ?? {}),
      directCost: quote.totals?.directCost ?? approvedBreakdown.total,
      materials: approvedBreakdown.materials,
      labor: approvedBreakdown.labor,
      total: approvedBreakdown.total,
      grandTotal:
        quote.totals?.grandTotal ??
        (quote.totals?.directCost ?? approvedBreakdown.total) +
          (quote.totals?.overhead ?? 0) +
          (quote.totals?.risk ?? 0) +
          (quote.totals?.profit ?? 0),
    };

    const baselineId = await ctx.db.insert("budgetBaselines", {
      projectId: args.projectId,
      quoteVersionId: args.quoteId,
      status: "approved",
      sourceElementVersionIds: quote.sourceElementVersionIds,
      sourceProjectCostVersionId: quote.sourceProjectCostVersionId,
      planned: {
        totals: plannedTotals,
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

    await ctx.scheduler.runAfter(0, api.projectsStage.recomputeStage, { projectId: args.projectId });

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
    const now = Date.now();
    const changeOrderId = await ctx.db.insert("changeOrders", {
      projectId: args.projectId,
      title: args.title,
      status: "approved",
      financials: {
        deltaDirectCost: args.deltaDirectCost,
        deltaSellPrice: args.deltaSellPrice,
      },
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const project = await ctx.db.get(args.projectId);
    if (project?.activeBudgetBaselineId) {
      await ctx.db.insert("budgetAdjustments", {
        projectId: args.projectId,
        baselineId: project.activeBudgetBaselineId,
        changeOrderId,
        delta: {
          deltaDirectCost: args.deltaDirectCost,
          deltaSellPrice: args.deltaSellPrice,
        },
        approvedAt: now,
        createdAt: now,
      });
    }

    return changeOrderId;
  },
});

export const approveChangeOrder = mutation({
  args: {
    changeOrderId: v.id("changeOrders"),
  },
  handler: async (ctx, args) => {
    const co = await ctx.db.get(args.changeOrderId);
    if (!co) throw new Error("CO not found");
    if (co.status === "approved") return { ok: true };
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

    let baselineTotals = { directCost: 0, grandTotal: 0, materials: 0, labor: 0, total: 0 };
    let coAdjustments = { directCost: 0, sellPrice: 0 };

    if (project.activeBudgetBaselineId) {
      const baseline = await ctx.db.get(project.activeBudgetBaselineId);
      if (baseline) {
        baselineTotals = {
          directCost: baseline.planned?.totals?.directCost ?? 0,
          grandTotal: baseline.planned?.totals?.grandTotal ?? 0,
          materials: baseline.planned?.totals?.materials ?? 0,
          labor: baseline.planned?.totals?.labor ?? 0,
          total: baseline.planned?.totals?.total ?? baseline.planned?.totals?.directCost ?? 0,
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
    return await buildAccountingView(ctx, args.projectId);
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
  const accounting = await buildAccountingView(ctx, projectId);
  const totals = accounting?.totals ?? { materials: 0, labor: 0, total: 0 };
  const projectCosts = accounting?.projectCosts?.totals ?? { materials: 0, labor: 0, total: 0 };

  return {
    elementDrafts: 0, // Legacy concept
    elementCosts: { materials: totals.materials, labor: totals.labor, subcontract: 0 },
    projectCosts: {
      materials: projectCosts.materials,
      labor: projectCosts.labor,
      subcontract: 0,
      directCost: projectCosts.total,
    },
    totals: {
      directCost: totals.total,
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

async function buildAccountingView(ctx: any, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) return null;

  const elements = await ctx.db
    .query("elements")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();

  const matLines = await ctx.db
    .query("materialLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();

  const workLines = await ctx.db
    .query("workLines")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .collect();

  const isSystemProjectCostElement = (el: any) => {
    const tags = new Set(el.tags ?? []);
    return tags.has("system") && tags.has("project-costs");
  };

  let totalMaterials = 0;
  let totalLabor = 0;
  let actualMaterials = 0;
  let actualLabor = 0;

  const elementViews = elements
    .filter((el: any) => !isSystemProjectCostElement(el))
    .map((el: any) => {
      const fromDB = extractFromDB(el._id, matLines, workLines);
      const materials = fromDB.materials;
      const labor = fromDB.labor;

      const elMatTotal = materials.reduce((s: number, x: any) => s + x.total, 0);
      const elLabTotal = labor.reduce((s: number, x: any) => s + x.total, 0);
      const elMatActual = materials.reduce(
        (s: number, x: any) => s + Number(x.actualTotal ?? 0),
        0
      );
      const elLabActual = labor.reduce(
        (s: number, x: any) => s + Number(x.actualTotal ?? 0),
        0
      );

      totalMaterials += elMatTotal;
      totalLabor += elLabTotal;
      actualMaterials += elMatActual;
      actualLabor += elLabActual;

      return {
        elementId: el._id,
        title: el.title,
        draftId: el._id, // Repurpose elementId as draftId for UI compatibility
        draftType: "element",
        revisionNumber: el.rev ?? 0,
        materials,
        labor,
        totals: {
          materials: elMatTotal,
          labor: elLabTotal,
          total: elMatTotal + elLabTotal,
          actualMaterials: elMatActual,
          actualLabor: elLabActual,
          actualTotal: elMatActual + elLabActual,
        },
      };
    });

  const fromDB_PC = extractFromDB(undefined, matLines, workLines);
  const pcMaterials = fromDB_PC.materials;
  const pcLabor = fromDB_PC.labor;

  const pcMatTotal = pcMaterials.reduce((s: number, x: any) => s + x.total, 0);
  const pcLabTotal = pcLabor.reduce((s: number, x: any) => s + x.total, 0);
  const pcMatActual = pcMaterials.reduce(
    (s: number, x: any) => s + Number(x.actualTotal ?? 0),
    0
  );
  const pcLabActual = pcLabor.reduce(
    (s: number, x: any) => s + Number(x.actualTotal ?? 0),
    0
  );

  totalMaterials += pcMatTotal;
  totalLabor += pcLabTotal;
  actualMaterials += pcMatActual;
  actualLabor += pcLabActual;

  const projectCosts = {
    draftId: project.projectCostContainerId ?? projectId,
    draftType: "projectCost",
    revisionNumber: 0, // Containers don't have rev yet
    materials: pcMaterials,
    labor: pcLabor,
    totals: {
      materials: pcMatTotal,
      labor: pcLabTotal,
      total: pcMatTotal + pcLabTotal,
      actualMaterials: pcMatActual,
      actualLabor: pcLabActual,
      actualTotal: pcMatActual + pcLabActual,
    },
  };

  return {
    totals: {
      materials: totalMaterials,
      labor: totalLabor,
      total: totalMaterials + totalLabor,
      actualMaterials,
      actualLabor,
      actualTotal: actualMaterials + actualLabor,
    },
    elements: elementViews,
    projectCosts,
  };
}

function extractFromSnapshot(
  snapshot: any,
  type: "materials" | "labor",
  actuals: Map<string, { total: number; qty: number }>
) {
  const map = snapshot?.[type]?.byId ?? {};
  return Object.values(map)
    .filter((item: any) => !item.deletedAt)
    .map((item: any, index: number) => ({
      id: item.id,
      name: item.name ?? item.role ?? "Untitled",
      title: item.name ?? item.role ?? "Untitled",
      role: item.role,
      qty: Number(item.qty ?? 0),
      unitCost: Number(item.unitCost ?? item.rate ?? 0),
      rate: Number(item.unitCost ?? item.rate ?? 0),
      total: Number(item.qty ?? 0) * Number(item.unitCost ?? item.rate ?? 0),
      order: Number.isFinite(item.order) ? item.order : index,
      actualQty: actuals.get(item.id)?.qty ?? item.actualQty,
      actualUnitCost:
        actuals.get(item.id)?.qty
          ? actuals.get(item.id)!.total / actuals.get(item.id)!.qty
          : item.actualUnitCost,
      actualRate:
        actuals.get(item.id)?.qty
          ? actuals.get(item.id)!.total / actuals.get(item.id)!.qty
          : item.actualRate,
      actualTotal:
        actuals.get(item.id)?.total ??
        (item.actualQty !== undefined &&
        (item.actualUnitCost !== undefined || item.actualRate !== undefined)
          ? Number(item.actualQty ?? 0) * Number(item.actualUnitCost ?? item.actualRate ?? 0)
          : undefined),
      taskIds: item.links?.taskIds ?? [],
    }))
    .sort((a: any, b: any) => Number(a.order ?? 0) - Number(b.order ?? 0));
}

function extractFromDB(
  elId: string | undefined,
  matLines: any[],
  workLines: any[]
) {
  const relevantMaterials = matLines
    .filter(
    (line) => line.elementId === elId && (!elId ? !line.elementId : true)
    )
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const relevantLabor = workLines
    .filter(
    (line) => line.elementId === elId && (!elId ? !line.elementId : true)
    )
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  const materials = relevantMaterials.map((line, index) => ({
    id: line._id,
    name: line.itemName ?? "Untitled Material",
    title: line.itemName ?? "Untitled Material",
    qty: line.quantity ?? 0,
    unitCost: line.plannedUnitCost ?? 0,
    total:
      line.plannedTotalCost ?? (line.quantity ?? 0) * (line.plannedUnitCost ?? 0),
    order: line.createdAt ?? index,
    actualTotal: line.actualTotalCost ?? undefined,
    taskIds: [],
  }));

  const labor = relevantLabor.map((line, index) => ({
    id: line._id,
    role: line.roleHe ?? "Untitled Role",
    title: line.roleHe ?? "Untitled Role",
    qty: line.plannedQuantity ?? 0,
    rate: line.plannedUnitCost ?? 0,
    total:
      line.plannedTotalCost ??
      (line.plannedQuantity ?? 0) * (line.plannedUnitCost ?? 0),
    order: line.createdAt ?? index,
    actualTotal: line.actualTotalCost ?? undefined,
    taskIds: [],
  }));

  return { materials, labor };
}

function computeSnapshotTotals(snapshot: any) {
  const mats = Object.values(snapshot?.materials?.byId ?? {}).filter((line: any) => !line.deletedAt);
  const labs = Object.values(snapshot?.labor?.byId ?? {}).filter((line: any) => !line.deletedAt);
  const materials: number = mats.reduce<number>(
    (sum: number, line: any) =>
      sum + Number(line.qty ?? 0) * Number(line.unitCost ?? line.rate ?? 0),
    0
  );
  const labor: number = labs.reduce<number>(
    (sum: number, line: any) =>
      sum + Number(line.qty ?? 0) * Number(line.rate ?? line.unitCost ?? 0),
    0
  );
  return { materials, labor, total: materials + labor };
}

async function computeApprovedBreakdown(ctx: any, quote: any) {
  let materials: number = 0;
  let labor: number = 0;

  const elementVersionIds = quote?.sourceElementVersionIds ?? [];
  for (const versionId of elementVersionIds) {
    const version = await ctx.db.get(versionId);
    if (!version?.snapshot) continue;
    const totals = computeSnapshotTotals(version.snapshot);
    materials += totals.materials;
    labor += totals.labor;
  }

  if (quote?.sourceProjectCostVersionId) {
    const projectCostVersion = await ctx.db.get(quote.sourceProjectCostVersionId);
    if (projectCostVersion?.snapshot) {
      const totals = computeSnapshotTotals(projectCostVersion.snapshot);
      materials += totals.materials;
      labor += totals.labor;
    }
  }

  return { materials, labor, total: materials + labor };
}
