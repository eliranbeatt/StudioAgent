"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Bot, 
  Calculator, 
  ListTodo, 
  FileText, 
  AlertTriangle 
} from "lucide-react";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const projectId = params.id as string;

  const navItems = [
    { name: "Overview", href: `/projects/${projectId}/overview`, icon: LayoutDashboard },
    { name: "Studio Agent", href: `/projects/${projectId}/studio`, icon: Bot },
    { name: "Accounting", href: `/projects/${projectId}/accounting`, icon: Calculator },
    { name: "Tasks", href: `/projects/${projectId}/tasks`, icon: ListTodo },
    { name: "Quote", href: `/projects/${projectId}/quote`, icon: FileText },
    { name: "Graveyard", href: `/projects/${projectId}/graveyard`, icon: AlertTriangle },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <Link href="/projects" className="text-gray-500 text-sm hover:underline">
            &larr; All Projects
          </Link>
          <h1 className="text-xl font-bold mt-2">Studio Agent</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <item.icon size={20} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
