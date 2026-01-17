"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle,
  ClipboardList,
  Edit3,
  Layers,
  PackageOpen,
  Search,
  Save,
  StickyNote,
  Tag,
  Trash2,
  Wrench,
  X,
  Plus,
} from "lucide-react";
import { ElementRunbookTemplatePanel } from "./ElementRunbookTemplatePanel";

type SnapshotEntity = {
  id?: string;
  title?: string;
  role?: string;
  name?: string;
  qty?: number;
  rate?: number;
  unitCost?: number;
  domain?: string;
  status?: string;
  deletedAt?: number;
};

export default function ElementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingElement, setSavingElement] = useState(false);

  const listData = useQuery(api.elements.listByProject, { projectId });

  const updateElementMeta = useMutation(api.elements.updateElementMeta);
  const deleteElement = useMutation(api.elements.deleteElement);

  // Direct mutations replacing drafts
  const createTask = useMutation(api.tasks.createTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const addMaterialLine = useMutation(api.accounting.addMaterialLine);
  const updateMaterialLine = useMutation(api.accounting.updateMaterialLine);
  const deleteMaterialLine = useMutation(api.accounting.deleteMaterialLine);
  const addWorkLine = useMutation(api.accounting.addWorkLine);
  const updateWorkLine = useMutation(api.accounting.updateWorkLine);
  const deleteWorkLine = useMutation(api.accounting.deleteWorkLine);

  const elementParam = searchParams.get("element");
  const elements = listData?.elements ?? [];

  const filtered = useMemo(() => {
    if (!filter.trim()) return elements;
    const term = filter.toLowerCase();
    return elements.filter((element) => {
      return (
        element.title.toLowerCase().includes(term) ||
        element.type.toLowerCase().includes(term) ||
        element.status.toLowerCase().includes(term)
      );
    });
  }, [elements, filter]);

  const selectedElementId = elementParam ?? filtered[0]?.id ?? elements[0]?.id ?? null;

  useEffect(() => {
    if (!selectedElementId || selectedElementId === elementParam) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("element", selectedElementId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [selectedElementId, elementParam, pathname, router, searchParams]);

  const composite = useQuery(
    api.elements.getComposite,
    selectedElementId
      ? {
        projectId,
        elementId: selectedElementId as Id<"elements">,
        preferDraft: true,
      }
      : "skip"
  );

  if (!listData) {
    return <div className="p-8 text-gray-500">Loading elements...</div>;
  }

  if (elements.length === 0) {
    return (
      <div className="p-10 text-gray-500">
        No elements yet. Use Studio Agent to create the first element.
      </div>
    );
  }

  const draftMeta = composite?.base?.draftMeta ?? null;
  const hasDraft = Boolean(draftMeta?.draftId);
  const canEdit = !!composite && !savingDraft;
  const selectedElement = composite?.element ?? null;



  const handleDeleteElement = async () => {
    if (!selectedElement) return;
    const confirmed = window.confirm(
      `Delete element "${selectedElement.title}"? This will remove its versions, tasks, accounting lines, and print parts.`
    );
    if (!confirmed) return;
    setError(null);
    try {
      await deleteElement({ elementId: selectedElement.id as Id<"elements"> });
      const remaining = elements.filter((el) => el.id !== selectedElement.id);
      const next = remaining[0]?.id ?? null;
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set("element", next);
      } else {
        params.delete("element");
      }
      router.replace(`${pathname}?${params.toString()}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete element.");
    }
  };

  return (
    <div className="h-full grid grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
      <aside className="border-r bg-white flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Elements
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-gray-400" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search elements"
              className="w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-xs text-gray-400">No matching elements.</div>
          ) : (
            filtered.map((element) => {
              const isActive = element.id === selectedElementId;
              return (
                <button
                  key={element.id}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("element", element.id);
                    router.replace(`${pathname}?${params.toString()}`);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition ${isActive ? "bg-black text-white" : "hover:bg-gray-50"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold truncate">{element.title}</div>
                    <span className={`text-[10px] uppercase ${isActive ? "text-white/70" : "text-gray-400"}`}>
                      {element.status}
                    </span>
                  </div>
                  <div className={`text-[10px] mt-1 ${isActive ? "text-white/70" : "text-gray-400"}`}>
                    {element.type} • {element.taskCount} tasks
                  </div>
                  <div className={`text-[10px] mt-1 ${isActive ? "text-white/70" : "text-gray-400"}`}>
                    {formatCurrency(element.budget.total)} total
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="overflow-y-auto bg-gray-50 min-h-0">
        {!composite ? (
          <div className="p-8 text-gray-500">Loading element...</div>
        ) : (
          <div className="p-8 space-y-6">
            {error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {error}
              </div>
            ) : null}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-400">
                  <Layers size={14} /> Element Detail
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mt-2">{composite.element.title}</h1>
                <div className="text-sm text-gray-500 mt-1">
                  {composite.element.type} • {composite.element.status} • Rev {composite.element.rev}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {composite.element.tags.length === 0 ? (
                  <span className="text-xs text-gray-400">No tags</span>
                ) : (
                  composite.element.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white text-xs text-gray-600 border border-gray-200"
                    >
                      <Tag size={10} /> {tag}
                    </span>
                  ))
                )}
                <button
                  onClick={handleDeleteElement}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 size={12} />
                  Delete Element
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard label="Tasks" value={`${composite.canon.tasksCount}`} />
              <StatCard label="Budget (materials)" value={formatCurrency(composite.canon.materialsTotal)} />
              <StatCard label="Budget (labor)" value={formatCurrency(composite.canon.laborTotal)} />
            </div>

            <SectionCard title="Details & Revision Status" icon={BadgeCheck}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
                <DetailRow label="Updated" value={formatDate(composite.element.updatedAt)} />
                <DetailRow label="Live Rev" value={formatDraftMeta(composite.base?.draftMeta)} />
              </div>

              <ElementMetaEditor
                element={composite.element}
                description={composite.element.description ?? ""}
                disabled={savingElement || savingDraft}
                onSaveMeta={async (next) => {
                  setSavingElement(true);
                  setError(null);
                  try {
                    await updateElementMeta({
                      elementId: composite.element.id as Id<"elements">,
                      title: next.title,
                      type: next.type,
                      tags: next.tags,
                    });
                  } catch (err: any) {
                    setError(err?.message ?? "Failed to update element.");
                  } finally {
                    setSavingElement(false);
                  }
                }}
                onSaveDescription={async (nextDescription) => {
                  setSavingElement(true);
                  setError(null);
                  try {
                    await updateElementMeta({
                      elementId: composite.element.id as Id<"elements">,
                      description: nextDescription,
                    });
                  } catch (err: any) {
                    setError(err?.message ?? "Failed to update description.");
                  } finally {
                    setSavingElement(false);
                  }
                }}
              />
            </SectionCard>

            <SectionCard title="Tasks" icon={ClipboardList}>
              {composite.links.tasks.length === 0 ? (
                <EmptyState label="No canonical tasks yet." />
              ) : (
                <div className="space-y-3">
                  {composite.links.tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-gray-100 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-900">{task.title}</div>
                        <span className="text-xs text-gray-400">{task.status ?? "todo"}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {task.category ?? "general"} • {task.priority ?? "normal"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Budget" icon={Wrench}>
              {composite.links.accounting.lines.length === 0 ? (
                <EmptyState label="No accounting lines yet." />
              ) : (
                <div className="space-y-4">
                  <BudgetGroup
                    label="Materials"
                    lines={composite.links.accounting.lines.filter((line) => line.type === "material")}
                  />
                  <BudgetGroup
                    label="Labor"
                    lines={composite.links.accounting.lines.filter((line) => line.type === "labor")}
                  />
                  <BudgetGroup
                    label="Other"
                    lines={composite.links.accounting.lines.filter(
                      (line) => line.type !== "material" && line.type !== "labor"
                    )}
                  />
                </div>
              )}
            </SectionCard>

            <SectionCard title="Printing" icon={PackageOpen}>
              {composite.links.printing.printParts.length === 0 ? (
                <EmptyState label="No print parts yet." />
              ) : (
                <div className="space-y-3">
                  {composite.links.printing.printParts.map((part) => (
                    <div key={part.id} className="rounded-lg border border-gray-100 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-900">{part.label}</div>
                        <span className="text-xs text-gray-400">Qty {part.qty}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {part.size ?? "No size"} • {part.substrate ?? "No substrate"}{" "}
                        {part.requiresProof ? "• Proof required" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Install Runbook Template" icon={ClipboardList}>
              <ElementRunbookTemplatePanel
                projectId={projectId}
                elementId={composite.element.id as Id<"elements">}
                elementTitle={composite.element.title}
              />
            </SectionCard>

            <SectionCard title="Live Snapshot" icon={StickyNote}>
              <SnapshotSection
                spec={composite.base?.spec}
                canEdit={canEdit}
                onSaveTask={async (taskId, next) => {
                  await updateTask({
                    taskId: taskId as Id<"tasks">,
                    patch: {
                      title: next.title,
                      description: next.description,
                      status: next.status,
                      // domain is likely mapped to category or handled differently, 
                      // but let's assume 'category' if 'domain' matches, or ignore if not in schema.
                      // Checking tasks.ts, 'domain' isn't there, 'category' is. 
                      // The helper in SnapshotSection uses 'domain'.
                      // Let's map domain -> category for now or ignore.
                      category: next.domain,
                    },
                  });
                }}
                onDeleteTask={async (taskId) => {
                  await deleteTask({ taskId: taskId as Id<"tasks"> });
                }}
                onSaveMaterial={async (materialId, next) => {
                  await updateMaterialLine({
                    lineId: materialId as Id<"materialLines">,
                    itemName: next.name,
                    quantity: next.qty,
                    unitCost: next.unitCost,
                  });
                }}
                onDeleteMaterial={async (materialId) => {
                  await deleteMaterialLine({ lineId: materialId as Id<"materialLines"> });
                }}
                onSaveLabor={async (laborId, next) => {
                  await updateWorkLine({
                    lineId: laborId as Id<"workLines">,
                    role: next.role,
                    quantity: next.qty,
                    rate: next.rate,
                  });
                }}
                onDeleteLabor={async (laborId) => {
                  await deleteWorkLine({ lineId: laborId as Id<"workLines"> });
                }}
                onAddTask={async () => {
                  await createTask({
                    projectId,
                    elementId: composite.element.id as Id<"elements">,
                    title: "New Task",
                    status: "todo",
                    category: "general", // domain fallback
                  });
                }}
                onAddMaterial={async () => {
                  await addMaterialLine({
                    projectId,
                    elementId: composite.element.id as Id<"elements">,
                    itemName: "New Material",
                    quantity: 1,
                    unitCost: 0,
                  });
                }}
                onAddLabor={async () => {
                  await addWorkLine({
                    projectId,
                    elementId: composite.element.id as Id<"elements">,
                    role: "New Role",
                    quantity: 1,
                    rate: 0,
                  });
                }}
              />
            </SectionCard>

            <SectionCard title="Wiring & History" icon={Layers}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
                <DetailRow label="Tasks" value={`${composite.links.tasks.length}`} />
                <DetailRow label="Accounting lines" value={`${composite.links.accounting.lines.length}`} />
                <DetailRow label="Print parts" value={`${composite.links.printing.printParts.length}`} />
              </div>
              <div className="mt-4 space-y-2">
                {!composite.links.history || composite.links.history.length === 0 ? (
                  <EmptyState label="No approved revisions yet." />
                ) : (
                  composite.links.history.map((version: any) => (
                    <div
                      key={version.id}
                      className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-xs text-gray-600"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-800">
                          Version {version.versionNumber}
                        </span>
                        <span>{formatDate(version.approvedAt ?? version.createdAt)}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {version.summary ?? "Approved snapshot"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>
        )}
      </section>
    </div>
  );
}

function formatCurrency(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString()} NIS`;
}

function formatDate(value?: number) {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "--";
  }
}

function formatDraftMeta(meta: any) {
  if (!meta) return "--";
  return `Rev ${meta.revisionNumber}`;
}

function formatApprovedMeta(meta: any) {
  if (!meta) return "Not approved yet";
  return `V${meta.revisionNumber} • ${formatDate(meta.createdAt)}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="text-xs uppercase text-gray-400 font-semibold">{label}</div>
      <div className="text-lg font-semibold text-gray-900 mt-2">{value}</div>
    </div>
  );
}

function ElementMetaEditor({
  element,
  description,
  disabled,
  onSaveMeta,
  onSaveDescription,
}: {
  element: { title: string; type: string; tags: string[]; description?: string };
  description: string;
  disabled: boolean;
  onSaveMeta: (next: { title: string; type: string; tags: string[] }) => Promise<void>;
  onSaveDescription: (next: string) => Promise<void>;
}) {
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [metaDraft, setMetaDraft] = useState({
    title: element.title,
    type: element.type,
    tags: element.tags.join(", "),
  });
  const [descriptionDraft, setDescriptionDraft] = useState(description);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase font-semibold text-gray-400">Element Meta</div>
          {isEditingMeta ? (
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={async () => {
                  await onSaveMeta({
                    title: metaDraft.title.trim() || element.title,
                    type: metaDraft.type,
                    tags: splitCsv(metaDraft.tags),
                  });
                  setIsEditingMeta(false);
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1 font-semibold text-green-600"
              >
                <Save size={12} /> Save
              </button>
              <button
                onClick={() => {
                  setIsEditingMeta(false);
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1 font-semibold text-gray-500"
              >
                <X size={12} /> Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setMetaDraft({
                  title: element.title,
                  type: element.type,
                  tags: element.tags.join(", "),
                });
                setIsEditingMeta(true);
              }}
              disabled={disabled}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600"
            >
              <Edit3 size={12} /> Edit
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Title</div>
            <input
              value={metaDraft.title}
              disabled={!isEditingMeta || disabled}
              onChange={(event) => setMetaDraft({ ...metaDraft, title: event.target.value })}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Type</div>
            <select
              value={metaDraft.type}
              disabled={!isEditingMeta || disabled}
              onChange={(event) => setMetaDraft({ ...metaDraft, type: event.target.value })}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="build">build</option>
              <option value="rent">rent</option>
              <option value="print">print</option>
              <option value="transport">transport</option>
              <option value="install">install</option>
              <option value="subcontract">subcontract</option>
              <option value="mixed">mixed</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Tags</div>
            <input
              value={metaDraft.tags}
              disabled={!isEditingMeta || disabled}
              onChange={(event) => setMetaDraft({ ...metaDraft, tags: event.target.value })}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              placeholder="tag1, tag2"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase font-semibold text-gray-400">Description</div>
          {isEditingDescription ? (
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={async () => {
                  await onSaveDescription(descriptionDraft.trim());
                  setIsEditingDescription(false);
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1 font-semibold text-green-600"
              >
                <Save size={12} /> Save
              </button>
              <button
                onClick={() => {
                  setIsEditingDescription(false);
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1 font-semibold text-gray-500"
              >
                <X size={12} /> Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={() => {
                  setDescriptionDraft(description);
                  setIsEditingDescription(true);
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1 font-semibold text-gray-600"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                onClick={() => {
                  setDescriptionDraft("");
                  setIsEditingDescription(true);
                }}
                disabled={disabled}
                className="inline-flex items-center gap-1 font-semibold text-gray-500"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <textarea
          value={descriptionDraft}
          disabled={!isEditingDescription || disabled}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          className="mt-3 w-full min-h-[120px] rounded-md border border-gray-200 px-3 py-2 text-sm"
          placeholder="Add element description..."
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900">
        <Icon size={16} className="text-gray-500" /> {title}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-sm text-gray-700 mt-1">{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="text-sm text-gray-500">{label}</div>;
}

function BudgetGroup({
  label,
  lines,
}: {
  label: string;
  lines: Array<{
    id: string;
    title: string;
    total: number;
    qty?: number | null;
    unitCost?: number | null;
  }>;
}) {
  const total = lines.reduce((sum, line) => sum + (line.total ?? 0), 0);
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold uppercase text-gray-400">
        <span>{label}</span>
        <span>{formatCurrency(total)}</span>
      </div>
      {lines.length === 0 ? (
        <div className="text-sm text-gray-400 mt-2">No lines</div>
      ) : (
        <div className="mt-3 space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between text-sm text-gray-700">
              <span>{line.title}</span>
              <span className="text-xs text-gray-500">{formatCurrency(line.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SnapshotSection({
  spec,
  canEdit,
  onSaveTask,
  onDeleteTask,
  onSaveMaterial,
  onDeleteMaterial,
  onSaveLabor,
  onDeleteLabor,
  onAddTask,
  onAddMaterial,
  onAddLabor,
}: {
  spec: any;
  canEdit: boolean;
  onSaveTask: (id: string, next: any) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onSaveMaterial: (id: string, next: any) => Promise<void>;
  onDeleteMaterial: (id: string) => Promise<void>;
  onSaveLabor: (id: string, next: any) => Promise<void>;
  onDeleteLabor: (id: string) => Promise<void>;
  onAddTask: () => Promise<void>;
  onAddMaterial: () => Promise<void>;
  onAddLabor: () => Promise<void>;
}) {
  const tasks = normalizeSnapshotList(spec?.tasks?.byId);
  const materials = normalizeSnapshotList(spec?.materials?.byId);
  const labor = normalizeSnapshotList(spec?.labor?.byId);
  const subcontract = normalizeSnapshotList(spec?.subcontract?.byId);
  const notes = Array.isArray(spec?.notes) ? spec.notes : [];

  if (
    tasks.length === 0 &&
    materials.length === 0 &&
    labor.length === 0 &&
    subcontract.length === 0 &&
    notes.length === 0
  ) {
    return <EmptyState label="No live snapshot data yet." />;
  }

  return (
    <div className="space-y-5 text-sm text-gray-700">
      <SnapshotTaskGroup
        items={tasks}
        canEdit={canEdit}
        onSave={onSaveTask}
        onDelete={onDeleteTask}
        onAdd={onAddTask}
      />
      <SnapshotMaterialGroup
        items={materials}
        canEdit={canEdit}
        onSave={onSaveMaterial}
        onDelete={onDeleteMaterial}
        onAdd={onAddMaterial}
      />
      <SnapshotLaborGroup
        items={labor}
        canEdit={canEdit}
        onSave={onSaveLabor}
        onDelete={onDeleteLabor}
        onAdd={onAddLabor}
      />
      <SnapshotGroup label="Subcontract" items={subcontract} />
      {notes.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">Notes</div>
          <ul className="space-y-2">
            {notes.map((note: any, index: number) => (
              <li key={`note-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                {String(note?.text ?? note ?? "").trim() || "Untitled note"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SnapshotGroup({ label, items }: { label: string; items: SnapshotEntity[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">{label}</div>
      {items.length === 0 ? (
        <div className="text-sm text-gray-400">No {label.toLowerCase()}.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id ?? `${label}-${index}`}
              className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <div className="font-medium text-gray-800">
                {item.title ?? item.name ?? item.role ?? "Untitled"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {item.domain ? `${item.domain} • ` : ""}
                {item.status ? `Status: ${item.status} • ` : ""}
                {item.qty ? `Qty ${item.qty} • ` : ""}
                {item.rate ? `Rate ${item.rate} • ` : ""}
                {item.unitCost ? `Unit ${item.unitCost} • ` : ""}
                {item.id ?? ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotTaskGroup({
  items,
  canEdit,
  onSave,
  onDelete,
  onAdd,
}: {
  items: SnapshotEntity[];
  canEdit: boolean;
  onSave: (id: string, next: SnapshotEntity) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between xl:justify-start xl:gap-4 mb-2">
        <div className="text-xs uppercase tracking-wider text-gray-400">Tasks</div>
        {canEdit && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} /> Add Task
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-gray-400">No tasks.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <SnapshotTaskRow
              key={item.id ?? `task-${index}`}
              item={item}
              canEdit={canEdit}
              onSave={onSave}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotTaskRow({
  item,
  canEdit,
  onSave,
  onDelete,
}: {
  item: SnapshotEntity;
  canEdit: boolean;
  onSave: (id: string, next: SnapshotEntity) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: item.title ?? "",
    domain: item.domain ?? "",
    status: item.status ?? "",
    description: String((item as any).description ?? ""),
  });

  const handleSave = async () => {
    if (!item.id) return;
    await onSave(item.id, draft);
    setIsEditing(false);
  };

  return (
    <li className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <input
            value={isEditing ? draft.title : item.title}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={isEditing ? draft.domain : item.domain}
              disabled={!isEditing || !canEdit}
              onChange={(event) => setDraft({ ...draft, domain: event.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs"
              placeholder="Domain"
            />
            <input
              value={isEditing ? draft.status : item.status}
              disabled={!isEditing || !canEdit}
              onChange={(event) => setDraft({ ...draft, status: event.target.value })}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs"
              placeholder="Status"
            />
          </div>
          <textarea
            value={isEditing ? draft.description : String((item as any).description ?? "")}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-xs"
            placeholder="Description"
          />
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-green-600"
              >
                <Save size={12} /> Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1 font-semibold text-gray-500"
              >
                <X size={12} /> Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setDraft({
                    title: item.title ?? "",
                    domain: item.domain ?? "",
                    status: item.status ?? "",
                    description: String((item as any).description ?? ""),
                  });
                  setIsEditing(true);
                }}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-gray-600"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                onClick={() => item.id && onDelete(item.id)}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-rose-600"
              >
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function SnapshotMaterialGroup({
  items,
  canEdit,
  onSave,
  onDelete,
  onAdd,
}: {
  items: SnapshotEntity[];
  canEdit: boolean;
  onSave: (id: string, next: SnapshotEntity) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between xl:justify-start xl:gap-4 mb-2">
        <div className="text-xs uppercase tracking-wider text-gray-400">Materials</div>
        {canEdit && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} /> Add Material
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-gray-400">No materials.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <SnapshotMaterialRow
              key={item.id ?? `material-${index}`}
              item={item}
              canEdit={canEdit}
              onSave={onSave}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotMaterialRow({
  item,
  canEdit,
  onSave,
  onDelete,
}: {
  item: SnapshotEntity;
  canEdit: boolean;
  onSave: (id: string, next: SnapshotEntity) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: item.name ?? item.title ?? "",
    qty: item.qty ?? 0,
    unitCost: item.unitCost ?? 0,
  });

  const handleSave = async () => {
    if (!item.id) return;
    await onSave(item.id, draft);
    setIsEditing(false);
  };

  return (
    <li className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={isEditing ? draft.name : (item.name ?? item.title ?? "")}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Name"
          />
          <input
            type="number"
            value={isEditing ? draft.qty : (item.qty ?? 0)}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, qty: Number(event.target.value) })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Qty"
          />
          <input
            type="number"
            value={isEditing ? draft.unitCost : (item.unitCost ?? 0)}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, unitCost: Number(event.target.value) })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Unit cost"
          />
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-green-600"
              >
                <Save size={12} /> Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1 font-semibold text-gray-500"
              >
                <X size={12} /> Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setDraft({
                    name: item.name ?? item.title ?? "",
                    qty: item.qty ?? 0,
                    unitCost: item.unitCost ?? 0,
                  });
                  setIsEditing(true);
                }}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-gray-600"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                onClick={() => item.id && onDelete(item.id)}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-rose-600"
              >
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function SnapshotLaborGroup({
  items,
  canEdit,
  onSave,
  onDelete,
  onAdd,
}: {
  items: SnapshotEntity[];
  canEdit: boolean;
  onSave: (id: string, next: SnapshotEntity) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center justify-between xl:justify-start xl:gap-4 mb-2">
        <div className="text-xs uppercase tracking-wider text-gray-400">Labor</div>
        {canEdit && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} /> Add Labor
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-gray-400">No labor.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <SnapshotLaborRow
              key={item.id ?? `labor-${index}`}
              item={item}
              canEdit={canEdit}
              onSave={onSave}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotLaborRow({
  item,
  canEdit,
  onSave,
  onDelete,
}: {
  item: SnapshotEntity;
  canEdit: boolean;
  onSave: (id: string, next: SnapshotEntity) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    role: item.role ?? item.title ?? "",
    qty: item.qty ?? 0,
    rate: item.rate ?? 0,
  });

  const handleSave = async () => {
    if (!item.id) return;
    await onSave(item.id, draft);
    setIsEditing(false);
  };

  return (
    <li className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={isEditing ? draft.role : (item.role ?? item.title ?? "")}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, role: event.target.value })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Role"
          />
          <input
            type="number"
            value={isEditing ? draft.qty : (item.qty ?? 0)}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, qty: Number(event.target.value) })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Qty"
          />
          <input
            type="number"
            value={isEditing ? draft.rate : (item.rate ?? 0)}
            disabled={!isEditing || !canEdit}
            onChange={(event) => setDraft({ ...draft, rate: Number(event.target.value) })}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            placeholder="Rate"
          />
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-green-600"
              >
                <Save size={12} /> Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1 font-semibold text-gray-500"
              >
                <X size={12} /> Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setDraft({
                    role: item.role ?? item.title ?? "",
                    qty: item.qty ?? 0,
                    rate: item.rate ?? 0,
                  });
                  setIsEditing(true);
                }}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-gray-600"
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                onClick={() => item.id && onDelete(item.id)}
                disabled={!canEdit}
                className="inline-flex items-center gap-1 font-semibold text-rose-600"
              >
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function normalizeSnapshotList(map?: Record<string, SnapshotEntity>) {
  if (!map) return [];
  return Object.values(map).filter((item) => !item?.deletedAt);
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
