"use client";

import { useState, useEffect, useMemo } from "react";
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
  RefreshCw,
  ChevronDown
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { MODEL_PRICING, calculateTraceCost, formatCents, resolvePricing } from "../../../lib/llmPricing";

// --- Helpers ---

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

// --- Types ---
type TraceItem = {
  _id: Id<"llmTraces">;
  _creationTime: number;
  projectId?: Id<"projects"> | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "success" | "failed";
  error?: string;
  runId?: string;
  cost?: number;
};

// --- Components ---

export default function TracingPage() {
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRunId, setFilterRunId] = useState<string>("all");
  const [limit, setLimit] = useState<number>(50);
  const [cursor, setCursor] = useState<string | null>(null);
  const [allTraces, setAllTraces] = useState<TraceItem[]>([]);

  const projects = useQuery(api.projects.list);
  const runIds = useQuery(api.tracing.listRunIds, { limit: 100 });

  const tracesResult = useQuery(api.tracing.list, {
    limit,
    projectId: filterProject !== "all" ? (filterProject as Id<"projects">) : undefined,
    status: filterStatus !== "all" ? (filterStatus as "success" | "failed") : undefined,
    runId: filterRunId !== "all" ? filterRunId : undefined,
    cursor: cursor ?? undefined,
  });

  // Build project name lookup
  const projectNameById = useMemo(() => {
    if (!projects) return new Map<string, string>();
    return new Map(projects.map(p => [p._id, p.name]));
  }, [projects]);

  // Accumulate traces when loading more
  useEffect(() => {
    if (tracesResult?.traces) {
      if (cursor === null) {
        // Fresh load - reset traces
        setAllTraces(tracesResult.traces as TraceItem[]);
      } else {
        // Appending more traces
        setAllTraces(prev => [...prev, ...(tracesResult.traces as TraceItem[])]);
      }
    }
  }, [tracesResult?.traces, cursor]);

  // Reset cursor when filters change
  useEffect(() => {
    setCursor(null);
    setAllTraces([]);
  }, [filterProject, filterStatus, filterRunId, limit]);

  const [selectedTraceId, setSelectedTraceId] = useState<Id<"llmTraces"> | null>(null);

  const selectedTrace = useQuery(api.tracing.get, selectedTraceId ? { id: selectedTraceId } : "skip");
  const cachedInputTokens = Number(selectedTrace?.response?.usage?.prompt_tokens_details?.cached_tokens ?? 0)
  const reasoningTokens = Number(selectedTrace?.response?.usage?.completion_tokens_details?.reasoning_tokens ?? 0)
  const resolvedInputTokens = Number(selectedTrace?.inputTokens || selectedTrace?.response?.usage?.prompt_tokens || 0)
  const resolvedOutputTokens = Number(selectedTrace?.outputTokens || selectedTrace?.response?.usage?.completion_tokens || 0)
  const activePricing = selectedTrace ? resolvePricing(selectedTrace.model) : null
  const totalCost = selectedTrace
    ? calculateTraceCost({
      model: selectedTrace.model,
      inputTokens: resolvedInputTokens,
      outputTokens: resolvedOutputTokens,
      cachedInputTokens
    })
    : null

  // Auto-select first if none selected and traces loaded
  useEffect(() => {
    if (!selectedTraceId && allTraces.length > 0) {
      setSelectedTraceId(allTraces[0]._id);
    }
  }, [selectedTraceId, allTraces]);

  const ctxPacks = selectedTrace?.request?.traceMeta?.ctxPacks
  const promptCacheKey = selectedTrace?.request?.prompt_cache_key
  const promptCacheRetention = selectedTrace?.request?.prompt_cache_retention

  const handleLoadMore = () => {
    if (tracesResult?.continueCursor) {
      setCursor(tracesResult.continueCursor);
    }
  };

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
          <div className="flex gap-2">
            <select
              className="flex-1 text-xs border rounded px-2 py-1 bg-gray-50"
              value={filterRunId}
              onChange={(e) => setFilterRunId(e.target.value)}
            >
              <option value="all">All Run IDs</option>
              {runIds?.map(r => (
                <option key={r.runId} value={r.runId}>
                  {r.runId.slice(0, 20)}... - {r.projectId ? projectNameById.get(r.projectId) || "Unknown" : "No Project"}
                </option>
              ))}
            </select>
            <select
              className="w-24 text-xs border rounded px-2 py-1 bg-gray-50"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        <div className="p-3 border-b bg-gray-100 sticky top-0 z-10 flex justify-between items-center">
          <h2 className="font-semibold text-sm flex items-center gap-2 text-gray-700">
            <Clock size={16} /> Recent Traces
          </h2>
          <span className="text-xs text-gray-500">{allTraces.length} items{!tracesResult?.isDone && "+"}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!tracesResult ? (
            <div className="p-4 text-center text-gray-500">Loading traces...</div>
          ) : allTraces.length === 0 ? (
            <div className="p-8 text-center text-gray-400 flex flex-col items-center gap-2">
              <Filter size={24} />
              <span>No traces found</span>
            </div>
          ) : (
            <div className="divide-y">
              {allTraces.map((trace) => (
                <div
                  key={trace._id}
                  onClick={() => setSelectedTraceId(trace._id)}
                  className={`p-4 cursor-pointer hover:bg-white transition-colors ${selectedTraceId === trace._id ? "bg-white border-l-4 border-l-blue-500 shadow-sm" : "border-l-4 border-l-transparent"
                    }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${trace.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                      {trace.status}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(trace._creationTime)}</span>
                  </div>
                  <div className="font-medium text-sm text-gray-900 truncate mb-1" title={trace.runId}>
                    {trace.runId ? (
                      <span>
                        <span className="text-blue-600">{trace.runId.slice(0, 12)}...</span>
                        {trace.projectId && (
                          <span className="text-gray-500"> - {String(projectNameById.get(trace.projectId as string) || "Unknown")}</span>
                        )}
                      </span>
                    ) : (
                      <span className="italic text-gray-400">No Run ID</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span className="flex items-center gap-1 bg-gray-100 px-1 rounded">
                      <Cpu size={10} /> {trace.model}
                    </span>
                    <span>{formatTime(trace.latencyMs)}</span>
                  </div>
                </div>
              ))}

              {/* Load More Button */}
              {!tracesResult.isDone && (
                <div className="p-4 text-center">
                  <button
                    onClick={handleLoadMore}
                    className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
                  >
                    <ChevronDown size={16} /> Load More
                  </button>
                </div>
              )}
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
                  {totalCost === null ? "-" : formatCents(totalCost)}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {activePricing
                    ? `${activePricing.label} - $${activePricing.input} in / $${activePricing.output} out`
                    : "Unknown model pricing"}
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
                  {resolvedInputTokens + resolvedOutputTokens}
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    ({resolvedInputTokens} in / {resolvedOutputTokens} out{reasoningTokens ? ` / ${reasoningTokens} reasoning` : ""})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Status</div>
                <div className={`text-lg font-bold flex items-center gap-1 ${selectedTrace.status === "success" ? "text-green-600" : "text-red-600"
                  }`}>
                  {selectedTrace.status === "success" ? <CheckCircle size={18} /> : <XCircle size={18} />}
                  {selectedTrace.status}
                </div>
              </div>
            </div>

            {ctxPacks ? (
              <div className="grid grid-cols-4 gap-4 p-4 bg-white rounded-lg border">
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">Context View</div>
                  <div className="text-sm font-medium text-gray-900">{ctxPacks.view ?? "-"}</div>
                  {Array.isArray(ctxPacks.packIds) && ctxPacks.packIds.length > 0 ? (
                    <div className="text-[11px] text-gray-400 mt-1">{ctxPacks.packIds.join(", ")}</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">Packs / Bytes</div>
                  <div className="text-sm font-medium text-gray-900">
                    {ctxPacks.packCount ?? "-"} packs / {ctxPacks.totalBytes ?? "-"} bytes
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">Cached Tokens</div>
                  <div className="text-sm font-medium text-gray-900">{cachedInputTokens || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-semibold">Prompt Cache</div>
                  <div className="text-sm font-medium text-gray-900">
                    {promptCacheKey ? "enabled" : "-"}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1 truncate" title={promptCacheKey}>
                    {promptCacheKey || ""}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {promptCacheRetention ? `retention: ${promptCacheRetention}` : ""}
                  </div>
                </div>
              </div>
            ) : null}



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



