/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminHealth from "../adminHealth.js";
import type * as agent from "../agent.js";
import type * as agent_tasks from "../agent_tasks.js";
import type * as changeSets from "../changeSets.js";
import type * as customers from "../customers.js";
import type * as debug from "../debug.js";
import type * as drafts from "../drafts.js";
import type * as elementImages from "../elementImages.js";
import type * as elements from "../elements.js";
import type * as files from "../files.js";
import type * as filesActions from "../filesActions.js";
import type * as financials from "../financials.js";
import type * as graveyard from "../graveyard.js";
import type * as inventory from "../inventory.js";
import type * as inventory_helpers from "../inventory_helpers.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as management from "../management.js";
import type * as memory from "../memory.js";
import type * as migrations from "../migrations.js";
import type * as patch from "../patch.js";
import type * as printing from "../printing.js";
import type * as projects from "../projects.js";
import type * as projectsCustomers from "../projectsCustomers.js";
import type * as projectsStage from "../projectsStage.js";
import type * as quotePdf from "../quotePdf.js";
import type * as quotes from "../quotes.js";
import type * as receipts from "../receipts.js";
import type * as receiptsActions from "../receiptsActions.js";
import type * as reconciliation from "../reconciliation.js";
import type * as shareLinks from "../shareLinks.js";
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
  adminHealth: typeof adminHealth;
  agent: typeof agent;
  agent_tasks: typeof agent_tasks;
  changeSets: typeof changeSets;
  customers: typeof customers;
  debug: typeof debug;
  drafts: typeof drafts;
  elementImages: typeof elementImages;
  elements: typeof elements;
  files: typeof files;
  filesActions: typeof filesActions;
  financials: typeof financials;
  graveyard: typeof graveyard;
  inventory: typeof inventory;
  inventory_helpers: typeof inventory_helpers;
  "lib/normalize": typeof lib_normalize;
  management: typeof management;
  memory: typeof memory;
  migrations: typeof migrations;
  patch: typeof patch;
  printing: typeof printing;
  projects: typeof projects;
  projectsCustomers: typeof projectsCustomers;
  projectsStage: typeof projectsStage;
  quotePdf: typeof quotePdf;
  quotes: typeof quotes;
  receipts: typeof receipts;
  receiptsActions: typeof receiptsActions;
  reconciliation: typeof reconciliation;
  shareLinks: typeof shareLinks;
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
