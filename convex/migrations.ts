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
