"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import Link from "next/link";
import { Plus, Folder, Database, Pencil, Check, X, Trash2 } from "lucide-react";

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.updateProjectDetails);
  const deleteProject = useMutation(api.projects.deleteProject);
  const setProjectCustomerByName = useMutation(api.projectsCustomers.setProjectCustomerByName);

  const [newProjectName, setNewProjectName] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");

  // Renaming state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    // Pass undefined if empty string to trigger default naming
    const projectId = await createProject({ name: newProjectName.trim() || undefined });
    const customerName = newCustomerName.trim();
    if (customerName) {
      await setProjectCustomerByName({
        projectId,
        customerName,
      });
    }
    setNewProjectName("");
    setNewCustomerName("");
  };

  const handleDelete = async (e: React.MouseEvent, id: any, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete project "${name}"? This will delete ALL associated data and cannot be undone.`)) {
      await deleteProject({ id });
    }
  };

  const startEditing = (e: React.MouseEvent, project: any) => {
    e.preventDefault(); // Prevent Link navigation
    e.stopPropagation();
    setEditingId(project._id);
    setEditName(project.name);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(null);
    setEditName("");
  };

  const saveProjectName = async (e: React.MouseEvent, id: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editName.trim()) return;

    await updateProject({ id, name: editName });
    setEditingId(null);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <div className="mt-2">
            <Link href="/management" className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1">
              <Database size={14} /> Go to Management Hub
            </Link>
          </div>
        </div>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            placeholder="New Project Name (Optional)"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="border p-2 rounded text-black w-64"
          />
          <input
            type="text"
            placeholder="Customer (Optional)"
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            className="border p-2 rounded text-black w-56"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
          >
            <Plus size={16} /> Create
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects?.map((project) => (
          <Link
            key={project._id}
            href={`/projects/${project._id}/studio`}
            className="group block bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-200 relative"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-gray-600 group-hover:bg-black group-hover:text-white transition-colors">
                <Folder size={20} />
              </div>
              <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold rounded-full uppercase tracking-wider">
                {project.status}
              </span>
            </div>

            <div className="flex items-center justify-between mb-1 min-h-[2rem]">
              {editingId === project._id ? (
                <div className="flex items-center gap-2 w-full" onClick={(e) => e.preventDefault()}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border border-blue-400 rounded px-2 py-1 text-sm font-bold text-gray-900 focus:outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()} // Allow clicking input without triggered link
                  />
                  <button
                    onClick={(e) => saveProjectName(e, project._id)}
                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={(e) => cancelEditing(e)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="font-bold text-lg text-gray-900 truncate pr-2">
                    {project.name}
                  </h2>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startEditing(e, project)}
                      className="p-1 text-gray-400 hover:text-blue-600"
                      title="Rename Project"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, project._id, project.name)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Delete Project"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>

            <p className="text-gray-500 text-xs">Last updated just now</p>

            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs font-medium text-gray-500">
              <span>View Studio</span>
              <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
