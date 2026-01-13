"use client";

export function PrintQaBlock({ block }: { block: any }) {
  const status = block.overallStatus ?? "unknown";
  const issues = block.issues ?? [];
  const questions = block.questionsHe ?? block.questions_he ?? [];
  const vendorNotes = block.vendorNotesHe ?? block.vendorNotes_he ?? [];

  return (
    <div className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">Print QA</div>
      <div className="text-[11px] text-rose-800">Status: {status}</div>
      {issues.length > 0 && (
        <div className="space-y-2">
          {issues.map((issue: any, idx: number) => (
            <div key={idx} className="rounded border border-rose-100 bg-rose-50/50 p-2 text-[11px] text-rose-900">
              <div className="font-semibold">{issue.category ?? "Issue"} ({issue.severity ?? "info"})</div>
              <div className="mt-1">{issue.messageHe ?? issue.message_he ?? ""}</div>
              {(issue.suggestedFixHe || issue.suggestedFix_he) && (
                <div className="mt-1 text-rose-700">
                  {issue.suggestedFixHe ?? issue.suggestedFix_he}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {questions.length > 0 && (
        <div className="text-[11px] text-rose-800 border-t border-rose-100 pt-2">
          {questions.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {vendorNotes.length > 0 && (
        <div className="text-[11px] text-rose-700 border-t border-rose-100 pt-2">
          {vendorNotes.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}
