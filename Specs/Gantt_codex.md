# Gantt Tab _codex Plan

## Sources and precedence
- Specs/GanttTab.md
- Specs/gpt spec.txt and Specs/gpt spec v2.txt (no conflicts)
- Current code: src/app/projects/[id]/tasks/page.tsx, convex/tasks.ts, convex/drafts.ts

## Current state
- Gantt view is a simple bar list inside Tasks tab.
- No separate route and no drag/reschedule persistence.

## Plan
1. Route and component
   - Add /projects/[id]/gantt/page.tsx and /gantt/_components/GanttView.tsx to match the spec.
   - Add a nav link or a link from Tasks to the new Gantt page.

2. Data loading
   - Use tasks.listForProject (extended to include draftId and revisionNumber) and element titles.
   - Map element titles for task labels.

3. Task mapping to gantt-task-react
   - Convert task startDate/endDate (string or timestamp) to Date.
   - If missing, set start = today and end = start + 1 day or estimatedDuration.
   - Map status to progress (todo 0, in_progress 50, done 100, blocked 0).
   - Map dependencies to task ids in the gantt format.

4. Updates and persistence
   - On drag or resize, build patch ops to update task startDate/endDate in the owning draft via drafts.applyChangeSet.
   - Implement dependency cascade (client-side, one level) if child starts before parent ends.

5. View modes and styling
   - Add Day/Week/Month switch and custom bar colors per spec.
   - Provide element grouping if needed for large projects.

6. QA
   - Manual: drag a task, verify dates update in snapshots and reflect in Tasks tab; check dependency cascade.
