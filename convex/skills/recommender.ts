import { query } from "../_generated/server";
import { v } from "convex/values";
import { SKILL_CATALOG } from "./registry";

export const getProjectDigest = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Elements stats
    const elements = await ctx.db
      .query("elements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const elementsCount = elements.length;
    const elementsApproved = elements.filter(e => e.status !== "drafting" && e.status !== "archived").length;

    // 2. Tasks stats
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    const tasksCount = tasks.length;
    const tasksWithEstimates = tasks.filter(t => t.estimatedMinutes && t.estimatedMinutes > 0).length;

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
    // In a real implementation, we would call getProjectDigest logic here or separate it.
    // For efficiency, we'll inline the checks or reuse code if we exported functions.
    // Since getProjectDigest is a query, we can't call it directly from inside another query easily 
    // without making it an internal query or helper. Let's just re-fetch for now or assume efficient caching.
    
    // Re-fetch logic (simplified for recommendations)
    const elements = await ctx.db.query("elements").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(1);
    const hasElements = elements.length > 0;

    const tasks = await ctx.db.query("tasks").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(1);
    const hasTasks = tasks.length > 0;

    const lines = await ctx.db.query("materialLines").withIndex("by_project", q => q.eq("projectId", args.projectId)).take(1);
    const hasBudget = lines.length > 0;

    const recommendations = [];

    // Rule 1: Empty project -> Consultant or Elements
    if (!hasElements) {
      recommendations.push({
        skillId: "CONSULTANT_CHAT",
        reasonHe: "להתחיל בתכנון רעיוני",
      });
      // We don't have elements builder in the short list yet, but let's assume we might add it.
    }

    // Rule 2: Has elements, no tasks -> Tasks Builder
    if (hasElements && !hasTasks) {
      recommendations.push({
        skillId: "TASKS_BUILDER_FULL",
        reasonHe: "יש אלמנטים, כדאי לבנות תוכנית עבודה",
      });
    }

    // Rule 3: Always useful -> Audit
    recommendations.push({
      skillId: "GAP_AUDIT",
      reasonHe: "בדיקת שלמות ותקינות",
    });

    // Sort by priority (this is a naive sort)
    // Map to full skill objects
    const skills = await ctx.db.query("skills").collect(); // Load all skills to map details
    
    const recommendedDetails = recommendations.map(rec => {
      const skill = skills.find(s => s.skillId === rec.skillId);
      if (!skill) return null;
      return {
        ...skill,
        reasonHe: rec.reasonHe,
      };
    }).filter(Boolean);

    return recommendedDetails;
  },
});
