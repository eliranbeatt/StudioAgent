import Link from "next/link";
import { Users, Package, ShoppingCart, UserCircle } from "lucide-react";

export default function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-50 text-black">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <Link href="/" className="text-gray-500 text-sm hover:underline">
            &larr; Home
          </Link>
          <h1 className="text-xl font-bold mt-2">Management Hub</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/management/vendors"
            className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <Users size={20} /> Vendors
          </Link>
          <Link
            href="/management/catalog"
            className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <Package size={20} /> Material Catalog
          </Link>
          <Link
            href="/management/employees"
            className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <UserCircle size={20} /> Employees
          </Link>
          <div className="mt-4 pt-4 border-t">
             <span className="px-4 text-xs font-semibold text-gray-400 uppercase">Incoming</span>
             <Link
            href="/management/proposed"
            className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <ShoppingCart size={20} /> Proposed Queue
          </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
