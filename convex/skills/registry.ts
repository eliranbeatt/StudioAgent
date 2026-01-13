import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { SKILL_SYSTEM_ADDONS } from "./prompts";

export interface SkillDefinition {
  skillId: string;
  labelHe: string;
  descriptionHe: string;
  category: "consult" | "build" | "review" | "research" | "audit" | "clarify" | "ops";
  config: {
    requiresClarifications: boolean;
    clarificationsTargetSkillId?: string;
    allowedTools: {
      webSearch: boolean;
      ragSearch: boolean;
      fileInspect: boolean;
      runSkill?: boolean;
    };
    outputContract: "blocks" | "changeset" | "suggestions";
  };
  prompts: {
    systemHeaderRef: string;
    promptAddon: string;
  };
  model: string;
}

const SYSTEM_HEADER_REF = "studioops_v7_1";

export const SKILL_CATALOG: SkillDefinition[] = [
  {
    skillId: "CONSULTANT_CHAT",
    labelHe: "CONSULTANT_CHAT",
    descriptionHe: "CONSULTANT_CHAT",
    category: "consult",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, runSkill: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: `You are the Orchestrator.
      
      Capabilities:
      1. Answer questions directly using your knowledge.
      2. If you are CONFIDENT that a specific skill is needed to solve the user's request (e.g. "create tasks", "search for prices"), use the 'run_skill' tool immediately.
      3. If you are UNSURE or there are multiple options, use a 'SuggestionsBlock' to offer skills to the user.
      
      Available Skills to run or suggest:
      - TASKS_BUILDER_FULL: For creating task trees.
      - ELEMENTS_BUILDER_FULL: For creating elements.
      - ACCOUNTING_BUILDER_FULL: For creating BOM/Budget.
      - SHOPPING_PLANNER_WEB: For finding products/prices.
      - GAP_AUDIT: For checking missing items.
      `,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "CLARIFICATIONS_GATE",
    labelHe: "CLARIFICATIONS_GATE",
    descriptionHe: "CLARIFICATIONS_GATE",
    category: "clarify",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.CLARIFICATIONS_GATE,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "CHANGESET_REVIEWER",
    labelHe: "CHANGESET_REVIEWER",
    descriptionHe: "CHANGESET_REVIEWER",
    category: "review",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.CHANGESET_REVIEWER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "PROJECT_BRIEF_BUILDER",
    labelHe: "PROJECT_BRIEF_BUILDER",
    descriptionHe: "PROJECT_BRIEF_BUILDER",
    category: "build",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.PROJECT_BRIEF_BUILDER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "ELEMENTS_BUILDER_FULL",
    labelHe: "ELEMENTS_BUILDER_FULL",
    descriptionHe: "ELEMENTS_BUILDER_FULL",
    category: "build",
    config: {
      requiresClarifications: true,
      clarificationsTargetSkillId: "ELEMENTS_BUILDER_FULL",
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.ELEMENTS_BUILDER_FULL,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "TASKS_BUILDER_FULL",
    labelHe: "TASKS_BUILDER_FULL",
    descriptionHe: "TASKS_BUILDER_FULL",
    category: "build",
    config: {
      requiresClarifications: true,
      clarificationsTargetSkillId: "TASKS_BUILDER_FULL",
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.TASKS_BUILDER_FULL,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "ACCOUNTING_BUILDER_FULL",
    labelHe: "ACCOUNTING_BUILDER_FULL",
    descriptionHe: "ACCOUNTING_BUILDER_FULL",
    category: "build",
    config: {
      requiresClarifications: true,
      clarificationsTargetSkillId: "ACCOUNTING_BUILDER_FULL",
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.ACCOUNTING_BUILDER_FULL,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "QUOTE_WRITER_FULL",
    labelHe: "QUOTE_WRITER_FULL",
    descriptionHe: "QUOTE_WRITER_FULL",
    category: "build",
    config: {
      requiresClarifications: true,
      clarificationsTargetSkillId: "QUOTE_WRITER_FULL",
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.QUOTE_WRITER_FULL,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "ELEMENTS_TO_TASKS_SYNC",
    labelHe: "ELEMENTS_TO_TASKS_SYNC",
    descriptionHe: "ELEMENTS_TO_TASKS_SYNC",
    category: "build",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.ELEMENTS_TO_TASKS_SYNC,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "TASKS_CRITICAL_PATH_POLISH",
    labelHe: "TASKS_CRITICAL_PATH_POLISH",
    descriptionHe: "TASKS_CRITICAL_PATH_POLISH",
    category: "review",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.TASKS_CRITICAL_PATH_POLISH,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "TASK_ACCOUNTING_MAPPING_REPAIR",
    labelHe: "TASK_ACCOUNTING_MAPPING_REPAIR",
    descriptionHe: "TASK_ACCOUNTING_MAPPING_REPAIR",
    category: "review",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.TASK_ACCOUNTING_MAPPING_REPAIR,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "GAP_AUDIT",
    labelHe: "GAP_AUDIT",
    descriptionHe: "GAP_AUDIT",
    category: "audit",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "suggestions",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.GAP_AUDIT,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "RISK_REVIEW",
    labelHe: "RISK_REVIEW",
    descriptionHe: "RISK_REVIEW",
    category: "review",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "suggestions",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.RISK_REVIEW,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "COST_VARIANCE_ANALYZER",
    labelHe: "COST_VARIANCE_ANALYZER",
    descriptionHe: "COST_VARIANCE_ANALYZER",
    category: "audit",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "suggestions",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.COST_VARIANCE_ANALYZER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "DAILY_EXECUTION_PLANNER",
    labelHe: "DAILY_EXECUTION_PLANNER",
    descriptionHe: "DAILY_EXECUTION_PLANNER",
    category: "ops",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.DAILY_EXECUTION_PLANNER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "INSTALL_RUNBOOK_BUILDER",
    labelHe: "INSTALL_RUNBOOK_BUILDER",
    descriptionHe: "INSTALL_RUNBOOK_BUILDER",
    category: "build",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.INSTALL_RUNBOOK_BUILDER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "SHOPPING_PLANNER_WEB",
    labelHe: "SHOPPING_PLANNER_WEB",
    descriptionHe: "SHOPPING_PLANNER_WEB",
    category: "research",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: true, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.SHOPPING_PLANNER_WEB,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "BUYING_ASSISTANT_WEB",
    labelHe: "BUYING_ASSISTANT_WEB",
    descriptionHe: "BUYING_ASSISTANT_WEB",
    category: "research",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: true, ragSearch: false, fileInspect: false },
      outputContract: "suggestions",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.BUYING_ASSISTANT_WEB,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "RESEARCH_INSPIRATION_WEB",
    labelHe: "RESEARCH_INSPIRATION_WEB",
    descriptionHe: "RESEARCH_INSPIRATION_WEB",
    category: "research",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: true, ragSearch: false, fileInspect: false },
      outputContract: "suggestions",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.RESEARCH_INSPIRATION_WEB,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "RESEARCH_PRICING_ESTIMATES_WEB",
    labelHe: "RESEARCH_PRICING_ESTIMATES_WEB",
    descriptionHe: "RESEARCH_PRICING_ESTIMATES_WEB",
    category: "research",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: true, ragSearch: false, fileInspect: false },
      outputContract: "suggestions",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.RESEARCH_PRICING_ESTIMATES_WEB,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "PRINT_QA",
    labelHe: "PRINT_QA",
    descriptionHe: "PRINT_QA",
    category: "ops",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: true },
      outputContract: "suggestions",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.PRINT_QA,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "RECEIPT_PARSE_AND_MAP",
    labelHe: "RECEIPT_PARSE_AND_MAP",
    descriptionHe: "RECEIPT_PARSE_AND_MAP",
    category: "ops",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: true },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.RECEIPT_PARSE_AND_MAP,
    },
    model: "gpt-5-mini",
  },
];

const seedSkillsCore = async (ctx: any) => {
  for (const skill of SKILL_CATALOG) {
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_skillId", (q: any) => q.eq("skillId", skill.skillId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        labelHe: skill.labelHe,
        descriptionHe: skill.descriptionHe,
        category: skill.category,
        config: skill.config,
        prompts: skill.prompts,
        model: skill.model,
        isEnabled: true,
        version: (existing.version ?? 0) + 1,
      });
    } else {
      await ctx.db.insert("skills", {
        skillId: skill.skillId,
        labelHe: skill.labelHe,
        descriptionHe: skill.descriptionHe,
        category: skill.category,
        config: skill.config,
        prompts: skill.prompts,
        model: skill.model,
        isEnabled: true,
        version: 1,
      });
    }
  }
};

export const seedSkills = internalMutation({
  args: {},
  handler: async (ctx) => {
    await seedSkillsCore(ctx);
  },
});

export const ensureSkillsSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("skills").collect();
    let needsUpdate = existing.length !== SKILL_CATALOG.length;
    if (!needsUpdate) {
      const byId = new Map(existing.map((skill) => [skill.skillId, skill]));
      for (const skill of SKILL_CATALOG) {
        const current = byId.get(skill.skillId);
        if (!current) {
          needsUpdate = true;
          break;
        }
        const currentSnapshot = {
          labelHe: current.labelHe,
          descriptionHe: current.descriptionHe,
          category: current.category,
          config: current.config,
          prompts: current.prompts,
        };
        const nextSnapshot = {
          labelHe: skill.labelHe,
          descriptionHe: skill.descriptionHe,
          category: skill.category,
          config: skill.config,
          prompts: skill.prompts,
        };
        if (JSON.stringify(currentSnapshot) !== JSON.stringify(nextSnapshot)) {
          needsUpdate = true;
          break;
        }
      }
    }
    if (!needsUpdate) return { seeded: false };
    await seedSkillsCore(ctx);
    return { seeded: true };
  },
});

export const listEnabledSkills = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isEnabled"), true))
      .collect();
  },
});
