import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

type ElementId = Id<"elements">;
type TaskId = Id<"tasks">;
type VendorId = Id<"vendors">;
type PurchaseId = Id<"purchases">;
type MaterialLineId = Id<"materialLines">;
type WorkLineId = Id<"workLines">;
type AccountingSectionId = Id<"accountingSections">;

type TempMap<T> = Map<string, T>;

const studioWorkTypes = new Set([
  "carpentry",
  "metal_fab",
  "paint_finish",
  "printing_graphics",
  "props_sculpt",
  "rigging_install",
  "transport_logistics",
  "purchasing",
  "management",
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

const HEBREW_TO_LINE_TYPE: Record<string, "material" | "work"> = {
  "חומר": "material",
  "חומרים": "material",
  "חומרי גלם": "material",
  "עבודה": "work",
  "עבודת": "work",
  "כח אדם": "work",
};

const HEBREW_SECTION_FALLBACKS: Record<string, string> = {
  "חומרים": "materials",
  "עבודה (סטודיו)": "labor_direct",
  "עבודה (התקנה)": "labor_install",
  "הובלה/לוגיסטיקה": "transport",
  "התקנה": "install",
  "פירוק/החזרות": "teardown_returns",
  "השכרות": "rental",
  "פרינט/גרפיקה": "printing_graphics",
  "חומרי עזר/מתכלים": "hardware_consumables",
  "אוכל לצוות": "meals",
  "ניהול/תקורה": "management_overhead",
};

function normalizeWorkType(value?: string) {
  if (!value) return undefined;
  return studioWorkTypes.has(value) ? value : undefined;
}

function normalizeLineType(input: unknown): "material" | "work" | undefined {
  if (!input) return undefined;
  const s = String(input).trim();
  if (s === "material" || s === "materials") return "material";
  if (s === "work" || s === "labor") return "work";
  if (HEBREW_TO_LINE_TYPE[s]) return HEBREW_TO_LINE_TYPE[s];
  if (s.includes("חומר")) return "material";
  if (s.includes("עבודה")) return "work";
  return undefined;
}

function normalizeSectionKey(sectionKey: unknown, sectionLabelHe?: unknown): string | undefined {
  if (sectionKey) return String(sectionKey).trim();
  const he = sectionLabelHe ? String(sectionLabelHe).trim() : "";
  return HEBREW_SECTION_FALLBACKS[he] ?? undefined;
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
      workTypeLabelHe: item.workTypeLabelHe ? String(item.workTypeLabelHe) : undefined,
      estimatedMinutes: Number.isFinite(item.estimatedMinutes)
        ? Number(item.estimatedMinutes)
        : undefined,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
      done: typeof item.done === "boolean" ? item.done : undefined,
      dependsOnItemIds: Array.isArray(item.dependsOnItemIds)
        ? item.dependsOnItemIds.map((id: any) => String(id))
        : undefined,
    }));
}

function normalizeAccountingLinks(
  list: any,
  materialLineTempMap: TempMap<MaterialLineId>,
  workLineTempMap: TempMap<WorkLineId>
) {
  if (!Array.isArray(list)) return undefined;
  return list
    .filter((item) => item && (item.lineType === "material" || item.lineType === "work"))
    .map((item) => {
      const lineType = item.lineType === "material" ? "material" : "work";
      const rawLineId = String(item.lineId ?? "");
      if (!rawLineId) return null;
      const resolvedLineId =
        lineType === "material"
          ? resolveFromTemp(rawLineId, materialLineTempMap)
          : resolveFromTemp(rawLineId, workLineTempMap);
      if (!resolvedLineId) return null;
      return {
        lineType,
        lineId: resolvedLineId,
        relation:
          item.relation === "primary" || item.relation === "supporting"
            ? item.relation
            : undefined,
        note: item.note ? String(item.note) : undefined,
      };
    })
    .filter(Boolean);
}

function toOptional<T>(value: T | null | undefined) {
  return value === null ? undefined : value;
}

function resolveFromTemp<T extends string>(
  value: string | undefined | null,
  tempMap: TempMap<T>
): T | null {
  if (!value) return null;
  if (tempMap.has(value)) return tempMap.get(value) ?? null;
  return value as T;
}

function assertAsciiKeys(value: unknown, context: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const nonAsciiKey = Object.keys(value).find((key) => /[^\x00-\x7F]/.test(key));
  if (nonAsciiKey) {
    throw new Error(`Non-ASCII key "${nonAsciiKey}" in ${context}`);
  }
}

async function resolveOrCreateSectionId(
  ctx: any,
  projectId: Id<"projects">,
  sectionKey?: string,
  sectionLabelHe?: string,
  now?: number
): Promise<AccountingSectionId | undefined> {
  if (!sectionKey) return undefined;
  const existing = await ctx.db
    .query("accountingSections")
    .withIndex("by_project_key", (q: any) =>
      q.eq("projectId", projectId).eq("key", sectionKey)
    )
    .first();
  if (existing) {
    if (sectionLabelHe && existing.labelHe !== sectionLabelHe) {
      await ctx.db.patch(existing._id, { labelHe: sectionLabelHe, updatedAt: now ?? Date.now() });
    }
    return existing._id;
  }
  return await ctx.db.insert("accountingSections", {
    projectId,
    key: sectionKey,
    labelHe: sectionLabelHe ?? sectionKey,
    sortOrder: 0,
    createdAt: now ?? Date.now(),
    updatedAt: now ?? Date.now(),
  });
}

function resolveTaskRef(
  ref: any,
  taskTempMap: TempMap<TaskId>,
  taskTitleMap: Map<string, TaskId>
): TaskId | undefined {
  if (!ref) return undefined;
  if (typeof ref === "string") return resolveFromTemp(ref, taskTempMap) ?? undefined;
  if (ref.taskId) return ref.taskId as TaskId;
  if (ref.taskTempOrId) return resolveFromTemp(ref.taskTempOrId, taskTempMap) ?? undefined;
  if (ref.byTempTaskTitle) return taskTitleMap.get(String(ref.byTempTaskTitle));
  return undefined;
}

export const createChangeSet = mutation({
  args: {
    projectId: v.id("projects"),
    stage: v.union(v.literal("IDEATION"), v.literal("QUOTE"), v.literal("BREAKDOWN")),
    ops: v.array(v.object({ kind: v.string(), payload: v.any() })),
    reason_he: v.optional(v.string()),
    preview_he: v.optional(v.any()),
    base: v.optional(v.any()),
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
      if (!check?.elementId) {
        console.warn("Skipping base element check with missing elementId");
        continue;
      }
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
  const taskTitleMap: Map<string, TaskId> = new Map();
  const vendorTempMap: TempMap<VendorId> = new Map();
  const purchaseTempMap: TempMap<PurchaseId> = new Map();
  const materialLineTempMap: TempMap<MaterialLineId> = new Map();
  const workLineTempMap: TempMap<WorkLineId> = new Map();
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
    assertAsciiKeys(op.payload, `op.payload (${op.kind})`);
    if (op.payload?.fields) assertAsciiKeys(op.payload.fields, `op.payload.fields (${op.kind})`);
    if (op.payload?.element) assertAsciiKeys(op.payload.element, `op.payload.element (${op.kind})`);
    if (op.payload?.draft) assertAsciiKeys(op.payload.draft, `op.payload.draft (${op.kind})`);
    if (op.payload?.data) assertAsciiKeys(op.payload.data, `op.payload.data (${op.kind})`);
  }

  for (const op of cs.ops) {
    if (op.kind !== "element.create") continue;
    const { tempId, element, draft } = op.payload ?? {};

    // Fallback to "Untitled Element" if title is missing
    const elementTitle = element?.title || "Untitled Element";

    const elementId = await ctx.db.insert("elements", {
      projectId: cs.projectId,
      title: elementTitle,
      type: element?.type ?? "build",
      status: element?.status ?? "drafting",
      tags: Array.isArray(element?.tags) ? element.tags : [],
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
        description: toOptional(fields?.description),
        status: toOptional(fields?.status),
        priority: toOptional(fields?.priority),
        category: toOptional(fields?.category),
        startDate: toOptional(fields?.startDate),
        endDate: toOptional(fields?.endDate),
        estimatedMinutes: toOptional(fields?.estimatedMinutes),
        assignee: toOptional(fields?.assignee),
        // New V3 fields
        stage: normalizeStage(fields?.stage),
        workType: normalizeWorkType(fields?.workType),
        workTypeLabelHe: toOptional(fields?.workTypeLabelHe),
        plannedStartDate: toOptional(fields?.plannedStartDate),
        plannedEndDate: toOptional(fields?.plannedEndDate),
        durationBucket: toOptional(fields?.durationBucket),
        checklist: normalizeChecklist(fields?.checklist),
        accountingLinks: normalizeAccountingLinks(
          fields?.accountingLinks,
          materialLineTempMap,
          workLineTempMap
        ),
        updatedAt: now,
      });
    } else {
      taskId = await ctx.db.insert("tasks", {
        projectId: cs.projectId,
        elementId,
        title,
        description: toOptional(fields?.description),
        status: fields?.status ?? "TODO",
        priority: toOptional(fields?.priority),
        category: toOptional(fields?.category),
        startDate: toOptional(fields?.startDate),
        endDate: toOptional(fields?.endDate),
        estimatedMinutes: toOptional(fields?.estimatedMinutes),
        assignee: toOptional(fields?.assignee),
        dependencies: undefined,
        // New V3 fields
        stage: normalizeStage(fields?.stage),
        workType: normalizeWorkType(fields?.workType),
        workTypeLabelHe: toOptional(fields?.workTypeLabelHe),
        plannedStartDate: toOptional(fields?.plannedStartDate),
        plannedEndDate: toOptional(fields?.plannedEndDate),
        durationBucket: toOptional(fields?.durationBucket),
        checklist: normalizeChecklist(fields?.checklist),
        accountingLinks: normalizeAccountingLinks(
          fields?.accountingLinks,
          materialLineTempMap,
          workLineTempMap
        ),

        createdFromChangeSetId: cs._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (tempId) taskTempMap.set(tempId, taskId);
    if (title && !taskTitleMap.has(title)) taskTitleMap.set(title, taskId);
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
    if (op.kind !== "materialLine.create") continue;
    const { tempId, elementTempOrId, taskTempOrId, elementId: directElementId, fields } =
      op.payload ?? {};
    if (!fields?.itemName) throw new Error("materialLine.create requires fields.itemName");

    const elementId = resolveElementId(elementTempOrId ?? directElementId) ?? undefined;
    const taskId =
      resolveFromTemp(taskTempOrId, taskTempMap) ??
      resolveTaskRef(op.payload?.taskRef ?? fields?.taskRef, taskTempMap, taskTitleMap);
    const rawVendorId =
      resolveFromTemp(fields.vendorTempOrId ?? fields.vendorId, vendorTempMap) ??
      fields.vendorId;
    const resolvedVendorId = rawVendorId
      ? ctx.db.normalizeId("vendors", rawVendorId)
      : undefined;
    const sectionKey = normalizeSectionKey(
      fields.sectionKey ?? op.payload?.sectionKey,
      fields.sectionLabelHe ?? op.payload?.sectionLabelHe
    );
    const sectionLabelHe = fields.sectionLabelHe ?? op.payload?.sectionLabelHe ?? undefined;
    const sectionId = await resolveOrCreateSectionId(
      ctx,
      cs.projectId,
      sectionKey,
      sectionLabelHe,
      now
    );

    const lineId = await ctx.db.insert("materialLines", {
      projectId: cs.projectId,
      elementId,
      taskId,
      sectionId,
      sectionKey,
      sectionLabelHe,
      workType: normalizeWorkType(fields.workType),
      workTypeLabelHe: fields.workTypeLabelHe ?? undefined,
      itemName: fields.itemName ?? undefined,
      spec: fields.spec ?? undefined,
      quantity: fields.quantity ?? undefined,
      unitCode: fields.unitCode ?? undefined,
      unitLabelHe: fields.unitLabelHe ?? undefined,
      unit: fields.unit ?? undefined,
      wastePct: fields.wastePct ?? undefined,
      plannedUnitCost: fields.plannedUnitCost ?? undefined,
      plannedTotalCost: fields.plannedTotalCost ?? undefined,
      vendorId: resolvedVendorId ?? undefined,
      vendorName: fields.vendorName ?? undefined,
      leadTimeDays: fields.leadTimeDays ?? undefined,
      procurementCode: fields.procurementCode ?? undefined,
      procurementLabelHe: fields.procurementLabelHe ?? undefined,
      procurement: fields.procurement ?? undefined,
      notes: fields.notes ?? undefined,
      sourceCode: fields.sourceCode ?? undefined,
      sourceLabelHe: fields.sourceLabelHe ?? undefined,
      source: fields.source ?? undefined,
      confidence: fields.confidence ?? undefined,
      checklistItemId: fields.checklistItemId ?? undefined,
      createdFromChangeSetId: cs._id,
      createdAt: now,
    });

    if (tempId) materialLineTempMap.set(tempId, lineId);
    if (elementId) elementsToBump.add(elementId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "workLine.create") continue;
    const { tempId, elementTempOrId, taskTempOrId, elementId: directElementId, fields } =
      op.payload ?? {};
    if (!fields?.roleHe) throw new Error("workLine.create requires fields.roleHe");

    const elementId = resolveElementId(elementTempOrId ?? directElementId) ?? undefined;
    const taskId =
      resolveFromTemp(taskTempOrId, taskTempMap) ??
      resolveTaskRef(op.payload?.taskRef ?? fields?.taskRef, taskTempMap, taskTitleMap);
    const sectionKey = normalizeSectionKey(
      fields.sectionKey ?? op.payload?.sectionKey,
      fields.sectionLabelHe ?? op.payload?.sectionLabelHe
    );
    const sectionLabelHe = fields.sectionLabelHe ?? op.payload?.sectionLabelHe ?? undefined;
    const sectionId = await resolveOrCreateSectionId(
      ctx,
      cs.projectId,
      sectionKey,
      sectionLabelHe,
      now
    );

    const lineId = await ctx.db.insert("workLines", {
      projectId: cs.projectId,
      elementId,
      taskId,
      sectionId,
      sectionKey,
      sectionLabelHe,
      workType: normalizeWorkType(fields.workType),
      workTypeLabelHe: fields.workTypeLabelHe ?? undefined,
      roleHe: fields.roleHe ?? undefined,
      rateTypeCode: fields.rateTypeCode ?? undefined,
      rateTypeLabelHe: fields.rateTypeLabelHe ?? undefined,
      rateType: fields.rateType ?? undefined,
      crewSize: fields.crewSize ?? undefined,
      plannedQuantity: fields.plannedQuantity ?? undefined,
      plannedUnitCost: fields.plannedUnitCost ?? undefined,
      plannedTotalCost: fields.plannedTotalCost ?? undefined,
      isManagement: fields.isManagement ?? undefined,
      notes: fields.notes ?? undefined,
      sourceCode: fields.sourceCode ?? undefined,
      sourceLabelHe: fields.sourceLabelHe ?? undefined,
      source: fields.source ?? undefined,
      confidence: fields.confidence ?? undefined,
      createdFromChangeSetId: cs._id,
      createdAt: now,
    });

    if (tempId) workLineTempMap.set(tempId, lineId);
    if (elementId) elementsToBump.add(elementId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "task.patch") continue;
    const { taskTempOrId, taskId: directTaskId, fields } = op.payload ?? {};
    const resolvedTaskId = resolveFromTemp(taskTempOrId ?? directTaskId, taskTempMap);
    if (!resolvedTaskId) throw new Error("task.patch requires taskId or taskTempOrId");
    if (!fields || typeof fields !== "object") continue;

    const patch: any = {};
    if ("title" in fields) patch.title = toOptional(fields.title);
    if ("description" in fields) patch.description = toOptional(fields.description);
    if ("status" in fields) patch.status = toOptional(fields.status);
    if ("priority" in fields) patch.priority = toOptional(fields.priority);
    if ("category" in fields) patch.category = toOptional(fields.category);
    if ("startDate" in fields) patch.startDate = toOptional(fields.startDate);
    if ("endDate" in fields) patch.endDate = toOptional(fields.endDate);
    if ("estimatedMinutes" in fields) patch.estimatedMinutes = toOptional(fields.estimatedMinutes);
    if ("assignee" in fields) patch.assignee = toOptional(fields.assignee);
    if ("plannedStartDate" in fields) patch.plannedStartDate = toOptional(fields.plannedStartDate);
    if ("plannedEndDate" in fields) patch.plannedEndDate = toOptional(fields.plannedEndDate);
    if ("durationBucket" in fields) patch.durationBucket = toOptional(fields.durationBucket);
    if ("stage" in fields) {
      const stageValue = toOptional(fields.stage);
      patch.stage = stageValue ? normalizeStage(stageValue) : stageValue;
    }
    if ("workType" in fields) {
      const workTypeValue = toOptional(fields.workType);
      patch.workType = workTypeValue ? normalizeWorkType(workTypeValue) : workTypeValue;
    }
    if ("workTypeLabelHe" in fields) patch.workTypeLabelHe = toOptional(fields.workTypeLabelHe);
    if ("dependencies" in fields) {
      patch.dependencies = Array.isArray(fields.dependencies)
        ? fields.dependencies.map((dep: any) => String(dep))
        : toOptional(fields.dependencies);
    }
    if ("checklist" in fields) {
      patch.checklist =
        fields.checklist === null ? undefined : normalizeChecklist(fields.checklist);
    }
    if ("accountingLinks" in fields) {
      patch.accountingLinks =
        fields.accountingLinks === null
          ? undefined
          : normalizeAccountingLinks(
            fields.accountingLinks,
            materialLineTempMap,
            workLineTempMap
          );
    }

    await ctx.db.patch(resolvedTaskId, { ...patch, updatedAt: now });
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
    const taskId =
      resolveFromTemp(taskTempOrId, taskTempMap) ??
      resolveTaskRef(op.payload?.taskRef ?? fields?.taskRef, taskTempMap, taskTitleMap);
    let type = fields.type;
    const normalizedLineType = normalizeLineType(fields.lineType ?? fields.type);
    if (normalizedLineType === "material") type = "material";
    if (normalizedLineType === "work") type = "labor";

    // Heuristic inference if type is missing or "other"
    if (!type || type === "other") {
      const lowerTitle = (fields.title || "").toLowerCase();
      // 1. Text signals in title
      if (lowerTitle.includes("חומר:") || lowerTitle.includes("material:")) {
        type = "material";
      } else if (lowerTitle.includes("עבודה:") || lowerTitle.includes("labor:") || lowerTitle.includes("work:")) {
        type = "labor";
      }
      // 2. Field signals
      else if (fields.itemName || fields.vendorSku || fields.unitCode) {
        type = "material";
      } else if (fields.hours || fields.crewSize || fields.ratePerHour) {
        type = "labor";
      } else {
        type = "other";
      }
    }

    const rawVendorId =
      resolveFromTemp(fields.vendorTempOrId ?? fields.vendorId, vendorTempMap) ??
      fields.vendorId;

    // Validate that 'rawVendorId' is actually a valid ID for 'vendors'
    const resolvedVendorId = rawVendorId
      ? ctx.db.normalizeId("vendors", rawVendorId)
      : undefined;

    let existing = null;
    if (elementId) {
      const lines = await ctx.db.query("accountingLines")
        .withIndex("by_element", q => q.eq("elementId", elementId))
        .collect();

      // Try to find a match. Note: inferring type effectively might make matching harder if existing was 'other'
      // But usually we are creating new lines here.
      existing = lines.find(l =>
        l.title === fields.title &&
        l.type === type &&
        l.taskId === taskId
      );
    }

    const sectionKey = normalizeSectionKey(fields.sectionKey, fields.sectionLabelHe);
    const sectionLabelHe = fields.sectionLabelHe ?? undefined;
    const sectionId = await resolveOrCreateSectionId(
      ctx,
      cs.projectId,
      sectionKey,
      sectionLabelHe,
      now
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        qty: fields.qty === null ? undefined : fields.qty,
        unitCost: fields.unitCost === null ? undefined : fields.unitCost,
        total: Number(total),
        billable: fields.billable === null ? undefined : fields.billable,
        sectionId,
        sectionKey,
        sectionLabelHe,
        // V3 Patches
        itemName: fields.itemName === null ? undefined : fields.itemName,
        spec: fields.spec === null ? undefined : fields.spec,
        unit: fields.unit === null ? undefined : fields.unit,
        unitCostEstimate: fields.unitCostEstimate === null ? undefined : fields.unitCostEstimate,
        wastePct: fields.wastePct === null ? undefined : fields.wastePct,
        vendorId: resolvedVendorId ?? undefined,
        vendorName: fields.vendorName === null ? undefined : fields.vendorName,
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
        sectionId,
        sectionKey,
        sectionLabelHe,
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
        vendorId: resolvedVendorId ?? undefined,
        vendorName: fields.vendorName === null ? undefined : fields.vendorName,
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
    if (op.kind !== "accountingLine.patch") continue;
    const { accountingLineId, lineId, fields } = op.payload ?? {};
    const resolvedLineId = accountingLineId ?? lineId;
    if (!resolvedLineId) throw new Error("accountingLine.patch requires accountingLineId");
    if (!fields || typeof fields !== "object") continue;

    const rawVendorId =
      resolveFromTemp(fields.vendorTempOrId ?? fields.vendorId, vendorTempMap) ??
      fields.vendorId;

    // Validate ID
    const resolvedVendorId = rawVendorId
      ? ctx.db.normalizeId("vendors", rawVendorId)
      : undefined;

    const patch: any = {};
    if ("title" in fields) patch.title = toOptional(fields.title);
    if ("type" in fields) patch.type = toOptional(fields.type);
    if ("lineType" in fields) {
      const normalized = normalizeLineType(fields.lineType);
      patch.type = normalized === "work" ? "labor" : normalized ?? patch.type;
    }
    if ("sectionKey" in fields || "sectionLabelHe" in fields) {
      const sectionKey = normalizeSectionKey(fields.sectionKey, fields.sectionLabelHe);
      const sectionLabelHe = toOptional(fields.sectionLabelHe);
      patch.sectionKey = sectionKey;
      patch.sectionLabelHe = sectionLabelHe;
      patch.sectionId = await resolveOrCreateSectionId(
        ctx,
        cs.projectId,
        sectionKey,
        sectionLabelHe,
        now
      );
    }
    if ("qty" in fields) patch.qty = toOptional(fields.qty);
    if ("unitCost" in fields) patch.unitCost = toOptional(fields.unitCost);
    if ("total" in fields) patch.total = toOptional(fields.total);
    if ("billable" in fields) patch.billable = toOptional(fields.billable);
    if ("itemName" in fields) patch.itemName = toOptional(fields.itemName);
    if ("spec" in fields) patch.spec = toOptional(fields.spec);
    if ("unit" in fields) patch.unit = toOptional(fields.unit);
    if ("unitCostEstimate" in fields) patch.unitCostEstimate = toOptional(fields.unitCostEstimate);
    if ("wastePct" in fields) patch.wastePct = toOptional(fields.wastePct);
    if ("vendorId" in fields || "vendorTempOrId" in fields) {
      patch.vendorId = toOptional(resolvedVendorId);
    }
    if ("vendorName" in fields) patch.vendorName = toOptional(fields.vendorName);
    if ("vendorSku" in fields) patch.vendorSku = toOptional(fields.vendorSku);
    if ("vendorUrl" in fields) patch.vendorUrl = toOptional(fields.vendorUrl);
    if ("leadTimeDays" in fields) patch.leadTimeDays = toOptional(fields.leadTimeDays);
    if ("workType" in fields) {
      const workTypeValue = toOptional(fields.workType);
      patch.workType = workTypeValue ? normalizeWorkType(workTypeValue) : workTypeValue;
    }
    if ("hours" in fields) patch.hours = toOptional(fields.hours);
    if ("crewSize" in fields) patch.crewSize = toOptional(fields.crewSize);
    if ("ratePerHour" in fields) patch.ratePerHour = toOptional(fields.ratePerHour);
    if ("source" in fields) patch.source = toOptional(fields.source);
    if ("confidence" in fields) patch.confidence = toOptional(fields.confidence);
    if ("notes" in fields) patch.notes = toOptional(fields.notes);

    await ctx.db.patch(resolvedLineId, { ...patch });
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
