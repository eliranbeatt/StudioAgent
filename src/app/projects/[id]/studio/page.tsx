"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState, useEffect, useRef, use } from "react";
import { Send, ListChecks, MessageSquare, Bug, Loader2 } from "lucide-react";
import { Id } from "../../../../../convex/_generated/dataModel";

export default function StudioAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;

  const [input, setInput] = useState("");
  const [channel, setChannel] = useState<"structured" | "free">("structured");
  const [debugDraftId, setDebugDraftId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string>("");
  const [selectedDraftType, setSelectedDraftType] = useState<"element" | "projectCost">("element");
  const [baseRevisionNumber, setBaseRevisionNumber] = useState<number>(1);
  const [patchOpsText, setPatchOpsText] = useState<string>("[]");
  const [applyStatus, setApplyStatus] = useState<string>("");
  const [applyResult, setApplyResult] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string>("");

  // State for conversation ID since we need to fetch/create it via mutation
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);

  // Mutations
  const getOrCreateConversation = useMutation(api.agent.getOrCreateConversation);

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

  const handleSend = async () => {
    if (!input.trim() || !conversationId) return;
    const currentInput = input;
    setInput("");
    await sendMessage({
      conversationId,
      content: currentInput,
      channel
    });
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
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
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
