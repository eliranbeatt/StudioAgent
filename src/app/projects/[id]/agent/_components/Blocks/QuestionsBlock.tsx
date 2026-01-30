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
  const [freeText, setFreeText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [targetSkillId, setTargetSkillId] = useState<string | null>(null);

  // Robust property access with fallbacks
  const continueLabel = block.continueAction?.labelHe ?? block.continueAction?.label_he ?? "Continue";
  const followupLabel = block.followupAction?.labelHe ?? block.followupAction?.label_he ?? "Ask more questions";
  const shouldAutoRun = block.autoRun === true || block.auto_run === true;
  const freeTextTitle = block.freeTextTitleHe ?? block.freeTextTitle_he ?? block.free_text_title_he ?? "טקסט חופשי";
  const freeTextPrompt = block.freeTextPromptHe ?? block.freeTextPrompt_he ?? block.free_text_prompt_he ?? "כתיבה חופשית...";

  // Force show free text if ANY relevant property is present, or explicit flag
  const hasFreeTextProps = !!(block.freeTextPromptHe || block.freeTextPrompt_he || block.free_text_prompt_he);
  const showFreeText = hasFreeTextProps || block.showFreeText === true || block.show_free_text === true;

  // Title fallback
  const title = block.titleHe ?? block.title_he ?? "Questions";
  const submitLabel = block.submitLabelHe ?? block.submitLabel_he ?? "Submit Answers";

  useEffect(() => {
    if (!targetSkillId && typeof block?.targetSkillId === "string") {
      setTargetSkillId(block.targetSkillId);
    }
  }, [block?.targetSkillId, targetSkillId]);

  const handleToggleOption = (qid: string, option: string) => {
    if (submitted) return; // Prevent changes if submitted
    setSelections((prev) => {
      const current = prev[qid] ?? [];
      if (current.includes(option)) {
        return { ...prev, [qid]: current.filter((x) => x !== option) };
      }
      return { ...prev, [qid]: [...current, option] };
    });
  };

    const handleSubmit = async (intent: 'continue' | 'clarify_more') => {

      if (submitted) return;

      setIsSubmitting(true);

      const answers: Record<string, string> = {};

      (block.questions ?? []).forEach((q: any) => {

        const parts = [];

        const qId = q.id;

        if (inputs[qId]) parts.push(inputs[qId]);

        if (selections[qId]) parts.push(selections[qId].join(", "));

        answers[qId] = parts.join("; ");

      });

  

      try {

        const result = await submit({ conversationId, answersById: answers });

  

        // Always mark as submitted to lock the UI

        setSubmitted(true);

  

        let nextSkillId = null;

        if (result && result.targetSkillId) {

          setTargetSkillId(result.targetSkillId);

          nextSkillId = result.targetSkillId;

        } else {

          const payloadTarget = block.continueAction?.payload?.targetSkillId ?? block.targetSkillId;

          if (payloadTarget && typeof payloadTarget === "string") {

            setTargetSkillId(payloadTarget);

            nextSkillId = payloadTarget;

          }

        }

  

        const finalNextSkillId =

          nextSkillId ??

          block.continueAction?.payload?.targetSkillId ??

          block.targetSkillId;

  

        if (shouldAutoRun && finalNextSkillId) {

          // Trigger the loop

          const params: any = { freeText: freeText.trim() || undefined };

          if (intent === 'clarify_more') {

            params.forceClarifications = true;

            params.source = "clarifications_followup";

          }

          

          await runSkill({

            projectId,

            conversationId,

            skillId: finalNextSkillId,

            params

          });

          // We do NOT reset state here; this block is now "done" and part of history.

          // A new block will appear at the bottom.

        }

      } catch (e) {

        console.error(e);

        alert("Failed to submit answers");

        // If failed, allow trying again?

        setSubmitted(false);

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

          params: { freeText: freeText.trim() || undefined }

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

  

    // Render "Submitted" state as a Disabled Form

    const isLocked = disabled || isSubmitting || submitted;

  

    return (

      <div className={`rounded-xl border p-4 shadow-sm transition-colors ${submitted ? 'bg-gray-50 border-gray-200' : 'bg-white border-blue-200'}`} dir="auto">

        <div className="text-xs font-semibold text-gray-900 mb-3">

          {title}

        </div>

  

        <div className="space-y-4 mb-6">

          {(block.questions ?? []).map((q: any, i: number) => {

            const qId = q.id || `q${i}`;

            const qText = q.textHe ?? q.text_he ?? q.text ?? q.question ?? q.questionHe ?? q.label ?? q.labelHe ?? "Question";

            const qOptions = q.optionsHe ?? q.options_he;

  

            return (

              <div key={qId}>

                <label className="block text-xs font-medium text-gray-700 mb-1">

                  {qText}

                </label>

                {/* Always render options if available */}

                {qOptions && (

                  <div className="flex flex-wrap gap-2 mb-2">

                    {qOptions.map((opt: string) => (

                      <button

                        key={opt}

                        onClick={() => handleToggleOption(qId, opt)}

                        disabled={isLocked}

                        className={`px-3 py-1 rounded border text-xs transition-colors ${(selections[qId] || []).includes(opt)

                            ? "bg-blue-600 text-white border-blue-600"

                            : "bg-white text-gray-700 border-gray-200 hover:border-blue-300 disabled:opacity-50"

                          }`}

                      >

                        {opt}

                      </button>

                    ))}

                  </div>

                )}

                {/* Always render text input */}

                <input

                  type={q.type === "date" ? "date" : "text"}

                  disabled={isLocked}

                  className="w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none disabled:bg-gray-100 disabled:text-gray-500"

                  value={inputs[qId] || ""}

                  onChange={(e) => setInputs(p => ({ ...p, [qId]: e.target.value }))}

                  placeholder="Type your answer..."

                />

              </div>

            )

          })}

        </div>

  

        {showFreeText && (

          <div className="mb-4 pt-4 border-t border-gray-100">

            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">

              {freeTextTitle}

            </div>

            <textarea

              className="w-full border border-gray-300 rounded p-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none min-h-[96px] disabled:bg-gray-100 disabled:text-gray-500"

              value={freeText}

              onChange={(e) => setFreeText(e.target.value)}

              placeholder={freeTextPrompt}

              disabled={isLocked}

            />

          </div>

        )}

  

        {submitted ? (

          <div className="mt-4 flex flex-col items-center gap-3">

            <div className="w-full bg-green-100 text-green-700 py-2 rounded text-xs font-bold text-center">

              Answers Submitted

            </div>

            {/* Only show manual controls if NOT auto-run (legacy/fallback) */}

            {targetSkillId && !shouldAutoRun && (

              <div className="flex gap-2 justify-center w-full">

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

              </div>

            )}

          </div>

        ) : (

          <div className="flex gap-2 w-full">

            <button

              onClick={() => handleSubmit('clarify_more')}

              disabled={isLocked}

              className="flex-1 bg-white text-blue-600 border border-blue-600 py-2 rounded text-xs font-bold hover:bg-blue-50 disabled:opacity-50 flex justify-center items-center transition-colors"

            >

               {followupLabel}

            </button>

            <button

              onClick={() => handleSubmit('continue')}

              disabled={isLocked}

              className="flex-1 bg-blue-600 text-white py-2 rounded text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center transition-colors"

            >

              {isSubmitting ? (

                <span className="flex items-center gap-2">

                  <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />

                  Processing...

                </span>

              ) : continueLabel}

            </button>

          </div>

        )}

      </div>

    );

  }
