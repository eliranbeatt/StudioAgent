"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { Plus, Search } from "lucide-react";

export default function CatalogPage() {
    const [search, setSearch] = useState("");
    const items = useQuery(api.management.searchCatalog, { query: search });
    const createItem = useMutation(api.management.createCatalogItem);

    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ canonicalName: "", unit: "unit", tags: "" });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await createItem({
            canonicalName: formData.canonicalName,
            unit: formData.unit,
            tags: formData.tags.split(",").map(t => t.trim()).filter(Boolean),
        });
        setFormData({ canonicalName: "", unit: "unit", tags: "" });
        setShowForm(false);
    };

    return (
        <div className="max-w-4xl">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Material Catalog</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
                >
                    <Plus size={16} /> Add Item
                </button>
            </div>

            <div className="mb-6 relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                <input
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Search catalog..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow mb-8 border">
                    <h3 className="font-bold mb-4">New Catalog Item</h3>
                    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                        <input
                            placeholder="Item Name (e.g. MDF 12mm)"
                            className="border p-2 rounded"
                            value={formData.canonicalName}
                            onChange={e => setFormData({ ...formData, canonicalName: e.target.value })}
                            required
                        />
                        <select
                            className="border p-2 rounded bg-white"
                            value={formData.unit}
                            onChange={e => setFormData({ ...formData, unit: e.target.value })}
                        >
                            <option value="unit">Unit (pcs)</option>
                            <option value="m">Meter (m)</option>
                            <option value="m2">Square Meter (m²)</option>
                            <option value="kg">Kg</option>
                            <option value="l">Liter</option>
                        </select>
                        <input
                            placeholder="Tags (comma separated)"
                            className="border p-2 rounded col-span-2"
                            value={formData.tags}
                            onChange={e => setFormData({ ...formData, tags: e.target.value })}
                        />
                        <div className="col-span-2 flex justify-end gap-2 mt-2">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items?.map(item => (
                    <div key={item._id} className="bg-white p-4 border rounded hover:shadow-md transition">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold text-lg">{item.canonicalName}</h3>
                                <p className="text-gray-500 text-sm">Unit: {item.unit}</p>
                            </div>
                            {item.typicalVendorId && <span className="text-xs bg-gray-100 px-2 py-1 rounded">Has Default Vendor</span>}
                        </div>
                        <div className="mt-3 flex gap-2 flex-wrap">
                            {item.tags.map(tag => (
                                <span key={tag} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
                {items?.length === 0 && (
                    <p className="text-gray-500 col-span-2 text-center py-8">No items found matching your search.</p>
                )}
            </div>
        </div>
    );
}
