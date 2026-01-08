import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

type ElementId = Id<"elements">;
type TaskId = Id<"tasks">;
type VendorId = Id<"vendors">;
type PurchaseId = Id<"purchases">;

type TempMap<T> = Map<string, T>;

const studioWorkTypes = new Set([
  "planning_production",
  "design_art_direction",
  "procurement_pickups",
  "vendor_management",
  "fabrication_metal",
  "fabrication_carpentry",
  "fabrication_foam",
  "fabrication_paint_finish",
  "fabrication_sewing_softgoods",
  "fabrication_assembly",
  "printing_graphics",
  "electrical_lighting",
  "rigging_hanging",
  "qa_safety",
  "packing_crating",
  "transport_logistics",
  "install_on_site",
  "teardown_returns",
  "accounting_admin",
]);

const taskStages = new Set([
  "clarification",
  "quote",
  "procurement",
  "build",
  "install",
  "teardown",
  "accounting",
]);

function normalizeWorkType(value?: string) {
  if (!value) return undefined;
  return studioWorkTypes.has(value) ? value : undefined;
}

function normalizeStage(value?: string) {
  if (!value) return undefined;
  return taskStages.has(value) ? value : undefined;
}

function normalizeChecklist(list: any) {
  if (!Array.isArray(list)) return undefined;
  return list
    .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
    .map((item, index) => ({
      id: String(item.id),
      title: String(item.title),
      description: item.description ? String(item.description) : undefined,
      workType: normalizeWorkType(item.workType),
      estimatedMinutes: Number.isFinite(item.estimatedMinutes)
        ? Number(item.estimatedMinutes)
        : undefined,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
      done: Boolean(item.done),
      dependsOnItemIds: Array.isArray(item.dependsOnItemIds)
        ? item.dependsOnItemIds.map((id: any) => String(id))
        : undefined,
    }));
}

function resolveFromTemp<T extends string>(
  value: string | undefined | null,
  tempMap: TempMap<T>
): T | null {
  if (!value) return null;
  if (tempMap.has(value)) return tempMap.get(value) ?? null;
  return value as T;
}

export const createChangeSet = mutation({
  args: {
    projectId: v.id("projects"),
    stage: v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN")),
    ops: v.array(v.object({ kind: v.string(), payload: v.any() })),
    reason_he: v.optional(v.string()),
    preview_he: v.optional(v.object({
      elements: v.optional(v.array(v.string())),
      tasks: v.optional(v.array(v.string())),
      accounting: v.optional(v.array(v.string())),
      printing: v.optional(v.array(v.string())),
      purchases: v.optional(v.array(v.string())),
    })),
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
      preview_he: args.preview_he,
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

export async function applyChangeSetInternalLogic(ctx: any, args: { changeSetId: Id<"changeSets"> }) {
  const cs = await ctx.db.get(args.changeSetId);
  if (!cs) throw new Error("ChangeSet not found");
  if (cs.status !== "PROPOSED") throw new Error(`ChangeSet is ${cs.status}`);

  if (cs.base?.elements) {
    for (const check of cs.base.elements) {
      const el = await ctx.db.get(check.elementId);
      if (!el) throw new Error(`Element ${check.elementId} missing`);
      const currentRev = el.rev ?? 0;
      if (currentRev !== check.rev) {
        console.warn(`Conflict ignored: Element ${el.title} rev ${currentRev} != base ${check.rev}`);
      }
    }
  }

  const elementTempMap: TempMap<ElementId> = new Map();
  const taskTempMap: TempMap<TaskId> = new Map();
  const vendorTempMap: TempMap<VendorId> = new Map();
  const purchaseTempMap: TempMap<PurchaseId> = new Map();
  const elementsToBump = new Set<string>();

  const resolveElementId = (ref: any): ElementId | null => {
    if (!ref) return null;
    if (typeof ref === "string") return resolveFromTemp(ref, elementTempMap);
    if (ref.elementId) return ref.elementId as ElementId;
    if (ref.tempId) return resolveFromTemp(ref.tempId, elementTempMap);
    return null;
  };

  const now = Date.now();

  for (const op of cs.ops) {
    if (op.kind !== "element.create") continue;
    const { tempId, element, draft } = op.payload ?? {};
    if (!element?.title) throw new Error("element.create requires element.title");

    const elementId = await ctx.db.insert("elements", {
      projectId: cs.projectId,
      title: element.title,
      type: element.type ?? "build",
      status: element.status ?? "drafting",
      tags: Array.isArray(element.tags) ? element.tags : [],
      rev: 1,
      hasUnapprovedChanges: true,
      createdAt: now,
      updatedAt: now,
    });

    const draftId = await ctx.db.insert("elementDrafts", {
      elementId,
      projectId: cs.projectId,
      status: draft?.status ?? "open",
      revisionNumber: 1,
      createdFrom: draft?.createdFrom ?? { tab: "agent", stage: cs.stage },
      workingSnapshot: draft?.workingSnapshot ?? {},
      schemaVersion: Number(draft?.schemaVersion ?? 1),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(elementId, { currentDraftId: draftId });

    if (tempId) elementTempMap.set(tempId, elementId);
    // Newly created elements start at rev 1, no need to bump.
  }

  for (const op of cs.ops) {
    if (op.kind !== "vendor.create") continue;
    const { tempId, fields } = op.payload ?? {};
    if (!fields?.name) throw new Error("vendor.create requires fields.name");

    let vendorId: VendorId;
    const existingVendor = await ctx.db.query("vendors")
      .withIndex("by_name", q => q.eq("name", fields.name))
      .first();

    if (existingVendor) {
      vendorId = existingVendor._id;
      await ctx.db.patch(vendorId, {
        type: fields.type ?? "general",
        phone: fields.phone,
        email: fields.email,
        address: fields.address,
        notes: fields.notes,
        active: fields.active ?? true,
        updatedAt: now,
      });
    } else {
      vendorId = await ctx.db.insert("vendors", {
        name: fields.name,
        type: fields.type ?? "general",
        phone: fields.phone,
        email: fields.email,
        address: fields.address,
        notes: fields.notes,
        active: fields.active ?? true,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (tempId) vendorTempMap.set(tempId, vendorId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "printPart.create") continue;
    const { elementTempOrId, elementId: directElementId, fields } = op.payload ?? {};
    const elementId = resolveElementId(elementTempOrId ?? directElementId);
    if (!elementId) throw new Error("printPart.create requires elementTempOrId or elementId");
    if (!fields?.label) throw new Error("printPart.create requires fields.label");

    const existing = await ctx.db.query("printParts")
      .withIndex("by_element", q => q.eq("elementId", elementId))
      .filter(q => q.eq(q.field("label"), fields.label))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        substrate: fields.substrate,
        qty: Number(fields.qty ?? 1),
        size: fields.size,
        requiresProof: fields.requiresProof,
      });
    } else {
      await ctx.db.insert("printParts", {
        projectId: cs.projectId,
        elementId,
        label: fields.label,
        substrate: fields.substrate,
        qty: Number(fields.qty ?? 1),
        size: fields.size,
        requiresProof: fields.requiresProof,
        createdFromChangeSetId: cs._id,
        createdAt: now,
      });
    }
    elementsToBump.add(elementId);
  }

  const pendingDeps: Array<{ taskId: TaskId; deps: string[] }> = [];
  for (const op of cs.ops) {
    if (op.kind !== "task.create") continue;
    const { tempId, elementTempOrId, elementId: directElementId, fields } = op.payload ?? {};

    const title = fields?.title ?? "Untitled Task";

    const elementId = resolveElementId(elementTempOrId ?? directElementId) ?? undefined;

    let taskId: TaskId;
    let existingTask = null;
    if (elementId) {
      existingTask = await ctx.db.query("tasks")
        .withIndex("by_element", q => q.eq("elementId", elementId))
        .filter(q => q.eq(q.field("title"), title))
        .first();
    }

    if (existingTask) {
      taskId = existingTask._id;
      await ctx.db.patch(taskId, {
        description: fields?.description,
        status: fields?.status,
        priority: fields?.priority,
        category: fields?.category,
        startDate: fields?.startDate,
        endDate: fields?.endDate,
        estimatedMinutes: fields?.estimatedMinutes,
        assignee: fields?.assignee,
        // New V3 fields
        stage: normalizeStage(fields?.stage),
        workType: normalizeWorkType(fields?.workType),
        plannedStartDate: fields?.plannedStartDate,
        plannedEndDate: fields?.plannedEndDate,
        checklist: normalizeChecklist(fields?.checklist),
        updatedAt: now,
      });
    } else {
      taskId = await ctx.db.insert("tasks", {
        projectId: cs.projectId,
        elementId,
        title,
        description: fields?.description,
        status: fields?.status ?? "TODO",
        priority: fields?.priority,
        category: fields?.category,
        startDate: fields?.startDate,
        endDate: fields?.endDate,
        estimatedMinutes: fields?.estimatedMinutes,
        assignee: fields?.assignee,
        dependencies: undefined,
        // New V3 fields
        stage: normalizeStage(fields?.stage),
        workType: normalizeWorkType(fields?.workType),
        plannedStartDate: fields?.plannedStartDate,
        plannedEndDate: fields?.plannedEndDate,
        checklist: normalizeChecklist(fields?.checklist),

        createdFromChangeSetId: cs._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (tempId) taskTempMap.set(tempId, taskId);
    if (elementId) elementsToBump.add(elementId);

    const deps = Array.isArray(fields?.dependencies) ? fields.dependencies : [];
    if (deps.length > 0) {
      pendingDeps.push({ taskId, deps });
    }
  }

  for (const item of pendingDeps) {
    const resolved: string[] = [];
    for (const dep of item.deps) {
      if (taskTempMap.has(dep)) {
        resolved.push(taskTempMap.get(dep) as string);
      } else {
        resolved.push(String(dep));
      }
    }
    await ctx.db.patch(item.taskId, { dependencies: resolved });
  }

  for (const op of cs.ops) {
    if (op.kind !== "accountingLine.create") continue;
    const { elementTempOrId, taskTempOrId, elementId: directElementId, fields } = op.payload ?? {};
    if (!fields?.title) throw new Error("accountingLine.create requires fields.title");

    let total = fields.total;
    if (total === undefined || total === null) {
      if (fields.qty !== undefined && fields.unitCost !== undefined) { // Check unitCost from V1 or unitCostEstimate from V3
        const cost = fields.unitCost ?? fields.unitCostEstimate;
        total = Number(fields.qty) * Number(cost);
      } else {
        total = 0;
      }
    }

    const elementId = resolveElementId(elementTempOrId ?? directElementId) ?? undefined;
    const taskId = resolveFromTemp(taskTempOrId, taskTempMap) ?? undefined;
    const type = fields.type ?? "other";

    let existing = null;
    if (elementId) {
      const lines = await ctx.db.query("accountingLines")
        .withIndex("by_element", q => q.eq("elementId", elementId))
        .collect();
      existing = lines.find(l =>
        l.title === fields.title &&
        l.type === type &&
        l.taskId === taskId
      );
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        qty: fields.qty === null ? undefined : fields.qty,
        unitCost: fields.unitCost === null ? undefined : fields.unitCost,
        total: Number(total),
        billable: fields.billable === null ? undefined : fields.billable,
        // V3 Patches
        itemName: fields.itemName === null ? undefined : fields.itemName,
        spec: fields.spec === null ? undefined : fields.spec,
        unit: fields.unit === null ? undefined : fields.unit,
        unitCostEstimate: fields.unitCostEstimate === null ? undefined : fields.unitCostEstimate,
        wastePct: fields.wastePct === null ? undefined : fields.wastePct,
        vendorId: fields.vendorId === null ? undefined : fields.vendorId,
        vendorSku: fields.vendorSku === null ? undefined : fields.vendorSku,
        vendorUrl: fields.vendorUrl === null ? undefined : fields.vendorUrl,
        leadTimeDays: fields.leadTimeDays === null ? undefined : fields.leadTimeDays,
        workType: normalizeWorkType(fields.workType),
        hours: fields.hours === null ? undefined : fields.hours,
        crewSize: fields.crewSize === null ? undefined : fields.crewSize,
        ratePerHour: fields.ratePerHour === null ? undefined : fields.ratePerHour,
        source: fields.source === null ? undefined : fields.source,
        confidence: fields.confidence === null ? undefined : fields.confidence,
        notes: fields.notes === null ? undefined : fields.notes,
      });
    } else {
      await ctx.db.insert("accountingLines", {
        projectId: cs.projectId,
        elementId,
        taskId,
        type,
        title: fields.title,
        qty: fields.qty === null ? undefined : fields.qty,
        unitCost: fields.unitCost === null ? undefined : fields.unitCost,
        total: Number(total),
        billable: fields.billable === null ? undefined : fields.billable,
        // V3 Fields
        itemName: fields.itemName === null ? undefined : fields.itemName,
        spec: fields.spec === null ? undefined : fields.spec,
        unit: fields.unit === null ? undefined : fields.unit,
        unitCostEstimate: fields.unitCostEstimate === null ? undefined : fields.unitCostEstimate,
        wastePct: fields.wastePct === null ? undefined : fields.wastePct,
        vendorId: fields.vendorId === null ? undefined : fields.vendorId,
        vendorSku: fields.vendorSku === null ? undefined : fields.vendorSku,
        vendorUrl: fields.vendorUrl === null ? undefined : fields.vendorUrl,
        leadTimeDays: fields.leadTimeDays === null ? undefined : fields.leadTimeDays,
        workType: normalizeWorkType(fields.workType),
        hours: fields.hours === null ? undefined : fields.hours,
        crewSize: fields.crewSize === null ? undefined : fields.crewSize,
        ratePerHour: fields.ratePerHour === null ? undefined : fields.ratePerHour,
        source: fields.source === null ? undefined : fields.source,
        confidence: fields.confidence === null ? undefined : fields.confidence,
        notes: fields.notes === null ? undefined : fields.notes,

        createdFromChangeSetId: cs._id,
        createdAt: now,
      });
    }
    if (elementId) elementsToBump.add(elementId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "purchase.create") continue;
    const { vendorTempOrId, fields } = op.payload ?? {};
    const vendorId = resolveFromTemp(vendorTempOrId, vendorTempMap);
    if (!vendorId) throw new Error("purchase.create requires vendorTempOrId");

    const purchaseId = await ctx.db.insert("purchases", {
      projectId: cs.projectId,
      vendorId,
      date: fields?.date ?? now,
      currency: fields?.currency ?? "NIS",
      totalAmount: Number(fields?.totalAmount ?? 0),
      status: fields?.status ?? "recorded",
      lineItems: Array.isArray(fields?.lineItems) ? fields.lineItems : [],
      notes: fields?.notes,
      createdFromChangeSetId: cs._id,
      createdAt: now,
      updatedAt: now,
    });

    if (op.payload?.tempId) purchaseTempMap.set(op.payload.tempId, purchaseId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "receipt.attach") continue;
    const { purchaseTempOrId, fileId } = op.payload ?? {};
    const purchaseId = resolveFromTemp(purchaseTempOrId, purchaseTempMap);
    if (!fileId) throw new Error("receipt.attach requires fileId");

    await ctx.db.insert("receipts", {
      projectId: cs.projectId,
      purchaseId: purchaseId ?? undefined,
      fileId,
      createdFromChangeSetId: cs._id,
      createdAt: now,
    });
  }

  for (const op of cs.ops) {
    if (op.kind !== "element.patch") continue;
    const { elementTempOrId, elementId: directElementId, patch, draftPatch } = op.payload ?? {};
    const elementId = resolveElementId(elementTempOrId ?? directElementId);

    if (!elementId) throw new Error("element.patch requires elementId or elementTempOrId");

    const element = await ctx.db.get(elementId);
    if (!element) throw new Error("element.patch element not found");

    if (patch && Object.keys(patch).length > 0) {
      await ctx.db.patch(elementId, {
        ...patch,
        updatedAt: now,
      });
    }

    if (draftPatch?.merge && element.currentDraftId) {
      const draft = await ctx.db.get(element.currentDraftId);
      if (!draft) throw new Error("element.patch draft not found");
      const merged = {
        ...(draft.workingSnapshot ?? {}),
        ...(draftPatch.merge ?? {}),
      };
      await ctx.db.patch(draft._id, {
        workingSnapshot: merged,
        updatedAt: now,
      });
    }

    elementsToBump.add(elementId);
  }

  // Bump Revisions for all affected elements (once per element)
  for (const elementId of elementsToBump) {
    if (!elementId) continue;
    const el = await ctx.db.get(elementId as ElementId);
    if (el) {
      await ctx.db.patch(el._id, {
        rev: (el.rev ?? 0) + 1,
        hasUnapprovedChanges: true,
        updatedAt: Date.now(),
      });
    }
  }

  await ctx.db.patch(cs._id, {
    status: "APPLIED",
    appliedAt: Date.now(),
  });
}

export const applyChangeSet = mutation({
  args: {
    changeSetId: v.id("changeSets"),
  },
  handler: async (ctx, args) => {
    return await applyChangeSetInternalLogic(ctx, args);
  },
});
