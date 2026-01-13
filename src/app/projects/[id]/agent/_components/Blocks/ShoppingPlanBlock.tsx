"use client";

export function ShoppingPlanBlock({ block }: { block: any }) {
  const title = block.titleHe ?? block.title_he ?? "Shopping Plan";
  const trips = block.trips ?? [];
  const totals = block.totals ?? {};
  const assumptions = block.assumptionsHe ?? block.assumptions_he ?? [];

  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">{title}</div>
      <div className="space-y-3">
        {trips.map((trip: any, index: number) => (
          <div key={index} className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="text-xs font-semibold text-emerald-900">
              {trip.vendorName ?? "Vendor"}
            </div>
            <div className="text-[11px] text-emerald-800 mt-1">
              {trip.addressHe ?? trip.address_he}
            </div>
            {trip.url && (
              <div className="text-[11px] text-emerald-700 mt-1 break-all">{trip.url}</div>
            )}
            <div className="mt-2 space-y-1 text-[11px] text-emerald-900">
              {(trip.items ?? []).map((item: any, idx: number) => (
                <div key={idx}>
                  - {item.itemHe ?? item.item_he ?? "Item"} x{item.qty ?? 1} {item.unitLabelHe ?? item.unitLabel_he ?? ""}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {Object.keys(totals).length > 0 && (
        <div className="text-[11px] text-emerald-900 border-t border-emerald-100 pt-2">
          {Object.entries(totals).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span>{key}</span>
              <span>{String(value)}</span>
            </div>
          ))}
        </div>
      )}
      {assumptions.length > 0 && (
        <div className="text-[11px] text-emerald-800 border-t border-emerald-100 pt-2 space-y-1">
          {assumptions.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}
