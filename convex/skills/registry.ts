import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { SKILL_SYSTEM_ADDONS } from "./prompts";
import { addSkillTags, TAG_DEFINITIONS, TAG_GROUPS } from './tags'

export interface SkillDefinition {
  skillId: string;
  labelHe: string;
  descriptionHe: string;
  category: "planning" | "tasks" | "knowledge" | "review" | "shopping";
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
      generateQuote?: boolean;
      estimateTasks?: boolean;
      agentData?: boolean;
    };
    outputContract: "blocks" | "changeset" | "suggestions";
  };
  prompts: {
    systemHeaderRef: string;
    promptAddon: string;
  };
  model: string;
  llmParams?: Record<string, any>;
  isEnabled?: boolean;
}

const SYSTEM_HEADER_REF = "studioops_v7_1";

export const SKILL_CATALOG: SkillDefinition[] = [
  {
    skillId: "knowledge",
    labelHe: "אורקסטרטור",
    descriptionHe: "ניהול ותיאום משימות",
    category: "knowledge",
    flow: "ideation",
    scheduling: { suggestAtStage: ["ideation", "planning", "execution", "review"] },
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, runSkill: true, agentData: true },
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
    skillId: "HELLO_WORLD_TEST",
    labelHe: "?????????? ???????? ????????",
    descriptionHe: "?????????? ?????????? ???????? hello world",
    category: "knowledge",
    flow: "ideation",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.HELLO_WORLD_TEST,
    },
    model: "gpt-4o-mini",
    llmParams: { temperature: 0.2, max_tokens: 200 },
  },
  {
    skillId: "CLARIFICATIONS_GATE",
    labelHe: "שאלות הבהרה",
    descriptionHe: "ניהול שאלות הבהרה",
    category: "knowledge",
    flow: "planning",
    isEnabled: false,
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
    descriptionHe: "יצירת קונטקסט",
    category: "knowledge",
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
    descriptionHe: "בדיקת שינויים",
    category: "review",
    flow: "review",
    isEnabled: false,
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
    descriptionHe: "יצירת בריף לפרויקט",
    category: "planning",
    flow: "ideation",
    isEnabled: false,
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
    labelHe: "תכנון אלמנטים",
    descriptionHe: "יצירת רשימת אלמנטים",
    category: "planning",
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
    labelHe: "תכנון משימות",
    descriptionHe: "יצירת עץ משימות",
    category: "planning",
    flow: "planning",
    scheduling: { suggestAfter: ["ELEMENTS_BUILDER_FULL"], suggestAtStage: ["planning"] },
    config: {
      requiresClarifications: true,
      clarificationsTargetSkillId: "TASKS_BUILDER_FULL",
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, estimateTasks: true },
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
    labelHe: "תכנון תקציב",
    descriptionHe: "יצירת BOM ותקציב",
    category: "planning",
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
    descriptionHe: "יצירת הצעת מחיר",
    category: "planning",
    flow: "planning",
    isEnabled: true,
    scheduling: { suggestAfter: ["ACCOUNTING_BUILDER_FULL"], suggestAtStage: ["planning", "review"] },
    config: {
      requiresClarifications: true,
      clarificationsTargetSkillId: "QUOTE_WRITER_FULL",
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, generateQuote: true },
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
    labelHe: "סנכרון אלמנטים למשימות",
    descriptionHe: "עדכון משימות לפי אלמנטים",
    category: "tasks",
    flow: "execution",
    scheduling: { suggestAfter: ["ELEMENTS_BUILDER_FULL"], suggestAtStage: ["execution"] },
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, generateQuote: true },
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
    descriptionHe: "אופטימיזציה של נתיב קריטי",
    category: "tasks",
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
    labelHe: "תיקון מיפוי תקציב",
    descriptionHe: "סידור קשרים בין משימות לתקציב",
    category: "tasks",
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
    descriptionHe: "איתור פערים בתכנון",
    category: "review",
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
    descriptionHe: "זיהוי סיכונים פוטנציאליים",
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
    descriptionHe: "בדיקת חריגות תקציב",
    category: "review",
    flow: "optimization",
    isEnabled: false,
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
    descriptionHe: "יצירת תוכנית עבודה יומית",
    category: "tasks",
    flow: "execution",
    isEnabled: false,
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
    labelHe: "הוראות התקנה",
    descriptionHe: "יצירת ראנבוק להתקנה",
    category: "planning",
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
    labelHe: "תכנון קניות",
    descriptionHe: "חיפוש מוצרים ומחירים",
    category: "shopping",
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
    llmParams: { reasoning_effort: "medium" },
  },
  {
    skillId: "BUYING_ASSISTANT_WEB",
    labelHe: "עוזר קניות",
    descriptionHe: "עזרה ברכישות אונליין",
    category: "shopping",
    flow: "execution",
    isEnabled: false,
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
    labelHe: "צ'אט יועץ",
    descriptionHe: "מחקר והשראה",
    category: "knowledge",
    flow: "ideation",
    isEnabled: false,
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
    descriptionHe: "בדיקת אומדני מחיר",
    category: "shopping",
    flow: "planning",
    scheduling: { suggestAtStage: ["ideation", "planning"] },
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: true, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.RESEARCH_PRICING_ESTIMATES_WEB,
    },
    model: "gpt-5-mini",
    llmParams: { reasoning_effort: "medium" },
  },
  {
    skillId: "PRINT_QA",
    labelHe: "בקרת דפוס",
    descriptionHe: "בדיקת קבצים לדפוס",
    category: "review",
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
    descriptionHe: "קריאת קבלות וסנכרון",
    category: "shopping",
    flow: "optimization",
    isEnabled: false,
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
    labelHe: "זיהוי כפילויות",
    descriptionHe: "איתור כפילויות ב-BOM",
    category: "review",
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
    labelHe: "תכנון ביצוע",
    descriptionHe: "תכנון שלבי ביצוע",
    category: "planning",
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
  {
    skillId: "TASKS_SYNC_FROM_LABOR_LINES",
    labelHe: "סנכרון עבודה",
    descriptionHe: "יצירת משימות מכוח אדם",
    category: "tasks",
    flow: "execution",
    scheduling: { suggestAfter: ["ACCOUNTING_BUILDER_FULL"], suggestAtStage: ["planning", "execution"] },
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.TASKS_SYNC_FROM_LABOR_LINES,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "PRICING_LOOKUP_CATALOG_BATCH",
    labelHe: "בדיקת מחירון",
    descriptionHe: "בדיקת מחירים בקטלוג",
    category: "shopping",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.PRICING_LOOKUP_CATALOG_BATCH,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "PRICING_RESEARCH_WEB_BATCH",
    labelHe: "מחקר מחיר באינטרנט",
    descriptionHe: "מחקר מחירים באינטרנט לשורות חומר",
    category: "shopping",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: true, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.PRICING_RESEARCH_WEB_BATCH,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "PRICING_ESTIMATE_FALLBACK_BATCH",
    labelHe: "הערכת מחיר חליפית",
    descriptionHe: "הערכת מחיר כשאין מחירון",
    category: "shopping",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.PRICING_ESTIMATE_FALLBACK_BATCH,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "TASKS_ENRICH_FROM_ACCOUNTING_BATCH",
    labelHe: "העשרת משימות",
    descriptionHe: "הוספת נתונים למשימות מתקציב",
    category: "tasks",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.TASKS_ENRICH_FROM_ACCOUNTING_BATCH,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "OVERHEAD_AND_LOGISTICS_COMPLETER",
    labelHe: "השלמות לוגיסטיקה",
    descriptionHe: "חישוב עלויות תקורה",
    category: "planning",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.OVERHEAD_AND_LOGISTICS_COMPLETER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "QUOTE_BUILD_OR_FIX",
    labelHe: "בניית הצעת מחיר",
    descriptionHe: "יצירה או תיקון הצעה",
    category: "planning",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.QUOTE_BUILD_OR_FIX,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "FINAL_AUDIT_FIXER",
    labelHe: "תיקונים סופיים",
    descriptionHe: "תיקון שגיאות אחרונות",
    category: "review",
    flow: "review",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.FINAL_AUDIT_FIXER,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "setLaborRates",
    labelHe: "עדכון תעריפים",
    descriptionHe: "עדכון תעריפי עבודה",
    category: "planning",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.setLaborRates,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "confirmMeasurements",
    labelHe: "אישור מידות",
    descriptionHe: "בדיקה ועדכון מידות",
    category: "planning",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.confirmMeasurements,
    },
    model: "gpt-5-mini",
  },
  // ============================================
  // V3 FLOW SKILLS
  // ============================================
  {
    skillId: "V3_Q_A_INTAKE",
    labelHe: "V3 שאלות שלב A",
    descriptionHe: "איסוף מידע ראשוני",
    category: "knowledge",
    flow: "ideation",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_Q_A_INTAKE,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_Q_B_PLAN",
    labelHe: "V3 שאלות שלב B",
    descriptionHe: "הבהרות לתכנון",
    category: "knowledge",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_Q_B_PLAN,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_Q_C_COST",
    labelHe: "V3 שאלות שלב C",
    descriptionHe: "הבהרות לתמחור",
    category: "knowledge",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_Q_C_COST,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_Q_D_POLISH_APPROVALS",
    labelHe: "V3 שאלות שלב D",
    descriptionHe: "אישורים לפוליש",
    category: "knowledge",
    flow: "review",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_Q_D_POLISH_APPROVALS,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_Q_E_QUOTE",
    labelHe: "V3 שאלות שלב E",
    descriptionHe: "הבהרות להצעה",
    category: "knowledge",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_Q_E_QUOTE,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_BUILD_A_MEMORYDOCS",
    labelHe: "V3 בנייה שלב A",
    descriptionHe: "יצירת מסמך קונטקסט",
    category: "knowledge",
    flow: "ideation",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_BUILD_A_MEMORYDOCS,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_BUILD_B_PLAN",
    labelHe: "V3 בנייה שלב B",
    descriptionHe: "יצירת אלמנטים ומשימות",
    category: "planning",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_BUILD_B_PLAN,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_BUILD_C_ACCOUNTING",
    labelHe: "V3 בנייה שלב C",
    descriptionHe: "יצירת BOM ותקציב",
    category: "planning",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_BUILD_C_ACCOUNTING,
    },
    model: "gpt-5-mini",
  },
  {
    skillId: "V3_BUILD_D_POLISH",
    labelHe: "V3 בנייה שלב D",
    descriptionHe: "פוליש וניקוי",
    category: "review",
    flow: "review",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "changeset",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_BUILD_D_POLISH,
    },
    model: "gpt-5.2",
  },
  {
    skillId: "V3_BUILD_E_QUOTE",
    labelHe: "V3 בנייה שלב E",
    descriptionHe: "יצירת הצעת מחיר",
    category: "planning",
    flow: "planning",
    config: {
      requiresClarifications: false,
      allowedTools: { webSearch: false, ragSearch: false, fileInspect: false, agentData: true },
      outputContract: "blocks",
    },
    prompts: {
      systemHeaderRef: SYSTEM_HEADER_REF,
      promptAddon: SKILL_SYSTEM_ADDONS.V3_BUILD_E_QUOTE,
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

    const isEnabled = skill.isEnabled !== undefined ? skill.isEnabled : true;

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
        llmParams: skill.llmParams,
        isEnabled: isEnabled,
        version: (existing.version ?? 0) + 1,
      });
    } else {
      await ctx.db.insert("skills", {
        skillId: skill.skillId,
        labelHe: skill.labelHe,
        descriptionHe: skill.descriptionHe,
        category: skill.category,
        flow: skill.flow,
        config: skill.config,
        prompts: skill.prompts,
        model: skill.model,
        llmParams: skill.llmParams,
        isEnabled: isEnabled,
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
          llmParams: current.llmParams,
        };
        const nextSnapshot = {
          labelHe: skill.labelHe,
          descriptionHe: skill.descriptionHe,
          category: skill.category,
          flow: skill.flow,
          scheduling: skill.scheduling,
          config: skill.config,
          prompts: skill.prompts,
          llmParams: skill.llmParams,
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
    const skills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isEnabled"), true))
      .collect();
    return skills.map((skill) => addSkillTags(skill));
  },
});

export const listSkillTagDefinitions = query({
  args: {},
  handler: async () => {
    return {
      groups: TAG_GROUPS,
      tags: TAG_DEFINITIONS,
    }
  },
});


