import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import OpenAI from "openai";

// ---------------------------------------------------------
// Mutations (Internal & Public)
// ---------------------------------------------------------

export const saveSummary = internalMutation({
  args: {
    memoryDocId: v.id("memoryDocs"),
    summaryMd_he: v.string(),
    facts_he: v.array(v.string()),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memoryDocId, {
      aiSummary: {
        model: args.model,
        summaryMd_he: args.summaryMd_he,
        facts_he: args.facts_he,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});

export const saveRunningMemory = internalMutation({
  args: {
    projectId: v.id("projects"),
    contentMd_he: v.string(),
    autoAppendEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Find existing running memory doc
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "RUNNING_MEMORY"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        contentMd_he: args.contentMd_he,
        autoAppendEnabled: args.autoAppendEnabled ?? existing.autoAppendEnabled,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("memoryDocs", {
        projectId: args.projectId,
        kind: "RUNNING_MEMORY",
        contentMd_he: args.contentMd_he,
        autoAppendEnabled: args.autoAppendEnabled ?? true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const saveProjectContextDoc = internalMutation({
  args: {
    projectId: v.id("projects"),
    contentMd_he: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "PROJECT_CONTEXT"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        contentMd_he: args.contentMd_he,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("memoryDocs", {
        projectId: args.projectId,
        kind: "PROJECT_CONTEXT",
        title_he: "Project Context",
        contentMd_he: args.contentMd_he,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const upsertMemoryDoc = internalMutation({
  args: {
    projectId: v.id("projects"),
    kind: v.string(),
    title_he: v.optional(v.string()),
    contentMd_he: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", args.kind))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title_he: args.title_he ?? existing.title_he,
        contentMd_he: args.contentMd_he,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("memoryDocs", {
      projectId: args.projectId,
      kind: args.kind,
      title_he: args.title_he ?? undefined,
      contentMd_he: args.contentMd_he,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const upsertQAPairs = mutation({
  args: {
    projectId: v.id("projects"),
    question_he: v.string(),
    answer_he: v.string(),
    sourceType: v.union(v.literal("CLARIFICATION_BLOCK"), v.literal("CHAT_PARSE")),
    conversationId: v.optional(
      v.union(v.id("conversations"), v.id("agentConversations"), v.string())
    ),
    messageId: v.optional(v.id("conversationMessages")),
  },
  handler: async (ctx, args) => {
    // Simple dedupe by question string (could be better with embedding or normalization)
    const key = args.question_he.trim().toLowerCase();
    
    const existing = await ctx.db
        .query("qaPairs")
        .withIndex("by_project_questionKey", q => q.eq("projectId", args.projectId).eq("questionKey", key))
        .first();

    if (existing) {
        // Update answer if new?
        // For now, just log new one if different? Or update?
        // Let's insert a new one to keep history, or update.
        // Spec said "avoid repeats".
        await ctx.db.patch(existing._id, {
            answer_he: args.answer_he,
            source: {
                sourceType: args.sourceType,
                conversationId: args.conversationId,
                messageId: args.messageId,
            }
        });
        // DISABLED: appendRunningMemory removed — single source of truth is PROJECT_CONTEXT
        return existing._id;
    }

    const qaId = await ctx.db.insert("qaPairs", {
        projectId: args.projectId,
        question_he: args.question_he,
        questionKey: key,
        answer_he: args.answer_he,
        source: {
            sourceType: args.sourceType,
            conversationId: args.conversationId,
            messageId: args.messageId,
        },
        createdAt: Date.now(),
    });
    // Trigger A: schedule knowledge doc refresh after new QA pair
    const sdkKnowledge = (api as any)['sdk/knowledge'] ?? (api as any).sdk?.knowledge;
    if (sdkKnowledge?.summarizeOrUpdate) {
      await ctx.scheduler.runAfter(2000, sdkKnowledge.summarizeOrUpdate, {
        projectId: args.projectId,
        newFacts: [`QA: ${args.question_he} → ${args.answer_he}`],
      });
    }
    return qaId;
  },
});

export const appendUserInput = internalMutation({
  args: {
    projectId: v.id("projects"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "USER_INPUT_LOG"))
      .first();

    const entry = `### ${new Date().toISOString()}\n${args.text.trim()}`;
    const nextContent = existing?.contentMd_he
      ? `${existing.contentMd_he}\n\n---\n\n${entry}`
      : entry;

    if (existing) {
      await ctx.db.patch(existing._id, {
        contentMd_he: nextContent,
        updatedAt: Date.now(),
      });
      return;
    }

    await ctx.db.insert("memoryDocs", {
      projectId: args.projectId,
      kind: "USER_INPUT_LOG",
      contentMd_he: nextContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const saveQADigest = internalMutation({
  args: {
    projectId: v.id("projects"),
    contentMd_he: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "QA_DIGEST"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        contentMd_he: args.contentMd_he,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("memoryDocs", {
        projectId: args.projectId,
        kind: "QA_DIGEST",
        contentMd_he: args.contentMd_he,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// ---------------------------------------------------------
// Actions (AI Logic)
// ---------------------------------------------------------

export const ingestSourceDoc = action({
  args: {
    projectId: v.id("projects"),
    fileId: v.id("projectFiles"),
    memoryDocId: v.id("memoryDocs"),
  },
  handler: async (ctx, args) => {
    if (!process.env.OPENAI_API_KEY) {
        console.log("No OpenAI Key, skipping ingest");
        return;
    }

    const file = await ctx.runQuery(internal.memory.getFileDetails, { fileId: args.fileId });
    if (!file || !file.extractedText) return;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = "gpt-4o-mini"; // "nano" equivalent

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: "Summarize this document in Hebrew. Return a markdown summary and a list of key facts." },
            { role: "user", content: file.extractedText.slice(0, 20000) } // Limit context
        ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    // Parse if we want structured facts, for now just dump text
    await ctx.runMutation(internal.memory.saveSummary, {
        memoryDocId: args.memoryDocId,
        summaryMd_he: text,
        facts_he: [],
        model,
    });
  },
});

// DEPRECATED: appendRunningMemory is disabled.
// Single source of truth is PROJECT_CONTEXT via CONTEXT_GENERATION skill.
export const appendRunningMemory = action({
  args: {
    projectId: v.id("projects"),
    userText: v.string(),
  },
  handler: async (_ctx, _args) => {
    // No-op: RUNNING_MEMORY updates disabled.
    return
  },
});

export const updateQADigest = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
     if (!process.env.OPENAI_API_KEY) return;

     // Fetch recent Q&A
     const qaPairs = await ctx.runQuery(internal.memory.getRecentQAPairs, { projectId: args.projectId });
     if (!qaPairs || qaPairs.length === 0) return;

     const qaText = qaPairs.map(qa => `Q: ${qa.question_he}\nA: ${qa.answer_he}`).join("\n---\n");

     const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
     const model = "gpt-4o-mini";

     const completion = await client.chat.completions.create({
         model,
         messages: [
             { role: "system", content: "Create a concise Q&A digest (Hebrew) from these pairs." },
             { role: "user", content: qaText }
         ]
     });

     const digest = completion.choices[0]?.message?.content ?? "";
     await ctx.runMutation(internal.memory.saveQADigest, {
         projectId: args.projectId,
         contentMd_he: digest,
     });
  },
});

function sumNumbers(values: Array<number | undefined | null>) {
  return values.reduce((acc, value) => acc + (typeof value === "number" ? value : 0), 0);
}

function formatCurrency(value: number, currency?: string) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return currency ? `${rounded} ${currency}` : String(rounded);
}

function buildFallbackProjectContext(snapshot: any) {
  const latestQuote = Array.isArray(snapshot.quoteVersions) ? snapshot.quoteVersions[0] : null;
  const currency = latestQuote?.currency || snapshot.project?.currency;
  const materialsTotal = sumNumbers(snapshot.materialLines?.map((l: any) => l.plannedTotalCost));
  const workTotal = sumNumbers(snapshot.workLines?.map((l: any) => l.plannedTotalCost));
  const totalEstimate = materialsTotal + workTotal;

  const elements = (snapshot.elements ?? []).slice(0, 20);
  const tasks = (snapshot.tasks ?? []).slice(0, 40);
  const materials = (snapshot.materialLines ?? []).slice(0, 30);
  const workLines = (snapshot.workLines ?? []).slice(0, 30);

  return [
    `# תקציר פרויקט`,
    ``,
    `## פרטים`,
    `- שם: ${snapshot.project?.name ?? ""}`,
    snapshot.project?.description ? `- תיאור: ${snapshot.project.description}` : "",
    snapshot.project?.notes ? `- הערות: ${snapshot.project.notes}` : "",
    `- אלמנטים: ${snapshot.counts?.elements ?? elements.length}`,
    `- משימות: ${snapshot.counts?.tasks ?? tasks.length}`,
    `- שורות חומרים: ${snapshot.counts?.materialLines ?? materials.length}`,
    `- שורות עבודה: ${snapshot.counts?.workLines ?? workLines.length}`,
    ``,
    `## עלויות משוערות`,
    `- חומרים: ${formatCurrency(materialsTotal, currency)}`,
    `- עבודה/תפעול: ${formatCurrency(workTotal, currency)}`,
    `- סה"כ משוער: ${formatCurrency(totalEstimate, currency)}`,
    latestQuote?.totals ? `- תקציב/הצעה: ${JSON.stringify(latestQuote.totals)}` : "",
    ``,
    `## אלמנטים`,
    ...elements.map((e: any) => `- ${e.title} (${e.type})`),
    ``,
    `## משימות (דגימה)`,
    ...tasks.map((t: any) => `- ${t.title}`),
    ``,
    `## חומרים (דגימה)`,
    ...materials.map((m: any) => `- ${m.itemName ?? ""} (${formatCurrency(m.plannedTotalCost ?? 0, currency)})`),
    ``,
    `## עבודה/לוגיסטיקה (דגימה)`,
    ...workLines.map((w: any) => `- ${w.roleHe ?? ""} (${formatCurrency(w.plannedTotalCost ?? 0, currency)})`),
  ]
    .filter(Boolean)
    .join("\n");
}

export const generateProjectContextDoc = action({
  args: {
    projectId: v.id("projects"),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const feedback = typeof args.feedback === "string" ? args.feedback.trim() : "";
    if (feedback) {
      await ctx.runMutation(internal.memory.appendUserInput, {
        projectId: args.projectId,
        text: `Project context feedback:\n${feedback}`,
      });
    }

    // Delegate to the single-source-of-truth knowledge updater
    const sdkKnowledge = (api as any)['sdk/knowledge'] ?? (api as any).sdk?.knowledge;
    if (!sdkKnowledge?.summarizeOrUpdate) {
      throw new Error('sdk/knowledge module not available');
    }

    const newFacts: string[] = [];
    if (feedback) {
      newFacts.push(`User feedback: ${feedback}`);
    }

    await ctx.runAction(sdkKnowledge.summarizeOrUpdate, {
      projectId: args.projectId,
      newFacts,
      userText: feedback || undefined,
    });

    return { ok: true };
  },
});

export const regenerateRunningMemory = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    if (!process.env.OPENAI_API_KEY) return { ok: false };

    const [files, qaPairs] = await Promise.all([
      ctx.runQuery(api.files.listProjectFiles, { projectId: args.projectId }),
      ctx.runQuery(api.memory.listQAPairs, { projectId: args.projectId }),
    ]);

    const fileHighlights = (files ?? [])
      .map((file: any) => {
        const summary = file.summary ?? file.extractedInfo?.summary ?? "";
        if (!summary) return "";
        return `- ${file.fileName}: ${summary}`;
      })
      .filter(Boolean)
      .join("\n");

    const qaText = (qaPairs ?? [])
      .map((qa: any) => `Q: ${qa.question_he}\nA: ${qa.answer_he}`)
      .join("\n---\n");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = "gpt-4o-mini";

    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Create a concise Current Knowledge document in markdown bullet points. Keep it short, factual, and structured. Use the same language as the inputs.",
        },
        {
          role: "user",
          content: [
            "Project files:",
            fileHighlights || "No file summaries available.",
            "",
            "Q&A pairs:",
            qaText || "No Q&A pairs available.",
          ].join("\n"),
        },
      ],
    });

    const newText = completion.choices[0]?.message?.content ?? "";
    await ctx.runMutation(internal.memory.saveRunningMemory, {
      projectId: args.projectId,
      contentMd_he: newText,
    });

    return { ok: true };
  },
});

// ---------------------------------------------------------
// Helpers (Queries)
// ---------------------------------------------------------

export const getFileDetails = query({
    args: { fileId: v.id("projectFiles") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.fileId);
    }
});

export const getRunningMemory = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("memoryDocs")
            .withIndex("by_project_kind", q => q.eq("projectId", args.projectId).eq("kind", "RUNNING_MEMORY"))
            .first();
    }
});

export const getProjectContextDoc = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "PROJECT_CONTEXT"))
      .first();
  },
});

export const updateRunningMemory = mutation({
  args: {
    projectId: v.id("projects"),
    contentMd_he: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "RUNNING_MEMORY"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        contentMd_he: args.contentMd_he,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("memoryDocs", {
        projectId: args.projectId,
        kind: "RUNNING_MEMORY",
        contentMd_he: args.contentMd_he,
        autoAppendEnabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const updateProjectContextDoc = mutation({
  args: {
    projectId: v.id("projects"),
    contentMd_he: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "PROJECT_CONTEXT"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        contentMd_he: args.contentMd_he,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("memoryDocs", {
        projectId: args.projectId,
        kind: "PROJECT_CONTEXT",
        title_he: "Project Context",
        contentMd_he: args.contentMd_he,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

export const setRunningMemoryAutoAppend = mutation({
  args: {
    projectId: v.id("projects"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "RUNNING_MEMORY"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        autoAppendEnabled: args.enabled,
        updatedAt: Date.now(),
      });
      return;
    }

    await ctx.db.insert("memoryDocs", {
      projectId: args.projectId,
      kind: "RUNNING_MEMORY",
      contentMd_he: "",
      autoAppendEnabled: args.enabled,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const getRecentQAPairs = query({
    args: { projectId: v.id("projects") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("qaPairs")
            .withIndex("by_project", q => q.eq("projectId", args.projectId))
            .order("desc")
            .take(20);
    }
});

export const listQAPairs = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("qaPairs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const getUserInputLog = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "USER_INPUT_LOG"))
      .first();
  },
});
