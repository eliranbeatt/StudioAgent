"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { calculateTraceCost, formatUsd, resolvePricing } from "../../../lib/llmPricing";

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const shortDayLabel = (value: Date) => `${value.getMonth() + 1}/${value.getDate()}`;

export default function AnalyticsPage() {
  const [now] = useState(() => Date.now());
  const today = useMemo(() => new Date(now), [now]);
  const since = useMemo(() => now - DAY_MS * 29, [now]);

  const traces = useQuery(api.tracing.analytics, { since });
  const projects = useQuery(api.projects.list);

  const analytics = useMemo(() => {
    if (!traces || !projects) return null;

    const projectNameById = new Map(
      projects.map((project) => [project._id, project.name])
    );

    const perModel = new Map<string, number>();
    const perProject = new Map<string, number>();
    const perDay = new Map<string, number>();

    traces.forEach((trace) => {
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

      const key = dayKey(new Date(trace._creationTime));
      perDay.set(key, (perDay.get(key) || 0) + cost);
    });

    const dailyDates = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (29 - index));
      return date;
    });

    const dailyTotals = dailyDates.map((date) => perDay.get(dayKey(date)) || 0);
    const maxDaily = Math.max(1, ...dailyTotals);

    const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const totalMonth = Array.from({ length: currentMonthEnd.getDate() }, (_, dayIndex) => {
      const date = new Date(today.getFullYear(), today.getMonth(), dayIndex + 1);
      return perDay.get(dayKey(date)) || 0;
    }).reduce((sum, value) => sum + value, 0);

    const totalLast30Days = dailyTotals.reduce((sum, value) => sum + value, 0);

    const perModelRows = Array.from(perModel.entries()).sort((a, b) => b[1] - a[1]);
    const perProjectRows = Array.from(perProject.entries()).sort((a, b) => b[1] - a[1]);

    return {
      dailyDates,
      dailyTotals,
      maxDaily,
      totalLast30Days,
      totalMonth,
      perModelRows,
      perProjectRows
    };
  }, [traces, projects, today]);

  if (!traces || !projects || !analytics) {
    return <div className="text-gray-500">Loading analytics...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">LLM Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Costs aggregated from the last 30 days of LLM traces.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border bg-white">
          <div className="text-xs text-gray-500 uppercase font-semibold">Total Cost (Last 30 Days)</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {formatUsd(analytics.totalLast30Days, 2)}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-white">
          <div className="text-xs text-gray-500 uppercase font-semibold">Total Cost (This Month)</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {formatUsd(analytics.totalMonth, 2)}
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-white">
          <div className="text-xs text-gray-500 uppercase font-semibold">Trace Count</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {traces.length}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 uppercase font-semibold">Daily Cost (Last 30 Days)</div>
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

      <div className="grid grid-cols-2 gap-6">
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
      </div>

    </div>
  );
}
