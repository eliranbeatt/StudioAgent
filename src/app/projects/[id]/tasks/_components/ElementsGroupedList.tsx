import { Task } from "./types";
import { Layers, ClipboardList, Calendar } from "lucide-react";

type ElementsGroupedListProps = {
  elements: {
      elementId: string;
      elementTitle: string;
      elementType: string;
      elementStatus: string;
      tasks: Task[];
  }[];
  onTaskClick: (taskId: string) => void;
};

export function ElementsGroupedList({ elements, onTaskClick }: ElementsGroupedListProps) {
  return (
    <div className="space-y-6">
      {elements.map((element) => (
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
                  onClick={() => onTaskClick(task.id)}
                  className="w-full text-left p-6 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <ClipboardList size={16} className="text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{task.title}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-gray-500">
                        {task.workType ? (
                          <span className="text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                            {task.workType.replace(/_/g, " ")}
                          </span>
                        ) : null}
                        {getDateRange(task) ? (
                          <span className="inline-flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                            <Calendar size={10} /> {getDateRange(task)}
                          </span>
                        ) : null}
                      </div>
                      {renderChecklistProgress(task)}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">{task.status ?? "todo"}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
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

function renderChecklistProgress(task: Task) {
  const checklist = task.checklist ?? [];
  const done = checklist.filter((item) => item.done).length;
  const total = checklist.length;
  if (!total) return null;
  const percent = Math.round((done / total) * 100);
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-gray-400">
        Checklist {done}/{total}
      </div>
    </div>
  );
}
