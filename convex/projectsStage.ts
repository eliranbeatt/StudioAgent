import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const getStageSignals = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const hasAnyElements = !!(await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first());

    const hasDraftElements = false; // Draft mode removed

    const hasApprovedForQuoteElements = !!(await ctx.db
      .query("elements")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "approvedForQuote")
      )
      .first());

    const hasQuoteVersions = !!(await ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first());

    const hasActiveBaseline = !!project.activeBudgetBaselineId;

    const hasTasks = !!(await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first());

    return {
      hasAnyElements,
      hasDraftElements,
      hasApprovedForQuoteElements,
      hasQuoteVersions,
      hasActiveBaseline,
      hasTasks,
      currentStage: project.stage,
    };
  },
});

export const resolveStage = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    // We duplicate signal gathering here for atomicity within the query or re-use logic if extracted
    // For query performance, we do the checks:
    const hasAnyElements = !!(await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first());

    const hasTasks = !!(await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first());
      
    const hasActiveBaseline = !!project.activeBudgetBaselineId;

    // Logic
    let computedStage: "IDEATION" | "QUOTE" | "BREAKDOWN" = "IDEATION";
    let reasonHe = "No elements created yet.";

    if (hasAnyElements) {
      computedStage = "QUOTE";
      reasonHe = "Elements exist. Quoting phase.";
    }

    if (hasTasks || hasActiveBaseline) {
      computedStage = "BREAKDOWN";
      reasonHe = hasActiveBaseline
        ? "Budget baseline approved. Execution phase."
        : "Tasks created. Execution phase.";
    }

    // Monotonic enforcement: verify against current project.stage
    // Ordering: IDEATION < QUOTE < BREAKDOWN
    const order = { IDEATION: 0, QUOTE: 1, BREAKDOWN: 2 };
    const currentStage = project.stage ?? "IDEATION";
    
    // If computed stage is "behind" current stage, stick to current stage
    if (order[computedStage] < order[currentStage]) {
      return {
        stage: currentStage,
        signals: { hasAnyElements, hasTasks, hasActiveBaseline },
        reasonHe: `Maintained at ${currentStage} (history)`,
      };
    }

    return {
      stage: computedStage,
      signals: { hasAnyElements, hasTasks, hasActiveBaseline },
      reasonHe,
    };
  },
});

export const recomputeStage = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return;

    // 1. Gather signals
    const hasAnyElements = !!(await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first());

    const hasTasks = !!(await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first());
      
    const hasActiveBaseline = !!project.activeBudgetBaselineId;

    // 2. Compute stage
    let computedStage: "IDEATION" | "QUOTE" | "BREAKDOWN" = "IDEATION";

    if (hasAnyElements) {
      computedStage = "QUOTE";
    }

    if (hasTasks || hasActiveBaseline) {
      computedStage = "BREAKDOWN";
    }

    // 3. Monotonic check
    const order = { IDEATION: 0, QUOTE: 1, BREAKDOWN: 2 };
    const currentStage = project.stage ?? "IDEATION";
    
    if (order[computedStage] <= order[currentStage]) {
      // No advance needed
      return;
    }

    // 4. Update
    await ctx.db.patch(args.projectId, {
      stage: computedStage,
      updatedAt: Date.now(),
    });
  },
});
