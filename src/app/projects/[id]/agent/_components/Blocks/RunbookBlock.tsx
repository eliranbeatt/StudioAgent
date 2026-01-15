"use client";

export function RunbookBlock({ block }: { block: any }) {
  const title = block.titleHe ?? block.title_he ?? "Runbook";
  const phases = block.phases ?? [];
  const bringList = block.bringListHe ?? block.bringList_he ?? [];
  const safety = block.safetyHe ?? block.safety_he ?? [];
  const checkpoints = block.checkpointsHe ?? block.checkpoints_he ?? [];
  const quickFixKit = block.quickFixKitHe ?? block.quickFixKit_he ?? [];
  const assumptions = block.assumptionsHe ?? block.assumptions_he ?? [];

  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm space-y-3" dir="auto">
      <div className="text-xs font-semibold text-gray-900">{title}</div>
      <div className="space-y-3">
        {phases.map((phase: any, index: number) => (
          <div key={index} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <div className="text-xs font-semibold text-indigo-900">
              {phase.nameHe ?? phase.name_he ?? `Phase ${index + 1}`}
            </div>
            {(phase.stepsHe ?? phase.steps_he)?.length && (
              <div className="text-[11px] text-indigo-800 mt-2">
                {(phase.stepsHe ?? phase.steps_he).map((item: string, idx: number) => (
                  <div key={idx}>- {item}</div>
                ))}
              </div>
            )}
            {(phase.rolesHe ?? phase.roles_he)?.length && (
              <div className="text-[11px] text-indigo-700 mt-2">
                {(phase.rolesHe ?? phase.roles_he).map((item: string, idx: number) => (
                  <div key={idx}>- {item}</div>
                ))}
              </div>
            )}
            {phase.estimatedMinutes !== undefined && (
              <div className="text-[11px] text-indigo-600 mt-2">Estimated: {phase.estimatedMinutes} min</div>
            )}
          </div>
        ))}
      </div>
      {bringList.length > 0 && (
        <div className="text-[11px] text-indigo-800 border-t border-indigo-100 pt-2">
          {bringList.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {safety.length > 0 && (
        <div className="text-[11px] text-indigo-800 border-t border-indigo-100 pt-2">
          {safety.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {checkpoints.length > 0 && (
        <div className="text-[11px] text-indigo-800 border-t border-indigo-100 pt-2">
          {checkpoints.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {quickFixKit.length > 0 && (
        <div className="text-[11px] text-indigo-800 border-t border-indigo-100 pt-2">
          {quickFixKit.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
      {assumptions.length > 0 && (
        <div className="text-[11px] text-indigo-800 border-t border-indigo-100 pt-2">
          {assumptions.map((item: string, idx: number) => (
            <div key={idx}>- {item}</div>
          ))}
        </div>
      )}
    </div>
  );
}
