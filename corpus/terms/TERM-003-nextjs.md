---
id: TERM-003
title: "Next.js"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "next.config.js"
tags: [frontend, framework]
links:
  - rel: used by
    target: "[[TERM-001-studio-agent]]"
---

# Next.js

Next.js (App Router, v16+) is the frontend framework for [[TERM-001-studio-agent]]. The application uses:

- `src/app/` for App Router pages and layouts
- Client components (`"use client"`) with Convex React hooks
- Dynamic route segments (`[id]`) for project-specific pages
- Tailwind CSS v4 for styling
- Server and client rendering as appropriate
