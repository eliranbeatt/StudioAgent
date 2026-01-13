import { Check, X, Search } from "lucide-react";

export function ChangeSetBlock({ block, onApply, onDiscard, onReview }: { block: any, onApply?: () => void, onDiscard?: () => void, onReview?: () => void }) {
  const changes = block.changeSet?.ops?.length 
    ? { "Ops Count": block.changeSet.ops.length } 
    : (block.changes ?? {});

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm" dir="auto">
      <div className="flex justify-between items-start">
          <div>
            <div className="text-xs font-semibold text-gray-900">{block.title_he ?? "Proposed Changes"}</div>
            <div className="text-[11px] text-gray-500 mt-1">{block.summary_he}</div>
          </div>
          <div className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded">ChangeSet</div>
      </div>
      
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-gray-500">
        {Object.entries(changes).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between rounded-md border border-blue-100 px-2 py-1">
            <span>{key}</span>
            <span className="font-semibold text-gray-700">{String(value)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button 
            onClick={onReview}
            className="flex-1 bg-blue-50 text-blue-700 border border-blue-200 py-2 rounded text-xs font-bold flex items-center justify-center gap-1 hover:bg-blue-100"
        >
            <Search size={14} /> Review
        </button>
        <button 
            onClick={onApply}
            className="flex-1 bg-green-600 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-1"
        >
            <Check size={14} /> Apply
        </button>
        <button 
            onClick={onDiscard}
            className="flex-1 border border-slate-200 text-slate-600 py-2 rounded text-xs font-medium flex items-center justify-center gap-1"
        >
            <X size={14} /> Discard
        </button>
      </div>
    </div>
  );
}
