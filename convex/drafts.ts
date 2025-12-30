import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { applyPatchOps, PatchOp } from "./patch";
import { runReconciliation } from "./reconciliation";
import { findExistingReservation, reserveStockInternal } from "./inventory_helpers";

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

  const changeSetId = await ctx.db.insert("changeSets", {
    draftType: args.draftType,
    // @ts-ignore
    draftId: args.draftId,
    projectId: args.projectId,
    createdBy: args.createdBy ?? { type: "user" },
    createdFrom: args.createdFrom,
    baseRevisionNumber: args.baseRevisionNumber,
    patchOps: args.patchOps,
    impactPreview: {},
    reconciliation,
    reason: args.reason,
    createdAt: Date.now(),
  });

  const createdGraveyardItemIds: string[] = [];
  for (const item of reconciliation.reviewRequired) {
    const gyId = await ctx.db.insert("graveyardItems", {
      projectId: args.projectId,
      draftType: args.draftType,
      draftId: args.draftId,
      changeSetId,
      status: "pending",
      kind: item.kind,
      message: item.message,
      options: item.options,
      createdAt: Date.now(),
    });
    createdGraveyardItemIds.push(gyId);
  }

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
    graveyard: { createdItemIds: createdGraveyardItemIds },
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
