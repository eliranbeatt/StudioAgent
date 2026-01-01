"use client";

import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState, useEffect, useRef, use, useMemo } from "react";
import {
  Send,
  ListChecks,
  MessageSquare,
  Bug,
  Loader2,
  Layers,
} from "lucide-react";
import { Id } from "../../../../../convex/_generated/dataModel";

export default function StudioAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;

  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>("gpt-5.2");
  const [channel, setChannel] = useState<"structured" | "free">("structured");
  const [debugDraftId, setDebugDraftId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string>("");
  const [selectedDraftType, setSelectedDraftType] = useState<"element" | "projectCost">("element");
  const [baseRevisionNumber, setBaseRevisionNumber] = useState<number>(1);
  const [patchOpsText, setPatchOpsText] = useState<string>("[]");
  const [applyStatus, setApplyStatus] = useState<string>("");
  const [applyResult, setApplyResult] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string>("");
  const [stageSelection, setStageSelection] = useState<"ideation" | "planning" | "solutioning">("ideation");
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [answersStatus, setAnswersStatus] = useState<string>("");
  const [taskTargetElementId, setTaskTargetElementId] = useState<string>("");
  const [brainDrafts, setBrainDrafts] = useState<Record<string, string>>({});
  const [brainStatus, setBrainStatus] = useState<string>("");
  const [brainTargetElementId, setBrainTargetElementId] = useState<string>("");
  const [brainManualText, setBrainManualText] = useState<string>("");

  // State for conversation ID since we need to fetch/create it via mutation
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);

  // Mutations
  const getOrCreateConversation = useMutation(api.agent.getOrCreateConversation);
  const setConversationStage = useMutation(api.agent.setConversationStage);
  const saveStructuredAnswers = useMutation(api.agent.saveStructuredAnswers);
  const createElementFromStructured = useMutation(api.agent.createElementFromStructured);
  const generateTaskPatchOps = useMutation(api.agent.generateTaskPatchOps);
  const ensureProjectBrain = useMutation(api.brain.ensureProjectBrain);
  const updateBrainSection = useMutation(api.brain.updateSectionContent);
  const appendBrainEvent = useMutation(api.brain.appendFromEvent);
  const generateDraftFromBrain = useMutation(api.brain.generateElementDraftFromText);
  const approveElementDraft = useMutation(api.elements.approveElementDraft);

  useEffect(() => {
    if (projectId) {
      getOrCreateConversation({ projectId })
        .then((id) => setConversationId(id))
        .catch((error) => console.error("Failed to get/create conversation:", error));
    }
  }, [projectId]);

  // Data Fetching
  const messages = useQuery(api.agent.listMessages, conversationId ? { conversationId } : "skip");
  const conversation = useQuery(api.agent.getConversation, conversationId ? { id: conversationId } : "skip");
  const drafts = useQuery(api.drafts.listOpenDrafts, projectId ? { projectId } : "skip");
  const overview = useQuery(api.projects.getOverview, projectId ? { id: projectId } : "skip");
  const financials = useQuery(api.financials.getFinancialSummary, projectId ? { projectId } : "skip");
  const structuredAnswers = useQuery(
    api.agent.getStructuredAnswers,
    projectId ? { projectId, stage: stageSelection } : "skip"
  );
  const fileContext = useQuery(api.files.getProjectContext, projectId ? { projectId } : "skip");
  const brain = useQuery(api.brain.get, projectId ? { projectId } : "skip");

  // Mutations
  const sendMessage = useMutation(api.agent.sendMessage);
  const applyChangeSet = useMutation(api.drafts.applyChangeSet);
  const seedSimulation = useMutation(api.debug.seedSimulation);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!conversation?.stage) return;
    setStageSelection(conversation.stage);
  }, [conversation?.stage]);

  useEffect(() => {
    if (!structuredAnswers?.answers) return;
    setAnswerDrafts(structuredAnswers.answers as Record<string, string>);
  }, [structuredAnswers?.answers]);

  useEffect(() => {
    if (!projectId) return;
    if (brain === null) {
      ensureProjectBrain({ projectId }).catch(() => null);
    }
  }, [projectId, brain]);

  useEffect(() => {
    if (!brain?.sections) return;
    const nextDrafts: Record<string, string> = {};
    for (const section of brain.sections) {
      if (section?.id) {
        nextDrafts[section.id] = String(section.content ?? "");
      }
    }
    setBrainDrafts(nextDrafts);
  }, [brain?.version]);

  useEffect(() => {
    if (!overview?.elements || overview.elements.length === 0) return;
    if (taskTargetElementId) return;
    setTaskTargetElementId(overview.elements[0].id);
  }, [overview?.elements, taskTargetElementId]);

  useEffect(() => {
    if (!overview?.elements || overview.elements.length === 0) return;
    if (brainTargetElementId) return;
    setBrainTargetElementId(overview.elements[0].id);
  }, [overview?.elements, brainTargetElementId]);

  const handleSend = async () => {
    if (!input.trim() || !conversationId) return;
    const currentInput = input;
    setInput("");
    const result = await sendMessage({
      conversationId,
      content: currentInput,
      channel,
      model,
    });
    if (projectId) {
      const eventId = result?.userMessageId ?? `chat_${Date.now()}`;
      await safeAppendBrain({
        projectId,
        eventId,
        type: "chat",
        payload: { text: currentInput },
        selectedElementIds: brainTargetElementId ? [brainTargetElementId as any] : [],
      });
    }
  };

  useEffect(() => {
    if (!drafts || drafts.length === 0) return;
    if (selectedDraftId) return;
    const firstDraft = drafts[0];
    setSelectedDraftId(firstDraft.draftId);
    setSelectedDraftType(firstDraft.draftType);
    setBaseRevisionNumber(firstDraft.revisionNumber);
  }, [drafts, selectedDraftId]);

  const handleSelectDraft = (value: string) => {
    if (!drafts) return;
    const draft = drafts.find((d) => d.draftId === value);
    if (!draft) return;
    setSelectedDraftId(draft.draftId);
    setSelectedDraftType(draft.draftType);
    setBaseRevisionNumber(draft.revisionNumber);
  };

  const parsePatchOps = () => {
    try {
      const parsed = JSON.parse(patchOpsText);
      if (!Array.isArray(parsed)) {
        return { ok: false, error: "Patch ops must be a JSON array." };
      }
      return { ok: true, value: parsed };
    } catch (err) {
      return { ok: false, error: "Invalid JSON for patch ops." };
    }
  };

  const safeAppendBrain = async (args: {
    projectId: Id<"projects">;
    eventId: string;
    type: string;
    payload: any;
    selectedElementIds?: Id<"elements">[];
  }) => {
    try {
      await appendBrainEvent(args);
      setBrainStatus("Brain updated.");
    } catch {
      setBrainStatus("Brain update failed.");
    }
  };

  const handleSaveBrainSection = async (section: any) => {
    if (!brain) return;
    const content = brainDrafts[section.id] ?? "";
    if (content === section.content) return;
    try {
      await updateBrainSection({
        projectId,
        sectionId: section.id,
        newContent: content,
        expectedVersion: brain.version,
      });
      setBrainStatus("Brain section saved.");
    } catch (err: any) {
      setBrainStatus(err?.message ?? "Failed to save brain section.");
    }
  };

  const handleApplyChangeSet = async () => {
    setApplyStatus("");
    const parsed = parsePatchOps();
    if (!parsed.ok) {
      setApplyStatus(parsed.error ?? "Invalid patch ops.");
      return;
    }
    if (!selectedDraftId) {
      setApplyStatus("Select a draft before applying changes.");
      return;
    }

    try {
      const result = await applyChangeSet({
        draftType: selectedDraftType,
        draftId: selectedDraftId,
        projectId,
        baseRevisionNumber,
        createdFrom: { tab: "Studio", stage: "manualPatch" },
        patchOps: parsed.value,
      });

      setApplyResult(result);
      const created = result?.graveyard?.createdItemIds?.length ?? 0;
      setApplyStatus(
        created > 0
          ? `Applied. ${created} graveyard item(s) created.`
          : "Applied. No graveyard items."
      );
      setBaseRevisionNumber(result.newRevisionNumber);
    } catch (err: any) {
      setApplyStatus(err?.message ?? "Failed to apply ChangeSet.");
      setApplyResult(null);
    }
  };

  const handleApproveSelectedDraft = async () => {
    if (!selectedDraftId || selectedDraftType !== "element") {
      setApplyStatus("Select an element draft to approve.");
      return;
    }
    const draft = drafts?.find((item) => item.draftId === selectedDraftId);
    if (!draft?.elementId) {
      setApplyStatus("Element draft not found.");
      return;
    }
    try {
      await approveElementDraft({ elementId: draft.elementId as any });
      setApplyStatus("Element draft approved.");
    } catch (err: any) {
      setApplyStatus(err?.message ?? "Failed to approve element draft.");
    }
  };

  const handleApplyFromMessage = async (msg: any) => {
    if (!msg?.metadata?.patchOps || !msg?.metadata?.draftId) {
      setApplyStatus("ChangeSet metadata missing.");
      return;
    }
    try {
      const result = await applyChangeSet({
        draftType: msg.metadata.draftType ?? "element",
        draftId: msg.metadata.draftId,
        projectId,
        baseRevisionNumber: msg.metadata.baseRevisionNumber ?? 1,
        createdFrom: { tab: "Studio", stage: "agentProposal" },
        patchOps: msg.metadata.patchOps,
      });
      setApplyResult(result);
      const created = result?.graveyard?.createdItemIds?.length ?? 0;
      setApplyStatus(
        created > 0
          ? `Applied. ${created} graveyard item(s) created.`
          : "Applied. No graveyard items."
      );
      setBaseRevisionNumber(result.newRevisionNumber);
    } catch (err: any) {
      setApplyStatus(err?.message ?? "Failed to apply ChangeSet.");
    }
  };

  const structuredQuestions = getQuestions(stageSelection);
  const brainSections = useMemo(() => {
    if (!brain?.sections) return [];
    const scopeRank: Record<string, number> = {
      project: 0,
      unmapped: 1,
      element: 2,
    };
    return [...brain.sections].sort((a: any, b: any) => {
      const rankA = scopeRank[String(a?.scope ?? "element")] ?? 2;
      const rankB = scopeRank[String(b?.scope ?? "element")] ?? 2;
      if (rankA !== rankB) return rankA - rankB;
      return String(a?.title ?? "").localeCompare(String(b?.title ?? ""));
    });
  }, [brain?.sections]);

  const handleSaveStructuredAnswers = async () => {
    setAnswersStatus("");
    const payload: Record<string, string> = {};
    for (const q of structuredQuestions) {
      const value = answerDrafts[q.id]?.trim();
      if (!value && q.required) {
        setAnswersStatus(`Missing required field: ${q.label}`);
        return;
      }
      if (value) {
        payload[q.id] = value;
      }
    }

    await saveStructuredAnswers({
      projectId,
      stage: stageSelection,
      answers: payload,
    });

    if (stageSelection === "ideation" && payload.elementTitle) {
      await createElementFromStructured({
        projectId,
        title: payload.elementTitle,
        type: payload.elementType,
      });
    }

    const summary = formatStructuredAnswers(stageSelection, payload, fileContext ?? []);
    if (conversationId) {
      const result = await sendMessage({
        conversationId,
        content: summary,
        channel: "structured",
      });
      if (projectId) {
        const eventId = result?.userMessageId ?? `answers_${Date.now()}`;
        await safeAppendBrain({
          projectId,
          eventId,
          type: "answers",
          payload: { text: summary },
          selectedElementIds: brainTargetElementId ? [brainTargetElementId as any] : [],
        });
      }
    }

    setAnswersStatus("Saved structured answers.");
  };

  const handleGenerateTasks = async () => {
    try {
      const result = await generateTaskPatchOps({
        projectId,
        stage: stageSelection,
        elementId: taskTargetElementId ? (taskTargetElementId as any) : undefined,
      });
      if (conversationId) {
        await sendMessage({
          conversationId,
          content: JSON.stringify(result.patchOps),
          channel: "free",
        });
      }
      setAnswersStatus(result.summary ?? "Generated task ChangeSet.");
    } catch (err: any) {
      setAnswersStatus(err?.message ?? "Failed to generate tasks.");
    }
  };

  const handleManualBrainAppend = async () => {
    if (!brainManualText.trim()) return;
    const eventId = `manual_${Date.now()}`;
    await safeAppendBrain({
      projectId,
      eventId,
      type: "manual",
      payload: { text: brainManualText.trim() },
      selectedElementIds: brainTargetElementId ? [brainTargetElementId as any] : [],
    });
    setBrainManualText("");
  };

  const handleGenerateDraftFromSection = async (section: any) => {
    if (!section?.elementId) return;
    const content = brainDrafts[section.id] ?? section.content ?? "";
    try {
      const result = await generateDraftFromBrain({
        projectId,
        elementId: section.elementId,
        sectionContent: String(content),
      });
      if (!result?.ok) {
        setBrainStatus(result?.error ?? "Failed to generate draft.");
        return;
      }
      setPatchOpsText(JSON.stringify(result.patchOps ?? [], null, 2));
      setSelectedDraftType("element");
      if (result.draftId) {
        setSelectedDraftId(result.draftId);
      }
      if (result.baseRevisionNumber !== undefined) {
        setBaseRevisionNumber(result.baseRevisionNumber);
      }
      setBrainStatus(result.summary ?? "Draft generated from Current Knowledge.");
    } catch (err: any) {
      setBrainStatus(err?.message ?? "Failed to generate draft.");
    }
  };

  const handleSeed = async () => {
    const result = await seedSimulation({ projectId });
    setDebugDraftId(result.draftId);
  };

  const handleTriggerReconciliation = async () => {
    if (!debugDraftId) return;

    try {
      await applyChangeSet({
        draftType: "element",
        draftId: debugDraftId,
        projectId,
        baseRevisionNumber: 1,
        createdFrom: { tab: "Studio", stage: "Debug" },
        patchOps: [
          { op: "remove", path: "/tasks/byId/task_1" }
        ]
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-full bg-white">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col border-r border-gray-100 bg-gray-50/50">
        {/* Header */}
        <header className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-lg tracking-tight text-gray-900">AgenticEshet</h2>
            {conversation && (
              <span className="px-2.5 py-1 bg-gray-100 text-gray-600 border border-gray-200 text-[11px] font-bold rounded-full uppercase tracking-wider">
                {conversation.stage}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 bg-white font-medium"
            >
              <option value="gpt-5.2-thinking">GPT-5.2 Thinking</option>
              <option value="gpt-5.2">GPT-5.2</option>
              <option value="gpt-5-mini">GPT-5 Mini</option>
              <option value="gpt-5-nano">GPT-5 Nano</option>
            </select>
            <div className="h-4 w-px bg-gray-200 mx-1" />
            <select
              value={stageSelection}
              onChange={(e) => {
                const next = e.target.value as "ideation" | "planning" | "solutioning";
                setStageSelection(next);
                if (conversationId) {
                  setConversationStage({ id: conversationId, stage: next });
                }
              }}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="ideation">Ideation</option>
              <option value="planning">Planning</option>
              <option value="solutioning">Solutioning</option>
            </select>
            <div className="flex bg-gray-100/80 p-1 rounded-lg">
              <button
                onClick={() => setChannel("structured")}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${channel === "structured"
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                <ListChecks size={14} /> Structured
              </button>
              <button
                onClick={() => setChannel("free")}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${channel === "free"
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                <MessageSquare size={14} /> Free Chat
              </button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
          {channel === "structured" && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Structured Intake</div>
                  <div className="text-lg font-semibold text-gray-900">Stage: {stageSelection}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={taskTargetElementId}
                    onChange={(e) => setTaskTargetElementId(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-700 bg-white"
                  >
                    {overview?.elements?.map((element: any) => (
                      <option key={element.id} value={element.id}>
                        {element.title}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleGenerateTasks}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Generate Tasks
                  </button>
                  <button
                    onClick={handleSaveStructuredAnswers}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-black text-white hover:bg-gray-800"
                  >
                    Save Answers
                  </button>
                </div>
              </div>
              {fileContext && fileContext.length > 0 ? (
                <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                  <div className="text-[10px] font-semibold uppercase text-gray-400 mb-2">File Context</div>
                  <div className="space-y-2">
                    {fileContext.map((file) => (
                      <div key={file.fileName}>
                        <div className="font-semibold text-gray-700">{file.fileName}</div>
                        <div className="text-[10px] text-gray-500">{file.summary || "No summary."}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-4">
                {structuredQuestions.map((question) => (
                  <label key={question.id} className="text-xs text-gray-600">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-700">{question.label}</span>
                      {question.required ? (
                        <span className="text-[10px] text-red-500 uppercase">Required</span>
                      ) : null}
                    </div>
                    {question.multiline ? (
                      <textarea
                        rows={3}
                        value={answerDrafts[question.id] ?? ""}
                        onChange={(e) =>
                          setAnswerDrafts((prev) => ({ ...prev, [question.id]: e.target.value }))
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700"
                      />
                    ) : (
                      <input
                        value={answerDrafts[question.id] ?? ""}
                        onChange={(e) =>
                          setAnswerDrafts((prev) => ({ ...prev, [question.id]: e.target.value }))
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700"
                      />
                    )}
                  </label>
                ))}
              </div>
              {answersStatus ? (
                <div className="mt-3 text-[10px] text-gray-500">{answersStatus}</div>
              ) : null}
            </div>
          )}
          {!messages ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="animate-spin text-gray-300" size={24} />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-6 py-4 shadow-sm ${msg.role === "user"
                      ? "bg-black text-white rounded-br-none"
                      : msg.role === "system"
                        ? "bg-transparent border-0 shadow-none text-gray-400 text-xs font-mono text-center w-full max-w-full"
                        : "bg-white border border-gray-100 text-gray-800 rounded-bl-none"
                      }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    {msg.type === "changeSet" && msg.metadata?.patchOps ? (
                      <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                        <div className="flex items-center justify-between mb-2">
                          <span className="uppercase text-[10px] font-semibold text-gray-400">ChangeSet Proposal</span>
                          <button
                            onClick={() => handleApplyFromMessage(msg)}
                            className="text-[10px] font-semibold text-white bg-black px-2 py-1 rounded-md hover:bg-gray-800"
                          >
                            Apply
                          </button>
                        </div>
                        <div className="text-[10px] text-gray-500">
                          Draft: {msg.metadata.draftId} - Base rev {msg.metadata.baseRevisionNumber}
                        </div>
                        {msg.metadata?.fileContext?.length ? (
                          <div className="mt-2 text-[10px] text-gray-500">
                            Context: {msg.metadata.fileContext.map((file: any) => file.fileName).join(", ")}
                          </div>
                        ) : null}
                        <pre className="mt-2 text-[10px] text-gray-500 overflow-auto max-h-40">
                          {JSON.stringify(msg.metadata.patchOps, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                    {msg.type === "questions" && msg.metadata?.questions ? (
                      <div className="mt-3 space-y-2 text-xs text-gray-600">
                        <div className="font-semibold text-gray-500 uppercase tracking-wider">Questions</div>
                        <ul className="space-y-1">
                          {msg.metadata.questions.map((q: any) => (
                            <li key={q.id} className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold">
                                {q.required ? "*" : " "}
                              </span>
                              <span>{q.label}</span>
                            </li>
                          ))}
                        </ul>
                        {msg.metadata?.hint ? (
                          <div className="text-[10px] text-gray-400">{msg.metadata.hint}</div>
                        ) : null}
                        {msg.metadata?.fileContext?.length ? (
                          <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] text-gray-500">
                            <div className="text-[10px] font-semibold uppercase text-gray-400 mb-1">File Context</div>
                            {msg.metadata.fileContext.map((file: any) => (
                              <div key={file.fileName}>
                                <span className="font-semibold text-gray-600">{file.fileName}:</span> {file.summary || "No summary."}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {msg.metadata?.createdElementId ? (
                      <div className="mt-3 text-[10px] text-gray-500 uppercase tracking-wider">
                        Element created: {msg.metadata.createdElementId}
                      </div>
                    ) : null}
                    {msg.skillUsed && msg.role !== 'system' && (
                      <div className={`mt-2 text-[10px] font-medium tracking-wider uppercase opacity-60 ${msg.role === 'user' ? 'text-gray-300' : 'text-indigo-600'}`}>
                        {msg.skillUsed}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-6 border-t border-gray-100 bg-white shrink-0">
          <div className="relative flex items-center shadow-sm rounded-xl overflow-hidden border border-gray-200 focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={channel === "structured" ? "Input specific requirements..." : "Ask AgenticEshet..."}
              className="w-full pl-5 pr-14 py-4 bg-white text-black placeholder-gray-400 focus:outline-none"
            />
            <button
              onClick={handleSend}
              className="absolute right-2 p-2 bg-black text-white rounded-lg hover:bg-gray-800 transition"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Right Context Panel */}
      <div className="w-80 bg-white flex flex-col border-l border-gray-100 shrink-0">
        <div className="h-16 border-b border-gray-100 flex items-center px-6 font-bold text-sm tracking-tight text-gray-900 bg-white">
          Context & Status
        </div>
        <div className="p-6 space-y-6">
          <DraftStatusPanel projectId={projectId} />

          <div className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-gray-900 font-bold text-xs uppercase tracking-wider">
                Current Knowledge
              </div>
            </div>
            {!brain ? (
              <div className="text-xs text-gray-500">Loading knowledge...</div>
            ) : (
              <div className="space-y-4">
                {brainSections.map((section: any) => (
                  <div key={section.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-gray-700 uppercase">
                        {section.title}
                      </div>
                      <div className="flex items-center gap-2">
                        {section.scope === "element" ? (
                          <button
                            onClick={() => handleGenerateDraftFromSection(section)}
                            className="text-[10px] font-semibold uppercase text-gray-600 hover:text-gray-900"
                          >
                            Generate Draft
                          </button>
                        ) : null}
                        {section.scope === "element" ? (
                          <span className={`text-[10px] uppercase ${section.dirtySinceLastSync ? "text-amber-600" : "text-emerald-600"}`}>
                            {section.dirtySinceLastSync ? "Modified" : "Synced"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <textarea
                      value={brainDrafts[section.id] ?? section.content ?? ""}
                      onChange={(e) =>
                        setBrainDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))
                      }
                      rows={4}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white"
                    />
                    <button
                      onClick={() => handleSaveBrainSection(section)}
                      className="px-3 py-1.5 text-[10px] font-semibold rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Save
                    </button>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="text-[10px] font-semibold uppercase text-gray-400">
                    Add note
                  </div>
                  <select
                    value={brainTargetElementId}
                    onChange={(e) => setBrainTargetElementId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-700 bg-white"
                  >
                    <option value="">Unmapped</option>
                    {overview?.elements?.map((element: any) => (
                      <option key={element.id} value={element.id}>
                        {element.title}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={brainManualText}
                    onChange={(e) => setBrainManualText(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white"
                    placeholder="Add a quick note..."
                  />
                  <button
                    onClick={handleManualBrainAppend}
                    className="w-full text-left px-3 py-2 text-xs font-medium rounded-lg transition-colors bg-black text-white hover:bg-gray-800"
                  >
                    Append to knowledge
                  </button>
                </div>
                {brainStatus ? (
                  <div className="text-[10px] text-gray-500">{brainStatus}</div>
                ) : null}
              </div>
            )}
          </div>

          <div className="h-px bg-gray-100" />

          <div className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-bold text-xs uppercase tracking-wider">
              Project Snapshot
            </div>
            {!overview || !financials ? (
              <div className="text-xs text-gray-500">Loading snapshot...</div>
            ) : (
              <div className="space-y-3 text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Elements</span>
                  <span className="font-semibold text-gray-900">
                    {overview.counts.elementCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Graveyard</span>
                  <span className="font-semibold text-gray-900">
                    {overview.counts.graveyardCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Baseline</span>
                  <span className="font-semibold text-gray-900">
                    {Number(financials.baseline.grandTotal).toLocaleString()} NIS
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Effective Budget</span>
                  <span className="font-semibold text-gray-900">
                    {Number(financials.effectiveBudget.sellPrice).toLocaleString()} NIS
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Unapproved Variance</span>
                  <span className="font-semibold text-amber-600">
                    {Number(financials.variance.unapproved.sellPrice).toLocaleString()} NIS
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-bold text-xs uppercase tracking-wider">
              Elements
            </div>
            {!overview ? (
              <div className="text-xs text-gray-500">Loading elements...</div>
            ) : overview.elements.length === 0 ? (
              <div className="text-xs text-gray-500">No elements yet.</div>
            ) : (
              <div className="space-y-2 text-xs">
                {overview.elements.slice(0, 4).map((element: any) => (
                  <div key={element.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers size={12} className="text-gray-400" />
                      <span className="text-gray-700">{element.title}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">{element.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-gray-100" />

          <div className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-bold text-xs uppercase tracking-wider">
              Pending Changes
            </div>
            <div className="space-y-3 text-xs text-gray-600">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
                  Draft
                </label>
                <select
                  value={selectedDraftId}
                  onChange={(e) => handleSelectDraft(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-700 bg-white"
                >
                  <option value="">Select a draft...</option>
                  {drafts?.map((draft) => (
                    <option key={draft.draftId} value={draft.draftId}>
                      {draft.title} (rev {draft.revisionNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
                  Patch Ops (JSON)
                </label>
                <textarea
                  value={patchOpsText}
                  onChange={(e) => setPatchOpsText(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs font-mono text-gray-700 bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const parsed = parsePatchOps();
                  setPreviewError(parsed.ok ? "" : parsed.error ?? "Invalid patch ops.");
                }}
                className="w-full text-left px-3 py-2.5 text-xs font-medium rounded-lg transition-colors border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Validate Patch Ops
              </button>
              {previewError ? (
                <div className="text-[10px] text-red-500">{previewError}</div>
              ) : null}
              <button
                onClick={handleApplyChangeSet}
                className="w-full text-left px-3 py-2.5 text-xs font-medium rounded-lg transition-colors bg-black text-white hover:bg-gray-800"
              >
                Apply ChangeSet
              </button>
              <button
                onClick={handleApproveSelectedDraft}
                className="w-full text-left px-3 py-2.5 text-xs font-medium rounded-lg transition-colors border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Approve Draft
              </button>
              {applyStatus ? (
                <div className="text-[10px] text-gray-500">{applyStatus}</div>
              ) : null}
            </div>
          </div>

          <div className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-gray-900 font-bold text-xs uppercase tracking-wider">
              Diff & Impact
            </div>
            {!applyResult ? (
              <div className="space-y-3 text-xs text-gray-500">
                <div>Apply a ChangeSet to see reconciliation results.</div>
                <div className="text-[10px] text-gray-400">
                  The preview shows accepted patch ops and any money or inventory impacts.
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs text-gray-600">
                <div>
                  <div className="text-[10px] font-semibold uppercase text-gray-400 mb-2">
                    Accepted Patch Ops
                  </div>
                  {applyResult.acceptedPatchOps?.length ? (
                    <div className="space-y-2">
                      {applyResult.acceptedPatchOps.map((op: any, idx: number) => (
                        <div key={`${op.op}-${op.path}-${idx}`} className="border border-gray-100 rounded-lg p-2">
                          <div className="font-mono text-[11px] text-gray-800">
                            {op.op} {op.path}
                          </div>
                          {"value" in op ? (
                            <pre className="mt-1 text-[10px] text-gray-500 overflow-auto">
                              {JSON.stringify(op.value, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-400">No patch ops applied.</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase text-gray-400 mb-2">
                    Impact Preview
                  </div>
                  {applyResult.reconciliation?.reviewRequired?.length ? (
                    <div className="space-y-2">
                      {applyResult.reconciliation.reviewRequired.map((item: any, idx: number) => (
                        <div key={`${item.kind}-${idx}`} className="border border-gray-100 rounded-lg p-2">
                          <div className="text-[11px] text-gray-700">{item.message}</div>
                          {item.impactPreview?.moneyImpacts?.length ? (
                            <div className="mt-2 space-y-1">
                              {item.impactPreview.moneyImpacts.map((impact: any, impactIdx: number) => (
                                <div key={`${impact.type}-${impactIdx}`} className="text-[10px] text-gray-500 flex justify-between">
                                  <span>{impact.type}</span>
                                  <span>{impact.amount} {impact.currency ?? "NIS"}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {item.impactPreview?.inventoryImpacts?.length ? (
                            <div className="mt-2 space-y-1">
                              {item.impactPreview.inventoryImpacts.map((impact: any, impactIdx: number) => (
                                <div key={`${impact.type}-${impactIdx}`} className="text-[10px] text-gray-500 flex justify-between">
                                  <span>{impact.type}</span>
                                  <span>{impact.qty ?? "--"}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-400">No impacts reported.</div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="font-semibold text-gray-900">
                    {applyResult.reconciliation?.status ?? "unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Auto fixes</span>
                  <span>{applyResult.reconciliation?.safeFixes?.autoApplyOps?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Review required</span>
                  <span>{applyResult.reconciliation?.reviewRequired?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Blockers</span>
                  <span>{applyResult.reconciliation?.blockers?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Warnings</span>
                  <span>{applyResult.reconciliation?.warnings?.length ?? 0}</span>
                </div>
                {applyResult.graveyard?.createdItemIds?.length ? (
                  <a
                    href={`/projects/${projectId}/graveyard`}
                    className="block text-[10px] text-red-600 hover:underline"
                  >
                    Open Graveyard to resolve decisions
                  </a>
                ) : null}
                {applyResult.reconciliation?.warnings?.length ? (
                  <div className="text-[10px] text-amber-600">
                    {applyResult.reconciliation.warnings[0]?.message ?? "Warnings available."}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="h-px bg-gray-100" />

          <div className="p-4 border border-gray-100 rounded-xl bg-gray-50/50">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-bold text-xs uppercase tracking-wider">
              <Bug size={12} /> Simulation
            </div>
            <div className="space-y-2">
              <button
                onClick={handleSeed}
                disabled={!!debugDraftId}
                className={`w-full text-left px-3 py-2.5 text-xs font-medium rounded-lg transition-colors ${debugDraftId ? "bg-gray-100 text-gray-400" : "bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:shadow-sm"}`}
              >
                {debugDraftId ? "Seed Complete" : "Seed Test Element"}
              </button>
              <button
                onClick={handleTriggerReconciliation}
                disabled={!debugDraftId}
                className={`w-full text-left px-3 py-2.5 text-xs font-medium rounded-lg transition-colors ${!debugDraftId ? "bg-gray-100 text-gray-400" : "bg-white border border-red-100 text-red-600 hover:bg-red-50"}`}
              >
                Trigger Orphan Warning
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type QuestionConfig = {
  id: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
};

function getQuestions(stage: "ideation" | "planning" | "solutioning"): QuestionConfig[] {
  if (stage === "planning") {
    return [
      { id: "dimensions", label: "Dimensions or size details", required: true },
      { id: "materials", label: "Materials preference", required: true },
      { id: "transport", label: "Transport constraints", multiline: true },
      { id: "install", label: "Install constraints / access hours", multiline: true },
      { id: "crew", label: "Crew size or roles", multiline: true },
    ];
  }

  if (stage === "solutioning") {
    return [
      { id: "joinery", label: "Joinery / build method", required: true, multiline: true },
      { id: "finish", label: "Finish / coating / print details", multiline: true },
      { id: "tolerances", label: "Tolerances / fit requirements", multiline: true },
      { id: "rigging", label: "Rigging / safety requirements", multiline: true },
      { id: "sourcing", label: "Sourcing plan / lead times", multiline: true },
    ];
  }

  return [
    { id: "elementTitle", label: "Element title", required: true },
    { id: "elementType", label: "Element type (build|print|install|subcontract|mixed)", required: true },
    { id: "goal", label: "Project goal / wow factor", required: true, multiline: true },
    { id: "brand", label: "Brand / style references", multiline: true },
    { id: "location", label: "Location / venue", required: true },
    { id: "audience", label: "Audience / use case", multiline: true },
    { id: "deadline", label: "Deadline / event date", required: true },
  ];
}

function formatStructuredAnswers(
  stage: "ideation" | "planning" | "solutioning",
  answers: Record<string, string>,
  files: Array<{ fileName: string; summary?: string }>
) {
  const lines = [`Stage: ${stage}`];
  for (const [key, value] of Object.entries(answers)) {
    lines.push(`${key}: ${value}`);
  }
  if (files.length > 0) {
    lines.push(
      `files: ${files
        .map((file) => `${file.fileName}${file.summary ? ` (${file.summary})` : ""}`)
        .join(" | ")}`
    );
  }
  return lines.join(" | ");
}

function DraftStatusPanel({ projectId }: { projectId: Id<"projects"> }) {
  const stats = useQuery(api.projects.getStats, { id: projectId });

  return (
    <div className="space-y-3">
      <div className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Elements</span>
          <span className="text-sm font-bold text-gray-900">{stats?.elementCount ?? "--"}</span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
          <div className={`bg-black h-full rounded-full transition-all duration-500 ${stats?.elementCount ? "w-full" : "w-0"}`} />
        </div>
      </div>

      <div className="p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Graveyard</span>
          <span className="text-sm font-bold text-gray-900">{stats?.graveyardCount ?? "--"}</span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
          <div className={`bg-gray-400 h-full rounded-full transition-all duration-500 ${stats?.graveyardCount ? "w-full" : "w-0"}`} />
        </div>
      </div>
    </div>
  )
}
