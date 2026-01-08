import { mutation, query } from "./_generated/server";
import { v } from "convex/values";


export const approveElementDraft = mutation({
  args: {
    elementId: v.id("elements"),
    approvedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new Error("Element not found.");
    if (!element.currentDraftId) throw new Error("No open draft found.");

    const draft = await ctx.db.get(element.currentDraftId);
    if (!draft) throw new Error("Draft not found.");
    if (draft.status !== "open" && draft.status !== "needsReview") {
      throw new Error("Draft is not open.");
    }

    const latestVersion = await ctx.db
      .query("elementVersions")
      .withIndex("by_element", (q) => q.eq("elementId", args.elementId))
      .order("desc")
      .first();

    const now = Date.now();
    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    const snapshot = draft.workingSnapshot ?? {};

    const versionId = await ctx.db.insert("elementVersions", {
      elementId: args.elementId,
      projectId: element.projectId,
      versionNumber,
      status: "approved",
      tags: element.tags ?? [],
      summary: `Approved from draft ${draft._id}`,
      snapshot,
      schemaVersion: draft.schemaVersion ?? 1,
      approvedBy: args.approvedBy,
      approvedAt: now,
      createdAt: now,
    });

    await ctx.db.patch(args.elementId, {
      currentApprovedVersionId: versionId,
      status: "approvedForQuote",
      updatedAt: now,
    });

    await ctx.db.patch(draft._id, {
      status: "approved",
      baseVersionId: versionId,
      updatedAt: now,
    });

    return { ok: true, versionId };
  },
});

export const getElementDetail = query({
  args: {
    elementId: v.id("elements"),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) return null;

    const draft = element.currentDraftId ? await ctx.db.get(element.currentDraftId) : null;
    const approved = element.currentApprovedVersionId
      ? await ctx.db.get(element.currentApprovedVersionId)
      : null;

    return {
      element: {
        id: element._id,
        title: element.title,
        type: element.type,
        status: element.status,
        rev: element.rev ?? 1,
      },
      draft: draft
        ? {
          id: draft._id,
          revisionNumber: draft.revisionNumber,
          snapshot: draft.workingSnapshot ?? {},
        }
        : null,
      approved: approved
        ? {
          id: approved._id,
          versionNumber: approved.versionNumber,
          snapshot: approved.snapshot ?? {},
        }
        : null,
    };
  },
});


