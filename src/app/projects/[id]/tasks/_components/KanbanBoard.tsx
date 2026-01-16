import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  closestCorners,
} from "@dnd-kit/core";
import { 
    SortableContext, 
    useSortable, 
    verticalListSortingStrategy, 
    arrayMove 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Task } from "./types";
import { useMemo, useState, useEffect } from "react";
import { Calendar, Clock, Link2, Boxes, Wrench } from "lucide-react";

type KanbanBoardProps = {
  tasks: Task[];
  columnOrder?: Record<string, string[]> | null;
  onTaskClick: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onOrderChange: (newOrder: Record<string, string[]>) => void;
  onChecklistToggle?: (taskId: string, itemId: string) => void;
  savingTaskId?: string | null;
};

const STATUS_COLUMNS = [
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

export function KanbanBoard({
    tasks,
    columnOrder,
    onTaskClick,
    onStatusChange,
    onOrderChange,
    onChecklistToggle,
    savingTaskId 
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Local state for optimistic UI
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({});
  const [prevTasks, setPrevTasks] = useState(tasks);
  const [prevColumnOrder, setPrevColumnOrder] = useState(columnOrder);

  // Sync local order with props (derived state pattern)
  if (tasks !== prevTasks || columnOrder !== prevColumnOrder) {
      const newOrder: Record<string, string[]> = {};
      
      // Group current tasks
      const grouped = new Map<string, Task[]>();
      tasks.forEach(t => {
          const status = normalizeStatus(t.status);
          const list = grouped.get(status) ?? [];
          list.push(t);
          grouped.set(status, list);
      });

      // Build order respecting both columnOrder prop and current task list
      STATUS_COLUMNS.forEach(col => {
          const statusTasks = grouped.get(col.key) ?? [];
          const propOrder = columnOrder?.[col.key]; // Order from DB
          
          // Use current localOrder if available to preserve drag state? 
          // No, if server tasks change, we usually want to re-incorporate. 
          // But purely replacing it resets drag. 
          // Since we are in render loop, this will run on update.
          // If we are dragging, tasks prop usually doesn't update unless we trigger it.
          // For now, simple re-calc.
          const currentLocal = localOrder[col.key]; 

          const sourceOrder = propOrder ?? currentLocal ?? [];
          
          const taskMap = new Map(statusTasks.map(t => [t.id, t]));
          const sortedIds: string[] = [];
          
          // 1. Add known IDs in order
          sourceOrder.forEach(id => {
              if (taskMap.has(id)) {
                  sortedIds.push(id);
                  taskMap.delete(id);
              }
          });
          // 2. Append new tasks
          taskMap.forEach((_, id) => sortedIds.push(id));
          
          newOrder[col.key] = sortedIds;
      });
      
      setLocalOrder(newOrder);
      setPrevTasks(tasks);
      setPrevColumnOrder(columnOrder);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const columns = useMemo(() => {
      const cols: Record<string, Task[]> = {};
      const taskMap = new Map(tasks.map(t => [t.id, t]));

      STATUS_COLUMNS.forEach(col => {
          const ids = localOrder[col.key] ?? [];
          cols[col.key] = ids.map(id => taskMap.get(id)).filter(Boolean) as Task[];
      });
      return cols;
  }, [tasks, localOrder]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    // Find source container
    const activeTask = tasks.find(t => t.id === activeTaskId);
    const sourceStatus = normalizeStatus(activeTask?.status);
    
    // Find dest container
    let destStatus = "";
    if (STATUS_COLUMNS.find(c => c.key === overId)) {
        destStatus = overId;
    } else {
        const found = Object.entries(columns).find(([key, list]) => list.some(t => t.id === overId));
        if (found) destStatus = found[0];
    }

    if (!destStatus) return;

    if (sourceStatus === destStatus) {
        // Reordering
        const columnIds = localOrder[sourceStatus] ?? [];
        const oldIndex = columnIds.indexOf(activeTaskId);
        const newIndex = columnIds.indexOf(overId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newIds = arrayMove(columnIds, oldIndex, newIndex);
            
            // Optimistic update
            const nextOrder = { ...localOrder, [sourceStatus]: newIds };
            setLocalOrder(nextOrder);
            
            // Persist
            onOrderChange(nextOrder);
        }
    } else {
        // Moving columns
        const sourceIds = (localOrder[sourceStatus] ?? []).filter(id => id !== activeTaskId);
        const destIds = [...(localOrder[destStatus] ?? [])];
        
        let insertIndex = destIds.length;
        if (overId !== destStatus) {
             const idx = destIds.indexOf(overId);
             if (idx !== -1) insertIndex = idx;
        }
        destIds.splice(insertIndex, 0, activeTaskId);

        // Optimistic update
        const nextOrder = { 
            ...localOrder,
            [sourceStatus]: sourceIds,
            [destStatus]: destIds 
        };
        setLocalOrder(nextOrder);

        // Persist (Order + Status)
        onStatusChange(activeTaskId, destStatus);
        onOrderChange(nextOrder);
    }
  };

  const activeDragTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full overflow-x-auto pb-4">
        {STATUS_COLUMNS.map((column) => (
          <KanbanColumn
            key={column.key}
            status={column.key}
            label={column.label}
            count={columns[column.key]?.length ?? 0}
            taskIds={(columns[column.key] ?? []).map(t => t.id)}
          >
            {(columns[column.key] ?? []).map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                isSaving={savingTaskId === task.id}
                onClick={() => onTaskClick(task.id)}
                onChecklistToggle={onChecklistToggle}
              />
            ))}
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay>
        {activeDragTask ? <TaskCardGhost task={activeDragTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function normalizeStatus(status?: string) {
  const value = (status ?? "todo").toLowerCase();
  if (value === "in progress" || value === "in_progress" || value === "doing") return "in_progress";
  if (value === "blocked") return "blocked";
  if (value === "done" || value === "complete") return "done";
  return "todo";
}

function KanbanColumn({
  status,
  label,
  count,
  taskIds,
  children,
}: {
  status: string;
  label: string;
  count: number;
  taskIds: string[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  
  return (
    <div
      ref={setNodeRef}
      className={`bg-gray-50/50 border border-gray-200/60 rounded-xl flex flex-col h-full min-h-[500px] transition ${
        isOver ? "ring-2 ring-black/5 bg-gray-50" : ""
      }`}
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
         <div className="text-xs font-bold uppercase text-gray-500 tracking-wide">
            {label}
         </div>
         <span className="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-medium">
            {count}
         </span>
      </div>
      <div className="p-3 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
         <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {children}
         </SortableContext>
        {count === 0 && (
            <div className="h-32 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
                <span className="text-xs text-gray-400">Drop here</span>
            </div>
        )}
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  onClick,
  onChecklistToggle,
  isSaving,
}: {
  task: Task;
  onClick: () => void;
  onChecklistToggle?: (taskId: string, itemId: string) => void;
  isSaving?: boolean;
}) {
  const { 
      attributes, 
      listeners, 
      setNodeRef, 
      transform, 
      transition, 
      isDragging 
  } = useSortable({ id: task.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
          if (!isDragging) onClick();
      }}
      className={`group relative border border-gray-200 bg-white rounded-lg p-3 shadow-sm hover:shadow-md hover:border-gray-300 cursor-grab active:cursor-grabbing touch-none ${
        isDragging ? "opacity-30" : ""
      } ${task.isDraft ? "border-amber-200 bg-amber-50/30" : ""}`}
    >
      <TaskCardContent task={task} isSaving={isSaving} onChecklistToggle={onChecklistToggle} />
    </div>
  );
}

function TaskCardGhost({ task }: { task: Task }) {
  return (
    <div className="border border-gray-200 bg-white rounded-lg p-3 shadow-xl rotate-2 opacity-90 cursor-grabbing">
      <TaskCardContent task={task} />
    </div>
  );
}

function TaskCardContent({
  task,
  isSaving,
  onChecklistToggle,
}: {
  task: Task;
  isSaving?: boolean;
  onChecklistToggle?: (taskId: string, itemId: string) => void;
}) {
  const deps = task.dependencies?.length ?? 0;
  const materials = task.materials?.length ?? 0;
  const labor = task.labor?.length ?? 0;
  const checklist = task.checklist ?? [];
  const sortedChecklist = [...checklist].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const previewChecklist = sortedChecklist.slice(0, 3);
  const checklistDone = checklist.filter((item) => item.done).length;
  const checklistTotal = checklist.length;
  const dateRange = getDateRange(task);

  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
            {task.title}
        </div>
        {isSaving && (
           <div className="animate-pulse w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
        )}
      </div>

      {task.workType ? (
        <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full inline-flex">
          {formatWorkType(task.workType)}
        </div>
      ) : null}
      
      <div className="text-[10px] text-gray-400 mb-2 truncate">
        {task.elementTitle}
      </div>

      {dateRange ? (
        <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
          <span className="inline-flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
            <Calendar size={10} /> {dateRange}
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        {task.estimatedHours ? (
            <span className="inline-flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
            <Clock size={10} /> {formatHours(task.estimatedHours)}
            </span>
        ) : null}
        
        {(deps > 0 || materials > 0 || labor > 0) && (
            <div className="flex items-center gap-2 ml-auto">
                {deps > 0 && <span className="flex items-center gap-0.5"><Link2 size={10} />{deps}</span>}
                {materials > 0 && <span className="flex items-center gap-0.5"><Boxes size={10} />{materials}</span>}
                {labor > 0 && <span className="flex items-center gap-0.5"><Wrench size={10} />{labor}</span>}
            </div>
        )}
      </div>

      {checklistTotal > 0 ? (
        <div className="mt-2 space-y-2">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${Math.round((checklistDone / checklistTotal) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-400">
            Checklist {checklistDone}/{checklistTotal}
          </div>
          <div className="space-y-1">
            {previewChecklist.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 text-[10px] text-gray-600"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => onChecklistToggle?.(task.id, item.id)}
                />
                <span className={item.done ? "line-through text-gray-400" : ""}>{item.title}</span>
              </label>
            ))}
            {sortedChecklist.length > previewChecklist.length ? (
              <div className="text-[10px] text-gray-400">
                +{sortedChecklist.length - previewChecklist.length} more
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      
      {task.isDraft && (
          <div className="absolute top-0 right-0 -mt-1 -mr-1">
             <span className="flex h-2 w-2 relative">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
             </span>
          </div>
      )}
    </>
  );
}

function formatHours(hours?: number) {
  if (!hours || !Number.isFinite(hours)) return "--";
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded}h`;
}

function formatWorkType(value: string) {
  return value.replace(/_/g, " ");
}

function getDateRange(task: Task) {
  const start = task.plannedStartDate ?? task.startDate;
  const end = task.plannedEndDate ?? task.endDate;
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} - ${formatDate(end)}`;
  return start ? formatDate(start) : formatDate(end as string);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
