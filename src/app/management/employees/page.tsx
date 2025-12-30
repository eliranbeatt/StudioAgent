"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Plus } from "lucide-react";

export default function EmployeesPage() {
    const employees = useQuery(api.management.listEmployees);
    const createEmployee = useMutation(api.management.createEmployee);

    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ displayName: "", role: "", defaultDayRate: 800 });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await createEmployee({
            displayName: formData.displayName,
            role: formData.role,
            defaultDayRate: Number(formData.defaultDayRate),
        });
        setFormData({ displayName: "", role: "", defaultDayRate: 800 });
        setShowForm(false);
    };

    return (
        <div className="max-w-4xl">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Employees & Roles</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
                >
                    <Plus size={16} /> Add Person
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow mb-8 border">
                    <h3 className="font-bold mb-4">New Person</h3>
                    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                        <input
                            placeholder="Display Name"
                            className="border p-2 rounded"
                            value={formData.displayName}
                            onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                            required
                        />
                        <input
                            placeholder="Role (e.g. Art Director)"
                            className="border p-2 rounded"
                            value={formData.role}
                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                            required
                        />
                        <div className="col-span-2">
                             <label className="block text-sm text-gray-500 mb-1">Default Day Rate (NIS)</label>
                            <input
                                type="number"
                                className="border p-2 rounded w-full"
                                value={formData.defaultDayRate}
                                onChange={e => setFormData({ ...formData, defaultDayRate: Number(e.target.value) })}
                                required
                            />
                        </div>
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
                            <th className="p-4 font-semibold text-gray-600">Role</th>
                            <th className="p-4 font-semibold text-gray-600">Rate (Day)</th>
                            <th className="p-4 font-semibold text-gray-600">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees?.map(emp => (
                            <tr key={emp._id} className="border-b hover:bg-gray-50">
                                <td className="p-4 font-medium">{emp.displayName}</td>
                                <td className="p-4"><span className="px-2 py-1 bg-blue-50 text-blue-800 rounded text-xs">{emp.role}</span></td>
                                <td className="p-4 font-mono text-gray-700">{emp.defaultDayRate} ₪</td>
                                <td className="p-4 text-green-600 text-sm">Active</td>
                            </tr>
                        ))}
                         {employees?.length === 0 && (
                            <tr><td colSpan={4} className="p-8 text-center text-gray-500">No employees added yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
