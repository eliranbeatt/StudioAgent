import { Sparkles, Trello, Settings, Plus } from "lucide-react";

type TasksTopBarProps = {
  onEstimate: () => void;
  isEstimating: boolean;
  onSyncTrello: () => void;
  onConfigureTrello: () => void;
  taskCount: number;
  elementCount: number;
  onAddTask: () => void;
};

export function TasksTopBar({
  onEstimate,
  isEstimating,
  onSyncTrello,
  onConfigureTrello,
  taskCount,
  elementCount,
  onAddTask,
}: TasksTopBarProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
      <div>
        <h2 className="text-3xl font-bold">Tasks</h2>
        <p className="text-sm text-gray-500 mt-1">
          {taskCount} tasks across {elementCount} elements
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onAddTask}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider border border-gray-200 hover:bg-gray-50 transition"
        >
          <Plus size={14} />
          Add Task
        </button>

        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200">
          <button
            onClick={onSyncTrello}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-black hover:bg-white rounded-md transition"
          >
            <Trello size={14} />
            Sync
          </button>
          <div className="w-px h-4 bg-gray-300 mx-1"></div>
          <button
            onClick={onConfigureTrello}
            className="p-1.5 text-gray-500 hover:text-black hover:bg-white rounded-md transition"
            title="Trello Settings"
          >
            <Settings size={14} />
          </button>
        </div>

        <button
          onClick={onEstimate}
          disabled={isEstimating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider bg-black text-white hover:bg-gray-800 transition disabled:opacity-50"
        >
          <Sparkles size={14} />
          {isEstimating ? "Estimating..." : "Auto-Estimate"}
        </button>
      </div>
    </div>
  );
}
