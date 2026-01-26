
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");
require("dotenv").config({ path: ".env.local" });
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

async function main() {
    const projectId = "nn735kwj1hb60ty0fpv37j2pfh7zshn9";
    const run = await client.query(api.testing.getLatestSkillRun, { projectId });
    console.log("Latest Run:", run);
}
main().catch(console.error);
