import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { buildDefaultSections } from "./brain_helpers";

export const create = mutation({
  args: {
    name: v.string(),
    clientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      clientName: args.clientName,
      status: "active",
      currency: "NIS",
      description: "",
      projectTypes: [],
      defaults: {
        profitPct: 0.3,
        overheadPct: 0.15,
        riskPct: 0.1,
        excludeManagementLaborFromCost: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    const containerId = await ctx.db.insert("projectCostContainers", {
      projectId,
      title: "Project Level Costs",
      createdAt: now,
      updatedAt: now,
    });

    const initialProjectCostSnapshot = {
      title: "Project Level Costs",
      materials: { byId: {} },
      labor: { byId: {} },
      subcontract: { byId: {} },
      notes: [],
      meta: { version: 1 },
    };

    const draftId = await ctx.db.insert("projectCostDrafts", {
      containerId,
      projectId,
      status: "open",
      revisionNumber: 1,
      createdFrom: { tab: "System", stage: "bootstrap" },
      workingSnapshot: initialProjectCostSnapshot,
      schemaVersion: 1,
      createdBy: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(containerId, { currentDraftId: draftId });
    await ctx.db.patch(projectId, { projectCostContainerId: containerId });

    await ctx.db.insert("projectBrains", {
      projectId,
      version: 1,
      updatedAt: now,
      sections: buildDefaultSections(now),
      conflicts: [],
    });

    return projectId;
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").collect();
  },
});

export const listProjects = query({
  args: { excludeId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const projects = await ctx.db.query("projects").order("desc").collect();
    return projects
      .filter((project) => project._id !== args.excludeId)
      .map((project) => ({
        id: project._id,
        name: project.name,
        status: project.status,
      }));
  },
});

export const getStats = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    const pendingGraveyard = await ctx.db
      .query("graveyardItems")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.id).eq("status", "pending")
      )
      .collect();

    return {
      elementCount: elements.length,
      graveyardCount: pendingGraveyard.length,
    };
  },
});

export const getOverview = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      return null;
    }

    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    const pendingGraveyard = await ctx.db
      .query("graveyardItems")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.id).eq("status", "pending")
      )
      .collect();

    const baseline = project.activeBudgetBaselineId
      ? await ctx.db.get(project.activeBudgetBaselineId)
      : null;

    const adjustments = project.activeBudgetBaselineId
      ? await ctx.db
          .query("budgetAdjustments")
          .withIndex("by_baseline", (q) =>
            q.eq("baselineId", project.activeBudgetBaselineId!)
          )
          .collect()
      : [];

    const approvedCO = adjustments.reduce(
      (acc, adj) => {
        acc.directCost += Number(adj.delta?.deltaDirectCost ?? 0);
        acc.sellPrice += Number(adj.delta?.deltaSellPrice ?? 0);
        return acc;
      },
      { directCost: 0, sellPrice: 0 }
    );

    const container = project.projectCostContainerId
      ? await ctx.db.get(project.projectCostContainerId)
      : null;

    return {
      project,
      elements: elements.map((el) => ({
        id: el._id,
        title: el.title,
        type: el.type,
        status: el.status,
        updatedAt: el.updatedAt,
      })),
      counts: {
        elementCount: elements.length,
        graveyardCount: pendingGraveyard.length,
      },
      baseline: baseline
        ? {
            id: baseline._id,
            totals: baseline.planned?.totals ?? { directCost: 0, grandTotal: 0 },
            approvedAt: baseline.approvedAt,
          }
        : null,
      approvedCO,
      projectCostContainer: container
        ? {
            id: container._id,
            currentDraftId: container.currentDraftId ?? null,
            currentApprovedVersionId: container.currentApprovedVersionId ?? null,
          }
        : null,
    };
  },
});

export const updateProjectDetails = mutation({
  args: {
    id: v.id("projects"),
    description: v.optional(v.string()),
    projectTypes: v.optional(v.array(v.string())),
    details: v.optional(
      v.object({
        eventDate: v.optional(v.number()),
        budgetCap: v.optional(v.number()),
        location: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      throw new Error("Project not found.");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.description !== undefined) updates.description = args.description;
    if (args.projectTypes !== undefined) updates.projectTypes = args.projectTypes;
    if (args.details !== undefined) {
      const cleanDetails = Object.fromEntries(
        Object.entries(args.details).filter(([, value]) => value !== undefined)
      );
      if (Object.keys(cleanDetails).length > 0) {
        updates.details = {
          ...(project.details ?? {}),
          ...cleanDetails,
        };
      }
    }

    await ctx.db.patch(args.id, updates);
    return { ok: true };
  },
});

export const listLinkedProjects = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const results = await Promise.all(
      links.map(async (link) => {
        const project = await ctx.db.get(link.linkedProjectId);
        const digest = await ctx.db
          .query("projectDigests")
          .withIndex("by_project", (q) => q.eq("projectId", link.linkedProjectId))
          .first();
        return project
          ? {
              linkId: link._id,
              mode: link.mode,
              project: {
                id: project._id,
                name: project.name,
                status: project.status,
              },
              digest: digest?.digest ?? null,
              generatedAt: digest?.generatedAt ?? null,
            }
          : null;
      })
    );

    return results.filter(Boolean);
  },
});

export const linkProject = mutation({
  args: {
    projectId: v.id("projects"),
    linkedProjectId: v.id("projects"),
    mode: v.union(v.literal("contextOnly"), v.literal("importSuggestions")),
  },
  handler: async (ctx, args) => {
    if (args.projectId === args.linkedProjectId) {
      throw new Error("Cannot link a project to itself.");
    }

    const existing = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("linkedProjectId"), args.linkedProjectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { mode: args.mode });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("projectLinks", {
      projectId: args.projectId,
      linkedProjectId: args.linkedProjectId,
      mode: args.mode,
      createdAt: Date.now(),
    });

    return { id, updated: false };
  },
});

export const unlinkProject = mutation({
  args: {
    projectId: v.id("projects"),
    linkedProjectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("linkedProjectId"), args.linkedProjectId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { ok: true };
  },
});

export const generateProjectDigest = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(5);

    const budgetTotals = await computeBudgetTotals(ctx, project);

    const digest = buildDigest({
      project,
      elements,
      files,
      budgetTotals,
    });

    const existing = await ctx.db
      .query("projectDigests")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        digest,
        schemaVersion: 1,
        generatedAt: Date.now(),
      });
      return { id: existing._id, updated: true, digest };
    }

    const id = await ctx.db.insert("projectDigests", {
      projectId: args.projectId,
      digest,
      schemaVersion: 1,
      generatedAt: Date.now(),
    });

    return { id, updated: false, digest };
  },
});

export const generateOverviewSummary = action({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const overview = await ctx.runQuery(api.projects.getOverview, { id: args.id });
    if (!overview?.project) {
      throw new Error("Project not found.");
    }

    const files = await ctx.runQuery(api.files.listProjectFiles, {
      projectId: args.id,
    });

    const linked = await ctx.runQuery(api.projects.listLinkedProjects, {
      projectId: args.id,
    });

    const summary = await buildOverviewSummary({
      project: overview.project,
      elements: overview.elements ?? [],
      files: files ?? [],
      linkedDigests: linked ?? [],
    });

    await ctx.runMutation(api.projects.updateProjectSummary, {
      id: args.id,
      overviewSummary: summary,
    });

    return { summary };
  },
});

export const updateProjectSummary = mutation({
  args: {
    id: v.id("projects"),
    overviewSummary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      overviewSummary: args.overviewSummary,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

async function computeBudgetTotals(ctx: any, project: any) {
  const baseline = project.activeBudgetBaselineId
    ? await ctx.db.get(project.activeBudgetBaselineId)
    : null;

  const adjustments = project.activeBudgetBaselineId
    ? await ctx.db
        .query("budgetAdjustments")
        .withIndex("by_baseline", (q: any) =>
          q.eq("baselineId", project.activeBudgetBaselineId)
        )
        .collect()
    : [];

  const approvedCO = adjustments.reduce(
    (acc: any, adj: any) => {
      acc.directCost += Number(adj.delta?.deltaDirectCost ?? 0);
      acc.sellPrice += Number(adj.delta?.deltaSellPrice ?? 0);
      return acc;
    },
    { directCost: 0, sellPrice: 0 }
  );

  const baselineSell = Number(baseline?.planned?.totals?.grandTotal ?? 0);
  return {
    baselineSell,
    approvedSell: approvedCO.sellPrice,
    effectiveBudget: baselineSell + approvedCO.sellPrice,
  };
}

function buildDigest({
  project,
  elements,
  files,
  budgetTotals,
}: {
  project: any;
  elements: any[];
  files: any[];
  budgetTotals: { baselineSell: number; approvedSell: number; effectiveBudget: number };
}) {
  const keyElements = elements.slice(0, 5).map((el) => ({
    title: el.title,
    type: el.type,
    status: el.status,
  }));

  const fileHighlights = files
    .filter((file) => file.summary)
    .slice(0, 4)
    .map((file) => `${file.fileName}: ${file.summary}`);

  const summaryParts = [
    project.description?.trim(),
    keyElements.length > 0
      ? `Key elements: ${keyElements.map((el) => el.title).join(", ")}.`
      : "No elements captured yet.",
    fileHighlights.length > 0
      ? `Files: ${fileHighlights.map((item) => item.split(":")[0]).join(", ")}.`
      : null,
  ].filter(Boolean);

  return {
    summary: summaryParts.join(" "),
    keyElements,
    fileHighlights,
    totals: budgetTotals,
  };
}

async function buildOverviewSummary({
  project,
  elements,
  files,
  linkedDigests,
}: {
  project: any;
  elements: any[];
  files: any[];
  linkedDigests: Array<any>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const elementList = elements.slice(0, 8).map((el) => `${el.title} (${el.type})`);
  const fileList = (files ?? []).slice(0, 6).map((file) =>
    file.summary ? `${file.fileName}: ${file.summary}` : file.fileName
  );
  const linkedList = (linkedDigests ?? []).map((link) =>
    link?.digest?.summary ? `${link.project?.name}: ${link.digest.summary}` : link.project?.name
  );

  const fallbackSummary = [
    project.description?.trim(),
    elementList.length ? `Elements: ${elementList.join(", ")}.` : "No elements yet.",
    fileList.length ? `Knowledge: ${fileList.join(" | ")}.` : null,
    linkedList.length ? `Past projects: ${linkedList.join(" | ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (!apiKey) {
    return fallbackSummary;
  }

  const prompt = [
    `Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : null,
    elementList.length ? `Elements: ${elementList.join(", ")}` : "Elements: none",
    fileList.length ? `Knowledge files: ${fileList.join(" | ")}` : "Knowledge files: none",
    linkedList.length ? `Past project digests: ${linkedList.join(" | ")}` : "Past project digests: none",
    "Write a concise project summary (2-4 sentences). Emphasize scope, key elements, and critical constraints.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a project coordinator summarizing internal project context." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 220,
      }),
    });

    if (!response.ok) {
      return fallbackSummary;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : fallbackSummary;
  } catch {
    return fallbackSummary;
  }
}
