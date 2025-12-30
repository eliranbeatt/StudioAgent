"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import Link from "next/link";
import { Plus, Folder, Database } from "lucide-react";

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  const [newProjectName, setNewProjectName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createProject({ name: newProjectName });
    setNewProjectName("");
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
            placeholder="New Project Name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="border p-2 rounded text-black"
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
            className="group block bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-gray-300 transition-all duration-200"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-gray-600 group-hover:bg-black group-hover:text-white transition-colors">
                <Folder size={20} />
              </div>
              <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold rounded-full uppercase tracking-wider">
                {project.status}
              </span>
            </div>

            <h2 className="font-bold text-lg text-gray-900 mb-1">{project.name}</h2>
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
