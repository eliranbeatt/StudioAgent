
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");
require("dotenv").config({ path: ".env.local" });

const address = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = new ConvexHttpClient(address);

async function main() {
    console.log("Testing LLM connectivity...");

    // Seed project
    const projectId = await client.mutation(api.testing.seedP0);
    console.log("Project:", projectId);

    // Create convo
    const conversationId = await client.mutation(api.skills.runner.createAgentConversation, {
        projectId,
        title: "Test"
    });
    console.log("Conversation:", conversationId);

    console.log("Sending message...");
    const start = Date.now();
    await client.action(api.skills.runner.sendMessageAndRun, {
        projectId,
        conversationId,
        text: "Hello world",
        skillId: "CONSULTANT_CHAT"
    });
    console.log("Message sent! Took", (Date.now() - start) / 1000, "s");
}

main().catch(console.error);
