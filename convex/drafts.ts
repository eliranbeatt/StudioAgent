import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { applyPatchOps, PatchOp } from "./patch";
import { runReconciliation } from "./reconciliation";
import { findExistingReservation, reserveStockInternal } from "./inventory_helpers";
import { query } from "./_generated/server";
import { captureSnapshotFromLive } from "./elements";

type DraftType = "element" | "projectCost";

type ApplyChangeSetArgs = {
  draftType: DraftType;
  draftId: string;
  projectId: any;
  patchOps: PatchOp[];
  baseRevisionNumber: number;
  reason?: string;
  createdFrom: any;
  createdBy?: any;
};

export async function applyChangeSetInternal(ctx: any, args: ApplyChangeSetArgs) {
  // @ts-ignore
  const draft = await ctx.db.get(args.draftId as any);

  if (!draft) throw new Error("Draft not found");
  if (draft.revisionNumber !== args.baseRevisionNumber) {
    throw new Error("REVISION_CONFLICT");
  }

  const { snapshot: patchedSnapshot } = applyPatchOps(draft.workingSnapshot, args.patchOps);

  const reconciliation = await runReconciliation(ctx, {
    draftType: args.draftType,
    draftId: args.draftId,
    projectId: args.projectId,
    revisionNumber: draft.revisionNumber + 1,
    snapshot: patchedSnapshot,
  });

  const { snapshot: reconciledSnapshot, appliedOps: serverAppliedSafeFixOps } = applyPatchOps(
    patchedSnapshot,
    reconciliation.safeFixes.autoApplyOps
  );

  const stageStr = (args.createdFrom?.stage ?? "IDEATION").toUpperCase();
  const stage = ["IDEATION", "QUOTE", "BREAKDOWN"].includes(stageStr) ? stageStr : "IDEATION";

  const changeSetId = await ctx.db.insert("changeSets", {
    projectId: args.projectId,
    stage: stage as "IDEATION" | "QUOTE" | "BREAKDOWN",
    status: "APPLIED",
    ops: [{
      kind: "draft.patch",
      payload: {
        draftType: args.draftType,
        draftId: args.draftId,
        patchOps: args.patchOps,
        baseRevisionNumber: args.baseRevisionNumber,
      }
    }],
    reason_he: args.reason,
    appliedAt: Date.now(),
    createdAt: Date.now(),
  });



  await ctx.db.patch(draft._id, {
    workingSnapshot: reconciledSnapshot,
    revisionNumber: draft.revisionNumber + 1,
    updatedAt: Date.now(),
  });

  await ensureStockReservations(ctx, args.projectId, reconciledSnapshot);

  return {
    ok: true,
    changeSetId,
    draftType: args.draftType,
    draftId: args.draftId,
    baseRevisionNumber: args.baseRevisionNumber,
    newRevisionNumber: draft.revisionNumber + 1,
    acceptedPatchOps: args.patchOps,
    serverAppliedSafeFixOps,
    reconciliation,

  };
}

async function ensureStockReservations(ctx: any, projectId: any, snapshot: any) {
  const materialsMap = snapshot?.materials?.byId ?? {};
  for (const [materialId, materialLine] of Object.entries<any>(materialsMap)) {
    const procurement = materialLine?.procurement ?? {};
    if (procurement.mode !== "stock" || procurement.reserve !== true) {
      continue;
    }

    const inventoryItemId = procurement.inventoryItemId;
    if (!inventoryItemId) {
      continue;
    }

    const existingReservation = await findExistingReservation(ctx, {
      projectId,
      inventoryItemId,
      materialLineId: materialId,
    });
    if (existingReservation) {
      continue;
    }

    const qty = Number(materialLine?.qty ?? 0);
    if (qty <= 0) {
      continue;
    }

    const result = await reserveStockInternal(
      ctx,
      {
        projectId,
        inventoryItemId,
        elementId: materialLine?.elementId,
        materialLineId: materialId,
        qty,
      },
      { allowOverbook: false }
    );

    if (!result.reserved) {
      continue;
    }
  }
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

    if (element.currentDraftId) {
      const draft = await ctx.db.get(element.currentDraftId);
      if (draft && (draft.status === "open" || draft.status === "needsReview")) {
        return { draftId: draft._id, revisionNumber: draft.revisionNumber };
      }
    }

    const snapshot = await captureSnapshotFromLive(ctx, element._id);
    const schemaVersion = 1;

    const now = Date.now();
    const draftId = await ctx.db.insert("elementDrafts", {
      elementId: element._id,
      projectId: args.projectId,
      status: "open",
      revisionNumber: 1,
      createdFrom: { tab: "Accounting", stage: "planning" },
      workingSnapshot: snapshot,
      schemaVersion,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(element._id, {
      currentDraftId: draftId,
      status: "drafting",
      updatedAt: now,
    });

    return { draftId, revisionNumber: 1 };
  },
});

export const listOpenDrafts = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const drafts = await ctx.db
      .query("elementDrafts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "open"), q.eq(q.field("status"), "needsReview"))
      )
      .collect();

    const results: Array<{
      draftType: "element" | "projectCost";
      draftId: string;
      elementId?: string;
      title: string;
      revisionNumber: number;
    }> = [];

    for (const draft of drafts) {
      const element = await ctx.db.get(draft.elementId);
      results.push({
        draftType: "element",
        draftId: draft._id,
        elementId: draft.elementId,
        title: element?.title ?? "Untitled Element",
        revisionNumber: draft.revisionNumber,
      });
    }

    const project = await ctx.db.get(args.projectId);
    if (project?.projectCostContainerId) {
      const container = await ctx.db.get(project.projectCostContainerId);
      if (container?.currentDraftId) {
        const pcDraft = await ctx.db.get(container.currentDraftId);
        if (pcDraft && (pcDraft.status === "open" || pcDraft.status === "needsReview")) {
          results.push({
            draftType: "projectCost",
            draftId: pcDraft._id,
            title: "Project Level Costs",
            revisionNumber: pcDraft.revisionNumber,
          });
        }
      }
    }

    return results;
  },
});
