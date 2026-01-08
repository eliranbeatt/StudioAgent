import { Task } from "./types";
import { useMemo } from "react";

type StudioGroupedListProps = {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
};

export function StudioGroupedList({ tasks, onTaskClick }: StudioGroupedListProps) {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {workTypes.map(([domain, items]) => (
        <div key={domain} className="bg-white border border-gray-100 rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900 uppercase">
            {domain} ({items.length})
          </div>
          <div className="p-6 space-y-3 text-sm">
            {items.map((task) => (
              <button
                key={task.id}
                onClick={() => onTaskClick(task.id)}
                className="w-full text-left flex items-center justify-between hover:bg-gray-50 p-2 -mx-2 rounded-lg transition"
              >
                <div>
                  <div className="text-gray-900 font-medium">{task.title}</div>
                  <div className="text-[10px] text-gray-400">{task.elementTitle}</div>
                </div>
                <span className="text-xs text-gray-400 px-2 py-1 bg-gray-50 rounded">{task.status ?? "todo"}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {workTypes.length === 0 ? (
        <div className="text-sm text-gray-500">No tasks to group yet.</div>
      ) : null}
    </div>
  );
}
