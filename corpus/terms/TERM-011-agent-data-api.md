---
id: TERM-011
title: "Agent Data API"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/agentData.ts"
tags: [api, agent, data-access]
links:
  - rel: used by
    target: "[[WI-001-sdk-agent-orchestrator]]"
---

# Agent Data API

The `agent.data()` API provides structured access to project data for AI agents. It supports:

- **Resources**: project, projects, elements, tasks, materialLines, workLines, qaPairs, employees, vendors, and more
- **Filtering**: Status, text search, date ranges, element/task scoping
- **Field selection**: Choose which fields to return
- **Pagination**: Cursor-based with configurable limit (max 200)
- **Logging**: All calls are recorded to `agentDataLogs` for observability

This API is the primary data-access layer for the [[WI-001-sdk-agent-orchestrator]] when it needs to read project state.
