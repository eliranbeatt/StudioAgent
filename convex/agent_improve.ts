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
                }
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

Deletions:
Never hard delete. Use softDelete recommendations unless the user explicitly allowed hard deletes (you will not assume that).

Output requirements:
Return STRICT JSON only, matching the provided schema.
If you recommend ANY changes in the report, you MUST include them as populated "changeGroups".
Do not return empty changeGroups if you have recommendations.
No extra commentary outside JSON.
`;

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

        const systemMsg = SYSTEM_PROMPT;
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
            if (!raw) throw new Error("Empty response from AI");

            const parsed = JSON.parse(raw);

            // 4. Save Result
            const changeSetId = await ctx.runMutation(internal.changeSets.createChangeSet, {
                projectId: args.projectId,
                stage: project?.stage ?? "BREAKDOWN",

                // V2 Fields
                scope: args.scope as any,
                runConfig: args.runConfig,

                report_he: parsed.report_he,
                gaps: parsed.gaps,
                links: parsed.links,
                generatedImages: parsed.generatedImages,
                changeGroups: parsed.changeGroups,

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
