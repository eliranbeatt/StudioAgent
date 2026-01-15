"use client";

export function ReviewBlock({ block }: { block: any }) {
  const title = block.titleHe ?? block.title_he ?? "Review";
  const sections = Array.isArray(block.sections) ? block.sections : [];

  let rawRisks = block.risksHe ?? block.risks_he;
  if (typeof rawRisks === 'string') rawRisks = [rawRisks];
  const risks = Array.isArray(rawRisks) ? rawRisks : [];

  return (
    <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">{title}</div>
      <div className="space-y-3">
        {sections.map((section: any, index: number) => {
          const hasHighlights = section.highlightsHe?.length > 0;
          const hasRisks = section.risksHe?.length > 0;
          const hasChecks = section.checksHe?.length > 0;

          if (!hasHighlights && !hasRisks && !hasChecks) return null;

          return (
            <div key={index} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
              <div className="text-xs font-semibold text-amber-900">
                {section.sectionHe ?? section.section_he ?? `Section ${index + 1}`}
              </div>
              {hasHighlights ? (
                <div className="text-[11px] text-amber-800 mt-2">
                  {section.highlightsHe.map((item: string, idx: number) => (
                    <div key={idx}>- {item}</div>
                  ))}
                </div>
              ) : null}
              {hasRisks ? (
                <div className="text-[11px] text-amber-800 mt-2">
                  {section.risksHe.map((item: string, idx: number) => (
                    <div key={idx}>- {item}</div>
                  ))}
                </div>
              ) : null}
              {hasChecks ? (
                <div className="text-[11px] text-amber-800 mt-2">
                  {section.checksHe.map((item: string, idx: number) => (
                    <div key={idx}>- {item}</div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
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
