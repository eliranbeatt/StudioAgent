"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Send, ListChecks, MessageSquare, Bug, Loader2 } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

export default function StudioAgentPage({ params }: { params: { id: string } }) {
  const projectId = params.id as Id<"projects">;
  
  const [input, setInput] = useState("");
  const [channel, setChannel] = useState<"structured" | "free">("structured");
  const [debugDraftId, setDebugDraftId] = useState<string | null>(null);

  // Data Fetching
  const conversationId = useQuery(api.agent.getOrCreateConversation, { projectId });
  const messages = useQuery(api.agent.listMessages, conversationId ? { conversationId } : "skip");
  const conversation = useQuery(api.agent.getConversation, conversationId ? { id: conversationId } : "skip");
  
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
      <div className="flex-1 flex flex-col border-r">
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-lg text-black">Studio Agent</h2>
            {conversation && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full uppercase tracking-wide">
                {conversation.stage} Stage
              </span>
            )}
          </div>
          
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setChannel("structured")}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-all ${
                channel === "structured" 
                  ? "bg-white text-black shadow-sm font-medium" 
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <ListChecks size={16} /> Structured
            </button>
            <button
              onClick={() => setChannel("free")}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-all ${
                channel === "free" 
                  ? "bg-white text-black shadow-sm font-medium" 
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <MessageSquare size={16} /> Free Chat
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {!messages ? (
            <div className="flex justify-center items-center h-full">
               <Loader2 className="animate-spin text-gray-300" size={32} />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex ${msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : msg.role === "system" 
                            ? "bg-gray-200 text-gray-600 text-sm font-mono"
                            : "bg-white border text-gray-800 shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.skillUsed && (
                       <div className="mt-1 text-[10px] text-gray-400 font-mono">
                          skill: {msg.skillUsed}
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
        <div className="p-4 border-t bg-white shrink-0">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={channel === "structured" ? "Answer the question..." : "Ask me anything..."}
              className="w-full pl-4 pr-12 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-black"
            />
            <button
              onClick={handleSend}
              className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Right Context Panel */}
      <div className="w-80 bg-white flex flex-col border-l shrink-0">
        <div className="h-16 border-b flex items-center px-4 font-semibold text-gray-700 bg-gray-50">
            Context & Status
        </div>
        <div className="p-4 space-y-4">
            <DraftStatusPanel projectId={projectId} />
            
            <div className="h-px bg-gray-100 my-4" />

            <div className="p-4 border rounded-lg bg-gray-50">
                <div className="flex items-center gap-2 mb-2 text-gray-700 font-bold text-sm">
                   <Bug size={14} /> Simulation
                </div>
                <div className="space-y-2">
                    <button 
                        onClick={handleSeed}
                        disabled={!!debugDraftId}
                        className={`w-full text-left px-3 py-2 text-xs rounded ${debugDraftId ? "bg-gray-200 text-gray-500" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
                    >
                        {debugDraftId ? "Seed Complete" : "Seed Test Element"}
                    </button>
                    <button 
                        onClick={handleTriggerReconciliation}
                        disabled={!debugDraftId}
                        className={`w-full text-left px-3 py-2 text-xs rounded ${!debugDraftId ? "bg-gray-100 text-gray-400" : "bg-red-50 text-red-700 hover:bg-red-100"}`}
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
            <div className="p-3 border rounded-lg bg-white">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Elements</span>
                    <span className="text-xs font-bold text-blue-600">{stats?.elementCount ?? "--"}</span>
                </div>
                <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                    <div className={`bg-blue-500 h-full ${stats?.elementCount ? "w-full" : "w-0"}`} />
                </div>
            </div>

            <div className="p-3 border rounded-lg bg-white">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Graveyard</span>
                    <span className="text-xs font-bold text-red-600">{stats?.graveyardCount ?? "--"}</span>
                </div>
                <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                    <div className={`bg-red-500 h-full ${stats?.graveyardCount ? "w-full" : "w-0"}`} />
                </div>
            </div>
        </div>
    )
}