import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { Id } from './_generated/dataModel'
import { captureSnapshotFromLive } from './elements'
import { api, internal } from './_generated/api'
import { withDefaultStartDate } from './lib/dates'

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

function firstNonEmptyString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeConfidence(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  // If already a number, validate it's in range [0, 1]
  if (typeof value === "number") {
    return value >= 0 && value <= 1 ? value : undefined;
  }
  // If string, try to map "high"/"medium"/"low" or parse as number
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "high") return 0.9;
    if (trimmed === "medium") return 0.6;
    if (trimmed === "low") return 0.3;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
  }
  return undefined;
}

function normalizePriceConfidence(value: unknown): "high" | "medium" | "low" | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "high") return "high";
    if (trimmed === "medium") return "medium";
    if (trimmed === "low") return "low";
  }
  // If it's a number, map ranges back to string
  if (typeof value === "number") {
    if (value >= 0.7) return "high";
    if (value >= 0.4) return "medium";
    return "low";
  }
  return undefined;
}

function inferWorkTypeFromDedupKey(dedupKey: unknown): string | undefined {
  if (typeof dedupKey !== "string" || !dedupKey.trim()) return undefined;
  const parts = dedupKey.split("::").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return undefined;
  return parts[2];
}

function humanizeWorkType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.trim();
  if (!compact) return undefined;
  const withSpaces = compact.replace(/[_-]+/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function normalizeWorkLineFieldsForApply(rawFields: any, taskTitle?: string) {
  const fields = { ...(rawFields ?? {}) };
  const dedupKey = firstNonEmptyString([fields.dedupKey]);
  if (dedupKey) fields.dedupKey = dedupKey;

  const workTypeRaw = firstNonEmptyString([
    fields.workType,
    fields.workTypeKey,
    inferWorkTypeFromDedupKey(dedupKey),
  ]);
  const workType = workTypeRaw ? normalizeWorkType(workTypeRaw) : undefined;
  if (workType) fields.workType = workType;

  const roleHe = firstNonEmptyString([
    fields.roleHe,
    fields.titleHe,
    fields.title,
    fields.role,
    fields.roleNameHe,
    fields.workTypeLabelHe,
    taskTitle,
    workType ? humanizeWorkType(workType) : undefined,
  ]);
  if (roleHe) fields.roleHe = roleHe;

  const plannedQuantity = toFiniteNumber(
    fields.plannedQuantity ??
    fields.plannedQuantityDays ??
    fields.days ??
    fields.qty ??
    fields.quantity
  );
  if (plannedQuantity !== undefined) fields.plannedQuantity = plannedQuantity;

  const plannedUnitCost = toFiniteNumber(
    fields.plannedUnitCost ??
    fields.plannedDayRate ??
    fields.dayRate ??
    fields.rate ??
    fields.unitCost
  );
  if (plannedUnitCost !== undefined) fields.plannedUnitCost = plannedUnitCost;

  const plannedTotalCost =
    toFiniteNumber(fields.plannedTotalCost ?? fields.total) ??
    (
      plannedQuantity !== undefined && plannedUnitCost !== undefined
        ? plannedQuantity * plannedUnitCost
        : undefined
    );
  if (plannedTotalCost !== undefined) fields.plannedTotalCost = plannedTotalCost;

  const rateTypeRaw = firstNonEmptyString([fields.rateTypeCode, fields.rateType]);
  const normalizedRateType = rateTypeRaw ? rateTypeRaw.toLowerCase() : undefined;
  const dayLike =
    normalizedRateType === "day" ||
    fields.plannedQuantityDays !== undefined ||
    fields.plannedDayRate !== undefined ||
    fields.dayRate !== undefined ||
    fields.days !== undefined;
  if (dayLike) {
    fields.rateTypeCode = "day";
  } else if (normalizedRateType) {
    fields.rateTypeCode = normalizedRateType;
  }

  return fields;
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
      estimatedHours: Number.isFinite(item.estimatedHours)
        ? Number(item.estimatedHours)
        : Number.isFinite(item.estimatedMinutes)
          ? Number(item.estimatedMinutes) / 60
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
    // Legacy / Compat
    ops: v.optional(v.array(v.object({ kind: v.string(), payload: v.any() }))),
    reason_he: v.optional(v.string()),
    preview_he: v.optional(v.any()),
    base: v.optional(v.any()),

    // V2
    scope: v.optional(v.any()), // v.union(...) too verbose to repeat, lenient for now
    baseSnapshot: v.optional(v.any()),
    artifactRevisionInId: v.optional(v.id("flowArtifactRevisions")),
    runConfig: v.optional(v.any()),
    report_he: v.optional(v.any()),
    gaps: v.optional(v.any()),
    links: v.optional(v.any()),
    generatedImages: v.optional(v.any()),
    changeGroups: v.optional(v.any()),
    createdBy: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("changeSets", {
      projectId: args.projectId,
      stage: args.stage,
      status: "PROPOSED",

      ops: args.ops ?? [],
      reason_he: args.reason_he,
      preview_he: args.preview_he,
      base: args.base,

      scope: args.scope,
      baseSnapshot: args.baseSnapshot,
      artifactRevisionInId: args.artifactRevisionInId,
      runConfig: args.runConfig,
      report_he: args.report_he,
      gaps: args.gaps,
      links: args.links,
      generatedImages: args.generatedImages,
      changeGroups: args.changeGroups,
      createdBy: args.createdBy,

      createdAt: Date.now(),
    });
  },
});

export const get = query({
  args: { id: v.id("changeSets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listForProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
    statuses: v.optional(
      v.array(
        v.union(
          v.literal("PROPOSED"),
          v.literal("APPLIED"),
          v.literal("PARTIALLY_APPLIED"),
          v.literal("DISCARDED")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows = await ctx.db
      .query("changeSets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit * 2);

    const statusFilter = Array.isArray(args.statuses) && args.statuses.length > 0
      ? new Set(args.statuses)
      : null;
    const filtered = statusFilter
      ? rows.filter((row: any) => statusFilter.has(row.status))
      : rows;

    return filtered.slice(0, limit).map((row: any) => ({
      _id: row._id,
      projectId: row.projectId,
      stage: row.stage,
      status: row.status,
      reason_he: row.reason_he,
      preview_he: row.preview_he,
      createdAt: row.createdAt,
      appliedAt: row.appliedAt,
      discardedAt: row.discardedAt,
      opsCount: Array.isArray(row.ops) ? row.ops.length : 0,
      appliedOpIndicesCount: Array.isArray(row.appliedOpIndices) ? row.appliedOpIndices.length : 0,
    }));
  },
});

export const getBaseSnapshotForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await loadBaseSnapshot(ctx, args.projectId);
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

function normalizeProcurementCode(
  code: string | undefined | null
): "in_stock" | "local_buy" | "import" | "rental" | undefined {
  if (!code) return undefined;
  if (code === "in_stock") return "in_stock";
  if (code === "local_buy") return "local_buy";
  if (code === "import") return "import";
  if (code === "rental") return "rental";
  return undefined;
}

function normalizeUomCode(
  code: string | undefined | null
):
  | "ea"
  | "sheet"
  | "m"
  | "m2"
  | "sqm"
  | "m3"
  | "kg"
  | "l"
  | "set"
  | "box"
  | "roll"
  | "pack"
  | "job"
  | "hour"
  | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase().trim();
  if (c === "m2" || c === "sqm" || c === "m^2") return "m2";
  if (c === "m3" || c === "m^3") return "m3";
  if (c === "ea" || c === "each" || c === "units") return "ea";
  if (c === "sheet" || c === "sheets") return "sheet";
  if (c === "m" || c === "meter" || c === "meters") return "m";
  if (c === "kg" || c === "kgs") return "kg";
  if (c === "l" || c === "liter" || c === "liters") return "l";
  if (c === "set" || c === "sets") return "set";
  if (c === "box" || c === "boxes") return "box";
  if (c === "roll" || c === "rolls") return "roll";
  if (c === "pack" || c === "packs") return "pack";
  if (c === "job" || c === "jobs") return "job";
  if (c === "hour" || c === "hours" || c === "hr") return "hour";

  const valid = [
    "ea",
    "sheet",
    "m",
    "m2",
    "sqm",
    "m3",
    "kg",
    "l",
    "set",
    "box",
    "roll",
    "pack",
    "job",
    "hour",
  ];
  if (valid.includes(c)) return c as any;
  return undefined;
}

function normalizePricingModel(
  model: string | undefined | null
): "per_unit" | "per_sheet" | "per_m" | "per_m2" | "per_pack" | "tiered" | "formula" | "unknown" | undefined {
  if (!model) return undefined;
  const m = model.toLowerCase().trim();
  if (m === "unit" || m === "per_unit" || m === "ea" || m === "each") return "per_unit";
  if (m === "sheet" || m === "per_sheet" || m === "sheets") return "per_sheet";
  if (m === "m" || m === "per_m" || m === "meter") return "per_m";
  if (m === "m2" || m === "per_m2" || m === "sqm") return "per_m2";
  if (m === "pack" || m === "per_pack" || m === "box") return "per_pack";
  if (m === "tiered") return "tiered";
  if (m === "formula") return "formula";
  return "unknown";
}

function maxNumber(values: Array<number | undefined | null>) {
  const numeric = values.filter((value): value is number => Number.isFinite(value));
  if (numeric.length === 0) return undefined;
  return Math.max(...numeric);
}

async function loadLatestUpdatedAt(
  ctx: any,
  table: string,
  indexName: string,
  projectId: Id<"projects">
) {
  const rows = await ctx.db
    .query(table)
    .withIndex(indexName, (q: any) => q.eq("projectId", projectId))
    .order("desc")
    .take(1);
  const row = rows?.[0];
  if (!row) return undefined;
  return row.updatedAt ?? row.createdAt;
}

async function loadBaseSnapshot(ctx: any, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  const elementsUpdatedAt = await loadLatestUpdatedAt(ctx, "elements", "by_project_updated", projectId);
  const tasksUpdatedAt = await loadLatestUpdatedAt(ctx, "tasks", "by_project_updatedAt", projectId);
  const accountingUpdatedAt = maxNumber([
    await loadLatestUpdatedAt(ctx, "accountingLines", "by_project_updatedAt", projectId),
    await loadLatestUpdatedAt(ctx, "materialLines", "by_project_updatedAt", projectId),
    await loadLatestUpdatedAt(ctx, "workLines", "by_project_updatedAt", projectId),
  ]);
  const quoteRows = await ctx.db
    .query("quoteVersions")
    .withIndex("by_project", (q: any) => q.eq("projectId", projectId))
    .order("desc")
    .take(1);
  const quoteUpdatedAt = quoteRows?.[0]?.createdAt;

  return {
    projectUpdatedAt: project?.updatedAt,
    elementsUpdatedAt,
    tasksUpdatedAt,
    accountingUpdatedAt,
    quoteUpdatedAt,
  };
}

async function assertBaseSnapshotFresh(
  ctx: any,
  projectId: Id<"projects">,
  baseSnapshot?: {
    projectUpdatedAt?: number;
    elementsUpdatedAt?: number;
    tasksUpdatedAt?: number;
    accountingUpdatedAt?: number;
    quoteUpdatedAt?: number;
  }
) {
  if (!baseSnapshot) return;
  const current = await loadBaseSnapshot(ctx, projectId);
  if (baseSnapshot.projectUpdatedAt && current.projectUpdatedAt && current.projectUpdatedAt > baseSnapshot.projectUpdatedAt) {
    throw new Error("ChangeSet is stale: project updated");
  }
  if (baseSnapshot.elementsUpdatedAt && current.elementsUpdatedAt && current.elementsUpdatedAt > baseSnapshot.elementsUpdatedAt) {
    throw new Error("ChangeSet is stale: elements updated");
  }
  if (baseSnapshot.tasksUpdatedAt && current.tasksUpdatedAt && current.tasksUpdatedAt > baseSnapshot.tasksUpdatedAt) {
    throw new Error("ChangeSet is stale: tasks updated");
  }
  if (baseSnapshot.accountingUpdatedAt && current.accountingUpdatedAt && current.accountingUpdatedAt > baseSnapshot.accountingUpdatedAt) {
    throw new Error("ChangeSet is stale: accounting updated");
  }
  if (baseSnapshot.quoteUpdatedAt && current.quoteUpdatedAt && current.quoteUpdatedAt > baseSnapshot.quoteUpdatedAt) {
    throw new Error("ChangeSet is stale: quote updated");
  }
}

async function recordAudit(
  ctx: any,
  args: {
    projectId: Id<"projects">;
    changeSetId: Id<"changeSets">;
    groupId?: string;
    operation: string;
    entityRef: string;
    before?: any;
    after?: any;
    appliedAt: number;
  }
) {
  await ctx.db.insert("auditLogs", {
    projectId: args.projectId,
    changeSetId: args.changeSetId,
    groupId: args.groupId,
    operation: args.operation,
    entityRef: args.entityRef,
    before: args.before,
    after: args.after,
    appliedAt: args.appliedAt,
  });
}

export async function applyChangeSetInternalLogic(ctx: any, args: { changeSetId: Id<"changeSets"> }) {
  const cs = await ctx.db.get(args.changeSetId);
  if (!cs) throw new Error("ChangeSet not found");
  if (cs.status !== "PROPOSED" && cs.status !== "APPLIED") throw new Error(`ChangeSet is ${cs.status}`);
  await assertBaseSnapshotFresh(ctx, cs.projectId, cs.baseSnapshot);
  const sourceChangeSetId = cs.sourceChangeSetId ?? cs._id;
  const auditChangeSetId = sourceChangeSetId;

  if (cs.base?.elements) {
    for (const check of cs.base.elements) {
      let el = null;
      if (check?.elementId) {
        el = await ctx.db.get(check.elementId);
      } else if (check?.title) {
        // Try to find by title within project
        el = await ctx.db
          .query("elements")
          .withIndex("by_project", (q: any) => q.eq("projectId", cs.projectId))
          .filter((q: any) => q.eq(q.field("title"), check.title))
          .first();
      }

      if (!el) {
        console.warn("Skipping base element check: Element not found (missing Id or Title match)");
        continue;
      }

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

  const normalizeElementId = (value: unknown): ElementId | null => {
    if (!value || typeof value !== "string") return null;
    try {
      return ctx.db.normalizeId("elements", value) as ElementId;
    } catch {
      return null;
    }
  };

  const resolveElementId = (ref: any): ElementId | null => {
    if (!ref) return null;
    if (typeof ref === "string") {
      return elementTempMap.get(ref) ?? normalizeElementId(ref);
    }
    if (ref.elementId) {
      return elementTempMap.get(ref.elementId) ?? normalizeElementId(ref.elementId);
    }
    if (ref.tempId) {
      return elementTempMap.get(ref.tempId) ?? normalizeElementId(ref.tempId);
    }
    return null;
  };
  const normalizeElementType = (value: any) => {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return "build";
    switch (raw) {
      case "build":
      case "rent":
      case "buy":
      case "print":
      case "transport":
      case "install":
      case "subcontract":
      case "mixed":
        return raw;
      case "purchase":
      case "procure":
      case "procurement":
        return "buy";
      case "vendor":
      case "external":
        return "subcontract";
      default:
        return "build";
    }
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
    const { tempId, element } = op.payload ?? {};

    const elementTitle = element?.title || "Untitled Element";
    const elementType = normalizeElementType(element?.type ?? "build");

    const elementId = await ctx.db.insert("elements", {
      projectId: cs.projectId,
      title: elementTitle,
      type: elementType,
      status: "approvedForQuote",
      tags: [],
      rev: 1,
      createdAt: now,
      updatedAt: now,
    });

    if (tempId) elementTempMap.set(tempId, elementId);
    elementsToBump.add(elementId);
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
        createdFromChangeSetId: sourceChangeSetId,
        createdAt: now,
      });
    }
    elementsToBump.add(elementId);
  }

  const pendingDeps: Array<{ taskId: TaskId; deps: string[] }> = [];
  for (const op of cs.ops) {
    if (op.kind !== "task.create") continue;
    const { tempId, elementTempOrId, elementId: directElementId, fields } = op.payload ?? {};

    const taskFields = fields && typeof fields === "object" ? fields : {};
    const title =
      String(taskFields?.title ?? taskFields?.titleHe ?? "").trim() || "Untitled Task";
    const description = toOptional(taskFields?.description ?? taskFields?.descriptionHe);
    const stageValue = taskFields?.stage ?? taskFields?.stageKey;
    const workTypeValue =
      typeof taskFields?.workType === "string"
        ? taskFields.workType
        : taskFields?.workType?.key;
    const workTypeLabelHeValue =
      taskFields?.workTypeLabelHe ??
      (taskFields?.workType && typeof taskFields.workType === "object"
        ? taskFields.workType.labelHe
        : undefined);
    const estimatedHoursValue = toOptional(
      taskFields?.estimatedHours ?? taskFields?.estimateHours
    );
    const dedupKey = taskFields?.dedupKey;

    const elementId = resolveElementId(elementTempOrId ?? directElementId) ?? undefined;

    let taskId: TaskId;
    let existingTask = null;
    if (elementId) {
      const existingTasks = await ctx.db.query("tasks")
        .withIndex("by_element", q => q.eq("elementId", elementId))
        .collect();

      const cleanTitle = title.trim().toLowerCase();
      if (dedupKey) {
        existingTask = existingTasks.find((t) => t.dedupKey === dedupKey) ?? null;
      } else if (cleanTitle) {
        existingTask =
          existingTasks.find((t) => t.title.trim().toLowerCase() === cleanTitle) ?? null;
      }
    }

    if (existingTask) {
      taskId = existingTask._id;
      const before = existingTask;
      const patch: any = {};
      if ("title" in taskFields || "titleHe" in taskFields) patch.title = toOptional(title);
      if ("description" in taskFields || "descriptionHe" in taskFields) {
        patch.description = description;
      }
      if ("status" in taskFields) patch.status = toOptional(taskFields.status);
      if ("priority" in taskFields) patch.priority = toOptional(taskFields.priority);
      if ("category" in taskFields) patch.category = toOptional(taskFields.category);
      if ("startDate" in taskFields) patch.startDate = withDefaultStartDate(taskFields.startDate);
      if ("endDate" in taskFields) patch.endDate = toOptional(taskFields.endDate);
      if ("estimatedHours" in taskFields || "estimateHours" in taskFields) {
        patch.estimatedHours = estimatedHoursValue;
      }
      if ("assignee" in taskFields) patch.assignee = toOptional(taskFields.assignee);
      // New V3 fields
      if ("stage" in taskFields || "stageKey" in taskFields) {
        patch.stage = normalizeStage(stageValue);
      }
      if ("workType" in taskFields || "workTypeKey" in taskFields) {
        patch.workType = normalizeWorkType(workTypeValue);
      }
      if ("workTypeLabelHe" in taskFields || "workType" in taskFields) {
        patch.workTypeLabelHe = toOptional(workTypeLabelHeValue);
      }
      if ("plannedStartDate" in taskFields) {
        patch.plannedStartDate = toOptional(taskFields?.plannedStartDate);
      }
      if ("plannedEndDate" in taskFields) {
        patch.plannedEndDate = toOptional(taskFields?.plannedEndDate);
      }
      if ("durationBucket" in taskFields) {
        patch.durationBucket = toOptional(taskFields?.durationBucket);
      }
      if ("checklist" in taskFields) patch.checklist = normalizeChecklist(taskFields?.checklist);
      if ("accountingLinks" in taskFields) {
        patch.accountingLinks = normalizeAccountingLinks(
          taskFields?.accountingLinks,
          materialLineTempMap,
          workLineTempMap
        );
      }
      if ("dedupKey" in taskFields) patch.dedupKey = toOptional(taskFields?.dedupKey);

      await ctx.db.patch(taskId, {
        ...patch,
        updatedAt: now,
      });
      const after = await ctx.db.get(taskId);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "update",
        entityRef: `task:${taskId}`,
        before,
        after,
        appliedAt: now,
      });
    } else {
      taskId = await ctx.db.insert("tasks", {
        projectId: cs.projectId,
        elementId,
        title,
        description,
        status: taskFields?.status ?? "TODO",
        priority: toOptional(taskFields?.priority),
        category: toOptional(taskFields?.category),
        startDate: withDefaultStartDate(taskFields?.startDate),
        endDate: toOptional(taskFields?.endDate),
        estimatedHours: estimatedHoursValue,
        assignee: toOptional(taskFields?.assignee),
        dependencies: undefined,
        // New V3 fields
        stage: normalizeStage(stageValue),
        workType: normalizeWorkType(workTypeValue),
        workTypeLabelHe: toOptional(workTypeLabelHeValue),
        plannedStartDate: toOptional(taskFields?.plannedStartDate),
        plannedEndDate: toOptional(taskFields?.plannedEndDate),
        durationBucket: toOptional(taskFields?.durationBucket),
        checklist: normalizeChecklist(taskFields?.checklist),
        accountingLinks: normalizeAccountingLinks(
          taskFields?.accountingLinks,
          materialLineTempMap,
          workLineTempMap
        ),
        dedupKey: toOptional(taskFields?.dedupKey),

        createdFromChangeSetId: sourceChangeSetId,
        createdAt: now,
        updatedAt: now,
      });
      const after = await ctx.db.get(taskId);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "create",
        entityRef: `task:${taskId}`,
        before: null,
        after,
        appliedAt: now,
      });
    }

    if (tempId) taskTempMap.set(tempId, taskId);
    if (title && !taskTitleMap.has(title)) taskTitleMap.set(title, taskId);
    if (elementId) elementsToBump.add(elementId);

    const depsSource = Array.isArray(taskFields?.dependencies)
      ? taskFields.dependencies
      : Array.isArray(taskFields?.dependencies?.afterTaskTempIds)
        ? taskFields.dependencies.afterTaskTempIds
        : [];
    const deps = depsSource.map((dep: any) => String(dep ?? "").trim()).filter(Boolean);
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
    const itemName = firstNonEmptyString([
      fields?.itemName,
      fields?.itemHe,
      fields?.titleHe,
      fields?.title,
      fields?.name,
    ]);
    if (!itemName) throw new Error("materialLine.create requires fields.itemName");

    const elementId = resolveElementId(elementTempOrId ?? directElementId) ?? undefined;
    const rawTaskId =
      resolveFromTemp(taskTempOrId, taskTempMap) ??
      resolveTaskRef(op.payload?.taskRef ?? fields?.taskRef, taskTempMap, taskTitleMap);
    const taskId = rawTaskId ? (ctx.db.normalizeId("tasks", rawTaskId) ?? undefined) : undefined;
    const elementScope = op.payload?.elementScope ?? fields?.elementScope;
    const forceProjectLevel =
      elementScope === "project" ||
      elementScope === "projectLevel" ||
      elementScope === "global" ||
      op.payload?.projectLevel === true ||
      fields?.projectLevel === true;
    const taskForElement = !elementId && !forceProjectLevel && taskId ? await ctx.db.get(taskId) : null;
    const resolvedElementId = elementId ?? (taskForElement?.elementId as any) ?? undefined;
    const rawVendorId =
      resolveFromTemp(fields.vendorTempOrId ?? fields.vendorId, vendorTempMap) ??
      fields.vendorId;
    const resolvedVendorId = rawVendorId
      ? (ctx.db.normalizeId("vendors", rawVendorId) ?? undefined)
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

    const normalizeKey = (value: any) => String(value ?? "").trim().toLowerCase();
    const dedupKey = fields?.dedupKey;
    let existingLine: any = null;
    if (resolvedElementId) {
      const candidates = await ctx.db
        .query("materialLines")
        .withIndex("by_element", (q) => q.eq("elementId", resolvedElementId))
        .collect();
      const cleanName = normalizeKey(itemName);
      existingLine = candidates.find((l: any) =>
        (dedupKey && l.dedupKey === dedupKey) ||
        (normalizeKey(l.itemName) === cleanName && String(l.taskId ?? "") === String(taskId ?? ""))
      );
    } else {
      const candidates = await ctx.db
        .query("materialLines")
        .withIndex("by_project", (q) => q.eq("projectId", cs.projectId))
        .collect();
      const cleanName = normalizeKey(itemName);
      existingLine = candidates.find((l: any) =>
        (!l.elementId) &&
        ((dedupKey && l.dedupKey === dedupKey) ||
        (normalizeKey(l.itemName) === cleanName && String(l.taskId ?? "") === String(taskId ?? "")))
      );
    }

    if (existingLine) {
      const before = existingLine;
      const patch: any = {
        elementId: resolvedElementId,
        taskId,
        sectionId,
        sectionKey,
        sectionLabelHe,
        workType: normalizeWorkType(fields.workType),
        workTypeLabelHe: fields.workTypeLabelHe ?? undefined,
        itemName: itemName ?? undefined,
        spec: fields.spec ?? undefined,
        templateId: fields.templateId ? ctx.db.normalizeId("materialTemplates", fields.templateId) : undefined,
        variantId: fields.variantId ? ctx.db.normalizeId("materialVariants", fields.variantId) : undefined,
        priceRecordId: fields.priceRecordId ? ctx.db.normalizeId("catalogPriceRecords", fields.priceRecordId) : undefined,
        quantity: fields.quantity ?? undefined,
        uomCode: normalizeUomCode(fields.uomCode ?? fields.unitCode),
        wastePct: fields.wastePct ?? undefined,
        plannedUnitCost: fields.plannedUnitCost ?? undefined,
        plannedTotalCost: fields.plannedTotalCost ?? undefined,
        vendorId: resolvedVendorId ?? undefined,
        vendorName: fields.vendorName ?? undefined,
        leadTimeDays: fields.leadTimeDays ?? undefined,
        procurementCode: normalizeProcurementCode(fields.procurementCode),
        procurementLabelHe: fields.procurementLabelHe ?? undefined,
        procurement: fields.procurement ?? (fields.procurementCode && !normalizeProcurementCode(fields.procurementCode) ? fields.procurementCode : undefined),
        notes: fields.notes ?? undefined,
        sourceCode: fields.sourceCode ?? undefined,
        sourceLabelHe: fields.sourceLabelHe ?? undefined,
        source: fields.source ?? undefined,
        pricingSourceCode: fields.pricingSourceCode ?? undefined,
        priceCheckedAt: fields.priceCheckedAt ?? undefined,
        priceUrl: fields.priceUrl ?? undefined,
        confidence: normalizeConfidence(fields.confidence),
        checklistItemId: fields.checklistItemId ?? undefined,
        dedupKey: toOptional(fields.dedupKey),
        updatedAt: now,
      };
      await ctx.db.patch(existingLine._id, patch);
      const after = await ctx.db.get(existingLine._id);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "update",
        entityRef: `materialLine:${existingLine._id}`,
        before,
        after,
        appliedAt: now,
      });
      if (tempId) materialLineTempMap.set(tempId, existingLine._id);
      if (resolvedElementId) elementsToBump.add(resolvedElementId);
      continue;
    }

    const lineId = await ctx.db.insert("materialLines", {
      projectId: cs.projectId,
      elementId: resolvedElementId,
      taskId,
      sectionId,
      sectionKey,
      sectionLabelHe,
      workType: normalizeWorkType(fields.workType),
      workTypeLabelHe: fields.workTypeLabelHe ?? undefined,
      itemName: itemName ?? undefined,
      spec: fields.spec ?? undefined,
      templateId: fields.templateId ? ctx.db.normalizeId("materialTemplates", fields.templateId) : undefined,
      variantId: fields.variantId ? ctx.db.normalizeId("materialVariants", fields.variantId) : undefined,
      priceRecordId: fields.priceRecordId ? ctx.db.normalizeId("catalogPriceRecords", fields.priceRecordId) : undefined,
      quantity: fields.quantity ?? undefined,
      uomCode: normalizeUomCode(fields.uomCode ?? fields.unitCode),
      wastePct: fields.wastePct ?? undefined,
      plannedUnitCost: fields.plannedUnitCost ?? undefined,
      plannedTotalCost: fields.plannedTotalCost ?? undefined,
      vendorId: resolvedVendorId ?? undefined,
      vendorName: fields.vendorName ?? undefined,
      leadTimeDays: fields.leadTimeDays ?? undefined,
      procurementCode: normalizeProcurementCode(fields.procurementCode),
      procurementLabelHe: fields.procurementLabelHe ?? undefined,
      procurement: fields.procurement ?? (fields.procurementCode && !normalizeProcurementCode(fields.procurementCode) ? fields.procurementCode : undefined),
      notes: fields.notes ?? undefined,
      sourceCode: fields.sourceCode ?? undefined,
      sourceLabelHe: fields.sourceLabelHe ?? undefined,
      source: fields.source ?? undefined,
      pricingSourceCode: fields.pricingSourceCode ?? undefined,
      priceCheckedAt: fields.priceCheckedAt ?? undefined,
      priceUrl: fields.priceUrl ?? undefined,
      confidence: normalizeConfidence(fields.confidence),
      checklistItemId: fields.checklistItemId ?? undefined,
      createdFromChangeSetId: sourceChangeSetId,
      dedupKey: toOptional(fields.dedupKey),
      createdAt: now,
      updatedAt: now,
    });

    const after = await ctx.db.get(lineId);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "create",
      entityRef: `materialLine:${lineId}`,
      before: null,
      after,
      appliedAt: now,
    });

    if (tempId) materialLineTempMap.set(tempId, lineId);
    if (resolvedElementId) elementsToBump.add(resolvedElementId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "workLine.create") continue;
    const { tempId, elementTempOrId, taskTempOrId, elementId: directElementId, fields: rawFields } =
      op.payload ?? {};

    const elementId = resolveElementId(elementTempOrId ?? directElementId) ?? undefined;
    const rawTaskId =
      resolveFromTemp(taskTempOrId, taskTempMap) ??
      resolveTaskRef(op.payload?.taskRef ?? rawFields?.taskRef, taskTempMap, taskTitleMap);
    const taskId = rawTaskId ? (ctx.db.normalizeId("tasks", rawTaskId) ?? undefined) : undefined;
    const taskForRole = taskId ? await ctx.db.get(taskId) : null;
    const fields = normalizeWorkLineFieldsForApply(rawFields, taskForRole?.title);
    if (!fields?.roleHe && !fields?.dedupKey) {
      throw new Error("workLine.create requires fields.roleHe or fields.dedupKey");
    }
    const elementScope = op.payload?.elementScope ?? fields?.elementScope;
    const forceProjectLevel =
      elementScope === "project" ||
      elementScope === "projectLevel" ||
      elementScope === "global" ||
      op.payload?.projectLevel === true ||
      fields?.projectLevel === true;
    const taskForElement = !elementId && !forceProjectLevel && taskId ? await ctx.db.get(taskId) : null;
    const resolvedElementId = elementId ?? (taskForElement?.elementId as any) ?? undefined;
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

    const normalizeKey = (value: any) => String(value ?? "").trim().toLowerCase();
    const dedupKey = fields?.dedupKey;
    let existingLine: any = null;
    if (resolvedElementId) {
      const candidates = await ctx.db
        .query("workLines")
        .withIndex("by_element", (q) => q.eq("elementId", resolvedElementId))
        .collect();
      const cleanRole = normalizeKey(fields.roleHe);
      if (dedupKey) {
        existingLine = candidates.find((l: any) => l.dedupKey === dedupKey) ?? null;
      } else if (cleanRole) {
        existingLine = candidates.find((l: any) =>
          normalizeKey(l.roleHe) === cleanRole && String(l.taskId ?? "") === String(taskId ?? "")
        ) ?? null;
      }
    } else {
      const candidates = await ctx.db
        .query("workLines")
        .withIndex("by_project", (q) => q.eq("projectId", cs.projectId))
        .collect();
      const cleanRole = normalizeKey(fields.roleHe);
      if (dedupKey) {
        existingLine = candidates.find((l: any) => !l.elementId && l.dedupKey === dedupKey) ?? null;
      } else if (cleanRole) {
        existingLine = candidates.find((l: any) =>
          !l.elementId &&
          normalizeKey(l.roleHe) === cleanRole &&
          String(l.taskId ?? "") === String(taskId ?? "")
        ) ?? null;
      }
    }

    if (existingLine) {
      const before = existingLine;
      const patch: any = {
        elementId: resolvedElementId,
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
        confidence: normalizeConfidence(fields.confidence),
        status: fields.status ?? undefined,
        assignee: fields.assignee ?? undefined,
        assigneeId: fields.assigneeId ?? undefined,
        dedupKey: toOptional(fields.dedupKey),
        updatedAt: now,
      };
      await ctx.db.patch(existingLine._id, patch);
      const after = await ctx.db.get(existingLine._id);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "update",
        entityRef: `workLine:${existingLine._id}`,
        before,
        after,
        appliedAt: now,
      });
      if (tempId) workLineTempMap.set(tempId, existingLine._id);
      if (resolvedElementId) elementsToBump.add(resolvedElementId);
      continue;
    }

    const lineId = await ctx.db.insert("workLines", {
      projectId: cs.projectId,
      elementId: resolvedElementId,
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
      confidence: normalizeConfidence(fields.confidence),
      status: fields.status ?? undefined,
      assignee: fields.assignee ?? undefined,
      assigneeId: fields.assigneeId ?? undefined,
      createdFromChangeSetId: sourceChangeSetId,
      dedupKey: toOptional(fields.dedupKey),
      createdAt: now,
      updatedAt: now,
    });

    const after = await ctx.db.get(lineId);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "create",
      entityRef: `workLine:${lineId}`,
      before: null,
      after,
      appliedAt: now,
    });

    if (tempId) workLineTempMap.set(tempId, lineId);
    if (resolvedElementId) elementsToBump.add(resolvedElementId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "task.patch") continue;
    const { taskTempOrId, taskId: directTaskId, fields } = op.payload ?? {};
    const resolvedTaskId = resolveFromTemp(taskTempOrId ?? directTaskId, taskTempMap);
    if (!resolvedTaskId) throw new Error("task.patch requires taskId or taskTempOrId");
    if (!fields || typeof fields !== "object") continue;

    const before = await ctx.db.get(resolvedTaskId);
    const patch: any = {};
    if ("title" in fields) patch.title = toOptional(fields.title);
    if ("description" in fields) patch.description = toOptional(fields.description);
    if ("status" in fields) patch.status = toOptional(fields.status);
    if ("priority" in fields) patch.priority = toOptional(fields.priority);
    if ("category" in fields) patch.category = toOptional(fields.category);
    if ("startDate" in fields) patch.startDate = toOptional(fields.startDate);
    if ("endDate" in fields) patch.endDate = toOptional(fields.endDate);
    if ("estimatedHours" in fields) patch.estimatedHours = toOptional(fields.estimatedHours);
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
    const after = await ctx.db.get(resolvedTaskId);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "update",
      entityRef: `task:${resolvedTaskId}`,
      before,
      after,
      appliedAt: now,
    });
  }

  for (const op of cs.ops) {
    if (op.kind !== "workLine.patch") continue;
    const { lineId, workLineId, tempId, id, fields } = op.payload ?? {};
    const resolved = resolveFromTemp(tempId ?? workLineId ?? lineId ?? id, workLineTempMap);
    if (!resolved) throw new Error("workLine.patch requires lineId");
    if (!fields || typeof fields !== "object") continue;

    const before = await ctx.db.get(resolved);
    const normalizedFields = normalizeWorkLineFieldsForApply(fields);
    const patch: any = {};
    if (
      "roleHe" in fields ||
      "titleHe" in fields ||
      "title" in fields ||
      "role" in fields ||
      normalizedFields.roleHe !== undefined
    ) {
      patch.roleHe = toOptional(normalizedFields.roleHe);
    }
    if ("notes" in fields) patch.notes = toOptional(fields.notes);
    if ("status" in fields) patch.status = toOptional(fields.status);
    if ("assignee" in fields) patch.assignee = toOptional(fields.assignee);
    if ("assigneeId" in fields) patch.assigneeId = toOptional(fields.assigneeId);
    if (
      "plannedQuantity" in fields ||
      "plannedQuantityDays" in fields ||
      "days" in fields ||
      "qty" in fields ||
      normalizedFields.plannedQuantity !== undefined
    ) {
      patch.plannedQuantity = toOptional(normalizedFields.plannedQuantity);
    }
    if (
      "plannedUnitCost" in fields ||
      "plannedDayRate" in fields ||
      "dayRate" in fields ||
      "rate" in fields ||
      normalizedFields.plannedUnitCost !== undefined
    ) {
      patch.plannedUnitCost = toOptional(normalizedFields.plannedUnitCost);
    }
    if (
      "plannedTotalCost" in fields ||
      "total" in fields ||
      normalizedFields.plannedTotalCost !== undefined
    ) {
      patch.plannedTotalCost = toOptional(normalizedFields.plannedTotalCost);
    }
    if ("confidence" in fields) patch.confidence = normalizeConfidence(fields.confidence);
    if ("workType" in fields || "workTypeKey" in fields || normalizedFields.workType !== undefined) {
      patch.workType = normalizedFields.workType ? normalizeWorkType(normalizedFields.workType) : undefined;
    }
    if ("workTypeLabelHe" in fields) patch.workTypeLabelHe = toOptional(fields.workTypeLabelHe);

    await ctx.db.patch(resolved, { ...patch, updatedAt: now });
    const after = await ctx.db.get(resolved);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "update",
      entityRef: `workLine:${resolved}`,
      before,
      after,
      appliedAt: now,
    });
  }

  for (const op of cs.ops) {
    if (op.kind !== "materialLine.patch") continue;
    const { lineId, materialLineId, tempId, id, fields } = op.payload ?? {};
    const resolved = resolveFromTemp(tempId ?? materialLineId ?? lineId ?? id, materialLineTempMap);
    if (!resolved) throw new Error("materialLine.patch requires lineId");
    if (!fields || typeof fields !== "object") continue;

    const before = await ctx.db.get(resolved);
    const patch: any = {};
    if ("itemName" in fields) patch.itemName = toOptional(fields.itemName);
    if ("spec" in fields) patch.spec = toOptional(fields.spec);
    if ("quantity" in fields) patch.quantity = toOptional(fields.quantity);
    if ("uomCode" in fields || "unitCode" in fields) {
      patch.uomCode = normalizeUomCode(fields.uomCode ?? fields.unitCode);
    }
    if ("plannedUnitCost" in fields) patch.plannedUnitCost = toOptional(fields.plannedUnitCost);
    if ("plannedTotalCost" in fields) patch.plannedTotalCost = toOptional(fields.plannedTotalCost);
    if ("vendorName" in fields) patch.vendorName = toOptional(fields.vendorName);
    if ("notes" in fields) patch.notes = toOptional(fields.notes);
    if ("workType" in fields) patch.workType = normalizeWorkType(fields.workType);
    if ("templateId" in fields) patch.templateId = fields.templateId ? ctx.db.normalizeId("materialTemplates", fields.templateId) : undefined;
    if ("variantId" in fields) patch.variantId = fields.variantId ? ctx.db.normalizeId("materialVariants", fields.variantId) : undefined;
    if ("priceRecordId" in fields) patch.priceRecordId = fields.priceRecordId ? ctx.db.normalizeId("catalogPriceRecords", fields.priceRecordId) : undefined;
    if ("pricingSourceCode" in fields) patch.pricingSourceCode = toOptional(fields.pricingSourceCode);
    if ("priceCheckedAt" in fields) patch.priceCheckedAt = toOptional(fields.priceCheckedAt);
    if ("priceUrl" in fields) patch.priceUrl = toOptional(fields.priceUrl);
    if ("confidence" in fields) patch.confidence = normalizeConfidence(fields.confidence);

    await ctx.db.patch(resolved, { ...patch, updatedAt: now });
    const after = await ctx.db.get(resolved);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "update",
      entityRef: `materialLine:${resolved}`,
      before,
      after,
      appliedAt: now,
    });
  }

  // DELETE Handlers
  for (const op of cs.ops) {
    if (op.kind !== "task.delete") continue;
    const { taskId, taskTempOrId, id } = op.payload ?? {};
    const resolved = resolveFromTemp(taskTempOrId ?? taskId ?? id, taskTempMap);
    if (!resolved) throw new Error("task.delete requires taskId or taskTempOrId");

    // Check if task exists before deleting to be safe, or just delete (idempotent if already gone?)
    // Convex delete throws if not found? No, check docs. Usually better to check.
    // However, for bulk ops, maybe we just try. 
    // Let's rely on standard Convex behavior: delete(id) works if id is valid.
    // If we resolved it, it's an ID.
    const existing = await ctx.db.get(resolved);
    if (existing) {
      await ctx.db.delete(resolved);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "softDelete",
        entityRef: `task:${resolved}`,
        before: existing,
        after: null,
        appliedAt: now,
      });
      // Should we cleanup links? For now, raw delete as requested.
      // Elements that owned this task might need bumping?
      if (existing.elementId) elementsToBump.add(existing.elementId);
    }
  }

  for (const op of cs.ops) {
    if (op.kind !== "materialLine.delete") continue;
    const { lineId, materialLineId, tempId, id } = op.payload ?? {};
    const resolved = resolveFromTemp(tempId ?? materialLineId ?? lineId ?? id, materialLineTempMap);
    if (!resolved) throw new Error("materialLine.delete requires lineId");

    const existing = await ctx.db.get(resolved);
    if (existing) {
      await ctx.db.delete(resolved);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "softDelete",
        entityRef: `materialLine:${resolved}`,
        before: existing,
        after: null,
        appliedAt: now,
      });
      if (existing.elementId) elementsToBump.add(existing.elementId);
    }
  }

  for (const op of cs.ops) {
    if (op.kind !== "workLine.delete") continue;
    const { lineId, workLineId, tempId, id } = op.payload ?? {};
    const resolved = resolveFromTemp(tempId ?? workLineId ?? lineId ?? id, workLineTempMap);
    if (!resolved) throw new Error("workLine.delete requires lineId");

    const existing = await ctx.db.get(resolved);
    if (existing) {
      await ctx.db.delete(resolved);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "softDelete",
        entityRef: `workLine:${resolved}`,
        before: existing,
        after: null,
        appliedAt: now,
      });
      if (existing.elementId) elementsToBump.add(existing.elementId);
    }
  }

  for (const op of cs.ops) {
    if (op.kind !== "accountingLine.delete") continue;
    const { lineId, accountingLineId, id } = op.payload ?? {};
    const resolved = accountingLineId ?? lineId ?? id; // Accounting lines rarely use tempIds in current flows?
    if (!resolved) throw new Error("accountingLine.delete requires lineId");

    const existing = await ctx.db.get(resolved);
    if (existing) {
      await ctx.db.delete(resolved);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "softDelete",
        entityRef: `accountingLine:${resolved}`,
        before: existing,
        after: null,
        appliedAt: now,
      });
      if (existing.elementId) elementsToBump.add(existing.elementId);
    }
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
    const rawTaskId =
      resolveFromTemp(taskTempOrId, taskTempMap) ??
      resolveTaskRef(op.payload?.taskRef ?? fields?.taskRef, taskTempMap, taskTitleMap);
    const taskId = rawTaskId ? (ctx.db.normalizeId("tasks", rawTaskId) ?? undefined) : undefined;
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
      else if (fields.itemName || fields.vendorSku || fields.uomCode || fields.unitCode) {
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
      ? (ctx.db.normalizeId("vendors", rawVendorId) ?? undefined)
      : undefined;

    let existing = null;
    if (elementId) {
      const lines = await ctx.db.query("accountingLines")
        .withIndex("by_element", q => q.eq("elementId", elementId))
        .collect();

      const cleanTitle = fields.title.trim().toLowerCase();
      const dedupKey = fields.dedupKey;

      existing = lines.find(l =>
        (dedupKey && l.dedupKey === dedupKey) ||
        (l.title.trim().toLowerCase() === cleanTitle && l.type === type && l.taskId === taskId)
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
      const before = existing;
      const patch: any = {};
      if ("title" in fields) patch.title = toOptional(fields.title);
      if ("qty" in fields) patch.qty = fields.qty === null ? undefined : fields.qty;
      if ("unitCost" in fields) patch.unitCost = fields.unitCost === null ? undefined : fields.unitCost;
      if ("total" in fields) patch.total = Number(total);
      if ("billable" in fields) patch.billable = fields.billable === null ? undefined : fields.billable;

      patch.sectionId = sectionId;
      patch.sectionKey = sectionKey;
      patch.sectionLabelHe = sectionLabelHe;

      // V3 Patches
      if ("itemName" in fields) patch.itemName = fields.itemName === null ? undefined : fields.itemName;
      if ("spec" in fields) patch.spec = fields.spec === null ? undefined : fields.spec;
      if ("unit" in fields) patch.unit = fields.unit === null ? undefined : fields.unit;
      if ("unitCostEstimate" in fields) patch.unitCostEstimate = fields.unitCostEstimate === null ? undefined : fields.unitCostEstimate;
      if ("wastePct" in fields) patch.wastePct = fields.wastePct === null ? undefined : fields.wastePct;
      if ("vendorId" in fields) patch.vendorId = resolvedVendorId ?? undefined;
      if ("vendorName" in fields) patch.vendorName = fields.vendorName === null ? undefined : fields.vendorName;
      if ("vendorSku" in fields) patch.vendorSku = fields.vendorSku === null ? undefined : fields.vendorSku;
      if ("vendorUrl" in fields) patch.vendorUrl = fields.vendorUrl === null ? undefined : fields.vendorUrl;
      if ("leadTimeDays" in fields) patch.leadTimeDays = fields.leadTimeDays === null ? undefined : fields.leadTimeDays;
      if ("workType" in fields) patch.workType = normalizeWorkType(fields.workType);
      if ("hours" in fields) patch.hours = fields.hours === null ? undefined : fields.hours;
      if ("crewSize" in fields) patch.crewSize = fields.crewSize === null ? undefined : fields.crewSize;
      if ("ratePerHour" in fields) patch.ratePerHour = fields.ratePerHour === null ? undefined : fields.ratePerHour;
      if ("source" in fields) patch.source = fields.source === null ? undefined : fields.source;
      if ("confidence" in fields) patch.confidence = normalizeConfidence(fields.confidence);
      if ("notes" in fields) patch.notes = fields.notes === null ? undefined : fields.notes;
      if ("dedupKey" in fields) patch.dedupKey = toOptional(fields?.dedupKey);

      await ctx.db.patch(existing._id, {
        ...patch,
        updatedAt: now,
      });
      const after = await ctx.db.get(existing._id);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "update",
        entityRef: `accountingLine:${existing._id}`,
        before,
        after,
        appliedAt: now,
      });
    } else {
      const accountingLineId = await ctx.db.insert("accountingLines", {
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
        confidence: normalizeConfidence(fields.confidence),
        notes: fields.notes === null ? undefined : fields.notes,
        dedupKey: toOptional(fields?.dedupKey),

        createdFromChangeSetId: sourceChangeSetId,
        createdAt: now,
        updatedAt: now,
      });
      const after = await ctx.db.get(accountingLineId);
      await recordAudit(ctx, {
        projectId: cs.projectId,
        changeSetId: auditChangeSetId,
        operation: "create",
        entityRef: `accountingLine:${accountingLineId}`,
        before: null,
        after,
        appliedAt: now,
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

    const isMaterial = !!ctx.db.normalizeId("materialLines", resolvedLineId);
    const isLabor = !!ctx.db.normalizeId("workLines", resolvedLineId);

    const rawVendorId =
      resolveFromTemp(fields.vendorTempOrId ?? fields.vendorId, vendorTempMap) ??
      fields.vendorId;

    // Validate ID
    const resolvedVendorId = rawVendorId
      ? (ctx.db.normalizeId("vendors", rawVendorId) ?? undefined)
      : undefined;

    const patch: any = {};

    // Common fields
    if ("notes" in fields) patch.notes = toOptional(fields.notes);

    // Vendor handling
    if ("vendorId" in fields || "vendorTempOrId" in fields) {
      patch.vendorId = toOptional(resolvedVendorId);
    }
    if ("vendorName" in fields) patch.vendorName = toOptional(fields.vendorName);

    if (isMaterial) {
      if ("qty" in fields || "quantity" in fields) patch.quantity = toOptional(fields.quantity ?? fields.qty);
      if ("unitCost" in fields || "plannedUnitCost" in fields) patch.plannedUnitCost = toOptional(fields.plannedUnitCost ?? fields.unitCost);
      if ("total" in fields || "plannedTotalCost" in fields) patch.plannedTotalCost = toOptional(fields.plannedTotalCost ?? fields.total);
      if ("itemName" in fields || "title" in fields) patch.itemName = toOptional(fields.itemName ?? fields.title);
      if ("spec" in fields) patch.spec = toOptional(fields.spec);
      if ("uomCode" in fields || "unitCode" in fields) {
        patch.uomCode = normalizeUomCode(fields.uomCode ?? fields.unitCode);
      }
      // ... match other materialLines fields
      if ("actualUnitCost" in fields) patch.actualUnitCost = toOptional(fields.actualUnitCost);
      if ("actualTotalCost" in fields) patch.actualTotalCost = toOptional(fields.actualTotalCost);
      if ("dedupKey" in fields) patch.dedupKey = toOptional(fields.dedupKey);
    } else if (isLabor) {
      if ("qty" in fields || "plannedQuantity" in fields || "plannedQuantityDays" in fields || "days" in fields) {
        patch.plannedQuantity = toOptional(fields.plannedQuantity ?? fields.plannedQuantityDays ?? fields.days ?? fields.qty);
      }
      if ("unitCost" in fields || "plannedUnitCost" in fields || "plannedDayRate" in fields || "dayRate" in fields || "rate" in fields) {
        patch.plannedUnitCost = toOptional(fields.plannedUnitCost ?? fields.plannedDayRate ?? fields.dayRate ?? fields.rate ?? fields.unitCost);
      }
      if ("total" in fields || "plannedTotalCost" in fields) patch.plannedTotalCost = toOptional(fields.plannedTotalCost ?? fields.total);
      if ("roleHe" in fields || "titleHe" in fields || "title" in fields || "role" in fields) {
        patch.roleHe = toOptional(fields.roleHe ?? fields.titleHe ?? fields.title ?? fields.role);
      }
      if ("dedupKey" in fields) patch.dedupKey = toOptional(fields.dedupKey);
      // ... match other workLines fields
    } else {
      // Assume accountingLines
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
      if ("confidence" in fields) patch.confidence = normalizeConfidence(fields.confidence);
      if ("dedupKey" in fields) patch.dedupKey = toOptional(fields.dedupKey);
    }

    patch.updatedAt = now;
    const before = await ctx.db.get(resolvedLineId);
    await ctx.db.patch(resolvedLineId, { ...patch });
    const after = await ctx.db.get(resolvedLineId);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "update",
      entityRef: `accountingLine:${resolvedLineId}`,
      before,
      after,
      appliedAt: now,
    });

    // Fetch line to identify element for bumping
    if (after?.elementId) {
      elementsToBump.add(after.elementId);
    }
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
      createdFromChangeSetId: sourceChangeSetId,
      createdAt: now,
      updatedAt: now,
    });

    const afterPurchase = await ctx.db.get(purchaseId);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "create",
      entityRef: `purchase:${purchaseId}`,
      before: null,
      after: afterPurchase,
      appliedAt: now,
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
      createdFromChangeSetId: sourceChangeSetId,
      createdAt: now,
    });
  }

  for (const op of cs.ops) {
    if (op.kind !== "catalogPriceRecord.create") continue;
    const fields = op.payload?.fields ?? op.payload ?? {};
    const rawVariantId = fields.variantId;
    const rawTemplateId = fields.templateId;
    let variantId: Id<"materialVariants"> | undefined;
    if (rawVariantId) {
      try {
        variantId = ctx.db.normalizeId("materialVariants", rawVariantId);
      } catch (error) {
        console.warn("Skipping invalid variantId in catalogPriceRecord.create");
      }
    }
    let templateId: Id<"materialTemplates"> | undefined;
    if (rawTemplateId) {
      try {
        templateId = ctx.db.normalizeId("materialTemplates", rawTemplateId);
      } catch (error) {
        console.warn("Skipping invalid templateId in catalogPriceRecord.create");
      }
    }
    if (fields.url) {
      const existing = await ctx.db
        .query("catalogPriceRecords")
        .filter((q: any) => q.eq(q.field("url"), fields.url))
        .first();
      if (existing) continue;
    }
    await ctx.db.insert("catalogPriceRecords", {
      variantId: variantId ?? undefined,
      templateId: templateId ?? undefined,
      vendorId: fields.vendorId ?? undefined,
      sourceType: fields.sourceType ?? "web",
      checkedAt: fields.checkedAt ?? now,
      currency: fields.currency ?? "NIS",
      pricingModel: normalizePricingModel(fields.pricingModel) ?? "unknown",
      amount: fields.amount ?? undefined,
      minQty: fields.minQty ?? undefined,
      packSize: fields.packSize ?? undefined,
      setupFee: fields.setupFee ?? undefined,
      availability: fields.availability ?? undefined,
      leadTimeDays: fields.leadTimeDays ?? undefined,
      orderMethod: fields.orderMethod ?? undefined,
      orderUrl: fields.orderUrl ?? undefined,
      shippingAvailable: fields.shippingAvailable ?? undefined,
      shippingCost: fields.shippingCost ?? undefined,
      pickupAvailable: fields.pickupAvailable ?? undefined,
      pickupLocationId: fields.pickupLocationId ?? undefined,
      url: fields.url ?? undefined,
      title: fields.title ?? undefined,
      domain: fields.domain ?? undefined,
      rawSnippet: fields.rawSnippet ?? undefined,
      extractedFields: fields.extractedFields ?? undefined,
      confidence: normalizePriceConfidence(fields.confidence),
      notesHe: fields.notesHe ?? undefined,
      createdBy: fields.createdBy ?? "agent",
      sourceRef: fields.sourceRef ?? undefined,
      urlHash: fields.urlHash ?? undefined,
      offerFingerprint: fields.offerFingerprint ?? undefined,
      createdAt: now,
    });
  }

  for (const op of cs.ops) {
    if (op.kind !== "element.patch") continue;
    const { elementTempOrId, elementId: directElementId, patch } = op.payload ?? {};
    const elementId = resolveElementId(elementTempOrId ?? directElementId);

    if (!elementId) throw new Error("element.patch requires elementId or elementTempOrId");

    const element = await ctx.db.get(elementId);
    if (!element) throw new Error("element.patch element not found");

    if (patch && Object.keys(patch).length > 0) {
      if ("type" in patch) {
        patch.type = normalizeElementType((patch as any).type);
      }
      await ctx.db.patch(elementId, {
        ...patch,
        updatedAt: now,
      });
    }

    const after = await ctx.db.get(elementId);
    await recordAudit(ctx, {
      projectId: cs.projectId,
      changeSetId: auditChangeSetId,
      operation: "update",
      entityRef: `element:${elementId}`,
      before: element,
      after,
      appliedAt: now,
    });

    elementsToBump.add(elementId);
  }

  for (const op of cs.ops) {
    if (op.kind !== "taskAccountingLink.create") continue;

    // Payload can be directly fields (if normalized) or wrapped
    const fields = op.payload.fields ?? op.payload;

    // Resolve Task ID (might be temp from this changeset)
    const rawTaskId = resolveFromTemp(fields.taskId ?? fields.taskTempOrId, taskTempMap) ?? fields.taskId;
    const taskId = rawTaskId ? (ctx.db.normalizeId("tasks", rawTaskId) ?? undefined) : undefined;

    // Resolve WorkLine ID (usually existing, but support temp)
    const rawWorkLineId = resolveFromTemp(fields.workLineId, workLineTempMap) ?? fields.workLineId;
    const workLineId = rawWorkLineId ? (ctx.db.normalizeId("workLines", rawWorkLineId) ?? undefined) : undefined;

    if (!taskId || !workLineId) {
      console.warn("Skipping taskAccountingLink.create: Missing taskId or workLineId", fields);
      continue;
    }

    const lineType = fields.lineType === "labor" ? "labor" : "material"; // default/fallback logic if needed, but schema enforces union? No, helper does.
    // Schema says v.union(v.literal("labor"), v.literal("material"))

    // Check overlap to avoid duplicates
    const existing = await ctx.db
      .query("taskAccountingLinks")
      .withIndex("by_project_task", (q: any) => q.eq("projectId", cs.projectId).eq("taskId", taskId))
      .filter((q: any) =>
        q.eq(q.field("workLineId"), workLineId)
      )
      .first();

    if (!existing) {
      await ctx.db.insert("taskAccountingLinks", {
        projectId: cs.projectId,
        taskId,
        lineType: fields.lineType ?? "labor", // Defaulting to labor per skill purpose, but respected if passed
        workLineId,
        allocatedHours: fields.allocatedHours ? Number(fields.allocatedHours) : undefined,
        createdBy: "ai",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Upsert behavior: update if exists
      const patch: any = {};
      if (fields.allocatedHours !== undefined) patch.allocatedHours = Number(fields.allocatedHours);
      if (fields.lineType !== undefined) patch.lineType = fields.lineType;

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, {
          ...patch,
          updatedAt: now,
        });
      }
    }
  }

  for (const op of cs.ops) {
    if (op.kind !== "taskAccountingLink.delete") continue;
    const fields = op.payload.fields ?? op.payload;

    if (fields.linkId) {
      await ctx.db.delete(fields.linkId);
      continue;
    }

    if (fields.taskId && fields.workLineId) {
      // Find by composite key
      const rawTaskId = resolveFromTemp(fields.taskId ?? fields.taskTempOrId, taskTempMap) ?? fields.taskId;
      const taskId = ctx.db.normalizeId("tasks", rawTaskId);

      const rawWorkLineId = resolveFromTemp(fields.workLineId, workLineTempMap) ?? fields.workLineId;
      const workLineId = ctx.db.normalizeId("workLines", rawWorkLineId);

      if (taskId && workLineId) {
        const existing = await ctx.db
          .query("taskAccountingLinks")
          .withIndex("by_project_task", (q: any) => q.eq("projectId", cs.projectId).eq("taskId", taskId))
          .filter((q: any) => q.eq(q.field("workLineId"), workLineId))
          .collect(); // collect all duplicates just in case

        for (const link of existing) {
          await ctx.db.delete(link._id);
        }
      }
    }
  }

  // Bump Revisions for all affected elements (once per element)
  for (const elementId of elementsToBump) {
    if (!elementId) continue;
    const el = await ctx.db.get(elementId as ElementId);
    if (el) {
      await ctx.db.patch(el._id, {
        rev: (el.rev ?? 0) + 1,
        hasUnapprovedChanges: false,
        updatedAt: Date.now(),
      });
    }
  }

  await ctx.db.patch(cs._id, {
    status: "APPLIED",
    appliedAt: Date.now(),
  });

  await ctx.scheduler.runAfter(0, internal.projectsStage.recomputeStage, { projectId: cs.projectId });
}

export const applyChangeSet = mutation({
  args: {
    changeSetId: v.id("changeSets"),
  },
  handler: async (ctx, args) => {
    return await applyChangeSetInternalLogic(ctx, args);
  },
});

function normalizeChangeGroupOps(ops: any[]) {
  const normalized: any[] = [];
  for (const op of ops ?? []) {
    if (!op) continue;
    if (op.kind) {
      normalized.push(op);
      continue;
    }
    if (!op.op || !op.entity) {
      throw new Error("Unsupported changeGroup operation format");
    }

    const entityType = op.entity.entityType;
    const entityId = op.entity.id;
    const naturalKey = op.entity.naturalKey;

    if (op.op === "create") {
      const value = op.value ?? {};
      if (entityType === "task") {
        const { elementId, elementTempOrId, ...fields } = value ?? {};
        normalized.push({
          kind: "task.create",
          payload: {
            tempId: naturalKey,
            elementId,
            elementTempOrId,
            fields,
          },
        });
      } else if (entityType === "accountingLine") {
        const { elementId, elementTempOrId, taskTempOrId, taskId, ...fields } = value ?? {};
        normalized.push({
          kind: "accountingLine.create",
          payload: {
            elementId,
            elementTempOrId,
            taskTempOrId: taskTempOrId ?? taskId,
            fields,
          },
        });
      } else if (entityType === "element") {
        const { element, draft } = value ?? {};
        normalized.push({
          kind: "element.create",
          payload: {
            tempId: naturalKey,
            element: element ?? value,
            draft,
          },
        });
      } else {
        throw new Error(`Unsupported create entityType: ${entityType}`);
      }
      continue;
    }

    if (op.op === "update") {
      const patch = op.patch ?? op.value ?? {};
      if (entityType === "task") {
        normalized.push({
          kind: "task.patch",
          payload: {
            taskId: entityId,
            taskTempOrId: naturalKey,
            fields: patch,
          },
        });
      } else if (entityType === "accountingLine") {
        normalized.push({
          kind: "accountingLine.patch",
          payload: {
            accountingLineId: entityId,
            lineId: entityId,
            fields: patch,
          },
        });
      } else if (entityType === "element") {
        normalized.push({
          kind: "element.patch",
          payload: {
            elementId: entityId,
            elementTempOrId: naturalKey,
            patch,
          },
        });
      } else {
        throw new Error(`Unsupported update entityType: ${entityType}`);
      }
      continue;
    }

    if (op.op === "softDelete") {
      if (entityType === "task") {
        normalized.push({
          kind: "task.patch",
          payload: {
            taskId: entityId,
            taskTempOrId: naturalKey,
            fields: { status: "archived" },
          },
        });
      } else if (entityType === "element") {
        normalized.push({
          kind: "element.patch",
          payload: {
            elementId: entityId,
            elementTempOrId: naturalKey,
            patch: { status: "archived" },
          },
        });
      } else if (entityType === "accountingLine") {
        normalized.push({
          kind: "accountingLine.patch",
          payload: {
            accountingLineId: entityId,
            lineId: entityId,
            fields: { billable: false, notes: "archived" },
          },
        });
      } else {
        throw new Error(`Unsupported softDelete entityType: ${entityType}`);
      }
      continue;
    }

    throw new Error(`Unsupported operation: ${op.op}`);
  }
  return normalized;
}

export const updateChangeSetOp = mutation({
  args: {
    changeSetId: v.id("changeSets"),
    opIndex: v.number(),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const cs = await ctx.db.get(args.changeSetId);
    if (!cs) throw new Error("ChangeSet not found");
    if (!cs.ops) throw new Error("No ops in ChangeSet");
    if (args.opIndex < 0 || args.opIndex >= cs.ops.length) throw new Error("Invalid opIndex");

    const newOps = [...cs.ops];
    const op = newOps[args.opIndex];

    // Deep merge patch into payload
    // Simple shallow merge for now, but usually fields are in payload.fields
    // We assume patch is the new fields object or part of it
    // Let's assume patch is { fields: { ... } } or similar structure
    // Or just merge at top level of op.payload

    // If patch has "fields", we merge fields
    const currentPayload = op.payload ?? {};
    const patchPayload = args.patch.payload ?? args.patch; // flexible input

    const nextPayload = { ...currentPayload };

    if (patchPayload.fields) {
      nextPayload.fields = { ...(currentPayload.fields ?? {}), ...patchPayload.fields };
    } else {
      // Fallback: merge top level keys if not using fields structure
      Object.assign(nextPayload, patchPayload);
    }

    newOps[args.opIndex] = {
      ...op,
      payload: nextPayload
    };

    await ctx.db.patch(args.changeSetId, {
      ops: newOps,
      updatedAt: Date.now(),
    });
  },
});

// Helper for applying a list of Ops (derived from applying a whole changeset)
async function applyOpsList(ctx: any, args: { projectId: Id<"projects">, ops: any[], stage: string, sourceChangeSetId?: Id<"changeSets"> }) {
  // Hack: create temp changeset to reuse logic
  const tempId = await ctx.db.insert("changeSets", {
    projectId: args.projectId,
    stage: args.stage as any,
    status: "PROPOSED", // Must be proposed to apply
    ops: args.ops,
    reason_he: "Partial Apply Temp",
    sourceChangeSetId: args.sourceChangeSetId,
    createdAt: Date.now()
  });

  await applyChangeSetInternalLogic(ctx, { changeSetId: tempId });

  await ctx.db.patch(tempId, {
    status: "APPLIED",
    appliedAt: Date.now(),
    reason_he: "Partial application of group(s)"
  });
}

function collectReferencedTempIds(value: any): Set<string> {
  const refs = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [rawKey, rawVal] of Object.entries(node)) {
      const key = rawKey.toLowerCase();
      if (
        typeof rawVal === "string" &&
        (key.includes("temporid") || key.endsWith("tempid"))
      ) {
        refs.add(rawVal);
      } else if (typeof rawVal === "object") {
        visit(rawVal);
      }
    }
  };
  visit(value);
  return refs;
}

function buildSelectionWithTempDependencies(
  allOps: any[],
  requestedIndices: number[],
  appliedOpIndices: number[]
) {
  const validRequested = Array.from(
    new Set(
      requestedIndices.filter((i) => Number.isInteger(i) && i >= 0 && i < allOps.length)
    )
  );
  const appliedSet = new Set(appliedOpIndices);
  const selected = new Set(validRequested);
  const producerByTempId = new Map<string, number>();

  for (let i = 0; i < allOps.length; i += 1) {
    const tempId = allOps[i]?.payload?.tempId;
    if (typeof tempId === "string" && tempId.length > 0) {
      producerByTempId.set(tempId, i);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const i of Array.from(selected)) {
      const refs = collectReferencedTempIds(allOps[i]?.payload);
      for (const ref of refs) {
        const producerIndex = producerByTempId.get(ref);
        if (
          producerIndex !== undefined &&
          !selected.has(producerIndex) &&
          !appliedSet.has(producerIndex)
        ) {
          selected.add(producerIndex);
          changed = true;
        }
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

export const applyChangeSetOps = mutation({
  args: {
    changeSetId: v.id("changeSets"),
    opIndices: v.array(v.number()),
    allowHardDelete: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const cs = await ctx.db.get(args.changeSetId);
    if (!cs) throw new Error("ChangeSet not found");
    if (!cs.ops) throw new Error("No ops in ChangeSet");

    const selectedIndices = buildSelectionWithTempDependencies(
      cs.ops,
      args.opIndices,
      cs.appliedOpIndices ?? []
    );
    const selectedOps = selectedIndices.map((i) => cs.ops![i]);

    if (selectedOps.length === 0) return;

    const hasHardDelete = selectedOps.some((op: any) =>
      op?.kind === "task.delete" || op?.kind === "materialLine.delete" || op?.kind === "workLine.delete"
    );
    if (hasHardDelete && !args.allowHardDelete) {
      throw new Error("Hard deletes require explicit approval.");
    }

    // Apply them
    try {
      await applyOpsList(ctx, {
        projectId: cs.projectId,
        ops: selectedOps,
        stage: cs.stage,
        sourceChangeSetId: cs._id
      });
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (message.includes("Unable to decode ID")) {
        throw new Error(
          "ChangeSet contains unresolved IDs in selected ops. Re-apply with all dependent create ops (the server now auto-includes temp dependencies, but one or more references are still invalid)."
        );
      }
      throw error;
    }

    // Update state
    const alreadyApplied = cs.appliedOpIndices ?? [];
    const newApplied = Array.from(new Set([...alreadyApplied, ...selectedIndices]));

    let status = cs.status;
    if (cs.ops.length === newApplied.length) {
      status = "APPLIED";
    } else {
      status = "PARTIALLY_APPLIED";
    }

    await ctx.db.patch(args.changeSetId, {
      appliedOpIndices: newApplied,
      status,
      appliedAt: Date.now()
    });
  }
});
