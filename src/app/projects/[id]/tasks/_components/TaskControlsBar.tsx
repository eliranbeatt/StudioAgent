import { KanbanSquare, GanttChart, Layers, Grid, Search, Filter, X } from "lucide-react";
import { TaskViewMode, TaskFilters } from "./types";

type TaskControlsBarProps = {
  view: TaskViewMode;
  setView: (view: TaskViewMode) => void;
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  // Options for filters
  assignees: string[];
  categories: string[];
  elements: { id: string; title: string }[];
};

export function TaskControlsBar({
  view,
  setView,
  filters,
  setFilters,
  assignees,
  categories,
  elements,
}: TaskControlsBarProps) {
  const hasActiveFilters = filters.assignee || filters.category || filters.elementId || filters.status;

  const clearFilters = () => {
      setFilters({ search: filters.search }); // Keep search, clear others
  };

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* View Switcher */}
        <div className="flex items-center gap-1 bg-gray-100/50 p-1 rounded-lg self-start">
            <ViewButton active={view === "kanban"} onClick={() => setView("kanban")} icon={KanbanSquare} label="Kanban" />
            <ViewButton active={view === "gantt"} onClick={() => setView("gantt")} icon={GanttChart} label="Gantt" />
            <ViewButton active={view === "elements"} onClick={() => setView("elements")} icon={Layers} label="Elements" />
            <ViewButton active={view === "studio"} onClick={() => setView("studio")} icon={Grid} label="Studio" />
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                    type="text" 
                    placeholder="Search tasks..." 
                    className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 w-48 lg:w-64 transition"
                    value={filters.search || ""}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
            </div>
            
            <FilterSelect 
                label="Assignee" 
                value={filters.assignee} 
                options={assignees} 
                onChange={(val) => setFilters({ ...filters, assignee: val })}
            />
            
            <FilterSelect 
                label="Category" 
                value={filters.category} 
                options={categories} 
                onChange={(val) => setFilters({ ...filters, category: val })}
            />

             <select
                value={filters.elementId || ""}
                onChange={(e) => setFilters({ ...filters, elementId: e.target.value || undefined })}
                className={`px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 bg-white cursor-pointer transition max-w-[150px] truncate ${
                    filters.elementId ? "border-black text-black" : "border-gray-200 text-gray-500"
                }`}
            >
                <option value="">Element</option>
                {elements.map(el => (
                    <option key={el.id} value={el.id}>{el.title}</option>
                ))}
            </select>

            {hasActiveFilters && (
                <button 
                    onClick={clearFilters}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Clear filters"
                >
                    <X size={16} />
                </button>
            )}
        </div>
      </div>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition ${
        active ? "bg-white shadow-sm text-black ring-1 ring-black/5" : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
      }`}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FilterSelect({ 
    label, 
    value, 
    options, 
    onChange 
}: { 
    label: string, 
    value?: string, 
    options: string[], 
    onChange: (val?: string) => void 
}) {
    return (
        <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={`px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 bg-white cursor-pointer transition max-w-[120px] truncate ${
                value ? "border-black text-black" : "border-gray-200 text-gray-500"
            }`}
        >
            <option value="">{label}</option>
            {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    );
}