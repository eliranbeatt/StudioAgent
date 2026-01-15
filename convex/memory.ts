import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
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
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("memoryDocs", {
        projectId: args.projectId,
        kind: "RUNNING_MEMORY",
        contentMd_he: args.contentMd_he,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
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
        return existing._id;
    }

    return await ctx.db.insert("qaPairs", {
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

export const appendRunningMemory = action({
  args: {
    projectId: v.id("projects"),
    userText: v.string(),
  },
  handler: async (ctx, args) => {
     if (!process.env.OPENAI_API_KEY) return;
     
     // 1. Get current memory
     const currentDoc = await ctx.runQuery(internal.memory.getRunningMemory, { projectId: args.projectId });
     const currentText = currentDoc?.contentMd_he || "";

     const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
     const model = "gpt-4o-mini";

     const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: "Update the project running memory (Hebrew) with the new user input. Keep it concise. Return the full updated text." },
            { role: "user", content: `Current Memory:\n${currentText}\n\nNew Input:\n${args.userText}` }
        ],
     });
     
     const newText = completion.choices[0]?.message?.content ?? currentText;
     
     await ctx.runMutation(internal.memory.saveRunningMemory, {
         projectId: args.projectId,
         contentMd_he: newText,
     });
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
