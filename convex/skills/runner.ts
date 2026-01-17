import { searchWeb } from "../lib/webSearch";
import { SHARED_HEADER } from "./prompts";
import { completionWithTracing } from "../lib/llm";
import { mutation, internalMutation, query, internalQuery, action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

const OPENAI_MODEL = "gpt-4o";
const SMALL_MODEL = "gpt-5-nano";

// --- Public API (Action) ---

export const runSkill = action({
  args: {
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    skillId: v.string(),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { projectId, conversationId, skillId, params } = args;

    // 1. Load Skill & Gate Check
    const skillData = await ctx.runQuery(internal.skills.runner.getSkillAndGateStatus, {
      projectId, conversationId, skillId
    });

    if (!skillData.skill) throw new Error(`Skill ${skillId} not found`);

    if (params?.forceClarifications) {
      return await runGateLogic(ctx, { projectId, conversationId, targetSkillId: skillId, targetSkillLabel: skillData.skill.labelHe });
    }

    if (skillData.isGateBlocked) {
      // Run Gate Logic
      return await runGateLogic(ctx, { projectId, conversationId, targetSkillId: skillId, targetSkillLabel: skillData.skill.labelHe });
    }

    if (skillId === "CONTEXT_GENERATION" && params?.freeText) {
      await ctx.runMutation(internal.memory.appendUserInput, {
        projectId,
        text: String(params.freeText),
      });
    }

    // 2. Create Run (Mutation)
    const runId = await ctx.runMutation(internal.skills.runner.createRun, {
      projectId,
      conversationId,
      skillId,
      params,
    });

    // 3. Build Context (Query)
    const context = await ctx.runQuery(internal.skills.runner.buildContext, { projectId, params, skillId });
    const clarification = await ctx.runQuery(internal.skills.runner.getLatestClarifications, {
      projectId,
      targetSkillId: skillId,
    });

    // 4. LLM Call
    try {
      const systemPrompt = buildSystemPrompt(skillData.skill, {
        ...context,
        clarifications: clarification,
      });
      const allowedTools = {
        webSearch: !!(skillData.skill.config.allowedTools?.webSearch && params?.toggles?.useWebSearch),
        ragSearch: !!skillData.skill.config.allowedTools?.ragSearch,
        fileInspect: !!skillData.skill.config.allowedTools?.fileInspect,
        runSkill: !!skillData.skill.config.allowedTools?.runSkill,
      };

      if (skillId === "CONTEXT_GENERATION") {
        const docPrompt = `${systemPrompt}\n\nOUTPUT MODE: DOC_ONLY. Return JSON with blocks array containing ONLY ChatBlock.`;
        const docBlocks = await callLLM(ctx, docPrompt, allowedTools, skillData.skill.model, { projectId, conversationId });
        const docBlock = docBlocks.find((b: any) => b.type === "ChatBlock" && typeof b.markdownHe === "string");
        if (docBlock?.markdownHe?.trim()) {
          await ctx.runMutation(api.memory.updateRunningMemory, {
            projectId,
            contentMd_he: docBlock.markdownHe,
          });
        }

        const updatedContext = {
          ...context,
          currentKnowledge: docBlock?.markdownHe ?? context.currentKnowledge,
          clarifications: clarification,
        };
        const questionsPrompt = `${buildSystemPrompt(skillData.skill, updatedContext)}\n\nOUTPUT MODE: QUESTIONS_ONLY. Return JSON with blocks array containing ONLY QuestionsBlock. Base questions on updated currentKnowledge + qaPairs + userInput.`;
        const questionBlocks = await callLLM(ctx, questionsPrompt, allowedTools, skillData.skill.model, { projectId, conversationId });

        const combinedBlocks = [
          ...docBlocks.filter((b: any) => b.type === "ChatBlock"),
          ...questionBlocks.filter((b: any) => b.type === "QuestionsBlock")
        ];

        const savedBlocks = await ctx.runMutation(internal.skills.runner.saveRunResult, {
          runId,
          conversationId,
          blocks: combinedBlocks,
          projectId,
        });

        return savedBlocks;
      }

      const blocks = await callLLM(ctx, systemPrompt, allowedTools, skillData.skill.model, { projectId, conversationId });

      // 5. Save Result (Mutation)
      const savedBlocks = await ctx.runMutation(internal.skills.runner.saveRunResult, {
        runId,
        conversationId,
        blocks,
        projectId, // needed for ChangeSet creation inside
      });

      return savedBlocks;

    } catch (error: any) {
      console.error("Skill execution failed:", error);
      await ctx.runMutation(internal.skills.runner.failRun, {
        runId,
        error: error.message,
      });
      throw error;
    }
  },
});

export const sendMessageAndRun = action({
  args: {
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    text: v.string(),
    skillId: v.optional(v.string()),
    params: v.optional(v.any())
  },
  handler: async (ctx, args) => {
    // 1. Save User Message
    await ctx.runMutation(api.skills.runner.sendUserMessage, {
      conversationId: args.conversationId,
      text: args.text,
    });

    // 2. Trigger Chat or Specific Skill
    await ctx.runAction(api.skills.runner.runSkill, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId: args.skillId ?? "CONSULTANT_CHAT",
      params: args.params ? { ...args.params, source: "user_chat" } : { source: "user_chat" },
    });

    // 3. Auto-Rename Check
    const conversation = await ctx.runQuery(internal.skills.runner.getConversation, { conversationId: args.conversationId });
    if (conversation && conversation.title === "New Session") {
      const messages = await ctx.runQuery(api.skills.runner.listAgentMessages, { conversationId: args.conversationId });
      if (messages.length >= 2) {
        await ctx.runAction(api.skills.runner.generateConversationTitle, {
          conversationId: args.conversationId,
          projectId: args.projectId
        });
      }
    }
  }
});

export const generateConversationTitle = action({
  args: {
    conversationId: v.id("agentConversations"),
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(api.skills.runner.listAgentMessages, { conversationId: args.conversationId });
    if (messages.length === 0) return;

    // Prepare history text
    const history = messages.slice(0, 4).map((m: any) => {
      let content = m.text ?? "";
      if (m.blocks) {
        content = m.blocks.map((b: any) => b.markdownHe || b.titleHe || "").join(" ");
      }
      return `${m.role}: ${content}`;
    }).join("\n\n");

    const prompt = `Suggest a very short title (max 5 words) for this conversation. If the language is Hebrew, use Hebrew. Output ONLY the title, no quotes. \n\nConversation:\n${history}`;

    try {
      const response = await completionWithTracing(ctx, {
        model: SMALL_MODEL,
        messages: [{ role: "user", content: prompt }]
      }, {
        projectId: args.projectId,
        conversationId: args.conversationId
      });

      const title = (response as any).choices[0].message.content?.trim().replace(/^["']|["']$/g, "");
      if (title) {
        await ctx.runMutation(api.skills.runner.renameConversation, {
          conversationId: args.conversationId,
          title
        });
      }
    } catch (e) {
      console.error("Failed to generate title", e);
    }
  }
});

// --- Mutations & Queries (Internal) ---

export const renameConversation = mutation({
  args: { conversationId: v.id("agentConversations"), title: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { title: args.title });
  }
});

export const getConversation = internalQuery({
  args: { conversationId: v.id("agentConversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  }
});

export const listAgentConversations = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentConversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  }
});

export const createAgentConversation = mutation({
  args: { projectId: v.id("projects"), title: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentConversations", {
      projectId: args.projectId,
      title: args.title,
      mode: "chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
});

export const listAgentMessages = query({
  args: { conversationId: v.id("agentConversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  }
});

export const getSkillAndGateStatus = internalQuery({
  args: { projectId: v.id("projects"), conversationId: v.id("agentConversations"), skillId: v.string() },
  handler: async (ctx, args) => {
    const skill = await ctx.db.query("skills").withIndex("by_skillId", q => q.eq("skillId", args.skillId)).first();
    if (!skill) return { skill: null, isGateBlocked: false };

    let isGateBlocked = false;
    if (skill.config.requiresClarifications) {
      const session = await ctx.db
        .query("clarificationSessions")
        .withIndex("by_project_target", (q) =>
          q.eq("projectId", args.projectId).eq("targetSkillId", args.skillId)
        )
        .order("desc")
        .first(); // In real app, check conversationId too or assume project-wide satisfaction?
      // Plan said: "if no satisfied session -> run gate". 
      // Let's assume project-wide satisfaction for now to avoid repeating questions.

      if (!session || !session.isSatisfied) {
        isGateBlocked = true;
      }
    }
    return { skill, isGateBlocked };
  }
});

export const createRun = internalMutation({
  args: { projectId: v.id("projects"), conversationId: v.id("agentConversations"), skillId: v.string(), params: v.any() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("skillRuns", {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId: args.skillId,
      status: "running",
      inputParams: args.params,
      createdAt: Date.now(),
    });
  }
});

export const buildContext = internalQuery({
  args: { projectId: v.id("projects"), params: v.any(), skillId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(120);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const materialLines = await ctx.db
      .query("materialLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const workLines = await ctx.db
      .query("workLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const taskAccountingLinks = await ctx.db
      .query("taskAccountingLinks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(500);

    const quoteVersions = await ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1);
    const latestQuote = quoteVersions[0];

    const projectFiles = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(20);

    const memoryDocs = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(20);

    const runningMemory = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "RUNNING_MEMORY"))
      .first();

    const qaQuery = ctx.db
      .query("qaPairs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc");
    const qaPairs =
      args.skillId === "CONTEXT_GENERATION"
        ? await qaQuery.collect()
        : await qaQuery.take(20);

    const userInputLog = await ctx.db
      .query("memoryDocs")
      .withIndex("by_project_kind", (q) => q.eq("projectId", args.projectId).eq("kind", "USER_INPUT_LOG"))
      .first();

    const scopeElementIds = args.params?.scope?.elementIds;
    const scopedElements = Array.isArray(scopeElementIds)
      ? elements.filter((e: any) => scopeElementIds.includes(e._id))
      : elements;

    return {
      projectContext: {
        id: project?._id,
        name: project?.name,
        summaryHe: project?.overviewSummary ?? project?.description ?? "",
        description: project?.description,
        userNotes: project?.notes,
        details: project?.details,
        clientHe: project?.clientName ?? undefined,
        eventDate: project?.details?.eventDate ?? project?.eventDate ?? undefined,
        locationHe: project?.details?.location ?? undefined,
      },
      files: projectFiles.map((f: any) => ({
        fileName: f.fileName,
        summary: f.summary ?? f.extractedInfo?.summary,
        extractedTextSnippet: f.extractedText ? f.extractedText.slice(0, 800) : undefined
      })),
      memories: memoryDocs.map((m: any) => ({
        title: m.title_he,
        content: m.contentMd_he ?? m.rawText_he,
        summary: m.aiSummary?.summaryMd_he
      })),
      currentKnowledge: runningMemory?.contentMd_he ?? "",
      userInput: {
        latestFreeText: args.params?.freeText ?? null,
        log: userInputLog?.contentMd_he ?? ""
      },
      qaPairs: qaPairs.map((qa: any) => ({
        questionHe: qa.question_he,
        questionKey: qa.questionKey,
        answerHe: qa.answer_he,
        createdAt: qa.createdAt
      })),
        elements: {
          approved: scopedElements
            .filter((e: any) => e.status !== "archived")
            .map((e: any) => ({
              id: e._id,
              title: e.title,
              status: e.status === "drafting" ? "approvedForQuote" : e.status,
              type: e.type
            })),
          draft: [],
        },
      tasks: tasks.map((t: any) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        stage: t.stage,
        workType: t.workType,
        workTypeLabelHe: t.workTypeLabelHe,
        estimatedHours:
          t.estimatedHours ?? (t.estimatedMinutes !== undefined ? t.estimatedMinutes / 60 : undefined),
        elementId: t.elementId,
        category: t.category, // Added category as it's needed for the skill
        descriptionHe: t.description, // Mapping description to descriptionHe as best effort
      })),
      laborWorkLines: workLines.map((line: any) => ({
        id: line._id,
        elementId: line.elementId,
        roleHe: line.roleHe, // Matches schema field
        titleHe: line.roleHe ?? line.title, // For AI matching logic
        workType: line.workType,
        hoursPlanned: line.plannedQuantity ?? 0,
        hoursActual: 0,
        notesHe: line.notes,
        isOverhead: line.isManagement ?? false,
        status: line.status,
        assignee: line.assignee,
      })),
      existingLinks: taskAccountingLinks.map((l: any) => ({
        taskId: l.taskId,
        workLineId: l.workLineId,
        lineType: l.lineType,
        allocatedHours: l.allocatedHours
      })),
      accounting: {
        materialLines: materialLines.map((line: any) => ({
          id: line._id,
          title: line.title ?? line.itemName,
          itemName: line.itemName,
          spec: line.spec,
          quantity: line.quantity,
          unitCode: line.unitCode,
          unitLabelHe: line.unitLabelHe,
          plannedUnitCost: line.plannedUnitCost,
          plannedTotalCost: line.plannedTotalCost,
          vendorName: line.vendorName,
          taskId: line.taskId,
          elementId: line.elementId,
        })),
        workLines: workLines.map((line: any) => ({
          id: line._id,
          title: line.title ?? line.roleHe,
          roleHe: line.roleHe,
          plannedQuantity: line.plannedQuantity,
          plannedUnitCost: line.plannedUnitCost,
          plannedTotalCost: line.plannedTotalCost,
          taskId: line.taskId,
          elementId: line.elementId,
          status: line.status,
          assignee: line.assignee,
        })),
      },
      quote: latestQuote
        ? {
          status: latestQuote.status,
          version: latestQuote.version,
          createdAt: latestQuote.createdAt,
        }
        : { status: "none" },
      params: args.params,
    };
  }
});

export const getLatestClarifications = internalQuery({
  args: { projectId: v.id("projects"), targetSkillId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("clarificationSessions")
      .withIndex("by_project_target", (q) =>
        q.eq("projectId", args.projectId).eq("targetSkillId", args.targetSkillId)
      )
      .order("desc")
      .first();
    if (!session) return null;
    return {
      targetSkillId: session.targetSkillId,
      questions: session.questions,
      answers: session.answers ?? null,
      isSatisfied: session.isSatisfied,
    };
  },
});

export const saveRunResult = internalMutation({
  args: {
    runId: v.id("skillRuns"),
    conversationId: v.id("agentConversations"),
    blocks: v.any(),
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    const blocks = args.blocks;


    // Post-process ChangeSets
    for (const block of blocks) {
      if (block.type === "ChangeSetBlock" && block.changeSet) {
        const titleHe = block.titleHe ?? block.title_he;
        const summaryHe = block.summaryHe ?? block.summary_he;

        // Normalize ops to match schema { kind, payload }
        const rawOps = Array.isArray(block.changeSet.ops) ? block.changeSet.ops : [];

        // MACRO EXPANSION: task.syncFromLabor
        // Goal: fetch authoritative data from workLine and generate strict task.patch
        const syncOps = rawOps.filter((op: any) => (op.kind === "task.syncFromLabor" || op.op === "task.syncFromLabor"));
        if (syncOps.length > 0) {
          // 1. Gather IDs
          const workLineIds = [...new Set(syncOps.map((op: any) => op.payload?.workLineId).filter((id: any) => typeof id === "string"))];
          const taskIds = [...new Set(syncOps.map((op: any) => op.payload?.taskId).filter((id: any) => typeof id === "string"))];

          // 2. Fetch Work Lines & Existing Links
          const [workLines, existingLinks] = await Promise.all([
            Promise.all(workLineIds.map((id: string) => ctx.db.get(id as any))),
            ctx.db.query("taskAccountingLinks")
              .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
              .collect() // Fetching all for project might be heavy, but safe for now. Optimally we'd filter.
          ]);

          const workLineMap = new Map();
          workLines.forEach((wl: any) => { if (wl) workLineMap.set(wl._id, wl); });

          // 3. Expand Ops
          for (let i = 0; i < rawOps.length; i++) {
            const op = rawOps[i];
            if (op.kind === "task.syncFromLabor" || op.op === "task.syncFromLabor") {
              const wl = workLineMap.get(op.payload?.workLineId);
              const targetTaskId = op.payload?.taskId;

              if (wl && targetTaskId) {
                // A. Generate Task Patch
                rawOps[i] = {
                  kind: "task.patch",
                  payload: {
                    taskId: targetTaskId,
                    fields: {
                      title: wl.roleHe || wl.title, // Enforce title sync
                      estimatedHours: wl.plannedQuantity, // Enforce hours sync
                    }
                  }
                };

                // B. Enforce 1:1 Linkage (Clean up messy links)
                // Findings existing links for this Task OR this WorkLine
                const relatedLinks = existingLinks.filter((l: any) =>
                  l.taskId === targetTaskId || l.workLineId === wl._id
                );

                // We want EXACTLY ONE link: { taskId: targetTaskId, workLineId: wl._id }
                // Any link that involves either side but isn't THIS specific pair must be deleted.
                // Any link that IS this pair must be kept (or created if missing).

                let linkExists = false;

                for (const link of relatedLinks) {
                  const isCorrectPair = (link.taskId === targetTaskId && link.workLineId === wl._id);

                  if (isCorrectPair) {
                    linkExists = true;
                  } else {
                    // It's a conflict! 
                    // e.g. Task is linked to OldWorkLine, or WorkLine is linked to OtherTask
                    // We generate a delete op.
                    // Check if we already added a delete op (to avoid dups)? 
                    // The Set in ops normalized list will handle it or we just append.
                    rawOps.push({
                      kind: "taskAccountingLink.delete",
                      payload: { linkId: link._id }
                    });
                  }
                }

                if (!linkExists) {
                  rawOps.push({
                    kind: "taskAccountingLink.create",
                    payload: {
                      taskId: targetTaskId,
                      lineType: "labor",
                      workLineId: wl._id,
                      allocatedHours: wl.plannedQuantity
                    }
                  });
                }

              } else {
                // Fallback if workLine not found: just ignore or let it fail downstream? 
                // We'll mark it unknown so it gets filtered or tracked
                rawOps[i] = { kind: "unknown", payload: { error: "WorkLine not found for sync", ...op.payload } };
              }
            }
          }
        }
        const normalizedOps = rawOps.map((op: any) => {
          if (op.kind && op.payload) return op; // Already correct

          let kind = op.kind ?? op.op;
          const payload = { ...op };
          delete payload.kind;
          delete payload.op;
          delete payload.entity; // Remove entity/action from payload as they are metadata for kind mapping
          delete payload.action;

          if (!kind && op.entity && op.action) {
            const e = op.entity;
            const a = op.action;
            if (e === "task") {
              if (a === "create") kind = "task.create";
              if (a === "update") kind = "task.patch";
              if (a === "archive") {
                kind = "task.patch";
                // Ensure fields object exists
                if (!payload.fields) payload.fields = {};
                payload.fields.status = "archived";
              }
            } else if (e === "taskAccountingLink") {
              if (a === "upsert" || a === "create") kind = "taskAccountingLink.create";
              if (a === "delete") kind = "taskAccountingLink.delete";
            } else if (e === "workLine") {
              if (a === "create") kind = "workLine.create";
              if (a === "update") kind = "workLine.patch";
              if (a === "delete") kind = "workLine.delete";
            } else if (e === "materialLine") {
              if (a === "create") kind = "materialLine.create";
              if (a === "update") kind = "materialLine.patch";
              if (a === "delete") kind = "materialLine.delete";
            }
          }

          // Compatibility Fix: Normalize "update" to "patch" if the model guessed wrong
          if (kind === "task.update") kind = "task.patch";
          if (kind === "workLine.update") kind = "workLine.patch";
          if (kind === "materialLine.update") kind = "materialLine.patch";

          if (!kind) kind = "unknown";

          return { kind, payload };
        });

        const changeSetId = await ctx.db.insert("changeSets", {
          projectId: args.projectId,
          stage: "IDEATION",
          status: "PROPOSED",
          ops: normalizedOps,
          reason_he: titleHe,
          preview_he: summaryHe ? { summary: summaryHe } : undefined,
          sourceSkillRunId: args.runId,
          createdAt: Date.now(),
        });
        block.changeSetId = changeSetId;
      }
    }

    // Auto-create Clarification Session if QuestionsBlock is present
    const questionsBlock = blocks.find((b: any) => b.type === "QuestionsBlock");
    if (questionsBlock && questionsBlock.questions && questionsBlock.questions.length > 0) {
      const run = await ctx.db.get(args.runId);
      if (run) {
        await ctx.db.insert("clarificationSessions", {
          projectId: args.projectId,
          conversationId: args.conversationId,
          targetSkillId: run.skillId,
          questions: questionsBlock.questions,
          isSatisfied: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    const run = await ctx.db.get(args.runId);
    if (run?.skillId === "CONTEXT_GENERATION") {
      const docBlock = blocks.find((b: any) => b.type === "ChatBlock" && typeof b.markdownHe === "string");
      if (docBlock?.markdownHe?.trim()) {
        await ctx.runMutation(api.memory.updateRunningMemory, {
          projectId: args.projectId,
          contentMd_he: docBlock.markdownHe,
        });
      }
    }

    await ctx.db.patch(args.runId, {
      status: "succeeded",
      blocks: blocks,
    });

    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      blocks: blocks,
      runId: args.runId,
      createdAt: Date.now(),
    });

    return blocks;
  }
});

export const failRun = internalMutation({
  args: { runId: v.id("skillRuns"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      rawModelResponse: args.error,
    });
  }
});

export const createClarificationSession = internalMutation({
  args: { projectId: v.id("projects"), conversationId: v.id("agentConversations"), targetSkillId: v.string(), questions: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.insert("clarificationSessions", {
      projectId: args.projectId,
      conversationId: args.conversationId,
      targetSkillId: args.targetSkillId,
      questions: args.questions,
      isSatisfied: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
});

export const sendUserMessage = mutation({
  args: { conversationId: v.id("agentConversations"), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "user",
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

export const submitClarifications = mutation({
  args: {
    conversationId: v.id("agentConversations"),
    answersById: v.any()
  },
  handler: async (ctx, args) => {
    // 1. Find the session (using filter fallback for robustness)
    const session = await ctx.db
      .query("clarificationSessions")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .first();

    if (!session) {
      // Fallback check with filter (in case index is lagging or misnamed)
      const fallback = await ctx.db
        .query("clarificationSessions")
        .filter(q => q.eq(q.field("conversationId"), args.conversationId))
        .order("desc")
        .first();

      if (!fallback) {
        console.error(`[submitClarifications] No session found for conv ${args.conversationId}`);
        throw new Error("No active clarification session found (DB empty for this conv)");
      }
      // Use fallback
      await ctx.db.patch(fallback._id, {
        answers: args.answersById,
        isSatisfied: true,
        updatedAt: Date.now(),
      });

      await persistClarificationAnswers(ctx, fallback, args.answersById);

      await ctx.db.insert("agentMessages", {
        conversationId: args.conversationId,
        role: "user",
        text: "Submitted answers for clarifications.",
        createdAt: Date.now(),
      });

      return { success: true, targetSkillId: fallback.targetSkillId };
    }

    // 2. Update session
    await ctx.db.patch(session._id, {
      answers: args.answersById,
      isSatisfied: true,
      updatedAt: Date.now(),
    });

    await persistClarificationAnswers(ctx, session, args.answersById);

    // 3. Add User Message to chat
    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "user",
      text: "Submitted answers for clarifications.",
      createdAt: Date.now(),
    });

    return {
      success: true,
      targetSkillId: session.targetSkillId
    };
  }
});

async function persistClarificationAnswers(
  ctx: any,
  session: any,
  answersById: Record<string, string>
) {
  const questions = Array.isArray(session?.questions) ? session.questions : [];
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i] ?? {};
    const questionId = question.id ?? `q${i}`;
    const answer = answersById?.[questionId];
    if (!answer || !String(answer).trim()) continue;

    const questionText =
      question.textHe ??
      question.text_he ??
      question.question_he ??
      question.question ??
      question.labelHe ??
      question.label ??
      question.text;

    if (!questionText || !String(questionText).trim()) continue;

    const topicKey = normalizeQuestionKey(question.topicKey);
    const questionKey = topicKey || String(questionText).trim().toLowerCase();
    const existing = await ctx.db
      .query("qaPairs")
      .withIndex("by_project_questionKey", (q: any) =>
        q.eq("projectId", session.projectId).eq("questionKey", questionKey)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        answer_he: String(answer),
        source: {
          sourceType: "CLARIFICATION_BLOCK",
          conversationId: session.conversationId,
        },
      });
      continue;
    }

    await ctx.db.insert("qaPairs", {
      projectId: session.projectId,
      question_he: String(questionText),
      questionKey,
      answer_he: String(answer),
      source: {
        sourceType: "CLARIFICATION_BLOCK",
        conversationId: session.conversationId,
      },
      createdAt: Date.now(),
    });
  }
}
export const saveAgentMessage = internalMutation({
  args: { conversationId: v.id("agentConversations"), blocks: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      blocks: args.blocks,
      createdAt: Date.now(),
    });
  }
});

export const getGateSkill = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("skills")
      .withIndex("by_skillId", (q) => q.eq("skillId", "CLARIFICATIONS_GATE"))
      .first();
  }
});

// --- Helpers ---

async function runGateLogic(ctx: any, args: { projectId: any; conversationId: any; targetSkillId: string; targetSkillLabel: string }) {
  const gateSkill = await ctx.runQuery(internal.skills.runner.getGateSkill);
  if (!gateSkill) throw new Error("Clarifications Gate skill not found");

  const context = await ctx.runQuery(internal.skills.runner.buildContext, { projectId: args.projectId, params: {} });
  const clarification = await ctx.runQuery(internal.skills.runner.getLatestClarifications, {
    projectId: args.projectId,
    targetSkillId: args.targetSkillId,
  });
  const gateContext = {
    targetSkillId: args.targetSkillId,
    projectContext: context.projectContext,
    files: context.files,
    memories: context.memories,
    qaPairs: context.qaPairs,
    priorClarifications: clarification,
    currentState: {
      elements: context.elements,
      tasks: context.tasks,
      accounting: context.accounting,
      quote: context.quote,
    },
    toggles: {
      useOnlyApprovedElements: true,
    },
  };
  const prompt = `${gateSkill.prompts.promptAddon}\n\nTARGET SKILL: ${args.targetSkillLabel} (${args.targetSkillId}).\nAsk questions relevant to this target.`;

  const blocks = await callLLM(ctx, buildSystemPrompt({ ...gateSkill, prompts: { ...gateSkill.prompts, promptAddon: prompt } }, gateContext), {}, gateSkill.model, { projectId: args.projectId, conversationId: args.conversationId });

  // Store Session
  const questionsBlock = blocks.find((b: any) => b.type === "QuestionsBlock");
  if (questionsBlock && questionsBlock.questions) {
    const filteredQuestions = filterUnansweredQuestions(questionsBlock.questions, {
      qaPairs: context.qaPairs,
      priorClarifications: clarification
    });

    if (filteredQuestions.length === 0) {
      await ctx.db.insert("clarificationSessions", {
        projectId: args.projectId,
        conversationId: args.conversationId,
        targetSkillId: args.targetSkillId,
        questions: [],
        answers: {},
        isSatisfied: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return await ctx.runAction(api.skills.runner.runSkill, {
        projectId: args.projectId,
        conversationId: args.conversationId,
        skillId: args.targetSkillId,
        params: { source: "gate_auto_skip" }
      });
    }

    questionsBlock.questions = filteredQuestions;
    questionsBlock.continueAction = {
      labelHe: questionsBlock.continueAction?.labelHe ?? "המשך",
      payload: { targetSkillId: args.targetSkillId }
    };
    if (!questionsBlock.followupAction) {
      questionsBlock.followupAction = { labelHe: "שאלו עוד שאלות" };
    }
    questionsBlock.targetSkillId = args.targetSkillId;
    await ctx.runMutation(internal.skills.runner.createClarificationSession, {
      projectId: args.projectId,
      conversationId: args.conversationId,
      targetSkillId: args.targetSkillId,
      questions: filteredQuestions
    });
  }

  // Save Message
  await ctx.runMutation(internal.skills.runner.saveAgentMessage, {
    conversationId: args.conversationId,
    blocks
  });

  return blocks;
}

function buildSystemPrompt(skill: any, context: any) {
  let toolInstructions = "";
  if (skill.config.allowedTools?.webSearch) {
    toolInstructions += `\nYou have access to a 'web_search' tool. Use it to find real-time info. When using it, output a tool call, not a block.`;
  }
  if (skill.config.allowedTools?.runSkill) {
    toolInstructions += `\nYou have access to a 'run_skill' tool. Use it to invoke other skills (builders, research, etc) when you are confident they are needed. Do not ask for permission if the user intent is clear.`;
  }

  const addon = skill.prompts?.promptAddon ?? "";

  return `${SHARED_HEADER}${toolInstructions}\n\n${addon}\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}`;
}

async function callLLM(ctx: any, systemPrompt: string, allowedTools: any, model?: string, contextInfo?: { projectId: any, conversationId: any }) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("No OPENAI_API_KEY, using mock response");
    // Simulate delay
    await new Promise(r => setTimeout(r, 1000));
    return [
      {
        type: "ChatBlock",
        markdownHe: "אין מפתח OpenAI, אני במצב בדיקה. (Server Action)",
      },
      {
        type: "SuggestionsBlock",
        titleHe: "פעולות בדיקה",
        suggestions: [{ id: "test", labelHe: "בדיקה", whyHe: "כי אין מפתח" }]
      }
    ];
  }

  const tools: any[] = [];

  if (allowedTools?.webSearch) {
    tools.push({
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for real-time information.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" }
          },
          required: ["query"]
        }
      }
    });
  }

  if (allowedTools?.runSkill) {
    tools.push({
      type: "function",
      function: {
        name: "run_skill",
        description: "Invoke another skill (e.g. TASKS_BUILDER_FULL).",
        parameters: {
          type: "object",
          properties: {
            skillId: { type: "string", description: "The ID of the skill to run." },
            reason: { type: "string", description: "Why you are running this skill." }
          },
          required: ["skillId"]
        }
      }
    });
  }

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  let loopCount = 0;
  while (loopCount < 5) {
    loopCount++;
    loopCount++;
    const response = await completionWithTracing(ctx, {
      model: model ?? OPENAI_MODEL,
      messages: messages,
      tools: tools.length > 0 ? tools : undefined,
      response_format: { type: "json_object" },
    }, {
      projectId: contextInfo?.projectId,
      conversationId: contextInfo?.conversationId,
    });
    const message = (response as any).choices[0].message;
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const tc = toolCall as any;
        if (tc.function.name === "web_search") {
          const args = JSON.parse(tc.function.arguments);
          const result = await searchWeb(args.query);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }
        if (tc.function.name === "run_skill") {
          const args = JSON.parse(tc.function.arguments);
          if (contextInfo) {
            try {
              const resultBlocks = await ctx.runAction(api.skills.runner.runSkill, {
                projectId: contextInfo.projectId,
                conversationId: contextInfo.conversationId,
                skillId: args.skillId,
                params: { source: "orchestrator" }
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ status: "success", resultSummary: "Skill executed successfully. Results added to chat." })
              });
            } catch (e: any) {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ status: "error", error: e.message })
              });
            }
          } else {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ status: "error", error: "Context missing" })
            });
          }
        }
      }
      continue; // Loop again to let LLM process tool results
    }

    // FALLBACK: Check for text-embedded tool calls (e.g. {"tool_call": ...})
    // This handles models that output tool calls as JSON objects in content instead of native calls.
    const contentText = message.content || "";
    const embeddedToolCalls: any[] = [];
    // Regex to match {"tool_call": ... } objects. 
    // Captures the full JSON object. Note: nested braces might break simple regex, but this covers common cases.
    const rawToolRegex = /\{"tool_call":\s*\{(?:[^{}]|{[^{}]*})*\}\}/g;
    let match;
    while ((match = rawToolRegex.exec(contentText)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.tool_call) embeddedToolCalls.push(parsed.tool_call);
      } catch (e) {
        // Ignore parse errors, likely not a valid tool call
      }
    }

    if (embeddedToolCalls.length > 0) {
      console.log("Found embedded tool calls:", embeddedToolCalls.length);
      // We must synthesize a tool response conversation turn.
      // Since these didn't come from a real "assistant" with tool_calls, we have to be careful.
      // We'll treat them as if the assistant asked for them.
      // But we can't easily modify the previous 'assistant' message object structure retrospectively without native tool_calls.
      // So instead, we will just APPEND a 'user' or 'system' role message with the results, or inject them into the context.

      // Better strategy: Execute them, and append a "system" message with the results.
      const results = [];
      for (const tc of embeddedToolCalls) {
        if (tc.name === "web_search") {
          const args = tc.arguments;
          const result = await searchWeb(args.query);
          results.push(`Tool 'web_search' (${args.query}) result: ${JSON.stringify(result)}`);
        }
        // Add other tools if needed
      }

      if (results.length > 0) {
        messages.push({
          role: "system",
          content: `Tool Execution Results:\n${results.join("\n\n")}\n\nUse these results to formulate your response.`
        });
        continue; // Loop again
      }
    }

    // Final response
    const content = message.content;
    if (!content) throw new Error("Empty response from LLM");

    const parsed = tryParseJson(content);
    if (!parsed) {
      console.warn("JSON parse failed, returning text block", content);
      return [{ type: "ChatBlock", markdownHe: content }];
    }


    let blocks = parsed.blocks || parsed;
    if (!Array.isArray(blocks)) blocks = [blocks];

    // Handle sibling changeSet (new pattern)
    if (parsed.changeSet && typeof parsed.changeSet === "object" && Array.isArray(parsed.changeSet.ops)) {
      blocks.push({
        type: "ChangeSetBlock",
        titleHe: parsed.changeSet.titleHe || parsed.summaryHe || "שינויים מוצעים",
        summaryHe: parsed.changeSet.summaryHe,
        changeSet: parsed.changeSet
      });
    }

    // Preserve summaryHe if it exists on the parent object
    if (parsed.summaryHe && typeof parsed.summaryHe === "string") {
      blocks.unshift({
        type: "ChatBlock",
        markdownHe: parsed.summaryHe
      });
    }

    return normalizeBlocks(blocks);
  }

  throw new Error("Max turns reached");
}

function normalizeBlocks(rawBlocks: any[]): any[] {
  return rawBlocks.flatMap(block => {
    let processed = { ...block };

    // 1. Handle blocks wrapped in a key named after the type (e.g. { "QuestionsBlock": [...] })
    if (!processed.type) {
      if (processed.QuestionsBlock && Array.isArray(processed.QuestionsBlock)) {
        processed = {
          type: "QuestionsBlock",
          questions: processed.QuestionsBlock.map((q: any, i: number) => {
            if (typeof q === "string") return { id: `q${i}`, textHe: q };
            return q;
          })
        };
      }
      else if (processed.ChatBlock) processed = { type: "ChatBlock", markdownHe: processed.ChatBlock };
      else if (processed.SuggestionBlock) processed = { type: "SuggestionsBlock", ...processed.SuggestionBlock };
      else if (processed.SuggestionsBlock) processed = { type: "SuggestionsBlock", ...processed.SuggestionsBlock };
      else if (processed.ChangeSetBlock) processed = { type: "ChangeSetBlock", ...processed.ChangeSetBlock };
      else if (processed.ReviewBlock) processed = { type: "ReviewBlock", ...processed.ReviewBlock };
      else if (processed.ShoppingPlanBlock) processed = { type: "ShoppingPlanBlock", ...processed.ShoppingPlanBlock };
      else if (processed.PrintQaBlock) processed = { type: "PrintQaBlock", ...processed.PrintQaBlock };
      else if (processed.ReceiptBlock) processed = { type: "ReceiptBlock", ...processed.ReceiptBlock };
      else if (processed.RunbookBlock) processed = { type: "RunbookBlock", ...processed.RunbookBlock };
      else if (processed.DailyPlanBlock) processed = { type: "DailyPlanBlock", ...processed.DailyPlanBlock };
    }

    // 2. If it's a QuestionsBlock but questions are just strings, wrap them
    if (processed.type === "QuestionsBlock" && Array.isArray(processed.questions)) {
      processed.questions = processed.questions.map((q: any, i: number) => {
        if (typeof q === "string") return { id: `q${i}`, textHe: q };
        return q;
      });
    }

    // 3. Normalize fields (snake_case -> camelCase)
    processed = normalizeBlockFields(processed);

    // 4. Split mixed content (Markdown + Other)
    // If a block has markdownHe/text but is NOT ChatBlock, split it.
    if (processed.type !== "ChatBlock") {
      const text = processed.markdownHe || (processed.text !== processed.titleHe ? processed.text : undefined);
      if (text && typeof text === "string" && text.length > 0) {
        const chatBlock = { type: "ChatBlock", markdownHe: text };
        const mainBlock = { ...processed };
        // Optional: delete mainBlock.markdownHe to clean up
        return [chatBlock, mainBlock];
      }
    }

    return [processed];
  });
}

function normalizeBlockFields(block: any) {
  if (!block || typeof block !== "object") return block;
  const normalized = { ...block };
  const mapKey = (from: string, to: string) => {
    if (normalized[from] !== undefined && normalized[to] === undefined) {
      normalized[to] = normalized[from];
    }
  };
  mapKey("title_he", "titleHe");
  mapKey("summary_he", "summaryHe");
  mapKey("markdown_he", "markdownHe");
  mapKey("free_text_prompt_he", "freeTextPromptHe");
  mapKey("submitLabel_he", "submitLabelHe");
  if (Array.isArray(normalized.suggestions)) {
    normalized.suggestions = normalized.suggestions.map((item: any) => {
      if (typeof item === "string") return { labelHe: item, id: item };
      if (!item || typeof item !== "object") return item;
      const next = { ...item };
      if (next.labelHe === undefined && next.label_he !== undefined) next.labelHe = next.label_he;
      if (!next.labelHe) next.labelHe = next.label || next.text || next.title || next.description || next.name;
      if (next.whyHe === undefined && next.why_he !== undefined) next.whyHe = next.why_he;
      if (next.detailsHe === undefined && next.details_he !== undefined) next.detailsHe = next.details_he;
      return next;
    });
  }
  if (Array.isArray(normalized.items) && !normalized.suggestions) {
    normalized.suggestions = normalized.items.map((item: any) => {
      if (typeof item === "string") return { labelHe: item, id: item };
      if (!item || typeof item !== "object") return item;
      const next = { ...item };
      if (next.labelHe === undefined && next.label_he !== undefined) next.labelHe = next.label_he;
      if (!next.labelHe) next.labelHe = next.label || next.text || next.title || next.description || next.name;
      if (next.whyHe === undefined && next.why_he !== undefined) next.whyHe = next.why_he;
      if (next.detailsHe === undefined && next.details_he !== undefined) next.detailsHe = next.details_he;
      return next;
    });
  }
  if (Array.isArray(normalized.questions)) {
    normalized.questions = normalized.questions.map((q: any) => {
      if (!q || typeof q !== "object") return q;
      const next = { ...q };
      if (next.textHe === undefined && next.text_he !== undefined) next.textHe = next.text_he;
      if (next.optionsHe === undefined && next.options_he !== undefined) next.optionsHe = next.options_he;
      return next;
    });
  }
  return normalized;
}

function filterUnansweredQuestions(
  questions: any[],
  context: { qaPairs?: Array<{ questionHe?: string; questionKey?: string; answerHe?: string }>; priorClarifications?: any }
) {
  const normalizedAnswered = new Set<string>();
  const qaPairs = Array.isArray(context.qaPairs) ? context.qaPairs : [];
  for (const qa of qaPairs) {
    const key = normalizeQuestionKey(qa?.questionKey || qa?.questionHe);
    if (key) normalizedAnswered.add(key);
  }

  const priorQuestions = context.priorClarifications?.questions ?? [];
  const priorAnswers = context.priorClarifications?.answers ?? {};
  const answeredIds = new Set<string>();
  for (let i = 0; i < priorQuestions.length; i++) {
    const q = priorQuestions[i] ?? {};
    const qid = q.id ?? `q${i}`;
    const answer = priorAnswers?.[qid];
    if (answer && String(answer).trim()) answeredIds.add(String(qid));

    const key = normalizeQuestionKey(
      q.topicKey ?? q.textHe ?? q.text_he ?? q.question_he ?? q.question ?? q.labelHe ?? q.label ?? q.text
    );
    if (key && answer && String(answer).trim()) normalizedAnswered.add(key);
  }

  return (questions ?? []).filter((question: any, index: number) => {
    if (!question) return false;
    const questionId = String(question.id ?? `q${index}`);
    if (answeredIds.has(questionId)) return false;

    const key = normalizeQuestionKey(
      question.topicKey ??
      question.textHe ??
      question.text_he ??
      question.question_he ??
      question.question ??
      question.labelHe ??
      question.label ??
      question.text
    );
    if (key && normalizedAnswered.has(key)) return false;
    return true;
  });
}

function normalizeQuestionKey(text?: string) {
  if (!text) return "";
  return String(text).trim().toLowerCase();
}

function tryParseJson(text: string) {
  try {
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```json\s*([\s\S]*)$/i);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*)$/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed && typeof parsed === "object") return parsed;
    }

    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (e) {
      // Failed to parse cleaned text. Try to find the first '{' and last '}'
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
        try {
          const parsed = JSON.parse(jsonCandidate);
          if (parsed && typeof parsed === "object") return parsed;
        } catch (e2) {
          // Still failed
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
  return null;
}
