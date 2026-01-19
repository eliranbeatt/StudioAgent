"use client";

import { useConvex, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { useState } from "react";
import { Search, Filter, Calendar, Briefcase, User, CheckCircle2, Download } from "lucide-react";
import { exportToCsv } from "../../lib/exportUtils";

const WORK_TYPES = [
  "carpentry",
  "metal_fab",
  "paint_finish",
  "printing_graphics",
  "props_sculpt",
  "rigging_install",
  "transport_logistics",
  "purchasing",
  "management"
];

const STATUSES = ["todo", "doing", "done", "blocked"]; // Common defaults
const PROJECT_STATUSES = ["active", "archived", "lead", "production", "done", "rejected"];

export default function GlobalTasksPage() {
  const convex = useConvex();
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [projectStatus, setProjectStatus] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [workType, setWorkType] = useState<string>("");

  const [isExporting, setIsExporting] = useState(false);

  const projects = useQuery(api.projects.list);
  const tasks = useQuery(api.tasksStudio.listGlobal, {
    search: search || undefined,
    projectId: projectId ? (projectId as any) : undefined,
    projectStatus: projectStatus || undefined,
    status: status || undefined,
    workType: workType || undefined,
    limit: 100,
  });

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Global Tasks</h1>
          <p className="text-gray-500">View and manage tasks across all projects</p>
        </div>
        <button
          onClick={async () => {
            if (isExporting) return;
            setIsExporting(true);

            try {
              const exportData = await convex.query(api.tasksStudio.listGlobal, {
                search: search || undefined,
                projectId: projectId ? (projectId as any) : undefined,
                projectStatus: projectStatus || undefined,
                status: status || undefined,
                workType: workType || undefined,
                // No limit for export
              } as any);

              const formatted = exportData.map((t: any) => ({
                "Task ID": t._id,
                "Title": t.title,
                "Description": t.description || "",
                "Status": t.status,
                "Work Type": t.workType,
                "Assignee": t.assignee || "",
                "Project": t.projectName,
                "Customer": t.customerName,
                "Project Status": t.projectStatus,
                "Due Date": t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "",
                "Created At": t.creationTime ? new Date(t.creationTime).toLocaleString() : "",
              }));

              exportToCsv(formatted, `Tasks_Export_${new Date().toLocaleDateString("en-CA")}`);
            } finally {
              setIsExporting(false);
            }
          }}
          disabled={isExporting}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? "Exporting..." : "Export to CSV"}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border shadow-sm mb-6 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search tasks..."
            className="w-full pl-9 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="border rounded-md px-3 py-2 text-sm min-w-[150px] bg-white"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects?.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>

        <select
          className="border rounded-md px-3 py-2 text-sm min-w-[150px] bg-white capitalize"
          value={projectStatus}
          onChange={(e) => setProjectStatus(e.target.value)}
        >
          <option value="">All Project Statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className="border rounded-md px-3 py-2 text-sm min-w-[120px] bg-white capitalize"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className="border rounded-md px-3 py-2 text-sm min-w-[150px] bg-white capitalize"
          value={workType}
          onChange={(e) => setWorkType(e.target.value)}
        >
          <option value="">All Work Types</option>
          {WORK_TYPES.map((wt) => (
            <option key={wt} value={wt}>{wt.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-500 w-[40%]">Task</th>
              <th className="px-4 py-3 font-medium text-gray-500">Project</th>
              <th className="px-4 py-3 font-medium text-gray-500">Assignee</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Work Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks === undefined ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading tasks...</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No tasks found.</td></tr>
            ) : (
              tasks.map((task) => (
                <tr key={task._id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{task.title}</div>
                    {task.description && (
                      <div className="text-gray-500 text-xs truncate max-w-md mt-0.5">{task.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link href={`/projects/${task.projectId}/tasks`} className="hover:text-black hover:underline flex flex-col">
                      <span className="font-medium">{task.projectName}</span>
                      <span className="text-xs text-gray-400">{task.customerName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {task.assignee ? (
                      <div className="flex items-center gap-2 text-gray-700">
                        <User size={14} className="text-gray-400" />
                        {task.assignee}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${task.status === "done" ? "bg-green-50 text-green-700 border-green-200" :
                        task.status === "doing" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          task.status === "blocked" ? "bg-red-50 text-red-700 border-red-200" :
                            "bg-gray-100 text-gray-600 border-gray-200"
                      }`}>
                      {task.status || "Todo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">
                    {task.workType ? task.workType.replace("_", " ") : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {task.dueDate ? (
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        {new Date(task.dueDate).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
