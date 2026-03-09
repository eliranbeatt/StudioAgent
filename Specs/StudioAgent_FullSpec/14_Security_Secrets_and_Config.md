# 14 — Security, Secrets, and Config

## Authentication & Authorization

- **Convex Auth**: Built-in Convex authentication
- **No API Key Exposure**: OpenAI API keys stored as Convex environment variables, never sent to frontend
- **Run Isolation**: Each run is scoped to a project via `projectId`

## Secrets Management

| Secret | Location | Purpose |
|--------|----------|---------|
| `OPENAI_API_KEY` | Convex env vars | LLM API access |
| `CONVEX_DEPLOYMENT` | `.env.local` | Deployment URL |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Public Convex URL for frontend |

## Configuration Points

| Config | Source | Purpose |
|--------|--------|---------|
| `MAX_TOOL_LOOPS` | `runner.ts` (const = 6) | Max iterative tool calls per run |
| `MAX_FILE_TEXT_SNIPPET_CHARS` | `knowledge.ts` (const = 3500) | Per-file text limit for knowledge grounding |
| `MAX_TOTAL_FILE_TEXT_CHARS` | `knowledge.ts` (const = 70000) | Total text budget for knowledge grounding |
| `MAX_FILES_IN_PROMPT` | `knowledge.ts` (const = 80) | Max files to include in knowledge prompt |
| `MAX_FACTS_PER_FILE` | `knowledge.ts` (const = 16) | Max extracted facts per file |
| `MAX_ENTITIES_PER_FILE` | `knowledge.ts` (const = 20) | Max extracted entities per file |
| Model per tool | `REGISTRY` entries | Model selection per tool |
| Skills `isEnabled` | `SKILL_CATALOG` entries | Enable/disable individual skills |
| `llmParams` per skill | `SKILL_CATALOG` entries | Temperature, max_tokens, reasoning_effort |

## Data Safety

### ChangeSet Gate
All data mutations go through the ChangeSet approval pipeline:
1. Agent proposes changes
2. Changes are compiled into structured ops
3. User reviews and explicitly approves
4. Only then are changes applied to the database

### Input Validation
- `assertAsciiKeys()`: Prevents Hebrew/Unicode in JSON keys (injection defense)
- `validateSdkOutput()`: Zod schema validation on every tool output
- `postProcessToolOutput()`: Additional sanitization

### Language Safety
- All JSON keys forced to ASCII English
- Hebrew values expected in human-facing fields only
- No raw user input passed directly to DB mutations

## Environment Setup

```bash
# Required environment variables
CONVEX_DEPLOYMENT=<deployment-url>
NEXT_PUBLIC_CONVEX_URL=<public-convex-url>
# OpenAI key set via Convex dashboard (not in .env)
```
