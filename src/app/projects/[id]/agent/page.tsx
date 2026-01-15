"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { SkillsDock } from "./_components/SkillsDock";
import { AgentChat } from "./_components/AgentChat";
import { Plus, Edit2, Check, X, Sparkles } from "lucide-react";

import { ElementsRail } from "./_components/ElementsRail";

export default function AgentPage() {
  const params = useParams();
  const rawId = params.id as string;
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId;
  
  const conversations = useQuery(api.skills.runner.listAgentConversations as any, 
    projectId ? { projectId } : "skip"
  );
  const createConversation = useMutation(api.skills.runner.createAgentConversation);
  const renameConversation = useMutation(api.skills.runner.renameConversation);
  const generateTitle = useAction(api.skills.runner.generateConversationTitle);

  const [activeConversationId, setActiveConversationId] = useState<Id<"agentConversations"> | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  // Renaming state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isGeneratingTitleFor, setIsGeneratingTitleFor] = useState<string | null>(null);

  useEffect(() => {
    if (conversations && conversations.length > 0 && !activeConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveConversationId(conversations[0]._id);
    }
  }, [conversations, activeConversationId]);

  const handleEnsureConversation = async () => {
    if (activeConversationId) return activeConversationId;
    if (!projectId) throw new Error("No project ID");
    const id = await createConversation({ projectId, title: "New Session" });
    setActiveConversationId(id);
    return id;
  };

  const handleNewSession = async () => {
      if (!projectId) return;
      const id = await createConversation({ projectId, title: "New Session" });
      setActiveConversationId(id);
  };

  const startEditing = (e: React.MouseEvent, c: any) => {
    e.stopPropagation();
    setEditingId(c._id);
    setEditTitle(c.title);
  };

  const saveTitle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingId && editTitle.trim()) {
      await renameConversation({ conversationId: editingId as Id<"agentConversations">, title: editTitle });
      setEditingId(null);
    }
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleGenerateTitle = async (e: React.MouseEvent, conversationId: Id<"agentConversations">) => {
      e.stopPropagation();
      if (!projectId) return;
      setIsGeneratingTitleFor(conversationId);
      try {
        await generateTitle({ conversationId, projectId });
      } catch (err) {
        console.error(err);
      } finally {
        setIsGeneratingTitleFor(null);
      }
  };

  if (!projectId) return <div className="p-8 text-slate-400">Loading project...</div>;

  return (
    <div className="flex h-full bg-slate-50">
      {/* Left Sidebar: Conversations */}
      <div className="w-64 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-sm text-slate-700">Conversations</h2>
          <button 
            onClick={handleNewSession}
            className="text-blue-600 hover:bg-blue-50 p-1 rounded"
            title="New Session"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {!conversations ? (
                <div className="text-xs text-slate-400 p-2">Loading...</div>
            ) : conversations.length === 0 ? (
                <div className="text-xs text-slate-400 p-2">No history yet</div>
            ) : (
                conversations.map((c: any) => (
                    <div
                        key={c._id}
                        className={`group flex items-center w-full rounded-md text-xs transition-colors ${
                            activeConversationId === c._id
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => setActiveConversationId(c._id)}
                    >
                        {editingId === c._id ? (
                           <div className="flex items-center flex-1 p-1 gap-1">
                             <input 
                               value={editTitle}
                               onChange={(e) => setEditTitle(e.target.value)}
                               className="flex-1 border border-blue-300 rounded px-1 py-0.5 outline-none bg-white"
                               autoFocus
                               onClick={(e) => e.stopPropagation()}
                             />
                             <button onClick={saveTitle} className="text-green-600 hover:bg-green-50 p-0.5 rounded"><Check size={14}/></button>
                             <button onClick={cancelEditing} className="text-red-500 hover:bg-red-50 p-0.5 rounded"><X size={14}/></button>
                           </div>
                        ) : (
                          <div className="flex-1 flex justify-between items-center p-2 cursor-pointer">
                             <div className="flex flex-col truncate">
                                <span className="truncate">{c.title}</span>
                                <span className="text-[10px] text-slate-400 font-normal">{new Date(c.updatedAt).toLocaleDateString()}</span>
                             </div>
                             
                             <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={(e) => handleGenerateTitle(e, c._id)}
                                  className={`p-1 rounded hover:bg-purple-100 text-purple-600 ${isGeneratingTitleFor === c._id ? 'animate-spin' : ''}`}
                                  title="Auto-rename"
                                >
                                   <Sparkles size={12} />
                                </button>
                                <button 
                                  onClick={(e) => startEditing(e, c)}
                                  className="p-1 rounded hover:bg-slate-200 text-slate-500"
                                  title="Rename"
                                >
                                   <Edit2 size={12} />
                                </button>
                             </div>
                          </div>
                        )}
                    </div>
                ))
            )}
        </div>
      </div>

      {/* Center: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
         <AgentChat 
            activeConversationId={activeConversationId} 
            projectId={projectId} 
            isThinking={isThinking}
            onSetThinking={setIsThinking}
        />
      </div>

      {/* Right: Skills Dock */}
      <div className="w-80 border-l border-slate-200 bg-white overflow-y-auto">
        <SkillsDock 
            projectId={projectId} 
            activeConversationId={activeConversationId}
            onEnsureConversation={handleEnsureConversation}
            selectedElementIds={selectedElementIds}
            onSetThinking={setIsThinking}
        />
      </div>

      {/* Far Right: Elements Rail */}
      <ElementsRail 
        projectId={projectId} 
        selectedIds={selectedElementIds} 
        onSelectionChange={setSelectedElementIds} 
      />
    </div>
  );
}