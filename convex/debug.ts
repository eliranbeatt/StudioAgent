import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { applyChangeSet } from "./drafts";
import { internal } from "./_generated/api";

// Helper to create initial draft state
const INITIAL_SNAPSHOT = {
    tasks: {
        byId: {
            "task_1": { id: "task_1", title: "Build Frame", domain: "construction" }
        }
    },
    labor: {
        byId: {
            "lab_1": { 
                id: "lab_1", 
                role: "Carpenter", 
                qty: 1, 
                rate: 800, 
                links: { taskIds: ["task_1"] } 
            }
        }
    },
    materials: { byId: {} },
    meta: { version: 1 }
};

export const seedSimulation = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Create Element
    const elementId = await ctx.db.insert("elements", {
        projectId: args.projectId,
        title: "Simulation Wall",
        type: "build",
        status: "drafting",
        tags: ["simulation"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    // 2. Create Draft
    const draftId = await ctx.db.insert("elementDrafts", {
        elementId,
        projectId: args.projectId,
        status: "open",
        revisionNumber: 1,
        createdFrom: { tab: "Studio", stage: "Debug" },
        workingSnapshot: INITIAL_SNAPSHOT,
        schemaVersion: 1,
        createdBy: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    await ctx.db.patch(elementId, { currentDraftId: draftId });
    await ctx.runMutation(internal.brain.createSectionForElementInternal, {
      projectId: args.projectId,
      elementId,
      title: "Simulation Wall",
    });

    return { draftId, elementId };
  },
});

export const deleteTaskWithOrphan = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Find the draft we just made (hacky: find last draft for project)
    const draft = await ctx.db
        .query("elementDrafts")
        .withIndex("by_project", q => q.eq("projectId", args.projectId))
        .order("desc")
        .first();

    if (!draft) throw new Error("No draft found to test on. Seed first.");

    // Call applyChangeSet logic manually or via internal import if possible.
    // Since we put logic in `drafts.ts` and exported it as mutation, we can't call it easily here 
    // without `ctx` trickery or refactoring.
    // For this prototype, I'll just COPY the `applyChangeSet` logic call pattern via `ctx.runMutation` 
    // if I were in a client, but here I am server side.
    // Actually, I can just reimplement the logic call locally or extract the handler.
    // But wait! `applyChangeSet` IS a mutation. 
    // Convex doesn't allow calling mutation from mutation easily unless defined as internal.
    
    // REFACTOR: I will assume `applyChangeSet` is available to be called if I move the logic to a helper function.
    // BUT for now, to save time and file edits, I will construct the patch and call the internal logic 
    // if I had separated it.
    
    // Instead, I will use a Client-side call in the page? No, I want this atomic.
    // I'll just duplicate the "make a changeset" logic here for the specific test case 
    // to guarantee the Graveyard item creation is tested.
    
    // ... Or better, I'll allow the UI to call `applyChangeSet` directly!
    // I'll update the `StudioAgentPage` to call `applyChangeSet` for the second button 
    // instead of this `deleteTaskWithOrphan` mutation. 
    // That proves the REAL API works.
    
    return { status: "Use client side call please" };
  },
});
