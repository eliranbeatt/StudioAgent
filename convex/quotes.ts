import OpenAI from "openai";
import { action, mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const generateQuote = mutation({
  args: {
    projectId: v.id("projects"),
    elementVersionIds: v.array(v.id("elementVersions")),
    projectCostVersionId: v.optional(v.id("projectCostVersions")),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    let totalDirectCost = 0;
    const sections: any[] = [];

    // 1. Aggregate Elements
    for (const evId of args.elementVersionIds) {
      const version = await ctx.db.get(evId);
      if (version) {
        // Simple aggregation logic from snapshot
        const snapshot = version.snapshot;
        const mats = Object.values(snapshot.materials?.byId || {});
        const labs = Object.values(snapshot.labor?.byId || {});

        const elementDirectCost = 
            (mats.reduce((sum: number, m: any) => sum + (m.qty * m.unitCost), 0) as number) +
            (labs.reduce((sum: number, l: any) => sum + (l.qty * l.rate), 0) as number);

        totalDirectCost += elementDirectCost;
        
        sections.push({
          title: snapshot.title || "Untitled Element",
          directCost: elementDirectCost,
          versionId: evId,
        });
      }
    }

    // 2. Apply Project Margins
    const overhead = totalDirectCost * project.defaults.overheadPct;
    const risk = totalDirectCost * project.defaults.riskPct;
    const profit = totalDirectCost * project.defaults.profitPct;
    const grandTotal = totalDirectCost + overhead + risk + profit;

    // 3. Save Quote
    const quoteId = await ctx.db.insert("quoteVersions", {
      projectId: args.projectId,
      status: "generated",
      sourceElementVersionIds: args.elementVersionIds,
      sourceProjectCostVersionId: args.projectCostVersionId,
      language: "he",
      sections: { items: sections },
      totals: {
        directCost: totalDirectCost,
        overhead,
        risk,
        profit,
        grandTotal,
      },
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, api.projectsStage.recomputeStage, { projectId: args.projectId });

    return quoteId;
  },
});

export const createDraftFromUi = mutation({
  args: {
    projectId: v.id("projects"),
    inputs: v.object({
      projectDescription: v.optional(v.string()),
      specs: v.optional(v.string()),
      manualPriceNis: v.optional(v.number()),
      includeFlags: v.optional(
        v.object({
          includeElements: v.boolean(),
          elementsMode: v.union(v.literal("bySection"), v.literal("byElement")),
          includeTerms: v.boolean(),
          includeDates: v.boolean(),
          includeAgreements: v.boolean(),
          includeOptions: v.boolean(),
        })
      ),
      validUntil: v.optional(v.string()),
      logoFileId: v.optional(v.id("projectFiles")),
    }),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .first();

    const version = (latest?.version ?? 0) + 1;
    const now = Date.now();

    const quoteId = await ctx.db.insert("quoteVersions", {
      projectId: args.projectId,
      version,
      status: "draft",
      sourceElementVersionIds: [],
      inputs: args.inputs,
      createdAt: now,
      totals: {
        directCost: 0,
        overhead: 0,
        risk: 0,
        profit: 0,
        grandTotal: 0,
      },
    });

    await ctx.scheduler.runAfter(0, api.projectsStage.recomputeStage, { projectId: args.projectId });

    return quoteId;
  },
});

export const listApprovedElementVersions = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return elements
      .map((element) => ({
        elementId: element._id,
        title: element.title,
        versionId: element.currentApprovedVersionId ?? null,
      }))
      .filter((entry) => entry.versionId);
  },
});

export const getElementVersions = query({
  args: { versionIds: v.array(v.id("elementVersions")) },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.versionIds) {
      const version = await ctx.db.get(id);
      if (version) {
        results.push(version);
      }
    }
    return results;
  },
});

export const getQuote = query({
  args: { quoteId: v.id("quoteVersions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.quoteId);
  },
});

export const updateQuote = mutation({
  args: {
    quoteId: v.id("quoteVersions"),
      patch: v.object({
        status: v.optional(v.string()),
        sourceElementVersionIds: v.optional(v.array(v.id("elementVersions"))),
        sections: v.optional(v.any()),
        totals: v.optional(v.any()),
      inputs: v.optional(v.any()),
      priceSummary: v.optional(v.any()),
      sellBreakdown: v.optional(v.any()),
      margins: v.optional(v.any()),
      currency: v.optional(v.string()),
      quoteBlocks: v.optional(v.any()),
      quoteText_he: v.optional(v.string()),
      contentHash: v.optional(v.string()),
      pdfFileId: v.optional(v.id("projectFiles")),
      previousQuoteId: v.optional(v.id("quoteVersions")),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.quoteId, args.patch);
    return { ok: true };
  },
});

export const generateQuoteV2 = action({
  args: {
    projectId: v.id("projects"),
    quoteId: v.id("quoteVersions"),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.runQuery(api.quotes.getQuote, { quoteId: args.quoteId });
    if (!quote) throw new Error("Quote not found");

    const overview = await ctx.runQuery(api.projects.getOverview, { id: args.projectId });
    if (!overview?.project) throw new Error("Project not found");

    const defaults = overview.project.defaults ?? {
      overheadPct: 0,
      riskPct: 0,
      profitPct: 0,
    };
    const margins = {
      overheadPct: defaults.overheadPct ?? 0,
      riskPct: defaults.riskPct ?? 0,
      profitPct: defaults.profitPct ?? 0,
    };

    const approved = await ctx.runQuery(api.quotes.listApprovedElementVersions, {
      projectId: args.projectId,
    });

    const versionIds = approved.map((entry: any) => entry.versionId).filter(Boolean);
    const elementVersions = versionIds.length
      ? await ctx.runQuery(api.quotes.getElementVersions, { versionIds })
      : [];

    const accounting = await ctx.runQuery(api.financials.getAccountingView, {
      projectId: args.projectId,
    });

    const includeFlags = quote.inputs?.includeFlags ?? {
      includeElements: true,
      elementsMode: "byElement",
      includeTerms: true,
      includeDates: true,
      includeAgreements: true,
      includeOptions: false,
    };

    let totalDirectCost = 0;
    const sections: any[] = [];

    if (includeFlags.elementsMode === "bySection") {
      const sectionTotals = await ctx.runQuery(api.financials.getAccountingSectionTotals, {
        projectId: args.projectId,
      });
      if (sectionTotals?.sections?.length) {
        totalDirectCost = Number(sectionTotals.total ?? 0);
        for (const section of sectionTotals.sections) {
          sections.push({
            title: section.label,
            directCost: Number(section.total ?? 0),
            sectionKey: section.key,
          });
        }
      }
    }

    if (sections.length === 0 && accounting?.elements?.length) {
      for (const element of accounting.elements) {
        const directCost = Number(element?.totals?.total ?? 0);
        totalDirectCost += directCost;
        sections.push({
          title: element.title || "Untitled Element",
          directCost,
          elementId: element.elementId,
        });
      }
    }

    if (includeFlags.elementsMode !== "bySection" && accounting?.projectCosts?.totals?.total) {
      const projectCost = Number(accounting.projectCosts.totals.total ?? 0);
      if (projectCost > 0) {
        totalDirectCost += projectCost;
        sections.push({
          title: "Project Costs",
          directCost: projectCost,
          elementId: null,
        });
      }
    }

    if (sections.length === 0) {
      for (const version of elementVersions as any[]) {
        const snapshot = version?.snapshot ?? {};
        const mats = Object.values(snapshot.materials?.byId || {});
        const labs = Object.values(snapshot.labor?.byId || {});

        const elementDirectCost =
          (mats.reduce((sum: number, m: any) => sum + (m.qty * m.unitCost), 0) as number) +
          (labs.reduce((sum: number, l: any) => sum + (l.qty * l.rate), 0) as number);

        totalDirectCost += elementDirectCost;
        sections.push({
          title: snapshot.title || "Untitled Element",
          directCost: elementDirectCost,
          versionId: version._id,
        });
      }
    }

    const overhead = totalDirectCost * margins.overheadPct;
    const risk = totalDirectCost * margins.riskPct;
    let profit = totalDirectCost * margins.profitPct;
    const computedGrandTotal = totalDirectCost + overhead + risk + profit;
    const manualSubtotal =
      typeof quote.inputs?.manualPriceNis === "number" && quote.inputs.manualPriceNis > 0
        ? quote.inputs.manualPriceNis
        : null;
    const sellSubtotal = manualSubtotal ?? computedGrandTotal;
    if (manualSubtotal !== null) {
      profit = sellSubtotal - totalDirectCost - overhead - risk;
    }
    const ratio = totalDirectCost > 0 ? sellSubtotal / totalDirectCost : 0;

    const sellBreakdown = sections.map((section) => ({
      groupName_he: section.title,
      includedItems_he: [],
      sellSubtotalNIS: Math.round(section.directCost * ratio),
    }));
    if (sellBreakdown.length > 0) {
      const targetTotal = Math.round(sellSubtotal);
      const currentTotal = sellBreakdown.reduce(
        (sum, item) => sum + Number(item.sellSubtotalNIS ?? 0),
        0
      );
      const delta = targetTotal - currentTotal;
      if (delta !== 0) {
        const last = sellBreakdown[sellBreakdown.length - 1];
        last.sellSubtotalNIS = Math.max(0, Number(last.sellSubtotalNIS ?? 0) + delta);
      }
    }

    const currency = overview.project.currency || "NIS";
    const vatRate = 0.18;
    const vatAmount = sellSubtotal * vatRate;
    const totalWithVat = sellSubtotal + vatAmount;
    const vatNote_he = "VAT 18%";
    const priceLabel = "Subtotal before VAT";
    const totalWithVatLabel = "Total incl. VAT";
    const vatLabel = "VAT (18%)";
    const priceSummary = {
      subtotalBeforeVat: Math.round(sellSubtotal),
      vatAmount: Math.round(vatAmount),
      vatNote_he,
      total: Math.round(totalWithVat),
    };

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    const validUntil = quote.inputs?.validUntil?.trim();
    const validUntilText = validUntil
      ? `בתוקף עד ${validUntil}`
      : "בתוקף ל-30 יום ממועד ההצעה";

    const scopeItems =
      includeFlags.includeElements && sections.length
        ? sections.map((section) => section.title)
        : overview.elements?.map((element) => element.title) ?? [];

    const deliverablesItems =
      includeFlags.includeElements && scopeItems.length
        ? scopeItems.map((item) => `אספקת ${item}`)
        : [];

    const assumptionLines = [
      "ההצעה מבוססת על המידע והדרישות שסוכמו נכון למועד ההצעה.",
      "שינויים בהיקף העבודה, בחומרים או בלוחות הזמנים עשויים להשפיע על המחיר והלו\"ז.",
    ];
    if (quote.inputs?.specs?.trim()) {
      assumptionLines.unshift(`מפרט: ${quote.inputs.specs.trim()}`);
    }

    const templateBlocks = {
      title_he: `הצעת מחיר - ${overview.project.name}`,
      intro_he: quote.inputs?.projectDescription?.trim() || "להלן הצעת מחיר לפרויקט בהתאם לדרישות שסוכמו.",
      scope_he: scopeItems,
      deliverables_he: deliverablesItems,
      schedule_he: includeFlags.includeDates
        ? [
            overview.project.details?.eventDate
              ? `תאריך אירוע: ${new Date(overview.project.details.eventDate).toLocaleDateString("he-IL")}`
              : "תאריך האירוע והלו\"ז הסופי יתואמו לאחר אישור.",
          ]
        : [],
      priceSummary_he: [
        `${priceLabel}: ${formatCurrency(Math.round(sellSubtotal))}`,
        `${vatLabel}: ${formatCurrency(Math.round(vatAmount))}`,
        `${totalWithVatLabel}: ${formatCurrency(Math.round(totalWithVat))}`,
      ],
      options_he: includeFlags.includeOptions ? [] : [],
      agreements_he: includeFlags.includeAgreements
        ? ["ההצעה כוללת ייצור, הובלה והתקנה בהתאם להיקף שסוכם."]
        : [],
      assumptions_he: assumptionLines,
      exclusions_he: [
        "תוספות או שינויים שלא פורטו בהצעה יתומחרו בנפרד.",
        "היתרים, ביטוחים ועלויות צד ג' אינם כלולים אלא אם צוין אחרת.",
      ],
      terms_he: includeFlags.includeTerms
        ? [
            "תנאי תשלום: 50% בעת אישור, 50% עם סיום העבודה.",
            validUntilText,
          ]
        : [],
      validUntil_he: validUntilText,
      signatureBlock_he: "בברכה,\nצוות הסטודיו",
    };

    const llmBlocks = await generateQuoteBlocksWithLlm({
      projectName: overview.project.name,
      customerName: overview.project.customerName ?? overview.project.clientName ?? "",
      projectDescription: quote.inputs?.projectDescription?.trim() || overview.project.description || "",
      specs: quote.inputs?.specs?.trim() || "",
      scopeItems,
      deliverablesItems,
      scheduleItems: templateBlocks.schedule_he,
      priceSummary,
      sellBreakdown,
      includeFlags,
      validUntilText,
    });

    const quoteBlocks = mergeQuoteBlocks(llmBlocks, templateBlocks);
    quoteBlocks.priceSummary_he = templateBlocks.priceSummary_he;

    const quoteText_he = buildQuoteText(quoteBlocks, includeFlags);
    const contentHash = simpleHash(
      JSON.stringify({ quoteBlocks, priceSummary, sellBreakdown, includeFlags })
    );

    const previousQuote =
      quote.previousQuoteId ??
      (await ctx.runQuery(internal.quotes.findLatestQuote, {
        projectId: args.projectId,
        excludeQuoteId: args.quoteId,
      })) ??
      undefined;

    await ctx.runMutation(api.quotes.updateQuote, {
      quoteId: args.quoteId,
      patch: {
        status: "generated",
        sourceElementVersionIds: versionIds,
        sections: { items: sections },
        totals: {
          directCost: totalDirectCost,
          overhead,
          risk,
          profit,
          grandTotal: sellSubtotal,
        },
        priceSummary,
        sellBreakdown,
        margins,
        quoteBlocks,
        quoteText_he,
        contentHash,
        currency,
        previousQuoteId: previousQuote,
      },
    });

    return { quoteId: args.quoteId };
  },
});

export const listQuotes = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const getDiff = query({
  args: {
    prevId: v.id("quoteVersions"),
    nextId: v.id("quoteVersions"),
  },
  handler: async (ctx, args) => {
    const prev = await ctx.db.get(args.prevId);
    const next = await ctx.db.get(args.nextId);
    if (!prev || !next) throw new Error("Quote not found");

    const prevSummary = normalizeQuoteForDiff(prev);
    const nextSummary = normalizeQuoteForDiff(next);

    const numberDiffs = diffNumbers(prevSummary, nextSummary);
    const textDiffs = diffTextBlocks(prevSummary, nextSummary);

    return {
      numbers: numberDiffs,
      blocks: {
        added: textDiffs.added,
        removed: textDiffs.removed,
        changed: textDiffs.changed,
      },
    };
  },
});

function buildQuoteText(quoteBlocks: any, includeFlags: any) {
  const lines = [];
  if (quoteBlocks?.title_he) lines.push(quoteBlocks.title_he);
  if (quoteBlocks?.intro_he) lines.push(quoteBlocks.intro_he);
  if (includeFlags?.includeElements && quoteBlocks?.scope_he?.length) {
    lines.push("היקף העבודה:");
    for (const item of quoteBlocks.scope_he) {
      lines.push(`- ${item}`);
    }
  }
  if (quoteBlocks?.deliverables_he?.length) {
    lines.push("תוצרים:");
    for (const item of quoteBlocks.deliverables_he) {
      lines.push(`- ${item}`);
    }
  }
  if (includeFlags?.includeDates && quoteBlocks?.schedule_he?.length) {
    lines.push("לוח זמנים:");
    for (const item of quoteBlocks.schedule_he) {
      lines.push(`- ${item}`);
    }
  }
  if (quoteBlocks?.priceSummary_he?.length) {
    lines.push("סיכום מחיר:");
    for (const item of quoteBlocks.priceSummary_he) {
      lines.push(`- ${item}`);
    }
  }
  if (includeFlags?.includeAgreements && quoteBlocks?.agreements_he?.length) {
    lines.push("הסכמות:");
    for (const item of quoteBlocks.agreements_he) {
      lines.push(`- ${item}`);
    }
  }
  if (includeFlags?.includeOptions && quoteBlocks?.options_he?.length) {
    lines.push("אופציות:");
    for (const item of quoteBlocks.options_he) {
      lines.push(`- ${item?.name_he ?? item}`);
    }
  }
  if (quoteBlocks?.assumptions_he?.length) {
    lines.push("הנחות:");
    for (const item of quoteBlocks.assumptions_he) {
      lines.push(`- ${item}`);
    }
  }
  if (quoteBlocks?.exclusions_he?.length) {
    lines.push("אי הכללות:");
    for (const item of quoteBlocks.exclusions_he) {
      lines.push(`- ${item}`);
    }
  }
  if (includeFlags?.includeTerms && quoteBlocks?.terms_he?.length) {
    lines.push("תנאים:");
    for (const item of quoteBlocks.terms_he) {
      lines.push(`- ${item}`);
    }
  }
  if (quoteBlocks?.signatureBlock_he) {
    lines.push(quoteBlocks.signatureBlock_he);
  }
  return lines.join("\n");
}

function simpleHash(value: string) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function normalizeQuoteForDiff(quote: any) {
  const blocks = quote.quoteBlocks ?? {};
  const includeFlags = quote.inputs?.includeFlags ?? {};
  const summaryLines = Array.isArray(blocks.priceSummary_he) ? blocks.priceSummary_he : [];
  const totals = quote.priceSummary ?? quote.totals ?? {};
  const sellBreakdown = Array.isArray(quote.sellBreakdown) ? quote.sellBreakdown : [];

  return {
    includeFlags,
    totals: {
      subtotalBeforeVat: totals.subtotalBeforeVat ?? totals.grandTotal ?? 0,
      total: totals.total ?? totals.grandTotal ?? 0,
    },
    sellBreakdown: sellBreakdown.map((item: any) => ({
      name: item.groupName_he ?? "",
      total: Number(item.sellSubtotalNIS ?? 0),
    })),
    textBlocks: {
      title: String(blocks.title_he ?? ""),
      intro: String(blocks.intro_he ?? ""),
      scope: toList(blocks.scope_he),
      deliverables: toList(blocks.deliverables_he),
      schedule: includeFlags.includeDates === false ? [] : toList(blocks.schedule_he),
      priceSummary: summaryLines.map((line: string) => String(line)),
      agreements: includeFlags.includeAgreements === false ? [] : toList(blocks.agreements_he),
      options: includeFlags.includeOptions === false ? [] : toList(blocks.options_he),
      assumptions: toList(blocks.assumptions_he),
      exclusions: toList(blocks.exclusions_he),
      terms: includeFlags.includeTerms === false ? [] : toList(blocks.terms_he),
      validUntil: String(blocks.validUntil_he ?? ""),
    },
  };
}

function toList(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : item?.name_he ?? String(item)));
  }
  return [String(value)];
}

function diffNumbers(prev: any, next: any) {
  const breakdownDiffs = [];
  const nextMap = new Map(next.sellBreakdown.map((item: any) => [item.name, item.total]));
  const prevMap = new Map(prev.sellBreakdown.map((item: any) => [item.name, item.total]));

  const names = new Set([...nextMap.keys(), ...prevMap.keys()]);
  for (const name of names) {
    const before = Number(prevMap.get(name) ?? 0);
    const after = Number(nextMap.get(name) ?? 0);
    if (before !== after) {
      breakdownDiffs.push({ name, before, after, delta: after - before });
    }
  }

  const subtotalBeforeVat = {
    before: Number(prev.totals.subtotalBeforeVat),
    after: Number(next.totals.subtotalBeforeVat),
    delta: Number(next.totals.subtotalBeforeVat) - Number(prev.totals.subtotalBeforeVat),
  };
  const total = {
    before: Number(prev.totals.total),
    after: Number(next.totals.total),
    delta: Number(next.totals.total) - Number(prev.totals.total),
  };

  return {
    subtotalBeforeVat,
    total,
    breakdown: breakdownDiffs,
  };
}

function diffTextBlocks(prev: any, next: any) {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ block: string; before: string; after: string }> = [];

  const keys = Object.keys(next.textBlocks);
  for (const key of keys) {
    const before = normalizeText(prev.textBlocks[key]);
    const after = normalizeText(next.textBlocks[key]);
    if (!before && after) added.push(key);
    else if (before && !after) removed.push(key);
    else if (before !== after) {
      changed.push({ block: key, before, after });
    }
  }

  return { added, removed, changed };
}

function normalizeText(value: any) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join("\n");
  }
  return String(value).trim();
}

async function generateQuoteBlocksWithLlm(payload: {
  projectName: string;
  customerName: string;
  projectDescription: string;
  specs: string;
  scopeItems: string[];
  deliverablesItems: string[];
  scheduleItems: string[];
  priceSummary: { subtotalBeforeVat: number; vatNote_he: string; total: number };
  sellBreakdown: Array<{ groupName_he: string; includedItems_he: string[]; sellSubtotalNIS: number }>;
  includeFlags: {
    includeElements: boolean;
    elementsMode: "bySection" | "byElement";
    includeTerms: boolean;
    includeDates: boolean;
    includeAgreements: boolean;
    includeOptions: boolean;
  };
  validUntilText: string;
}) {
  if (!process.env.OPENAI_API_KEY) return null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = "gpt-4o-mini";

  const system = [
    "You are drafting a Hebrew client quote for a design/production studio.",
    "Return JSON only. Do not wrap in markdown or code fences.",
    "Do not mention internal costs, vendor names, or internal processes.",
    "Use the includeFlags to decide which sections to include; if a section is excluded, return an empty array or empty string for that field.",
  ].join(" ");

  const schema = {
    title_he: "string",
    intro_he: "string",
    scope_he: ["string"],
    deliverables_he: ["string"],
    schedule_he: ["string"],
    priceSummary_he: ["string"],
    options_he: ["string or { name_he, deltaNIS, note_he }"],
    agreements_he: ["string"],
    assumptions_he: ["string"],
    exclusions_he: ["string"],
    terms_he: ["string"],
    validUntil_he: "string",
    signatureBlock_he: "string",
  };

  const user = [
    `Project name: ${payload.projectName}`,
    payload.customerName ? `Customer name: ${payload.customerName}` : "Customer name: (not provided)",
    payload.projectDescription ? `Project description: ${payload.projectDescription}` : "Project description: (not provided)",
    payload.specs ? `Specs: ${payload.specs}` : "Specs: (not provided)",
    `Include flags: ${JSON.stringify(payload.includeFlags)}`,
    `Scope items: ${JSON.stringify(payload.scopeItems)}`,
    `Deliverables items: ${JSON.stringify(payload.deliverablesItems)}`,
    `Schedule items: ${JSON.stringify(payload.scheduleItems)}`,
    `Price summary: ${JSON.stringify(payload.priceSummary)}`,
    `Sell breakdown (sell prices only): ${JSON.stringify(payload.sellBreakdown)}`,
    `Valid until text: ${payload.validUntilText}`,
    `Return JSON with this schema: ${JSON.stringify(schema)}`,
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const jsonText = extractJsonBlock(content);
    return JSON.parse(jsonText);
  } catch (err) {
    console.error("LLM quote generation failed:", err);
    return null;
  }
}

function extractJsonBlock(text: string) {
  const fenced = text.match(/```json\\s*([\\s\\S]*?)```/i) || text.match(/```\\s*([\\s\\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}

function mergeQuoteBlocks(candidate: any, fallback: any) {
  if (!candidate || typeof candidate !== "object") return fallback;

  const result = { ...fallback };
  const listKeys = [
    "scope_he",
    "deliverables_he",
    "schedule_he",
    "priceSummary_he",
    "options_he",
    "agreements_he",
    "assumptions_he",
    "exclusions_he",
    "terms_he",
  ];

  for (const key of Object.keys(fallback)) {
    const value = candidate[key];
    if (value === undefined || value === null) continue;

    if (listKeys.includes(key)) {
      if (Array.isArray(value)) {
        result[key] = value;
      }
      continue;
    }

    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

export const findLatestQuote = internalQuery({
  args: {
    projectId: v.id("projects"),
    excludeQuoteId: v.optional(v.id("quoteVersions")),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc");
    
    if (args.excludeQuoteId) {
      query = query.filter((q) => q.neq(q.field("_id"), args.excludeQuoteId));
    }

    const latest = await query.first();
    return latest?._id;
  },
});

