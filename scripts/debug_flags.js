
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");
require("dotenv").config({ path: ".env.local" });

const address = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = new ConvexHttpClient(address);

async function main() {
    const flags = await client.query(api.featureFlags.getAll);
    console.log("Current Flags:", JSON.stringify(flags, null, 2));
}

main().catch(console.error);
