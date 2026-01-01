"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";

export default function PricesPage() {
  const observations = useQuery(api.management.listPriceObservations);
  const vendors = useQuery(api.management.listVendors);
  const catalog = useQuery(api.management.searchCatalog, { query: "" });
  const createObservation = useMutation(api.management.createPriceObservation);

  const [form, setForm] = useState({
    catalogId: "",
    vendorId: "",
    unitCost: "",
    currency: "NIS",
    unit: "",
    source: "manual",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.catalogId || !form.unitCost) return;
    await createObservation({
      catalogId: form.catalogId as any,
      vendorId: form.vendorId ? (form.vendorId as any) : undefined,
      unitCost: Number(form.unitCost),
      currency: form.currency,
      unit: form.unit || undefined,
      source: form.source as any,
      sourceRef: {},
    });
    setForm({ catalogId: "", vendorId: "", unitCost: "", currency: "NIS", unit: "", source: "manual" });
  };

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Price Observations</h1>
          <p className="text-gray-500 text-sm">Confirmed price memory for catalog items.</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm mb-8">
        <h3 className="font-semibold mb-4">Add Price Observation</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 text-sm">
          <select
            className="border p-2 rounded bg-white"
            value={form.catalogId}
            onChange={(e) => setForm((prev) => ({ ...prev, catalogId: e.target.value }))}
            required
          >
            <option value="">Select Catalog Item</option>
            {catalog?.map((item) => (
              <option key={item._id} value={item._id}>
                {item.canonicalName}
              </option>
            ))}
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={form.vendorId}
            onChange={(e) => setForm((prev) => ({ ...prev, vendorId: e.target.value }))}
          >
            <option value="">Vendor (optional)</option>
            {vendors?.map((vendor) => (
              <option key={vendor._id} value={vendor._id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="border p-2 rounded"
            placeholder="Unit Cost"
            value={form.unitCost}
            onChange={(e) => setForm((prev) => ({ ...prev, unitCost: e.target.value }))}
            required
          />
          <input
            className="border p-2 rounded"
            placeholder="Unit (optional)"
            value={form.unit}
            onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
          />
          <select
            className="border p-2 rounded bg-white"
            value={form.source}
            onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
          >
            <option value="manual">Manual</option>
            <option value="purchase">Purchase</option>
            <option value="approvedElement">Approved Element</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white rounded font-semibold"
          >
            Save Observation
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Item</th>
              <th className="p-4 font-semibold text-gray-600">Vendor</th>
              <th className="p-4 font-semibold text-gray-600">Unit Cost</th>
              <th className="p-4 font-semibold text-gray-600">Source</th>
              <th className="p-4 font-semibold text-gray-600">Observed</th>
            </tr>
          </thead>
          <tbody>
            {observations?.map((obs) => (
              <tr key={obs._id} className="border-b">
                <td className="p-4">{catalog?.find((c) => c._id === obs.catalogId)?.canonicalName ?? obs.catalogId}</td>
                <td className="p-4">{vendors?.find((v) => v._id === obs.vendorId)?.name ?? "-"}</td>
                <td className="p-4 font-mono">{obs.unitCost} {obs.currency}</td>
                <td className="p-4 text-xs uppercase text-gray-500">{obs.source}</td>
                <td className="p-4 text-xs text-gray-500">{new Date(obs.observedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {observations?.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  No price observations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
