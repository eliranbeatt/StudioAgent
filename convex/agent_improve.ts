import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import OpenAI from "openai";

// Schema for the Improver output
// Must match what we promise in the system prompt
const IMPROVER_JSON_SCHEMA = {
    type: "object",
    properties: {
        meta: {
            type: "object",
            properties: {
                scope: { type: "string" },
                tabContext: { type: "string" },
                includesWebResearch: { type: "boolean" },
                selectedModules: { type: "array", items: { type: "string" } }
            }
        },
        report_he: {
            type: "object",
            properties: {
                whatIWouldChange: { type: "array", items: { type: "string" } },
                gaps: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "string" } },
                outOfScopeNotes: { type: "array", items: { type: "string" } },
                openQuestions: { type: "array", items: { type: "string" } },
                assumptions: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            text_he: { type: "string" },
                            confidence: { type: "string", enum: ["high", "medium", "low"] }
                        }
                    }
                },
                improvedPlanSummary: { type: "array", items: { type: "string" } }
            }
        },
        gaps: {
            type: "object",
            properties: {
                counts: {
                    type: "object",
                    properties: {
                        tasksMissing: { type: "number" },
                        accountingLinesMissing: { type: "number" },
                        elementsMissingFields: { type: "number" },
                        qaTasksMissing: { type: "number" }
                    }
                },
                bullets_he: { type: "array", items: { type: "string" } }
            }
        },
        links: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    domain: { type: "string" },
                    url: { type: "string" },
                    publishedAt: { type: "string" },
                    usedFor_he: { type: "string" }
                }
            }
        },
        generatedImages: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    elementId: { type: "string" },
                    kind: { type: "string", enum: ["technical", "client"] },
                    imageRef: { type: "string" },
                    imagePrompt_he: { type: "string" },
                    caption_he: { type: "string" }
                }
            }
        },
        changeGroups: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    title_he: { type: "string" },
                    scope: { type: "string" },
                    rationale_he: { type: "string" },
                    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
                    requiresUserApproval: { type: "boolean" },
                    operations: { type: "array", items: { type: "object" } }
                }
            }
        }
    },
    required: ["report_he", "changeGroups"]
};

// System Prompt
const SYSTEM_PROMPT = `
SYSTEM:
You are the “AI Thinking Improver” for Emlly Studio (אם-לי), running inside a studio operations console.

Language rules:
- All human-facing text must be in Hebrew.
- All JSON keys/structure must be in English ASCII only.

Mission:
Given the current project state and a run configuration (selected modules + scope), produce:
1) A clear Hebrew report: critique, gaps, risks, and what you recommend changing.
2) A ChangeSet with grouped operations (changeGroups) that the user can apply one group at a time.
You MUST NOT directly mutate canonical data.

Operations format:
- Each changeGroups.operations entry MUST be a legacy op object: { "kind": string, "payload": object }.
- Do NOT output ProposedOp format here.

Studio reality (non-negotiable):
- Work is organized by Elements (אלמנטים). Every task and cost line should link to exactly one Element (or Project only if truly global).
- Typical lifecycle: שאלות → תמחור → משימות → איסופים → פירוק עבודה → הקמה/יום צילום/אירוע → פירוק/החזרות → עלויות סופיות.
- Tasks must be written like real studio tasks: outcome definition, inputs/files, tools/process, dependencies, time+crew estimate, and risks/notes.
- Task granularity: usually 30–180 minutes per person per task. Split when switching location (vendor/studio/site), skill type, or a blocking dependency.
- Always add explicit QA tasks for anything visible on camera or client-facing.
- Procurement notes must include approvals when needed (e.g. “בינתיים לא לרכוש”), and “צילום לאישור” when relevant.
- Accounting lines must include qty, unit, unit price (or estimate), vendor, lead time, and justification.
- Separate studio labor vs install labor, and include friction hours (setup/cleanup/loading/unloading/waiting for glue/cure).

Safety triggers (must be flagged, never assumed safe):
- load-bearing, overhead hanging, electricity, ladders, public interaction, child-facing interaction.
If safety-triggered: create a safety/QA group with explicit tasks and require human approval.

No-guessing rule:
If critical info is missing (dimensions, deadlines, venue constraints, access hours, power points, hanging points), do NOT invent.
Instead:
- Add “openQuestions_he” and/or “assumptions_he” with confidence (high/med/low).
- Create a “Questions” changeGroup only if it creates structured questions records (otherwise put in report).

Scope discipline:
- Default is tab-scoped. Do not propose operations outside the allowed scopes unless runConfig.selectedModules explicitly include them.
- If you detect an out-of-scope problem, mention it in the report under “מחוץ להיקף” without creating ops.

Web research tool:
If allowWeb=true, use targeted searches only for facts that materially improve the plan (materials specs, typical drying times, installation methods, lead-time norms).
Capture sources in the output (title, domain, url, publishedAt if known, and “usedFor_he”).

Images:
If createImages=true, include generatedImages entries with imagePrompt_he, caption_he, kind, and elementId if known.


Deletions:
Never hard delete. Use softDelete recommendations unless the user explicitly allowed hard deletes (you will not assume that).

Output requirements:
Return STRICT JSON only, matching the provided schema.
If you recommend ANY changes in the report, you MUST include them as populated "changeGroups".
Do not return empty changeGroups if you have recommendations.
No extra commentary outside JSON.
`;

const FINALIZE_PROMPT = `
SYSTEM:
You are the “Finalize Plan” agent for Emlly Studio (אם-לי).
This is a deep hardening run: multi-pass critique + research + risk + rewrite.
Same rules as Improver:
- Hebrew outputs, English JSON keys.
- No guessing critical facts.
- No direct mutations: produce grouped ChangeSet only.
- Approved Elements are source of truth. Scope changes must be optional groups with explicit approval.

You MUST follow these passes:
PASS 1 (Diagnose): summarize current plan state and find gaps across the full lifecycle.
PASS 2 (Critique): list blockers/high/medium/low issues and why they matter.
PASS 3 (Research agenda): create targeted web questions, then search only what materially improves the plan.
PASS 4 (Risks): produce a practical risk register with mitigations and early warning signs.
PASS 5 (Rewrite): propose an improved production-grade plan (Hebrew) with phases, milestones, QA gates, and critical path.
PASS 6 (Package): output changeGroups that implement the improvements safely and incrementally.

Operations format:
- Each changeGroups.operations entry MUST be a legacy op object: { "kind": string, "payload": object }.
- Do NOT output ProposedOp format here.

Output STRICT JSON using the same schema as the Improver, plus:
- report_he.improvedPlanSummary (bullets)
`;

function toDomain(url: string) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\\./, "");
    } catch {
        return "";
    }
}

function buildWebQueries(args: { project?: any; elements?: any[]; scope: string }) {
    const queries: string[] = [];
    const projectName = args.project?.project?.name ?? args.project?.name ?? "project";
    const elements = args.elements ?? [];
    const topElement = elements[0]?.title;

    if (topElement) {
        queries.push(`${topElement} material specification`);
        queries.push(`${topElement} installation method`);
    }

    if (args.scope === "accounting") {
        queries.push(`${projectName} production cost estimate materials labor`);
    } else if (args.scope === "quote") {
        queries.push(`${projectName} event production quote terms`);
    } else if (args.scope === "tasks") {
        queries.push(`${projectName} production workflow QA checklist`);
    }

    return Array.from(new Set(queries)).slice(0, 3);
}

async function runOpenAISearch(client: OpenAI, query: string) {
    const response = await client.responses.create({
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search" }],
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: [
                            "Search the web for sources relevant to the query.",
                            "Return STRICT JSON only with this schema:",
                            "{ \"results\": [{ \"title\": string, \"url\": string, \"publishedAt\": string|null }] }",
                            "Query:",
                            query
                        ].join("\n")
                    }
                ]
            }
        ]
    });

    const text = (response as any).output_text ?? "";
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed?.results) ? parsed.results : [];
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return [];
        try {
            const parsed = JSON.parse(match[0]);
            return Array.isArray(parsed?.results) ? parsed.results : [];
        } catch {
            return [];
        }
    }
}

async function storeImageAsProjectFile(ctx: any, projectId: Id<"projects">, imageRef: string, fileName: string) {
    let buffer: Buffer;
    let contentType = "image/png";

    if (imageRef.startsWith("data:")) {
        const match = imageRef.match(/^data:(.+);base64,(.+)$/);
        if (!match) {
            throw new Error("Invalid data URL");
        }
        contentType = match[1] ?? contentType;
        buffer = Buffer.from(match[2], "base64");
    } else {
        const res = await fetch(imageRef);
        if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        contentType = res.headers.get("content-type") ?? contentType;
    }

    const storageId = await ctx.storage.store(new Blob([new Uint8Array(buffer)], { type: contentType }));
    const fileId = await ctx.runMutation(internal.files.saveFileRecord, {
        projectId,
        storageId,
        fileName,
        contentType,
        size: buffer.length,
    });
    const url = await ctx.storage.getUrl(storageId);
    return { fileId, url };
}

export const runImproveAgent = action({
    args: {
        projectId: v.id("projects"),
        scope: v.string(), // "tasks" | "accounting" | "elements" | "quote" | "project" | "multi"
        runConfig: v.object({
            modelPreset: v.string(),
            allowWeb: v.boolean(),
            createImages: v.boolean(),
            selectedModules: v.array(v.string()),
            tabContext: v.optional(v.string()),
            applyMode: v.optional(v.string())
        })
    },
    handler: async (ctx, args) => {
        // 1. Collect Context
        const project = await ctx.runQuery(api.projects.getOverview, { id: args.projectId });
        const baseSnapshot = await ctx.runQuery(api.changeSets.getBaseSnapshotForProject, { projectId: args.projectId });
        // TODO: Fetch scoped data based on args.scope and args.tabContext
        // For now, we fetch a broad context (can be optimized later)
        const tasksRes = await ctx.runQuery(api.tasks.listForProject, { projectId: args.projectId });
        const elementsRes = await ctx.runQuery(api.elements.listByProject, { projectId: args.projectId });
        const accounting = await ctx.runQuery(api.financials.getAccountingView, { projectId: args.projectId });

        // Flatten accounting for context
        const accountingRows: any[] = [];
        if (accounting?.elements) {
            for (const el of accounting.elements) {
                if (el.materials) {
                    for (const m of el.materials) accountingRows.push({ ...m, elementTitle: el.title, type: "material" });
                }
                if (el.labor) {
                    for (const l of el.labor) accountingRows.push({ ...l, elementTitle: el.title, type: "labor" });
                }
            }
        }
        if (accounting?.projectCosts) {
            if (accounting.projectCosts.materials) {
                for (const m of accounting.projectCosts.materials) accountingRows.push({ ...m, elementTitle: "Project Costs", type: "material" });
            }
            if (accounting.projectCosts.labor) {
                for (const l of accounting.projectCosts.labor) accountingRows.push({ ...l, elementTitle: "Project Costs", type: "labor" });
            }
        }

        const contextPayload = {
            project,
            tasks: tasksRes?.tasks?.slice(0, 50) ?? [],
            elements: elementsRes?.elements?.slice(0, 20) ?? [],
            accounting: accountingRows.slice(0, 50),
            runConfig: args.runConfig
        };

        // 2. Prepare OpenAI Call
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        let model = args.runConfig.modelPreset;
        if (model === "gpt-5-nano") model = "gpt-5-mini";
        if (model === "gpt-5-mini-thinking") model = "gpt-5-mini";
        if (model === "gpt-5.2-thinking-high") model = "gpt-5.2";

        const systemMsg =
            args.runConfig.modelPreset === "gpt-5.2-thinking-high"
                ? FINALIZE_PROMPT
                : SYSTEM_PROMPT;
        const userMsg = `
    Build a ChangeSet and report based on this run configuration and project state.
    
    runConfig: ${JSON.stringify(args.runConfig, null, 2)}
    
    projectContext: ${JSON.stringify(contextPayload, null, 2)}
    
    Return STRICT JSON matching the schema.
    `;

        // 3. Call Agent
        // We utilize function calling or just JSON mode? The spec says JSON schema.
        // Let's use JSON mode with strict schema if possible, or just strict prompt.
        // For "Thinking" models, we might just prompt.

        try {
            const completion = await client.chat.completions.create({
                model,
                messages: [
                    { role: "system", content: systemMsg },
                    { role: "user", content: userMsg }
                ],
                response_format: { type: "json_object" },
                reasoning_effort: "medium"
            });

            const raw = completion.choices[0].message.content;
            console.log("--------------- AI RAW OUTPUT ---------------");
            console.log(raw);
            console.log("---------------------------------------------");

            if (!raw) throw new Error("Empty response from AI");

            const parsed = JSON.parse(raw);

            const normalizedReport = typeof parsed.report_he === "string"
                ? {
                    whatIWouldChange: [parsed.report_he],
                    gaps: [],
                    risks: [],
                    outOfScopeNotes: [],
                    openQuestions: [],
                    assumptions: [],
                }
                : (parsed.report_he ?? {
                    whatIWouldChange: [],
                    gaps: [],
                    risks: [],
                    outOfScopeNotes: [],
                    openQuestions: [],
                    assumptions: [],
                });

            if (Array.isArray(parsed.openQuestions_he)) {
                const questions = parsed.openQuestions_he
                    .map((q: any) => q?.question_he ?? q?.text_he ?? q)
                    .filter((q: any) => typeof q === "string");
                normalizedReport.openQuestions = [
                    ...(normalizedReport.openQuestions ?? []),
                    ...questions,
                ];
            }

            let changeGroups = Array.isArray(parsed.changeGroups) ? parsed.changeGroups : [];
            if (changeGroups.length === 0 && normalizedReport.whatIWouldChange?.length) {
                changeGroups = [{
                    id: `questions-${Date.now()}`,
                    title_he: "שאלות פתוחות",
                    scope: args.scope,
                    rationale_he: "נדרשות תשובות לפני ביצוע שינויים.",
                    riskLevel: "medium",
                    requiresUserApproval: true,
                    operations: [],
                }];
            }

            let links = Array.isArray(parsed.links) ? parsed.links : [];
            if (args.runConfig.allowWeb && links.length === 0) {
                try {
                    const queries = buildWebQueries({
                        project,
                        elements: elementsRes?.elements ?? [],
                        scope: args.scope
                    });
                    const results: any[] = [];
                    for (const query of queries) {
                        const data = await runOpenAISearch(client, query);
                        if (Array.isArray(data)) {
                            console.log(`[Search Query] "${query}" => ${data.length} results`);
                            results.push(...data);
                        }
                    }
                    links = results.slice(0, 5).map((item: any) => ({
                        title: item.title ?? item.url ?? "Source",
                        domain: toDomain(item.url ?? ""),
                        url: item.url ?? "",
                        publishedAt: item.publishedAt ?? null,
                        usedFor_he: "מקור רקע לתמיכה בהחלטות"
                    })).filter((item: any) => item.url);
                } catch (e) {
                    console.warn("Web search failed", e);
                }
            }

            let generatedImages = Array.isArray(parsed.generatedImages) ? parsed.generatedImages : [];
            if (args.runConfig.createImages) {
                const imageModel = "gpt-image-1.5";
                const candidates = generatedImages.filter((img: any) => img.imagePrompt_he && !img.imageRef);
                const fallback = candidates.length === 0
                    ? (elementsRes?.elements ?? []).slice(0, 2).map((el: any) => ({
                        elementId: el._id,
                        kind: "technical",
                        imagePrompt_he: `שרטוט טכני נקי של ${el.title}. פרספקטיבה ברורה, קווי מתאר, מידות משוערות.`,
                        caption_he: `שרטוט טכני עבור ${el.title}`
                    }))
                    : candidates;

                const generated: any[] = [];
                for (const img of fallback) {
                    if (!img.imagePrompt_he) continue;
                    try {
                        const result = await client.images.generate({
                            model: imageModel,
                            prompt: img.imagePrompt_he,
                            size: "1024x1024"
                        });
                        const data = result?.data?.[0];
                        let imageRef = data?.url;
                        if (!imageRef && data?.b64_json) {
                            imageRef = `data:image/png;base64,${data.b64_json}`;
                        }
                        if (imageRef) {
                            console.log(`[Image Generated] for ${img.elementId}: ${imageRef.slice(0, 50)}...`);
                            const fileName = `ai-improve-${args.projectId}-${Date.now()}.png`;
                            const stored = await storeImageAsProjectFile(
                                ctx,
                                args.projectId,
                                imageRef,
                                fileName
                            );
                            if (stored.url) {
                                generated.push({
                                    elementId: img.elementId ?? null,
                                    kind: img.kind ?? "technical",
                                    imageRef: stored.url,
                                    caption_he: img.caption_he ?? "הדמיה"
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("Image generation failed", e);
                    }
                }

                if (generated.length > 0) {
                    generatedImages = generated;
                }
            }

            console.log("FINAL PARSED STRUCTURE:", JSON.stringify({
                changeGroupsCount: parsed.changeGroups?.length,
                linksCount: links.length,
                imagesCount: generatedImages.length
            }, null, 2));

            // 4. Save Result
            const changeSetId = await ctx.runMutation(internal.changeSets.createChangeSet, {
                projectId: args.projectId,
                stage: project?.stage ?? "BREAKDOWN",

                // V2 Fields
                scope: args.scope as any,
                baseSnapshot,
                runConfig: args.runConfig,

                report_he: normalizedReport,
                gaps: parsed.gaps,
                links,
                generatedImages,
                changeGroups,

                // Legacy fields population for compatibility if needed
                ops: [], // We use changeGroups now
                reason_he: "AI Improve Run",

                createdBy: { type: "agent", agentName: "Improver" }
            });

            return { changeSetId, status: "success" };

        } catch (e: any) {
            console.error("Improver Run Failed:", e);
            throw new Error(`Improver failed: ${e.message}`);
        }
    }
});
