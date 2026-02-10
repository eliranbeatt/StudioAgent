import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeName, newBusinessId } from "./lib/normalize";
import { Id } from "./_generated/dataModel";
import { calculateCost } from "./lib/pricing";
import { api } from "./_generated/api";

export const backfillElementRevs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const elements = await ctx.db.query("elements").collect();
    let count = 0;
    for (const el of elements) {
      if (el.rev === undefined) {
        await ctx.db.patch(el._id, { rev: 1 });
        count++;
      }
    }
    return `Backfilled ${count} elements with rev=1`;
  },
});

export const migrateProjectsClientNameToCustomers = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const dry = !!dryRun;
    const projects = await ctx.db.query("projects").take(50000);
    let touched = 0;

    for (const project of projects) {
      const hasCustomer = (project as any).customerId || (project as any).customerName;
      const clientName = (project as any).clientName?.trim();
      if (hasCustomer || !clientName) continue;

      const normalized = normalizeName(clientName);
      let customer = await ctx.db
        .query("customers")
        .withIndex("by_nameNormalized", (q) => q.eq("nameNormalized", normalized))
        .first();

      let customerId = customer?._id;
      if (!customerId && !dry) {
        let businessId = "";
        for (let i = 0; i < 5; i += 1) {
          const candidate = newBusinessId("CUST");
          const clash = await ctx.db
            .query("customers")
            .withIndex("by_customerId", (q) => q.eq("customerId", candidate))
            .first();
          if (!clash) {
            businessId = candidate;
            break;
          }
        }
        if (!businessId) throw new Error("Failed to generate customerId");

        customerId = await ctx.db.insert("customers", {
          customerId: businessId,
          name: clientName,
          nameNormalized: normalized,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      if (!dry && customerId) {
        await ctx.db.patch(project._id, {
          customerId,
          customerName: clientName,
          updatedAt: Date.now(),
        });
      }

      touched += 1;
    }

    return {
      dryRun: dry,
      projectsProcessed: projects.length,
      projectsUpdated: touched,
    };
  },
});

export const migrateTasksAssigneeToEmployeeIds = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const dry = !!dryRun;
    const employees = await ctx.db.query("employees").take(10000);
    const map = new Map<string, Id<"employees">>();
    for (const employee of employees) {
      map.set(normalizeName(employee.displayName), employee._id);
    }

    const tasks = await ctx.db.query("tasks").take(50000);
    let updated = 0;

    for (const task of tasks) {
      const assignee = (task as any).assignee?.trim();
      const hasIds =
        Array.isArray((task as any).assigneeIds) &&
        (task as any).assigneeIds.length > 0;
      if (!assignee || hasIds) continue;

      const employeeId = map.get(normalizeName(assignee));
      if (!employeeId) continue;

      if (!dry) {
        await ctx.db.patch(task._id, {
          assigneeIds: [employeeId],
          updatedAt: Date.now(),
        });
      }
      updated += 1;
    }

    return {
      dryRun: dry,
      tasksProcessed: tasks.length,
      tasksUpdated: updated,
    };
  },
});

export const backfillQuoteVersionsCustomerFromProject = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const dry = !!dryRun;
    const quotes = await ctx.db.query("quoteVersions").take(50000);
    let updated = 0;

    for (const quote of quotes) {
      const already = (quote as any).customerId || (quote as any).customerName;
      if (already) continue;

      const project = await ctx.db.get(quote.projectId);
      if (!project) continue;

      const customerId = (project as any).customerId;
      const customerName = (project as any).customerName || (project as any).clientName;
      if (!customerId && !customerName) continue;

      if (!dry) {
        await ctx.db.patch(quote._id, { customerId, customerName });
      }
      updated += 1;
    }

    return {
      dryRun: dry,
      quotesProcessed: quotes.length,
      quotesUpdated: updated,
    };
  },
});

export const backfillTraceCosts = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const traces = await ctx.db.query("llmTraces").collect();
    let updated = 0;

    for (const trace of traces) {
      if (trace.cost !== undefined) continue;

      const inputTokens = trace.inputTokens || (trace.request?.usage?.prompt_tokens as number) || 0;
      const outputTokens = trace.outputTokens || (trace.response?.usage?.completion_tokens as number) || 0;

      // Attempt to extract cached tokens if recorded in usage
      const cached = (trace.response?.usage as any)?.prompt_tokens_details?.cached_tokens;

      const cost = calculateCost({
        model: trace.model,
        inputTokens,
        outputTokens,
        cachedInputTokens: typeof cached === 'number' ? cached : undefined
      });

      if (cost !== null && !dryRun) {
        await ctx.db.patch(trace._id, { cost });
        updated++;
      } else if (cost !== null && dryRun) {
        updated++;
      }
    }

    return {
      dryRun,
      totalTraces: traces.length,
      updated,
    };
  }
});

export const backfillFlowRunApprovalModes = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const dry = !!dryRun;
    const runs = await ctx.db.query("flowRuns").take(50000);
    let updated = 0;

    for (const run of runs) {
      const hasApprovalMode = (run as any).approvalMode !== undefined;
      const hasDefault = (run as any).approvalModeDefault !== undefined;
      const hasOverride = (run as any).approvalModeOverride !== undefined;

      if (hasApprovalMode && hasDefault && hasOverride) continue;

      const autoApprove = (run as any).toggles?.autoApprove;
      const derivedMode =
        autoApprove === true ? "auto" : autoApprove === false ? "manual" : "auto";

      if (!dry) {
        await ctx.db.patch(run._id, {
          approvalMode: hasApprovalMode ? (run as any).approvalMode : derivedMode,
          approvalModeDefault: hasDefault ? (run as any).approvalModeDefault : derivedMode,
          approvalModeOverride: hasOverride ? (run as any).approvalModeOverride : false,
          updatedAt: Date.now(),
        });
      }

      updated += 1;
    }

    return {
      dryRun: dry,
      runsProcessed: runs.length,
      runsUpdated: updated,
    };
  },
});

export const backfillFlowRunToggles = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const dry = !!dryRun;
    const runs = await ctx.db.query("flowRuns").take(50000);
    let updated = 0;

    for (const run of runs) {
      const toggles = (run as any).toggles ?? {};
      const nextToggles = {
        autoRun: typeof toggles.autoRun === 'boolean' ? toggles.autoRun : true,
        autoApprove: typeof toggles.autoApprove === 'boolean' ? toggles.autoApprove : true,
        useWebSearch: typeof toggles.useWebSearch === 'boolean' ? toggles.useWebSearch : false,
        planningMode: toggles.planningMode === 'combined' ? 'combined' : 'separated',
      };

      const changed =
        toggles.autoRun !== nextToggles.autoRun ||
        toggles.autoApprove !== nextToggles.autoApprove ||
        toggles.useWebSearch !== nextToggles.useWebSearch ||
        toggles.planningMode !== nextToggles.planningMode;

      if (!changed) continue;

      if (!dry) {
        await ctx.db.patch(run._id, {
          toggles: nextToggles,
          updatedAt: Date.now(),
        });
      }

      updated += 1;
    }

    return {
      dryRun: dry,
      runsProcessed: runs.length,
      runsUpdated: updated,
    };
  },
});

export const seedCatalogDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const uoms = [
      { code: "ea", labelHe: "ea", baseDimension: "count", toBaseFactor: 1 },
      { code: "sheet", labelHe: "sheet", baseDimension: "count", toBaseFactor: 1 },
      { code: "set", labelHe: "set", baseDimension: "count", toBaseFactor: 1 },
      { code: "box", labelHe: "box", baseDimension: "count", toBaseFactor: 1 },
      { code: "roll", labelHe: "roll", baseDimension: "count", toBaseFactor: 1 },
      { code: "pack", labelHe: "pack", baseDimension: "count", toBaseFactor: 1 },
      { code: "job", labelHe: "job", baseDimension: "count", toBaseFactor: 1 },
      { code: "hour", labelHe: "hour", baseDimension: "count", toBaseFactor: 1 },
      { code: "m", labelHe: "m", baseDimension: "length", toBaseFactor: 1 },
      { code: "m2", labelHe: "m2", baseDimension: "area", toBaseFactor: 1 },
      { code: "sqm", labelHe: "sqm", baseDimension: "area", toBaseFactor: 1 },
      { code: "m3", labelHe: "m3", baseDimension: "volume", toBaseFactor: 1000 },
      { code: "l", labelHe: "l", baseDimension: "volume", toBaseFactor: 1 },
      { code: "kg", labelHe: "kg", baseDimension: "weight", toBaseFactor: 1 },
    ];

    let uomsCreated = 0;
    for (const uom of uoms) {
      const existing = await ctx.db
        .query("uoms")
        .withIndex("by_code", (q) => q.eq("code", uom.code as any))
        .first();
      if (existing) continue;
      await ctx.db.insert("uoms", {
        code: uom.code as any,
        labelHe: uom.labelHe,
        baseDimension: uom.baseDimension as any,
        toBaseFactor: uom.toBaseFactor,
        createdAt: now,
        updatedAt: now,
      });
      uomsCreated += 1;
    }

    const categories = [
      "Uncategorized",
      "Wood",
      "Prints",
      "Hardware",
      "Paint",
      "Plastic",
      "Metal",
      "Services",
    ];

    let categoriesCreated = 0;
    for (const name of categories) {
      const existing = await ctx.db
        .query("materialCategories")
        .filter((q) => q.eq(q.field("nameHe"), name))
        .first();
      if (existing) continue;
      await ctx.db.insert("materialCategories", {
        nameHe: name,
        createdAt: now,
        updatedAt: now,
      });
      categoriesCreated += 1;
    }

    return { uomsCreated, categoriesCreated };
  },
});

export const migrateMaterialLinesUomCode = internalMutation({
  args: {},
  handler: async (ctx) => {
    const lines = await ctx.db.query("materialLines").collect();
    let updated = 0;
    const normalizeUom = (value?: string | null) => {
      if (!value) return undefined;
      const v = value.toLowerCase().trim();
      if (v === "m2" || v === "sqm" || v === "m^2") return "m2";
      if (v === "m3" || v === "m^3") return "m3";
      if (v === "ea" || v === "each" || v === "units") return "ea";
      if (v === "sheet" || v === "sheets") return "sheet";
      if (v === "m" || v === "meter" || v === "meters") return "m";
      if (v === "kg" || v === "kgs") return "kg";
      if (v === "l" || v === "liter" || v === "liters") return "l";
      if (v === "set" || v === "sets") return "set";
      if (v === "box" || v === "boxes") return "box";
      if (v === "roll" || v === "rolls") return "roll";
      if (v === "pack" || v === "packs") return "pack";
      if (v === "job" || v === "jobs") return "job";
      if (v === "hour" || v === "hours" || v === "hr") return "hour";
      if (v === "can") return "ea";
      return undefined;
    };
    for (const line of lines) {
      const unitCode = (line as any).unitCode;
      const unitLabelHe = (line as any).unitLabelHe;
      const unit = (line as any).unit;
      if (!unitCode && !unitLabelHe && !unit) continue;
      await ctx.db.patch(line._id, {
        uomCode: normalizeUom(unitCode ?? unit) ?? (line as any).uomCode,
        unitCode: undefined,
        unitLabelHe: undefined,
        unit: undefined,
      } as any);
      updated += 1;
    }
    return { updated };
  },
});

export const flushAllDrafts = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    // 1. Fetch all elements with open/needsReview status drafts
    const elementDrafts = await ctx.db
      .query("elementDrafts")
      .filter((q: any) =>
        q.or(
          q.eq(q.field("status"), "open"),
          q.eq(q.field("status"), "needsReview")
        )
      )
      .collect();

    let processed = 0;
    let errors = 0;

    for (const draft of elementDrafts) {
      if ((draft as any).elementId) {
        try {
          if (!dryRun) {
            // We reuse the existing logic which merges draft snapshot to live tables
            // and marks draft as approved.
            await ctx.runMutation(api.elements.approveElementDraft, { elementId: (draft as any).elementId });
          }
          processed++;
        } catch (e: any) {
          console.error(`Failed to flush draft ${draft._id}: ${e.message}`);
          errors++;
        }
      }
    }

    return {
      dryRun,
      totalOpenDrafts: elementDrafts.length,
      processed,
      errors
    };
  },
});

export const promoteAllDraftsToLive = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const dry = !!dryRun;
    const now = Date.now();

    const elements = await ctx.db.query("elements").collect();
    let elementsUpdated = 0;
    for (const element of elements) {
      const needsStatus = element.status === "drafting";
      const hasDraftRef = !!(element as any).currentDraftId;
      if (!needsStatus && !hasDraftRef) continue;

      if (!dry) {
        await ctx.db.patch(element._id, {
          status: needsStatus ? "approvedForQuote" : element.status,
          currentDraftId: undefined,
          hasUnapprovedChanges: false,
          updatedAt: now,
        });
      }
      elementsUpdated += 1;
    }

    const tasks = await ctx.db.query("tasks").collect();
    let tasksUpdated = 0;
    for (const task of tasks) {
      const hasDraftFields =
        (task as any).isDraft ||
        (task as any).draftOfTaskId ||
        (task as any).draftRevisionId;
      if (!hasDraftFields) continue;
      if (!dry) {
        await ctx.db.patch(task._id, {
          isDraft: false,
          draftOfTaskId: undefined,
          draftRevisionId: undefined,
          updatedAt: now,
        });
      }
      tasksUpdated += 1;
    }

    const taskRevisions = await ctx.db.query("taskRevisions").collect();
    const elementDrafts = await ctx.db.query("elementDrafts").collect();

    if (!dry) {
      for (const revision of taskRevisions) {
        await ctx.db.delete(revision._id);
      }
      for (const draft of elementDrafts) {
        await ctx.db.delete(draft._id);
      }
    }

    return {
      dryRun: dry,
      elementsUpdated,
      tasksUpdated,
      taskRevisionsRemoved: taskRevisions.length,
      elementDraftsRemoved: elementDrafts.length,
    };
  },
});
