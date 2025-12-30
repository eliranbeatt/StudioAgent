"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { use } from "react";
import { ClipboardList, Layers } from "lucide-react";

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = id as Id<"projects">;
  const data = useQuery(api.tasks.listForProject, { projectId });

  if (!data) {
    return <div className="p-8 text-gray-500">Loading tasks...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto text-black">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Tasks</h2>
          <p className="text-sm text-gray-500 mt-1">
            {data.totals.taskCount} tasks across {data.totals.elementCount} elements
          </p>
        </div>
        <div className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-gray-100 text-gray-600">
          Draft view
        </div>
      </div>

      {data.elements.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-500">
          No elements yet. Create elements in Studio Agent to see tasks here.
        </div>
      ) : (
        <div className="space-y-6">
          {data.elements.map((element) => (
            <div
              key={element.elementId}
              className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gray-100 text-gray-700">
                    <Layers size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{element.elementTitle}</div>
                    <div className="text-xs text-gray-500">
                      {element.elementType} · {element.elementStatus}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  {element.tasks.length} tasks
                </span>
              </div>
              <div className="divide-y">
                {element.tasks.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">
                    No tasks yet for this element.
                  </div>
                ) : (
                  element.tasks.map((task) => (
                    <div key={task.id} className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ClipboardList size={16} className="text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900">{task.title}</div>
                          {task.domain ? (
                            <div className="text-xs text-gray-500 mt-1">{task.domain}</div>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">Draft</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
