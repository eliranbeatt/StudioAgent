/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agent_tasks from "../agent_tasks.js";
import type * as changeSets from "../changeSets.js";
import type * as debug from "../debug.js";
import type * as drafts from "../drafts.js";
import type * as elements from "../elements.js";
import type * as files from "../files.js";
import type * as filesActions from "../filesActions.js";
import type * as financials from "../financials.js";
import type * as graveyard from "../graveyard.js";
import type * as inventory from "../inventory.js";
import type * as inventory_helpers from "../inventory_helpers.js";
import type * as management from "../management.js";
import type * as memory from "../memory.js";
import type * as migrations from "../migrations.js";
import type * as patch from "../patch.js";
import type * as projects from "../projects.js";
import type * as quotes from "../quotes.js";
import type * as reconciliation from "../reconciliation.js";
import type * as suggestions from "../suggestions.js";
import type * as taskRevisions from "../taskRevisions.js";
import type * as tasks from "../tasks.js";
import type * as trelloSync from "../trelloSync.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agent_tasks: typeof agent_tasks;
  changeSets: typeof changeSets;
  debug: typeof debug;
  drafts: typeof drafts;
  elements: typeof elements;
  files: typeof files;
  filesActions: typeof filesActions;
  financials: typeof financials;
  graveyard: typeof graveyard;
  inventory: typeof inventory;
  inventory_helpers: typeof inventory_helpers;
  management: typeof management;
  memory: typeof memory;
  migrations: typeof migrations;
  patch: typeof patch;
  projects: typeof projects;
  quotes: typeof quotes;
  reconciliation: typeof reconciliation;
  suggestions: typeof suggestions;
  taskRevisions: typeof taskRevisions;
  tasks: typeof tasks;
  trelloSync: typeof trelloSync;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
