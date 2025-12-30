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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((project) => (
          <Link
            key={project._id}
            href={`/projects/${project._id}/studio`}
            className="block border rounded-lg p-6 hover:shadow-lg transition bg-white text-black"
          >
            <div className="flex items-center gap-3 mb-2">
              <Folder className="text-blue-500" />
              <h2 className="font-semibold text-xl">{project.name}</h2>
            </div>
            <p className="text-gray-500 text-sm">
              Status: <span className="uppercase">{project.status}</span>
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
