import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from "../featureFlags";
import { createRevisionFromLive } from "./artifactRevisions";

const SETTINGS_KEY = "featureFlags";

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
  if (ctx.db) {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q: any) => q.eq("key", SETTINGS_KEY))
      .first();

    const stored = normalizeFlags(existing?.value);
    return { ...DEFAULT_FLAGS, ...stored };
  } else {
    return await ctx.runQuery(api.featureFlags.getAll);
  }
}

export const createConversation = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("agentConversations", {
      projectId: args.projectId,
      title: args.title ?? "New Conversation",
      mode: "chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("agentConversations"),
    text: v.string(),
    asRole: v.optional(v.union(v.literal("user"), v.literal("assistant"))),
  },
  handler: async (ctx, args) => {
    const role = args.asRole ?? "user";

    await ctx.db.insert("agentMessages", {
      conversationId: args.conversationId,
      role: role,
      text: args.text,
      createdAt: Date.now(),
    });

    // Update conversation timestamp
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });

    // Trigger Flow Runner if user message
    if (role === "user") {
      const flags = await loadFlags(ctx);
      const v1Enabled = isEnabled(flags, "ff_flow_runner_v1", false);
      const v2Enabled = isEnabled(flags, "ff_flow_runner_v2", false);
      if (!v1Enabled && !v2Enabled) return;

      const conversation = await ctx.db.get(args.conversationId);
      if (conversation) {
        // Find active flow run for this project
        const flowRun = await ctx.db
          .query("flowRuns")
          .withIndex("by_project_status", (q) =>
            q.eq("projectId", conversation.projectId).eq("status", "running")
          )
          .first();

        if (flowRun) {
          if (!flowRun.toggles?.autoRun) return;
          // Schedule a tick to process the new context
          await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, {
            flowRunId: flowRun._id
          });
        }
      }
    }
  },
});

export const listMessages = query({
  args: { conversationId: v.id("agentConversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

export const startProjectFlow = mutation({
  args: {
    projectId: v.id("projects"),
    initialGate: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const flags = await loadFlags(ctx);
    const v1Enabled = isEnabled(flags, "ff_flow_runner_v1", false);
    const v2Enabled = isEnabled(flags, "ff_flow_runner_v2", false);
    if (!v1Enabled && !v2Enabled) {
      throw new Error("Flow runner is disabled (ff_flow_runner_v1/ff_flow_runner_v2)");
    }

    // Check if already running
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "running")
      )
      .first();

    if (existing) {
      return { flowRunId: existing._id, status: "already_running" };
    }

    // Call internal logic to create run
    // Using flowRuns.create logic but exposing it here
    const conversationId = await ctx.db.insert("agentConversations", {
      projectId: args.projectId,
      title: "Flow Agent",
      mode: "builder",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const useWebSearch = isEnabled(flags, "ff_flow_web_pricing", false)

    const runId = await ctx.db.insert("flowRuns", {
      projectId: args.projectId,
      status: "running",
      currentGateId: args.initialGate ?? "G0",
      graphVersion: "v2.1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      approvalMode: "auto",
      approvalModeDefault: "auto",
      approvalModeOverride: false,
      toggles: { autoRun: true, autoApprove: true, useWebSearch, planningMode: "separated" },
      conversationId
    });

    const artifactRevisionId = await createRevisionFromLive(ctx, {
      projectId: args.projectId,
      runId,
      source: "runStart"
    });

    await ctx.db.patch(runId, {
      currentArtifactRevisionId: artifactRevisionId,
      answerVersionAtStart: 0,
      latestAnswerVersion: 0,
      updatedAt: Date.now()
    });

    // Start the runner
    await ctx.scheduler.runAfter(0, internal.flow.flowRunner.tick, { flowRunId: runId });

    return { flowRunId: runId, status: "started" };
  },
});
