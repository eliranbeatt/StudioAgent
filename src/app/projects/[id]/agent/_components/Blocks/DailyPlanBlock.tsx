"use client";

export function DailyPlanBlock({ block }: { block: any }) {
  const date = block.date ?? "";
  const priorities = block.prioritiesHe ?? block.priorities_he ?? [];
  const schedule = block.scheduleHe ?? block.schedule_he ?? [];
  const blockers = block.blockersHe ?? block.blockers_he ?? [];
  const shopping = block.shoppingHe ?? block.shopping_he ?? [];

  return (
    <div className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">Daily Plan</div>
      {date && <div className="text-[11px] text-cyan-800">{date}</div>}
      {priorities.length > 0 && (
        <div className="text-[11px] text-cyan-900 border-t border-cyan-100 pt-2">
          {priorities.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {schedule.length > 0 && (
        <div className="text-[11px] text-cyan-800 border-t border-cyan-100 pt-2">
          {schedule.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {blockers.length > 0 && (
        <div className="text-[11px] text-cyan-800 border-t border-cyan-100 pt-2">
          {blockers.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {shopping.length > 0 && (
        <div className="text-[11px] text-cyan-800 border-t border-cyan-100 pt-2">
          {shopping.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}
