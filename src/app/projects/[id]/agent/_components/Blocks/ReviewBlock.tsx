"use client";

export function ReviewBlock({ block }: { block: any }) {
  const title = block.titleHe ?? block.title_he ?? "Review";
  const sections = block.sections ?? [];
  const risks = block.risksHe ?? block.risks_he ?? [];

  return (
    <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">{title}</div>
      <div className="space-y-3">
        {sections.map((section: any, index: number) => (
          <div key={index} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
            <div className="text-xs font-semibold text-amber-900">
              {section.sectionHe ?? section.section_he ?? `Section ${index + 1}`}
            </div>
            {section.highlightsHe?.length ? (
              <div className="text-[11px] text-amber-800 mt-2">
                {section.highlightsHe.map((item: string, idx: number) => (
                  <div key={idx}>- {item}</div>
                ))}
              </div>
            ) : null}
            {section.risksHe?.length ? (
              <div className="text-[11px] text-amber-800 mt-2">
                {section.risksHe.map((item: string, idx: number) => (
                  <div key={idx}>- {item}</div>
                ))}
              </div>
            ) : null}
            {section.checksHe?.length ? (
              <div className="text-[11px] text-amber-800 mt-2">
                {section.checksHe.map((item: string, idx: number) => (
                  <div key={idx}>- {item}</div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {risks.length > 0 && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-[11px] text-amber-900">
          {risks.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}
