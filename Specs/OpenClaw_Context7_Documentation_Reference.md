# OpenClaw Documentation Reference

Compiled on March 9, 2026 from Context7 MCP-backed documentation pulls.

Primary Context7 library:
- `/openclaw/openclaw` - verified, last updated 2026-03-06, 5,992 snippets, trust score 7.8

Supplemental Context7 libraries:
- `/openclaw/openclaw.ai` - installer and landing-page material
- `/websites/clawdocs` - high-level product framing

This document is a synthesized reference, not a verbatim dump. It is organized to help with evaluation, implementation planning, and future comparisons with this repo's own agent stack.

## What OpenClaw Is

OpenClaw is documented as a self-hosted, personal AI assistant and autonomous agent platform that runs continuously on user-controlled infrastructure. The core product shape is:

- an always-on Gateway process
- control-plane clients such as CLI, desktop app, web UI, or other frontends
- one or more agents configured behind that gateway
- optional nodes and device-side capabilities connected over the same protocol
- multi-channel messaging integrations such as WhatsApp, Telegram, Discord, Slack, Gmail hooks, Google Chat, Mattermost, Signal, BlueBubbles, and legacy iMessage paths
- model-provider abstraction, tool policies, skills, memory, and sandboxing

The recurring architectural promise across the docs is that OpenClaw keeps the trust boundary with the user by running locally or on user-owned infrastructure, while exposing agents through familiar messaging surfaces.

## Freshness And Source Selection

I resolved the library through Context7 search and chose `/openclaw/openclaw` because it was the top verified match and had by far the deepest documentation coverage. Supplemental pulls from the site libraries were used only where the repo docs were thin or marketing/install framing was useful.

Key source families pulled through Context7:

- `docs/concepts/*` for architecture, models, memory, multi-agent behavior
- `docs/cli/*` and `docs/cli/index.md` for operator commands
- `docs/gateway/*` for configuration, security, and sandboxing
- `docs/install/*` for installer and deployment guidance
- `docs/channels/*` and related references for integrations
- `docs/tools/*` for skills, ClawHub, diffs, multi-agent sandbox tools
- `docs/help/faq.md` and `docs/help/testing.md` for common setup patterns
- `docs/pi.md` for SDK and local TUI integration notes

## Mental Model

The cleanest way to understand OpenClaw is as a message-driven agent runtime centered on a single long-lived gateway.

Core roles:

- Gateway: the durable server process that owns channel connections, state transitions, HTTP surfaces, and the WebSocket control plane
- Control-plane clients: CLI, desktop app, web UI, or automation clients that connect to the gateway and issue requests
- Nodes: secondary devices or runtimes that connect with `role: node` and expose device capabilities
- Agents: configured personas/runtimes with their own model defaults, tools, workspaces, memory settings, and sandbox policy
- Skills and plugins: extension surfaces for new capabilities, prompts, or integrations

The docs emphasize these invariants:

- exactly one gateway per host manages a single WhatsApp session
- clients must perform a handshake on connect
- events are pushed over WebSocket and are not replayed automatically
- clients must refresh state if they detect gaps

## Runtime Architecture

According to `docs/concepts/architecture.md`, the Gateway is the center of the system. It exposes:

- a typed WebSocket API for control-plane clients and nodes
- HTTP-served UI surfaces such as canvas endpoints under `/__openclaw__/canvas/` and `/__openclaw__/a2ui/`
- channel adapters for external messaging systems
- validation and event emission for requests and state changes

The documented default local control-plane address is:

- `127.0.0.1:18789` over WebSocket

The docs also preserve a legacy "Bridge protocol" reference:

- legacy TCP + JSONL node transport on port `18790`
- explicitly marked as historical
- current builds do not ship the TCP bridge listener
- current node clients should use the unified Gateway WebSocket protocol instead

That distinction matters because some older community material still references `bridge.*` settings, but the current official docs say those keys are no longer supported.

## Gateway Protocol

The Gateway protocol uses three frame types over WebSocket:

- request: `{ type: "req", id, method, params }`
- response: `{ type: "res", id, ok, payload | error }`
- event: `{ type: "event", event, payload, seq?, stateVersion? }`

The required connect flow is:

1. client sends `connect`
2. server returns `hello-ok`
3. client proceeds with method calls and event subscriptions

This makes OpenClaw feel closer to a typed local control plane than a simple chatbot server. The gateway is the real operating surface; the chat channels are just entry points.

## Installation Paths

OpenClaw supports multiple installation patterns.

### Installer Script

The canonical quickstart path is the hosted installer:

```bash
curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash
```

Documented installer variants include:

- non-interactive install with `OPENCLAW_NO_PROMPT=1`
- forced Git install with `OPENCLAW_INSTALL_METHOD=git`
- skip onboarding with `--no-onboard`
- CLI-only install via `install-cli.sh`
- JSON output mode for programmatic installs

Example:

```bash
curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install-cli.sh | bash -s -- --json --prefix /opt/openclaw
```

### Local Node Runtime Installation

The docs also include a self-contained script that:

- installs a local Node.js runtime under `~/.openclaw/tools`
- ensures `git` is present
- installs the `openclaw` npm package under a private prefix
- creates a wrapper script in `~/.openclaw/bin/openclaw`

This is important because it shows OpenClaw is designed to be deployable without relying on a globally managed Node toolchain.

### Deployment Targets

Documented hosted targets include:

- Fly.io
- Render

The Fly.io docs show a stateful deployment pattern with:

- persistent volume mounted at `/data`
- `OPENCLAW_STATE_DIR=/data`
- gateway binding to LAN on internal port `3000`
- a long-lived process like `node dist/index.js gateway --allow-unconfigured --port 3000 --bind lan`

The docs also describe a private-only Fly deployment flow to avoid public exposure and rely on WireGuard or local proxy access.

## Configuration Model

OpenClaw is strongly configuration-driven. The docs show both interactive and direct config manipulation paths.

Primary CLI config commands:

```bash
openclaw config get <path>
openclaw config set <path> <value>
openclaw config unset <path>
openclaw config file
openclaw config validate
openclaw config validate --json
```

There is also a full configuration replacement RPC:

- `config.apply`
- validates the full JSON5 payload
- writes the new config
- restarts the gateway
- can use a `baseHash` for optimistic concurrency

The docs consistently use JSON5-style configuration. Common top-level areas include:

- `gateway`
- `channels`
- `agents`
- `skills`
- `plugins`
- `env`
- `tools`
- `hooks`

## Agents And Multi-Agent Operation

One of the more relevant parts for this repo is OpenClaw's multi-agent structure.

The docs show a model like:

- `agents.defaults` for shared defaults
- `agents.list` for specific agent definitions
- per-agent workspace
- per-agent sandbox settings
- per-agent tool allow/deny policies
- per-agent model defaults

Representative use cases shown in docs:

- a fully trusted personal agent with sandbox disabled
- a family-facing or restricted agent with heavy sandboxing and an extremely narrow tool allowlist
- non-main agents inheriting stricter defaults

Important nuance:

- `agents.defaults.sandbox.mode: "non-main"` is based on the session's `mainKey`, not merely the agent ID
- group or channel sessions are always treated as non-main and therefore sandboxed under that rule
- to fully disable sandboxing for a given agent, docs recommend an explicit per-agent `sandbox.mode: "off"`

This is a mature operational detail, not marketing language. It suggests the platform has already hit real policy edge cases in the field.

## Tooling And Sandbox Model

OpenClaw separates agent identity from tool policy and execution containment.

Documented sandbox controls include:

- `mode`: values such as `off`, `all`, or `non-main`
- `scope`: for example `session` or `agent`
- `workspaceAccess`
- optional Docker-based setup commands for sandbox containers

Relevant CLI:

```bash
openclaw sandbox recreate --all
openclaw sandbox recreate --session main
openclaw sandbox recreate --agent mybot
openclaw sandbox recreate --browser
openclaw sandbox recreate --all --force
```

Documented tool policy examples include:

- allow only `read`
- deny `exec`, `write`, `edit`, `apply_patch`, `process`, `browser`

This is one of the clearest signs that OpenClaw is not just a chat wrapper. It has an explicit execution-governance model for agent actions.

## Skills System

OpenClaw has a first-class skills system with local loading and registry-oriented distribution.

Primary operator commands:

```bash
openclaw skills list
openclaw skills info <name>
openclaw skills check
openclaw skills --eligible
openclaw skills --json
openclaw skills -v
```

Configuration capabilities shown in the docs:

- allow specific bundled skills
- load additional skill directories
- file watching with debounce
- installer preference for Node package manager
- per-skill enablement
- per-skill env injection
- per-skill API key binding

Representative config shape:

- `skills.allowBundled`
- `skills.load.extraDirs`
- `skills.load.watch`
- `skills.install.nodeManager`
- `skills.entries.<skillName>`

### ClawHub

The docs repeatedly point to ClawHub as the skills registry and publishing surface.

Documented commands:

```bash
clawhub install <skill-slug>
clawhub update --all
clawhub publish ./my-skill --slug my-skill --name "My Skill" --version 1.0.0 --tags latest
clawhub sync --all
```

This implies OpenClaw has a distribution ecosystem beyond the core repo, with skills intended to be discovered, installed, versioned, and synced.

## Models And Provider Abstraction

OpenClaw is built to support multiple model providers behind a normalized config layer.

Examples explicitly documented:

- OpenAI
- OpenAI Codex
- Anthropic
- OpenRouter
- Z.AI

Key patterns:

- set a default primary model
- define an allowlist of approved models in config
- optionally assign aliases
- switch models per session using slash commands

Examples shown in docs:

- `openai/gpt-5.2`
- `openai-codex/gpt-5.4`
- `anthropic/claude-sonnet-4-5`
- `anthropic/claude-opus-4-6`
- `openrouter/anthropic/claude-sonnet-4-5`
- `zai/glm-5`

Useful CLI:

```bash
openclaw models list --all --json
openclaw models list --provider openai --plain
```

Operationally, this means model choice is treated as policy and routing, not hardcoded per agent.

## Memory System

The memory docs suggest two layers:

- file-based memory, especially `MEMORY.md` and `memory/*.md`
- experimental indexed and searchable session memory

Documented CLI:

```bash
openclaw memory status
openclaw memory index
openclaw memory search "query"
openclaw memory reflect --since 7d
openclaw memory recall "..." --k 25 --since 30d
```

Notable configuration example:

```json5
agents: {
  defaults: {
    memorySearch: {
      experimental: { sessionMemory: true },
      sources: ["memory", "sessions"]
    }
  }
}
```

The docs also include examples of persistent agent memory in other storage backends used by related extensions. The most relevant product takeaway is that OpenClaw treats memory as an inspectable artifact, not a hidden opaque vector store only reachable through prompts.

## Integrations And Channels

The docs describe OpenClaw as a channel-centric agent surface. Official references mention:

- WhatsApp
- Telegram
- Discord
- Slack
- Google Chat
- Mattermost
- Signal
- BlueBubbles for iMessage workflows
- legacy iMessage mode
- Gmail hooks

Required auth and setup vary by channel:

- QR login for WhatsApp
- bot tokens for Telegram and Discord
- service account JSON plus webhook audience for Google Chat
- server URL and password for BlueBubbles
- optional local binaries or account config for Signal and legacy iMessage paths

The Gmail hook documentation shows another important pattern:

- push-driven external events
- a local hook server
- optional Tailscale funnel mode for reachability
- model and thinking settings attached to that hook flow

That implies OpenClaw is designed not only for live chat but also for asynchronous event-triggered agent work.

## Plugins

Plugins are separately configurable from skills and appear to operate closer to the gateway/runtime level.

The configuration reference shows support for:

- global plugin enablement
- allowlists and denylists
- custom plugin load paths
- per-plugin config entries
- hook-level controls such as whether prompt injection is allowed

Representative plugin features shown in docs:

- voice-call plugin
- diffs plugin with remote-viewer security settings
- Mattermost integration described as a plugin in some docs

This suggests a layered extension model:

- skills for agent capability units
- plugins for runtime or gateway-level integration and behavior

## Security Posture

Security is a major theme in the docs.

Recommended secure baseline:

- local mode
- loopback bind
- explicit token authentication
- WhatsApp DM pairing policy
- group chats requiring mention

Example baseline:

```json5
{
  gateway: {
    mode: "local",
    bind: "loopback",
    port: 18789,
    auth: { mode: "token", token: "your-long-random-token" },
  },
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } },
    },
  },
}
```

Security tooling in CLI:

```bash
openclaw security audit
openclaw security audit --deep
openclaw security audit --fix
```

Other security themes that appear in the docs:

- path sanitization to avoid traversal vulnerabilities
- strict remote-viewer controls for diff sharing
- state, credential, and session directories under `~/.openclaw`
- warnings not to publish real phone numbers, videos, or live credentials

Overall, OpenClaw's security posture is not based on one control. It layers:

- local-first deployment defaults
- auth tokens
- pairing and mention policies
- tool allowlists
- sandboxing
- private-state directories
- security auditing commands

## CLI Surface

The CLI appears to be a serious operator interface rather than an afterthought.

High-value command families documented in Context7:

- `openclaw config ...`
- `openclaw models ...`
- `openclaw memory ...`
- `openclaw skills ...`
- `openclaw sandbox ...`
- `openclaw security ...`

This matters because it means most runtime behaviors can be inspected, validated, and changed without editing random files by hand.

## Product Capabilities That Stand Out

From the combined docs, the most distinctive parts of OpenClaw are:

- always-on gateway model instead of one-shot agent execution
- messaging-first distribution across consumer and team channels
- multi-agent configuration with policy isolation
- explicit sandbox and tool governance
- skills plus registry distribution via ClawHub
- local-first memory and state ownership
- deployment options that range from local machine to persistent cloud VM
- async hooks and event-driven workflows in addition to live chat

If you compare this to many OSS agent projects, OpenClaw looks less like a benchmark runner and more like an opinionated personal-agent operating system.

## Likely Internal Component Boundaries

Based on the docs, a practical internal decomposition looks like this:

- channel adapters: ingress and egress for messaging platforms
- gateway protocol server: request handling, eventing, client/node connections
- agent runtime: prompt execution, model routing, tool dispatch
- policy layer: model allowlists, tool allowlists, sandbox rules, auth checks
- memory layer: files, indexes, and retrieval
- skills subsystem: discovery, load, readiness checks, configuration
- plugin subsystem: runtime and gateway extensions
- operator plane: CLI, config mutation, validation, audits, deployment helpers

This section is an inference from the official docs, not a direct quote, but it matches the documented responsibilities closely.

## Operational Notes

Important operational details surfaced by the docs:

- the gateway is expected to be long-lived
- current docs prefer WebSocket gateway transport over the old TCP bridge
- WhatsApp appears to be a core constraint-driver for single-gateway assumptions
- cloud deployment requires persistent state storage
- configuration changes may trigger gateway restart
- clients must handle event gaps because replay is not guaranteed
- sandbox containers may need explicit recreation after image or config changes
- private network exposure is preferred over public internet exposure

## What To Be Careful About When Evaluating OpenClaw

Several caution points show up in the docs:

- some documentation includes historical or legacy transport material
- some integration paths are clearly stronger than others, especially around iMessage variants
- the system is highly capable, which increases configuration surface area
- safe deployment depends on actually applying loopback, token auth, tool restrictions, and sandbox defaults correctly
- messaging-platform constraints can become architecture constraints

In other words, OpenClaw is powerful, but it is not a zero-governance toy install.

## Suggested Relevance To StudioAgent

For this repo, the most relevant OpenClaw ideas to borrow or benchmark against are:

- gateway-as-control-plane instead of page-local chat orchestration
- strong separation of agent identity, tool policy, and sandbox policy
- config-driven multi-agent support
- explicit skills registry and readiness checks
- security audit commands as a first-class operational feature
- memory as inspectable files plus indexed retrieval
- async hooks and event sources beyond chat

These are the parts that feel structurally useful, not just feature-list impressive.

## Source Register

Main Context7 source IDs used:

- `/openclaw/openclaw`
- `/openclaw/openclaw.ai`
- `/websites/clawdocs`

Representative source documents retrieved through Context7:

- `docs/concepts/architecture.md`
- `docs/concepts/typebox.md`
- `docs/concepts/multi-agent.md`
- `docs/concepts/models.md`
- `docs/concepts/memory.md`
- `docs/gateway/configuration.md`
- `docs/gateway/configuration-reference.md`
- `docs/gateway/security/index.md`
- `docs/gateway/sandboxing.md`
- `docs/install/installer.md`
- `docs/install/fly.md`
- `docs/install/render.mdx`
- `docs/cli/index.md`
- `docs/cli/sandbox.md`
- `docs/tools/skills-config.md`
- `docs/tools/clawhub.md`
- `docs/tools/multi-agent-sandbox-tools.md`
- `docs/tools/diffs.md`
- `docs/help/faq.md`
- `docs/help/testing.md`
- `docs/reference/wizard.md`
- `docs/pi.md`
- `AGENTS.md`

## Retrieval Log

Context7-backed files saved locally during research:

- `logs/openclaw_overview.txt`
- `logs/openclaw_installation.txt`
- `logs/openclaw_configuration.txt`
- `logs/openclaw_skills.txt`
- `logs/openclaw_integrations.txt`
- `logs/openclaw_deployment.txt`
- `logs/openclaw_security.txt`
- `logs/openclaw_cli.txt`
- `logs/openclaw_memory.txt`
- `logs/openclaw_voice.txt`
- `logs/openclaw_sandbox.txt`
- `logs/openclaw_models.txt`
- `logs/openclaw_site_overview.txt`
- `logs/openclaw_clawdocs_overview.txt`

Those raw files are useful if a future pass needs a more literal extraction or a narrower topic-specific memo.
