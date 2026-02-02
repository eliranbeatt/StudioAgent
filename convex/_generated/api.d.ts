/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounting from "../accounting.js";
import type * as accountingStudio from "../accountingStudio.js";
import type * as adminHealth from "../adminHealth.js";
import type * as agent from "../agent.js";
import type * as agentData from "../agentData.js";
import type * as agent_tasks from "../agent_tasks.js";
import type * as brainDump from "../brainDump.js";
import type * as changeSets from "../changeSets.js";
import type * as contextManager_promptBuilder from "../contextManager/promptBuilder.js";
import type * as contextManager_pull from "../contextManager/pull.js";
import type * as contextManager_recipes from "../contextManager/recipes.js";
import type * as contextManager_types from "../contextManager/types.js";
import type * as contextManager_views_projectCore from "../contextManager/views/projectCore.js";
import type * as customers from "../customers.js";
import type * as customersStudio from "../customersStudio.js";
import type * as debug_fetch_traces from "../debug_fetch_traces.js";
import type * as debug_inspect from "../debug_inspect.js";
import type * as drafts from "../drafts.js";
import type * as elements from "../elements.js";
import type * as featureFlags from "../featureFlags.js";
import type * as files from "../files.js";
import type * as filesActions from "../filesActions.js";
import type * as financials from "../financials.js";
import type * as flowAnswers from "../flowAnswers.js";
import type * as flowChangeSetApplyLogs from "../flowChangeSetApplyLogs.js";
import type * as flowNodeRuns from "../flowNodeRuns.js";
import type * as flowRuns from "../flowRuns.js";
import type * as flowSteps from "../flowSteps.js";
import type * as flow_answerState from "../flow/answerState.js";
import type * as flow_api from "../flow/api.js";
import type * as flow_artifactRevisions from "../flow/artifactRevisions.js";
import type * as flow_audit from "../flow/audit.js";
import type * as flow_batching from "../flow/batching.js";
import type * as flow_brainDumpExtractor from "../flow/brainDumpExtractor.js";
import type * as flow_chat from "../flow/chat.js";
import type * as flow_clarificationPackBuilder from "../flow/clarificationPackBuilder.js";
import type * as flow_flowRunner from "../flow/flowRunner.js";
import type * as flow_flowRunnerV3 from "../flow/flowRunnerV3.js";
import type * as flow_gateActions from "../flow/gateActions.js";
import type * as flow_graph from "../flow/graph.js";
import type * as flow_orchestrator from "../flow/orchestrator.js";
import type * as flow_questionSets from "../flow/questionSets.js";
import type * as flow_questionsUi from "../flow/questionsUi.js";
import type * as flow_replay from "../flow/replay.js";
import type * as flow_snapshotBuilder from "../flow/snapshotBuilder.js";
import type * as flow_ui from "../flow/ui.js";
import type * as flow_validation_readiness from "../flow/validation/readiness.js";
import type * as flow_validation_types from "../flow/validation/types.js";
import type * as flow_validation_validateG0Brief from "../flow/validation/validateG0Brief.js";
import type * as flow_validation_validateG1Elements from "../flow/validation/validateG1Elements.js";
import type * as flow_validation_validateG2Tasks from "../flow/validation/validateG2Tasks.js";
import type * as flow_validation_validateG3Accounting from "../flow/validation/validateG3Accounting.js";
import type * as flow_validation_validateG4Pricing from "../flow/validation/validateG4Pricing.js";
import type * as flow_validation_validateG5TasksEnrichment from "../flow/validation/validateG5TasksEnrichment.js";
import type * as flow_validation_validateG6OpsCompleteness from "../flow/validation/validateG6OpsCompleteness.js";
import type * as flow_validation_validateG7PricingRecheck from "../flow/validation/validateG7PricingRecheck.js";
import type * as flow_validation_validateG8Quote from "../flow/validation/validateG8Quote.js";
import type * as flow_validation_validateG9Audit from "../flow/validation/validateG9Audit.js";
import type * as graveyard from "../graveyard.js";
import type * as inventory from "../inventory.js";
import type * as inventory_helpers from "../inventory_helpers.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_webSearch from "../lib/webSearch.js";
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
import type * as runbooks from "../runbooks.js";
import type * as shareLinks from "../shareLinks.js";
import type * as skills_prompts from "../skills/prompts.js";
import type * as skills_recommender from "../skills/recommender.js";
import type * as skills_registry from "../skills/registry.js";
import type * as skills_runner from "../skills/runner.js";
import type * as skills_tags from "../skills/tags.js";
import type * as suggestions from "../suggestions.js";
import type * as taskRevisions from "../taskRevisions.js";
import type * as tasks from "../tasks.js";
import type * as tasksStudio from "../tasksStudio.js";
import type * as test_chat from "../test_chat.js";
import type * as test_hello_world from "../test_hello_world.js";
import type * as testing from "../testing.js";
import type * as tracing from "../tracing.js";
import type * as trelloSync from "../trelloSync.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  accountingStudio: typeof accountingStudio;
  adminHealth: typeof adminHealth;
  agent: typeof agent;
  agentData: typeof agentData;
  agent_tasks: typeof agent_tasks;
  brainDump: typeof brainDump;
  changeSets: typeof changeSets;
  "contextManager/promptBuilder": typeof contextManager_promptBuilder;
  "contextManager/pull": typeof contextManager_pull;
  "contextManager/recipes": typeof contextManager_recipes;
  "contextManager/types": typeof contextManager_types;
  "contextManager/views/projectCore": typeof contextManager_views_projectCore;
  customers: typeof customers;
  customersStudio: typeof customersStudio;
  debug_fetch_traces: typeof debug_fetch_traces;
  debug_inspect: typeof debug_inspect;
  drafts: typeof drafts;
  elements: typeof elements;
  featureFlags: typeof featureFlags;
  files: typeof files;
  filesActions: typeof filesActions;
  financials: typeof financials;
  flowAnswers: typeof flowAnswers;
  flowChangeSetApplyLogs: typeof flowChangeSetApplyLogs;
  flowNodeRuns: typeof flowNodeRuns;
  flowRuns: typeof flowRuns;
  flowSteps: typeof flowSteps;
  "flow/answerState": typeof flow_answerState;
  "flow/api": typeof flow_api;
  "flow/artifactRevisions": typeof flow_artifactRevisions;
  "flow/audit": typeof flow_audit;
  "flow/batching": typeof flow_batching;
  "flow/brainDumpExtractor": typeof flow_brainDumpExtractor;
  "flow/chat": typeof flow_chat;
  "flow/clarificationPackBuilder": typeof flow_clarificationPackBuilder;
  "flow/flowRunner": typeof flow_flowRunner;
  "flow/flowRunnerV3": typeof flow_flowRunnerV3;
  "flow/gateActions": typeof flow_gateActions;
  "flow/graph": typeof flow_graph;
  "flow/orchestrator": typeof flow_orchestrator;
  "flow/questionSets": typeof flow_questionSets;
  "flow/questionsUi": typeof flow_questionsUi;
  "flow/replay": typeof flow_replay;
  "flow/snapshotBuilder": typeof flow_snapshotBuilder;
  "flow/ui": typeof flow_ui;
  "flow/validation/readiness": typeof flow_validation_readiness;
  "flow/validation/types": typeof flow_validation_types;
  "flow/validation/validateG0Brief": typeof flow_validation_validateG0Brief;
  "flow/validation/validateG1Elements": typeof flow_validation_validateG1Elements;
  "flow/validation/validateG2Tasks": typeof flow_validation_validateG2Tasks;
  "flow/validation/validateG3Accounting": typeof flow_validation_validateG3Accounting;
  "flow/validation/validateG4Pricing": typeof flow_validation_validateG4Pricing;
  "flow/validation/validateG5TasksEnrichment": typeof flow_validation_validateG5TasksEnrichment;
  "flow/validation/validateG6OpsCompleteness": typeof flow_validation_validateG6OpsCompleteness;
  "flow/validation/validateG7PricingRecheck": typeof flow_validation_validateG7PricingRecheck;
  "flow/validation/validateG8Quote": typeof flow_validation_validateG8Quote;
  "flow/validation/validateG9Audit": typeof flow_validation_validateG9Audit;
  graveyard: typeof graveyard;
  inventory: typeof inventory;
  inventory_helpers: typeof inventory_helpers;
  "lib/dates": typeof lib_dates;
  "lib/llm": typeof lib_llm;
  "lib/normalize": typeof lib_normalize;
  "lib/pricing": typeof lib_pricing;
  "lib/webSearch": typeof lib_webSearch;
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
  runbooks: typeof runbooks;
  shareLinks: typeof shareLinks;
  "skills/prompts": typeof skills_prompts;
  "skills/recommender": typeof skills_recommender;
  "skills/registry": typeof skills_registry;
  "skills/runner": typeof skills_runner;
  "skills/tags": typeof skills_tags;
  suggestions: typeof suggestions;
  taskRevisions: typeof taskRevisions;
  tasks: typeof tasks;
  tasksStudio: typeof tasksStudio;
  test_chat: typeof test_chat;
  test_hello_world: typeof test_hello_world;
  testing: typeof testing;
  tracing: typeof tracing;
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
