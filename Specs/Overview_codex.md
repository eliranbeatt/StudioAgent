# Overview Tab _codex Plan

## Sources and precedence
- Specs/OverviewTab.md (layout and feature list)
- Specs/gpt spec.txt and Specs/gpt spec v2.txt (override conflicts)
- Specs/Management Hub.txt (integration hints only)
- Current code: src/app/projects/[id]/overview/page.tsx, convex/projects.ts, convex/files.ts, convex/schema.ts

## Current state
- UI: project name/status, element and graveyard counts, baseline/effective budget, elements list, project file upload/list.
- Data: api.projects.getOverview, api.files.listProjectFiles, api.files.generateUploadUrl, api.files.saveUploadedFile.

## Spec decisions (conflict resolution)
- Trello sync is excluded (gpt spec non-goal: no external integrations).
- No RAG or ingestion pipeline (gpt spec non-goal). Keep file upload and stored summaries only.
- Past project linking must use digest-first flow (gpt spec v2).

## Plan
1. Data model upgrades
   - Add project fields required by OverviewTab.md: stage, projectTypes, budgetTier, defaultLanguage, details (eventDate, budgetCap, location, notes), feature flags.
   - Use projectLinks table for past project linking; store link mode (contextOnly/importSuggestions).
   - Use projectDigests table for digest-first previews.

2. Backend queries and mutations
   - projects.getOverview: include baseline and approved CO totals, element list, graveyard count, and task status counts derived from elementDraft snapshots.
   - projects.updateProjectDetails: patch the new project fields in one mutation.
   - projects.listProjects: minimal info for "Related Past Projects" picker.
   - projects.listLinkedProjects and projects.linkProject/unlinkProject (projectLinks table).
   - projects.getProjectDigest / projects.generateDigest (if digest missing).
   - conversations.listRecentByStage: return last N conversations with the last agent message snippet (messages table).

3. Overview UI layout
   - Rebuild page into sections per spec: summary and uploads, operational metrics, project details form, conversation streams, quick links.
   - Keep the existing stats cards (elements, graveyard, baseline, effective budget) and add variance if available.

4. Project details form
   - Local form state with validation; save with updateProjectDetails.
   - Map stage/status options to schema enums; ensure defaults for missing fields.

5. Linked past projects
   - Add selector to link/unlink projects and choose mode.
   - Show digest preview (summary, key elements, totals). Add "Generate digest" action when missing.

6. Files / knowledge
   - Keep current file upload flow (generateUploadUrl + saveUploadedFile).
   - If tags/context are required, extend projectFiles schema and save metadata (no ingestion jobs).

7. Conversations and quick actions
   - Add two columns for recent "clarification" and "planning" threads; map to current stages (ideation/planning/solutioning).
   - Render quick links to Studio, Tasks, Accounting, Quote, Graveyard.

8. Validation
   - Manual QA: update details, link past project, upload file, verify task counts and metrics update.
