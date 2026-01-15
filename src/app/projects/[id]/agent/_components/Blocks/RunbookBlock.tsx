"use client";

import { useMutation } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { useState } from "react";
import { Check, Save } from "lucide-react";

export function RunbookBlock({ block, projectId }: { block: any, projectId: Id<"projects"> }) {
  const createRunbook = useMutation(api.runbooks.createFromRunbookBlock);
  const setActiveRunbook = useMutation(api.runbooks.setActiveRunbook);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Helper to ensure we always have an array
  const ensureArray = (val: any): any[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val.trim().length > 0) return [val];
    return [];
  };

  const title = block.titleHe ?? block.title_he ?? "Runbook";
  const phases = Array.isArray(block.phases) ? block.phases : [];
  const bringList = ensureArray(block.bringListHe ?? block.bringList_he);
  const safety = ensureArray(block.safetyHe ?? block.safety_he);
  const checkpoints = ensureArray(block.checkpointsHe ?? block.checkpoints_he);
  const quickFixKit = ensureArray(block.quickFixKitHe ?? block.quickFixKit_he);
  const assumptions = ensureArray(block.assumptionsHe ?? block.assumptions_he);

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

      {/* Action Bar */}
      <div className="border-t border-indigo-100 pt-3 mt-2 flex justify-end">
        <button
          onClick={async () => {
            setIsSaving(true);
            try {
              const { runbookId } = await createRunbook({
                projectId,
                scope: "project",
                runbookBlock: block,
                source: "ai"
              });
              await setActiveRunbook({ projectId, runbookId });
              setIsSaved(true);
            } catch (e) {
              console.error("Failed to save runbook", e);
              alert("Failed to save runbook: " + (e as any).message);
            } finally {
              setIsSaving(false);
            }
          }}
          disabled={isSaved || isSaving}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${isSaved
            ? "bg-green-100 text-green-700 cursor-default"
            : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
        >
          {isSaved ? (
            <>
              <Check size={14} />
              Saved to Runbooks
            </>
          ) : (
            <>
              <Save size={14} />
              {isSaving ? "Saving..." : "Save as Runbook"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
