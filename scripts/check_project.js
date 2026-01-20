
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

    console.log("Checking Project P1 ID:", p1Id);
    // We can't query by ID directly nicely unless we use a query that accepts ID.
    // api.projects.get uses ID.
    // Actually api.projects.getOverview uses ID.
    try {
        const res = await client.query(api.projects.getOverview, { id: p1Id });
        if (res && res.project) {
            console.log("Project Found:", res.project.name);
        } else {
            console.log("Project NOT Found (result null via getOverview)");
        }
    } catch (e) {
        console.log("Error querying project:", e.message);
    }
}

main().catch(console.error);
