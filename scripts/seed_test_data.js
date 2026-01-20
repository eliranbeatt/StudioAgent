
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
    console.log("Cleaning up old test projects...");
    const cleared = await client.mutation(api.testing.clearAllTestProjects);
    console.log(`Deleted ${cleared} projects.`);

    console.log("Seeding P0 Empty...");
    const p0Id = await client.mutation(api.testing.seedP0);
    console.log("P0 ID:", p0Id);

    console.log("Seeding P1 Minimal...");
    const p1Id = await client.mutation(api.testing.seedP1);
    console.log("P1 ID:", p1Id);

    console.log("Seeding complete.");

    // Write IDs to a file for other scripts to use
    fs.writeFileSync("test-ids.json", JSON.stringify({ p0Id, p1Id }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
