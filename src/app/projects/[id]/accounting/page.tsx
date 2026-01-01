"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileCheck,
  ShieldAlert,
  TrendingUp,
  Plus,
  Save,
  X,
} from "lucide-react";

type TabKey = "summary" | "materials" | "labor" | "research";

type MaterialLine = {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  actualQty?: number;
  actualUnitCost?: number;
  taskIds: string[];
};

type LaborLine = {
  id: string;
  role: string;
  qty: number;
  rate: number;
  actualQty?: number;
  actualRate?: number;
  taskIds: string[];
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
  const pendingGraveyard = useQuery(api.graveyard.listPending, { projectId });
  const applyChangeSet = useMutation(api.drafts.applyChangeSet);
  const [tab, setTab] = useState<TabKey>("summary");
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  const pendingCount = pendingGraveyard?.length ?? 0;

  const stats = useMemo(() => {
    if (!summary) return [];
    return [
      {
        label: "Baseline Planned",
        value: summary.baseline.grandTotal,
        icon: FileCheck,
        color: "text-blue-600",
      },
      {
        label: "Approved COs",
        value: summary.approvedCO.sellPrice,
        icon: TrendingUp,
        color: "text-green-600",
      },
      {
        label: "Unapproved Variance",
        value: summary.variance.unapproved.sellPrice,
        icon: ShieldAlert,
        color: "text-amber-600",
      },
    ];
  }, [summary]);

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
        <div className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-mono">
          Draft view + reconciliation
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
        <TabButton
          active={tab === "research"}
          onClick={() => setTab("research")}
        >
          Deep Research
        </TabButton>
      </div>

      {tab === "summary" ? (
        <SummaryTab summary={summary} stats={stats} accounting={accounting} />
      ) : null}

      {tab === "materials" ? (
        <MaterialsTab
          accounting={accounting}
          savingLineId={savingLineId}
          onApplyOps={handleApplyOps}
          onSavingLineId={setSavingLineId}
        />
      ) : null}

      {tab === "labor" ? (
        <LaborTab
          accounting={accounting}
          savingLineId={savingLineId}
          onApplyOps={handleApplyOps}
          onSavingLineId={setSavingLineId}
        />
      ) : null}

      {tab === "research" ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-sm text-gray-500">
          Deep Research is not wired in this build. Enable it once the research
          pipeline is available.
        </div>
      ) : null}
    </div>
  );
}

function SummaryTab({
  summary,
  stats,
  accounting,
}: {
  summary: any;
  stats: Array<{
    label: string;
    value: number;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    color: string;
  }>;
  accounting: any;
}) {
  const gapTotals = computeGapTotals(accounting);
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`p-2 rounded-lg bg-gray-50 ${stat.color.replace(
                  "text-",
                  "text-opacity-80 text-"
                )}`}
              >
                <stat.icon size={20} className={stat.color} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                {stat.label}
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {Number(stat.value).toLocaleString()}{" "}
              <span className="text-lg text-gray-400 font-normal">NIS</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Current Forecast"
          value={summary.forecast.sellPrice}
          subtitle="Sell price"
        />
        <SummaryCard
          title="Effective Budget"
          value={summary.effectiveBudget.sellPrice}
          subtitle="Baseline + COs"
        />
        <SummaryCard
          title="Variance"
          value={summary.variance.unapproved.sellPrice}
          subtitle="Forecast - budget"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Materials Gap"
          value={gapTotals.materialsGap ?? 0}
          displayValue={
            gapTotals.materialsGap === null
              ? "--"
              : formatGap(gapTotals.materialsGap)
          }
          subtitle={gapTotals.materialsGap === null ? "No actuals yet" : "Actual - planned"}
          tone={gapTotals.materialsGap}
        />
        <SummaryCard
          title="Labor Gap"
          value={gapTotals.laborGap ?? 0}
          displayValue={
            gapTotals.laborGap === null ? "--" : formatGap(gapTotals.laborGap)
          }
          subtitle={gapTotals.laborGap === null ? "No actuals yet" : "Actual - planned"}
          tone={gapTotals.laborGap}
        />
        <SummaryCard
          title="Total Gap"
          value={gapTotals.totalGap ?? 0}
          displayValue={
            gapTotals.totalGap === null ? "--" : formatGap(gapTotals.totalGap)
          }
          subtitle={gapTotals.totalGap === null ? "No actuals yet" : "Actual - planned"}
          tone={gapTotals.totalGap}
        />
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
          <div className="font-semibold text-gray-900">Draft cost breakdown</div>
          <div className="text-xs text-gray-500">
            {accounting.elements.length} elements
          </div>
        </div>
        <div className="divide-y">
          {accounting.elements.map((element: any) => {
            const gapTotal = computeGapTotal(element.materials, element.labor);
            return (
              <div
                key={element.elementId}
                className="px-6 py-4 flex items-center justify-between text-sm"
              >
                <div>
                  <div className="font-medium text-gray-900">{element.title}</div>
                  <div className="text-xs text-gray-400">
                    {element.tasks.length} tasks
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-gray-700">
                    {element.totals.total.toLocaleString()} NIS
                  </div>
                  <div
                    className={`text-xs font-semibold ${
                      gapTotal === null
                        ? "text-gray-400"
                        : gapTotal > 0
                          ? "text-green-600"
                          : gapTotal < 0
                            ? "text-red-600"
                            : "text-gray-500"
                    }`}
                  >
                    Gap: {gapTotal === null ? "--" : formatGap(gapTotal)}
                  </div>
                </div>
              </div>
            );
          })}
          {accounting.projectCosts ? (
            (() => {
              const gapTotal = computeGapTotal(
                accounting.projectCosts.materials,
                accounting.projectCosts.labor
              );
              return (
                <div className="px-6 py-4 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-gray-900">
                      Project Level Costs
                    </div>
                    <div className="text-xs text-gray-400">Global overhead</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-gray-700">
                      {accounting.projectCosts.totals.total.toLocaleString()} NIS
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        gapTotal === null
                          ? "text-gray-400"
                          : gapTotal > 0
                            ? "text-green-600"
                            : gapTotal < 0
                              ? "text-red-600"
                              : "text-gray-500"
                      }`}
                    >
                      Gap: {gapTotal === null ? "--" : formatGap(gapTotal)}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  tone,
  displayValue,
}: {
  title: string;
  value: number;
  subtitle: string;
  tone?: number | null;
  displayValue?: string;
}) {
  const toneClass =
    tone === undefined || tone === null
      ? "text-gray-900"
      : tone > 0
        ? "text-green-600"
        : tone < 0
          ? "text-red-600"
          : "text-gray-500";
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
      <div className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
        {title}
      </div>
      {displayValue ? (
        <div className={`mt-3 text-2xl font-bold ${toneClass}`}>
          {displayValue}
        </div>
      ) : (
        <div className={`mt-3 text-2xl font-bold ${toneClass}`}>
          {Number(value).toLocaleString()}{" "}
          <span className="text-sm text-gray-400 font-normal">NIS</span>
        </div>
      )}
      <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function MaterialsTab({
  accounting,
  savingLineId,
  onApplyOps,
  onSavingLineId,
}: {
  accounting: any;
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
  const addMaterialLine = async ({
    draftType,
    draftId,
    revisionNumber,
  }: {
    draftType: "element" | "projectCost";
    draftId: string;
    revisionNumber: number;
  }) => {
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
      draftId,
      baseRevisionNumber: revisionNumber,
      patchOps,
      reason: "Add material line",
    });
  };

  return (
    <div className="space-y-8">
      {accounting.elements.map((element: any) => (
        <div
          key={element.elementId}
          className="bg-white border border-gray-100 rounded-xl shadow-sm"
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">{element.title}</div>
              <div className="text-xs text-gray-500">
                Materials: {element.totals.materials.toLocaleString()} NIS
              </div>
            </div>
            <button
              onClick={() =>
                addMaterialLine({
                  draftType: "element",
                  draftId: element.draftId,
                  revisionNumber: element.revisionNumber,
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          <div className="divide-y">
            {element.materials.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No materials</div>
            ) : (
              element.materials.map((line: MaterialLine) => (
                <MaterialLineRow
                  key={line.id}
                  line={line}
                  saving={savingLineId === line.id}
                  onSave={async (next) => {
                    onSavingLineId(line.id);
                    try {
                      const patchOps = buildMaterialPatchOps(line.id, next);
                      await onApplyOps({
                        draftType: "element",
                        draftId: element.draftId,
                        baseRevisionNumber: element.revisionNumber,
                        patchOps,
                        reason: "Update material line",
                      });
                    } finally {
                      onSavingLineId(null);
                    }
                  }}
                />
              ))
            )}
          </div>
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
                  saving={savingLineId === line.id}
                  onSave={async (next) => {
                    onSavingLineId(line.id);
                    try {
                      const patchOps = buildMaterialPatchOps(line.id, next);
                      await onApplyOps({
                        draftType: "projectCost",
                        draftId: accounting.projectCosts.draftId,
                        baseRevisionNumber: accounting.projectCosts.revisionNumber,
                        patchOps,
                        reason: "Update project cost material",
                      });
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
  accounting,
  savingLineId,
  onApplyOps,
  onSavingLineId,
}: {
  accounting: any;
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
  const addLaborLine = async ({
    draftType,
    draftId,
    revisionNumber,
  }: {
    draftType: "element" | "projectCost";
    draftId: string;
    revisionNumber: number;
  }) => {
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
      draftId,
      baseRevisionNumber: revisionNumber,
      patchOps,
      reason: "Add labor line",
    });
  };

  return (
    <div className="space-y-8">
      {accounting.elements.map((element: any) => (
        <div
          key={element.elementId}
          className="bg-white border border-gray-100 rounded-xl shadow-sm"
        >
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">{element.title}</div>
              <div className="text-xs text-gray-500">
                Labor: {element.totals.labor.toLocaleString()} NIS
              </div>
            </div>
            <button
              onClick={() =>
                addLaborLine({
                  draftType: "element",
                  draftId: element.draftId,
                  revisionNumber: element.revisionNumber,
                })
              }
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <Plus size={14} /> Add line
            </button>
          </div>
          <div className="divide-y">
            {element.labor.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No labor</div>
            ) : (
              element.labor.map((line: LaborLine) => (
                <LaborLineRow
                  key={line.id}
                  line={line}
                  saving={savingLineId === line.id}
                  onSave={async (next) => {
                    onSavingLineId(line.id);
                    try {
                      const patchOps = buildLaborPatchOps(line.id, next);
                      await onApplyOps({
                        draftType: "element",
                        draftId: element.draftId,
                        baseRevisionNumber: element.revisionNumber,
                        patchOps,
                        reason: "Update labor line",
                      });
                    } finally {
                      onSavingLineId(null);
                    }
                  }}
                />
              ))
            )}
          </div>
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
                  saving={savingLineId === line.id}
                  onSave={async (next) => {
                    onSavingLineId(line.id);
                    try {
                      const patchOps = buildLaborPatchOps(line.id, next);
                      await onApplyOps({
                        draftType: "projectCost",
                        draftId: accounting.projectCosts.draftId,
                        baseRevisionNumber: accounting.projectCosts.revisionNumber,
                        patchOps,
                        reason: "Update project cost labor",
                      });
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
  saving,
  onSave,
}: {
  line: MaterialLine;
  saving: boolean;
  onSave: (next: MaterialLine) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<MaterialLine>(line);

  useEffect(() => {
    if (!isEditing) {
      setDraft(line);
    }
  }, [line, isEditing]);

  const handleCancel = () => {
    setDraft(line);
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    await onSave(draft);
    setIsEditing(false);
  };

  const plannedTotal = draft.qty * draft.unitCost;
  const actualTotal =
    draft.actualQty !== undefined && draft.actualUnitCost !== undefined
      ? draft.actualQty * draft.actualUnitCost
      : null;
  const gapTotal =
    actualTotal !== null ? actualTotal - plannedTotal : null;
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
        <input
          value={draft.name}
          disabled={!isEditing || saving}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Qty
        </div>
        <input
          type="number"
          value={draft.qty}
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
          value={draft.unitCost}
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
          value={draft.actualQty ?? ""}
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
          value={draft.actualUnitCost ?? ""}
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
        <input
          value={draft.taskIds.join(", ")}
          disabled={!isEditing || saving}
          onChange={(e) =>
            setDraft({
              ...draft,
              taskIds: splitCsv(e.target.value),
            })
          }
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1 text-xs text-gray-500">
        <div className="uppercase font-semibold text-gray-400">Gap</div>
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
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs font-semibold text-gray-600"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

function LaborLineRow({
  line,
  saving,
  onSave,
}: {
  line: LaborLine;
  saving: boolean;
  onSave: (next: LaborLine) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<LaborLine>(line);

  useEffect(() => {
    if (!isEditing) {
      setDraft(line);
    }
  }, [line, isEditing]);

  const handleCancel = () => {
    setDraft(line);
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    await onSave(draft);
    setIsEditing(false);
  };

  const plannedTotal = draft.qty * draft.rate;
  const actualTotal =
    draft.actualQty !== undefined && draft.actualRate !== undefined
      ? draft.actualQty * draft.actualRate
      : null;
  const gapTotal =
    actualTotal !== null ? actualTotal - plannedTotal : null;
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
        <input
          value={draft.role}
          disabled={!isEditing || saving}
          onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1">
        <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
          Planned Qty
        </div>
        <input
          type="number"
          value={draft.qty}
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
          value={draft.rate}
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
          value={draft.actualQty ?? ""}
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
          value={draft.actualRate ?? ""}
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
        <input
          value={draft.taskIds.join(", ")}
          disabled={!isEditing || saving}
          onChange={(e) =>
            setDraft({
              ...draft,
              taskIds: splitCsv(e.target.value),
            })
          }
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-1 text-xs text-gray-500">
        <div className="uppercase font-semibold text-gray-400">Gap</div>
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
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs font-semibold text-gray-600"
          >
            Edit
          </button>
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

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCurrency(amount: number) {
  if (!Number.isFinite(amount)) return "--";
  return `${amount.toLocaleString()} NIS`;
}

function formatGap(amount: number) {
  if (!Number.isFinite(amount)) return "--";
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString()} NIS`;
}

function computeGapTotal(materials: MaterialLine[], labor: LaborLine[]) {
  let hasActual = false;
  let planned = 0;
  let actual = 0;

  for (const line of materials) {
    planned += Number(line.qty) * Number(line.unitCost);
    if (line.actualQty !== undefined && line.actualUnitCost !== undefined) {
      actual += Number(line.actualQty) * Number(line.actualUnitCost);
      hasActual = true;
    }
  }

  for (const line of labor) {
    planned += Number(line.qty) * Number(line.rate);
    if (line.actualQty !== undefined && line.actualRate !== undefined) {
      actual += Number(line.actualQty) * Number(line.actualRate);
      hasActual = true;
    }
  }

  return hasActual ? actual - planned : null;
}

function computeGapTotals(accounting: any) {
  let materialsPlanned = 0;
  let materialsActual = 0;
  let laborPlanned = 0;
  let laborActual = 0;
  let hasMaterialsActual = false;
  let hasLaborActual = false;

  const allGroups = [
    ...(accounting.elements ?? []),
    ...(accounting.projectCosts ? [accounting.projectCosts] : []),
  ];

  for (const group of allGroups) {
    for (const line of group.materials ?? []) {
      materialsPlanned += Number(line.qty) * Number(line.unitCost);
      if (line.actualQty !== undefined && line.actualUnitCost !== undefined) {
        materialsActual += Number(line.actualQty) * Number(line.actualUnitCost);
        hasMaterialsActual = true;
      }
    }
    for (const line of group.labor ?? []) {
      laborPlanned += Number(line.qty) * Number(line.rate);
      if (line.actualQty !== undefined && line.actualRate !== undefined) {
        laborActual += Number(line.actualQty) * Number(line.actualRate);
        hasLaborActual = true;
      }
    }
  }

  const materialsGap = hasMaterialsActual ? materialsActual - materialsPlanned : null;
  const laborGap = hasLaborActual ? laborActual - laborPlanned : null;
  const totalGap =
    hasMaterialsActual || hasLaborActual
      ? (hasMaterialsActual ? materialsActual : 0) +
        (hasLaborActual ? laborActual : 0) -
        (materialsPlanned + laborPlanned)
      : null;

  return { materialsGap, laborGap, totalGap };
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
      className={`px-4 py-2 text-xs font-semibold rounded-full ${
        active ? "bg-black text-white" : "bg-gray-100 text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}
