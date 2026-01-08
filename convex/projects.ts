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
