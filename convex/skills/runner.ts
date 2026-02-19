import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { internalMutation, internalQuery, mutation, query, action } from "../_generated/server";

// --- Public API (Action Wrappers for Backward Compatibility) ---

export const runSkill = action({
  args: {
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    skillId: v.string(),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(api.skills.actions.runSkill, args);
  }
});

export const startRun = action({
  args: {
    projectId: v.id("projects"),
    conversationId: v.id("agentConversations"),
    skillId: v.string(),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(api.skills.actions.runSkill, args);
  }
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
    return await ctx.runAction(api.skills.actions.sendMessageAndRun, args);
  }
});

export const generateConversationTitle = action({
  args: {
    conversationId: v.id("agentConversations"),
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(api.skills.actions.generateConversationTitle, args);
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

export const getActiveConversationRun = query({
  args: { conversationId: v.id("agentConversations") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("skillRuns")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.eq(q.field("status"), "running"))
      .collect();

    if (runs.length === 0) return null;
    runs.sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return runs[0];
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
    const now = Date.now();
    return await ctx.db.insert("skillRuns", {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillId: args.skillId,
      status: "running",
      phase: "queued",
      phaseLabel: "Queued skill",
      phaseDetail: "Preparing run",
      inputParams: args.params,
      startedAt: now,
      updatedAt: now,
      createdAt: now,
    });
  }
});

export const setRunProgress = internalMutation({
  args: {
    runId: v.id("skillRuns"),
    phase: v.string(),
    phaseLabel: v.string(),
    phaseDetail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      phase: args.phase,
      phaseLabel: args.phaseLabel,
      phaseDetail: args.phaseDetail,
      updatedAt: Date.now(),
    });
  },
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
    const allMaterialLines = await ctx.db
      .query("materialLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);
    const allWorkLines = await ctx.db
      .query("workLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200);

    const scopeElementIds = args.params?.scope?.elementIds;
    const materialLines = Array.isArray(scopeElementIds)
      ? allMaterialLines.filter((l: any) => l.elementId && scopeElementIds.includes(l.elementId))
      : allMaterialLines;
    const workLines = Array.isArray(scopeElementIds)
      ? allWorkLines.filter((l: any) => l.elementId && scopeElementIds.includes(l.elementId))
      : allWorkLines;
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

    const catalogPriceRecords = await ctx.db
      .query("catalogPriceRecords")
      .order("desc")
      .take(50);
    const materialTemplates = await ctx.db
      .query("materialTemplates")
      .take(200);
    const materialVariants = await ctx.db
      .query("materialVariants")
      .take(200);

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
      catalogPriceRecords: catalogPriceRecords.map((record: any) => ({
        id: record._id,
        variantId: record.variantId,
        templateId: record.templateId,
        amount: record.amount,
        currency: record.currency,
        pricingModel: record.pricingModel,
        sourceType: record.sourceType,
        checkedAt: record.checkedAt,
        url: record.url,
      })),
      catalog: {
        templates: materialTemplates.map((template: any) => ({
          id: template._id,
          nameHe: template.nameHe,
          kind: template.kind,
          defaultUomCode: template.defaultUomCode,
          searchKeywords: template.searchKeywords ?? [],
        })),
        variants: materialVariants.map((variant: any) => ({
          id: variant._id,
          templateId: variant.templateId,
          labelHe: variant.labelHe,
          attributes: variant.attributes,
          normalizedKey: variant.normalizedKey,
          thicknessMm: variant.thicknessMm,
          widthMm: variant.widthMm,
          heightMm: variant.heightMm,
          lengthMm: variant.lengthMm,
          uomCode: variant.uomCode,
        })),
      },
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
          uomCode: line.uomCode,
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
    let blocks = sanitizeKeys(args.blocks);
    const now = Date.now();
    const hasChangeSetBlock = Array.isArray(blocks) && blocks.some((b: any) => b?.type === "ChangeSetBlock");

    const run = await ctx.db.get(args.runId);
    // Removed isPricingSkill logic that forced webPriceOps into the blocks.
    // We now trust the LLM to output the parsed ChangeSetBlock.
    const suppressSuggestions = run?.inputParams?.source === "flow_runner";
    if (suppressSuggestions) {
      blocks = (Array.isArray(blocks) ? blocks : []).filter((b: any) =>
        b?.type !== "SuggestionsBlock" && b?.type !== "SuggestionBlock"
      );
    }

    let quoteDraftSavedId: any = null;

    for (const block of Array.isArray(blocks) ? blocks : []) {
      const memoryDocs = Array.isArray(block?.memoryDocs)
        ? block.memoryDocs
        : block?.memoryDoc
          ? [block.memoryDoc]
          : null;
      if (memoryDocs) {
        for (const doc of memoryDocs) {
          if (!doc?.kind || !doc?.contentMd_he) continue;
          const id = await ctx.runMutation(internal.memory.upsertMemoryDoc, {
            projectId: args.projectId,
            kind: String(doc.kind),
            title_he: typeof doc.title_he === "string" ? doc.title_he : undefined,
            contentMd_he: String(doc.contentMd_he),
          });
        }
      }

      const quoteDraft = block?.quoteDraft ?? block?.quote ?? null;
      if (quoteDraft) {
        quoteDraftSavedId = await ctx.runMutation(internal.quotes.saveDraftFromPayload, {
          projectId: args.projectId,
          payload: quoteDraft,
        });
        block.quoteDraftSavedId = quoteDraftSavedId;
      }
    }

    const isPricingFallback = run?.skillId === "PRICING_ESTIMATE_FALLBACK_BATCH";
    const needsLineState = isPricingFallback || (Array.isArray(blocks) && blocks.some((b: any) =>
      b?.type === "ChangeSetBlock" && Array.isArray(b?.changeSet?.ops) &&
      b.changeSet.ops.some((op: any) => op?.kind === "materialLine.create" || op?.kind === "workLine.create")
    ));
    const [materialLines, workLines] = needsLineState
      ? await Promise.all([
        ctx.db.query("materialLines").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect(),
        ctx.db.query("workLines").withIndex("by_project", (q: any) => q.eq("projectId", args.projectId)).collect()
      ])
      : [[], []];

    const normalizeKey = (value: any) => String(value ?? "").trim().toLowerCase();
    const pickFields = (fields: any, keys: string[]) => {
      const out: any = {};
      for (const key of keys) {
        if (fields && fields[key] !== undefined) out[key] = fields[key];
      }
      return out;
    };

    const coercePricingFallbackOps = (ops: any[]) => {
      if (!isPricingFallback) return ops;
      return ops.map((op: any) => {
        if (!op || !op.kind || !op.payload) return op;
        if (op.kind === "materialLine.create") {
          const fields = op.payload.fields ?? op.payload;
          const itemName = fields?.itemName ?? fields?.title ?? op.payload?.itemName;
          if (!itemName) return op;
          const elementId = op.payload?.elementId ?? fields?.elementId;
          const taskId = op.payload?.taskId ?? fields?.taskId;
          const nameKey = normalizeKey(itemName);
          const candidates = materialLines.filter((l: any) => normalizeKey(l.itemName) === nameKey)
            .filter((l: any) => (elementId ? String(l.elementId ?? "") === String(elementId) : true))
            .filter((l: any) => (taskId ? String(l.taskId ?? "") === String(taskId) : true));
          if (candidates.length === 0) return op;
          const scored = candidates.sort((a: any, b: any) => {
            const aMissing = (!a.plannedUnitCost || !a.plannedTotalCost || !a.pricingSourceCode || !a.priceCheckedAt || a.confidence === undefined) ? 1 : 0;
            const bMissing = (!b.plannedUnitCost || !b.plannedTotalCost || !b.pricingSourceCode || !b.priceCheckedAt || b.confidence === undefined) ? 1 : 0;
            return bMissing - aMissing;
          });
          const target = scored[0];
          const pricingFields = pickFields(fields, [
            "plannedUnitCost",
            "plannedTotalCost",
            "pricingSourceCode",
            "priceCheckedAt",
            "priceUrl",
            "confidence",
            "sourceCode",
            "sourceLabelHe",
            "source",
            "vendorId",
            "vendorName",
            "notes",
          ]);
          if (Object.keys(pricingFields).length === 0) return op;
          return {
            kind: "materialLine.patch",
            payload: {
              lineId: target._id,
              fields: pricingFields,
            },
          };
        }
        if (op.kind === "workLine.create") {
          const fields = op.payload.fields ?? op.payload;
          const roleHe = fields?.roleHe ?? fields?.title ?? op.payload?.roleHe;
          if (!roleHe) return op;
          const elementId = op.payload?.elementId ?? fields?.elementId;
          const taskId = op.payload?.taskId ?? fields?.taskId;
          const nameKey = normalizeKey(roleHe);
          const candidates = workLines.filter((l: any) => normalizeKey(l.roleHe) === nameKey)
            .filter((l: any) => (elementId ? String(l.elementId ?? "") === String(elementId) : true))
            .filter((l: any) => (taskId ? String(l.taskId ?? "") === String(taskId) : true));
          if (candidates.length === 0) return op;
          const scored = candidates.sort((a: any, b: any) => {
            const aMissing = (!a.plannedUnitCost || !a.plannedTotalCost || a.confidence === undefined) ? 1 : 0;
            const bMissing = (!b.plannedUnitCost || !b.plannedTotalCost || b.confidence === undefined) ? 1 : 0;
            return bMissing - aMissing;
          });
          const target = scored[0];
          const pricingFields = pickFields(fields, [
            "plannedUnitCost",
            "plannedTotalCost",
            "confidence",
            "sourceCode",
            "sourceLabelHe",
            "source",
            "notes",
          ]);
          if (Object.keys(pricingFields).length === 0) return op;
          return {
            kind: "workLine.patch",
            payload: {
              lineId: target._id,
              fields: pricingFields,
            },
          };
        }
        return op;
      });
    };
    const coerceDuplicateLineCreates = (ops: any[]) => {
      if (!needsLineState) return ops;
      const normalizeKey = (value: any) => String(value ?? "").trim().toLowerCase();
      const materialByDedup = new Map<string, any>();
      const workByDedup = new Map<string, any>();
      for (const line of materialLines) {
        if (line?.dedupKey) materialByDedup.set(String(line.dedupKey), line);
      }
      for (const line of workLines) {
        if (line?.dedupKey) workByDedup.set(String(line.dedupKey), line);
      }
      const findMaterialMatch = (fields: any, payload: any) => {
        const dedupKey = fields?.dedupKey;
        if (dedupKey && materialByDedup.has(dedupKey)) return materialByDedup.get(dedupKey);
        const nameKey = normalizeKey(fields?.itemName ?? fields?.title ?? payload?.itemName);
        if (!nameKey) return null;
        const elementId = payload?.elementId ?? fields?.elementId;
        const taskId = payload?.taskId ?? fields?.taskId;
        return materialLines.find((l: any) =>
          normalizeKey(l.itemName) === nameKey &&
          String(l.elementId ?? "") === String(elementId ?? "") &&
          String(l.taskId ?? "") === String(taskId ?? "")
        ) ?? null;
      };
      const findWorkMatch = (fields: any, payload: any) => {
        const dedupKey = fields?.dedupKey;
        if (dedupKey && workByDedup.has(dedupKey)) return workByDedup.get(dedupKey);
        const roleKey = normalizeKey(fields?.roleHe ?? fields?.title ?? payload?.roleHe);
        if (!roleKey) return null;
        const elementId = payload?.elementId ?? fields?.elementId;
        const taskId = payload?.taskId ?? fields?.taskId;
        return workLines.find((l: any) =>
          normalizeKey(l.roleHe) === roleKey &&
          String(l.elementId ?? "") === String(elementId ?? "") &&
          String(l.taskId ?? "") === String(taskId ?? "")
        ) ?? null;
      };
      const materialPatchFields = [
        "itemName",
        "spec",
        "quantity",
        "uomCode",
        "unitCode",
        "plannedUnitCost",
        "plannedTotalCost",
        "vendorName",
        "notes",
        "workType",
        "templateId",
        "variantId",
        "priceRecordId",
        "pricingSourceCode",
        "priceCheckedAt",
        "priceUrl",
        "confidence",
        "dedupKey",
      ];
      const workPatchFields = [
        "roleHe",
        "plannedQuantity",
        "plannedUnitCost",
        "plannedTotalCost",
        "notes",
        "status",
        "assignee",
        "assigneeId",
        "workType",
        "workTypeLabelHe",
        "confidence",
        "dedupKey",
      ];
      return ops.map((op: any) => {
        if (!op || !op.kind || !op.payload) return op;
        if (op.kind === "materialLine.create") {
          const fields = op.payload.fields ?? op.payload;
          const match = findMaterialMatch(fields, op.payload);
          if (!match) return op;
          return {
            kind: "materialLine.patch",
            payload: {
              lineId: match._id,
              fields: pickFields(fields, materialPatchFields),
            },
          };
        }
        if (op.kind === "workLine.create") {
          const fields = op.payload.fields ?? op.payload;
          const match = findWorkMatch(fields, op.payload);
          if (!match) return op;
          return {
            kind: "workLine.patch",
            payload: {
              lineId: match._id,
              fields: pickFields(fields, workPatchFields),
            },
          };
        }
        return op;
      });
    };

    if (hasChangeSetBlock) {
      await ctx.db.patch(args.runId, {
        phase: "creating_changeset",
        phaseLabel: "Creating change set",
        phaseDetail: "Converting model output into executable ops",
        updatedAt: Date.now(),
      });
    }

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
        const normalizedOps = coercePricingFallbackOps(
          coerceDuplicateLineCreates(
            rawOps.map((op: any) => {
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
            })
          )
        );

        const lifecycleStatus = run?.inputParams?.draftOnly ? "draft" : "proposed";
        const dependsOnIssueKeys = Array.isArray(run?.inputParams?.dependsOnIssueKeys)
          ? run?.inputParams?.dependsOnIssueKeys
          : undefined;
        const assumptionsUsed = Array.isArray(run?.inputParams?.assumptionsUsed)
          ? run?.inputParams?.assumptionsUsed
          : undefined;

        const changeSetId = await ctx.db.insert("changeSets", {
          projectId: args.projectId,
          stage: "IDEATION",
          status: "PROPOSED",
          lifecycleStatus,
          dependsOnIssueKeys,
          assumptionsUsed,
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
      const questionsRun = await ctx.db.get(args.runId);
      if (questionsRun) {
        await ctx.db.insert("clarificationSessions", {
          projectId: args.projectId,
          conversationId: args.conversationId,
          targetSkillId: questionsRun.skillId,
          questions: questionsBlock.questions,
          isSatisfied: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    const contextRun = await ctx.db.get(args.runId);
    if (contextRun?.skillId === "CONTEXT_GENERATION") {
      const docBlock = blocks.find((b: any) => b.type === "ChatBlock" && typeof b.markdownHe === "string");
      if (docBlock?.markdownHe?.trim()) {
        await ctx.runMutation(api.memory.updateRunningMemory, {
          projectId: args.projectId,
          contentMd_he: docBlock.markdownHe,
        });
        await ctx.runMutation(api.memory.saveProjectContextDoc, {
          projectId: args.projectId,
          contentMd_he: docBlock.markdownHe,
        });
      }
    }

    await ctx.db.patch(args.runId, {
      status: "succeeded",
      phase: "finalizing",
      phaseLabel: "Finalizing run",
      phaseDetail: "Saving results to conversation",
      blocks: blocks,
      updatedAt: Date.now(),
      finishedAt: now,
    });

    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: "assistant",
      blocks: blocks,
      runId: args.runId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.runId, {
      phase: "done",
      phaseLabel: "Done",
      phaseDetail: "Response delivered",
      updatedAt: Date.now(),
    });

    return blocks;
  }
});

export const failRun = internalMutation({
  args: { runId: v.id("skillRuns"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      phase: "failed",
      phaseLabel: "Run failed",
      phaseDetail: "An error interrupted this run",
      rawModelResponse: args.error,
      updatedAt: Date.now(),
      finishedAt: Date.now(),
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

export const logToolCall = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    conversationId: v.optional(v.union(v.id("conversations"), v.id("agentConversations"), v.string())),
    skillRunId: v.optional(v.id("skillRuns")),
    skillId: v.optional(v.string()),
    toolName: v.string(),
    argsHash: v.string(),
    argsBytes: v.number(),
    resultBytes: v.optional(v.number()),
    latencyMs: v.number(),
    status: v.union(v.literal("success"), v.literal("error")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("skillToolLogs", {
      projectId: args.projectId,
      conversationId: args.conversationId,
      skillRunId: args.skillRunId,
      skillId: args.skillId,
      toolName: args.toolName,
      argsHash: args.argsHash,
      argsBytes: args.argsBytes,
      resultBytes: args.resultBytes,
      latencyMs: args.latencyMs,
      status: args.status,
      error: args.error,
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
    const maybeKickFlow = async (projectId: any) => {
      const blocked = await ctx.db
        .query("flowRuns")
        .withIndex("by_project_status", (q: any) => q.eq("projectId", projectId).eq("status", "blocked"))
        .first();
      const running = blocked
        ? null
        : await ctx.db
          .query("flowRuns")
          .withIndex("by_project_status", (q: any) => q.eq("projectId", projectId).eq("status", "running"))
          .first();
      const flowRun = blocked ?? running;
      if (flowRun && flowRun.toggles?.autoRun) {
        await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, { flowRunId: flowRun._id });
      }
    };

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

      await maybeKickFlow(fallback.projectId);
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

    await maybeKickFlow(session.projectId);
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

export const appendWebPriceOps = internalMutation({
  args: { runId: v.id("skillRuns"), ops: v.array(v.any()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { appended: 0 };
    const existing = Array.isArray((run as any).webPriceOps) ? (run as any).webPriceOps : [];
    const merged = [...existing, ...args.ops];
    await ctx.db.patch(args.runId, { webPriceOps: merged });
    return { appended: args.ops.length };
  }
});

export const saveWebSearchResults = internalMutation({
  args: {
    projectId: v.id("projects"),
    query: v.string(),
    templateId: v.optional(v.id("materialTemplates")),
    variantId: v.optional(v.id("materialVariants")),
    uomCode: v.optional(v.string()),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    const results = Array.isArray(args.result?.results) ? args.result.results : [];
    if (results.length === 0) return { inserted: 0 };

    const templates = await ctx.db.query("materialTemplates").take(200);
    const variants = await ctx.db.query("materialVariants").take(200);
    const findCatalogMatch = (text: string) => {
      const haystack = text.toLowerCase();
      let bestVariant: any = null;
      let bestVariantScore = 0;
      for (const variant of variants) {
        const label = String(variant.labelHe ?? "").toLowerCase();
        if (label && haystack.includes(label) && label.length > bestVariantScore) {
          bestVariant = variant;
          bestVariantScore = label.length;
        }
      }
      let bestTemplate: any = null;
      let bestTemplateScore = 0;
      for (const template of templates) {
        const name = String(template.nameHe ?? "").toLowerCase();
        if (name && haystack.includes(name) && name.length > bestTemplateScore) {
          bestTemplate = template;
          bestTemplateScore = name.length;
        }
        const keywords = Array.isArray(template.searchKeywords) ? template.searchKeywords : [];
        for (const keyword of keywords) {
          const term = String(keyword ?? "").toLowerCase();
          if (term && haystack.includes(term) && term.length > bestTemplateScore) {
            bestTemplate = template;
            bestTemplateScore = term.length;
          }
        }
      }
      return { variant: bestVariant, template: bestTemplate };
    };

    let inserted = 0;
    const ops: any[] = [];
    for (const item of results) {
      if (!item?.url) continue;
      const matchText = `${args.query ?? ""} ${item.title ?? ""} ${item.content ?? ""}`;
      const match = findCatalogMatch(matchText);
      const matchedVariantId = args.variantId ?? match.variant?._id;
      const matchedTemplateId = args.templateId ?? match.template?._id ?? match.variant?.templateId;
      let domain: string | undefined;
      try {
        domain = new URL(item.url).hostname.replace(/^www\./, "");
      } catch (error) {
        domain = undefined;
      }
      const fields = {
        variantId: matchedVariantId,
        templateId: matchedTemplateId,
        vendorId: undefined,
        sourceType: "web" as "web",
        checkedAt: Date.now(),
        currency: "NIS",
        pricingModel: "unknown" as "unknown",
        amount: undefined,
        url: item.url,
        title: item.title,
        domain,
        rawSnippet: item.content,
        extractedFields: { query: args.query, uomCode: args.uomCode },
        confidence: "low" as const,
        createdBy: "agent" as "agent" | "user",
        sourceRef: { projectId: args.projectId, query: args.query },
        createdAt: Date.now(),
      };
      await ctx.db.insert("catalogPriceRecords", fields);
      ops.push({ kind: "catalogPriceRecord.create", payload: { fields } });
      inserted += 1;
    }

    return { inserted, ops };
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

function normalizeQuestionKey(text?: string) {
  if (!text) return "";
  return String(text).trim().toLowerCase();
}

function sanitizeKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeKeys);
  }
  if (obj && typeof obj === "object") {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      // Allow only non-control ASCII characters (32-126)
      if (/^[\x20-\x7E]+$/.test(key)) {
        newObj[key] = sanitizeKeys(obj[key]);
      } else {
        console.warn(`[sanitizeKeys] Dropping invalid key: "${key}"`);
      }
    }
    return newObj;
  }
  return obj;
}
