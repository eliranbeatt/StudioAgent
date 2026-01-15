"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Play, Sparkles, ArrowLeft, Grid } from "lucide-react";
import { useEffect, useState } from "react";

export function SkillsDock({
  projectId,
  activeConversationId,
  selectedElementIds,
  onEnsureConversation,
  onSetThinking,
}: {
  projectId: Id<"projects">;
  activeConversationId: Id<"agentConversations"> | null;
  selectedElementIds?: string[];
  onEnsureConversation: () => Promise<Id<"agentConversations">>;
  onSetThinking: (thinking: boolean) => void;
}) {
  const recommendations = useQuery(api.skills.recommender.recommendSkills, { projectId });
  const allSkills = useQuery(api.skills.registry.listEnabledSkills);
  const ensureSkillsSeeded = useMutation(api.skills.registry.ensureSkillsSeeded);
  const runSkill = useAction(api.skills.runner.runSkill);
  
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    ensureSkillsSeeded();
  }, [ensureSkillsSeeded]);

  const handleRun = async (skillId: string) => {
    // 1. Ensure conversation
    let convId = activeConversationId;
    if (!convId) {
      convId = await onEnsureConversation();
    }

    // 2. Run Skill
    onSetThinking(true);
    try {
      await runSkill({
        projectId,
        conversationId: convId,
        skillId,
        params: {
            scope: {
                elementIds: selectedElementIds && selectedElementIds.length > 0 ? selectedElementIds : undefined
            }
        }, 
      });
      // Optionally switch back to recommendations or close expanding view
    } catch (e) {
      console.error("Failed to run skill", e);
      alert("Failed to run skill: " + String(e));
    } finally {
      onSetThinking(false);
    }
  };

  if (!recommendations) return <div className="p-4 text-xs text-gray-400">Loading skills...</div>;

  const displayedSkills = showAll ? (allSkills ?? []) : recommendations;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          {showAll ? (
              <>
                <button onClick={() => setShowAll(false)} className="hover:text-blue-600 transition-colors">
                    <ArrowLeft size={14} />
                </button>
                All Skills
              </>
          ) : (
              <>
                <Sparkles size={14} className="text-blue-500" />
                Recommended Now
              </>
          )}
        </h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {displayedSkills.map((skill: any) => (
          <div 
            key={skill.skillId}
            className="group relative rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
            onClick={() => handleRun(skill.skillId)}
          >
            <div className="flex justify-between items-start">
              <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                {skill.labelHe}
              </h4>
              <Play size={14} className="text-slate-300 group-hover:text-blue-500 mt-1" />
            </div>
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">
              {skill.reasonHe ?? skill.descriptionHe}
            </p>
            {skill.category === "audit" && (
                <div className="mt-2 inline-block px-2 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700 font-medium">
                    Audit
                </div>
            )}
             {/* Show category tag if showing all */}
             {showAll && skill.category && skill.category !== "audit" && (
                <div className="mt-2 inline-block px-2 py-0.5 rounded text-[10px] bg-slate-50 text-slate-500 border border-slate-100 font-medium">
                    {skill.category}
                </div>
            )}
          </div>
        ))}
        {displayedSkills.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-4">
                No skills found.
            </div>
        )}
      </div>

      {!showAll && (
          <div className="p-4 border-t border-slate-100 bg-slate-50">
            <button 
                onClick={() => setShowAll(true)}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center justify-center gap-2"
            >
              <Grid size={14} />
              Browse all skills...
            </button>
          </div>
      )}
    </div>
  );
}
