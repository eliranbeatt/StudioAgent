
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

const WAIT_TIME_MS = 1000;
const MAX_LOOPS = 80;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("=== Starting E2E Agent Flow Test (v2) ===");

    await client.mutation(api.featureFlags.setFlag, { name: "ff_flow_pricing_gates", enabled: true });

    // 1. Create Project
    console.log("Creating Project...");
    const projectId = await client.mutation(api.testing.seedP0);
    console.log(`Project Created: ${projectId}`);

    // 2. Start Flow
    console.log("Starting Flow...");
    const runId = await client.mutation(api.flowRuns.start, { projectId });
    console.log(`Flow Run ID: ${runId}`);

    const activeRun = await client.query(api.flowRuns.getActiveByProject, { projectId });
    if (!activeRun || activeRun._id !== runId) {
        console.error("Could not find active run");
    }
    const conversationId = activeRun.conversationId;

    // 3. Seed Context (To bypass LLM hang in G0/ContextGen)
    console.log("Seeding Context...");
    await client.mutation(api.testing.seedContext, {
        projectId,
        text: "I want to build a customized wooden pergola, 4x4 meters, with a roof. Use high quality wood."
    });

    console.log("Sending User Request (Async)...");
    client.action(api.skills.runner.sendMessageAndRun, {
        projectId,
        conversationId,
        text: "I want to build a customized wooden pergola, 4x4 meters, with a roof.",
        skillId: "CONTEXT_GENERATION",
        params: {}
    }).then(() => console.log("User Request sent.")).catch(e => console.error("User Request failed:", e));

    // Enable AutoRun
    await client.mutation(api.flowRuns.setToggles, {
        flowRunId: runId,
        toggles: { autoRun: true, autoApprove: false, useWebSearch: false }
    });

    // 4. Loop
    let finished = false;
    let loops = 0;
    let runNextPromise = null;

    while (!finished && loops < MAX_LOOPS) {
        loops++;
        await sleep(WAIT_TIME_MS);

        const state = await client.query(api.testing.getFlowState, { flowRunId: runId });
        if (!state || !state.run) {
            console.log("Run disappeared?");
            break;
        }

        const currentRun = state.run;
        const status = currentRun.status;
        const gate = currentRun.currentGateId;

        console.log(`[Loop ${loops}] Status: ${status}, Gate: ${gate}`);

        if (status === 'completed') {
            finished = true;
            console.log("Flow Completed!");
            break;
        }

        if (status === 'awaiting_approval') {
            const step = state.step;
            const draftIds = step ? step.draftChangeSetIds : [];

            if (draftIds && draftIds.length > 0) {
                console.log(`Found ${draftIds.length} draft ChangeSets. Approving...`);
                for (const changeSetId of draftIds) {
                    const cs = await client.query(api.changeSets.get, { id: changeSetId });
                    const opCount = cs.ops ? cs.ops.length : 0;
                    const opIndices = Array.from({ length: opCount }, (_, i) => i);

                    console.log(`Applying ChangeSet ${changeSetId} with ${opCount} ops...`);
                    await client.action(api.flowRuns.applyChangeSetOpsAndContinue, {
                        flowRunId: runId,
                        changeSetId,
                        opIndices
                    });
                }
            } else {
                await client.mutation(api.flowRuns.clearAwaitingApproval, { flowRunId: runId });
            }
            // Tick immediately
            if (!runNextPromise) {
                runNextPromise = client.action(api.flowRuns.runNext, { flowRunId: runId })
                    .catch(console.error)
                    .finally(() => { runNextPromise = null; });
            }
        }

        if (status === 'blocked') {
            const step = state.step;
            const draftIds = step ? step.draftChangeSetIds : [];

            if (draftIds && draftIds.length > 0) {
                console.log(`Found ${draftIds.length} draft ChangeSets while blocked. Approving...`);
                for (const changeSetId of draftIds) {
                    const cs = await client.query(api.changeSets.get, { id: changeSetId });
                    const opCount = cs.ops ? cs.ops.length : 0;
                    const opIndices = Array.from({ length: opCount }, (_, i) => i);

                    console.log(`Applying ChangeSet ${changeSetId} with ${opCount} ops...`);
                    await client.action(api.flowRuns.applyChangeSetOpsAndContinue, {
                        flowRunId: runId,
                        changeSetId,
                        opIndices
                    });
                }
            } else if (!runNextPromise) {
                runNextPromise = client.action(api.flowRuns.runNext, { flowRunId: runId })
                    .catch(console.error)
                    .finally(() => { runNextPromise = null; });
            }
        }

        if (status === 'running') {
            if (!runNextPromise) {
                runNextPromise = client.action(api.flowRuns.runNext, { flowRunId: runId })
                    .catch(console.error)
                    .finally(() => { runNextPromise = null; });
            }
        }

        if (status === 'failed' || status === 'cancelled') {
            console.error(`Flow terminated with status: ${status}`);
            finished = true;
        }
    }

    // 5. Verify Results
    console.log("=== Verification ===");
    const elementsResult = await client.query(api.elements.listByProject, { projectId });
    const elements = elementsResult?.elements ?? [];
    console.log(`Elements: ${elements.length}`);
    elements.forEach(e => console.log(` - ${e.title} (${e.type})`));

    const tasksResult = await client.query(api.tasks.listForProject, { projectId });
    const tasks = tasksResult?.tasks ?? [];
    console.log(`Tasks: ${tasks.length}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
