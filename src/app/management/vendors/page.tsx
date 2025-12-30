"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Plus } from "lucide-react";

export default function VendorsPage() {
  const vendors = useQuery(api.management.listVendors);
  const createVendor = useMutation(api.management.createVendor);
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", type: "General", email: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createVendor(formData);
    setFormData({ name: "", type: "General", email: "" });
    setShowForm(false);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Vendors Directory</h1>
        <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
            <Plus size={16} /> Add Vendor
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-8 border">
            <h3 className="font-bold mb-4">New Vendor</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                <input 
                    placeholder="Name" 
                    className="border p-2 rounded" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    required
                />
                 <select 
                    className="border p-2 rounded bg-white"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                >
                    <option value="General">General</option>
                    <option value="Print">Print House</option>
                    <option value="Wood">Carpenter</option>
                    <option value="Metal">Metal Work</option>
                    <option value="Logistics">Logistics</option>
                </select>
                <input 
                    placeholder="Email (optional)" 
                    className="border p-2 rounded" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                />
                <div className="col-span-2 flex justify-end gap-2 mt-2">
                    <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                </div>
            </form>
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
                <tr>
                    <th className="p-4 font-semibold text-gray-600">Name</th>
                    <th className="p-4 font-semibold text-gray-600">Type</th>
                    <th className="p-4 font-semibold text-gray-600">Contact</th>
                    <th className="p-4 font-semibold text-gray-600">Status</th>
                </tr>
            </thead>
            <tbody>
                {vendors?.map(vendor => (
                    <tr key={vendor._id} className="border-b hover:bg-gray-50">
                        <td className="p-4 font-medium">{vendor.name}</td>
                        <td className="p-4"><span className="px-2 py-1 bg-gray-100 rounded text-xs">{vendor.type}</span></td>
                        <td className="p-4 text-gray-500">{vendor.email || "-"}</td>
                        <td className="p-4 text-green-600 text-sm">Active</td>
                    </tr>
                ))}
                {vendors?.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">No vendors found. Add one to start.</td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
}
