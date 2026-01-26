
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");
require("dotenv").config({ path: ".env.local" });
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

async function main() {
    // ID from Step 77 output
    const projectId = "nn735kwj1hb60ty0fpv37j2pfh7zshn9";

    await client.mutation(api.memory.saveRunningMemory, {
        projectId,
        contentMd_he: "Project: Build a pergola. Dimensions: 4x4m. Material: Wood. Roof: Yes."
    });
    console.log("Memory injected.");
}
main().catch(console.error);
