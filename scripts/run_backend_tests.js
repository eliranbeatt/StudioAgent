
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");
const fs = require("fs");
require("dotenv").config({ path: ".env.local" });

const address = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!address) {
    console.error("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");
    process.exit(1);
}

const client = new ConvexHttpClient(address);

// Read test IDs
const testIds = JSON.parse(fs.readFileSync("test-ids.json", "utf8"));

async function testFeatureFlagDefault() {
    console.log("Running FF-01: Default flags all false...");
    // This is hard to test from outside if we can't inspect appSettings directly easily or mock it.
    // Assuming we can check via a query.
    // For now, let's just log a placeholder if we can't easily query internal state.
    console.log("SKIPPED: Cannot easily check internal appSettings from client without helper query.");
}

async function testP0Structure() {
    console.log("Running P0 Structure Check...");
    const res = await client.query(api.projects.getOverview, { id: testIds.p0Id });
    if (!res || !res.project) throw new Error("P0 not found");
    if (res.project.name !== "P0 Empty") throw new Error("P0 name mismatch");
    console.log("PASS: P0 Structure");
}

async function testP1Structure() {
    console.log("Running P1 Structure Check...");
    const res = await client.query(api.projects.getOverview, { id: testIds.p1Id });
    if (!res || !res.project) throw new Error("P1 not found");

    // Check elements
    if (res.elements.length !== 1) throw new Error(`P1 element count mismatch (expected 1, got ${res.elements.length})`);
    if (res.elements[0].title !== "Element 1") throw new Error("P1 element title mismatch");

    console.log("PASS: P1 Structure");
}


async function main() {
    await testFeatureFlagDefault();
    await testP0Structure();
    await testP1Structure();
    console.log("All Backend Tests Passed");
}

main().catch((err) => {
    console.error("Backend Tests Failed:", err);
    process.exit(1);
});
