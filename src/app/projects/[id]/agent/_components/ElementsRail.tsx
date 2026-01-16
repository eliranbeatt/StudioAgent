"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Box, Check } from "lucide-react";

export function ElementsRail({
  projectId,
  selectedIds,
  onSelectionChange
}: {
  projectId: Id<"projects">;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const data = useQuery(api.elements.listByProject, { projectId });

  if (!data) return <div className="w-10 bg-slate-50 border-l border-slate-200" />;

  const elements = data.elements ?? [];

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(x => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === elements.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(elements.map((e: any) => e.id));
    }
  };

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full shadow-xl">
      <div className="h-10 border-b flex items-center justify-between px-3 bg-slate-50">
        <div className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
            <Box size={16} /> Elements
        </div>
      </div>

      <div className="p-2 border-b flex justify-between items-center bg-slate-50/50">
          <button 
            onClick={selectAll}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
              {selectedIds.length === elements.length ? "Deselect All" : "Select All"}
          </button>
          <span className="text-xs text-slate-400">{selectedIds.length} selected</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {elements.length === 0 ? (
              <div className="text-sm text-slate-400 p-4 text-center">No elements found</div>
          ) : (
              elements.map((el: any) => (
                  <div 
                    key={el.id}
                    onClick={() => toggleSelection(el.id)}
                    className={`group relative rounded-xl border p-3 shadow-sm transition-all cursor-pointer ${
                        selectedIds.includes(el.id)
                        ? "border-blue-500 bg-blue-50 shadow-md"
                        : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-md"
                    }`}
                  >
                      <div className="flex justify-between items-start">
                          <h4 className={`text-sm font-semibold ${
                              selectedIds.includes(el.id) ? "text-blue-800" : "text-slate-900 group-hover:text-blue-700"
                          }`}>
                              {el.title}
                          </h4>
                          {selectedIds.includes(el.id) && <Check size={14} className="text-blue-600" />}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span className="uppercase font-medium">{el.type}</span>
                          <span>•</span>
                          <span className={el.status === "approved" ? "text-green-600" : ""}>{el.status}</span>
                      </div>
                  </div>
              ))
          )}
      </div>
    </div>
  );
}
