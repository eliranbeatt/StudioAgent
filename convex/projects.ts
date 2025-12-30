import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    clientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const projectId = await ctx.db.insert("projects", {
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

    const containerId = await ctx.db.insert("projectCostContainers", {
      projectId,
      title: "Project Level Costs",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const initialProjectCostSnapshot = {
      title: "Project Level Costs",
      materials: { byId: {} },
      labor: { byId: {} },
      subcontract: { byId: {} },
      notes: [],
      meta: { version: 1 },
    };

    const draftId = await ctx.db.insert("projectCostDrafts", {
      containerId,
      projectId,
      status: "open",
      revisionNumber: 1,
      createdFrom: { tab: "System", stage: "bootstrap" },
      workingSnapshot: initialProjectCostSnapshot,
      schemaVersion: 1,
      createdBy: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(containerId, { currentDraftId: draftId });
    await ctx.db.patch(projectId, { projectCostContainerId: containerId });

    return projectId;
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

export const getOverview = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      return null;
    }

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

    const baseline = project.activeBudgetBaselineId
      ? await ctx.db.get(project.activeBudgetBaselineId)
      : null;

    const adjustments = project.activeBudgetBaselineId
      ? await ctx.db
          .query("budgetAdjustments")
          .withIndex("by_baseline", (q) =>
            q.eq("baselineId", project.activeBudgetBaselineId!)
          )
          .collect()
      : [];

    const approvedCO = adjustments.reduce(
      (acc, adj) => {
        acc.directCost += Number(adj.delta?.deltaDirectCost ?? 0);
        acc.sellPrice += Number(adj.delta?.deltaSellPrice ?? 0);
        return acc;
      },
      { directCost: 0, sellPrice: 0 }
    );

    const container = project.projectCostContainerId
      ? await ctx.db.get(project.projectCostContainerId)
      : null;

    return {
      project,
      elements: elements.map((el) => ({
        id: el._id,
        title: el.title,
        type: el.type,
        status: el.status,
        updatedAt: el.updatedAt,
      })),
      counts: {
        elementCount: elements.length,
        graveyardCount: pendingGraveyard.length,
      },
      baseline: baseline
        ? {
            id: baseline._id,
            totals: baseline.planned?.totals ?? { directCost: 0, grandTotal: 0 },
            approvedAt: baseline.approvedAt,
          }
        : null,
      approvedCO,
      projectCostContainer: container
        ? {
            id: container._id,
            currentDraftId: container.currentDraftId ?? null,
            currentApprovedVersionId: container.currentApprovedVersionId ?? null,
          }
        : null,
    };
  },
});
