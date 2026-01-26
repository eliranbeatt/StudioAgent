
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const seedP0 = mutation({
    args: {},
    handler: async (ctx) => {
        // P0 Empty: new project with no elements/tasks/accounting.
        const projectId = await ctx.db.insert("projects", {
            name: "P0 Empty",
            status: "active",
            currency: "NIS",
            defaults: {
                profitPct: 20,
                overheadPct: 15,
                riskPct: 5,
                excludeManagementLaborFromCost: false,
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        return projectId;
    },
});

export const seedP1 = mutation({
    args: {},
    handler: async (ctx) => {
        // P1 Minimal: 1 element, 1 task, minimal accounting lines.
        const projectId = await ctx.db.insert("projects", {
            name: "P1 Minimal",
            status: "active",
            currency: "NIS",
            defaults: {
                profitPct: 20,
                overheadPct: 15,
                riskPct: 5,
                excludeManagementLaborFromCost: false,
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        const elementId = await ctx.db.insert("elements", {
            projectId,
            title: "Element 1",
            type: "build",
            status: "drafting",
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        const taskId = await ctx.db.insert("tasks", {
            projectId,
            elementId,
            title: "Task 1",
            status: "todo",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // Add a material line
        await ctx.db.insert("materialLines", {
            projectId,
            elementId,
            taskId,
            itemName: "Wood",
            quantity: 1,
            plannedUnitCost: 100,
            plannedTotalCost: 100,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        return projectId;
    },
});

export const seedP1_v2 = mutation({
    args: {},
    handler: async (ctx) => {
        return "debug_hello";
    }
});

export const clearAllTestProjects = mutation({
    args: {},
    handler: async (ctx) => {
        const projects = await ctx.db
            .query("projects")
            .filter((q) =>
                q.or(
                    q.eq(q.field("name"), "P0 Empty"),
                    q.eq(q.field("name"), "P1 Minimal")
                )
            )
            .collect();

        for (const p of projects) {
            await ctx.db.delete(p._id);
            // In a real scenario we would delete related records too, 
            // but for simple testing this might be enough if we just grep by name.
            // However, for cleanliness let's try to delete related.
            const elements = await ctx.db.query("elements").withIndex("by_project", q => q.eq("projectId", p._id)).collect();
            for (const e of elements) await ctx.db.delete(e._id);
            const tasks = await ctx.db.query("tasks").withIndex("by_project", q => q.eq("projectId", p._id)).collect();
            for (const t of tasks) await ctx.db.delete(t._id);
            const materials = await ctx.db.query("materialLines").withIndex("by_project", q => q.eq("projectId", p._id)).collect();
            for (const m of materials) await ctx.db.delete(m._id);
        }
        return projects.length;
    },
});

export const resetFlowRuns = mutation({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const runs = await ctx.db
            .query("flowRuns")
            .withIndex("by_project", q => q.eq("projectId", args.projectId))
            .collect();
        for (const run of runs) {
            await ctx.db.delete(run._id);
            // Optionally delete steps too if needed
            const steps = await ctx.db.query("flowSteps").withIndex("by_run", q => q.eq("flowRunId", run._id)).collect();
            for (const s of steps) await ctx.db.delete(s._id);
        }
    }
});

export const getFlowState = query({
    args: { flowRunId: v.id("flowRuns") },
    handler: async (ctx, args) => {
        const run = await ctx.db.get(args.flowRunId);
        if (!run) return null;

        const step = await ctx.db
            .query("flowSteps")
            .withIndex("by_run_gate", q => q.eq("flowRunId", args.flowRunId).eq("gateId", run.currentGateId))
            .first();

        return {
            run,
            step
        };
    }
});

export const getLatestSkillRun = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        const run = await ctx.db.query("skillRuns")
            .withIndex("by_project", q => q.eq("projectId", args.projectId))
            .order("desc")
            .first();
        return run;
    }
});

export const seedContext = mutation({
    args: { projectId: v.id("projects"), text: v.string() },
    handler: async (ctx, args) => {
        await ctx.db.insert("memoryDocs", {
            projectId: args.projectId,
            kind: "RUNNING_MEMORY",
            contentMd_he: args.text,
            autoAppendEnabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
    }
});
