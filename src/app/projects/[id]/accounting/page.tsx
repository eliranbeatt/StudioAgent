"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  X,
  Download,
} from "lucide-react";
import { exportToExcel } from "../../../../lib/exportUtils";

import { AccountingSummaryBlock } from "./AccountingSummaryBlock";
import { ApprovedBudgetRow } from "./ApprovedBudgetRow";
import { ElementBreakdownTable } from "./ElementBreakdownTable";

type TabKey = "summary" | "materials" | "labor";
type SortKey = "default" | "planned" | "actual" | "gap";
type SortDirection = "asc" | "desc";

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
  elementId?: string;
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
  elementId?: string;
};

type TaskOption = {
  id: string;
  title: string;
  elementTitle?: string;
};

const getLineOrderValue = (line: { order?: number }, fallback: number) =>
  Number.isFinite(line.order) ? (line.order as number) : fallback;

const sortLines = <T extends { id: string; order?: number }>(
  lines: T[],
  sortKey: SortKey = "default",
  sortDirection: SortDirection = "asc",
  getPlanned?: (item: T) => number,
  getActual?: (item: T) => number
) =>
  lines
    .map((line, index) => {
      const planned = getPlanned ? getPlanned(line) : 0;
      const actual = getActual ? getActual(line) : 0;
      // Gap is distinct from actual - planned because actual might be incomplete/missing
      // But for sorting, we'll treat missing actual as 0 or handle it
      // Based on row logic: if actual is missing, gap is null.
      // Let's assume for sorting: if actual is 0/missing, gap = 0 - planned = -planned?
      // Or we can just compute it.
      return {
        line,
        order: getLineOrderValue(line, index),
        index,
        planned,
        actual,
        gap: actual - planned,
      };
    })
    .sort((a, b) => {
      let res = 0;
      if (sortKey === "planned") {
        res = a.planned - b.planned;
      } else if (sortKey === "actual") {
        res = a.actual - b.actual;
      } else if (sortKey === "gap") {
        res = a.gap - b.gap;
      } else {
        res = a.order - b.order || a.index - b.index;
      }
      return sortDirection === "asc" ? res : -res;
    })
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
  const addMaterialLine = useMutation(api.accounting.addMaterialLine);
  const updateMaterialLine = useMutation(api.accounting.updateMaterialLine);
  const deleteMaterialLine = useMutation(api.accounting.deleteMaterialLine);
  const addWorkLine = useMutation(api.accounting.addWorkLine);
  const updateWorkLine = useMutation(api.accounting.updateWorkLine);
  const deleteWorkLine = useMutation(api.accounting.deleteWorkLine);

  const [tab, setTab] = useState<TabKey>("summary");
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  const taskOptions: TaskOption[] = tasksData?.tasks ?? [];

  if (!summary || !accounting) {
    return <div className="p-8">Loading accounting data...</div>;
  }

  const handleExport = () => {
    if (!accounting || !summary) return;

    const margins = summary.defaults;

    // --- Overall Sheet ---
    const overallData: any[] = [];

    // Helper for margin calcs
    const getDerived = (base: number, type: "risk" | "overhead" | "profit") => {
      if (type === "risk") return base * margins.riskPct;
      if (type === "overhead") return base * margins.overheadPct;
      if (type === "profit") return base * margins.profitPct;
      return 0;
    };

    const processElementForOverall = (title: string, materials: number, labor: number) => {
      const base = materials + labor;
      const risk = getDerived(base, "risk");
      const overhead = getDerived(base, "overhead");
      const profit = getDerived(base, "profit");
      const total = base + risk + overhead + profit;
      return {
        Element: title,
        Materials: materials,
        Labor: labor,
        Risk: risk,
        Overhead: overhead,
        Profit: profit,
        "Total Customer Price": total
      };
    };

    accounting.elements.forEach((e: any) => {
      overallData.push(processElementForOverall(e.title, e.totals.materials, e.totals.labor));
    });

    if (accounting.projectCosts) {
      overallData.push(processElementForOverall("Project Level Costs", accounting.projectCosts.totals.materials, accounting.projectCosts.totals.labor));
    }

    const totalMaterials = overallData.reduce((sum, item) => sum + item.Materials, 0);
    const totalLabor = overallData.reduce((sum, item) => sum + item.Labor, 0);
    overallData.push(processElementForOverall("GRAND TOTAL", totalMaterials, totalLabor));

    // --- Materials Sheet ---
    const materialsData: any[] = [];
    const processMaterialLine = (elementName: string, line: any) => {
      const planned = line.qty * line.unitCost;
      const actual = line.actualTotal ?? (line.actualQty !== undefined && line.actualUnitCost !== undefined ? line.actualQty * line.actualUnitCost : 0);
      const gap = actual - planned;
      return {
        Element: elementName,
        Item: line.name,
        "Planned Qty": line.qty,
        "Planned Unit Cost": line.unitCost,
        "Planned Total": planned,
        "Actual Qty": line.actualQty ?? 0,
        "Actual Unit Cost": line.actualUnitCost ?? 0,
        "Actual Total": actual,
        Gap: gap
      };
    }

    accounting.elements.forEach((e: any) => {
      e.materials.forEach((m: any) => materialsData.push(processMaterialLine(e.title, m)));
    });
    if (accounting.projectCosts) {
      accounting.projectCosts.materials.forEach((m: any) => materialsData.push(processMaterialLine("Project Level Costs", m)));
    }

    // --- Labor Sheet ---
    const laborData: any[] = [];
    const processLaborLine = (elementName: string, line: any) => {
      const planned = line.qty * line.rate;
      const actual = line.actualTotal ?? (line.actualQty !== undefined && line.actualRate !== undefined ? line.actualQty * line.actualRate : 0);
      const gap = actual - planned;
      return {
        Element: elementName,
        Role: line.role,
        "Planned Qty": line.qty,
        "Planned Rate": line.rate,
        "Planned Total": planned,
        "Actual Qty": line.actualQty ?? 0,
        "Actual Rate": line.actualRate ?? 0,
        "Actual Total": actual,
        Gap: gap
      };
    }

    accounting.elements.forEach((e: any) => {
      e.labor.forEach((l: any) => laborData.push(processLaborLine(e.title, l)));
    });
    if (accounting.projectCosts) {
      accounting.projectCosts.labor.forEach((l: any) => laborData.push(processLaborLine("Project Level Costs", l)));
    }

    exportToExcel({
      "Overall": overallData,
      "Materials": materialsData,
      "Labor": laborData,
    }, `Accounting_Export_${new Date().toLocaleDateString("en-CA")}`);
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
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Download size={16} />
            Export to Excel
          </button>
          <div className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-mono font-bold">
            Live View
          </div>
        </div>
      </div>

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
          onSavingLineId={setSavingLineId}
          onAdd={addMaterialLine}
          onUpdate={updateMaterialLine}
          onDelete={deleteMaterialLine}
          elements={accounting.elements}
        />
      ) : null}

      {tab === "labor" ? (
        <LaborTab
          projectId={projectId}
          accounting={accounting}
          tasks={taskOptions}
          savingLineId={savingLineId}
          onSavingLineId={setSavingLineId}
          onAdd={addWorkLine}
          onUpdate={updateWorkLine}
          onDelete={deleteWorkLine}
          elements={accounting.elements}
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
  onSavingLineId,
  onAdd,
  onUpdate,
  onDelete,
  elements,
}: {
  projectId: Id<"projects">;
  accounting: any;
  tasks: TaskOption[];
  savingLineId: string | null;
  onSavingLineId: (value: string | null) => void;
  onAdd: (args: any) => Promise<any>;
  onUpdate: (args: any) => Promise<any>;
  onDelete: (args: any) => Promise<any>;
  elements: any[];
}) {

  const [collapsedByElement, setCollapsedByElement] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const getMaterialPlanned = (m: MaterialLine) => m.qty * m.unitCost;
  const getMaterialActual = (m: MaterialLine) =>
    m.actualTotal ??
    (m.actualQty !== undefined && m.actualUnitCost !== undefined
      ? m.actualQty * m.actualUnitCost
      : 0);

  const toggleAll = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    elements.forEach((e) => (next[e.elementId] = collapse));
    if (accounting.projectCosts) next["GLOBAL"] = collapse;
    setCollapsedByElement(next);
  };

  const addMaterialLine = async ({
    elementId,
    order,
  }: {
    elementId?: Id<"elements">;
    order?: number;
  }) => {
    try {
      await onAdd({
        projectId,
        elementId,
        itemName: "New material",
        quantity: 1,
        unitCost: 0,
        order: order ?? 1,
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to add line: ${e.message}`);
    }
  };

  const handleDeleteLine = async ({ lineId }: { lineId: string }) => {
    if (!confirm("Delete this material line?")) return;
    try {
      await onDelete({ lineId: lineId as Id<"materialLines"> });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to delete line: ${e.message}`);
    }
  };

  const handleMoveLine = async ({
    lineId,
    direction,
    lines,
  }: {
    lineId: string;
    direction: -1 | 1;
    lines: MaterialLine[];
  }) => {
    // We only support reordering when in default sort
    if (sortKey !== "default") {
      alert("Please switch to default sort to reorder lines.");
      return;
    }

    const sorted = sortLines(lines);
    const index = sorted.findIndex((line) => line.id === lineId);
    const target = sorted[index + direction];
    if (index === -1 || !target) return;

    try {
      const currentOrder = getLineOrderValue(target, index + direction); // target's order becomes ours
      const targetOrder = getLineOrderValue(sorted[index], index); // our order becomes targets

      // We need to update BOTH lines.
      await onUpdate({ lineId: lineId as Id<"materialLines">, order: currentOrder });
      await onUpdate({ lineId: target.id as Id<"materialLines">, order: targetOrder });

    } catch (e: any) {
      console.error(e);
      alert(`Failed to reorder line: ${e.message}`);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // Sort elements first
  const sortedElements = sortElements(accounting.elements, sortKey, sortDirection);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-2">
          <button
            onClick={() => toggleAll(false)}
            className="text-xs font-medium text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded px-2 py-1"
          >
            Expand All
          </button>
          <button
            onClick={() => toggleAll(true)}
            className="text-xs font-medium text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded px-2 py-1"
          >
            Collapse All
          </button>
        </div>
      </div>

      <TabHeader
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {sortedElements.map((element: any) => {
        const sortedMaterials = sortLines(
          element.materials as MaterialLine[],
          sortKey,
          sortDirection,
          getMaterialPlanned,
          getMaterialActual
        );

        const plannedTotal = element.totals.materials;
        const actualTotal = (element.materials as MaterialLine[]).reduce(
          (sum, m) => sum + getMaterialActual(m),
          0
        );
        const gap = actualTotal > 0 ? actualTotal - plannedTotal : null;
        const gapClass =
          gap === null
            ? "text-gray-400"
            : gap > 0
              ? "text-green-600"
              : gap < 0
                ? "text-red-600"
                : "text-gray-500";

        return (
          <div
            key={element.elementId}
            className="bg-white border border-gray-100 rounded-xl shadow-sm"
          >
            <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-12 gap-4 items-center">
              <div className="col-span-6 flex items-center gap-3">
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
                <div className="font-bold text-lg text-gray-900">
                  {element.title}
                </div>
              </div>

              <div className="col-span-2 text-sm font-mono font-medium text-gray-700">
                {plannedTotal.toLocaleString()}
              </div>

              <div className="col-span-2 text-sm font-mono font-medium text-gray-700">
                {actualTotal > 0 ? actualTotal.toLocaleString() : "-"}
              </div>

              <div className={`col-span-2 text-sm font-mono font-bold ${gapClass}`}>
                {actualTotal > 0 ? formatGap(gap!) : "-"}
              </div>
            </div>
            <button
              onClick={() =>
                addMaterialLine({
                  elementId: element.elementId,
                  order: getNextOrder(element.materials),
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 px-6 py-2"
            >
              <Plus size={14} /> Add line
            </button>
            {
              collapsedByElement[element.elementId] ? null : (
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
                          })
                        }
                        onMoveDown={() =>
                          handleMoveLine({
                            lineId: line.id,
                            direction: 1,
                            lines: sortedMaterials,
                          })
                        }
                        onDelete={() =>
                          handleDeleteLine({
                            lineId: line.id,
                          })
                        }
                        onSave={async (next) => {
                          onSavingLineId(line.id);
                          try {
                            await onUpdate({
                              lineId: line.id as Id<"materialLines">,
                              itemName: next.name,
                              quantity: next.qty,
                              unitCost: next.unitCost,
                              elementId: next.elementId === "" ? null : (next.elementId as Id<"elements"> | undefined),
                            });
                          } catch (e: any) {
                            console.error(e);
                            alert(`Failed to save: ${e.message}`);
                          } finally {
                            onSavingLineId(null);
                          }
                        }}
                        elements={elements}
                      />
                    ))
                  )}
                </div>
              )
            }
          </div>
        );
      })}

      {
        accounting.projectCosts ? (
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
                sortLines(
                  accounting.projectCosts.materials as MaterialLine[],

                  sortKey,
                  sortDirection,
                  getMaterialPlanned,
                  getMaterialActual
                ).map(
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
                        })
                      }
                      onMoveDown={() =>
                        handleMoveLine({
                          lineId: line.id,
                          direction: 1,
                          lines,
                        })
                      }
                      onDelete={() =>
                        handleDeleteLine({
                          lineId: line.id,
                        })
                      }
                      onSave={async (next) => {
                        onSavingLineId(line.id);
                        try {
                          await onUpdate({
                            lineId: line.id as Id<"materialLines">,
                            itemName: next.name,
                            quantity: next.qty,
                            unitCost: next.unitCost,
                            elementId: next.elementId === "" ? null : (next.elementId as Id<"elements"> | undefined),
                          });
                        } catch (e: any) {
                          console.error(e);
                          alert(`Failed to save: ${e.message}`);
                        } finally {
                          onSavingLineId(null);
                        }
                      }}
                      elements={elements}
                    />
                  )
                )
              )
              }
            </div>
          </div>
        ) : null
      }
    </div >
  );
}

function LaborTab({
  projectId,
  accounting,
  tasks,
  savingLineId,
  onSavingLineId,
  onAdd,
  onUpdate,
  onDelete,
  elements,
}: {
  projectId: Id<"projects">;
  accounting: any;
  tasks: TaskOption[];
  savingLineId: string | null;
  onSavingLineId: (value: string | null) => void;
  onAdd: (args: any) => Promise<any>;
  onUpdate: (args: any) => Promise<any>;
  onDelete: (args: any) => Promise<any>;
  elements: any[];
}) {

  const [collapsedByElement, setCollapsedByElement] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const getLaborPlanned = (l: LaborLine) => l.qty * l.rate;
  const getLaborActual = (l: LaborLine) =>
    l.actualTotal ??
    (l.actualQty !== undefined && l.actualRate !== undefined
      ? l.actualQty * l.actualRate
      : 0);

  const toggleAll = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    elements.forEach((e) => (next[e.elementId] = collapse));
    if (accounting.projectCosts) next["GLOBAL"] = collapse;
    setCollapsedByElement(next);
  };

  const addLaborLine = async ({
    elementId,
    order,
  }: {
    elementId?: Id<"elements">;
    order?: number;
  }) => {
    try {
      await onAdd({
        projectId,
        elementId,
        role: "New role",
        quantity: 1,
        rate: 0,
        order: order ?? 1,
      });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to add line: ${e.message}`);
    }
  };

  const handleDeleteLine = async ({ lineId }: { lineId: string }) => {
    if (!confirm("Delete this labor line?")) return;
    try {
      await onDelete({ lineId: lineId as Id<"workLines"> });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to delete line: ${e.message}`);
    }
  };

  const handleMoveLine = async ({
    lineId,
    direction,
    lines,
  }: {
    lineId: string;
    direction: -1 | 1;
    lines: LaborLine[];
  }) => {
    if (sortKey !== "default") {
      alert("Please switch to default sort to reorder lines.");
      return;
    }
    const sorted = sortLines(lines);
    const index = sorted.findIndex((line) => line.id === lineId);
    const target = sorted[index + direction];
    if (index === -1 || !target) return;

    try {
      const currentOrder = getLineOrderValue(target, index + direction);
      const targetOrder = getLineOrderValue(sorted[index], index);

      await onUpdate({ lineId: lineId as Id<"workLines">, order: currentOrder });
      await onUpdate({ lineId: target.id as Id<"workLines">, order: targetOrder });
    } catch (e: any) {
      console.error(e);
      alert(`Failed to reorder line: ${e.message}`);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // Sort elements first
  const sortedElements = sortElements(accounting.elements, sortKey, sortDirection);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-2">
          <button
            onClick={() => toggleAll(false)}
            className="text-xs font-medium text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded px-2 py-1"
          >
            Expand All
          </button>
          <button
            onClick={() => toggleAll(true)}
            className="text-xs font-medium text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded px-2 py-1"
          >
            Collapse All
          </button>
        </div>
      </div>

      <TabHeader
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {sortedElements.map((element: any) => {
        const sortedLabor = sortLines(
          element.labor as LaborLine[],
          sortKey,
          sortDirection,
          getLaborPlanned,
          getLaborActual
        );

        const plannedTotal = element.totals.labor;
        const actualTotal = (element.labor as LaborLine[]).reduce(
          (sum, l) => sum + getLaborActual(l),
          0
        );
        const gap = actualTotal > 0 ? actualTotal - plannedTotal : null;
        const gapClass =
          gap === null
            ? "text-gray-400"
            : gap > 0
              ? "text-green-600"
              : gap < 0
                ? "text-red-600"
                : "text-gray-500";

        return (
          <div
            key={element.elementId}
            className="bg-white border border-gray-100 rounded-xl shadow-sm"
          >
            <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-12 gap-4 items-center">
              <div className="col-span-6 flex items-center gap-3">
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
                <div className="font-bold text-lg text-gray-900">
                  {element.title}
                </div>
              </div>

              <div className="col-span-2 text-sm font-mono font-medium text-gray-700">
                {plannedTotal.toLocaleString()}
              </div>

              <div className="col-span-2 text-sm font-mono font-medium text-gray-700">
                {actualTotal > 0 ? actualTotal.toLocaleString() : "-"}
              </div>

              <div className={`col-span-2 text-sm font-mono font-bold ${gapClass}`}>
                {actualTotal > 0 ? formatGap(gap!) : "-"}
              </div>
            </div>
            <button
              onClick={() =>
                addLaborLine({
                  elementId: element.elementId,
                  order: getNextOrder(element.labor),
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 px-6 py-2"
            >
              <Plus size={14} /> Add line
            </button>
            {
              collapsedByElement[element.elementId] ? null : (
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
                          })
                        }
                        onMoveDown={() =>
                          handleMoveLine({
                            lineId: line.id,
                            direction: 1,
                            lines: sortedLabor,
                          })
                        }
                        onDelete={() =>
                          handleDeleteLine({
                            lineId: line.id,
                          })
                        }
                        onSave={async (next: any) => {
                          onSavingLineId(line.id);
                          try {
                            await onUpdate({
                              lineId: line.id as Id<"workLines">,
                              role: next.role,
                              quantity: next.qty,
                              rate: next.rate,
                              elementId: next.elementId === "" ? null : (next.elementId as Id<"elements"> | undefined),
                            });
                          } catch (e: any) {
                            console.error(e);
                            alert(`Failed to save: ${e.message}`);
                          } finally {
                            onSavingLineId(null);
                          }
                        }}
                        elements={elements}
                      />
                    ))
                  )}
                </div>
              )
            }
          </div>
        );
      })}

      {
        accounting.projectCosts ? (
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
                sortLines(
                  accounting.projectCosts.labor as LaborLine[],
                  sortKey,
                  sortDirection,
                  getLaborPlanned,
                  getLaborActual
                ).map(
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
                        })
                      }
                      onMoveDown={() =>
                        handleMoveLine({
                          lineId: line.id,
                          direction: 1,
                          lines,
                        })
                      }
                      onDelete={() =>
                        handleDeleteLine({
                          lineId: line.id,
                        })
                      }
                      onSave={async (next: any) => {
                        onSavingLineId(line.id);
                        try {
                          await onUpdate({
                            lineId: line.id as Id<"workLines">,
                            role: next.role,
                            quantity: next.qty,
                            rate: next.rate,
                            elementId: next.elementId === "" ? null : (next.elementId as Id<"elements"> | undefined),
                          });
                        } catch (e: any) {
                          console.error(e);
                          alert(`Failed to save: ${e.message}`);
                        } finally {
                          onSavingLineId(null);
                        }
                      }}
                      elements={elements}
                    />
                  )
                )
              )}
            </div>
          </div>
        ) : null
      }
    </div >
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
  elements,
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
  elements?: any[];
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
        {isEditing && elements && (
          <div className="mt-2">
            <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
              Assigned Element
            </div>
            <select
              value={draft.elementId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, elementId: e.target.value })
              }
              className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm bg-gray-50"
            >
              <option value="">(Project Level)</option>
              {elements.map((el) => (
                <option key={el.elementId} value={el.elementId}>
                  {el.title}
                </option>
              ))}
            </select>
          </div>
        )}
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
      <div className="md:col-span-1">
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
  elements,
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
  elements?: any[];
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
        {isEditing && elements && (
          <div className="mt-2">
            <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
              Assigned Element
            </div>
            <select
              value={draft.elementId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, elementId: e.target.value })
              }
              className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm bg-gray-50"
            >
              <option value="">(Project Level)</option>
              {elements.map((el) => (
                <option key={el.elementId} value={el.elementId}>
                  {el.title}
                </option>
              ))}
            </select>
          </div>
        )}
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
      <div className="md:col-span-1">
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

function TabHeader({
  sortKey,
  sortDirection,
  onSort,
}: {
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const getSortIcon = (key: SortKey) => {
    const isActive = sortKey === key;
    return (
      <div className="flex flex-col ml-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isActive && sortDirection === "asc") return;
            if (isActive && sortDirection === "desc") {
              onSort(key); // Toggle to asc
            } else {
              onSort(key); // New key or set asc
            }
          }}
          className={`p-0.5 leading-none ${isActive && sortDirection === "asc" ? "text-blue-600" : "text-gray-300 hover:text-gray-500"}`}
        >
          <ArrowUp size={10} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSort(key);
          }}
          className={`p-0.5 leading-none ${isActive && sortDirection === "desc" ? "text-blue-600" : "text-gray-300 hover:text-gray-500"}`}
        >
          <ArrowDown size={10} />
        </button>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
      <div className="col-span-6">Element / Item</div>
      <div className="col-span-2 flex items-center">
        Planned {getSortIcon("planned")}
      </div>
      <div className="col-span-2 flex items-center">
        Actual {getSortIcon("actual")}
      </div>
      <div className="col-span-2 flex items-center">
        Gap {getSortIcon("gap")}
      </div>
    </div>
  );
}




const sortElements = (
  elements: any[],
  sortKey: SortKey,
  sortDirection: SortDirection
) => {
  if (sortKey === "default") return elements;

  return [...elements].sort((a, b) => {
    let valA = 0;
    let valB = 0;

    if (sortKey === "planned") {
      valA = a.totals.materials || a.totals.labor || 0;
      valB = b.totals.materials || b.totals.labor || 0;
    } else if (sortKey === "actual") {
      const getActual = (lines: any[]) => (lines || []).reduce((sum: number, line: any) => sum + (line.actualTotal ?? (line.actualQty && line.actualUnitCost ? line.actualQty * line.actualUnitCost : 0)), 0);

      // Check for materials or labor lines
      if (a.materials) valA = getActual(a.materials);
      else if (a.labor) valA = getActual(a.labor);

      if (b.materials) valB = getActual(b.materials);
      else if (b.labor) valB = getActual(b.labor);

    } else if (sortKey === "gap") {
      // Gap = Actual - Planned
      const getActual = (lines: any[]) => (lines || []).reduce((sum: number, line: any) => sum + (line.actualTotal ?? (line.actualQty && line.actualUnitCost ? line.actualQty * line.actualUnitCost : 0)), 0);

      let actualA = 0;
      let plannedA = a.totals.materials || a.totals.labor || 0;
      if (a.materials) actualA = getActual(a.materials);
      else if (a.labor) actualA = getActual(a.labor);

      let actualB = 0;
      let plannedB = b.totals.materials || b.totals.labor || 0;
      if (b.materials) actualB = getActual(b.materials);
      else if (b.labor) actualB = getActual(b.labor);

      // Only count gap if actual > 0? No, gap exists regardless.
      // But in component logic we showed gap only if actual > 0.
      // For sorting, let's just do Actual - Planned.
      valA = actualA - plannedA;
      valB = actualB - plannedB;
    }

    return sortDirection === "asc" ? valA - valB : valB - valA;
  });
};
