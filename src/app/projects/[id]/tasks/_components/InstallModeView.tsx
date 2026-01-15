"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { useMemo, useState } from "react";

type Props = {
  projectId: Id<"projects">;
};

type RunbookBundle = {
  runbook: any;
  items: any[];
  listItems: any[];
} | null;

export function InstallModeView({ projectId }: Props) {
  const activeBundle = useQuery(api.runbooks.getActiveForProject, { projectId }) as RunbookBundle;

  const conversations = useQuery(api.skills.runner.listAgentConversations, { projectId });
  const createConversation = useMutation(api.skills.runner.createAgentConversation);
  const runSkill = useAction(api.skills.runner.runSkill);

  const createFromRunbookBlock = useMutation(api.runbooks.createFromRunbookBlock);
  const setActiveRunbook = useMutation(api.runbooks.setActiveRunbook);
  const startExecution = useMutation(api.runbooks.startExecution);
  const toggleItemDone = useMutation(api.runbooks.toggleRunbookItemDone);
  const updateItemText = useMutation(api.runbooks.updateRunbookItemText);
  const toggleListItemChecked = useMutation(api.runbooks.toggleRunbookListItemChecked);
  const signApproval = useMutation(api.runbooks.signApproval);

  const [draftRunbookBlock, setDraftRunbookBlock] = useState<any | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");

  const phases = useMemo(() => {
    const items = activeBundle?.items ?? [];
    const byPhase = new Map<
      string,
      {
        phaseId: string;
        phaseNameHe: string;
        phaseOrder: number;
        items: any[];
      }
    >();

    for (const item of items) {
      const phaseId = item.phaseId as string;
      const existing = byPhase.get(phaseId);
      if (existing) {
        existing.items.push(item);
      } else {
        byPhase.set(phaseId, {
          phaseId,
          phaseNameHe: item.phaseNameHe ?? "",
          phaseOrder: item.phaseOrder ?? 0,
          items: [item],
        });
      }
    }

    return Array.from(byPhase.values())
      .map((p) => ({
        ...p,
        items: [...p.items].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
      }))
      .sort((a, b) => a.phaseOrder - b.phaseOrder);
  }, [activeBundle?.items]);

  const effectiveSelectedPhaseId = useMemo(() => {
    if (selectedPhaseId && phases.some((p) => p.phaseId === selectedPhaseId)) return selectedPhaseId;
    return phases[0]?.phaseId ?? null;
  }, [phases, selectedPhaseId]);

  const selectedPhase = useMemo(() => {
    return phases.find((p) => p.phaseId === effectiveSelectedPhaseId) ?? null;
  }, [effectiveSelectedPhaseId, phases]);

  const listItemsByType = useMemo(() => {
    const listItems = activeBundle?.listItems ?? [];
    const map = new Map<string, any[]>();
    for (const item of listItems) {
      const type = item.listType as string;
      const existing = map.get(type) ?? [];
      existing.push(item);
      map.set(type, existing);
    }

    for (const [k, v] of map.entries()) {
      map.set(k, v.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
    }

    return map;
  }, [activeBundle?.listItems]);

  const approvals = useMemo(() => {
    const runbook = activeBundle?.runbook;
    if (!runbook) return null;

    const approvalStages: string[] =
      (Array.isArray(runbook.approvalStages) && runbook.approvalStages.length > 0
        ? runbook.approvalStages
        : null) ?? ["preDepart", "postInstallQA", "preTeardown"];

    const approvalRecords: Array<{ stage: string; signedAt: number; signedBy: string; note?: string }> =
      Array.isArray(runbook.approvalRecords) ? runbook.approvalRecords : [];

    const recordByStage = new Map(approvalRecords.map((r) => [r.stage, r]));

    return {
      approvalsRequired: Boolean(runbook.approvalsRequired) || approvalRecords.length > 0,
      approvalStages,
      recordByStage,
    };
  }, [activeBundle?.runbook]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      let conversationId = conversations?.[0]?._id as Id<"agentConversations"> | undefined;
      if (!conversationId) {
        conversationId = (await createConversation({
          projectId,
          title: "Tasks: Install Runbook",
        })) as Id<"agentConversations">;
      }

      const blocks = await runSkill({
        projectId,
        conversationId,
        skillId: "INSTALL_RUNBOOK_BUILDER",
        params: { source: "tasks_install_mode" },
      });

      const runbookBlock = Array.isArray(blocks)
        ? blocks.find((b: any) => b?.type === "RunbookBlock")
        : null;

      if (!runbookBlock) {
        alert("No RunbookBlock returned from skill.");
        return;
      }

      setDraftRunbookBlock(runbookBlock);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to generate runbook");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraftAsRunbook = async () => {
    if (!draftRunbookBlock) return;

    setIsSaving(true);
    try {
      const { runbookId } = await createFromRunbookBlock({
        projectId,
        scope: "project",
        runbookBlock: draftRunbookBlock,
        source: "ai",
      });

      await setActiveRunbook({ projectId, runbookId });
      setDraftRunbookBlock(null);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to save runbook");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartExecution = async () => {
    if (!activeBundle?.runbook?._id) return;
    try {
      await startExecution({ runbookId: activeBundle.runbook._id });
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to start execution");
    }
  };

  const handlePrint = () => {
    const runbook = activeBundle?.runbook;
    if (!runbook) return;

    const content = document.getElementById("install-runbook-print")?.innerHTML;
    if (!content) return;

    const w = window.open("", "_blank");
    if (!w) return;

    w.document.write(`<!doctype html><html><head><title>${runbook.titleHe ?? "Runbook"}</title></head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const hasActive = Boolean(activeBundle?.runbook);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Install Mode</div>
            <div className="text-xs text-gray-500">
              {hasActive
                ? `${activeBundle?.runbook?.titleHe ?? "Runbook"} (v${activeBundle?.runbook?.version ?? "-"})`
                : "No active runbook yet"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {isGenerating ? "Generating…" : "Generate Runbook"}
            </button>

            <button
              onClick={handleSaveDraftAsRunbook}
              disabled={!draftRunbookBlock || isSaving}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save as Runbook Instance"}
            </button>

            <button
              onClick={handleStartExecution}
              disabled={!hasActive || Boolean(activeBundle?.runbook?.executionStartedAt)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              Start Execution
            </button>

            <button
              onClick={handlePrint}
              disabled={!hasActive}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              Print / Export
            </button>
          </div>
        </div>

        {draftRunbookBlock && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs text-blue-900">
            Draft generated. Review in Agent chat if needed, then click “Save as Runbook Instance”.
          </div>
        )}
      </div>

      {!hasActive && (
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Generate a runbook to start, then save and execute it here.
        </div>
      )}

      {hasActive && (
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-4" id="install-runbook-print">
          {/* Left: Phases */}
          <div className="col-span-12 md:col-span-3 rounded-xl border border-gray-200 bg-white p-3 overflow-y-auto">
            <div className="text-xs font-semibold text-gray-900 mb-2">Phases</div>
            <div className="space-y-2">
              {phases.map((phase) => {
                const doneCount = phase.items.filter((i) => i.status === "done").length;
                const totalCount = phase.items.length;
                const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
                const selected = phase.phaseId === effectiveSelectedPhaseId;

                return (
                  <button
                    key={phase.phaseId}
                    onClick={() => setSelectedPhaseId(phase.phaseId)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      selected ? "border-black/10 bg-gray-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-gray-900 truncate">{phase.phaseNameHe}</div>
                      <div className="text-[11px] text-gray-500">{doneCount}/{totalCount}</div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-gray-900/40" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center: Steps */}
          <div className="col-span-12 md:col-span-6 rounded-xl border border-gray-200 bg-white p-3 overflow-y-auto">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-semibold text-gray-900">Steps</div>
              {activeBundle?.runbook?.executionStartedAt && (
                <div className="text-[11px] text-gray-500">Execution started</div>
              )}
            </div>

            {selectedPhase?.items?.length ? (
              <div className="space-y-2">
                {selectedPhase.items.map((item) => {
                  const isDone = item.status === "done";
                  const isEditing = editingItemId === item._id;

                  return (
                    <div key={item._id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5"
                          checked={isDone}
                          onChange={() => toggleItemDone({ runbookItemId: item._id })}
                        />
                        <div className="flex-1 min-w-0">
                          {!isEditing ? (
                            <div className={`text-sm ${isDone ? "line-through text-gray-400" : "text-gray-900"}`}>
                              {item.textHe}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input
                                className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded-lg"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                              />
                              <button
                                className="px-2 py-1 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50"
                                onClick={async () => {
                                  await updateItemText({ runbookItemId: item._id, textHe: editingText });
                                  setEditingItemId(null);
                                }}
                              >
                                Save
                              </button>
                              <button
                                className="px-2 py-1 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50"
                                onClick={() => setEditingItemId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )}

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                            {item.responsibleHe && <span>{item.responsibleHe}</span>}
                            {typeof item.durationMins === "number" && <span>{item.durationMins} min</span>}
                            {item.kind === "checkpoint" && (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100">Checkpoint</span>
                            )}
                          </div>
                        </div>

                        {!isEditing && (
                          <button
                            className="px-2 py-1 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50"
                            onClick={() => {
                              setEditingItemId(item._id);
                              setEditingText(item.textHe ?? "");
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No steps in this phase.</div>
            )}
          </div>

          {/* Right: Lists + approvals */}
          <div className="col-span-12 md:col-span-3 rounded-xl border border-gray-200 bg-white p-3 overflow-y-auto">
            {approvals?.approvalsRequired && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-900 mb-2">Approvals</div>
                <div className="space-y-2">
                  {approvals.approvalStages.map((stage) => {
                    const record = approvals.recordByStage.get(stage);
                    const signed = Boolean(record);
                    return (
                      <button
                        key={stage}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                          signed ? "border-gray-200 bg-gray-50 text-gray-900" : "border-gray-200 hover:bg-gray-50"
                        }`}
                        onClick={() => signApproval({ runbookId: activeBundle!.runbook._id, stage })}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{stage}</span>
                          <span className="text-[11px] text-gray-500">{signed ? "Signed" : "Sign"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <ListPanel
              title="Bring List"
              items={listItemsByType.get("bringList") ?? []}
              onToggle={(id) => toggleListItemChecked({ runbookListItemId: id })}
            />
            <ListPanel
              title="Safety"
              items={listItemsByType.get("safety") ?? []}
              onToggle={(id) => toggleListItemChecked({ runbookListItemId: id })}
            />
            <ListPanel
              title="Checkpoints"
              items={listItemsByType.get("checkpoints") ?? []}
              onToggle={(id) => toggleListItemChecked({ runbookListItemId: id })}
            />
            <ListPanel
              title="Quick Fix Kit"
              items={listItemsByType.get("quickFixKit") ?? []}
              onToggle={(id) => toggleListItemChecked({ runbookListItemId: id })}
            />

            <AssumptionsPanel items={listItemsByType.get("assumptions") ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}

function ListPanel({
  title,
  items,
  onToggle,
}: {
  title: string;
  items: any[];
  onToggle: (id: Id<"runbookListItems">) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-gray-900 mb-2">{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <label
            key={item._id}
            className="flex items-start gap-2 rounded-lg border border-gray-200 p-2 cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={Boolean(item.checked)}
              onChange={() => onToggle(item._id)}
            />
            <div className="text-xs text-gray-800 leading-5">{item.textHe}</div>
          </label>
        ))}
      </div>
    </div>
  );
}

function AssumptionsPanel({ items }: { items: any[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-2">
      <div className="text-xs font-semibold text-gray-900 mb-2">Assumptions</div>
      <div className="rounded-lg border border-yellow-200 bg-yellow-50/40 p-3">
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item._id} className="text-xs text-gray-900">
              - {item.textHe}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
