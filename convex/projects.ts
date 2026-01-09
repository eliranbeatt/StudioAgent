import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";


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

    return {
      elementCount: elements.length,
    };
  },
});

export const getOverview = query({
  args: { id: v.union(v.id("projects"), v.id("structuredAnswers")) },
  handler: async (ctx, args) => {
    let projectId = args.id;

    // Handle structuredAnswer ID by resolving to its project
    const asAnswer = ctx.db.normalizeId("structuredAnswers", args.id);
    if (asAnswer) {
      const answer = await ctx.db.get(asAnswer);
      if (answer) {
        projectId = answer.projectId;
      } else {
        return null;
      }
    }
    
    // Now treat projectId as project ID (it might still be the original ID if normalization failed/matched project)
    // To be safe, force cast or just use it. 
    // If original was project ID, asAnswer is null (if table names differ).
    // Wait, normalizeId("structuredAnswers", projId) returns null. Correct.

    const project = await ctx.db.get(projectId as any);
    if (!project) {
      return null;
    }

    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", project._id as any))
      .collect();



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
      },
    };
  },
});

export const resolveProjectId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedProject = ctx.db.normalizeId("projects", args.id);
    if (normalizedProject) {
      const project = await ctx.db.get(normalizedProject);
      if (project) return { projectId: normalizedProject };
    }

    const normalizedAnswer = ctx.db.normalizeId("structuredAnswers", args.id);
    if (normalizedAnswer) {
      const answer = await ctx.db.get(normalizedAnswer);
      if (answer?.projectId) return { projectId: answer.projectId };
    }

    return { projectId: null };
  },
});

export const getRecentElements = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project_updated", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);

    return elements.map((el) => ({
      id: el._id,
      title: el.title,
      type: el.type,
      status: el.status,
      updatedAt: el.updatedAt,
    }));
  },
});

export const getTasksForElements = query({
  args: { projectId: v.id("projects"), elementIds: v.array(v.id("elements")) },
  handler: async (ctx, args) => {
    const results: Array<{ elementId: string; tasks: any[] }> = [];
    for (const elementId of args.elementIds) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_element", (q) => q.eq("elementId", elementId))
        .collect();
      results.push({
        elementId,
        tasks: tasks.map((task) => ({
          id: task._id,
          title: task.title,
          status: task.status,
          estimatedMinutes: task.estimatedMinutes,
        })),
      });
    }
    return results;
  },
});

export const getAccountingForElements = query({
  args: { projectId: v.id("projects"), elementIds: v.array(v.id("elements")) },
  handler: async (ctx, args) => {
    const results: Array<{ elementId: string; lines: any[] }> = [];
    for (const elementId of args.elementIds) {
      const lines = await ctx.db
        .query("accountingLines")
        .withIndex("by_element", (q) => q.eq("elementId", elementId))
        .collect();
      results.push({
        elementId,
        lines: lines.map((line) => ({
          id: line._id,
          title: line.title,
          type: line.type,
          total: line.total,
          qty: line.qty,
          unitCost: line.unitCost,
        })),
      });
    }
    return results;
  },
});

export const getPrintPartsForElements = query({
  args: { projectId: v.id("projects"), elementIds: v.array(v.id("elements")) },
  handler: async (ctx, args) => {
    const results: Array<{ elementId: string; parts: any[] }> = [];
    for (const elementId of args.elementIds) {
      const parts = await ctx.db
        .query("printParts")
        .withIndex("by_element", (q) => q.eq("elementId", elementId))
        .collect();
      results.push({
        elementId,
        parts: parts.map((part) => ({
          id: part._id,
          label: part.label,
          qty: part.qty,
          substrate: part.substrate,
          size: part.size,
          requiresProof: part.requiresProof,
        })),
      });
    }
    return results;
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


    const summary = await buildOverviewSummary({
      project: overview.project,
      elements: overview.elements ?? [],
      files: files ?? [],
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

export const listLinkedProjects = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const results: Array<any> = [];
    for (const link of links) {
      const project = await ctx.db.get(link.linkedProjectId);
      if (!project) continue;
      const digest = await ctx.db
        .query("projectDigests")
        .withIndex("by_project", (q) => q.eq("projectId", link.linkedProjectId))
        .first();
      results.push({
        linkId: link._id,
        mode: link.mode,
        project: {
          id: project._id,
          name: project.name,
          status: project.status,
        },
        digest: digest
          ? {
              summary: digest.summary,
              keyElements: digest.keyElements ?? [],
              fileHighlights: digest.fileHighlights ?? [],
            }
          : null,
      });
    }

    return results;
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
      throw new Error("Cannot link project to itself.");
    }

    const existing = await ctx.db
      .query("projectLinks")
      .withIndex("by_project_linked", (q) =>
        q.eq("projectId", args.projectId).eq("linkedProjectId", args.linkedProjectId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        mode: args.mode,
        updatedAt: Date.now(),
      });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("projectLinks", {
      projectId: args.projectId,
      linkedProjectId: args.linkedProjectId,
      mode: args.mode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
      .withIndex("by_project_linked", (q) =>
        q.eq("projectId", args.projectId).eq("linkedProjectId", args.linkedProjectId)
      )
      .first();

    if (!existing) return { ok: false };

    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const generateProjectDigest = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found.");

    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(6);

    const keyElements = elements.slice(0, 6).map((el) => ({
      id: el._id,
      title: el.title,
      type: el.type,
    }));

    const fileHighlights = files.map((file) =>
      file.summary ? `${file.fileName}: ${file.summary}` : file.fileName
    );

    const summaryParts = [
      project.description?.trim(),
      keyElements.length ? `Elements: ${keyElements.map((el) => el.title).join(", ")}.` : null,
      fileHighlights.length ? `Knowledge: ${fileHighlights.join(" | ")}.` : null,
    ].filter(Boolean);

    const summary = summaryParts.length > 0 ? summaryParts.join(" ") : "No summary available.";

    const existing = await ctx.db
      .query("projectDigests")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        summary,
        keyElements,
        fileHighlights,
        updatedAt: Date.now(),
      });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("projectDigests", {
      projectId: args.projectId,
      summary,
      keyElements,
      fileHighlights,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { id, updated: false };
  },
});

export const updateTaskOrder = mutation({
  args: {
    projectId: v.id("projects"),
    columnOrder: v.any(), // { todo: [taskId], ... }
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const currentConfig = project.tasksConfiguration ?? {};
    await ctx.db.patch(args.projectId, {
      tasksConfiguration: {
        ...currentConfig,
        kanbanColumnOrder: args.columnOrder,
      },
      updatedAt: Date.now(),
    });
  },
});

export const getTaskOrder = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    return project?.tasksConfiguration?.kanbanColumnOrder ?? null;
  },
});


async function buildOverviewSummary({
  project,
  elements,
  files,
}: {
  project: any;
  elements: any[];
  files: any[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const elementList = elements.slice(0, 8).map((el) => `${el.title} (${el.type})`);
  const fileList = (files ?? []).slice(0, 6).map((file) =>
    file.summary ? `${file.fileName}: ${file.summary}` : file.fileName
  );

  const fallbackSummary = [
    project.description?.trim(),
    elementList.length ? `Elements: ${elementList.join(", ")}.` : "No elements yet.",
    fileList.length ? `Knowledge: ${fileList.join(" | ")}.` : null,
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
