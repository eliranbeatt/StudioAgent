"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Cpu, 
  DollarSign, 
  FileJson, 
  MessageSquare, 
  ArrowRight,
  Filter,
  RefreshCw
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";

// --- Helpers ---

const formatCost = (model: string, inputTokens: number, outputTokens: number) => {
  let inputRate = 0;
  let outputRate = 0;

  if (model.includes("gpt-4o-mini")) {
    inputRate = 0.15;
    outputRate = 0.60;
  } else if (model.includes("gpt-4o")) {
    inputRate = 2.50;
    outputRate = 10.00;
  } else if (model.includes("o1-mini")) {
    inputRate = 3.00;
    outputRate = 12.00;
  } else if (model.includes("o1-preview") || model.includes("o1")) {
    inputRate = 15.00;
    outputRate = 60.00;
  }

  const cost = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
  return `$${cost.toFixed(4)}`;
};

const formatTime = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const timeAgo = (timestamp: number) => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
};

// --- Components ---

export default function TracingPage() {
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const projects = useQuery(api.projects.list);
  
  const traces = useQuery(api.tracing.list, { 
    limit: 50,
    projectId: filterProject !== "all" ? (filterProject as Id<"projects">) : undefined,
    status: filterStatus !== "all" ? (filterStatus as "success" | "failed") : undefined
  });
  
  const [selectedTraceId, setSelectedTraceId] = useState<Id<"llmTraces"> | null>(null);

  const selectedTrace = useQuery(api.tracing.get, selectedTraceId ? { id: selectedTraceId } : "skip");

  // Auto-select first if none selected and traces loaded
  if (!selectedTraceId && traces && traces.length > 0) {
    setSelectedTraceId(traces[0]._id);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] border rounded-lg bg-white overflow-hidden shadow-sm">
      {/* Sidebar List */}
      <div className="w-1/3 border-r overflow-y-auto bg-gray-50 flex flex-col">
        {/* Filter Bar */}
        <div className="p-3 bg-white border-b space-y-2">
          <div className="flex gap-2">
            <select 
              className="flex-1 text-xs border rounded px-2 py-1 bg-gray-50"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="all">All Projects</option>
              {projects?.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
            <select 
              className="w-24 text-xs border rounded px-2 py-1 bg-gray-50"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div className="p-3 border-b bg-gray-100 sticky top-0 z-10 flex justify-between items-center">
          <h2 className="font-semibold text-sm flex items-center gap-2 text-gray-700">
            <Clock size={16} /> Recent Traces
          </h2>
          <span className="text-xs text-gray-500">{traces?.length || 0} items</span>
        </div>
        
        <div className="flex-1 overflow-y-auto">
        {!traces ? (
          <div className="p-4 text-center text-gray-500">Loading traces...</div>
        ) : traces.length === 0 ? (
          <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
             <Filter size={24} />
             <span>No traces found</span>
          </div>
        ) : (
          <div className="divide-y">
            {traces.map((trace) => (
              <div
                key={trace._id}
                onClick={() => setSelectedTraceId(trace._id)}
                className={`p-4 cursor-pointer hover:bg-white transition-colors ${
                  selectedTraceId === trace._id ? "bg-white border-l-4 border-l-blue-500 shadow-sm" : "border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                    trace.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {trace.status}
                  </span>
                  <span className="text-xs text-gray-400">{timeAgo(trace._creationTime)}</span>
                </div>
                <div className="font-medium text-sm text-gray-900 truncate mb-1" title={trace.runId}>
                  {trace.runId ? trace.runId : <span className="italic text-gray-400">No Run ID</span>}
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span className="flex items-center gap-1 bg-gray-100 px-1 rounded">
                    <Cpu size={10} /> {trace.model}
                  </span>
                  <span>{formatTime(trace.latencyMs)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Main Detail Area */}
      <div className="flex-1 overflow-y-auto bg-white p-6">
        {!selectedTrace ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            {selectedTraceId ? "Loading details..." : "Select a trace to view details"}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Stats */}
            <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg border">
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Cost</div>
                <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
                  <DollarSign size={16} />
                  {formatCost(selectedTrace.model, selectedTrace.inputTokens, selectedTrace.outputTokens)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Latency</div>
                <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
                  <Clock size={16} />
                  {formatTime(selectedTrace.latencyMs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Tokens</div>
                <div className="text-lg font-bold text-gray-900">
                  {selectedTrace.inputTokens + selectedTrace.outputTokens} 
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    ({selectedTrace.inputTokens} in / {selectedTrace.outputTokens} out)
                  </span>
                </div>
              </div>
              <div>
                 <div className="text-xs text-gray-500 uppercase font-semibold">Status</div>
                 <div className={`text-lg font-bold flex items-center gap-1 ${
                   selectedTrace.status === "success" ? "text-green-600" : "text-red-600"
                 }`}>
                   {selectedTrace.status === "success" ? <CheckCircle size={18} /> : <XCircle size={18} />}
                   {selectedTrace.status}
                 </div>
              </div>
            </div>

            {/* Error Display */}
            {selectedTrace.error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 font-mono text-sm whitespace-pre-wrap">
                <strong>Error:</strong> {selectedTrace.error}
              </div>
            )}

            {/* Tabs / Sections */}
            <div className="space-y-6">
              <Section title="Request" icon={<MessageSquare size={18} />}>
                <div className="bg-gray-900 text-gray-100 rounded-md p-4 text-sm font-mono overflow-x-auto">
                   {/* Attempt to parse messages structure if standard OpenAI format */}
                   {selectedTrace.request?.messages ? (
                     <div className="space-y-4">
                       {selectedTrace.request.messages.map((msg: any, i: number) => (
                         <div key={i} className="border-b border-gray-800 pb-4 last:border-0 last:pb-0">
                           <div className="text-xs font-bold uppercase text-gray-500 mb-1">{msg.role}</div>
                           <div className="whitespace-pre-wrap">{
                             typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)
                           }</div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <pre>{JSON.stringify(selectedTrace.request, null, 2)}</pre>
                   )}
                </div>
              </Section>

              <Section title="Response" icon={<ArrowRight size={18} />}>
                <div className="bg-gray-50 border rounded-md p-4 text-sm font-mono overflow-x-auto text-gray-800">
                  {/* Attempt to parse response structure */}
                  {selectedTrace.response?.choices ? (
                    <div className="space-y-4">
                      {selectedTrace.response.choices.map((choice: any, i: number) => (
                         <div key={i}>
                           <div className="whitespace-pre-wrap">
                             {choice.message?.content || (
                               <span className="text-gray-400 italic">No content (potentially tool call)</span>
                             )}
                           </div>
                           {choice.message?.tool_calls && (
                             <div className="mt-2 pl-4 border-l-2 border-blue-300">
                               <div className="text-xs font-bold text-blue-600 mb-1">Tool Calls:</div>
                               {choice.message.tool_calls.map((tc: any, j: number) => (
                                 <div key={j} className="mb-2 last:mb-0">
                                   <div className="font-semibold">{tc.function.name}</div>
                                   <pre className="text-xs bg-gray-100 p-1 rounded">{tc.function.arguments}</pre>
                                 </div>
                               ))}
                             </div>
                           )}
                         </div>
                      ))}
                    </div>
                  ) : (
                    <pre>{JSON.stringify(selectedTrace.response, null, 2)}</pre>
                  )}
                </div>
              </Section>
              
              <Section title="Metadata & Raw" icon={<FileJson size={18} />}>
                 <pre className="bg-gray-100 p-4 rounded-md text-xs overflow-x-auto text-gray-700">
                   {JSON.stringify(selectedTrace, null, 2)}
                 </pre>
              </Section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}
