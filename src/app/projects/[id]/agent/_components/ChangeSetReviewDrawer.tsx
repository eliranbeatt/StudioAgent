"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Check, X, Edit2, Save, RotateCcw, ChevronRight, ChevronDown, CheckSquare, Square, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

export default function ChangeSetReviewDrawer({
  open,
  onClose,
  onResolved,
  closeOnResolve = true,
  showApplyAndContinue = false,
  changeSetId,
  projectId
}: {
  open: boolean;
  onClose: () => void;
  onResolved?: (result: { status: "applied" | "discarded" }) => void | Promise<void>;
  closeOnResolve?: boolean;
  showApplyAndContinue?: boolean;
  changeSetId: Id<"changeSets">;
  projectId: Id<"projects">;
}) {
  const changeSet = useQuery(api.changeSets.get, { id: changeSetId });
  const accounting = useQuery(api.financials.getAccountingView, { projectId });
  const tasksData = useQuery(api.tasks.listForProject, { projectId });
  const applyChangeSetOps = useMutation(api.changeSets.applyChangeSetOps);
  const discardChangeSet = useMutation(api.changeSets.discardChangeSet);
  const updateOp = useMutation(api.changeSets.updateChangeSetOp);

  const [isApplying, setIsApplying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Edit State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);

  const lineNameById = useMemo(() => {
    const map = new Map<string, string>();
    const addLine = (line: any) => {
      const label = line?.name ?? line?.title ?? line?.role;
      if (line?.id && label && !map.has(line.id)) map.set(line.id, label);
    };
    const addGroup = (group: any) => {
      (group?.materials ?? []).forEach(addLine);
      (group?.labor ?? []).forEach(addLine);
    };
    (accounting?.elements ?? []).forEach(addGroup);
    if (accounting?.projectCosts) addGroup(accounting.projectCosts);
    return map;
  }, [accounting]);

  const taskNameById = useMemo(() => {
    const map = new Map<string, string>();
    (tasksData?.tasks ?? []).forEach((task: any) => {
      if (task?.id && task?.title) map.set(task.id, task.title);
    });
    return map;
  }, [tasksData]);

  const elementNameById = useMemo(() => {
    const map = new Map<string, string>();
    (tasksData?.elements ?? []).forEach((element: any) => {
      if (element?.elementId && element?.elementTitle) {
        map.set(element.elementId, element.elementTitle);
      }
    });
    return map;
  }, [tasksData]);

  const resolveRefName = (key: string, value: any) => {
    if (typeof value !== "string") return null;
    const normalized = key.toLowerCase();
    if (["lineid", "materiallineid", "worklineid", "accountinglineid"].includes(normalized)) {
      return lineNameById.get(value) ?? null;
    }
    if (normalized === "taskid") return taskNameById.get(value) ?? null;
    if (normalized === "elementid") return elementNameById.get(value) ?? null;
    return null;
  };

  const getOpReference = (op: any) => {
    const payload = op?.payload ?? {};
    const entries: Array<[string, any]> = [
      ["taskId", payload.taskId],
      ["elementId", payload.elementId],
      ["lineId", payload.lineId],
      ["materialLineId", payload.materialLineId],
      ["workLineId", payload.workLineId],
      ["accountingLineId", payload.accountingLineId],
      ["tempId", payload.tempId],
    ];
    for (const [key, value] of entries) {
      if (value) return { key, value };
    }
    return null;
  };

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Initialize selection when data loads
  useEffect(() => {
    if (changeSet?.ops && selectedIndices.size === 0) {
      const ops = changeSet.ops as any[];
      const allIndices = ops.map((_, i) => i);
      const appliedIndices = (changeSet.appliedOpIndices ?? []) as number[];
      const unapplied = new Set<number>(allIndices.filter(i => !appliedIndices.includes(i)));
      setSelectedIndices(unapplied);
    }
  }, [changeSet?.ops, changeSet?.appliedOpIndices, selectedIndices.size]);

  const handleApplySelected = async (opts?: { closeAfter?: boolean }) => {
    setIsApplying(true);
    try {
      await applyChangeSetOps({
        changeSetId,
        opIndices: Array.from(selectedIndices)
      });

      await onResolved?.({ status: "applied" });

      // Reset selection so applied ops aren't re-applied and the effect can re-select remaining.
      setSelectedIndices(new Set());

      const shouldClose = opts?.closeAfter ?? closeOnResolve;
      if (shouldClose) onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const handleDiscard = async () => {
    setIsApplying(true);
    try {
      await discardChangeSet({ changeSetId });

      await onResolved?.({ status: "discarded" });
      if (closeOnResolve) onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const toggleSelect = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedIndices(next);
  };

  const startEdit = (index: number, op: any) => {
    setEditingIndex(index);
    const payload = op.payload ?? {};
    setEditDraft(payload.fields ?? payload);
  };

  const saveEdit = async (index: number) => {
    if (!editDraft) return;
    await updateOp({
      changeSetId,
      opIndex: index,
      patch: { fields: editDraft }
    });
    setEditingIndex(null);
    setEditDraft(null);
  };

  if (!open || !mounted) return null;

  const ops = changeSet?.ops ?? [];
  const appliedIndices = changeSet?.appliedOpIndices ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[9000] flex justify-end pointer-events-none">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity pointer-events-auto"
        onClick={onClose}
      />
      <div
        className="w-[800px] h-full bg-white shadow-2xl relative z-10 flex flex-col pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 border-b px-6 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-base font-bold text-slate-900">Review Changes</h2>
            <div className="text-xs text-slate-500">{changeSet?.reason_he ?? "Proposed updates"}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-4">
          {!changeSet ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">Loading details...</div>
          ) : ops.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">No operations found.</div>
          ) : (
            ops.map((op: any, i: number) => {
              const isApplied = appliedIndices.includes(i);
              const isSelected = selectedIndices.has(i);
              const isExpanded = expandedIndex === i;
              const isEditing = editingIndex === i;
              const ref = getOpReference(op);
              const refLabel = ref?.key === "tempId"
                ? "New"
                : ref
                  ? (resolveRefName(ref.key, ref.value) ?? ref.value)
                  : "New";

              return (
                <div
                  key={i}
                  className={`bg-white border rounded-lg shadow-sm transition-all overflow-hidden ${isEditing ? "ring-2 ring-blue-500 border-transparent" : "border-slate-200"
                    }`}
                >
                  {/* Row Header */}
                  <div
                    className={`flex items-center p-3 gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors ${isApplied ? "bg-slate-50" : ""}`}
                    onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  >
                    {/* Checkbox */}
                    <button
                      disabled={isApplied}
                      onClick={(e) => { e.stopPropagation(); toggleSelect(i); }}
                      className="p-1 rounded text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isApplied ? (
                        <Check size={18} className="text-green-600" />
                      ) : isSelected ? (
                        <CheckSquare size={18} className="text-blue-600" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>

                    {/* Summary */}
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Badge kind={op.kind} />
                        <span className={`text-sm font-medium ${isApplied ? "text-slate-500 line-through" : "text-slate-800"}`}>
                          {getOpTitle(op)}
                        </span>
                      </div>
                      {isExpanded && !isEditing && (
                        <div className="text-[10px] text-slate-400 pl-1 font-mono">
                          REF: {refLabel}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {isApplied && <span className="text-xs font-bold text-green-600 px-2">Applied</span>}

                      {!isApplied && !isEditing && (
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(i, op); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      <div className={`transform transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                        <ChevronDown size={18} className="text-slate-400" />
                      </div>
                    </div>
                  </div>

                  {/* Details / Edit Panel */}
                  {(isExpanded || isEditing) && (
                    <div className="px-11 pb-4 pt-0 border-t border-slate-100/50">
                      {isEditing ? (
                        <div className="bg-blue-50/30 rounded-b-lg p-4 -mx-11 -mb-4 border-t border-blue-100">
                          <div className="text-xs font-bold text-blue-600 mb-3 uppercase tracking-wide">Editing Fields</div>
                          <div className="grid grid-cols-1 gap-3">
                            {Object.entries(editDraft || {}).map(([k, v]) => (
                              <div key={k}>
                                <label className="text-[11px] font-semibold text-slate-500 mb-1 block capitalize">{k}</label>
                                {/* Simple text input for now, ideally handle arrays/objects too */}
                                <input
                                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                                  value={typeof v === 'string' || typeof v === 'number' ? v : JSON.stringify(v)}
                                  onChange={(e) => setEditDraft({ ...editDraft, [k]: e.target.value })}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-4 justify-end border-t border-blue-200/50 pt-3">
                            <button onClick={() => setEditingIndex(null)} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-white hover:shadow-sm rounded-md transition-all">Cancel</button>
                            <button onClick={() => saveEdit(i)} className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-all flex items-center gap-2">
                              <Save size={14} /> Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-x-8 gap-y-3 mt-3">
                          {Object.entries(op.payload?.fields ?? op.payload ?? {}).map(([k, v]) => (
                            <div key={k} className="flex flex-col group">
                              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider group-hover:text-slate-500">{k}</span>
                              {renderFieldValue(k, v, resolveRefName)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t bg-white flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
          <div className="text-sm font-medium text-slate-600">
            {selectedIndices.size} item{selectedIndices.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDiscard}
              disabled={isApplying}
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Trash2 size={16} /> Discard
            </button>
            <button
              onClick={() => handleApplySelected()}
              disabled={isApplying || selectedIndices.size === 0}
              className="px-5 py-2.5 bg-green-600 rounded-lg text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center gap-2 shadow-sm"
            >
              {isApplying ? <RotateCcw className="animate-spin" size={16} /> : <Check size={16} />}
              {isApplying ? "Applying..." : `Apply Selected`}
            </button>

            {showApplyAndContinue ? (
              <button
                onClick={() => handleApplySelected({ closeAfter: false })}
                disabled={isApplying || selectedIndices.size === 0}
                className="px-5 py-2.5 bg-black rounded-lg text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center gap-2 shadow-sm"
                title="Apply selected ops and continue the Flow"
              >
                {isApplying ? <RotateCcw className="animate-spin" size={16} /> : <ChevronRight size={16} />}
                {isApplying ? "Applying..." : "Apply + Continue"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function renderFieldValue(
  key: string,
  value: any,
  resolveRefName: (key: string, value: any) => string | null
) {
  if (Array.isArray(value)) {
    if (key === "checklist" || key === "lineItems") {
      return (
        <div className="space-y-1 mt-1">
          {value.map((item: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-slate-50 p-1.5 rounded border border-slate-100">
              <input type="checkbox" checked={!!item.done} readOnly className="mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-slate-700">{item.title ?? item.description ?? "Item"}</div>
                {item.workTypeLabelHe && <div className="text-[10px] text-slate-400">{item.workTypeLabelHe}</div>}
              </div>
            </div>
          ))}
        </div>
      )
    }
    return <span className="text-xs font-mono text-slate-500 break-all">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "object" && value !== null) {
    return <span className="text-xs font-mono text-slate-500 break-all">{JSON.stringify(value)}</span>;
  }
  const resolvedValue = resolveRefName(key, value);
  return (
    <span className="text-sm text-slate-700 font-medium break-words leading-relaxed">
      {String(resolvedValue ?? value)}
    </span>
  );
}

function Badge({ kind }: { kind: string }) {
  const parts = kind.split('.');
  const entity = parts[0];
  const action = parts[1] ?? "update";

  let bg = "bg-slate-100";
  let text = "text-slate-600";

  if (action === "create") { bg = "bg-green-100"; text = "text-green-700"; }
  if (action === "delete") { bg = "bg-red-100"; text = "text-red-700"; }
  if (action === "update" || action === "patch") { bg = "bg-blue-100"; text = "text-blue-700"; }

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${bg} ${text}`}>
      {action} {entity}
    </span>
  );
}

function getOpTitle(op: any) {
  const payload = op.payload ?? {};
  const fields = payload.fields ?? payload;
  return fields.title ?? fields.name ?? fields.label ?? fields.itemName ?? "Untitled Update";
}
