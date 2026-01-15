# Knowledge Tab Spec

## Goal
Provide a per-project Knowledge tab that centralizes uploaded files, QA pairs, and a continuously updated Current Knowledge document. This content becomes shared context for every agent skill run inside the project.

## Non-Goals
- Implementing the UI or backend logic in this spec.
- Defining a universal global knowledge store (this is project-scoped only).

## User Stories
- As a user, I can view a list of uploaded files and see a summary per file.
- As a user, I can browse a searchable list of QA pairs from all project conversations.
- As a user, I can read and edit a Current Knowledge document that aggregates the most important facts.
- As a user, I can see when the knowledge doc was last updated and trigger a regeneration.
- As a user, I can disable auto-append when I want to manually curate the knowledge doc.

## Information Architecture
- Project navigation includes a top-level Knowledge tab.
- Knowledge tab includes three sub-tabs:
  - Uploaded Files
  - QA
  - Current Knowledge

## UI Requirements

### Shared Header
- Show project name, last updated time, and a status indicator (idle, summarizing, error).
- Actions:
  - Regenerate (manual refresh of knowledge doc)
  - Pause/Resume auto-append

### Uploaded Files Tab
- Table/list with columns:
  - File name
  - Type
  - Size
  - Uploaded by
  - Upload time
  - Summary status (pending, summarized, error)
- File details drawer/panel:
  - Preview (when supported)
  - Summary section with last summarized time
  - Actions: Summarize now, Download
- Empty state: CTA to upload files with short explanation of summaries.

### QA Tab
- List view of Q/A pairs, sortable by time.
- Search bar with filters:
  - Date range
  - Conversation
  - Tags (optional)
- Each item shows:
  - Question
  - Answer
  - Source conversation
  - Timestamp
- Actions: Copy, Open conversation, Pin (optional)
- Empty state: explain that QA is collected after conversations.

### Current Knowledge Tab
- Editable document (markdown or rich text) with autosave.
- Show last updated time and editor info.
- Auto-append toggle with short explainer.
- Regenerate button to rebuild the latest summary from source events.
- History view or version dropdown (optional but recommended).

### States
- Loading: skeletons and progressive loading per tab.
- Error: inline banner with retry.
- Offline: read-only with disabled actions.

## Data Model

### KnowledgeDoc
- id
- projectId
- content
- lastUpdatedAt
- lastUpdatedBy
- autoAppendEnabled
- version

### UploadedFile
- id
- projectId
- storageRef
- filename
- mimeType
- size
- uploadedBy
- uploadedAt
- summary
- summaryStatus
- summaryUpdatedAt

### QAPair
- id
- projectId
- conversationId
- question
- answer
- createdAt
- sourceMessageIds

## Indexing and Search
- Text search index for:
  - KnowledgeDoc.content
  - QAPair.question and QAPair.answer
- Optional vector search for retrieval-augmented context.

## AI Flows

### Context Assembly for Agent Runs
- Always include the latest KnowledgeDoc content.
- Add relevant QA pairs based on semantic similarity and recency.
- Add file summaries if matched to the prompt or task.

### File Summarization
- Triggered on file upload (async job).
- Stores summary text and status in UploadedFile.
- Manual Summarize now re-runs and updates the summary.

### Current Knowledge Summarization
- Triggered on:
  - New user inputs
  - New agent answers
  - Data ingestion events
  - Manual regenerate
- Small, fast LLM produces concise bullet deltas.
- Append deltas to KnowledgeDoc if auto-append is enabled.
- Preserve manual edits as primary source of truth.

## Async Summary Generation Pipeline

### Trigger Events
- File upload complete
- Conversation completion
- User clicks Regenerate
- External data ingest

### Job Steps
1) Fetch new source items since lastUpdatedAt.
2) Generate concise bullet deltas.
3) Append deltas to KnowledgeDoc if auto-append is enabled.
4) Save metadata and version.
5) Emit update to UI (push or polling).

### Concurrency and Conflicts
- Use optimistic locking on KnowledgeDoc.version.
- If user edits while job is running:
  - Merge with a new version
  - Notify user of updates

### Failure Handling
- Retry with backoff for transient failures.
- Surface errors in the header status indicator.
- Allow manual retry.

## Permissions
- Owners/Admins: full edit and regenerate access.
- Members: read-only by default.
- Configurable policy in project settings (optional).

## Analytics and Telemetry
- Track:
  - Regenerate usage
  - Auto-append toggles
  - Edit frequency
  - Summarization failures

## Open Questions
- Should Current Knowledge be markdown or rich text?
- Do we allow manual pinning of QA pairs into Current Knowledge?
- How many QA pairs should be pulled into context by default?
- Should file summaries be editable or locked?
