"use client";

export function ReceiptBlock({ block }: { block: any }) {
  const extracted = block.extracted ?? {};
  const mappingSuggestions = block.mappingSuggestions ?? [];
  const questions = block.questionsHe ?? block.questions_he ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">Receipt</div>
      <div className="text-[11px] text-slate-700 space-y-1">
        {Object.entries(extracted).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4">
            <span className="text-slate-500">{key}</span>
            <span className="text-slate-800 break-all">{String(value)}</span>
          </div>
        ))}
      </div>
      {mappingSuggestions.length > 0 && (
        <div className="text-[11px] text-slate-800 border-t border-slate-100 pt-2 space-y-1">
          {mappingSuggestions.map((item: any, idx: number) => (
            <div key={idx}>
              - {item.suggestHe ?? item.suggest_he ?? ""} ({item.confidence ?? "medium"})
            </div>
          ))}
        </div>
      )}
      {questions.length > 0 && (
        <div className="text-[11px] text-slate-700 border-t border-slate-100 pt-2 space-y-1">
          {questions.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}
