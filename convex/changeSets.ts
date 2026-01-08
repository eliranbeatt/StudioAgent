import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const createChangeSet = mutation({
  args: {
    projectId: v.id("projects"),
    stage: v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN")),
    ops: v.array(v.object({ kind: v.string(), payload: v.any() })),
    reason_he: v.optional(v.string()),
    base: v.optional(v.object({
      elements: v.optional(v.array(v.object({
        elementId: v.id("elements"),
        rev: v.number(),
      }))),
    })),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("changeSets", {
      projectId: args.projectId,
      stage: args.stage,
      status: "PROPOSED",
      ops: args.ops,
      reason_he: args.reason_he,
      base: args.base,
      createdAt: Date.now(),
    });
  },
});

export const discardChangeSet = mutation({
  args: { changeSetId: v.id("changeSets") },
  handler: async (ctx, args) => {
    const cs = await ctx.db.get(args.changeSetId);
    if (!cs) throw new Error("ChangeSet not found");
    if (cs.status !== "PROPOSED") throw new Error(`ChangeSet is ${cs.status}`);
    await ctx.db.patch(args.changeSetId, {
      status: "DISCARDED",
      discardedAt: Date.now(),
    });
  },
});

export const applyChangeSet = mutation({
  args: {
    changeSetId: v.id("changeSets"),
  },
  handler: async (ctx, args) => {
    const cs = await ctx.db.get(args.changeSetId);
    if (!cs) throw new Error("ChangeSet not found");
    if (cs.status !== "PROPOSED") throw new Error(`ChangeSet is ${cs.status}`);

    // 1. Conflict Check
    if (cs.base?.elements) {
      for (const check of cs.base.elements) {
        const el = await ctx.db.get(check.elementId);
        if (!el) throw new Error(`Element ${check.elementId} missing`);
        // If element doesn't have rev, treat as 0? Or 1?
        const currentRev = el.rev ?? 0;
        if (currentRev !== check.rev) {
          throw new Error(`Conflict: Element ${el.title} rev ${currentRev} != base ${check.rev}`);
        }
      }
    }

    const tempIdMap = new Map<string, Id<"elements"> | Id<"tasks">>();

    // Helper to resolve element references
    const resolveElementId = (ref: any): Id<"elements"> | undefined => {
      if (!ref) return undefined;
      if (ref.elementId) return ref.elementId;
      if (ref.tempId) return tempIdMap.get(ref.tempId) as Id<"elements">;
      return undefined;
    };

    // Pass 1: element.create
    for (const op of cs.ops) {
      if (op.kind === "element.create") {
        const { tempId, fields } = op.payload;
        const id = await ctx.db.insert("elements", {
          projectId: cs.projectId,
          title: fields.title_he || fields.title || "New Element",
          type: fields.type || "build",
          status: "drafting",
          rev: 1,
          hasUnapprovedChanges: true,
          tags: fields.tags || [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (tempId) tempIdMap.set(tempId, id);
      }
    }

    // Pass 2: element.update
    for (const op of cs.ops) {
      if (op.kind === "element.update") {
        const { elementId, fields } = op.payload;
        const el = await ctx.db.get(elementId);
        if (!el) throw new Error(`Element ${elementId} not found`);
        
        const updateFields: any = { ...fields };
        delete updateFields.elementId; // Ensure ID isn't patched
        
        await ctx.db.patch(elementId, {
          ...updateFields,
          rev: (el.rev ?? 0) + 1,
          hasUnapprovedChanges: true,
          updatedAt: Date.now(),
        });
      }
    }

    // Pass 3: task.create
    const pendingTaskDeps: Array<{ taskId: Id<"tasks">, deps: any[] }> = [];
    
    for (const op of cs.ops) {
      if (op.kind === "task.create") {
        const { tempId, elementRef, fields, dependsOn } = op.payload;
        const elementId = resolveElementId(elementRef);
        const taskId = await ctx.db.insert("tasks", {
          projectId: cs.projectId,
          elementId,
          title: fields.title_he || fields.title,
          description: fields.description,
          category: fields.category,
          status: fields.status || "pending",
          priority: fields.priority,
          startDate: fields.startDate,
          endDate: fields.endDate,
          estimatedMinutes: fields.estimatedMinutes ? Number(fields.estimatedMinutes) : undefined,
          assignee: fields.assignee,
          createdFromChangeSetId: cs._id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (tempId) tempIdMap.set(tempId, taskId);
        if (dependsOn && Array.isArray(dependsOn) && dependsOn.length > 0) {
            pendingTaskDeps.push({ taskId, deps: dependsOn });
        }
      }
    }

    // Pass 3b: Resolve Task Dependencies
    for (const item of pendingTaskDeps) {
        const resolvedDeps: string[] = [];
        for (const dep of item.deps) {
            if (dep.taskId) resolvedDeps.push(dep.taskId);
            else if (dep.tempId) {
                const real = tempIdMap.get(dep.tempId);
                if (real) resolvedDeps.push(real as string);
            }
        }
        if (resolvedDeps.length > 0) {
            await ctx.db.patch(item.taskId, { dependencies: resolvedDeps });
        }
    }

    // Pass 4: Accounting, Print, Purchase
    for (const op of cs.ops) {
      if (op.kind === "accountingLine.create") {
        const { elementRef, taskId, tempTaskId, fields } = op.payload;
        let finalTaskId = taskId;
        if (!finalTaskId && tempTaskId) {
            finalTaskId = tempIdMap.get(tempTaskId);
        }

        await ctx.db.insert("accountingLines", {
          projectId: cs.projectId,
          elementId: resolveElementId(elementRef),
          taskId: finalTaskId,
          type: fields.type || "other",
          title: fields.title_he || fields.title,
          total: Number(fields.total || 0),
          qty: fields.qty ? Number(fields.qty) : undefined,
          unitCost: fields.unitCost ? Number(fields.unitCost) : undefined,
          billable: fields.billable,
          createdFromChangeSetId: cs._id,
          createdAt: Date.now(),
        });
      }
      if (op.kind === "printPart.create") {
         const { elementRef, fields } = op.payload;
         const elId = resolveElementId(elementRef);
         if (!elId) throw new Error("PrintPart requires element");
         await ctx.db.insert("printParts", {
            projectId: cs.projectId,
            elementId: elId,
            label: fields.label_he || fields.label,
            substrate: fields.substrate,
            qty: Number(fields.qty || 1),
            size: fields.size,
            requiresProof: fields.requiresProof,
            createdFromChangeSetId: cs._id,
            createdAt: Date.now(),
         });
      }
      if (op.kind === "purchase.create") {
          const { fields, allocations, receiptFileIds } = op.payload;
          const purchaseId = await ctx.db.insert("purchases", {
              projectId: cs.projectId,
              vendorId: fields.vendorId, // Required?
              date: fields.date || Date.now(),
              currency: fields.currency || "NIS",
              totalAmount: Number(fields.total || 0),
              status: fields.status || "recorded",
              notes: fields.notes_he || fields.notes,
              lineItems: [], // Legacy field, might be empty if we use allocations?
              createdFromChangeSetId: cs._id,
              createdAt: Date.now(),
              updatedAt: Date.now(),
          });

          // Create receipts
          if (receiptFileIds && Array.isArray(receiptFileIds)) {
              for (const fileId of receiptFileIds) {
                  await ctx.db.insert("receipts", {
                      projectId: cs.projectId,
                      purchaseId,
                      fileId: fileId,
                      createdFromChangeSetId: cs._id,
                      createdAt: Date.now(),
                  });
              }
          }
          
          // Allocations -> AccountingLines linked to purchase?
          // The spec said "purchase.create" payload has "allocations".
          // Ideally we create accountingLines linked to this purchase?
          // But accountingLines table doesn't have purchaseId. 
          // We can assume they are just accountingLines.
          // Or maybe I missed a link.
          // For now, I will just respect the accountingLine.create op if used separately.
          // If allocations are implied to be accounting lines, I should create them.
          if (allocations && Array.isArray(allocations)) {
              for (const alloc of allocations) {
                  await ctx.db.insert("accountingLines", {
                      projectId: cs.projectId,
                      elementId: resolveElementId(alloc.elementRef),
                      type: "other", // Default
                      title: alloc.notes_he || "Purchase Allocation",
                      total: Number(alloc.amount || 0),
                      createdFromChangeSetId: cs._id,
                      createdAt: Date.now(),
                      // Link to purchase? Not in schema.
                  });
              }
          }
      }
    }

    // Finalize
    await ctx.db.patch(cs._id, {
      status: "APPLIED",
      appliedAt: Date.now(),
    });
  },
});
