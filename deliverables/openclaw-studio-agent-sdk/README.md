# OpenClaw Studio Agent SDK Package

This package adds a Telegram-first OpenClaw assistant that uses the Studio `sdk-agent` stack only.

It does not depend on the current Next.js UI and it does not route through legacy `/agent` or `/flow-agent` behavior.

It is intentionally studio-specific. The package includes the operating model, prompt discipline, and domain references needed for Emi Studio work, not just a generic project-management shell.

## What is included

- OpenClaw config template for one Telegram-facing assistant
- `SOUL.md`, `MEMORY.md`, and durable memory/process files
- Local OpenClaw skills for project switch, free chat, planning, clarifications, approvals, research, and knowledge refresh
- A standalone Node bridge that talks directly to Convex
- Conservative ChangeSet auto-approval policy
- Prompt files under `prompts/`
- Studio reference files under `references/`

## Install

1. Copy this folder into your OpenClaw workspace.
2. Run `npm install` inside this folder.
3. Copy `.env.example` to `.env` and fill the required values.
4. Merge [`openclaw/openclaw.studio-agent.example.json5`](/C:/Users/elira/Dev/StudioAgent/deliverables/openclaw-studio-agent-sdk/openclaw/openclaw.studio-agent.example.json5) into your OpenClaw config or include it from your main config.
5. Verify the bridge locally:

```bash
npm run check
node ./bridge/studio-bridge.mjs meta.contracts
```

## Runtime model

- Default mode: free chat
- Planning mode: entered only after explicit confirmation in chat
- Sticky project: stored per session key in `.state/session-store.json`
- Approval policy: only low-risk patch-only ChangeSets can auto-apply

## Studio scope encoded in the package

The package is built around the current SDK-agent worldview:

- `Elements -> Tasks -> Accounting -> Quote -> Procurement -> Install -> Teardown`
- Hebrew-first chat output
- project types such as `studio_build`, `printing`, `install`, `teardown`, `procurement`, `design`
- studio-real task sizing and accounting linkage
- procurement, print QA, runbook, and execution support
- compact Telegram clarification, not large forms

## Main entrypoints

- Bridge CLI: `node ./bridge/studio-bridge.mjs <operation> '<json-payload>'`
- Contracts: [`docs/contracts.md`](/C:/Users/elira/Dev/StudioAgent/deliverables/openclaw-studio-agent-sdk/docs/contracts.md)
- Architecture: [`docs/architecture.md`](/C:/Users/elira/Dev/StudioAgent/deliverables/openclaw-studio-agent-sdk/docs/architecture.md)
