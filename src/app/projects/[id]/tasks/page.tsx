"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Layers,
  KanbanSquare,
  GanttChart,
  Grid,
  Sparkles,
  Clock,
  Link2,
  Boxes,
  Wrench,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

type TabKey = "kanban" | "gantt" | "elements" | "work";

type TaskPhoto = { url?: string; label?: string };
type TaskSubtask = { id?: string; title?: string; status?: string };
type MaterialLine = {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  actualQty?: number;
  actualUnitCost?: number;
};
type LaborLine = {
  id: string;
  role: string;
  qty: number;
  rate: number;
  actualQty?: number;
  actualRate?: number;
};

type Task = {
  id: string;
  title: string;
  description?: string;
  domain?: string;
  status?: string;
  priority?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  estimatedMinutes?: number;
  dependencies?: string[];
  steps?: string[];
  subtasks?: TaskSubtask[];
  assignee?: string;
  photos?: TaskPhoto[];
  materials?: MaterialLine[];
  labor?: LaborLine[];
  elementId: string;
  elementTitle: string;
  draftId?: string;
  revisionNumber?: number;
};

const STATUS_COLUMNS = [
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const data = useQuery(api.tasks.listForProject, { projectId });
  const applyChangeSet = useMutation(api.drafts.applyChangeSet);
  const estimateDependencies = useMutation(api.agent.estimateTaskDependencies);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>("kanban");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasks: Task[] = (data?.tasks ?? []) as Task[];
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus && taskById.has(focus)) {
      setSelectedTaskId(focus);
    }
  }, [searchParams, taskById]);

  const kanban = useMemo(() => {
    const columns: Record<string, Task[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
    };
    for (const task of tasks) {
      const status = normalizeStatus(task.status);
      columns[status].push(task);
    }
    return columns;
  }, [tasks]);

  const workTypes = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.domain ? task.domain : "unspecified";
      const list = groups.get(key) ?? [];
      list.push(task);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [tasks]);

  const gantt = useMemo(() => {
    const dated = tasks.filter((task) => task.startDate && task.endDate);
    if (dated.length === 0) return { dated: [], min: null, max: null };
    const dates = dated.flatMap((task) => [
      Date.parse(task.startDate!),
      Date.parse(task.endDate!),
    ]);
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    return { dated, min, max };
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setDraggingTaskId(null);
    if (!over) return;
    const taskId = String(active?.id ?? "");
    const nextStatus = String(over?.id ?? "");
    if (!taskId || !taskById.has(taskId)) return;
    if (!STATUS_COLUMNS.find((column) => column.key === nextStatus)) return;

    const task = taskById.get(taskId)!;
    const currentStatus = normalizeStatus(task.status);
    if (currentStatus === nextStatus) return;
    if (!task.draftId || task.revisionNumber === undefined) {
      setError("This task has no open draft to update.");
      return;
    }

    setSavingTaskId(taskId);
    setError(null);
    try {
      await applyChangeSet({
        draftType: "element",
        draftId: task.draftId,
        projectId,
        patchOps: [
          {
            op: "replace",
            path: `/tasks/byId/${task.id}/status`,
            value: nextStatus,
          },
        ],
        baseRevisionNumber: task.revisionNumber,
        reason: "Update task status",
        createdFrom: { tab: "Tasks", stage: "planning" },
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to update task status.");
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleEstimate = async () => {
    if (!data?.elements) return;
    setEstimating(true);
    setError(null);
    try {
      for (const element of data.elements) {
        if (!element.draftId) continue;
        const response = await estimateDependencies({
          projectId,
          elementId: element.elementId as Id<"elements">,
        });
        if (response.patchOps.length === 0) continue;
        await applyChangeSet({
          draftType: "element",
          draftId: response.draftId,
          projectId,
          patchOps: response.patchOps,
          baseRevisionNumber: response.baseRevisionNumber,
          reason: "AI dependency + time estimate",
          createdFrom: { tab: "Tasks", stage: "planning" },
        });
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to estimate task dependencies.");
    } finally {
      setEstimating(false);
    }
  };

  if (!data) {
    return <div className="p-8 text-gray-500">Loading tasks...</div>;
  }

  const selectedTask = selectedTaskId ? taskById.get(selectedTaskId) ?? null : null;

  return (
    <div className="p-8 max-w-6xl mx-auto text-black">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold">Tasks</h2>
          <p className="text-sm text-gray-500 mt-1">
            {data.totals.taskCount} tasks across {data.totals.elementCount} elements
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleEstimate}
            disabled={estimating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider bg-black text-white"
          >
            <Sparkles size={14} />
            {estimating ? "Estimating..." : "AI Estimate"}
          </button>
          <div className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-600">
            Draft view
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3 mb-6">
        <TabButton active={tab === "kanban"} onClick={() => setTab("kanban")} icon={KanbanSquare} label="Kanban" />
        <TabButton active={tab === "gantt"} onClick={() => setTab("gantt")} icon={GanttChart} label="Gantt" />
        <TabButton active={tab === "elements"} onClick={() => setTab("elements")} icon={Layers} label="Elements" />
        <TabButton active={tab === "work"} onClick={() => setTab("work")} icon={Grid} label="Studio Work Type" />
      </div>

      {data.elements.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-500">
          No elements yet. Create elements in Studio Agent to see tasks here.
        </div>
      ) : null}

      {tab === "kanban" && data.elements.length > 0 && (
        <DndContext
          sensors={sensors}
          onDragStart={(event) => setDraggingTaskId(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingTaskId(null)}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {STATUS_COLUMNS.map((column) => (
              <KanbanColumn
                key={column.key}
                status={column.key}
                label={column.label}
                count={kanban[column.key]?.length ?? 0}
              >
                {kanban[column.key]?.length === 0 ? (
                  <div className="text-xs text-gray-400">No tasks</div>
                ) : (
                  kanban[column.key].map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isSaving={savingTaskId === task.id}
                      onOpen={() => setSelectedTaskId(task.id)}
                    />
                  ))
                )}
              </KanbanColumn>
            ))}
          </div>
          <DragOverlay>
            {draggingTaskId && taskById.get(draggingTaskId) ? (
              <TaskCardGhost task={taskById.get(draggingTaskId)!} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {tab === "gantt" && data.elements.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900">
            Gantt Timeline
          </div>
          <div className="p-6 space-y-4">
            {gantt.dated.length === 0 ? (
              <div className="text-sm text-gray-500">No tasks with start/end dates yet.</div>
            ) : (
              gantt.dated.map((task) => (
                <div key={task.id} className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{task.title}</span>
                    <span>
                      {task.startDate} - {task.endDate}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-black h-full rounded-full"
                      style={{
                        marginLeft: `${percentOfRange(task.startDate!, gantt.min!, gantt.max!)}%`,
                        width: `${Math.max(
                          5,
                          percentOfRange(task.endDate!, gantt.min!, gantt.max!) -
                            percentOfRange(task.startDate!, gantt.min!, gantt.max!)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400">{task.elementTitle}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "elements" && data.elements.length > 0 && (
        <div className="space-y-6">
          {data.elements.map((element) => (
            <div
              key={element.elementId}
              className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-100 text-gray-700">
                    <Layers size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{element.elementTitle}</div>
                    <div className="text-xs text-gray-500">
                      {element.elementType} - {element.elementStatus}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{element.tasks.length} tasks</span>
              </div>
              <div className="divide-y">
                {element.tasks.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">No tasks yet for this element.</div>
                ) : (
                  element.tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className="w-full text-left p-6 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <ClipboardList size={16} className="text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900">{task.title}</div>
                          {task.domain ? (
                            <div className="text-xs text-gray-500 mt-1">{task.domain}</div>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{task.status ?? "todo"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "work" && data.elements.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {workTypes.map(([domain, items]) => (
            <div key={domain} className="bg-white border border-gray-100 rounded-xl shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900">
                {domain} ({items.length})
              </div>
              <div className="p-6 space-y-3 text-sm">
                {items.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="w-full text-left flex items-center justify-between hover:text-gray-900"
                  >
                    <div>
                      <div className="text-gray-900">{task.title}</div>
                      <div className="text-[10px] text-gray-400">{task.elementTitle}</div>
                    </div>
                    <span className="text-xs text-gray-400">{task.status ?? "todo"}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {workTypes.length === 0 ? (
            <div className="text-sm text-gray-500">No tasks to group yet.</div>
          ) : null}
        </div>
      )}

      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          taskById={taskById}
          onClose={() => setSelectedTaskId(null)}
        />
      ) : null}
    </div>
  );
}

function normalizeStatus(status?: string) {
  const value = (status ?? "todo").toLowerCase();
  if (value === "in progress" || value === "in_progress" || value === "doing") return "in_progress";
  if (value === "blocked") return "blocked";
  if (value === "done" || value === "complete") return "done";
  return "todo";
}

function percentOfRange(date: string, min: number, max: number) {
  const value = Date.parse(date);
  if (!Number.isFinite(value) || max === min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function formatMinutes(minutes?: number) {
  if (!minutes || !Number.isFinite(minutes)) return "--";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function TaskCard({
  task,
  onOpen,
  isSaving,
}: {
  task: Task;
  onOpen: () => void;
  isSaving?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => {
        if (!isDragging) onOpen();
      }}
      {...attributes}
      {...listeners}
      className={`border border-gray-100 rounded-lg p-3 bg-white shadow-sm cursor-pointer transition ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <TaskCardContent task={task} isSaving={isSaving} />
    </div>
  );
}

function TaskCardGhost({ task }: { task: Task }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-white shadow-lg">
      <TaskCardContent task={task} />
    </div>
  );
}

function TaskCardContent({ task, isSaving }: { task: Task; isSaving?: boolean }) {
  const deps = task.dependencies?.length ?? 0;
  const materials = task.materials?.length ?? 0;
  const labor = task.labor?.length ?? 0;
  const subtasks = task.subtasks?.length ?? 0;

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">{task.title}</div>
        {isSaving ? (
          <span className="text-[10px] text-amber-600 font-semibold uppercase">Saving</span>
        ) : null}
      </div>
      <div className="text-[10px] text-gray-400 mt-1">{task.elementTitle}</div>
      <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-gray-500">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
          <Clock size={10} /> {formatMinutes(task.estimatedMinutes)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
          <Link2 size={10} /> {deps}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
          <Boxes size={10} /> {materials}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
          <Wrench size={10} /> {labor}
        </span>
        {subtasks > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
            <ClipboardList size={10} /> {subtasks}
          </span>
        ) : null}
      </div>
      {task.domain ? (
        <div className="text-[10px] text-gray-500 mt-2 uppercase tracking-wide">
          {task.domain}
        </div>
      ) : null}
    </>
  );
}

function KanbanColumn({
  status,
  label,
  count,
  children,
}: {
  status: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`bg-white border border-gray-100 rounded-xl shadow-sm transition ${
        isOver ? "ring-2 ring-black/10" : ""
      }`}
    >
      <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold uppercase text-gray-500">
        {label} ({count})
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function TaskDetailModal({
  task,
  taskById,
  onClose,
}: {
  task: Task;
  taskById: Map<string, Task>;
  onClose: () => void;
}) {
  const dependencies = (task.dependencies ?? []).map((id) => taskById.get(id)?.title ?? id);
  const materials = task.materials ?? [];
  const labor = task.labor ?? [];
  const steps = task.steps ?? [];
  const subtasks = task.subtasks ?? [];
  const photos = task.photos ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase font-semibold text-gray-400">{task.elementTitle}</div>
            <div className="text-xl font-semibold text-gray-900">{task.title}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
            <DetailPill label="Status" value={task.status ?? "todo"} />
            <DetailPill label="Priority" value={task.priority ?? "normal"} />
            <DetailPill label="Category" value={task.category ?? "general"} />
            <DetailPill label="Domain" value={task.domain ?? "unspecified"} />
            <DetailPill label="Estimate" value={formatMinutes(task.estimatedMinutes)} />
            <DetailPill label="Assignee" value={task.assignee ?? "unassigned"} />
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase font-semibold text-gray-400">Description</div>
            <div className="text-sm text-gray-700">
              {task.description ? task.description : "No description yet."}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase font-semibold text-gray-400">Dependencies</div>
            {dependencies.length === 0 ? (
              <div className="text-sm text-gray-500">No dependencies set.</div>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                {dependencies.map((dep) => (
                  <span key={dep} className="px-2 py-1 rounded-full bg-gray-100">
                    {dep}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase font-semibold text-gray-400">Steps</div>
            {steps.length === 0 ? (
              <div className="text-sm text-gray-500">No steps listed.</div>
            ) : (
              <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                {steps.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase font-semibold text-gray-400">Subtasks</div>
            {subtasks.length === 0 ? (
              <div className="text-sm text-gray-500">No subtasks.</div>
            ) : (
              <div className="space-y-2">
                {subtasks.map((subtask, index) => (
                  <div
                    key={subtask.id ?? `${subtask.title}-${index}`}
                    className="flex items-center justify-between text-sm text-gray-700"
                  >
                    <span>{subtask.title ?? "Untitled subtask"}</span>
                    <span className="text-xs text-gray-400">{subtask.status ?? "todo"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-xs uppercase font-semibold text-gray-400">Materials</div>
              {materials.length === 0 ? (
                <div className="text-sm text-gray-500">No material links.</div>
              ) : (
                <div className="space-y-2 text-sm text-gray-700">
                  {materials.map((line) => (
                    <div key={line.id} className="flex items-center justify-between">
                      <span>{line.name}</span>
                      <span className="text-xs text-gray-500">
                        {line.qty} - {line.unitCost.toLocaleString()} NIS
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase font-semibold text-gray-400">Labor</div>
              {labor.length === 0 ? (
                <div className="text-sm text-gray-500">No labor links.</div>
              ) : (
                <div className="space-y-2 text-sm text-gray-700">
                  {labor.map((line) => (
                    <div key={line.id} className="flex items-center justify-between">
                      <span>{line.role}</span>
                      <span className="text-xs text-gray-500">
                        {line.qty} - {line.rate.toLocaleString()} NIS
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase font-semibold text-gray-400 flex items-center gap-2">
              <ImageIcon size={14} /> Photos
            </div>
            {photos.length === 0 ? (
              <div className="text-sm text-gray-500">No photos attached.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((photo, index) => (
                  <div
                    key={`${photo.url ?? "photo"}-${index}`}
                    className="border border-gray-100 rounded-lg overflow-hidden bg-gray-50"
                  >
                    {photo.url ? (
                      <img
                        src={photo.url}
                        alt={photo.label ?? "Task photo"}
                        className="w-full h-24 object-cover"
                      />
                    ) : (
                      <div className="w-full h-24 flex items-center justify-center text-xs text-gray-400">
                        Missing image
                      </div>
                    )}
                    {photo.label ? (
                      <div className="px-2 py-1 text-[10px] text-gray-500">{photo.label}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50">
      <div className="text-[10px] uppercase font-semibold text-gray-400">{label}</div>
      <div className="text-sm text-gray-700 mt-1">{value}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full ${
        active ? "bg-black text-white" : "bg-gray-100 text-gray-600"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
