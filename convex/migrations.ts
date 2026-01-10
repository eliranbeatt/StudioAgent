import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeName, newBusinessId } from "./lib/normalize";

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

export const migrateProjectsClientNameToCustomers = action({
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

export const migrateTasksAssigneeToEmployeeIds = action({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const dry = !!dryRun;
    const employees = await ctx.db.query("employees").take(10000);
    const map = new Map<string, string>();
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

export const backfillQuoteVersionsCustomerFromProject = action({
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
