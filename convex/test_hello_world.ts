import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

export const execute = action({
    args: {},
    handler: async (ctx) => {
        console.log("[HELLO_TEST] Listing projects...");
        const projects = await ctx.runQuery(api.projects.list);
        if (!projects || projects.length === 0) {
            console.error("[HELLO_TEST] No projects found.");
            return { ok: false, error: "No projects found" };
        }
        const project = projects[0];
        console.log(`[HELLO_TEST] Using project: ${project.name} (${project._id})`);

        console.log("[HELLO_TEST] Seeding skills...");
        await ctx.runMutation(internal.skills.registry.seedSkills);

        console.log("[HELLO_TEST] Creating conversation...");
        const conversationId = await ctx.runMutation(api.skills.runner.createAgentConversation, {
            projectId: project._id,
            title: "Hello World Test " + new Date().toISOString()
        });

        console.log("[HELLO_TEST] Running HELLO_WORLD_TEST...");
        const blocks = await ctx.runAction(api.skills.runner.runSkill, {
            projectId: project._id,
            conversationId,
            skillId: "HELLO_WORLD_TEST",
            params: { source: "hello_world_test" }
        });

        console.log("[HELLO_TEST] Done");
        return { ok: true, conversationId, blocks };
    }
});
