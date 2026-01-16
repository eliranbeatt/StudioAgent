"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Users, ListTodo, Calculator } from "lucide-react";

export function StudioTopNav() {
  const pathname = usePathname();

  const tabs = [
    {
      name: "Projects",
      href: "/projects",
      icon: Folder,
      isActive: (path: string) => path.startsWith("/projects"),
    },
    {
      name: "Tasks",
      href: "/tasks",
      icon: ListTodo,
      isActive: (path: string) => path === "/tasks",
    },
    {
      name: "Accounting",
      href: "/accounting",
      icon: Calculator,
      isActive: (path: string) => path === "/accounting",
    },
    {
      name: "Customers",
      href: "/customers",
      icon: Users,
      isActive: (path: string) => path.startsWith("/customers"),
    },
    {
      name: "Management",
      href: "/management",
      icon: ListTodo,
      isActive: (path: string) => path.startsWith("/management"),
    },
  ];

  return (
    <div className="h-14 bg-white border-b flex items-center px-4 sticky top-0 z-50">
      <div className="flex items-center gap-1 mr-8">
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold text-lg">
          S
        </div>
        <span className="font-bold text-lg tracking-tight">Studio</span>
      </div>

      <nav className="flex items-center gap-6 h-full">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname);
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`flex items-center gap-2 h-full border-b-2 px-1 transition-colors ${active
                ? "border-black text-black font-medium"
                : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
            >
              <tab.icon size={18} />
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
