
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");
const fs = require('fs');
require("dotenv").config({ path: ".env.local" });

const address = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = new ConvexHttpClient(address);

async function main() {
    let p1Id;
    try {
        const testIds = JSON.parse(fs.readFileSync("test-ids.json", "utf8"));
        p1Id = testIds.p1Id;
    } catch (e) {
        console.error("test-ids.json error");
        process.exit(1);
    }

    console.log("Starting a new run for P1...");
    const runId = await client.mutation(api.flowRuns.start, { projectId: p1Id });
    console.log("Run started:", runId);

    console.log("Calling runNext (Action)...");
    try {
        await client.action(api.flowRuns.runNext, { flowRunId: runId });
        console.log("runNext executed successfully (unexpected if bug exists)");
    } catch (e) {
        console.log("runNext FAILED as expected/suspected:");
        console.log(e.message);
    }
}

main().catch(console.error);
