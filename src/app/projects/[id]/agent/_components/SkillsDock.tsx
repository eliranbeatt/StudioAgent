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
  const tagDefinitions = useQuery(api.skills.registry.listSkillTagDefinitions)
  const ensureSkillsSeeded = useMutation(api.skills.registry.ensureSkillsSeeded);
  const runSkill = useAction(api.skills.runner.runSkill);
  
  const [showAll, setShowAll] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const hiddenSkillIds = new Set([
    'RECEIPT_PARSE_AND_MAP',
    'BUYING_ASSISTANT_WEB',
    'DAILY_EXECUTION_PLANNER',
    'COST_VARIANCE_ANALYZER',
    'QUOTE_WRITER_FULL',
    'PROJECT_BRIEF_BUILDER',
    'CHANGESET_REVIEWER',
    'CLARIFICATIONS_GATE',
    'CONSULTANT_CHAT',
  ])

  useEffect(() => {
    ensureSkillsSeeded();
  }, [ensureSkillsSeeded]);

  useEffect(() => {
    if (!showAll && selectedTagIds.length > 0) {
      setSelectedTagIds([])
    }
  }, [showAll, selectedTagIds.length])

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

  const displayedSkills = showAll ? (allSkills ?? []) : recommendations
  const visibleSkills = displayedSkills.filter((skill: any) => !hiddenSkillIds.has(skill.skillId))
  const filteredSkills = selectedTagIds.length === 0
    ? visibleSkills
    : visibleSkills.filter((skill: any) => selectedTagIds.every((tagId) => (skill.tagIds ?? []).includes(tagId)))

  const orderedGroups = (tagDefinitions?.groups ?? []).slice().sort((a: any, b: any) => a.order - b.order)
  const orderedTags = (tagDefinitions?.tags ?? []).slice().sort((a: any, b: any) => a.order - b.order)
  const categoryTagLabelById = new Map(
    orderedTags
      .filter((tag: any) => tag.groupId === 'category')
      .map((tag: any) => [tag.id, tag.labelHe])
  )
  const tagsByGroup = orderedGroups.map((group: any) => ({
    ...group,
    tags: orderedTags.filter((tag: any) => tag.groupId === group.id),
  }))

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => (
      prev.includes(tagId) ? [] : [tagId]
    ))
  }

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
      
      {showAll && tagDefinitions && (
        <div className="px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex flex-wrap gap-3">
            {tagsByGroup.map((group: any) => (
              <div key={group.id} className="min-w-[120px]">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                  {group.labelHe}
                </div>
                <div className="flex flex-wrap gap-1">
                  {group.tags.map((tag: any) => {
                    const isActive = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={
                          isActive
                            ? 'px-2 py-0.5 rounded-full text-[10px] bg-slate-900 text-white'
                            : 'px-2 py-0.5 rounded-full text-[10px] border border-slate-200 text-slate-500 hover:text-slate-800'
                        }
                      >
                        {tag.labelHe}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="mt-2 text-[10px] text-slate-400 hover:text-slate-700"
            >
              נקה סינון
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredSkills.map((skill: any) => (
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
            {showAll && Array.isArray(skill.tagLabelsHe) && skill.tagLabelsHe.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {skill.tagLabelsHe.map((tag: string) => (
                  <span
                    key={`${skill.skillId}-${tag}`}
                    className="px-2 py-0.5 rounded-full text-[10px] bg-slate-50 text-slate-600 border border-slate-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {showAll && skill.category && categoryTagLabelById.size > 0 && (
              <div className="mt-2 inline-block px-2 py-0.5 rounded text-[10px] bg-slate-50 text-slate-500 border border-slate-100 font-medium">
                {categoryTagLabelById.get(`category:${skill.category}`) ?? skill.category}
              </div>
            )}
          </div>
        ))}
        {filteredSkills.length === 0 && (
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
