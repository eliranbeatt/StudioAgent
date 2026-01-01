import { query, mutation, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import {
  buildDefaultSections,
  buildElementSection,
  buildElementSectionId,
  getDefaultSectionIds,
} from "./brain_helpers";

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

export const ensureProjectBrain = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (existing) return existing;
    const now = Date.now();
    const id = await ctx.db.insert("projectBrains", {
      projectId: args.projectId,
      version: 1,
      updatedAt: now,
      sections: buildDefaultSections(now),
      conflicts: [],
    });
    return await ctx.db.get(id);
  },
});

export const createProjectBrainInternal = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("projectBrains", {
      projectId: args.projectId,
      version: 1,
      updatedAt: now,
      sections: buildDefaultSections(now),
      conflicts: [],
    });
  },
});

export const updateSectionContent = mutation({
  args: {
    projectId: v.id("projects"),
    sectionId: v.string(),
    newContent: v.string(),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const brain = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!brain) {
      throw new Error("BRAIN_NOT_FOUND");
    }
    if (brain.version !== args.expectedVersion) {
      throw new Error("VERSION_CONFLICT");
    }

    const now = Date.now();
    const sections = (brain.sections ?? []).map((section: any) => {
      if (section?.id !== args.sectionId) return section;
      const updated: any = {
        ...section,
        content: args.newContent,
        updatedAt: now,
      };
      if (section?.scope === "element") {
        updated.dirtySinceLastSync = true;
      }
      return updated;
    });

    const found = sections.some((section: any) => section?.id === args.sectionId);
    if (!found) {
      throw new Error("SECTION_NOT_FOUND");
    }

    await ctx.db.patch(brain._id, {
      sections,
      version: brain.version + 1,
      updatedAt: now,
    });

    return { ok: true, version: brain.version + 1 };
  },
});

export const createSectionForElement = mutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const brain = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!brain) {
      throw new Error("BRAIN_NOT_FOUND");
    }
    const sectionId = buildElementSectionId(String(args.elementId));
    const exists = (brain.sections ?? []).some((section: any) => section?.id === sectionId);
    if (exists) return { ok: true, created: false };

    const sections = [
      ...(brain.sections ?? []),
      buildElementSection({
        elementId: String(args.elementId),
        title: args.title,
        now,
      }),
    ];
    await ctx.db.patch(brain._id, {
      sections,
      version: brain.version + 1,
      updatedAt: now,
    });
    return { ok: true, created: true, version: brain.version + 1 };
  },
});

export const createSectionForElementInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let brain = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!brain) {
      const brainId = await ctx.db.insert("projectBrains", {
        projectId: args.projectId,
        version: 1,
        updatedAt: now,
        sections: buildDefaultSections(now),
        conflicts: [],
      });
      brain = await ctx.db.get(brainId);
      if (!brain) return { ok: false };
    }

    const sectionId = buildElementSectionId(String(args.elementId));
    const exists = (brain.sections ?? []).some((section: any) => section?.id === sectionId);
    if (exists) return { ok: true, created: false };

    const sections = [
      ...(brain.sections ?? []),
      buildElementSection({
        elementId: String(args.elementId),
        title: args.title,
        now,
      }),
    ];

    await ctx.db.patch(brain._id, {
      sections,
      version: brain.version + 1,
      updatedAt: now,
    });

    return { ok: true, created: true };
  },
});

export const deleteElementSection = mutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.id("elements"),
  },
  handler: async (ctx, args) => {
    const brain = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!brain) {
      throw new Error("BRAIN_NOT_FOUND");
    }
    const sectionId = buildElementSectionId(String(args.elementId));
    const sections = (brain.sections ?? []).filter((section: any) => section?.id !== sectionId);
    await ctx.db.patch(brain._id, {
      sections,
      version: brain.version + 1,
      updatedAt: Date.now(),
    });
    return { ok: true, version: brain.version + 1 };
  },
});

export const syncElementSectionFromApproved = mutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    approvedSnapshotId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const brain = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!brain) {
      throw new Error("BRAIN_NOT_FOUND");
    }

    const sectionId = buildElementSectionId(String(args.elementId));
    let found = false;
    const sections = (brain.sections ?? []).map((section: any) => {
      if (section?.id !== sectionId) return section;
      found = true;
      return {
        ...section,
        content: args.content,
        updatedAt: now,
        lastSyncedApprovedSnapshotId: args.approvedSnapshotId,
        dirtySinceLastSync: false,
      };
    });

    if (!found) {
      sections.push({
        ...buildElementSection({
          elementId: String(args.elementId),
          title: "Element",
          now,
        }),
        content: args.content,
        lastSyncedApprovedSnapshotId: args.approvedSnapshotId,
        dirtySinceLastSync: false,
      });
    }

    await ctx.db.patch(brain._id, {
      sections,
      version: brain.version + 1,
      updatedAt: now,
    });

    return { ok: true, version: brain.version + 1 };
  },
});

export const appendFromEvent = mutation({
  args: {
    projectId: v.id("projects"),
    eventId: v.string(),
    type: v.string(),
    payload: v.any(),
    selectedElementIds: v.optional(v.array(v.id("elements"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brainEvents")
      .withIndex("by_project_event", (q) =>
        q.eq("projectId", args.projectId).eq("eventId", args.eventId)
      )
      .first();
    if (existing) {
      return { status: "skipped", reason: "duplicate" };
    }

    const now = Date.now();
    let brain = await ctx.db
      .query("projectBrains")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!brain) {
      const id = await ctx.db.insert("projectBrains", {
        projectId: args.projectId,
        version: 1,
        updatedAt: now,
        sections: buildDefaultSections(now),
        conflicts: [],
      });
      brain = await ctx.db.get(id);
    }

    const bullets = extractBullets(args.type, args.payload);
    if (bullets.length === 0) {
      await ctx.db.insert("brainEvents", {
        projectId: args.projectId,
        eventId: args.eventId,
        type: args.type,
        createdAt: now,
        status: "skipped",
        error: "no_bullets",
      });
      return { status: "skipped", reason: "no_bullets" };
    }

    const block = formatBlock(now, bullets);
    const defaultIds = getDefaultSectionIds();
    const selectedIds = args.selectedElementIds ?? [];
    const targetSectionId =
      selectedIds.length === 1
        ? buildElementSectionId(String(selectedIds[0]))
        : defaultIds.unmapped;
    const targetScope = selectedIds.length === 1 ? "element" : "project";
    const targetElementId = selectedIds.length === 1 ? selectedIds[0] : null;

    let found = false;
    let updatedSections = (brain?.sections ?? []).map((section: any) => {
      if (section?.id !== targetSectionId) return section;
      found = true;
      const content = String(section?.content ?? "");
      const nextContent = capSectionContent(appendBlock(content, block));
      return {
        ...section,
        content: nextContent,
        updatedAt: now,
        lastAutoAppendAt: now,
      };
    });

    if (!found) {
      const elementId = selectedIds.length === 1 ? String(selectedIds[0]) : undefined;
      const title = args.payload?.title ?? (elementId ? "Element" : "Unmapped");
      const section =
        elementId !== undefined
          ? buildElementSection({ elementId, title: String(title), now })
          : {
            id: defaultIds.unmapped,
            title: "Unmapped",
            scope: "unmapped",
            content: "",
            updatedAt: now,
          };
      const nextContent = capSectionContent(appendBlock(String(section.content ?? ""), block));
      updatedSections = [
        ...updatedSections,
        {
          ...section,
          content: nextContent,
          updatedAt: now,
          lastAutoAppendAt: now,
        },
      ];
    }

    const conflictEntries = await detectConflicts(ctx, {
      projectId: args.projectId,
      scope: targetScope,
      elementId: targetElementId,
      sectionId: targetSectionId,
      text: block,
    });

    const nextConflicts =
      conflictEntries.length > 0
        ? [...(brain?.conflicts ?? []), ...conflictEntries].slice(-50)
        : brain?.conflicts ?? [];

    await ctx.db.patch(brain!._id, {
      sections: updatedSections,
      version: brain!.version + 1,
      updatedAt: now,
      conflicts: nextConflicts,
    });

    await ctx.db.insert("brainEvents", {
      projectId: args.projectId,
      eventId: args.eventId,
      type: args.type,
      createdAt: now,
      status: "applied",
    });

    return { status: "applied" };
  },
});

export const generateElementDraftFromText = mutation({
  args: {
    projectId: v.id("projects"),
    elementId: v.id("elements"),
    sectionContent: v.string(),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element?.currentDraftId) {
      return { ok: false, error: "No open draft found for this element." };
    }
    const draft = await ctx.db.get(element.currentDraftId);
    if (!draft || (draft.status !== "open" && draft.status !== "needsReview")) {
      return { ok: false, error: "No open draft found for this element." };
    }

    const parsed = buildPatchOpsFromText(args.sectionContent);
    return {
      ok: true,
      draftType: "element",
      draftId: draft._id,
      baseRevisionNumber: draft.revisionNumber,
      patchOps: parsed.patchOps,
      summary: parsed.summary,
      assumptions: parsed.assumptions,
      questions: parsed.questions,
    };
  },
});

function extractBullets(type: string, payload: any): string[] {
  if (!payload) return [];
  if (type === "file") {
    const fileName = String(payload.fileName ?? "").trim();
    const summary = String(payload.summary ?? "").trim();
    if (!fileName && !summary) return [];
    const text = summary ? `${fileName}: ${summary}` : fileName;
    return [text].filter(Boolean);
  }

  const text = String(payload.text ?? payload.content ?? "").trim();
  if (!text) return [];
  const parts = text.split(/[\n|]/).map((part) => part.trim()).filter(Boolean);
  return parts.slice(0, 4);
}

function buildPatchOpsFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const tasks: string[] = [];
  const materials: Array<{
    name: string;
    qty: number;
    unit: string;
    unitCost: number;
    taskRefs: string[];
  }> = [];
  const labor: Array<{
    role: string;
    qty: number;
    rate: number;
    taskRefs: string[];
  }> = [];
  for (const line of lines) {
    const normalized = line.replace(/^[-*]\s*/, "");
    const match =
      normalized.match(/^task\s*[:\-]\s*(.+)$/i) ||
      normalized.match(/^task\s+(.+)$/i);
    if (match?.[1]) {
      tasks.push(match[1].trim());
    }

    const materialMatch =
      normalized.match(/^material\s*[:\-]\s*(.+)$/i) ||
      normalized.match(/^material\s+(.+)$/i);
    if (materialMatch?.[1]) {
      const parsed = parseMaterialLine(materialMatch[1]);
      if (parsed) materials.push(parsed);
    }

    const laborMatch =
      normalized.match(/^labor\s*[:\-]\s*(.+)$/i) ||
      normalized.match(/^labour\s*[:\-]\s*(.+)$/i) ||
      normalized.match(/^labor\s+(.+)$/i);
    if (laborMatch?.[1]) {
      const parsed = parseLaborLine(laborMatch[1]);
      if (parsed) labor.push(parsed);
    }
  }

  const uniqueTasks = Array.from(new Set(tasks)).slice(0, 12);
  const trimmedMaterials = materials.slice(0, 12);
  const trimmedLabor = labor.slice(0, 12);
  if (uniqueTasks.length === 0 && trimmedMaterials.length === 0 && trimmedLabor.length === 0) {
    return {
      patchOps: [],
      summary: "No structured task/material/labor lines found in Current Knowledge.",
      assumptions: ["No 'task:', 'material:', or 'labor:' lines detected; no draft changes proposed."],
      questions: ["Which tasks, materials, or labor lines should be added from this text?"],
    };
  }

  const now = Date.now();
  const patchOps: any[] = [];
  const taskIdByTitle = new Map<string, string>();
  uniqueTasks.forEach((title, index) => {
    const id = `task_${now}_${index}`;
    taskIdByTitle.set(normalizeTitle(title), id);
    patchOps.push({
      op: "add",
      path: `/tasks/byId/${id}`,
      value: {
        id,
        title,
        domain: "planning",
        status: "todo",
      },
    });
  });

  trimmedMaterials.forEach((line, index) => {
    const id = `mat_${now}_${index}`;
    const taskIds = line.taskRefs
      .map((ref) => taskIdByTitle.get(normalizeTitle(ref)))
      .filter(Boolean) as string[];
    patchOps.push({
      op: "add",
      path: `/materials/byId/${id}`,
      value: {
        id,
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        unitCost: line.unitCost,
        links: { taskIds },
      },
    });
  });

  trimmedLabor.forEach((line, index) => {
    const id = `lab_${now}_${index}`;
    const taskIds = line.taskRefs
      .map((ref) => taskIdByTitle.get(normalizeTitle(ref)))
      .filter(Boolean) as string[];
    patchOps.push({
      op: "add",
      path: `/labor/byId/${id}`,
      value: {
        id,
        role: line.role,
        qty: line.qty,
        rate: line.rate,
        links: { taskIds },
      },
    });
  });

  return {
    patchOps,
    summary: `Generated ${uniqueTasks.length} task(s), ${trimmedMaterials.length} material line(s), and ${trimmedLabor.length} labor line(s).`,
    assumptions: [],
    questions: [],
  };
}

function parseMaterialLine(text: string) {
  const cleaned = text.trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/[|,]/).map((part) => part.trim()).filter(Boolean);
  const name = parts[0] ?? "Material";
  const qty = Number(extractValue(parts, ["qty", "quantity"])) || 1;
  const unit = extractTextValue(parts, ["unit"]) || "unit";
  const unitCost = Number(extractValue(parts, ["unitcost", "cost", "price"])) || 0;
  const taskRefs = extractTaskRefs(parts);
  return { name, qty, unit, unitCost, taskRefs };
}

function parseLaborLine(text: string) {
  const cleaned = text.trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/[|,]/).map((part) => part.trim()).filter(Boolean);
  const role = parts[0] ?? "Labor";
  const qty = Number(extractValue(parts, ["qty", "quantity", "hours"])) || 1;
  const rate = Number(extractValue(parts, ["rate", "cost", "price"])) || 0;
  const taskRefs = extractTaskRefs(parts);
  return { role, qty, rate, taskRefs };
}

function extractValue(parts: string[], keys: string[]) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  for (const part of parts) {
    const [rawKey, ...rest] = part.split(/[:=]/);
    if (rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase().replace(/\s+/g, "");
    if (!keySet.has(key)) continue;
    const value = rest.join(":").trim();
    const numberMatch = value.match(/-?\d+(\.\d+)?/);
    if (numberMatch) return numberMatch[0];
  }
  return "";
}

function extractTextValue(parts: string[], keys: string[]) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  for (const part of parts) {
    const [rawKey, ...rest] = part.split(/[:=]/);
    if (rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase().replace(/\s+/g, "");
    if (!keySet.has(key)) continue;
    return rest.join(":").trim();
  }
  return "";
}

function extractTaskRefs(parts: string[]) {
  const refs: string[] = [];
  for (const part of parts) {
    const [rawKey, ...rest] = part.split(/[:=]/);
    if (rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase().replace(/\s+/g, "");
    if (key !== "task" && key !== "tasks") continue;
    const value = rest.join(":").trim();
    if (!value) continue;
    const split = value.split(/[;/]/).map((item) => item.trim()).filter(Boolean);
    refs.push(...split);
  }
  return Array.from(new Set(refs));
}

function normalizeTitle(title: string) {
  return title.trim().toLowerCase();
}

function formatBlock(now: number, bullets: string[]) {
  const stamp = formatTimestamp(now);
  const lines = [`[${stamp}]`, ...bullets.map((b) => `> ${b}`)];
  return lines.join("\n");
}

function appendBlock(existing: string, block: string) {
  const trimmed = existing.trim();
  if (!trimmed) return block;
  const lastBlock = trimmed.split(/\n{2,}/).pop() ?? "";
  if (lastBlock.trim() === block.trim()) return existing;
  return `${existing}\n\n${block}`;
}

function capSectionContent(content: string) {
  const MAX_SECTION_CHARS = 12000;
  if (content.length <= MAX_SECTION_CHARS) return content;
  const keep = content.slice(content.length - MAX_SECTION_CHARS);
  return `--- archived older notes ---\n${keep}`;
}

async function detectConflicts(
  ctx: any,
  args: {
    projectId: any;
    scope: "project" | "element";
    elementId: any | null;
    sectionId: string;
    text: string;
  }
) {
  const signals = extractConflictSignals(args.text);
  if (signals.length === 0) return [];

  const conflicts: Array<{
    id: string;
    scope: string;
    elementId?: any;
    message: string;
    relatedSectionId: string;
    relatedExcerpt?: string;
    createdAt: number;
  }> = [];

  const now = Date.now();
  if (args.scope === "project") {
    const project = await ctx.db.get(args.projectId);
    if (project?.details?.budgetCap !== undefined && signals.some((s) => s.kind === "budget")) {
      const incoming = signals.find((s) => s.kind === "budget")!;
      if (incoming.value !== null && Number(project.details.budgetCap) !== incoming.value) {
        conflicts.push({
          id: `budget_${now}`,
          scope: "project",
          message: `Budget conflict: ${incoming.value} vs ${project.details.budgetCap}`,
          relatedSectionId: args.sectionId,
          relatedExcerpt: incoming.raw,
          createdAt: now,
        });
      }
    }
    if (project?.details?.eventDate && signals.some((s) => s.kind === "date")) {
      const incoming = signals.find((s) => s.kind === "date")!;
      if (incoming.dateValue && normalizeDate(project.details.eventDate) !== incoming.dateValue) {
        conflicts.push({
          id: `date_${now}`,
          scope: "project",
          message: `Date conflict: ${incoming.dateValue} vs ${normalizeDate(project.details.eventDate)}`,
          relatedSectionId: args.sectionId,
          relatedExcerpt: incoming.raw,
          createdAt: now,
        });
      }
    }
    if (project?.details?.location && signals.some((s) => s.kind === "location")) {
      const incoming = signals.find((s) => s.kind === "location")!;
      if (incoming.textValue && normalizeText(project.details.location) !== normalizeText(incoming.textValue)) {
        conflicts.push({
          id: `location_${now}`,
          scope: "project",
          message: `Location conflict: ${incoming.textValue} vs ${project.details.location}`,
          relatedSectionId: args.sectionId,
          relatedExcerpt: incoming.raw,
          createdAt: now,
        });
      }
    }
  }

  if (args.scope === "element" && args.elementId && signals.some((s) => s.kind === "quantity")) {
    const element = await ctx.db.get(args.elementId);
    if (element?.currentApprovedVersionId) {
      const version = await ctx.db.get(element.currentApprovedVersionId);
      const snapshot = version?.snapshot ?? {};
      const totalQty = sumSnapshotQuantities(snapshot);
      const incoming = signals.find((s) => s.kind === "quantity")!;
      if (incoming.value !== null && totalQty > 0 && Math.abs(totalQty - incoming.value) >= 1) {
        conflicts.push({
          id: `qty_${now}`,
          scope: "element",
          elementId: args.elementId,
          message: `Quantity conflict: ${incoming.value} vs ${totalQty}`,
          relatedSectionId: args.sectionId,
          relatedExcerpt: incoming.raw,
          createdAt: now,
        });
      }
    }
  }

  for (const conflict of conflicts) {
    await ctx.db.insert("brainConflicts", {
      projectId: args.projectId,
      scope: conflict.scope,
      elementId: conflict.elementId,
      message: conflict.message,
      relatedSectionId: conflict.relatedSectionId,
      relatedExcerpt: conflict.relatedExcerpt,
      createdAt: conflict.createdAt,
    });
  }

  return conflicts;
}

function extractConflictSignals(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const signals: Array<{
    kind: "budget" | "date" | "quantity" | "location";
    value: number | null;
    dateValue?: string;
    textValue?: string;
    raw: string;
  }> = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("budget")) {
      signals.push({
        kind: "budget",
        value: parseNumberFromText(line),
        raw: line,
      });
    }
    if (lower.includes("date") || lower.includes("deadline") || lower.includes("event")) {
      const dateValue = parseDateFromText(line);
      signals.push({
        kind: "date",
        value: null,
        dateValue,
        raw: line,
      });
    }
    if (lower.includes("qty") || lower.includes("quantity")) {
      signals.push({
        kind: "quantity",
        value: parseNumberFromText(line),
        raw: line,
      });
    }
    if (lower.includes("location") || lower.includes("site")) {
      const textValue = parseTextAfterLabel(line, ["location", "site"]);
      signals.push({
        kind: "location",
        value: null,
        textValue,
        raw: line,
      });
    }
  }

  return signals;
}

function parseNumberFromText(text: string) {
  const match = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

function parseDateFromText(text: string) {
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const slash = text.match(/\d{2}\/\d{2}\/\d{4}/);
  if (slash) {
    const [mm, dd, yyyy] = slash[0].split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return undefined;
}

function parseTextAfterLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const regex = new RegExp(`${label}\\s*[:\\-]\\s*(.+)$`, "i");
    const match = text.match(regex);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function normalizeDate(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function sumSnapshotQuantities(snapshot: any) {
  const materials = Object.values<any>(snapshot?.materials?.byId ?? {}).filter(
    (line) => !line?.deletedAt
  );
  const labor = Object.values<any>(snapshot?.labor?.byId ?? {}).filter(
    (line) => !line?.deletedAt
  );
  const matQty = materials.reduce((sum, line) => sum + Number(line?.qty ?? 0), 0);
  const laborQty = labor.reduce((sum, line) => sum + Number(line?.qty ?? 0), 0);
  return matQty + laborQty;
}

function formatTimestamp(now: number) {
  const date = new Date(now);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
