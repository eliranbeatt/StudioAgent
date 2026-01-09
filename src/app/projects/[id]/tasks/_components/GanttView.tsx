import { Task } from "./types";
import { useMemo } from "react";

type GanttViewProps = {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
};

const WORK_DAY_HOURS = 10;
const SCALE_FACTOR = 24 / WORK_DAY_HOURS;

// Helper to get days between min and max
function getDaysInRange(min: number, max: number) {
  const days = [];
  const current = new Date(min);
  current.setHours(0, 0, 0, 0);

  const end = new Date(max);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export function GanttView({ tasks, onTaskClick }: GanttViewProps) {
  const ganttData = useMemo(() => {
    // 1. Initial Map & Parse
    const taskMap = new Map<string, any>();

    // Sort roughly by date first to maintain stable order
    const inputs = [...tasks].sort((a, b) => (a.startDate ?? "z").localeCompare(b.startDate ?? "z"));

    inputs.forEach(t => {
      let start = t.startDate ? Date.parse(t.startDate) : (t.plannedStartDate ? Date.parse(t.plannedStartDate) : null);

      // Default start to 8:00 AM
      if (start) {
        const date = new Date(start);
        if (date.getHours() === 0 && date.getMinutes() === 0) {
          date.setHours(8);
          start = date.getTime();
        }
      }

      const estimatedMinutes = t.estimatedMinutes || 90;
      const visualDurationMs = estimatedMinutes * 60 * 1000 * SCALE_FACTOR;

      let end = t.endDate ? Date.parse(t.endDate) : (t.plannedEndDate ? Date.parse(t.plannedEndDate) : null);

      if (start) {
        end = start + visualDurationMs;
      }

      // Fallback end
      if (start && !end) end = start + visualDurationMs;

      taskMap.set(t.id, {
        ...t,
        start,
        end,
        realMinutes: estimatedMinutes,
        visualDurationMs
      });
    });

    // 2. Resolve Dependencies (Sequence tasks that are dependent)
    // Run multiple passes to propagate delays through deep dependency chains
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (const taskId of taskMap.keys()) {
        const task = taskMap.get(taskId);
        if (!task.start) continue; // Unscheduled tasks can't move
        if (!task.dependencies || task.dependencies.length === 0) continue;

        let maxDepEnd = 0;
        task.dependencies.forEach((depId: string) => {
          const dep = taskMap.get(depId);
          // We only care about dependencies that ARE scheduled
          if (dep && dep.end) {
            const buffer = 30 * 60 * 1000 * SCALE_FACTOR; // 30 mins visual buffer
            if (dep.end + buffer > maxDepEnd) {
              maxDepEnd = dep.end + buffer;
            }
          }
        });

        if (maxDepEnd > task.start) {
          // Must shift start to after dependency end
          task.start = maxDepEnd;
          task.end = task.start + task.visualDurationMs;
          changed = true;
        }
      }
      if (!changed) break;
    }

    const computed = Array.from(taskMap.values());
    const scheduled = computed.filter(t => t.start !== null && t.end !== null);
    const unscheduled = computed.filter(t => t.start === null);

    if (scheduled.length === 0) return { scheduled: [], unscheduled, min: 0, max: 0, totalDuration: 0, days: [] };

    let min = Math.min(...scheduled.map(t => t.start));
    let max = Math.max(...scheduled.map(t => t.end));

    // Round min/max to day boundaries for the grid
    const minDate = new Date(min); minDate.setHours(0, 0, 0, 0);
    const maxDate = new Date(max); maxDate.setDate(maxDate.getDate() + 1); maxDate.setHours(0, 0, 0, 0);

    min = minDate.getTime();
    max = maxDate.getTime();

    // Final Sort by start time for the view
    scheduled.sort((a, b) => a.start - b.start);

    return {
      scheduled,
      unscheduled,
      min,
      max,
      totalDuration: max - min,
      days: getDaysInRange(min, max)
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
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Header Row */}
        <div className="flex border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-900 sticky top-0 z-20 shadow-sm">
          <div className="w-[200px] shrink-0 p-4 text-right border-r border-gray-100 sticky left-0 bg-gray-50 z-30">
            Tasks ({ganttData.scheduled.length})
          </div>

          {/* Scrollable Date Header Area (This is just a label container now, real header is inside scroll view) */}
          <div className="flex-1 p-4 text-left invisible">
            {/* Placeholder to keep height if needed, but we treat the header below as the real legend */}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-x-auto overflow-y-auto relative scrollbar-thin scrollbar-thumb-gray-200">
          {ganttData.scheduled.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500 p-12">
              No tasks with dates. Add Start Date (and optional Duration) to tasks.
            </div>
          ) : (
            <div className="min-w-full inline-block relative">
              {/* 1. Header with Dates (Sticky Top Inside Scroll) */}
              <div className="flex sticky top-0 z-20 bg-white border-b border-gray-100 h-10 w-full min-w-max text-xs">
                {/* Left corner filler (Syncs with sticky left col) */}
                <div className="w-[200px] shrink-0 border-r border-gray-100 bg-gray-50 sticky left-0 z-30"></div>

                {/* Date Columns */}
                <div className="flex-1 flex relative">
                  {ganttData.days.map((day, i) => (
                    <div key={i} className="flex-1 border-r border-gray-50 text-[10px] items-center justify-center flex font-medium text-gray-500 bg-gray-50 uppercase tracking-wider min-w-[100px]">
                      {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Grid Background (Absolute) */}
              <div className="absolute inset-0 top-10 left-[200px] flex z-0 pointer-events-none">
                {ganttData.days.map((_, i) => (
                  <div key={i} className="flex-1 border-r border-gray-50 h-full bg-transparent min-w-[100px]"></div>
                ))}
              </div>

              <div className="flex flex-col w-full min-w-max">
                {ganttData.scheduled.map((task) => {
                  const left = getLeftPercent(task.start);
                  const width = Math.max(0.5, getWidthPercent(task.start, task.end));

                  return (
                    <div key={task.id} className="flex border-b border-gray-50 hover:bg-gray-50 transition group h-12 w-full">
                      {/* Sticky Left Column */}
                      <div className="w-[200px] shrink-0 px-3 py-2 text-right bg-white border-r border-gray-100 sticky left-0 z-10 group-hover:bg-gray-50 flex flex-col justify-center shadow-[1px_0_3px_-1px_rgba(0,0,0,0.1)]">
                        <div
                          className="text-xs font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
                          onClick={() => onTaskClick(task.id)}
                          title={task.title}
                        >
                          {task.title}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate mt-0.5">{task.elementTitle}</div>
                      </div>

                      {/* Bar Container */}
                      <div className="flex-1 relative min-w-[100px]">
                        <div
                          className={`h-6 rounded-md absolute top-3 transition-opacity cursor-pointer hover:opacity-80 shadow-sm border border-black/5 flex items-center justify-center ${task.status === "done" ? "bg-green-500" :
                              task.status === "blocked" ? "bg-red-400" :
                                "bg-blue-500"
                            }`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                          }}
                          onClick={() => onTaskClick(task.id)}
                          title={`${task.title} (${Math.round(task.realMinutes / 60 * 10) / 10}h)`}
                        >
                          {/* Removed width condition to always show if possible */}
                          <div className="px-1 text-[9px] text-white/95 truncate font-medium w-full text-center leading-none">
                            {Math.round(task.realMinutes / 60 * 10) / 10}h
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
  // Unused now, but kept if needed
  const hours = Math.round((end - start) / (1000 * 60 * 60));
  return `${hours}h`;
}