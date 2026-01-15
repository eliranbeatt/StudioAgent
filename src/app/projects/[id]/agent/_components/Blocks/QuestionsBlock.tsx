"use client";

import { useEffect, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Id } from "../../../../../../../convex/_generated/dataModel";
import { ArrowRight } from "lucide-react";

export function QuestionsBlock({
  block,
  conversationId,
  projectId,
  disabled
}: {
  block: any;
  conversationId: Id<"agentConversations">;
  projectId: Id<"projects">;
  disabled?: boolean;
}) {
  const submit = useMutation(api.skills.runner.submitClarifications);
  const runSkill = useAction(api.skills.runner.runSkill);

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [targetSkillId, setTargetSkillId] = useState<string | null>(null);
  const continueLabel = block.continueAction?.labelHe ?? "Continue";
  const followupLabel = block.followupAction?.labelHe ?? "Ask more questions";

  useEffect(() => {
    if (!targetSkillId && typeof block?.targetSkillId === "string") {
      setTargetSkillId(block.targetSkillId);
    }
  }, [block?.targetSkillId, targetSkillId]);

  const handleToggleOption = (qid: string, option: string) => {
    setSelections((prev) => {
      const current = prev[qid] ?? [];
      if (current.includes(option)) {
        return { ...prev, [qid]: current.filter((x) => x !== option) };
      }
      return { ...prev, [qid]: [...current, option] }; // Assume multi for now or check type
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const answers: Record<string, string> = {};
    (block.questions ?? []).forEach((q: any) => {
      const parts = [];
      if (inputs[q.id]) parts.push(inputs[q.id]);
      if (selections[q.id]) parts.push(selections[q.id].join(", "));
      answers[q.id] = parts.join("; ");
    });

    try {
      const result = await submit({ conversationId, answersById: answers });
      setSubmitted(true);
      if (result && result.targetSkillId) {
        setTargetSkillId(result.targetSkillId);
      } else {
        const payloadTarget = block.continueAction?.payload?.targetSkillId ?? block.targetSkillId;
        if (payloadTarget && typeof payloadTarget === "string") {
          setTargetSkillId(payloadTarget);
        }
      }
    } catch (e) {
      console.error(e);
      alert("Failed to submit answers");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (!targetSkillId) return;
    try {
      await runSkill({
        projectId,
        conversationId,
        skillId: targetSkillId,
        params: {}
      });
    } catch (e) {
      console.error(e);
      alert("Failed to run skill: " + String(e));
    }
  };

  const handleFollowup = async () => {
    if (!targetSkillId) return;
    try {
      await runSkill({
        projectId,
        conversationId,
        skillId: targetSkillId,
        params: { forceClarifications: true, source: "clarifications_followup" }
      });
    } catch (e) {
      console.error(e);
      alert("Failed to run clarifications: " + String(e));
    }
  };

  if (submitted) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex flex-col items-center gap-3">
        <div className="text-xs text-green-700 font-medium">Answers submitted successfully.</div>
        {targetSkillId && (
          <>
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-full hover:bg-green-700 transition-colors"
            >
              {continueLabel} <ArrowRight size={14} />
            </button>
            <button
              onClick={handleFollowup}
              className="flex items-center gap-2 px-4 py-2 border border-green-600 text-green-700 text-xs font-bold rounded-full hover:bg-green-100 transition-colors"
            >
              {followupLabel}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm" dir="auto">
      <div className="text-xs font-semibold text-gray-900 mb-3">
        {block.titleHe ?? block.title_he ?? "Questions"}
      </div>
      <div className="space-y-4">
        {(block.questions ?? []).map((q: any, i: number) => (
          <div key={q.id || i}>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {q.textHe ?? q.text_he ?? q.text ?? q.question ?? q.questionHe ?? q.label ?? q.labelHe ?? "Question"}
            </label>
            {q.optionsHe || q.options_he ? (
              <div className="flex flex-wrap gap-2">
                {(q.optionsHe ?? q.options_he).map((opt: string) => (
                  <button
                    key={opt}
                    onClick={() => handleToggleOption(q.id || `q${i}`, opt)}
                    className={`px-3 py-1 rounded border text-xs transition-colors ${(selections[q.id || `q${i}`] || []).includes(opt)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
                      }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type={q.type === "date" ? "date" : "text"}
                className="w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none"
                value={inputs[q.id || `q${i}`] || ""}
                onChange={(e) => setInputs(p => ({ ...p, [q.id || `q${i}`]: e.target.value }))}
                placeholder="Type your answer..."
              />
            )}
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={disabled || isSubmitting}
        className="mt-4 w-full bg-blue-600 text-white py-2 rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? "Submitting..." : (block.submitLabelHe ?? block.submitLabel_he ?? "Submit Answers")}
      </button>
    </div >
  );
}
