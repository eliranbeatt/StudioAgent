import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { applyPatchOps, PatchOp } from "./patch";
import { runReconciliation } from "./reconciliation";
import { 
  captureSnapshotFromLive, 
  syncSnapshotToLiveTables,
  captureProjectCostSnapshot,
  syncProjectCostSnapshotToLiveTables
} from "./elements";
import { internal } from "./_generated/api";

type DraftType = "element" | "projectCost";

type ApplyChangeSetArgs = {
  draftType: DraftType;
  draftId: string; // repurposed as elementId or containerId
  projectId: any;
  patchOps: PatchOp[];
  baseRevisionNumber: number;
  reason?: string;
  createdFrom: any;
  createdBy?: any;
};

export async function applyChangeSetInternal(ctx: any, args: ApplyChangeSetArgs) {
  const now = Date.now();
  let snapshot: any;
  let elementId: any = null;

  // 1. Identify Target & Capture Snapshot
  if (args.draftType === "element") {
    elementId = ctx.db.normalizeId("elements", args.draftId);
    if (!elementId) throw new Error("Invalid elementId");
    const element = await ctx.db.get(elementId);
    if (!element) throw new Error("Element not found");
    if (element.rev !== undefined && element.rev !== args.baseRevisionNumber && args.baseRevisionNumber !== 0) {
      throw new Error("REVISION_CONFLICT");
    }
    snapshot = await captureSnapshotFromLive(ctx, elementId);
  } else {
    snapshot = await captureProjectCostSnapshot(ctx, args.projectId);
  }

  // 2. Apply Patches
  const { snapshot: patchedSnapshot } = applyPatchOps(snapshot, args.patchOps);

  // 3. Reconcile
  const reconciliation = await runReconciliation(ctx, {
    draftType: args.draftType,
    draftId: args.draftId,
    projectId: args.projectId,
    revisionNumber: args.baseRevisionNumber + 1,
    snapshot: patchedSnapshot,
  });

  const { snapshot: reconciledSnapshot, appliedOps: serverAppliedSafeFixOps } = applyPatchOps(
    patchedSnapshot,
    reconciliation.safeFixes.autoApplyOps
  );

  // 4. Sync Back to Live
  if (args.draftType === "element") {
    await syncSnapshotToLiveTables(ctx, elementId, reconciledSnapshot);
    await ctx.db.patch(elementId, {
      rev: (snapshot.rev ?? 0) + 1,
      updatedAt: now,
    });
  } else {
    await syncProjectCostSnapshotToLiveTables(ctx, args.projectId, reconciledSnapshot);
  }

  // 5. Audit Record
  const stageStr = (args.createdFrom?.stage ?? "IDEATION").toUpperCase();
  const stage = ["IDEATION", "QUOTE", "BREAKDOWN"].includes(stageStr) ? stageStr : "IDEATION";

  const changeSetId = await ctx.db.insert("changeSets", {
    projectId: args.projectId,
    stage: stage as "IDEATION" | "QUOTE" | "BREAKDOWN",
    status: "APPLIED",
    ops: [{
      kind: "live.patch",
      payload: {
        draftType: args.draftType,
        targetId: args.draftId,
        patchOps: args.patchOps,
        baseRevisionNumber: args.baseRevisionNumber,
      }
    }],
    reason_he: args.reason,
    appliedAt: now,
    createdAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, { projectId: args.projectId });

  return {
    ok: true,
    changeSetId,
    draftType: args.draftType,
    draftId: args.draftId,
    baseRevisionNumber: args.baseRevisionNumber,
    newRevisionNumber: args.baseRevisionNumber + 1,
    acceptedPatchOps: args.patchOps,
    serverAppliedSafeFixOps,
    reconciliation,
  };
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
    createdBy: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await applyChangeSetInternal(ctx, {
      draftType: args.draftType,
      draftId: args.draftId,
      projectId: args.projectId,
      patchOps: args.patchOps,
      baseRevisionNumber: args.baseRevisionNumber,
      reason: args.reason,
      createdFrom: args.createdFrom,
      createdBy: args.createdBy,
    });
  },
});

export const ensureElementDraft = mutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.id("elements"),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found");
    return { draftId: element._id, revisionNumber: element.rev ?? 0 };
  },
});

export const listOpenDrafts = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // No-op: Drafts no longer exist
    return [];
  },
});

export const ensureProjectCostDraft = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    return { draftId: project.projectCostContainerId ?? args.projectId, revisionNumber: 0 };
  },
});
