"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Calculator,
  ListTodo,
  FileText,
  Layers,
  BrainCircuit,
} from "lucide-react";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const rawId = params.id as string;
  const resolved = useQuery(api.projects.resolveProjectId, { id: rawId });
  const projectId = resolved?.projectId ?? null;

  useEffect(() => {
    if (!resolved || !projectId) return;
    if (projectId === rawId) return;
    const nextPath = pathname.replace(`/projects/${rawId}`, `/projects/${projectId}`);
    router.replace(nextPath);
  }, [pathname, projectId, rawId, resolved, router]);

  const navItems = [
    { name: "Overview", href: `/projects/${projectId}/overview`, icon: LayoutDashboard },
    { name: "Agent (New)", href: `/projects/${projectId}/agent`, icon: BrainCircuit },
    { name: "AgenticEshet", href: `/projects/${projectId}/studio`, icon: Bot },
    { name: "Elements", href: `/projects/${projectId}/elements`, icon: Layers },
    { name: "Accounting", href: `/projects/${projectId}/accounting`, icon: Calculator },
    { name: "Tasks", href: `/projects/${projectId}/tasks`, icon: ListTodo },
    { name: "Quote", href: `/projects/${projectId}/quote`, icon: FileText },
  ];

  if (!resolved) {
    return <div className="p-8 text-gray-500">Loading project...</div>;
  }

  if (!projectId) {
    return (
      <div className="p-8 text-gray-500">
        Project not found. Please return to Projects and pick a valid project.
      </div>
    );
  }

  if (projectId !== rawId) {
    return <div className="p-8 text-gray-500">Redirecting to project...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6">
          <Link href="/projects" className="text-xs font-semibold text-gray-400 hover:text-gray-800 uppercase tracking-wider mb-4 block">
            &larr; Console
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold text-lg">A</div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">AgenticEshet</h1>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all duration-200 group ${isActive
                  ? "bg-black text-white shadow-md font-medium"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  }`}
              >
                <item.icon size={18} className={isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600"} />
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t" />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

    </div>
  );
}
