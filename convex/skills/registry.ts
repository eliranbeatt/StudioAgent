import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { SKILL_SYSTEM_ADDONS } from "./prompts";

export interface SkillDefinition {
  skillId: string;
  labelHe: string;
  descriptionHe: string;
  category: "consult" | "build" | "review" | "research" | "audit" | "clarify" | "ops";
  flow: "ideation" | "planning" | "execution" | "review" | "optimization";
  scheduling?: {
    suggestAfter?: string[];
    suggestAtStage?: ("ideation" | "planning" | "execution" | "review")[];
  };
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
    labelHe: "צ'אט יועץ",
    descriptionHe: "התייעצות כללית וניהול השיחה",
    category: "consult",
    flow: "ideation",
    scheduling: { suggestAtStage: ["ideation", "planning", "execution", "review"] },
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
      
      Available Skills to run or suggest (USE EXACT ID ONLY):
      - TASKS_BUILDER_FULL: For creating task trees.
      - ELEMENTS_BUILDER_FULL: For creating elements.
      - ACCOUNTING_BUILDER_FULL: For creating BOM/Budget.
      - SHOPPING_PLANNER_WEB: For finding products/prices (Use this EXACT ID, do NOT use "RUN_SHOPPING...").
      - GAP_AUDIT: For checking missing items.
      
      CRITICAL: Never invent skill IDs. Use ONLY the IDs listed above.
      `,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "CLARIFICATIONS_GATE",
    labelHe: "שאלות הבהרה",
    descriptionHe: "שאלות קריטיות לפני ביצוע",
    category: "clarify",
    flow: "planning",
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
    skillId: "CONTEXT_GENERATION",
    labelHe: "איסוף ידע",
    descriptionHe: "איסוף והצגת ידע פרויקט עדכני + שאלות הבהרה חדשות בלבד.",
    category: "clarify",
    flow: "ideation",
    scheduling: { suggestAtStage: ["ideation", "planning", "execution", "review"] },
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.CONTEXT_GENERATION,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "CHANGESET_REVIEWER",
    labelHe: "סקירת שינויים",
    descriptionHe: "בדיקת הצעות לפני אישור",
    category: "review",
    flow: "review",
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
    labelHe: "בניית בריף",
    descriptionHe: "הגדרת גבולות גזרה לפרויקט",
    category: "build",
    flow: "ideation",
    scheduling: { suggestAtStage: ["ideation"] },
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
    labelHe: "בניית אלמנטים",
    descriptionHe: "יצירה ועריכה של אלמנטים",
    category: "build",
    flow: "planning",
    scheduling: { suggestAfter: ["PROJECT_BRIEF_BUILDER"], suggestAtStage: ["ideation", "planning"] },
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
    labelHe: "בניית משימות",
    descriptionHe: "גזירת משימות עבודה מאלמנטים",
    category: "build",
    flow: "planning",
    scheduling: { suggestAfter: ["ELEMENTS_BUILDER_FULL"], suggestAtStage: ["planning"] },
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
    model: "gpt-5.2",
  },
  {
    skillId: "ACCOUNTING_BUILDER_FULL",
    labelHe: "בניית תמחור",
    descriptionHe: "יצירת BOM ותמחור שעות",
    category: "build",
    flow: "planning",
    scheduling: { suggestAfter: ["TASKS_BUILDER_FULL"], suggestAtStage: ["planning"] },
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
    model: "gpt-5.2",
  },
  {
    skillId: "QUOTE_WRITER_FULL",
    labelHe: "הפקת הצעת מחיר",
    descriptionHe: "יצירת מסמך הצעה ללקוח",
    category: "build",
    flow: "planning",
    scheduling: { suggestAfter: ["ACCOUNTING_BUILDER_FULL"], suggestAtStage: ["planning", "review"] },
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
    labelHe: "סנכרון משימות",
    descriptionHe: "עדכון משימות בעקבות שינוי אלמנטים",
    category: "build",
    flow: "execution",
    scheduling: { suggestAfter: ["ELEMENTS_BUILDER_FULL"], suggestAtStage: ["execution"] },
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
    labelHe: "נתיב קריטי",
    descriptionHe: "אופטימיזציה של תלויות וזמנים",
    category: "review",
    flow: "review",
    scheduling: { suggestAfter: ["TASKS_BUILDER_FULL"], suggestAtStage: ["planning", "review"] },
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
    labelHe: "תיקון קישורים",
    descriptionHe: "חיבור מחדש של עלויות למשימות",
    category: "review",
    flow: "review",
    scheduling: { suggestAfter: ["ACCOUNTING_BUILDER_FULL"], suggestAtStage: ["planning", "review"] },
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
    labelHe: "בדיקת חוסרים",
    descriptionHe: "זיהוי פערים לוגיסטיים ובטיחותיים",
    category: "audit",
    flow: "review",
    scheduling: { suggestAtStage: ["planning", "review", "execution"] },
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
    labelHe: "סקירת סיכונים",
    descriptionHe: "זיהוי סיכוני לו\"ז ותקציב",
    category: "review",
    flow: "review",
    scheduling: { suggestAtStage: ["planning", "review"] },
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
    labelHe: "ניתוח עלויות",
    descriptionHe: "השוואת תכנון מול ביצוע בפועל",
    category: "audit",
    flow: "optimization",
    scheduling: { suggestAtStage: ["execution", "review"] },
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
    labelHe: "תכנון יומי",
    descriptionHe: "הפקת לו\"ז ורשימת משימות ליום העבודה",
    category: "ops",
    flow: "execution",
    scheduling: { suggestAtStage: ["execution"] },
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
    labelHe: "תיק התקנה",
    descriptionHe: "יצירת מסמך הוראות ורשימת ציוד לשטח",
    category: "build",
    flow: "execution",
    scheduling: { suggestAfter: ["TASKS_BUILDER_FULL"], suggestAtStage: ["execution"] },
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
    labelHe: "תכנון רכש",
    descriptionHe: "בניית מסלולי קניות והשוואת מחירים",
    category: "research",
    flow: "execution",
    scheduling: { suggestAfter: ["ACCOUNTING_BUILDER_FULL"], suggestAtStage: ["execution"] },
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
    labelHe: "עוזר קניות",
    descriptionHe: "חיפוש ממוקד למוצר ספציפי",
    category: "research",
    flow: "execution",
    scheduling: { suggestAtStage: ["execution"] },
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
    labelHe: "מחקר השראה",
    descriptionHe: "חיפוש רפרנסים ויזואליים וטכניים",
    category: "research",
    flow: "ideation",
    scheduling: { suggestAtStage: ["ideation", "planning"] },
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
    labelHe: "הערכת מחירים",
    descriptionHe: "אומדן עלויות גס ע\"ב מחירים ברשת",
    category: "research",
    flow: "planning",
    scheduling: { suggestAtStage: ["ideation", "planning"] },
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
    labelHe: "בקרת דפוס",
    descriptionHe: "בדיקת קבצים לדפוס לפני שליחה",
    category: "ops",
    flow: "execution",
    scheduling: { suggestAtStage: ["execution"] },
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
    labelHe: "פענוח קבלות",
    descriptionHe: "הזנת הוצאות אוטומטית מקבצים",
    category: "ops",
    flow: "optimization",
    scheduling: { suggestAtStage: ["execution", "review"] },
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
  {
    skillId: "BOM_DUPLICATE_ANALYZER",
    labelHe: "בדיקת שורות כפולות בתמחור",
    descriptionHe: "איתור ומחיקת כפילויות ב-BOM",
    category: "audit",
    flow: "review",
    scheduling: { suggestAtStage: ["planning", "review", "execution"] },
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.BOM_DUPLICATE_ANALYZER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "BUILD_PLANNER",
    labelHe: "תכנון ביצוע (ראשי)",
    descriptionHe: "ניתוב לתכנון אלמנטים או משימות",
    category: "ops",
    flow: "planning",
    scheduling: { suggestAtStage: ["planning"] },
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.BUILD_PLANNER,
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
        flow: skill.flow,
        scheduling: skill.scheduling,
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
        flow: skill.flow,
        scheduling: skill.scheduling,
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
          flow: current.flow,
          scheduling: current.scheduling,
          config: current.config,
          prompts: current.prompts,
        };
        const nextSnapshot = {
          labelHe: skill.labelHe,
          descriptionHe: skill.descriptionHe,
          category: skill.category,
          flow: skill.flow,
          scheduling: skill.scheduling,
          config: skill.config,
          prompts: skill.prompts,
        };
        // Simple equality check is tricky with nested objects, but this is a rough check.
        // Better to just force update if we're unsure or use a deeper compare.
        // For now, trusting this logic or just forcing update if needed.
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
