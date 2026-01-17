import { query } from "../_generated/server";
import { v } from "convex/values";
import { SKILL_CATALOG } from "./registry";
import { addSkillTags } from './tags'

export const getProjectDigest = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Elements stats
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const elementsCount = elements.length;
    const elementsApproved = elements.filter(e => e.status !== "archived").length;

    // 2. Tasks stats
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const tasksCount = tasks.length;
    const tasksWithEstimates = tasks.filter((t) => {
      const hours =
        t.estimatedHours ??
        (t.estimatedMinutes !== undefined ? t.estimatedMinutes / 60 : undefined);
      return hours !== undefined && hours > 0;
    }).length;

    // 3. Accounting stats
    // Checking materialLines for now as proxy
    const lines = await ctx.db
      .query("materialLines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const hasBudget = lines.length > 0;

    // 4. Quote stats
    const quotes = await ctx.db
      .query("quoteVersions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const hasQuote = quotes.length > 0;

    return {
      elementsCount,
      elementsApproved,
      tasksCount,
      tasksWithEstimates,
      hasBudget,
      hasQuote,
      lastUpdated: Date.now(),
    };
  },
});

export const recommendSkills = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Fetch Project State
    const elements = await ctx.db.query("elements").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const tasks = await ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const materialLines = await ctx.db.query("materialLines").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).take(1);
    const quotes = await ctx.db.query("quoteVersions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).take(1);

    const hasElements = elements.length > 0;
    const hasTasks = tasks.length > 0;
    const hasBudget = materialLines.length > 0;
    const hasQuote = quotes.length > 0;

    // Determine Current Stage
    let currentStage: "ideation" | "planning" | "execution" | "review" = "ideation";
    if (hasElements) currentStage = "planning";
    if (hasTasks && hasBudget && hasQuote) currentStage = "execution";

    // Analyze completed "milestone" skills (simplified proxy based on data existence)
    const completedSkills = new Set<string>();
    if (hasElements) completedSkills.add("ELEMENTS_BUILDER_FULL");
    if (hasTasks) completedSkills.add("TASKS_BUILDER_FULL");
    if (hasBudget) completedSkills.add("ACCOUNTING_BUILDER_FULL");
    if (hasQuote) completedSkills.add("QUOTE_WRITER_FULL");
    if (hasElements && hasTasks) completedSkills.add("ELEMENTS_TO_TASKS_SYNC"); // assumed

    // Get all enabled skills
    const skills = await ctx.db.query("skills").filter((q) => q.eq(q.field("isEnabled"), true)).collect();

    const recommendations = [];

    for (const skill of skills) {
      if (!skill.scheduling) continue;

      let score = 0;
      let reason = "";

      // Factor 1: Stage Relevance
      if (skill.scheduling.suggestAtStage?.includes(currentStage)) {
        score += 10;
      }

      // Factor 2: Prerequisites met (suggestAfter)
      // If skill has suggestAfter, ONLY suggest if ALL prerequisites are met OR if it's explicitly allowed to start (e.g. first skill)
      if (skill.scheduling.suggestAfter && skill.scheduling.suggestAfter.length > 0) {
        const prereqsMet = skill.scheduling.suggestAfter.every(prereq => completedSkills.has(prereq));
        if (prereqsMet) {
          score += 20;
          reason = "השלב הבא בתהליך";
        } else {
          // If prereqs NOT met, punish usage score (hide it)
          score -= 100;
        }
      }

      // Special overrides
      if (currentStage === "ideation" && skill.skillId === "PROJECT_BRIEF_BUILDER" && !hasElements) {
        score += 50;
        reason = "מומלץ להתחלה";
      }

      if (currentStage === "ideation" && skill.skillId === "CONSULTANT_CHAT") {
        score += 5;
        reason = "זמין להתייעצות";
      }

      // Additional Boosts
      if (skill.skillId === "GAP_AUDIT" && hasElements && hasTasks) {
        score += 5;
        reason = "בדיקת תקינות";
      }

      if (score > 0) {
        recommendations.push({
          ...addSkillTags(skill),
          reasonHe: reason || skill.descriptionHe || "מומלץ כעת"
        });
      }
    }

    // Sort by flow order (naive)
    const flowOrder: Record<string, number> = { "ideation": 0, "planning": 1, "review": 2, "execution": 3, "optimization": 4 };

    recommendations.sort((a, b) => {
      const flowDiff = (flowOrder[a.flow] || 99) - (flowOrder[b.flow] || 99);
      if (flowDiff !== 0) return flowDiff;
      return 0;
    });

    const contextSkillIndex = recommendations.findIndex((skill) => skill.skillId === "CONTEXT_GENERATION");
    if (contextSkillIndex > 0) {
      const [contextSkill] = recommendations.splice(contextSkillIndex, 1);
      recommendations.unshift(contextSkill);
    }

    return recommendations;
  },
});

