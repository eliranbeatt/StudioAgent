"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building, Calendar, Folder } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.customerId as Id<"customers">;
  
  const customer = useQuery(api.customersStudio.getCustomerStudio, { customerId });
  const projects = useQuery(api.customersStudio.listProjectsByCustomer, { customerId });

  if (customer === undefined) {
    return <div className="p-8 text-gray-500">Loading customer...</div>;
  }

  if (customer === null) {
    return <div className="p-8 text-gray-500">Customer not found.</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link href="/customers" className="flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6 w-fit">
        <ArrowLeft size={16} className="mr-1" /> Back to Customers
      </Link>

      <div className="bg-white border rounded-lg p-6 mb-8 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              <Building size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                  customer.status === "active" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"
                }`}>
                  {customer.status.toUpperCase()}
                </span>
                <span className="text-gray-400 text-sm">•</span>
                <span className="text-gray-500 text-sm">Updated {new Date(customer.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {customer.contacts && customer.contacts.length > 0 && (
          <div className="mt-6 pt-6 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
            {customer.contacts.map((contact: any) => (
              <div key={contact._id} className="p-3 bg-gray-50 rounded-md border text-sm">
                <div className="font-medium text-gray-900">{contact.name}</div>
                {contact.role && <div className="text-gray-500 text-xs">{contact.role}</div>}
                <div className="mt-2 space-y-0.5">
                  {contact.email && <div className="text-gray-600">{contact.email}</div>}
                  {contact.phone && <div className="text-gray-600">{contact.phone}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects</h2>
      
      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 font-medium text-gray-500">Project Name</th>
              <th className="px-6 py-3 font-medium text-gray-500">Status</th>
              <th className="px-6 py-3 font-medium text-gray-500">Event Date</th>
              <th className="px-6 py-3 font-medium text-gray-500">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {projects === undefined ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading projects...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No projects found.</td></tr>
            ) : (
              projects.map((p) => (
                <tr key={p._id} className="hover:bg-gray-50 group">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    <Link href={`/projects/${p._id}/overview`} className="flex items-center gap-2 hover:underline">
                      <Folder size={16} className="text-gray-400" />
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                      p.status === "active" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 flex items-center gap-1">
                    {p.eventDate ? (
                      <>
                        <Calendar size={14} className="text-gray-400" />
                        {new Date(p.eventDate).toLocaleDateString()}
                      </>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(p.updatedAt).toLocaleDateString()}
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
