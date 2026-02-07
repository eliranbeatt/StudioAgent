"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { calculateTraceCost, formatUsd, resolvePricing } from "../../../lib/llmPricing";
import { ChevronDown, Filter } from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const shortDayLabel = (value: Date) => `${value.getMonth() + 1}/${value.getDate()}`;

// --- Types ---
type TraceItem = {
  _id: string;
  _creationTime: number;
  projectId?: string | null;
  runId?: string | null;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  status: "success" | "failed";
};

export default function AnalyticsPage() {
  const [now] = useState(() => Date.now());
  const today = useMemo(() => new Date(now), [now]);

  // Filters
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterRunId, setFilterRunId] = useState<string>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allTraces, setAllTraces] = useState<TraceItem[]>([]);

  const projects = useQuery(api.projects.list);
  const runIds = useQuery(api.tracing.listRunIds, { limit: 100 });

  // Use new filtered query without time limit
  const tracesResult = useQuery(api.tracing.analyticsFiltered, {
    projectId: filterProject !== "all" ? (filterProject as Id<"projects">) : undefined,
    runId: filterRunId !== "all" ? filterRunId : undefined,
    limit: 500,
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
        setAllTraces(tracesResult.traces as TraceItem[]);
      } else {
        setAllTraces(prev => [...prev, ...(tracesResult.traces as TraceItem[])]);
      }
    }
  }, [tracesResult?.traces, cursor]);

  // Reset cursor when filters change
  useEffect(() => {
    setCursor(null);
    setAllTraces([]);
  }, [filterProject, filterRunId]);

  const analytics = useMemo(() => {
    if (!allTraces || !projects) return null;

    const perModel = new Map<string, number>();
    const perProject = new Map<string, number>();
    const perRunId = new Map<string, { cost: number; projectName: string }>();
    const perDay = new Map<string, number>();

    allTraces.forEach((trace) => {
      if (trace.status !== "success") return;
      const cost = calculateTraceCost({
        model: trace.model,
        inputTokens: Number(trace.inputTokens || 0),
        outputTokens: Number(trace.outputTokens || 0),
        cachedInputTokens: 0
      });
      if (cost === null) return;

      const modelLabel = resolvePricing(trace.model)?.label || trace.model;
      perModel.set(modelLabel, (perModel.get(modelLabel) || 0) + cost);

      const projectName = trace.projectId
        ? (projectNameById.get(trace.projectId as any) as string) || "Unknown project"
        : "Unassigned";
      perProject.set(projectName, (perProject.get(projectName) || 0) + cost);

      // Aggregate by run ID
      if (trace.runId) {
        const existing = perRunId.get(trace.runId);
        if (existing) {
          existing.cost += cost;
        } else {
          perRunId.set(trace.runId, { cost, projectName });
        }
      }

      const key = dayKey(new Date(trace._creationTime));
      perDay.set(key, (perDay.get(key) || 0) + cost);
    });

    // Get date range from data
    const timestamps = allTraces.map(t => t._creationTime);
    const minDate = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : today;
    const maxDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : today;

    // Generate daily dates for the last 30 days or from data range
    const daysToShow = Math.min(30, Math.ceil((maxDate.getTime() - minDate.getTime()) / DAY_MS) + 1);
    const dailyDates = Array.from({ length: Math.max(daysToShow, 7) }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (Math.max(daysToShow, 7) - 1 - index));
      return date;
    });

    const dailyTotals = dailyDates.map((date) => perDay.get(dayKey(date)) || 0);
    const maxDaily = Math.max(1, ...dailyTotals);

    const totalAll = Array.from(perDay.values()).reduce((sum, value) => sum + value, 0);

    const perModelRows = Array.from(perModel.entries()).sort((a, b) => b[1] - a[1]);
    const perProjectRows = Array.from(perProject.entries()).sort((a, b) => b[1] - a[1]);
    const perRunIdRows = Array.from(perRunId.entries())
      .map(([runId, data]) => ({ runId, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 20); // Top 20 run IDs

    return {
      dailyDates,
      dailyTotals,
      maxDaily,
      totalAll,
      perModelRows,
      perProjectRows,
      perRunIdRows,
    };
  }, [allTraces, projects, today, projectNameById]);

  const handleLoadMore = () => {
    if (tracesResult?.continueCursor) {
      setCursor(tracesResult.continueCursor);
    }
  };

  if (!tracesResult || !projects || !analytics) {
    return <div className="text-gray-500">Loading analytics...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">LLM Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Costs aggregated from {allTraces.length} LLM traces{!tracesResult.isDone && " (loading more...)"}.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-500" />
          <span className="text-sm text-gray-600">Filters:</span>
        </div>
        <select
          className="text-sm border rounded px-3 py-1.5 bg-gray-50"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
        >
          <option value="all">All Projects</option>
          {projects?.map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
        <select
          className="text-sm border rounded px-3 py-1.5 bg-gray-50"
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
        {!tracesResult.isDone && (
          <button
            onClick={handleLoadMore}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-1"
          >
            <ChevronDown size={14} /> Load More Data
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border bg-white">
          <div className="text-xs text-gray-500 uppercase font-semibold">Total Cost (All Data)</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {formatUsd(analytics.totalAll, 2)}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-white">
          <div className="text-xs text-gray-500 uppercase font-semibold">Trace Count</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {allTraces.length}{!tracesResult.isDone && "+"}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-white">
          <div className="text-xs text-gray-500 uppercase font-semibold">Unique Run IDs</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {analytics.perRunIdRows.length}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 uppercase font-semibold">Daily Cost</div>
          <div className="text-xs text-gray-400">USD</div>
        </div>
        <div className="mt-4 h-40 relative">
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polyline
              fill="none"
              stroke="#1d4ed8"
              strokeWidth="1.5"
              points={analytics.dailyTotals
                .map((value, index) => {
                  const x = (index / (analytics.dailyTotals.length - 1)) * 100;
                  const y = 100 - (value / analytics.maxDaily) * 100;
                  return `${x},${y}`;
                })
                .join(" ")}
            />
          </svg>
          <div className="absolute inset-0 flex items-end gap-1">
            {analytics.dailyTotals.map((value, index) => {
              const height = Math.max(6, (value / analytics.maxDaily) * 100);
              return (
                <div key={analytics.dailyDates[index].toISOString()} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-200 rounded-sm"
                    style={{ height: `${height}%` }}
                    title={formatUsd(value, 4)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-gray-400">
          {analytics.dailyDates.map((date, index) => (
            <div key={date.toISOString()} className="flex-1 text-center">
              {index % 5 === 0 ? shortDayLabel(date) : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500 uppercase font-semibold">
            Cost by Model
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white">
              <tr className="text-left text-gray-500 border-b">
                <th className="px-4 py-2 font-semibold">Model</th>
                <th className="px-4 py-2 font-semibold text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {analytics.perModelRows.map(([model, value]) => (
                <tr key={model}>
                  <td className="px-4 py-2 text-gray-700">{model}</td>
                  <td className="px-4 py-2 text-right text-gray-900">{formatUsd(value, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500 uppercase font-semibold">
            Cost by Project
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white">
              <tr className="text-left text-gray-500 border-b">
                <th className="px-4 py-2 font-semibold">Project</th>
                <th className="px-4 py-2 font-semibold text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {analytics.perProjectRows.map(([project, value]) => (
                <tr key={project}>
                  <td className="px-4 py-2 text-gray-700">{project}</td>
                  <td className="px-4 py-2 text-right text-gray-900">{formatUsd(value, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500 uppercase font-semibold">
            Cost by Run ID (Top 20)
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-white sticky top-0">
                <tr className="text-left text-gray-500 border-b">
                  <th className="px-4 py-2 font-semibold">Run ID</th>
                  <th className="px-4 py-2 font-semibold text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analytics.perRunIdRows.map((row) => (
                  <tr key={row.runId}>
                    <td className="px-4 py-2 text-gray-700">
                      <div className="text-blue-600 truncate max-w-[150px]" title={row.runId}>
                        {row.runId.slice(0, 12)}...
                      </div>
                      <div className="text-xs text-gray-400">{row.projectName}</div>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900">{formatUsd(row.cost, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}

