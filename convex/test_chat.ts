
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

export const execute = action({
    args: {},
    handler: async (ctx) => {
        // 1. Get Project
        console.log("[TEST] Listing projects...");
        const projects = await ctx.runQuery(api.projects.list);
        if (!projects || projects.length === 0) {
            console.error("[TEST] No projects found.");
            return;
        }
        const project = projects[0];
        console.log(`[TEST] Using project: ${project.name} (${project._id})`);

        // 2. Check/Seed Skills
        console.log("[TEST] Checking skills...");
        const skills = await ctx.runQuery(api.skills.registry.listEnabledSkills);
        console.log(`[TEST] Found ${skills.length} enabled skills.`);

        const consultant = skills.find((s: any) => s.skillId === "CONSULTANT_CHAT");
        if (!consultant) {
            console.log("[TEST] CONSULTANT_CHAT not found. Calling seedSkills...");
            await ctx.runMutation(internal.skills.registry.seedSkills);
        } else {
            console.log("[TEST] CONSULTANT_CHAT exists.");
        }

        // 3. Create Conversation
        console.log("[TEST] Creating conversation...");
        const conversationId = await ctx.runMutation(api.skills.runner.createAgentConversation, {
            projectId: project._id,
            title: "Debug Chat " + new Date().toISOString()
        });
        console.log(`[TEST] Conversation created: ${conversationId}`);

        // 4. Send Message
        console.log("[TEST] Sending message...");
        try {
            await ctx.runAction(api.skills.runner.sendMessageAndRun, {
                projectId: project._id,
                conversationId,
                text: "Running Shopping Planner via Suggestion Click",
                skillId: "SHOPPING_PLANNER_WEB"
            });
            console.log("[TEST] Message sent successfully (Action completed).");
        } catch (e: any) {
            console.error("[TEST] Error sending message:", e);
        }
    }
});
