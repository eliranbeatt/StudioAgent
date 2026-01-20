
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");
const fs = require('fs');
require("dotenv").config({ path: ".env.local" });

const address = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!address) {
    console.error("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");
    process.exit(1);
}

const client = new ConvexHttpClient(address);

async function main() {
    // Read P1 ID
    let p1Id;
    try {
        const testIds = JSON.parse(fs.readFileSync("test-ids.json", "utf8"));
        p1Id = testIds.p1Id;
    } catch (e) {
        console.error("test-ids.json not found");
        process.exit(1);
    }

    console.log("Setting Feature Flags...");
    await client.mutation(api.featureFlags.setFlag, { name: "ff_flow_agent_tab", enabled: true });
    await client.mutation(api.featureFlags.setFlag, { name: "ff_flow_agent_backend", enabled: true });

    console.log("Resetting runs for P1...");
    await client.mutation(api.testing.resetFlowRuns, { projectId: p1Id });

    console.log("Setup complete.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
