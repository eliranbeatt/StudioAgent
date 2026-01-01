"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState } from "react";

type LineItemDraft = {
  catalogId: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
};

export default function PurchasesPage() {
  const purchases = useQuery(api.management.listPurchases);
  const vendors = useQuery(api.management.listVendors);
  const catalog = useQuery(api.management.searchCatalog, { query: "" });
  const createPurchase = useMutation(api.management.createPurchase);

  const [vendorId, setVendorId] = useState("");
  const [currency, setCurrency] = useState("NIS");
  const [status, setStatus] = useState("recorded");
  const [notes, setNotes] = useState("");
  const [lineItem, setLineItem] = useState<LineItemDraft>({
    catalogId: "",
    description: "",
    qty: "1",
    unit: "",
    unitPrice: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId || !lineItem.catalogId || !lineItem.unitPrice) return;
    const qty = Number(lineItem.qty || 0);
    const unitPrice = Number(lineItem.unitPrice || 0);
    const lineTotal = qty * unitPrice;

    await createPurchase({
      vendorId: vendorId as any,
      currency,
      status: status as any,
      notes: notes || undefined,
      lineItems: [
        {
          catalogId: lineItem.catalogId,
          description: lineItem.description,
          qty,
          unit: lineItem.unit,
          unitPrice,
          lineTotal,
        },
      ],
    });

    setLineItem({ catalogId: "", description: "", qty: "1", unit: "", unitPrice: "" });
    setNotes("");
  };

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Purchases</h1>
          <p className="text-gray-500 text-sm">Procurement log that feeds price memory.</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm mb-8">
        <h3 className="font-semibold mb-4">Record Purchase</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 text-sm">
          <select
            className="border p-2 rounded bg-white"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            required
          >
            <option value="">Select Vendor</option>
            {vendors?.map((vendor) => (
              <option key={vendor._id} value={vendor._id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="NIS">NIS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="recorded">Recorded</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            className="border p-2 rounded"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <select
            className="border p-2 rounded bg-white col-span-2"
            value={lineItem.catalogId}
            onChange={(e) => setLineItem((prev) => ({ ...prev, catalogId: e.target.value }))}
            required
          >
            <option value="">Catalog Item</option>
            {catalog?.map((item) => (
              <option key={item._id} value={item._id}>
                {item.canonicalName}
              </option>
            ))}
          </select>
          <input
            className="border p-2 rounded col-span-2"
            placeholder="Line description (optional)"
            value={lineItem.description}
            onChange={(e) => setLineItem((prev) => ({ ...prev, description: e.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Qty"
            value={lineItem.qty}
            onChange={(e) => setLineItem((prev) => ({ ...prev, qty: e.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Unit (optional)"
            value={lineItem.unit}
            onChange={(e) => setLineItem((prev) => ({ ...prev, unit: e.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Unit Price"
            value={lineItem.unitPrice}
            onChange={(e) => setLineItem((prev) => ({ ...prev, unitPrice: e.target.value }))}
            required
          />
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white rounded font-semibold"
          >
            Save Purchase
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Vendor</th>
              <th className="p-4 font-semibold text-gray-600">Total</th>
              <th className="p-4 font-semibold text-gray-600">Status</th>
              <th className="p-4 font-semibold text-gray-600">Date</th>
            </tr>
          </thead>
          <tbody>
            {purchases?.map((purchase) => (
              <tr key={purchase._id} className="border-b">
                <td className="p-4">{vendors?.find((v) => v._id === purchase.vendorId)?.name ?? purchase.vendorId}</td>
                <td className="p-4 font-mono">{purchase.totalAmount} {purchase.currency}</td>
                <td className="p-4 text-xs uppercase text-gray-500">{purchase.status}</td>
                <td className="p-4 text-xs text-gray-500">{new Date(purchase.date).toLocaleDateString()}</td>
              </tr>
            ))}
            {purchases?.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">
                  No purchases recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
