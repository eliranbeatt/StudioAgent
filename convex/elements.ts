import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { buildElementSection, buildElementSectionId } from "./brain_helpers";

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

    await syncBrainSectionFromApproved(ctx, {
      projectId: element.projectId,
      elementId: args.elementId,
      elementTitle: element.title,
      approvedSnapshotId: String(versionId),
      snapshot,
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

async function syncBrainSectionFromApproved(
  ctx: any,
  args: {
    projectId: any;
    elementId: any;
    elementTitle: string;
    approvedSnapshotId: string;
    snapshot: any;
  }
) {
  const brain = await ctx.db
    .query("projectBrains")
    .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
    .first();
  if (!brain) return;

  const now = Date.now();
  const content = renderElementSnapshot(args.snapshot);
  const sectionId = buildElementSectionId(String(args.elementId));
  let found = false;
  const sections = (brain.sections ?? []).map((section: any) => {
    if (section?.id !== sectionId) return section;
    found = true;
    return {
      ...section,
      content,
      updatedAt: now,
      lastSyncedApprovedSnapshotId: args.approvedSnapshotId,
      dirtySinceLastSync: false,
    };
  });

  if (!found) {
    sections.push({
      ...buildElementSection({
        elementId: String(args.elementId),
        title: args.elementTitle,
        now,
      }),
      content,
      lastSyncedApprovedSnapshotId: args.approvedSnapshotId,
      dirtySinceLastSync: false,
    });
  }

  await ctx.db.patch(brain._id, {
    sections,
    version: brain.version + 1,
    updatedAt: now,
  });
}

function renderElementSnapshot(snapshot: any) {
  const lines: string[] = [];
  if (snapshot?.title) {
    lines.push(`Title: ${snapshot.title}`);
  }

  const tasksMap = snapshot?.tasks?.byId ?? {};
  const tasks = Object.values<any>(tasksMap).filter((task) => !task?.deletedAt);
  lines.push(`Tasks: ${tasks.length}`);
  if (tasks.length > 0) {
    const taskTitles = tasks
      .map((task) => String(task?.title ?? "Untitled task"))
      .slice(0, 6);
    lines.push(...taskTitles.map((title) => `- ${title}`));
  }

  const materialsMap = snapshot?.materials?.byId ?? {};
  const materials = Object.values<any>(materialsMap).filter((line) => !line?.deletedAt);
  lines.push(`Materials: ${materials.length}`);

  const laborMap = snapshot?.labor?.byId ?? {};
  const labor = Object.values<any>(laborMap).filter((line) => !line?.deletedAt);
  lines.push(`Labor: ${labor.length}`);

  const notes = Array.isArray(snapshot?.notes) ? snapshot.notes : [];
  if (notes.length > 0) {
    const noteText = notes.map((note: any) => String(note)).slice(0, 3);
    lines.push("Notes:");
    lines.push(...noteText.map((note) => `- ${note}`));
  }

  return lines.join("\n");
}
