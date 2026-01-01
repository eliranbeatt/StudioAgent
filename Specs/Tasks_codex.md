# Tasks Tab _codex Plan

## Sources and precedence
- Specs/TasksTab.md (UI and interaction details)
- Specs/gpt spec.txt and Specs/gpt spec v2.txt (override conflicts)
- Current code: src/app/projects/[id]/tasks/page.tsx, convex/tasks.ts, convex/drafts.ts, convex/reconciliation.ts, convex/agent.ts, convex/schema.ts

## Current state
- Read-only tasks view from element draft snapshots with basic tabs (Kanban, Gantt, Elements, Work Type).
- No CRUD or drag and drop. No tasks table. No ChangeSet integration.

## Spec decisions (conflict resolution)
- Tasks remain a projection of element snapshots (gpt spec). Do not create a separate tasks table.
- Editing tasks must create ChangeSets (drafts.applyChangeSet) and trigger reconciliation plus graveyard.

## Plan
1. Snapshot task schema
   - Define fields: id, title, description, status, domain, priority, category, startDate, endDate, estimatedMinutes/duration, dependencies, steps, subtasks, assignee, links to materials/labor.
   - Update element creation and task generation to include required defaults.

2. Backend updates
   - Update tasks.listForProject to return:
     - task list with elementId, elementTitle, draftId, revisionNumber
     - element draft metadata for edits
   - Add drafts.createOrOpenDraft for elements without open drafts.
   - Optionally add tasks.applyTaskPatch to wrap drafts.applyChangeSet with task-specific validation.

3. UI state and controls
   - Add filters (status, priority, category, domain), sorting, and a draft mode indicator.
   - Add quick actions: generate tasks (agent.generateTaskPatchOps) and apply ChangeSet.

4. Kanban with drag and drop
   - Use @dnd-kit to move tasks between status columns.
   - On drop: build patch ops to update task.status in the owning draft; call applyChangeSet and handle revision conflicts with retry or refresh.

5. Task cards and modal
   - Inline edits for priority/category/status.
   - Task modal for full fields and dependencies.
   - On save: patch ops against tasks.byId.<taskId>.

6. Elements and Work Type views
   - Keep current views, add click-to-edit that opens modal and supports link management.

7. Linking to accounting lines
   - Provide UI to attach material/labor line ids to tasks and update links.taskIds on lines (patch ops).
   - Ensure reconciliation rules handle orphaned lines and procurement changes.

8. Gantt handoff
   - Keep a lightweight Gantt in Tasks or link to the dedicated Gantt page; both read from the same data.

9. QA
   - Manual: move tasks across columns, edit details, add/remove tasks, verify reconciliation and graveyard behavior.
