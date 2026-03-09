import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const root = process.cwd()
const outDir = path.join(root, 'Specs', 'StudioAgent_FullSpec')
const appendicesDir = path.join(outDir, 'appendices')
const snapshotsDir = path.join(outDir, 'snapshots')

const now = new Date().toISOString()

async function read(file) {
  return fs.readFile(path.join(root, file), 'utf8')
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function parseRegistry(ts) {
  const start = ts.indexOf('export const REGISTRY')
  if (start < 0) return []
  const body = ts.slice(start)
  const entryRegex = /'([^']+)'\s*:\s*\{([\s\S]*?)\n\s*\},/g
  const out = []
  let m
  while ((m = entryRegex.exec(body))) {
    const id = m[1]
    const block = m[2]
    const kind = /kind:\s*'([^']+)'/.exec(block)?.[1] || null
    const description = /description:\s*'([^']+)'/.exec(block)?.[1] || null
    const model = /model:\s*'([^']+)'/.exec(block)?.[1] || null
    const schemaName = /schemaName:\s*'([^']+)'/.exec(block)?.[1] || null
    const systemPromptRef = /systemPrompt:\s*([^,\n]+)/.exec(block)?.[1]?.trim() || null
    const toolsChunk = /allowedTools:\s*\[([\s\S]*?)\]/.exec(block)?.[1] || ''
    const allowedTools = [...toolsChunk.matchAll(/'([^']+)'/g)].map((x) => x[1])
    out.push({ id, kind, description, model, schemaName, systemPromptRef, allowedTools })
  }
  return out
}

function parseSchemaNames(ts) {
  const start = ts.indexOf('export const SDK_SCHEMAS')
  if (start < 0) return []
  const body = ts.slice(start)
  const keys = [...body.matchAll(/'([^']+)'\s*:\s*z\.object\(/g)].map((m) => m[1])
  return Array.from(new Set(keys)).sort()
}

function parsePromptDefs(ts) {
  const defs = [...ts.matchAll(/export const ([A-Z0-9_]+) = `([\s\S]*?)`;/g)].map((m) => ({
    name: m[1],
    charLength: m[2].length,
    firstLine: (m[2].trim().split(/\r?\n/)[0] || '').slice(0, 140),
  }))
  const fullPromptsChunk = /export const FULL_PROMPTS = \{([\s\S]*?)\};/.exec(ts)?.[1] || ''
  const fullPromptKeys = [...fullPromptsChunk.matchAll(/\b([A-Z0-9_]+)\b/g)].map((m) => m[1])
  return { defs, fullPromptKeys: Array.from(new Set(fullPromptKeys)) }
}

function parseVNextContracts(contractsTs, stagesTs) {
  const orderChunk = /export const VNEXT_STAGE_ORDER = \[([\s\S]*?)\] as const/.exec(contractsTs)?.[1] || ''
  const stageOrder = [...orderChunk.matchAll(/'([^']+)'/g)].map((m) => m[1])
  const meta = {}
  const metaChunk = /export const VNEXT_STAGE_META:[\s\S]*?= \{([\s\S]*?)\}\n\nexport const VNEXT_STAGE_SKILLS/.exec(stagesTs)?.[1] || ''
  for (const m of metaChunk.matchAll(/(\w+):\s*\{\s*titleEn:\s*'([^']+)',\s*titleHe:\s*'([^']+)'\s*\}/g)) {
    meta[m[1]] = { titleEn: m[2], titleHe: m[3] }
  }
  const skillMap = {}
  const skillChunk = /export const VNEXT_STAGE_SKILLS:[\s\S]*?= \{([\s\S]*?)\}\n\nexport function/.exec(stagesTs)?.[1] || ''
  for (const m of skillChunk.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    skillMap[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
  return { stageOrder, stageMeta: meta, stageSkills: skillMap }
}

function parseRoutes(pageInventory) {
  const pages = Array.isArray(pageInventory.pages) ? pageInventory.pages : []
  return pages.filter((p) => !String(p.route || '').includes('/flow-agent'))
}

function parseSdkEndpoints(endpointCatalog) {
  const endpoints = Array.isArray(endpointCatalog.endpoints) ? endpointCatalog.endpoints : []
  return endpoints.filter((e) => {
    const f = String(e.file || '').replace(/\\/g, '/')
    if (!f.startsWith('convex/sdk')) return false
    if (f.startsWith('convex/sdk/vnext') || f.startsWith('convex/sdk/')) return true
    return false
  })
}

function summarizeSdkTables(schemaInventory) {
  const tables = Array.isArray(schemaInventory.tables) ? schemaInventory.tables : []
  const keyNames = [
    'projects','elements','tasks','materialLines','workLines','quotes','runbooks','qaPairs','agentConversations','agentMessages','sdkRuns','sdkRunEvents','changeSets','featureFlags',
  ]
  const core = tables.filter((t) => keyNames.includes(t.tableName))
  return { totalTableCount: schemaInventory.tableCount || tables.length, coreTables: core }
}

function mdList(items) {
  return items.map((x) => `- ${x}`).join('\n')
}

async function ensureDirs() {
  await fs.mkdir(appendicesDir, { recursive: true })
  await fs.mkdir(snapshotsDir, { recursive: true })
}

async function write(rel, content) {
  const target = path.join(outDir, rel)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf8')
}

async function main() {
  await ensureDirs()

  const [
    registryTs,
    schemasTs,
    promptsTs,
    contractsTs,
    stagesTs,
    pipelineTs,
    runnerTs,
    dispatchTs,
    telemetryTs,
    apiTs,
    schemaInventoryRaw,
    endpointCatalogRaw,
    pageInventoryRaw,
    schemaTs,
    gitHash,
  ] = await Promise.all([
    read('convex/sdk/registry.ts'),
    read('convex/sdk/schemas.ts'),
    read('convex/sdk/prompts.ts'),
    read('convex/sdk/vnext/contracts.ts'),
    read('convex/sdk/vnext/stages.ts'),
    read('convex/sdk/vnext/pipeline.ts'),
    read('convex/sdk/runner.ts'),
    read('convex/sdk/dispatch.ts'),
    read('convex/sdk/telemetry.ts'),
    read('convex/sdk/api.ts'),
    read('logs/schema_inventory.json'),
    read('logs/convex_endpoint_catalog.json'),
    read('logs/page_inventory.json'),
    read('convex/schema.ts'),
    read('.git/refs/heads/main').catch(() => Promise.resolve('unknown')),
  ])

  const schemaInventory = JSON.parse(schemaInventoryRaw)
  const endpointCatalog = JSON.parse(endpointCatalogRaw)
  const pageInventory = JSON.parse(pageInventoryRaw)

  const registry = parseRegistry(registryTs)
  const schemaNames = parseSchemaNames(schemasTs)
  const promptParsed = parsePromptDefs(promptsTs)
  const vnext = parseVNextContracts(contractsTs, stagesTs)
  const routes = parseRoutes(pageInventory)
  const sdkEndpoints = parseSdkEndpoints(endpointCatalog)
  const tablesSummary = summarizeSdkTables(schemaInventory)

  const promptByConst = Object.fromEntries(promptParsed.defs.map((d) => [d.name, d]))

  const sdkRegistrySnapshot = {
    generatedAt: now,
    source: 'convex/sdk/registry.ts',
    total: registry.length,
    tools: registry,
  }

  const sdkSchemasSnapshot = {
    generatedAt: now,
    source: 'convex/sdk/schemas.ts',
    total: schemaNames.length,
    schemaNames,
    missingRegistryBindings: registry.map((r) => r.schemaName).filter((s) => s && !schemaNames.includes(s)),
  }

  const sdkPromptsSnapshot = {
    generatedAt: now,
    source: 'convex/sdk/prompts.ts',
    totalDefinitions: promptParsed.defs.length,
    exportedInFullPrompts: promptParsed.fullPromptKeys,
    definitions: promptParsed.defs,
  }

  const skillsRegistrySnapshot = {
    generatedAt: now,
    included: false,
    reason: 'Excluded per user scope: only current SDK agent, no legacy skills/flow agents.',
    source: 'convex/skills/registry.ts',
  }

  const skillsPromptsSnapshot = {
    generatedAt: now,
    included: false,
    reason: 'Excluded per user scope: only current SDK agent, no legacy skills/flow agents.',
    source: 'convex/skills/prompts.ts',
  }

  const flowGraphsSnapshot = {
    generatedAt: now,
    scope: 'sdk.vnext only',
    excluded: ['convex/flow/*', 'src/app/projects/[id]/flow-agent/*'],
    stageOrder: vnext.stageOrder,
    stageSkills: vnext.stageSkills,
    edges: vnext.stageOrder.slice(0, -1).map((from, i) => ({ from, to: vnext.stageOrder[i + 1] })),
  }

  const vnextContractsSnapshot = {
    generatedAt: now,
    source: 'convex/sdk/vnext/contracts.ts',
    stageOrder: vnext.stageOrder,
    stageMeta: vnext.stageMeta,
    contractTypes: [
      'QuestionBlock',
      'GateIssue',
      'GateResult',
      'TargetPlanSpec',
      'PlannedTask',
      'StageArtifactMap',
      'VNextStageRunOutput',
      'VNextStageProgressMeta',
    ],
  }

  await write('snapshots/schema_inventory.json', schemaInventoryRaw)
  await write('snapshots/convex_endpoint_catalog.json', endpointCatalogRaw)
  await write('snapshots/page_inventory.json', pageInventoryRaw)
  await write('snapshots/sdk_registry.snapshot.json', JSON.stringify(sdkRegistrySnapshot, null, 2))
  await write('snapshots/sdk_schemas.snapshot.json', JSON.stringify(sdkSchemasSnapshot, null, 2))
  await write('snapshots/sdk_prompts.snapshot.json', JSON.stringify(sdkPromptsSnapshot, null, 2))
  await write('snapshots/skills_registry.snapshot.json', JSON.stringify(skillsRegistrySnapshot, null, 2))
  await write('snapshots/skills_prompts.snapshot.json', JSON.stringify(skillsPromptsSnapshot, null, 2))
  await write('snapshots/flow_graphs.snapshot.json', JSON.stringify(flowGraphsSnapshot, null, 2))
  await write('snapshots/vnext_contracts.snapshot.json', JSON.stringify(vnextContractsSnapshot, null, 2))

  const markdownFiles = {
    'README.md': `# StudioAgent Full-System Spec Package\n\nGenerated: ${now}\nCommit: ${(gitHash || 'unknown').trim()}\n\nScope: Current SDK agent stack only. Legacy agent stacks and flow-agent runtime are explicitly excluded from active architecture documentation.\n\n## Contents\n- Human-readable specs in numeric order (00-16)\n- Appendices (source map, glossary, known gaps)\n- Deterministic snapshots under \`snapshots/\`\n\n## Regeneration\n1. Re-run the package builder script used for this deliverable.\n2. Verify counts in \`manifest.json\` and snapshots.\n3. Reconcile any source deltas in \`convex/sdk/*\`, \`convex/schema.ts\`, and \`src/app\`.\n`,

    '00_System_Overview.md': `# 00 System Overview\n\n## Mission\nStudioAgent processes free-text project requests into executable studio outputs through SDK orchestration and approval-gated writes.\n\n## Lifecycle\n1. Intake\n2. Planning\n3. Costing\n4. Quote\n5. Operations\n6. Finalize/compile\n\n## Subsystems\n- Frontend entry: \`src/app/projects/[id]/sdk-agent/page.tsx\`\n- Conversation UI: \`src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx\`\n- Stream path: \`src/app/api/chat/stream/route.ts\`\n- SDK runtime: \`convex/sdk/dispatch.ts\`, \`convex/sdk/runner.ts\`\n- Registry/contracts: \`convex/sdk/registry.ts\`, \`convex/sdk/schemas.ts\`, \`convex/sdk/vnext/contracts.ts\`\n- Data model: \`convex/schema.ts\`\n\n## Explicit Exclusions\n- Legacy agent stack: \`convex/agent.ts\`, \`convex/skills/*\`\n- Legacy flow-agent stack: \`convex/flow/*\`, \`src/app/projects/[id]/flow-agent/*\`\n`,

    '01_Runtime_Architecture.md': `# 01 Runtime Architecture\n\n## Topology\n- Next.js App Router UI calls Convex queries/mutations/actions.\n- SDK Orchestrator delegates to registry tools/agents with schema validation and telemetry logging.\n- DB writes are mediated through ChangeSet compile/review/apply flows.\n\n## Main Path\n\n\`\`\`mermaid\nsequenceDiagram\n  participant U as User\n  participant UI as sdk-agent UI\n  participant API as /api/chat/stream\n  participant C as Convex sdk.dispatch\n  participant R as sdk.runner\n  participant DB as Convex DB\n  U->>UI: Free text\n  UI->>API: POST stream\n  API->>C: submit/run turn\n  C->>R: runTool/runAgent\n  R->>DB: context.get + telemetry\n  R-->>C: structured result\n  C-->>API: assistant output\n  API-->>UI: SSE token/done\n\`\`\`\n\n## Control Points\n- Tool allowlist by registry \`allowedTools\`.\n- Output schema validation via \`validateSdkOutput\`.\n- Apply gated by approval token path.\n`,

    '02_App_Routes_and_User_Flows.md': `# 02 App Routes and User Flows\n\nTotal app pages in baseline inventory: ${pageInventory.count}.\nSDK-scoped page set (excluding flow-agent route): ${routes.length}.\n\n## Primary SDK Routes\n- \`/projects/[id]/sdk-agent\`: main SDK agent workspace with planning+agent tabs.\n- \`/api/chat/stream\`: streaming chat endpoint for CHAT_EDIT mode.\n\n## Route Dependencies (SDK core)\n- \`/projects/[id]/sdk-agent\` uses \`projects.resolveProjectId\`, \`featureFlags.getAll\`, \`sdk.api.*\`\n- Agent tab orchestrates \`sdk.dispatch.runNext\`, \`sdk.api.startRun\`, \`sdk.api.listRuns\`, \`sdk.api.listMessages\`, \`changeSets.*\`\n\n## Flow Summary\n1. Resolve project + feature flags\n2. Open/create conversation\n3. Start SDK run\n4. Send user turn\n5. Receive streamed output / blocks\n6. Optional approval and apply\n`,

    '03_Agent_Stacks_Comparison.md': `# 03 Agent Stacks Comparison\n\n## Active Stack\n- SDK agent stack only: \`convex/sdk/*\` and \`convex/sdk/vnext/*\`.\n\n## Excluded Stacks\n- Legacy skills stack \`convex/skills/*\`\n- Legacy flow-agent stack \`convex/flow/*\`\n- Legacy single agent \`convex/agent.ts\`\n\n## Migration Posture\n- Documentation and snapshots in this package treat SDK as single source of orchestration truth.\n- Legacy stacks are treated as out-of-scope and non-authoritative for this package.\n`,

    '04_Orchestrator_Design_Current.md': `# 04 Orchestrator Design Current\n\n## Runtime Core\n- Registry entry: \`orchestrator\` in \`convex/sdk/registry.ts\`.\n- Model: \`gpt-5.2\` (registry-defined).\n- Allowed tools count: ${(registry.find((r) => r.id === 'orchestrator')?.allowedTools || []).length}.\n\n## Policy\n- Delegation-first tool policy with explicit allowlist.\n- ChangeSet write wall: no direct DB writes from orchestration output.\n- Approval before apply.\n\n## Modes\n- \`PLANNING_FLOW\`\n- \`CHAT_EDIT\`\n\n## Enforcement Surfaces\n- \`convex/sdk/dispatch.ts\` (turn policy and mode routing)\n- \`convex/sdk/runner.ts\` (tool loop, validation, tracing)\n- \`convex/sdk/schemas.ts\` (output contracts)\n`,

    '05_Orchestrator_Design_Target_SmartEngine.md': `# 05 Orchestrator Design Target SmartEngine\n\n## Target Contract\nA free-text smart orchestrator that chooses minimal-context actions, executes deterministic stage progression, and returns approval-safe deltas.\n\n## Proposed Runtime Shape\n1. Intent router\n2. Stage manager (vnext stage order)\n3. Skill/tool delegator\n4. Contract validator\n5. ChangeSet planner\n6. Approval gate\n\n## Memory Strategy\n- Primary: project context packs via \`context.get\`\n- Secondary: knowledge doc update path\n- Event-based telemetry for replay/debug\n\n## Fallback Logic\n- Schema fail -> retry with constrained prompt\n- No progress guard -> question block\n- Missing approval -> hold in awaiting_approval\n`,

    '06_Data_Model_Full.md': `# 06 Data Model Full\n\nTotal tables in source inventory: ${tablesSummary.totalTableCount}.\n\n## Core SDK-Related Tables\n${tablesSummary.coreTables.map((t) => `- ${t.tableName}: fields=${Array.isArray(t.fields) ? t.fields.length : 0}, indexes=${Array.isArray(t.indexes) ? t.indexes.length : 0}`).join('\n')}\n\n## Core Relationships\n- \`agentConversations.projectId -> projects\`\n- \`agentMessages.conversationId -> agentConversations\`\n- \`agentMessages.runId -> sdkRuns\`\n- \`sdkRuns.projectId -> projects\`\n- \`sdkRuns.conversationId -> agentConversations\`\n- \`sdkRunEvents.runId -> sdkRuns\`\n- \`changeSets.projectId -> projects\`\n- \`elements.projectId -> projects\`, \`tasks.projectId -> projects\`, accounting lines -> project/task/element\n\n## Snapshot Authority\n- Full structural details are in \`snapshots/schema_inventory.json\`.\n`,

    '07_Convex_Endpoints_Catalog.md': `# 07 Convex Endpoints Catalog\n\nBaseline endpoints in inventory: ${endpointCatalog.count}.\nSDK-scoped endpoints (convex/sdk*): ${sdkEndpoints.length}.\n\n## SDK Modules\n- \`convex/sdk/api.ts\`\n- \`convex/sdk/dispatch.ts\`\n- \`convex/sdk/runner.ts\`\n- \`convex/sdk/changeset.ts\`\n- \`convex/sdk/telemetry.ts\`\n- \`convex/sdk/vnext/*\`\n\n## Side-Effect Classes\n- Read: context/list/get queries\n- Propose: compile/review style actions\n- Commit: apply mutations gated by approval\n- Observe: telemetry event writes\n\n## Catalog Source\n- Full baseline: \`snapshots/convex_endpoint_catalog.json\`\n`,

    '08_SDK_Registry_and_Tooling.md': `# 08 SDK Registry and Tooling\n\nTool definitions discovered: ${registry.length}.\n\n## Kinds\n- Agents: ${registry.filter((r) => r.kind === 'agent').length}\n- Tools: ${registry.filter((r) => r.kind === 'tool').length}\n\n## Registry Coverage\n- Every registry item defines: id, kind, systemPrompt, description, model, schemaName.\n- Schema names cross-checked with \`SDK_SCHEMAS\`.\n\n## Tool Loop Behavior\n- Runner builds OpenAI tool descriptors from allowlist.\n- Max loop count constrained (\`MAX_TOOL_LOOPS\`).\n- Tool outputs post-processed and validated before return.\n`,

    '09_Skills_Registry_and_Gating.md': `# 09 Skills Registry and Gating\n\nThis package is SDK-only by request. Legacy skills registry is not treated as active runtime.\n\n## Status\n- \`convex/skills/*\`: excluded from active architecture.\n- Snapshot files remain present with exclusion metadata for package completeness.\n\n## Active Gating Surfaces (SDK)\n- Stage progression in \`convex/sdk/vnext/pipeline.ts\`\n- Stage skill map in \`convex/sdk/vnext/stages.ts\`\n- Run status and approval gating in \`convex/sdk/telemetry.ts\` and \`convex/sdk/dispatch.ts\`\n`,

    '10_Prompts_Reference.md': `# 10 Prompts Reference\n\nPrompt definitions found: ${promptParsed.defs.length}.\nExported in \`FULL_PROMPTS\`: ${promptParsed.fullPromptKeys.length}.\n\n## Prompt to Registry Mapping\n- Registry entries bind \`systemPrompt\` constants from \`FULL_PROMPTS\`.\n- Output contract binding is controlled by each entry \`schemaName\`.\n\n## Safety and Language Constraints\n- JSON-only contracts for tool outputs where required.\n- Hebrew-first guidance and explicit tool-selection constraints appear in orchestrator and specialist prompts.\n\n## Snapshot Authority\n- \`snapshots/sdk_prompts.snapshot.json\`\n`,

    '11_Flow_Pipelines_and_Gates.md': `# 11 Flow Pipelines and Gates\n\n## Scope\nOnly SDK vnext pipeline is documented. Legacy \`convex/flow/*\` is excluded.\n\n## Stage Order\n${mdList(vnext.stageOrder.map((s, i) => `${i + 1}. ${s}`))}\n\n## Stage Dependencies\n${mdList(vnext.stageOrder.slice(0, -1).map((s, i) => `${s} -> ${vnext.stageOrder[i + 1]}`))}\n\n## Stage Skill Bindings\n${mdList(Object.entries(vnext.stageSkills).map(([k, v]) => `${k}: ${(v || []).join(', ') || '(none)'}`))}\n\n## Gate Model\n- Each stage validates artifact readiness before advancing.\n- Blocking issues produce question blocks and pause progression.\n`,

    '12_ChangeSet_and_Approval_Model.md': `# 12 ChangeSet and Approval Model\n\n## Lifecycle\n1. Compile intents into ChangeSet\n2. Review (optional/explicit)\n3. Await user approval token\n4. Apply\n\n## Controls\n- Write wall enforced in orchestration policy.\n- Approval token fields tracked on \`sdkRuns\`.\n- Pending ChangeSet linkage on run state.\n\n## Key Sources\n- \`convex/sdk/changeset.ts\`\n- \`convex/sdk/dispatch.ts\`\n- \`convex/sdk/telemetry.ts\`\n`,

    '13_Observability_and_Run_Telemetry.md': `# 13 Observability and Run Telemetry\n\n## Primary Tables\n- \`sdkRuns\`: run state, stage, status, progress counters, approval metadata\n- \`sdkRunEvents\`: event timeline payloads\n\n## Event Surfaces\n- runner loop snapshots\n- stream turn persistence\n- knowledge update completion\n- changeset compile summaries\n\n## Debug Paths\n- Query run messages and events per run\n- Reconstruct stage history from artifacts/events\n`,

    '14_Security_Secrets_and_Config.md': `# 14 Security, Secrets, and Config\n\n## Secret Inputs\n- \`.env.local\` for runtime keys (OpenAI, Convex URL).\n- No secrets should be embedded in specs/snapshots.\n\n## Logging Rules\n- Capture structural telemetry, avoid secret payload logging.\n- Keep approval tokens and sensitive strings out of user-facing traces.\n\n## Runtime Flags\n- Feature flags gate SDK tabs/streaming behaviors.\n`,

    '15_Implementation_Blueprint_Smart_Agent.md': `# 15 Implementation Blueprint Smart Agent\n\n## Build Sequence\n1. Lock registry/schema parity checks in CI\n2. Harden stage manager around vnext contracts\n3. Standardize intent router in dispatch\n4. Add deterministic fallback for compile/review\n5. Expand telemetry taxonomy and replay tooling\n\n## Interfaces\n- Registry contract: \`ToolDefinition\`\n- Schema contract: \`SDK_SCHEMAS\` map\n- Stage contract: \`VNextStageRunOutput\` and gate result types\n\n## Rollout Controls\n- Feature flags for chat stream, blocks v2, sdk tab\n- Dark launch with telemetry-only stage decisions before enforcing\n`,

    '16_Acceptance_Criteria_and_Test_Scenarios.md': `# 16 Acceptance Criteria and Test Scenarios\n\n## Package Completeness\n- 17 core markdown files exist (00-16 plus README).\n- 10 snapshot files exist under \`snapshots/\`.\n\n## Traceability Checks\n- Registry tool count matches snapshot total (${registry.length}).\n- Each registry \`schemaName\` resolves in schema snapshot.\n- Stage order in docs equals vnext contract order.\n\n## Scope Guard Checks\n- Docs state SDK-only scope.\n- Legacy flow-agent and legacy skills are excluded from active architecture sections.\n`,

    'appendices/A_Source_of_Truth_Map.md': `# Appendix A Source of Truth Map\n\n- Schema: \`convex/schema.ts\` + \`logs/schema_inventory.json\`\n- SDK Registry: \`convex/sdk/registry.ts\`\n- SDK Schemas: \`convex/sdk/schemas.ts\`\n- SDK Prompts: \`convex/sdk/prompts.ts\`\n- SDK Runtime: \`convex/sdk/dispatch.ts\`, \`convex/sdk/runner.ts\`, \`convex/sdk/api.ts\`, \`convex/sdk/telemetry.ts\`\n- SDK vnext: \`convex/sdk/vnext/contracts.ts\`, \`convex/sdk/vnext/pipeline.ts\`, \`convex/sdk/vnext/stages.ts\`\n- Routes inventory: \`logs/page_inventory.json\`\n- Endpoint inventory: \`logs/convex_endpoint_catalog.json\`\n`,

    'appendices/B_Glossary.md': `# Appendix B Glossary\n\n- SDK Agent: current orchestrator runtime in \`convex/sdk/*\`.\n- VNext Stage: deterministic planning stage in \`convex/sdk/vnext/*\`.\n- ChangeSet: approval-gated mutation bundle.\n- Run: one execution instance in \`sdkRuns\`.\n- Run Event: append-only telemetry record in \`sdkRunEvents\`.\n`,

    'appendices/C_Known_Gaps_and_Debt.md': `# Appendix C Known Gaps and Debt\n\n- Prompt file has mixed/encoded non-ASCII artifacts requiring normalization pass.\n- Endpoint baseline catalog is global; SDK-focused extracted view should be generated in future automation.\n- Legacy stacks still exist in repo and can cause conceptual drift if not explicitly ignored in future docs.\n`,

    '03_Agent_Stacks_Comparison.md': `# 03 Agent Stacks Comparison\n\n## Active\n- \`convex/sdk/*\` and \`convex/sdk/vnext/*\` are the only active orchestration source in this package.\n\n## Not Recorded as Active\n- \`convex/agent.ts\`\n- \`convex/skills/*\`\n- \`convex/flow/*\` and \`src/app/projects/[id]/flow-agent/*\`\n\n## Risk Note\nThe excluded stacks still exist in codebase, so accidental coupling remains possible unless enforced by lint/build guards.\n`,

    '04_Orchestrator_Design_Current.md': `# 04 Orchestrator Design Current\n\n## Current SDK Orchestrator\n- Registry id: \`orchestrator\`\n- Runtime: \`convex/sdk/dispatch.ts\` + \`convex/sdk/runner.ts\`\n- Contract: \`orchestrator.response\`\n\n## Allowed Tool Surface\n${mdList((registry.find((r) => r.id === 'orchestrator')?.allowedTools || []).map((x) => `\`${x}\``))}\n\n## Guarantees\n- No direct DB writes from model output\n- Schema validation before acceptance\n- Explicit approval required prior to apply\n`,
  }

  for (const [file, content] of Object.entries(markdownFiles)) {
    await write(file, content)
  }

  const requiredCore = [
    'README.md','00_System_Overview.md','01_Runtime_Architecture.md','02_App_Routes_and_User_Flows.md','03_Agent_Stacks_Comparison.md','04_Orchestrator_Design_Current.md','05_Orchestrator_Design_Target_SmartEngine.md','06_Data_Model_Full.md','07_Convex_Endpoints_Catalog.md','08_SDK_Registry_and_Tooling.md','09_Skills_Registry_and_Gating.md','10_Prompts_Reference.md','11_Flow_Pipelines_and_Gates.md','12_ChangeSet_and_Approval_Model.md','13_Observability_and_Run_Telemetry.md','14_Security_Secrets_and_Config.md','15_Implementation_Blueprint_Smart_Agent.md','16_Acceptance_Criteria_and_Test_Scenarios.md','appendices/A_Source_of_Truth_Map.md','appendices/B_Glossary.md','appendices/C_Known_Gaps_and_Debt.md',
  ]

  const snapshotFiles = [
    'snapshots/schema_inventory.json','snapshots/convex_endpoint_catalog.json','snapshots/page_inventory.json','snapshots/sdk_registry.snapshot.json','snapshots/sdk_schemas.snapshot.json','snapshots/sdk_prompts.snapshot.json','snapshots/skills_registry.snapshot.json','snapshots/skills_prompts.snapshot.json','snapshots/flow_graphs.snapshot.json','snapshots/vnext_contracts.snapshot.json',
  ]

  const allFiles = [...requiredCore, ...snapshotFiles]
  const fileEntries = []
  for (const rel of allFiles) {
    const abs = path.join(outDir, rel)
    const text = await fs.readFile(abs)
    fileEntries.push({
      path: rel,
      bytes: text.byteLength,
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
    })
  }

  const manifest = {
    package: 'StudioAgent_FullSpec',
    version: '1.0.0',
    generatedAt: now,
    scope: {
      active: ['convex/sdk/*', 'convex/sdk/vnext/*', 'convex/schema.ts', 'src/app/projects/[id]/sdk-agent/*', 'src/app/api/chat/stream/route.ts'],
      excluded: ['convex/agent.ts', 'convex/skills/*', 'convex/flow/*', 'src/app/projects/[id]/flow-agent/*'],
    },
    commit: (gitHash || 'unknown').trim(),
    sourceFiles: [
      'convex/schema.ts','convex/sdk/registry.ts','convex/sdk/schemas.ts','convex/sdk/prompts.ts','convex/sdk/runner.ts','convex/sdk/dispatch.ts','convex/sdk/api.ts','convex/sdk/telemetry.ts','convex/sdk/vnext/contracts.ts','convex/sdk/vnext/pipeline.ts','convex/sdk/vnext/stages.ts','src/app/projects/[id]/sdk-agent/page.tsx','src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx','src/app/api/chat/stream/route.ts','logs/schema_inventory.json','logs/convex_endpoint_catalog.json','logs/page_inventory.json',
    ],
    files: fileEntries,
    checks: {
      registryCount: registry.length,
      schemaCount: schemaNames.length,
      promptCount: promptParsed.defs.length,
      vnextStageCount: vnext.stageOrder.length,
      endpointCountSdkOnly: sdkEndpoints.length,
      tableCount: tablesSummary.totalTableCount,
    },
  }

  await write('manifest.json', JSON.stringify(manifest, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
