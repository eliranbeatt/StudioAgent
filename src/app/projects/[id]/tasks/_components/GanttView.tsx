import { Task } from "./types";
import { useMemo } from "react";

type GanttViewProps = {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
};

export function GanttView({ tasks, onTaskClick }: GanttViewProps) {
  const ganttData = useMemo(() => {
    const computed = tasks.map(t => {
        let start = t.startDate ? Date.parse(t.startDate) : null;
        let end = t.endDate ? Date.parse(t.endDate) : null;
        
        // If start but no end, use estimate
        if (start && !end && t.estimatedMinutes) {
            end = start + (t.estimatedMinutes * 60 * 1000);
        }

        // If no start, it's unscheduled
        if (!start) return { ...t, start: null, end: null };
        
        // Fallback for end if still null (default 1 hour)
        if (!end) end = start + (60 * 60 * 1000);

        return { ...t, start, end };
    });

    const scheduled = computed.filter(t => t.start !== null && t.end !== null) as (Task & { start: number, end: number })[];
    const unscheduled = computed.filter(t => t.start === null);

    if (scheduled.length === 0) return { scheduled: [], unscheduled, min: 0, max: 0, totalDuration: 0 };

    const min = Math.min(...scheduled.map(t => t.start));
    const max = Math.max(...scheduled.map(t => t.end));
    // Add some padding (5%)
    const padding = (max - min) * 0.05;
    
    return { 
        scheduled: scheduled.sort((a,b) => a.start - b.start), 
        unscheduled, 
        min: min - padding, 
        max: max + padding,
        totalDuration: (max + padding) - (min - padding)
    };
  }, [tasks]);

  const getLeftPercent = (time: number) => {
      if (ganttData.totalDuration === 0) return 0;
      return ((time - ganttData.min) / ganttData.totalDuration) * 100;
  };

  const getWidthPercent = (start: number, end: number) => {
      if (ganttData.totalDuration === 0) return 0;
      return ((end - start) / ganttData.totalDuration) * 100;
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="text-sm font-semibold text-gray-900">
            Timeline ({ganttData.scheduled.length})
          </div>
          {ganttData.scheduled.length > 0 && (
             <div className="text-xs text-gray-500">
                 {new Date(ganttData.min).toLocaleDateString()} - {new Date(ganttData.max).toLocaleDateString()}
             </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 relative">
          {ganttData.scheduled.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
                No tasks with dates. Add Start Date (and optional Duration) to tasks.
            </div>
          ) : (
            <div className="space-y-4 relative min-w-[600px]">
                {/* Grid Lines (Simple) */}
                <div className="absolute inset-0 flex justify-between pointer-events-none opacity-10">
                    <div className="w-px bg-black h-full"></div>
                    <div className="w-px bg-black h-full"></div>
                    <div className="w-px bg-black h-full"></div>
                    <div className="w-px bg-black h-full"></div>
                    <div className="w-px bg-black h-full"></div>
                </div>

                {ganttData.scheduled.map((task) => {
                    const left = getLeftPercent(task.start);
                    const width = Math.max(0.5, getWidthPercent(task.start, task.end)); // Min width visibility

                    return (
                      <div key={task.id} className="relative group">
                        <div className="flex items-center justify-between text-xs mb-1 px-1">
                          <span 
                            className="font-medium text-gray-700 truncate max-w-[150px] cursor-pointer hover:text-blue-600"
                            onClick={() => onTaskClick(task.id)}
                          >
                              {task.title}
                          </span>
                          <span className="text-[10px] text-gray-400">
                              {new Date(task.start).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 h-6 rounded-md relative overflow-hidden">
                          <div
                            className={`h-full rounded-md absolute top-0 transition-all cursor-pointer hover:opacity-80 ${
                                task.status === "done" ? "bg-green-500" :
                                task.status === "blocked" ? "bg-red-400" :
                                "bg-blue-500"
                            }`}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                            }}
                            onClick={() => onTaskClick(task.id)}
                            title={`${task.title} (${formatDuration(task.start, task.end)})`}
                          >
                              {width > 5 && (
                                  <div className="px-2 py-1 text-[10px] text-white truncate">
                                      {task.elementTitle}
                                  </div>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                })}
            </div>
          )}
        </div>
      </div>

      {ganttData.unscheduled.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden shrink-0 max-h-[300px] flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900 bg-amber-50/50">
            Unscheduled Tasks ({ganttData.unscheduled.length})
          </div>
          <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ganttData.unscheduled.map((task) => (
              <button
                key={task.id}
                onClick={() => onTaskClick(task.id)}
                className="text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition bg-white"
              >
                <div className="text-sm font-medium text-gray-900 truncate">{task.title}</div>
                <div className="text-xs text-gray-500 mt-1">{task.elementTitle}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(start: number, end: number) {
    const hours = Math.round((end - start) / (1000 * 60 * 60));
    const days = (hours / 24).toFixed(1);
    return `${hours}h (${days}d)`;
}