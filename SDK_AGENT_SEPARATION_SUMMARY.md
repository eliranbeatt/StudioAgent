# SDK Agent Tab Separation - Implementation Summary

## Overview
Successfully separated the SDK Agent tab into two distinct sub-tabs:
1. **Project Planning** - Structured, deterministic planning flow
2. **Agent** - Conversational orchestrator for flexible project management

## Architecture Changes

### UI Layer (Frontend)

#### New Files Created:
1. **`src/app/projects/[id]/sdk-agent/page.tsx`** (Simplified)
   - Clean tab-based interface
   - Simple navigation between Planning and Agent modes
   - Removed all the complex state management from original

2. **`src/app/projects/[id]/sdk-agent/_components/ProjectPlanningTab.tsx`**
   - **Purpose**: Structured planning flow from context to complete project plan
   - **Features**:
     - Context detection (brain dump if no context exists)
     - Step-by-step planning with grouped questions
     - Progressive question sets (not all at once)
     - Finalization with progress tracking
     - Final report with breakdown by element

   - **UI Flow**:
     ```
     Start → Context Check → Brain Dump (if needed) → Questions (by set) → Finalize → Report
     ```

   - **Key Components**:
     - Start screen with "Start Planning" button
     - Brain dump textarea for initial context
     - Question sets displayed one at a time
     - Progress bar during finalization
     - Final report with element/task/pricing breakdown

3. **`src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx`**
   - **Purpose**: Conversational agent for flexible interactions
   - **Features**:
     - Chat-based interface
     - Agent orchestrator decides which skills to use
     - Structured blocks (questions, suggestions, changesets)
     - Approval workflow for changes
     - Review drawer for changesets

   - **UI Flow**:
     ```
     User Message → Agent Processes → Tool Calls → Results → Approval (if needed) → Apply
     ```

### Backend Layer (Convex)

#### New Files Created:
1. **`convex/sdk/projectPlanning.ts`**
   - Complete backend for Project Planning flow
   - **Exports**:
     - `submitBrainDump` (mutation) - Save initial project context
     - `initiatePlanning` (action) - Start planning process + generate all questions
     - `getQuestionSets` (query) - Get questions by group/set
     - `submitAnswers` (mutation) - Save answers for current question set
     - `regenerateQuestions` (action) - Refresh questions based on all answers
     - `finalizeProject` (action) - Execute full planning pipeline
     - `getFinalizationProgress` (query) - Track finalization progress

   -  **Planning Flow**:
     1. Check if project has context
     2. If no context → brain dump
     3. Generate full plan (text) + ALL questions grouped
     4. Save questions to qaPairs with groups (blockers, project, per-element, etc.)
     5. User answers questions set by set
     6. User clicks "Finalize Now"
     7. Execute: plan elements → tasks → budget → pricing → audit → validation → repair
     8. Auto-apply changesets after each step
     9. Final report with breakdown

#### Modified Files:
2. **`convex/sdk/questions.ts`**
   - Added helper mutations/queries for project planning:
     - `createQuestion` - Create question with grouping metadata
     - `getAllAnswers` - Get all answered questions for a run
     - `dismissAllForRun` - Dismiss all questions for regeneration

3. **`convex/sdk/context.ts`**
   - Added `addKnowledge` mutation to store brain dumps and planning context

## Key Features Implemented

### Project Planning Tab
✅ **Context-aware start**: Checks for existing context before deciding flow
✅ **Brain dump capture**: Free-form text input when no context exists
✅ **Structured questions**: Questions grouped into logical sets (blockers, project-level, per-element)
✅ **Progressive disclosure**: One question set at a time (not overwhelming)
✅ **Regenerate questions**: Refresh questions based on all answers provided so far
✅ **Deterministic finalization**: Fixed pipeline (elements → tasks → budget → pricing → audit)
✅ **Auto-application**: Changesets applied automatically without approval prompts
✅ **Progress tracking**: Real-time progress bar during finalization
✅ **Validation step**: Checks for duplicates, missing rows, 0 budget items, disconnected tasks
✅ **Auto-repair**: Automatically fixes issues found during validation
✅ **Final report**: Comprehensive breakdown by element with pricing

### Agent Tab
✅ **Conversational interface**: Natural language interactions
✅ **Dynamic orchestration**: LLM decides which skills/tools to call
✅ **Flexible execution**: Adapts to user needs in real-time
✅ **Structured blocks**: Questions, suggestions, reviews in chat
✅ **Approval workflow**: User approval required for changesets
✅ **Changeset review**: Detailed review drawer before applying changes

## Data Flow

### Project Planning Flow
```
User Clicks "Start"
  ↓
Check Context (query)
  ↓
[No Context] → Brain Dump → Save to Context
[Has Context] → Generate Plan + Questions
  ↓
Group Questions (blockers, project, elements, suggestions)
  ↓
Save to qaPairs with groupKey/groupLabelHe
  ↓
Show First Question Set
  ↓
User Submits Answers → Save → Show Next Set
  ↓
User Clicks "Finalize Now"
  ↓
Execute Pipeline:
  1. plan.elements (save to Elements table)
  2. plan.tasks (save to Tasks table)
  3. cost.build_budget (save to accounting tables)
  4. pricing.resolve_lines (resolve pricing)
  5. audit.project (validate)
  6. maint.sync_and_repair (fix issues)
  ↓
Auto-apply changesets after each step
  ↓
Generate Final Report
  ↓
Display: element count, task count, pricing breakdown
```

### Agent Flow
```
User Types Message
  ↓
Call runNext (dispatch.ts)
  ↓
LLM Orchestrator decides tools
  ↓
Run tools (plan.elements, plan.tasks, etc.)
  ↓
Collect intents
  ↓
Compile changeset
  ↓
Review changeset
  ↓
[WAIT FOR USER APPROVAL]
  ↓
User Approves → Apply Changeset
  ↓
Return structured blocks to UI
```

## Question Grouping Strategy

Questions are grouped into categories for progressive disclosure:

1. **Blockers** (`blockingLevel: 'blocker'`, `groupKey: 'blockers'`)
   - Critical questions that must be answered
   - Prevent progress until resolved
   - Examples: Event date, number of guests, budget range

2. **Project-Level** (`groupKey: 'project'`)
   - General project questions
   - Examples: Theme, style preferences, special requirements

3. **Per-Element** (`groupKey: 'element_{elementId}'`)
   - Specific to each element
   - Examples: Table count, chair style, lighting preferences

4. **Suggestions** (`groupKey: 'suggestions'`)
   - Nice-to-have clarifications
   - Optional enhancements

5. **Options** (`groupKey: 'options'`)
   - Alternative approaches
   - Trade-offs to consider

## Validation & Repair

The validation step checks:
- ✅ All tasks linked to elements
- ✅ No duplicate elements/tasks
- ✅ No budget lines with 0 cost
- ✅ No missing critical data
- ✅ Pricing resolved for all items

Auto-repair can:
- Fix orphaned tasks
- Merge duplicates
- Fill in missing pricing
- Resolve inconsistencies

## Testing & Next Steps

### To Test:
1. Run `npx convex codegen` to generate types for new projectPlanning module
2. Start dev server: `npm run dev`
3. Navigate to SDK Agent tab
4. Test "Project Planning" tab:
   - Click "Start Planning"
   - Submit brain dump (if no context)
   - Answer question sets
   - Click "Finalize Now"
   - Review final report
5. Test "Agent" tab:
   - Send conversational messages
   - Observe tool selection
   - Approve changesets
   - Verify changes applied

### Known Issues:
- ⚠️ Need to run `npx convex codegen` for TypeScript types
- ⚠️ `projectPlanning` module not in generated API yet (will resolve after codegen)
- ⚠️ SSL certificate issue during development (network/corporate firewall)

###Files Modified/Created:

**Created:**
- `src/app/projects/[id]/sdk-agent/page.tsx` (NEW simplified version)
- `src/app/projects/[id]/sdk-agent/_components/ProjectPlanningTab.tsx` (NEW)
- `src/app/projects/[id]/sdk-agent/_components/AgentTab.tsx` (NEW)
- `convex/sdk/projectPlanning.ts` (NEW)

**Modified:**
- `convex/sdk/questions.ts` (added createQuestion, getAllAnswers, dismissAllForRun)
- `convex/sdk/context.ts` (added addKnowledge mutation)

**Backed Up:**
- `src/app/projects/[id]/sdk-agent/page.old.tsx` (original complex version preserved)

## Benefits of Separation

### User Experience:
✅ **Clear intent**: User knows which mode they're in
✅ **Guided flow**: Project Planning provides structure for new projects
✅ **Flexibility**: Agent mode allows freeform interactions for experienced users
✅ **Progressive questions**: Not overwhelming with all questions at once
✅ **Faster finalization**: Pre-generated questions = no waiting between sets

### Developer Experience:
✅ **Cleaner code**: Separated concerns, easier to maintain
✅ **Reusable components**: Tab components can be enhanced independently
✅ **Better testing**: Each flow can be tested in isolation
✅ **Extensible**: Easy to add new features to either flow

### Performance:
✅ **Pre-generated questions**: No regeneration needed between sets
✅ **Deterministic pipeline**: Predictable execution path in Planning mode
✅ **Auto-application**: No waiting for user approval in Planning mode
✅ **Optimized queries**: Grouped questions reduce query overhead

## Future Enhancements

### Short-term:
- [ ] Add keyboard shortcuts for navigation
- [ ] Implement autosave for brain dump
- [ ] Add question search/filter in Agent mode
- [ ] Export final report as PDF

### Long-term:
- [ ] AI-powered question prioritization
- [ ] Template-based planning for common project types
- [ ] Collaborative planning (multiple users)
- [ ] Integration with external project management tools
- [ ] Analytics dashboard for planning metrics

## Conclusion

Successfully separated the SDK Agent into two distinct, purpose-built flows:
1. **Project Planning**: For structured, end-to-end project planning
2. **Agent**: For conversational, flexible project management

Both flows use existing skills and infrastructure, ensuring compatibility and maintainability. The separation provides clear user intent, better UX, and cleaner code architecture.
