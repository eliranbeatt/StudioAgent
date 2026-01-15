"use client";

import { useState } from "react";
import { Send } from "lucide-react";

export function SuggestionBlock({ block, onSubmit }: { block: any, onSubmit?: (text: string, payload?: any) => void }) {
  const [note, setNote] = useState("");

  const handleSelect = (item: any) => {
    const text = item.payload?.action
      ? item.payload?.actionLabel ?? item.labelHe ?? item.label ?? `Run skill: ${item.payload.action}`
      : item.labelHe || item.label || item.label_he;

    onSubmit?.(text, item.payload);
  };

  const handleSendNote = () => {
    if (note.trim()) {
      onSubmit?.(note);
      setNote("");
    }
  };

  const title = block.title_he ?? block.titleHe ?? "Suggestions";
  const suggestions = block.suggestions ?? block.items ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">
        {title}
      </div>
      <div className="space-y-2">
        {suggestions.map((item: any, i: number) => (
          <button
            key={item.id || i}
            onClick={() => handleSelect(item)}
            className="w-full text-left p-3 border border-slate-100 rounded bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition-colors group"
          >
            <div className="font-semibold text-xs text-slate-800 group-hover:text-blue-700">
              {item.label_he ?? item.labelHe ?? item.label}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {item.why_he ?? item.whyHe ?? item.why}
            </div>
          </button>
        ))}
      </div>

      {(block.freeTextPrompt_he || block.freeTextPromptHe || true) && (
        <div className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
          <input
            className="flex-1 border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={block.freeTextPrompt_he ?? block.freeTextPromptHe ?? "Reply or ask..."}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendNote()}
          />
          <button
            onClick={handleSendNote}
            className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}