"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { ChevronRight, ChevronLeft, Box, Check } from "lucide-react";
import { useState } from "react";

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
  const [isOpen, setIsOpen] = useState(false);

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

  if (!isOpen) {
    return (
      <div 
        className="w-10 bg-slate-50 border-l border-slate-200 flex flex-col items-center py-4 cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setIsOpen(true)}
      >
        <ChevronLeft size={16} className="text-slate-400" />
        <div className="mt-4 flex flex-col gap-2">
            <Box size={16} className="text-slate-400" />
            {selectedIds.length > 0 && (
                <div className="text-[10px] font-bold bg-blue-100 text-blue-700 w-5 h-5 flex items-center justify-center rounded-full">
                    {selectedIds.length}
                </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-l border-slate-200 flex flex-col h-full shadow-xl">
      <div className="h-10 border-b flex items-center justify-between px-3 bg-slate-50">
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
            <Box size={14} /> Elements
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="p-2 border-b flex justify-between items-center bg-slate-50/50">
          <button 
            onClick={selectAll}
            className="text-[10px] font-medium text-blue-600 hover:underline"
          >
              {selectedIds.length === elements.length ? "Deselect All" : "Select All"}
          </button>
          <span className="text-[10px] text-slate-400">{selectedIds.length} selected</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {elements.length === 0 ? (
              <div className="text-xs text-slate-400 p-4 text-center">No elements found</div>
          ) : (
              elements.map((el: any) => (
                  <div 
                    key={el.id}
                    onClick={() => toggleSelection(el.id)}
                    className={`flex items-start gap-2 p-2 rounded cursor-pointer text-xs transition-colors ${
                        selectedIds.includes(el.id)
                        ? "bg-blue-50 border border-blue-100"
                        : "hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                      <div className={`mt-0.5 w-3 h-3 border rounded flex items-center justify-center ${
                          selectedIds.includes(el.id)
                          ? "bg-blue-600 border-blue-600"
                          : "border-slate-300 bg-white"
                      }`}>
                          {selectedIds.includes(el.id) && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                          <div className={`font-medium truncate ${selectedIds.includes(el.id) ? "text-blue-900" : "text-slate-700"}`}>
                              {el.title}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                              <span className="uppercase">{el.type}</span>
                              <span>•</span>
                              <span className={el.status === "approved" ? "text-green-600" : ""}>{el.status}</span>
                          </div>
                      </div>
                  </div>
              ))
          )}
      </div>
    </div>
  );
}
