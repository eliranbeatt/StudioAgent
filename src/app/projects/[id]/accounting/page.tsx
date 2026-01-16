"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { AccountingSummaryBlock } from "./AccountingSummaryBlock";
import { ApprovedBudgetRow } from "./ApprovedBudgetRow";
import { ElementBreakdownTable } from "./ElementBreakdownTable";

type TabKey = "summary" | "materials" | "labor";

type MaterialLine = {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  order?: number;
  actualQty?: number;
  actualUnitCost?: number;
  actualTotal?: number;
  taskIds: string[];
};

type LaborLine = {
  id: string;
  role: string;
  qty: number;
  rate: number;
  order?: number;
  actualQty?: number;
  actualRate?: number;
  actualTotal?: number;
  taskIds: string[];
};

type TaskOption = {
  id: string;
  title: string;
  elementTitle?: string;
};

const getLineOrderValue = (line: { order?: number }, fallback: number) =>
  Number.isFinite(line.order) ? (line.order as number) : fallback;

const sortLines = <T extends { id: string; order?: number }>(lines: T[]) =>
  lines
    .map((line, index) => ({
      line,
      order: getLineOrderValue(line, index),
      index,
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.line);

const getNextOrder = (lines: Array<{ order?: number }>) => {
  if (!lines.length) return 1;
  const maxOrder = Math.max(
    ...lines.map((line, index) => getLineOrderValue(line, index))
  );
  return maxOrder + 1;
};

export default function AccountingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const summary = useQuery(api.financials.getFinancialSummary, { projectId });
  const accounting = useQuery(api.financials.getAccountingView, { projectId });
  const tasksData = useQuery(api.tasks.listForProject, { projectId });
  const pendingGraveyard = useQuery(api.graveyard.listPending, { projectId });
  const applyChangeSet = useMutation(api.drafts.applyChangeSet);
  
  const [tab, setTab] = useState<TabKey>("summary");
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  const pendingCount = pendingGraveyard?.length ?? 0;
  const taskOptions: TaskOption[] = tasksData?.tasks ?? [];

  if (!summary || !accounting) {
    return <div className="p-8">Loading accounting data...</div>;
  }

  const handleApplyOps = async ({
    draftType,
    draftId,
    baseRevisionNumber,
    patchOps,
    reason,
  }: {
    draftType: "element" | "projectCost";
    draftId: string;
    baseRevisionNumber: number;
    patchOps: any[];
    reason: string;
  }) => {
    await applyChangeSet({
      draftType,
      draftId,
      projectId,
      patchOps,
      baseRevisionNumber,
      reason,
      createdFrom: { tab: "Accounting", stage: "planning" },
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Accounting
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Baseline, forecast, and live line-item edits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-mono font-bold">
            Live View
          </div>
        </div>
      </div>

      {pendingCount > 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 mt-1" size={18} />
            <div>
              <div className="text-sm font-semibold text-amber-800">
                {pendingCount} graveyard decision
                {pendingCount > 1 ? "s" : ""} pending
              </div>
              <div className="text-xs text-amber-700">
                Resolve flagged changes before approving drafts.
              </div>
            </div>
          </div>
          <Link
            href={`/projects/${projectId}/graveyard`}
            className="text-xs font-semibold text-amber-800 hover:text-amber-900"
          >
            Review
          </Link>
        </div>
      ) : null}

      <div className="flex items-center gap-3 mb-6">
        <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
          Summary
        </TabButton>
        <TabButton
          active={tab === "materials"}
          onClick={() => setTab("materials")}
        >
          Materials
        </TabButton>
        <TabButton active={tab === "labor"} onClick={() => setTab("labor")}>
          Labor
        </TabButton>
      </div>

      {tab === "summary" ? (
        <SummaryTab
          projectId={projectId}
          summary={summary}
          accounting={accounting}
          projectDefaults={summary.defaults}
        />
      ) : null}

      {tab === "materials" ? (
        <MaterialsTab
          projectId={projectId}
          accounting={accounting}
          tasks={taskOptions}
          savingLineId={savingLineId}
          onApplyOps={handleApplyOps}
          onSavingLineId={setSavingLineId}
        />
      ) : null}

      {tab === "labor" ? (
        <LaborTab
          projectId={projectId}
          accounting={accounting}
          tasks={taskOptions}
          savingLineId={savingLineId}
          onApplyOps={handleApplyOps}
          onSavingLineId={setSavingLineId}
        />
      ) : null}
    </div>
  );
}

function SummaryTab({
  projectId,
  summary,
  accounting,
  projectDefaults,
}: {
  projectId: Id<"projects">;
  summary: any;
  accounting: any;
  projectDefaults: any;
}) {
  return (
    <div className="space-y-8">
      <AccountingSummaryBlock
        projectId={projectId}
        summary={summary}
        accounting={accounting}
        projectDefaults={projectDefaults}
      />

      <ApprovedBudgetRow summary={summary} />

      <ElementBreakdownTable
        projectId={projectId}
        accounting={accounting}
        margins={projectDefaults}
      />
    </div>
  );
}

function MaterialsTab({
  projectId,
  accounting,
  tasks,
  savingLineId,
  onApplyOps,
  onSavingLineId,
}: {
  projectId: Id<"projects">;
  accounting: any;
  tasks: TaskOption[];
  savingLineId: string | null;
  onApplyOps: (args: {
    draftType: "element" | "projectCost";
    draftId: string;
    baseRevisionNumber: number;
    patchOps: any[];
    reason: string;
  }) => Promise<void>;
  onSavingLineId: (value: string | null) => void;
}) {
  const [collapsedByElement, setCollapsedByElement] = useState<Record<string, boolean>>({});

  const resolveDraft = async ({
    draftType,
    elementId,
    revisionNumber,
  }: {
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
  }) => {
    if (draftType === "element" && elementId) {
      return { draftId: elementId as string, revisionNumber: revisionNumber ?? 0 };
    }
    return { draftId: projectId as string, revisionNumber: 0 };
  };

  const addMaterialLine = async ({
    draftType,
    elementId,
    revisionNumber,
    order,
  }: {
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
    order?: number;
  }) => {
    try {
      const resolved = await resolveDraft({ draftType, elementId, revisionNumber });
      if (!resolved.draftId) return;

      const id = `mat_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const patchOps = [
        {
          op: "add",
          path: `/materials/byId/${id}`,
          value: {
            id,
            name: "New material",
            qty: 1,
            unitCost: 0,
            order: order ?? 1,
            links: { taskIds: [] },
            procurement: { mode: "purchase" },
            needPurchase: true,
          },
        },
      ];
      await onApplyOps({
        draftType,
        draftId: resolved.draftId,
        baseRevisionNumber: resolved.revisionNumber,
        patchOps,
        reason: "Add material line",
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to add line: ${e.message}`);
    }
  };

  const handleDeleteLine = async ({
    lineId,
    draftType,
    elementId,
    revisionNumber,
  }: {
    lineId: string;
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
  }) => {
    if (!confirm("Delete this material line?")) return;

    try {
      const resolved = await resolveDraft({ draftType, elementId, revisionNumber });
      if (!resolved.draftId) return;

      await onApplyOps({
        draftType,
        draftId: resolved.draftId,
        baseRevisionNumber: resolved.revisionNumber,
        patchOps: [
          { op: "tombstone", path: `/materials/byId/${lineId}`, value: { deletedAt: "now" } },
        ],
        reason: "Delete material line",
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to delete line: ${e.message}`);
    }
  };

  const handleMoveLine = async ({
    lineId,
    direction,
    lines,
    draftType,
    elementId,
    revisionNumber,
  }: {
    lineId: string;
    direction: -1 | 1;
    lines: MaterialLine[];
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
  }) => {
    const sorted = sortLines(lines);
    const index = sorted.findIndex((line) => line.id === lineId);
    const target = sorted[index + direction];
    if (index === -1 || !target) return;

    try {
      const resolved = await resolveDraft({ draftType, elementId, revisionNumber });
      if (!resolved.draftId) return;

      const currentOrder = getLineOrderValue(sorted[index], index);
      const targetOrder = getLineOrderValue(target, index + direction);

      await onApplyOps({
        draftType,
        draftId: resolved.draftId,
        baseRevisionNumber: resolved.revisionNumber,
        patchOps: [
          { op: "replace", path: `/materials/byId/${lineId}/order`, value: targetOrder },
          { op: "replace", path: `/materials/byId/${target.id}/order`, value: currentOrder },
        ],
        reason: "Reorder material line",
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to reorder line: ${e.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {accounting.elements.map((element: any) => {
        const sortedMaterials = sortLines(element.materials as MaterialLine[]);
        return (
          <div
            key={element.elementId}
            className="bg-white border border-gray-100 rounded-xl shadow-sm"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setCollapsedByElement((prev) => ({
                      ...prev,
                      [element.elementId]: !prev[element.elementId],
                    }))
                  }
                  className="text-gray-400 hover:text-gray-700"
                >
                  {collapsedByElement[element.elementId] ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
                <div>
                  <div className="font-semibold text-gray-900">{element.title}</div>
                  <div className="text-xs text-gray-500">
                    Materials: {element.totals.materials.toLocaleString()} NIS
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  addMaterialLine({
                    draftType: "element",
                    elementId: element.elementId,
                    revisionNumber: element.revisionNumber,
                    order: getNextOrder(element.materials),
                  })
                }
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <Plus size={14} /> Add line
              </button>
            </div>
            {collapsedByElement[element.elementId] ? null : (
              <div className="divide-y">
                {sortedMaterials.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">No materials</div>
                ) : (
                  sortedMaterials.map((line: MaterialLine, index: number) => (
                    <MaterialLineRow
                      key={line.id}
                      line={line}
                      tasks={tasks}
                      projectId={projectId}
                      saving={savingLineId === line.id}
                      canMoveUp={index > 0}
                      canMoveDown={index < sortedMaterials.length - 1}
                      onMoveUp={() =>
                        handleMoveLine({
                          lineId: line.id,
                          direction: -1,
                          lines: sortedMaterials,
                          draftType: "element",
                          elementId: element.elementId,
                          revisionNumber: element.revisionNumber,
                        })
                      }
                      onMoveDown={() =>
                        handleMoveLine({
                          lineId: line.id,
                          direction: 1,
                          lines: sortedMaterials,
                          draftType: "element",
                          elementId: element.elementId,
                          revisionNumber: element.revisionNumber,
                        })
                      }
                      onDelete={() =>
                        handleDeleteLine({
                          lineId: line.id,
                          draftType: "element",
                          elementId: element.elementId,
                          revisionNumber: element.revisionNumber,
                        })
                      }
                      onSave={async (next) => {
                        onSavingLineId(line.id);
                        try {
                          const resolved = await resolveDraft({
                            draftType: "element",
                            elementId: element.elementId,
                            revisionNumber: element.revisionNumber,
                          });
                          if (!resolved.draftId) return;

                          const patchOps = buildMaterialPatchOps(line.id, next);
                          await onApplyOps({
                            draftType: "element",
                            draftId: resolved.draftId,
                            baseRevisionNumber: resolved.revisionNumber,
                            patchOps,
                            reason: "Update material line",
                          });
                        } catch (e: any) {
                          console.error(e);
                          alert(`Failed to save: ${e.message}`);
                        } finally {
                          onSavingLineId(null);
                        }
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {accounting.projectCosts ? (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">
                Project Level Costs
              </div>
              <div className="text-xs text-gray-500">
                Materials: {accounting.projectCosts.totals.materials.toLocaleString()} NIS
              </div>
            </div>
            <button
              onClick={() =>
                addMaterialLine({
                  draftType: "projectCost",
                  revisionNumber: accounting.projectCosts.revisionNumber,
                  order: getNextOrder(accounting.projectCosts.materials),
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          <div className="divide-y">
            {accounting.projectCosts.materials.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No materials</div>
            ) : (
              sortLines(accounting.projectCosts.materials as MaterialLine[]).map(
                (line: MaterialLine, index: number, lines: MaterialLine[]) => (
                  <MaterialLineRow
                    key={line.id}
                    line={line}
                    tasks={tasks}
                    projectId={projectId}
                    saving={savingLineId === line.id}
                    canMoveUp={index > 0}
                    canMoveDown={index < lines.length - 1}
                    onMoveUp={() =>
                      handleMoveLine({
                        lineId: line.id,
                        direction: -1,
                        lines,
                        draftType: "projectCost",
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      })
                    }
                    onMoveDown={() =>
                      handleMoveLine({
                        lineId: line.id,
                        direction: 1,
                        lines,
                        draftType: "projectCost",
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      })
                    }
                    onDelete={() =>
                      handleDeleteLine({
                        lineId: line.id,
                        draftType: "projectCost",
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      })
                    }
                    onSave={async (next) => {
                      onSavingLineId(line.id);
                      try {
                        const resolved = await resolveDraft({
                          draftType: "projectCost",
                          revisionNumber: accounting.projectCosts.revisionNumber,
                        });
                        if (!resolved.draftId) return;

                        const patchOps = buildMaterialPatchOps(line.id, next);
                        await onApplyOps({
                          draftType: "projectCost",
                          draftId: resolved.draftId,
                          baseRevisionNumber: resolved.revisionNumber,
                          patchOps,
                          reason: "Update project cost material",
                        });
                      } catch (e: any) {
                        console.error(e);
                        alert(`Failed to save: ${e.message}`);
                      } finally {
                        onSavingLineId(null);
                      }
                    }}
                  />
                )
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LaborTab({
  projectId,
  accounting,
  tasks,
  savingLineId,
  onApplyOps,
  onSavingLineId,
}: {
  projectId: Id<"projects">;
  accounting: any;
  tasks: TaskOption[];
  savingLineId: string | null;
  onApplyOps: (args: {
    draftType: "element" | "projectCost";
    draftId: string;
    baseRevisionNumber: number;
    patchOps: any[];
    reason: string;
  }) => Promise<void>;
  onSavingLineId: (value: string | null) => void;
}) {
  const [collapsedByElement, setCollapsedByElement] = useState<Record<string, boolean>>({});

  const resolveDraft = async ({
    draftType,
    elementId,
    revisionNumber,
  }: {
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
  }) => {
    if (draftType === "element" && elementId) {
      return { draftId: elementId as string, revisionNumber: revisionNumber ?? 0 };
    }
    return { draftId: projectId as string, revisionNumber: 0 };
  };

  const addLaborLine = async ({
    draftType,
    elementId,
    revisionNumber,
    order,
  }: {
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
    order?: number;
  }) => {
    try {
      const resolved = await resolveDraft({ draftType, elementId, revisionNumber });
      if (!resolved.draftId) return;

      const id = `lab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const patchOps = [
        {
          op: "add",
          path: `/labor/byId/${id}`,
          value: {
            id,
            role: "New role",
            qty: 1,
            rate: 0,
            order: order ?? 1,
            links: { taskIds: [] },
          },
        },
      ];
      await onApplyOps({
        draftType,
        draftId: resolved.draftId,
        baseRevisionNumber: resolved.revisionNumber,
        patchOps,
        reason: "Add labor line",
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to add line: ${e.message}`);
    }
  };

  const handleDeleteLine = async ({
    lineId,
    draftType,
    elementId,
    revisionNumber,
  }: {
    lineId: string;
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
  }) => {
    if (!confirm("Delete this labor line?")) return;

    try {
      const resolved = await resolveDraft({ draftType, elementId, revisionNumber });
      if (!resolved.draftId) return;

      await onApplyOps({
        draftType,
        draftId: resolved.draftId,
        baseRevisionNumber: resolved.revisionNumber,
        patchOps: [
          { op: "tombstone", path: `/labor/byId/${lineId}`, value: { deletedAt: "now" } },
        ],
        reason: "Delete labor line",
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to delete line: ${e.message}`);
    }
  };

  const handleMoveLine = async ({
    lineId,
    direction,
    lines,
    draftType,
    elementId,
    revisionNumber,
  }: {
    lineId: string;
    direction: -1 | 1;
    lines: LaborLine[];
    draftType: "element" | "projectCost";
    elementId?: Id<"elements">;
    revisionNumber?: number;
  }) => {
    const sorted = sortLines(lines);
    const index = sorted.findIndex((line) => line.id === lineId);
    const target = sorted[index + direction];
    if (index === -1 || !target) return;

    try {
      const resolved = await resolveDraft({ draftType, elementId, revisionNumber });
      if (!resolved.draftId) return;

      const currentOrder = getLineOrderValue(sorted[index], index);
      const targetOrder = getLineOrderValue(target, index + direction);

      await onApplyOps({
        draftType,
        draftId: resolved.draftId,
        baseRevisionNumber: resolved.revisionNumber,
        patchOps: [
          { op: "replace", path: `/labor/byId/${lineId}/order`, value: targetOrder },
          { op: "replace", path: `/labor/byId/${target.id}/order`, value: currentOrder },
        ],
        reason: "Reorder labor line",
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to reorder line: ${e.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {accounting.elements.map((element: any) => {
        const sortedLabor = sortLines(element.labor as LaborLine[]);
        return (
          <div
            key={element.elementId}
            className="bg-white border border-gray-100 rounded-xl shadow-sm"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setCollapsedByElement((prev) => ({
                      ...prev,
                      [element.elementId]: !prev[element.elementId],
                    }))
                  }
                  className="text-gray-400 hover:text-gray-700"
                >
                  {collapsedByElement[element.elementId] ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
                <div>
                  <div className="font-semibold text-gray-900">{element.title}</div>
                  <div className="text-xs text-gray-500">
                    Labor: {element.totals.labor.toLocaleString()} NIS
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  addLaborLine({
                    draftType: "element",
                    elementId: element.elementId,
                    revisionNumber: element.revisionNumber,
                    order: getNextOrder(element.labor),
                  })
                }
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
              >
                <Plus size={14} /> Add line
              </button>
            </div>
            {collapsedByElement[element.elementId] ? null : (
              <div className="divide-y">
                {sortedLabor.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">No labor</div>
                ) : (
                  sortedLabor.map((line: LaborLine, index: number) => (
                    <LaborLineRow
                      key={line.id}
                      line={line}
                      tasks={tasks}
                      projectId={projectId}
                      saving={savingLineId === line.id}
                      canMoveUp={index > 0}
                      canMoveDown={index < sortedLabor.length - 1}
                      onMoveUp={() =>
                        handleMoveLine({
                          lineId: line.id,
                          direction: -1,
                          lines: sortedLabor,
                          draftType: "element",
                          elementId: element.elementId,
                          revisionNumber: element.revisionNumber,
                        })
                      }
                      onMoveDown={() =>
                        handleMoveLine({
                          lineId: line.id,
                          direction: 1,
                          lines: sortedLabor,
                          draftType: "element",
                          elementId: element.elementId,
                          revisionNumber: element.revisionNumber,
                        })
                      }
                      onDelete={() =>
                        handleDeleteLine({
                          lineId: line.id,
                          draftType: "element",
                          elementId: element.elementId,
                          revisionNumber: element.revisionNumber,
                        })
                      }
                      onSave={async (next) => {
                        onSavingLineId(line.id);
                        try {
                          const resolved = await resolveDraft({
                            draftType: "element",
                            elementId: element.elementId,
                            revisionNumber: element.revisionNumber,
                          });
                          if (!resolved.draftId) return;

                          const patchOps = buildLaborPatchOps(line.id, next);
                          await onApplyOps({
                            draftType: "element",
                            draftId: resolved.draftId,
                            baseRevisionNumber: resolved.revisionNumber,
                            patchOps,
                            reason: "Update labor line",
                          });
                        } catch (e: any) {
                          console.error(e);
                          alert(`Failed to save: ${e.message}`);
                        } finally {
                          onSavingLineId(null);
                        }
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {accounting.projectCosts ? (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">
                Project Level Costs
              </div>
              <div className="text-xs text-gray-500">
                Labor: {accounting.projectCosts.totals.labor.toLocaleString()} NIS
              </div>
            </div>
            <button
              onClick={() =>
                addLaborLine({
                  draftType: "projectCost",
                  revisionNumber: accounting.projectCosts.revisionNumber,
                  order: getNextOrder(accounting.projectCosts.labor),
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          <div className="divide-y">
            {accounting.projectCosts.labor.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No labor</div>
            ) : (
              sortLines(accounting.projectCosts.labor as LaborLine[]).map(
                (line: LaborLine, index: number, lines: LaborLine[]) => (
                  <LaborLineRow
                    key={line.id}
                    line={line}
                    tasks={tasks}
                    projectId={projectId}
                    saving={savingLineId === line.id}
                    canMoveUp={index > 0}
                    canMoveDown={index < lines.length - 1}
                    onMoveUp={() =>
                      handleMoveLine({
                        lineId: line.id,
                        direction: -1,
                        lines,
                        draftType: "projectCost",
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      })
                    }
                    onMoveDown={() =>
                      handleMoveLine({
                        lineId: line.id,
                        direction: 1,
                        lines,
                        draftType: "projectCost",
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      })
                    }
                    onDelete={() =>
                      handleDeleteLine({
                        lineId: line.id,
                        draftType: "projectCost",
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      })
                    }
                    onSave={async (next) => {
                      onSavingLineId(line.id);
                      try {
                        const resolved = await resolveDraft({
                          draftType: "projectCost",
                          revisionNumber: accounting.projectCosts.revisionNumber,
                        });
                        if (!resolved.draftId) return;

                        const patchOps = buildLaborPatchOps(line.id, next);
                        await onApplyOps({
                          draftType: "projectCost",
                          draftId: resolved.draftId,
                          baseRevisionNumber: resolved.revisionNumber,
                          patchOps,
                          reason: "Update project cost labor",
                        });
                      } catch (e: any) {
                        console.error(e);
                        alert(`Failed to save: ${e.message}`);
                      } finally {
                        onSavingLineId(null);
                      }
                    }}
                  />
                )
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MaterialLineRow({
  line,
  tasks,
  projectId,
  saving,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSave,
}: {
  line: MaterialLine;
  tasks: TaskOption[];
  projectId: Id<"projects">;
  saving: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onSave: (next: MaterialLine) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<MaterialLine>(line);
  const active = isEditing ? draft : line;
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );

  const handleCancel = () => {
    setDraft(line);
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    await onSave(draft);
    setIsEditing(false);
  };

  const plannedTotal = active.qty * active.unitCost;
  const computedActualTotal =
    active.actualQty !== undefined && active.actualUnitCost !== undefined
      ? active.actualQty * active.actualUnitCost
      : null;
  const actualTotal =
    active.actualTotal !== undefined ? active.actualTotal : computedActualTotal;
  const gapTotal = actualTotal !== null && actualTotal !== undefined ? actualTotal - plannedTotal : null;
  const gapClass =
    gapTotal === null
      ? "text-gray-400"
      : gapTotal > 0
        ? "text-green-600"
        : gapTotal < 0
        ? "text-red-600"
        : "text-gray-500";
  const moveDisabled = saving || isEditing;

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-sm">
      <div className="md:col-span-3">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Name
        </div>
        <AutoResizeTextarea
          value={active.name}
          disabled={!isEditing || saving}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm min-h-[38px]"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Qty
        </div>
        <input
          type="number"
          value={active.qty}
          disabled={!isEditing || saving}
          onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Price
        </div>
        <input
          type="number"
          value={active.unitCost}
          disabled={!isEditing || saving}
          onChange={(e) =>
            setDraft({ ...draft, unitCost: Number(e.target.value) })
          }
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Total
        </div>
        <div className="w-full border border-gray-100 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600">
          {(active.qty * active.unitCost).toLocaleString()}
        </div>
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Actual Qty
        </div>
        <input
          type="number"
          value={active.actualQty ?? ""}
          disabled={!isEditing || saving}
          onChange={(e) =>
            setDraft({
              ...draft,
              actualQty: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Actual Price
        </div>
        <input
          type="number"
          value={active.actualUnitCost ?? ""}
          disabled={!isEditing || saving}
          onChange={(e) =>
            setDraft({
              ...draft,
              actualUnitCost:
                e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Actual Total
        </div>
        <div className="w-full border border-gray-100 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600">
          {actualTotal !== null && actualTotal !== undefined
            ? actualTotal.toLocaleString()
            : "--"}
        </div>
      </div>
      <div className="md:col-span-2">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Task Links
        </div>
        {isEditing ? (
          <select
            multiple
            value={active.taskIds ?? []}
            disabled={saving}
            onChange={(e) =>
              setDraft({
                ...draft,
                taskIds: Array.from(e.target.selectedOptions).map(
                  (option) => option.value
                ),
              })
            }
            className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm"
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.elementTitle ? `${task.elementTitle} / ${task.title}` : task.title}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.taskIds?.length ? (
              active.taskIds.map((taskId) => {
                const task = tasksById.get(taskId);
                if (!task) return null;
                return (
                  <Link
                    key={taskId}
                    href={`/projects/${projectId}/tasks?focus=${taskId}`}
                    className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full"
                  >
                    {task.title}
                  </Link>
                );
              })
            ) : (
              <div className="text-xs text-gray-400">No tasks</div>
            )}
          </div>
        )}
      </div>
      <div className="md:col-span-1 text-xs text-gray-500">
        <div className="uppercase font-semibold text-gray-400">Variance</div>
        <div className={`font-mono ${gapClass}`}>
          {gapTotal === null ? "--" : formatGap(gapTotal)}
        </div>
        {gapTotal === null ? (
          <div className="mt-1 text-[10px] text-amber-600 font-semibold uppercase">
            Missing actuals
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 md:col-span-1">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={moveDisabled || !canMoveUp}
            className={`p-1 rounded ${moveDisabled || !canMoveUp
              ? "text-gray-300"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            aria-label="Move material line up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={moveDisabled || !canMoveDown}
            className={`p-1 rounded ${moveDisabled || !canMoveDown
              ? "text-gray-300"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            aria-label="Move material line down"
          >
            <ArrowDown size={14} />
          </button>
        </div>
        {isEditing ? (
          <>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold text-green-600"
            >
              <Save size={14} /> Save
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"
            >
              <X size={14} /> Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setDraft(line);
                setIsEditing(true);
              }}
              className="text-xs font-semibold text-gray-600"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs font-semibold text-red-600 inline-flex items-center gap-1"
            >
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LaborLineRow({
  line,
  tasks,
  projectId,
  saving,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSave,
}: {
  line: LaborLine;
  tasks: TaskOption[];
  projectId: Id<"projects">;
  saving: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onSave: (next: LaborLine) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<LaborLine>(line);
  const active = isEditing ? draft : line;
  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );

  const handleCancel = () => {
    setDraft(line);
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    await onSave(draft);
    setIsEditing(false);
  };

  const plannedTotal = active.qty * active.rate;
  const computedActualTotal =
    active.actualQty !== undefined && active.actualRate !== undefined
      ? active.actualQty * active.actualRate
      : null;
  const actualTotal =
    active.actualTotal !== undefined ? active.actualTotal : computedActualTotal;
  const gapTotal = actualTotal !== null && actualTotal !== undefined ? actualTotal - plannedTotal : null;
  const gapClass =
    gapTotal === null
      ? "text-gray-400"
      : gapTotal > 0
        ? "text-green-600"
        : gapTotal < 0
        ? "text-red-600"
        : "text-gray-500";
  const moveDisabled = saving || isEditing;

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-sm">
      <div className="md:col-span-3">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Role
        </div>
        <AutoResizeTextarea
          value={active.role}
          disabled={!isEditing || saving}
          onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm min-h-[38px]"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Qty
        </div>
        <input
          type="number"
          value={active.qty}
          disabled={!isEditing || saving}
          onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Price
        </div>
        <input
          type="number"
          value={active.rate}
          disabled={!isEditing || saving}
          onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value) })}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Total
        </div>
        <div className="w-full border border-gray-100 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600">
          {(active.qty * active.rate).toLocaleString()}
        </div>
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Actual Qty
        </div>
        <input
          type="number"
          value={active.actualQty ?? ""}
          disabled={!isEditing || saving}
          onChange={(e) =>
            setDraft({
              ...draft,
              actualQty: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Actual Price
        </div>
        <input
          type="number"
          value={active.actualRate ?? ""}
          disabled={!isEditing || saving}
          onChange={(e) =>
            setDraft({
              ...draft,
              actualRate: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Actual Total
        </div>
        <div className="w-full border border-gray-100 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600">
          {actualTotal !== null && actualTotal !== undefined
            ? actualTotal.toLocaleString()
            : "--"}
        </div>
      </div>
      <div className="md:col-span-2">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Task Links
        </div>
        {isEditing ? (
          <select
            multiple
            value={active.taskIds ?? []}
            disabled={saving}
            onChange={(e) =>
              setDraft({
                ...draft,
                taskIds: Array.from(e.target.selectedOptions).map(
                  (option) => option.value
                ),
              })
            }
            className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm"
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.elementTitle ? `${task.elementTitle} / ${task.title}` : task.title}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.taskIds?.length ? (
              active.taskIds.map((taskId) => {
                const task = tasksById.get(taskId);
                if (!task) return null;
                return (
                  <Link
                    key={taskId}
                    href={`/projects/${projectId}/tasks?focus=${taskId}`}
                    className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full"
                  >
                    {task.title}
                  </Link>
                );
              })
            ) : (
              <div className="text-xs text-gray-400">No tasks</div>
            )}
          </div>
        )}
      </div>
      <div className="md:col-span-1 text-xs text-gray-500">
        <div className="uppercase font-semibold text-gray-400">Variance</div>
        <div className={`font-mono ${gapClass}`}>
          {gapTotal === null ? "--" : formatGap(gapTotal)}
        </div>
        {gapTotal === null ? (
          <div className="mt-1 text-[10px] text-amber-600 font-semibold uppercase">
            Missing actuals
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 md:col-span-1">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={moveDisabled || !canMoveUp}
            className={`p-1 rounded ${moveDisabled || !canMoveUp
              ? "text-gray-300"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            aria-label="Move labor line up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={moveDisabled || !canMoveDown}
            className={`p-1 rounded ${moveDisabled || !canMoveDown
              ? "text-gray-300"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            aria-label="Move labor line down"
          >
            <ArrowDown size={14} />
          </button>
        </div>
        {isEditing ? (
          <>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold text-green-600"
            >
              <Save size={14} /> Save
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"
            >
              <X size={14} /> Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setDraft(line);
                setIsEditing(true);
              }}
              className="text-xs font-semibold text-gray-600"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs font-semibold text-red-600 inline-flex items-center gap-1"
            >
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function buildMaterialPatchOps(id: string, next: MaterialLine) {
  return [
    { op: "replace", path: `/materials/byId/${id}/name`, value: next.name },
    { op: "replace", path: `/materials/byId/${id}/qty`, value: next.qty },
    { op: "replace", path: `/materials/byId/${id}/unitCost`, value: next.unitCost },
    {
      op: "replace",
      path: `/materials/byId/${id}/actualQty`,
      value: next.actualQty ?? null,
    },
    {
      op: "replace",
      path: `/materials/byId/${id}/actualUnitCost`,
      value: next.actualUnitCost ?? null,
    },
    {
      op: "replace",
      path: `/materials/byId/${id}/links/taskIds`,
      value: next.taskIds,
    },
  ];
}

function buildLaborPatchOps(id: string, next: LaborLine) {
  return [
    { op: "replace", path: `/labor/byId/${id}/role`, value: next.role },
    { op: "replace", path: `/labor/byId/${id}/qty`, value: next.qty },
    { op: "replace", path: `/labor/byId/${id}/rate`, value: next.rate },
    {
      op: "replace",
      path: `/labor/byId/${id}/actualQty`,
      value: next.actualQty ?? null,
    },
    {
      op: "replace",
      path: `/labor/byId/${id}/actualRate`,
      value: next.actualRate ?? null,
    },
    {
      op: "replace",
      path: `/labor/byId/${id}/links/taskIds`,
      value: next.taskIds,
    },
  ];
}

function formatGap(amount: number) {
  if (!Number.isFinite(amount)) return "--";
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString()} NIS`;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-600"
        }`}
    >
      {children}
    </button>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      disabled={disabled}
      className={`${className} overflow-hidden resize-none`}
      rows={1}
    />
  );
}