# StudioAgent - Project Overview

StudioAgent is an AI-powered project management platform designed for studios involved in events, fabrication, and production. It utilizes **Next.js** for the frontend and **Convex** for the backend (database + serverless functions), integrated with AI agents to assist in planning, budgeting, and execution.

## Tech Stack

*   **Frontend:** Next.js (App Router), React, Tailwind CSS.
*   **Backend:** Convex (Real-time database, serverless functions).
*   **Language:** TypeScript.
*   **AI:** Integration with OpenAI (via `openai-agents` and custom flows).
*   **Testing:** Playwright (E2E), Node.js Test Runner (Backend/SDK).

## Architecture

### Frontend (`src/`)
The frontend is built with Next.js using the **App Router**.
*   `src/app/`: Contains pages, layouts, and route handlers.
    *   `src/app/projects/[id]/`: Main project workspace.
    *   `src/app/projects/[id]/overview/`: Project dashboard.
    *   `src/app/projects/[id]/sdk-agent/`: The new Agent interface (Planning & Conversational).
*   `src/lib/`: Shared utilities.
*   `src/components/`: Reusable React components.

### Backend (`convex/`)
Convex handles the database schema, API endpoints, and business logic.
*   `convex/schema.ts`: **CRITICAL**. Defines the entire data model (Projects, Elements, Tasks, Accounting, etc.).
*   `convex/sdk/`: Contains the core logic for the "SDK Agent" (the new agent architecture).
*   `convex/flow/`: Contains logic for the "Flow Agent" (previous generation/specific flows).
*   `convex/*.ts`: Various modules for specific domains (e.g., `accounting.ts`, `tasks.ts`, `inventory.ts`).

### Agents & Skills
The system uses a concept of "Agents" and "Skills" to perform tasks.
*   **SDK Agent:** The current main agent interaction point. It has been recently separated into two modes:
    1.  **Project Planning:** A structured, deterministic flow for setting up new projects (Brain Dump -> Questions -> Final Plan).
    2.  **Agent:** A flexible, conversational interface for ongoing project management.
*   **Skills:** specific capabilities the agent can invoke (e.g., "elements_builder", "estimate_tasks").

## Development Workflow

### Prerequisites
*   Node.js (v18+ recommended)
*   NPM

### Setup
```bash
npm install
```

### Running Development Server
You typically need two terminals:

1.  **Frontend (Next.js):**
    ```bash
    npm run dev
    ```
2.  **Backend (Convex):**
    ```bash
    npm run convex:dev
    ```
    *Note: This script (`scripts/convex_dev.js`) handles the Convex dev server connection.*

### Building
```bash
npm run build
```

## Testing

*   **E2E Tests (Playwright):**
    ```bash
    npm run test:e2e
    ```
*   **SDK/Backend Tests:**
    ```bash
    npm run test:sdk
    ```

## Key Documentation (`Specs/`)
The `Specs/` directory contains detailed specifications.
*   `Specs/Overview_codex.md`: Plan for the Overview tab.
*   `Specs/Accounting_codex.md`: Accounting system specs.
*   `SDK_AGENT_SEPARATION_SUMMARY.md`: Details on the recent split of the SDK Agent UI.

## Data Model Highlights
(Refer to `convex/schema.ts` for the full definition)
*   **Projects:** The root entity.
*   **Elements:** High-level deliverables (e.g., "Main Stage", "Welcome Kit").
*   **Tasks:** Actionable items linked to Elements.
*   **AccountingLines:** Financial records (Estimates, Actuals, Materials, Labor).
*   **ChangeSets:** The mechanism by which Agents propose changes to the project state.
*   **Runbooks:** Operational guides for execution.

## Recent Changes
*   **SDK Agent Separation:** The agent interface at `src/app/projects/[id]/sdk-agent` is now split into "Project Planning" and "Agent" tabs to distinguish between initial setup and ongoing assistance.
