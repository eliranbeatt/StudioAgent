import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Helper to apply JSON Patch ops (simplified)
function applyPatch(snapshot: any, ops: any[]) {
  const newSnapshot = JSON.parse(JSON.stringify(snapshot));
  
  for (const op of ops) {
    const pathParts = op.path.split("/").filter(Boolean);
    let current = newSnapshot;
    
    // Very basic patch implementation
    // In production, use fast-json-patch or similar
    if (op.op === "replace" || op.op === "add") { // simplified add as replace for prototype
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) current[pathParts[i]] = {};
        current = current[pathParts[i]];
      }
      current[pathParts[pathParts.length - 1]] = op.value;
    } else if (op.op === "remove") {
         for (let i = 0; i < pathParts.length - 1; i++) {
            if (!current[pathParts[i]]) return newSnapshot; // path doesn't exist
            current = current[pathParts[i]];
         }
         if (Array.isArray(current)) {
            // This is tricky without index, assuming path ends in index or ID if object
            // For this prototype, we assume object-based collections (byId pattern)
            delete current[pathParts[pathParts.length - 1]];
         } else {
            delete current[pathParts[pathParts.length - 1]];
         }
    }
  }
  return newSnapshot;
}

export const applyChangeSet = mutation({
  args: {
    draftType: v.union(v.literal("element"), v.literal("projectCost")),
    draftId: v.string(), 
    projectId: v.id("projects"),
    patchOps: v.any(), 
    baseRevisionNumber: v.number(),
    reason: v.optional(v.string()),
    createdFrom: v.any(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch Draft
    // @ts-ignore
    const draft = await ctx.db.get(args.draftId as any);

    if (!draft) throw new Error("Draft not found");
    if (draft.revisionNumber !== args.baseRevisionNumber) {
        throw new Error("REVISION_CONFLICT");
    }

    // 2. Apply Patch
    const newSnapshot = applyPatch(draft.workingSnapshot, args.patchOps);

    // 3. Reconciliation Logic (The "Flag-First" Engine)
    const reconciliationResult: any = {
      safeFixOps: [],
      reviewRequired: [],
      blockers: [],
      warnings: [],
    };

    // RULE: Detect Orphaned Labor
    // Logic: Iterate all labor lines. If a line links to a task that doesn't exist in newSnapshot.tasks, flag it.
    const tasksMap = newSnapshot.tasks?.byId || {};
    const laborMap = newSnapshot.labor?.byId || {};
    const createdGraveyardItemIds: string[] = [];

    for (const [laborId, laborLine] of Object.entries(laborMap)) {
        // @ts-ignore
        const linkedTaskIds = laborLine.links?.taskIds || [];
        for (const taskId of linkedTaskIds) {
            if (!tasksMap[taskId]) {
                // ORPHAN DETECTED!
                // Instead of auto-deleting, we create a review item.
                
                const reviewItem = {
                    kind: "laborOrphanedDecision",
                    message: `Labor line '${(laborLine as any).role}' is linked to a deleted task.`,
                    options: [
                        {
                            id: "keepPlaceholder",
                            label: "Keep as Placeholder",
                            patchOps: [
                                { op: "replace", path: `/labor/byId/${laborId}/status`, value: "orphaned" }
                            ]
                        },
                        {
                            id: "removeLabor",
                            label: "Remove Cost",
                            patchOps: [
                                { op: "remove", path: `/labor/byId/${laborId}` }
                            ]
                        }
                    ]
                };
                reconciliationResult.reviewRequired.push(reviewItem);
            }
        }
    }

    // 4. Save ChangeSet
    const changeSetId = await ctx.db.insert("changeSets", {
      draftType: args.draftType,
      // @ts-ignore
      draftId: args.draftId,
      projectId: args.projectId,
      createdBy: { type: "user" }, 
      createdFrom: args.createdFrom,
      baseRevisionNumber: args.baseRevisionNumber,
      patchOps: args.patchOps,
      impactPreview: {}, 
      reconciliation: reconciliationResult,
      reason: args.reason,
      createdAt: Date.now(),
    });

    // 5. Create Graveyard Items in DB if needed
    for (const item of reconciliationResult.reviewRequired) {
        const gyId = await ctx.db.insert("graveyardItems", {
            projectId: args.projectId,
            draftType: args.draftType,
            draftId: args.draftId,
            changeSetId: changeSetId,
            status: "pending",
            kind: item.kind,
            message: item.message,
            options: item.options,
            createdAt: Date.now(),
        });
        createdGraveyardItemIds.push(gyId);
    }

    // 6. Update Draft (Optimistic Apply)
    // In a real system, we might NOT apply the orphan-causing deletion until resolved,
    // but the spec says "Flag-first", implying the deletion happens but the side-effect (orphan) is flagged.
    // However, if we delete the task, the link is broken. The labor line remains but points to nothing.
    // That is exactly what "orphaned" means. So we DO save the new snapshot.
    
    await ctx.db.patch(draft._id, {
      workingSnapshot: newSnapshot,
      revisionNumber: draft.revisionNumber + 1,
      updatedAt: Date.now(),
    });

    return {
      ok: true,
      changeSetId,
      newRevisionNumber: draft.revisionNumber + 1,
      acceptedPatchOps: args.patchOps,
      reconciliation: reconciliationResult,
      graveyard: { createdItemIds: createdGraveyardItemIds }
    };
  },
});