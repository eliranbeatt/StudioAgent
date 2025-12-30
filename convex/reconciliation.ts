import { PatchOp } from "./patch";
import { computeAvailability, findExistingReservation } from "./inventory_helpers";

type DraftType = "element" | "projectCost";

type MoneyImpact = {
  type: "laborRemoved" | "laborKeptPlaceholder" | "noChange";
  currency: string;
  amount: number;
  lineIds?: string[];
};

type ReviewOption = {
  id: string;
  label: string;
  description?: string;
  patchOps: PatchOp[];
  impactPreview?: { moneyImpacts?: MoneyImpact[] };
  flags?: {
    removesMoneyLines?: boolean;
    keepsPlaceholders?: boolean;
  };
};

type ReviewRequiredItem = {
  kind: string;
  message: string;
  refs?: Record<string, string>;
  options: ReviewOption[];
  impactPreview?: { moneyImpacts?: MoneyImpact[] };
  severity?: "warning";
  blocksApproval?: boolean;
};

type ReconciliationOutput = {
  version: 1;
  draftType: DraftType;
  draftId: string;
  projectId: string;
  evaluatedAt: string;
  evaluatedRevisionNumber: number;
  status: "clean" | "hasWarnings" | "needsReview" | "blocked";
  safeFixes: {
    autoApplyOps: PatchOp[];
    suggestedOps: PatchOp[];
    message?: string;
  };
  reviewRequired: ReviewRequiredItem[];
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; severity: "warning"; message: string; scope: "draft" }>;
  infos?: Array<{ code: string; severity: "info"; message: string; scope: "draft" }>;
  summary?: {
    orphanedLaborLineCount?: number;
  };
};

type ReconciliationInput = {
  draftType: DraftType;
  draftId: string;
  projectId: string;
  revisionNumber: number;
  snapshot: any;
};

function getLaborCost(line: any) {
  const qty = Number(line?.qty ?? 0);
  const rate = Number(line?.rate ?? 0);
  return qty * rate;
}

export async function runReconciliation(
  ctx: any,
  input: ReconciliationInput
): Promise<ReconciliationOutput> {
  const tasksMap = input.snapshot?.tasks?.byId ?? {};
  const laborMap = input.snapshot?.labor?.byId ?? {};
  const materialsMap = input.snapshot?.materials?.byId ?? {};

  const autoApplyOps: PatchOp[] = [];
  const reviewRequired: ReviewRequiredItem[] = [];
  const warnings: Array<{ code: string; severity: "warning"; message: string; scope: "draft" }> = [];

  let orphanedLaborLineCount = 0;

  for (const [laborId, laborLine] of Object.entries<any>(laborMap)) {
    const linkedTaskIds: string[] = laborLine?.links?.taskIds ?? [];
    const missingTaskIds = linkedTaskIds.filter((taskId) => !tasksMap[taskId]);
    if (missingTaskIds.length === 0) {
      continue;
    }

    orphanedLaborLineCount += 1;

    for (const taskId of missingTaskIds) {
      autoApplyOps.push({
        op: "unlink",
        path: `/labor/byId/${laborId}/links/taskIds`,
        value: {
          from: { kind: "laborLine", id: laborId },
          to: { kind: "task", id: taskId },
          rel: "line_linked_to_task",
        },
      });
    }

    const moneyImpact: MoneyImpact = {
      type: "laborRemoved",
      currency: "NIS",
      amount: getLaborCost(laborLine),
      lineIds: [laborId],
    };

    reviewRequired.push({
      kind: "laborOrphanedDecision",
      message: `Labor line "${laborLine?.role ?? laborId}" is linked to a deleted task.`,
      refs: { laborLineId: laborId },
      severity: "warning",
      options: [
        {
          id: "keepPlaceholder",
          label: "Keep as placeholder",
          patchOps: [
            { op: "replace", path: `/labor/byId/${laborId}/status`, value: "orphaned" },
            { op: "replace", path: `/labor/byId/${laborId}/needsReview`, value: true },
          ],
          impactPreview: {
            moneyImpacts: [
              { type: "laborKeptPlaceholder", currency: "NIS", amount: 0, lineIds: [laborId] },
            ],
          },
          flags: { keepsPlaceholders: true },
        },
        {
          id: "removeLabor",
          label: "Remove labor cost",
          patchOps: [
            { op: "tombstone", path: `/labor/byId/${laborId}`, value: { deletedAt: "now" } },
          ],
          impactPreview: { moneyImpacts: [moneyImpact] },
          flags: { removesMoneyLines: true },
        },
      ],
      impactPreview: { moneyImpacts: [moneyImpact] },
      blocksApproval: true,
    });
  }

  if (orphanedLaborLineCount > 0) {
    warnings.push({
      code: "ORPHANED_LABOR",
      severity: "warning",
      message: `${orphanedLaborLineCount} labor line(s) are linked to deleted tasks.`,
      scope: "draft",
    });
  }

  // Purchase task removed: decide procurement mode for linked materials.
  for (const [materialId, materialLine] of Object.entries<any>(materialsMap)) {
    const linkedTaskIds: string[] = materialLine?.links?.taskIds ?? [];
    const missingTaskIds = linkedTaskIds.filter((taskId) => !tasksMap[taskId]);
    if (missingTaskIds.length === 0) {
      continue;
    }

    for (const taskId of missingTaskIds) {
      autoApplyOps.push({
        op: "unlink",
        path: `/materials/byId/${materialId}/links/taskIds`,
        value: {
          from: { kind: "materialLine", id: materialId },
          to: { kind: "task", id: taskId },
          rel: "line_linked_to_task",
        },
      });
    }

    const procurementMode = materialLine?.procurement?.mode;
    const needPurchase = materialLine?.needPurchase === true;
    if (procurementMode !== "purchase" && !needPurchase) {
      continue;
    }

    reviewRequired.push({
      kind: "purchaseTaskDeletedDecision",
      message: `Purchase task was removed for "${materialLine?.name ?? materialId}". Choose procurement mode.`,
      refs: { materialLineId: materialId },
      severity: "warning",
      options: [
        {
          id: "switchToStock",
          label: "Switch to stock",
          patchOps: [
            { op: "replace", path: `/materials/byId/${materialId}/procurement/mode`, value: "stock" },
            { op: "replace", path: `/materials/byId/${materialId}/needPurchase`, value: false },
          ],
        },
        {
          id: "keepPurchase",
          label: "Keep as purchase (no task)",
          patchOps: [
            { op: "replace", path: `/materials/byId/${materialId}/procurement/mode`, value: "purchase" },
            { op: "replace", path: `/materials/byId/${materialId}/needPurchase`, value: true },
          ],
        },
      ],
      blocksApproval: true,
    });
  }

  // Inventory conflict detection for stock reservations.
  for (const [materialId, materialLine] of Object.entries<any>(materialsMap)) {
    const procurement = materialLine?.procurement ?? {};
    if (procurement.mode !== "stock" || procurement.reserve !== true) {
      continue;
    }

    const inventoryItemId = procurement.inventoryItemId;
    if (!inventoryItemId) {
      warnings.push({
        code: "MISSING_INVENTORY_ITEM",
        severity: "warning",
        message: `Stock reservation requested but no inventory item is linked for "${materialLine?.name ?? materialId}".`,
        scope: "draft",
      });
      continue;
    }

    const existingReservation = await findExistingReservation(ctx, {
      projectId: input.projectId,
      inventoryItemId,
      materialLineId: materialId,
    });
    if (existingReservation) {
      continue;
    }

    const qty = Number(materialLine?.qty ?? 0);
    const availability = await computeAvailability(ctx, inventoryItemId);
    if (qty > availability.available) {
      reviewRequired.push({
        kind: "inventoryOverbookDecision",
        message: `Not enough stock for "${materialLine?.name ?? materialId}". Choose how to proceed.`,
        refs: { materialLineId: materialId, inventoryItemId },
        severity: "warning",
        options: [
          {
            id: "switchToPurchase",
            label: "Switch to purchase",
            patchOps: [
              { op: "replace", path: `/materials/byId/${materialId}/procurement/mode`, value: "purchase" },
              { op: "replace", path: `/materials/byId/${materialId}/needPurchase`, value: true },
              { op: "replace", path: `/materials/byId/${materialId}/procurement/reserve`, value: false },
            ],
          },
          {
            id: "keepStockOverbook",
            label: "Keep stock (overbook)",
            patchOps: [
              { op: "replace", path: `/materials/byId/${materialId}/procurement/overbooked`, value: true },
            ],
          },
        ],
        blocksApproval: true,
      });
    }
  }

  let status: ReconciliationOutput["status"] = "clean";
  if (reviewRequired.length > 0) {
    status = "needsReview";
  } else if (warnings.length > 0) {
    status = "hasWarnings";
  }

  return {
    version: 1,
    draftType: input.draftType,
    draftId: input.draftId,
    projectId: input.projectId,
    evaluatedAt: new Date().toISOString(),
    evaluatedRevisionNumber: input.revisionNumber,
    status,
    safeFixes: {
      autoApplyOps,
      suggestedOps: [],
      message: autoApplyOps.length ? "Auto-unlinked deleted task references." : undefined,
    },
    reviewRequired,
    blockers: [],
    warnings,
    summary: {
      orphanedLaborLineCount,
    },
  };
}
