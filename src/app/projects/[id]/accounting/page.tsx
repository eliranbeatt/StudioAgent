"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

type TabKey = "summary" | "materials" | "labor";

type MaterialLine = {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
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
  const ensureElementDraft = useMutation(api.drafts.ensureElementDraft);
  const ensureProjectCostDraft = useMutation(api.drafts.ensureProjectCostDraft);
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
            Baseline, forecast, and line-item edits powered by draft snapshots.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-mono">
            Draft view + reconciliation
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
          onEnsureElementDraft={ensureElementDraft}
          onEnsureProjectCostDraft={ensureProjectCostDraft}
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
          onEnsureElementDraft={ensureElementDraft}
          onEnsureProjectCostDraft={ensureProjectCostDraft}
          onSavingLineId={setSavingLineId}
        />
      ) : null}
    </div>
  );
}

import { AccountingSummaryBlock } from "./AccountingSummaryBlock";
import { ApprovedBudgetRow } from "./ApprovedBudgetRow";
import { ElementBreakdownTable } from "./ElementBreakdownTable";

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
  onEnsureElementDraft,
  onEnsureProjectCostDraft,
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
  onEnsureElementDraft: (args: {
    projectId: Id<"projects">;
    elementId: Id<"elements">;
  }) => Promise<{ draftId: string; revisionNumber: number }>;
  onEnsureProjectCostDraft: (args: {
    projectId: Id<"projects">;
  }) => Promise<{ draftId: string; revisionNumber: number }>;
  onSavingLineId: (value: string | null) => void;
}) {
  const [collapsedByElement, setCollapsedByElement] = useState<Record<string, boolean>>({});

  const resolveDraft = async ({
    draftType,
    draftId,
    revisionNumber,
    elementId,
  }: {
    draftType: "element" | "projectCost";
    draftId?: string;
    revisionNumber?: number;
    elementId?: Id<"elements">;
  }) => {
    if (draftId && revisionNumber !== undefined) {
      return { draftId, revisionNumber };
    }
    if (draftType === "element" && elementId) {
      return await onEnsureElementDraft({ projectId, elementId });
    }
    if (draftType === "projectCost") {
      return await onEnsureProjectCostDraft({ projectId });
    }
    return { draftId: undefined, revisionNumber: undefined };
  };

  const addMaterialLine = async ({
    draftType,
    draftId,
    revisionNumber,
    elementId,
  }: {
    draftType: "element" | "projectCost";
    draftId?: string;
    revisionNumber?: number;
    elementId?: Id<"elements">;
  }) => {
    try {
      const resolved = await resolveDraft({
        draftType,
        draftId,
        revisionNumber,
        elementId,
      });

      if (!resolved.draftId || resolved.revisionNumber === undefined) {
        alert("Failed to resolve draft.");
        return;
      }

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
    draftId,
    revisionNumber,
    elementId,
  }: {
    lineId: string;
    draftType: "element" | "projectCost";
    draftId?: string;
    revisionNumber?: number;
    elementId?: Id<"elements">;
  }) => {
    if (!confirm("Delete this material line?")) return;

    try {
      const resolved = await resolveDraft({
        draftType,
        draftId,
        revisionNumber,
        elementId,
      });

      if (!resolved.draftId || resolved.revisionNumber === undefined) {
        alert("Could not create/find draft for deletion.");
        return;
      }

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

  return (
    <div className="space-y-8">
      {accounting.elements.map((element: any) => (
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
                  draftId: element.draftId,
                  revisionNumber: element.revisionNumber,
                  elementId: element.elementId,
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          {collapsedByElement[element.elementId] ? null : (
            <div className="divide-y">
              {element.materials.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">No materials</div>
              ) : (
                element.materials.map((line: MaterialLine) => (
                  <MaterialLineRow
                    key={line.id}
                    line={line}
                    tasks={tasks}
                    projectId={projectId}
                    saving={savingLineId === line.id}
                    onDelete={() =>
                      handleDeleteLine({
                        lineId: line.id,
                        draftType: "element",
                        draftId: element.draftId,
                        revisionNumber: element.revisionNumber,
                        elementId: element.elementId,
                      })
                    }
                    onSave={async (next) => {
                      onSavingLineId(line.id);
                      try {
                        const resolved = await resolveDraft({
                          draftType: "element",
                          draftId: element.draftId,
                          revisionNumber: element.revisionNumber,
                          elementId: element.elementId,
                        });

                        if (!resolved.draftId || resolved.revisionNumber === undefined) {
                          alert("Failed to resolve draft");
                          return;
                        }

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
      ))}

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
                  draftId: accounting.projectCosts.draftId,
                  revisionNumber: accounting.projectCosts.revisionNumber,
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
              accounting.projectCosts.materials.map((line: MaterialLine) => (
                <MaterialLineRow
                  key={line.id}
                  line={line}
                  tasks={tasks}
                  projectId={projectId}
                  saving={savingLineId === line.id}
                  onDelete={() =>
                    handleDeleteLine({
                      lineId: line.id,
                      draftType: "projectCost",
                      draftId: accounting.projectCosts.draftId,
                      revisionNumber: accounting.projectCosts.revisionNumber,
                    })
                  }
                  onSave={async (next) => {
                    onSavingLineId(line.id);
                    try {
                      const resolved = await resolveDraft({
                        draftType: "projectCost",
                        draftId: accounting.projectCosts.draftId,
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      });

                      if (!resolved.draftId || resolved.revisionNumber === undefined) return;

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
              ))
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
  onEnsureElementDraft,
  onEnsureProjectCostDraft,
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
  onEnsureElementDraft: (args: {
    projectId: Id<"projects">;
    elementId: Id<"elements">;
  }) => Promise<{ draftId: string; revisionNumber: number }>;
  onEnsureProjectCostDraft: (args: {
    projectId: Id<"projects">;
  }) => Promise<{ draftId: string; revisionNumber: number }>;
  onSavingLineId: (value: string | null) => void;
}) {
  const [collapsedByElement, setCollapsedByElement] = useState<Record<string, boolean>>({});

  const resolveDraft = async ({
    draftType,
    draftId,
    revisionNumber,
    elementId,
  }: {
    draftType: "element" | "projectCost";
    draftId?: string;
    revisionNumber?: number;
    elementId?: Id<"elements">;
  }) => {
    if (draftId && revisionNumber !== undefined) {
      return { draftId, revisionNumber };
    }
    if (draftType === "element" && elementId) {
      return await onEnsureElementDraft({ projectId, elementId });
    }
    if (draftType === "projectCost") {
      return await onEnsureProjectCostDraft({ projectId });
    }
    return { draftId: undefined, revisionNumber: undefined };
  };

  const addLaborLine = async ({
    draftType,
    draftId,
    revisionNumber,
    elementId,
  }: {
    draftType: "element" | "projectCost";
    draftId?: string;
    revisionNumber?: number;
    elementId?: Id<"elements">;
  }) => {
    try {
      const resolved = await resolveDraft({
        draftType,
        draftId,
        revisionNumber,
        elementId,
      });

      if (!resolved.draftId || resolved.revisionNumber === undefined) {
        alert("Failed to resolve draft.");
        return;
      }

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
    draftId,
    revisionNumber,
    elementId,
  }: {
    lineId: string;
    draftType: "element" | "projectCost";
    draftId?: string;
    revisionNumber?: number;
    elementId?: Id<"elements">;
  }) => {
    if (!confirm("Delete this labor line?")) return;

    try {
      const resolved = await resolveDraft({
        draftType,
        draftId,
        revisionNumber,
        elementId,
      });

      if (!resolved.draftId || resolved.revisionNumber === undefined) {
        alert("Could not create/find draft for deletion.");
        return;
      }

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

  return (
    <div className="space-y-8">
      {accounting.elements.map((element: any) => (
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
                  draftId: element.draftId,
                  revisionNumber: element.revisionNumber,
                  elementId: element.elementId,
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          {collapsedByElement[element.elementId] ? null : (
            <div className="divide-y">
              {element.labor.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">No labor</div>
              ) : (
                element.labor.map((line: LaborLine) => (
                  <LaborLineRow
                    key={line.id}
                    line={line}
                    tasks={tasks}
                    projectId={projectId}
                    saving={savingLineId === line.id}
                    onDelete={() =>
                      handleDeleteLine({
                        lineId: line.id,
                        draftType: "element",
                        draftId: element.draftId,
                        revisionNumber: element.revisionNumber,
                        elementId: element.elementId,
                      })
                    }
                    onSave={async (next) => {
                      onSavingLineId(line.id);
                      try {
                        const resolved = await resolveDraft({
                          draftType: "element",
                          draftId: element.draftId,
                          revisionNumber: element.revisionNumber,
                          elementId: element.elementId,
                        });

                        if (!resolved.draftId || resolved.revisionNumber === undefined) {
                          alert("Failed to resolve draft");
                          return;
                        }

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
      ))}

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
                  draftId: accounting.projectCosts.draftId,
                  revisionNumber: accounting.projectCosts.revisionNumber,
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
              accounting.projectCosts.labor.map((line: LaborLine) => (
                <LaborLineRow
                  key={line.id}
                  line={line}
                  tasks={tasks}
                  projectId={projectId}
                  saving={savingLineId === line.id}
                  onDelete={() =>
                    handleDeleteLine({
                      lineId: line.id,
                      draftType: "projectCost",
                      draftId: accounting.projectCosts.draftId,
                      revisionNumber: accounting.projectCosts.revisionNumber,
                    })
                  }
                  onSave={async (next) => {
                    onSavingLineId(line.id);
                    try {
                      const resolved = await resolveDraft({
                        draftType: "projectCost",
                        draftId: accounting.projectCosts.draftId,
                        revisionNumber: accounting.projectCosts.revisionNumber,
                      });

                      if (!resolved.draftId || resolved.revisionNumber === undefined) return;

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
              ))
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
  onDelete,
  onSave,
}: {
  line: MaterialLine;
  tasks: TaskOption[];
  projectId: Id<"projects">;
  saving: boolean;
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

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-10 gap-3 items-center text-sm">
      <div className="md:col-span-2">
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
        <div className="uppercase font-semibold text-gray-400">Actual</div>
        <div className="font-mono text-gray-700">
          {actualTotal === null || actualTotal === undefined
            ? "--"
            : `${Math.round(actualTotal).toLocaleString()} NIS`}
        </div>
        <div className="mt-2 uppercase font-semibold text-gray-400">Variance</div>
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
  onDelete,
  onSave,
}: {
  line: LaborLine;
  tasks: TaskOption[];
  projectId: Id<"projects">;
  saving: boolean;
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

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-10 gap-3 items-center text-sm">
      <div className="md:col-span-2">
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
        <div className="uppercase font-semibold text-gray-400">Actual</div>
        <div className="font-mono text-gray-700">
          {actualTotal === null || actualTotal === undefined
            ? "--"
            : `${Math.round(actualTotal).toLocaleString()} NIS`}
        </div>
        <div className="mt-2 uppercase font-semibold text-gray-400">Variance</div>
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