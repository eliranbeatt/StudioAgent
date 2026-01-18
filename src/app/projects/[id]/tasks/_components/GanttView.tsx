import { Task } from "./types";
import { useMemo, useRef, useState, useEffect } from "react";

type GanttViewProps = {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
  onTaskDateChange: (taskId: string, newDate: string) => void;
};

const WORK_DAY_HOURS = 10;
const SCALE_FACTOR = 24 / WORK_DAY_HOURS; // Visual scale factor

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

export function GanttView({ tasks, onTaskClick, onTaskDateChange }: GanttViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Resize Observer for dynamic 7-day width
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate day width: subtract left column (200px) then divide by 7
  // Min width 60px to prevent squeezing too much
  const dayWidth = Math.max(60, (containerWidth - 200) / 7);

  const ganttData = useMemo(() => {
    // 0. Configuration
    const today = new Date();
    today.setHours(8, 0, 0, 0);
    const BASE_START_TIME = today.getTime();

    // Track usage per day (YYYY-MM-DD -> hours used)
    const dailyUsage = new Map<string, number>();

    // Helper to get day key
    const getDayKey = (timestamp: number) => {
      const d = new Date(timestamp);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Helper to get 8:00 AM for a specific timestamp's day
    const getWorkDayStart = (timestamp: number) => {
      const d = new Date(timestamp);
      d.setHours(8, 0, 0, 0);
      return d.getTime();
    };

    // Parse tasks and build map
    const taskMap = new Map<string, any>();
    const inputs = [...tasks].filter(t => t.status !== "done"); // Filter DONE first

    // Sort inputs to ensure stable "priority" for resource leveling (Earliest "Planned" date first)
    inputs.sort((a, b) => {
      const dateA = a.startDate || a.plannedStartDate || "z";
      const dateB = b.startDate || b.plannedStartDate || "z";
      return dateA.localeCompare(dateB);
    });

    inputs.forEach(t => {
      const estimatedHours = t.estimatedHours || 1.5;
      // Visual duration in "days" units (since grid is days)
      // We map 10h -> 1 day width
      // So hours -> days = hours / 10
      const visualDurationDays = estimatedHours / 10;

      taskMap.set(t.id, {
        ...t,
        estimatedHours,
        visualDurationDays,
        realHours: estimatedHours,
        // Will be populated by schedule()
        start: null,
        end: null,
        scheduled: false,
        visiting: false,
      });
    });

    // Recursive Scheduler
    const scheduleTask = (taskId: string) => {
      const task = taskMap.get(taskId);
      if (!task) return null; // dependency missing or filtered
      if (task.scheduled) return task;
      if (task.visiting) return null; // Cycle detected, break

      task.visiting = true;

      // 1. Resolve Dependencies to find Earliest Constraints
      let constraintTime = BASE_START_TIME;

      if (task.startDate) {
        const manualStart = new Date(task.startDate).getTime();
        if (manualStart > constraintTime) constraintTime = manualStart;
      }

      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach((depId: string) => {
          // Process dependency
          const depTask = scheduleTask(depId);
          if (depTask && depTask.end) {
            // My start cannot be before Dependency End
            if (depTask.end > constraintTime) {
              constraintTime = depTask.end;
            }
          }
        });
      }

      // 2. Find Fit in Daily Capacity
      // We search forward from constraintTime until we find a day with space
      let currentProbe = constraintTime;
      const durationHours = task.estimatedHours;
      const msPerHour = 60 * 60 * 1000;

      while (true) {
        const dayKey = getDayKey(currentProbe);
        const dayStart8AM = getWorkDayStart(currentProbe);

        const usedHours = dailyUsage.get(dayKey) || 0;
        const resourceAvailableTime = dayStart8AM + (usedHours * msPerHour);

        // We must be AFTER both constraint and resource availability
        let actualStart = Math.max(currentProbe, resourceAvailableTime);

        // Does it fit in the day? (Day ends at 8AM + 10h)
        const dayEnd = dayStart8AM + (WORK_DAY_HOURS * msPerHour);
        const actualEnd = actualStart + (durationHours * msPerHour);

        if (actualEnd <= dayEnd) {
          // Fits!
          task.start = actualStart;
          task.end = actualEnd; // Keep end in ms for calculation

          // Calculate visual start (in days relative to grid start) later

          task.scheduled = true;
          task.visiting = false;

          const newUsage = (actualEnd - dayStart8AM) / msPerHour;
          dailyUsage.set(dayKey, newUsage);

          return task;
        } else {
          // Doesn't fit. Move to next day 8:00 AM
          const nextDay = new Date(dayStart8AM);
          nextDay.setDate(nextDay.getDate() + 1);
          nextDay.setHours(8, 0, 0, 0);
          currentProbe = nextDay.getTime();
        }

        // Safety break
        if (currentProbe > BASE_START_TIME + (365 * 24 * 60 * 60 * 1000)) {
          console.warn("Task could not be scheduled within a year:", task.title);
          task.visiting = false;
          return null;
        }
      }
    };

    // Run scheduler for all inputs
    inputs.forEach(t => scheduleTask(t.id));

    const computed = Array.from(taskMap.values());
    const scheduled = computed.filter(t => t.scheduled);
    const unscheduled = computed.filter(t => !t.scheduled);

    if (scheduled.length === 0) return { scheduled: [], unscheduled, min: 0, max: 0, days: [] };

    let min = Math.min(...scheduled.map(t => t.start));
    let max = Math.max(...scheduled.map(t => t.end));

    // Ensure we show at least 7 days from min
    const minDate = new Date(min); minDate.setHours(0, 0, 0, 0);
    // Max should be at least min + 7 days
    const minMaxDate = new Date(minDate);
    minMaxDate.setDate(minMaxDate.getDate() + 8);

    let maxDate = new Date(max);
    maxDate.setDate(maxDate.getDate() + 1);
    maxDate.setHours(0, 0, 0, 0);

    if (maxDate < minMaxDate) maxDate = minMaxDate;

    min = minDate.getTime();
    max = maxDate.getTime();

    // Final Sort by start time for the view
    scheduled.sort((a, b) => a.start - b.start);

    return {
      scheduled,
      unscheduled,
      min,
      max,
      days: getDaysInRange(min, max)
    };
  }, [tasks]);

  const msPerDay = 24 * 60 * 60 * 1000;

  // Helper to calculate pixel position left based on time
  const getLeftPx = (time: number) => {
    if (!ganttData.min) return 0;
    // Calculate days from start
    const daysFromStart = (time - ganttData.min) / msPerDay;
    return daysFromStart * dayWidth;
  };

  // Helper: map start time + hours duration to width in pixels
  // We know 10 hours = 1 dayWidth (roughly, for visualization content)
  // This is a simplification. For exact visual alignment with the "scheduling" which stacks,
  // we might want to just render them sequentially. 
  // But standard Gantt relies on time-axis.
  // Our agile scheduler puts them on specific days and times.
  // Let's rely on time difference for Position, but Width is duration.
  // Note: "time" in scheduler includes "night" gaps if we span days? No, scheduler fits in one day or moves entirely.
  // So duration is continuous.
  // 10h work day vs 24h timeline. 
  // If we map 1 day (24h) to dayWidth, then a 10h task is (10/24) * dayWidth?
  // No, user wants 10h capacity to fill the day visually?
  // Let's assume the visual grid represents "Working Days".
  // Simplified: left = dayIndex * dayWidth + (hourOffset / 10) * dayWidth.
  // Width = (duration / 10) * dayWidth.
  const getTaskStyle = (task: any) => {
    const d = new Date(task.start);
    // Find day index
    // dayIndex = floor((task.start - min) / msPerDay)
    const dayIndex = Math.floor((task.start - ganttData.min) / msPerDay);

    // Hour offset (8:00 is 0, 18:00 is full)
    const h = d.getHours() + (d.getMinutes() / 60);
    const hourOffset = Math.max(0, h - 8); // Assume 8am start

    const left = (dayIndex * dayWidth) + ((hourOffset / 10) * dayWidth);
    const width = (task.realHours / 10) * dayWidth;

    return { left, width };
  };

  // Drag and Drop State
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0); // Px offset
  const [dragStartX, setDragStartX] = useState(0);

  const handleMouseDown = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setDraggingId(taskId);
    setDragStartX(e.clientX);
    setDragOffset(0);
  };

  useEffect(() => {
    if (draggingId) {
      const handleMouseMove = (e: MouseEvent) => {
        setDragOffset(e.clientX - dragStartX);
      };
      const handleMouseUp = () => {
        if (Math.abs(dragOffset) > 5) { // Threshold
          // Calculate new date
          // We only support moving by "Days" effectively to keep it simple for now, 
          // or we find the new "Start Date" timestamp.
          // Current logic: Agile scheduler respects "startDate" property.
          // So we calculate the new specific Date/Time and save it.

          const task = ganttData.scheduled.find(t => t.id === draggingId);
          if (task) {
            const pxDelta = dragOffset;
            // Convert px to ms? Not linear because of 10h work day vs 24h clock.
            // Simplest: Add (px / dayWidth) days to the current start date.
            const daysDelta = Math.round(pxDelta / dayWidth);

            if (daysDelta !== 0) {
              const newStartDate = new Date(task.start);
              // We just add full days to the start timestamp
              newStartDate.setDate(newStartDate.getDate() + daysDelta);

              // Normalize to 8 AM if it drifted (which it shouldn't if we just add days)
              // But dragging "Time" within day is tricky with this stack model.
              // Let's stick to Day-level granularity for drag to start.

              // Format YYYY-MM-DD
              const dateStr = `${newStartDate.getFullYear()}-${String(newStartDate.getMonth() + 1).padStart(2, '0')}-${String(newStartDate.getDate()).padStart(2, '0')}`;
              onTaskDateChange(draggingId, dateStr);
            }
          }
        }
        setDraggingId(null);
        setDragOffset(0);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [draggingId, dragOffset, dragStartX, ganttData.scheduled, dayWidth, onTaskDateChange]);


  return (
    <div className="space-y-6 h-full flex flex-col" ref={containerRef}>
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Header Row */}
        <div className="flex border-b border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-900 sticky top-0 z-20 shadow-sm">
          <div className="w-[200px] shrink-0 p-4 text-right border-r border-gray-100 sticky left-0 bg-gray-50 z-30">
            Tasks ({ganttData.scheduled.length})
          </div>

          <div className="flex-1 overflow-hidden relative">
            {/* Header Syncs with Scroll Body manually or we rely on main scroll? 
                 Main scroll is below. We need this header to scroll WITH the body. 
                 Tricky without sync.
                 Easier approach: Put header INSIDE the scrollable area below?
                 Or use simple onScroll sync.
                 Let's put header inside the scroll view for perfect sync.
             */}
          </div>
        </div>

        {/* Scrollable Body (includes header now for simplicity) */}
        <div className="flex-1 overflow-x-auto overflow-y-auto relative scrollbar-thin scrollbar-thumb-gray-200">

          {ganttData.scheduled.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500 p-12">
              No tasks.
            </div>
          ) : (
            <div className="inline-block" style={{ minWidth: (ganttData.days.length * dayWidth) + 200 }}>
              {/* 1. Sticky Header Row Inside Scroll */}
              <div className="flex sticky top-0 z-20 bg-white border-b border-gray-100 h-10 min-w-max text-xs">
                <div className="w-[200px] shrink-0 border-r border-gray-100 bg-gray-50 sticky left-0 z-30 flex items-center justify-end px-4 font-semibold">
                  Tasks
                </div>
                <div className="flex">
                  {ganttData.days.map((day, i) => (
                    <div key={i} style={{ width: dayWidth }} className="border-r border-gray-50 text-[10px] items-center justify-center flex font-medium text-gray-500 bg-gray-50 uppercase tracking-wider shrink-0">
                      {day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Grid Background (Absolute) */}
              <div className="absolute inset-0 top-10 left-[200px] flex z-0 pointer-events-none h-full">
                {ganttData.days.map((_, i) => (
                  <div key={i} style={{ width: dayWidth }} className="border-r border-gray-50 h-full bg-transparent shrink-0"></div>
                ))}
              </div>

              {/* 3. Task Rows */}
              <div className="flex flex-col w-full">
                {ganttData.scheduled.map((task) => {
                  const { left, width } = getTaskStyle(task);

                  const isDragging = draggingId === task.id;
                  const visualLeft = isDragging ? left + dragOffset : left;

                  // Custom Styles
                  let bgClass = "bg-blue-500";
                  let styleObj: any = {};
                  if (task.status === "blocked") {
                    bgClass = "bg-red-500";
                  } else if (task.status === "in_progress") {
                    bgClass = "";
                    styleObj = { background: "linear-gradient(90deg, #22c55e 50%, #ffffff 50%)", border: "1px solid #22c55e" };
                  }

                  return (
                    <div key={task.id} className="flex border-b border-gray-50 hover:bg-gray-50 transition group h-12 w-full relative">
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

                      {/* Bar Container Area */}
                      <div className="relative flex-1 h-full">
                        <div
                          className={`h-6 rounded-md absolute top-3 shadow-sm border border-black/5 flex items-center justify-center cursor-move text-white ${bgClass} ${isDragging ? "opacity-80 z-50 scale-105" : "hover:opacity-90"}`}
                          style={{
                            left: visualLeft,
                            width,
                            ...styleObj,
                            transition: isDragging ? "none" : "left 0.3s ease, width 0.3s ease",
                          }}
                          onMouseDown={(e) => handleMouseDown(e, task.id)}
                          title={`${task.title} (${Math.round(task.realHours * 10) / 10}h)`}
                        >
                          <div className={`px-1 text-[9px] truncate font-medium w-full text-center leading-none ${task.status === "in_progress" ? "text-gray-700" : "text-white/95"}`}>
                            {Math.round(task.realHours * 10) / 10}h
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
