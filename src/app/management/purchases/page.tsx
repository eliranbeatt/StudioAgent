"use client"

import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useMemo, useState } from 'react'

type LineItemDraft = {
  templateId: string
  variantId: string
  description: string
  qty: string
  uomCode: string
  unitPrice: string
}

const emptyLineItem: LineItemDraft = {
  templateId: '',
  variantId: '',
  description: '',
  qty: '1',
  uomCode: '',
  unitPrice: '',
}

export default function PurchasesPage() {
  const purchases = useQuery(api.management.listPurchases)
  const vendors = useQuery(api.management.listVendors)
  const templates = useQuery(api.management.searchTemplates, { query: '' })
  const variants = useQuery(api.management.listVariantsAll)
  const uoms = useQuery(api.management.listUoms)
  const createPurchase = useMutation(api.management.createPurchase)

  const [vendorId, setVendorId] = useState('')
  const [currency, setCurrency] = useState('NIS')
  const [status, setStatus] = useState('recorded')
  const [notes, setNotes] = useState('')
  const [lineItem, setLineItem] = useState<LineItemDraft>(emptyLineItem)

  const variantsForTemplate = useMemo(() => {
    if (!lineItem.templateId) return []
    return (variants ?? []).filter((variant) => variant.templateId === lineItem.templateId)
  }, [variants, lineItem.templateId])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!vendorId || (!lineItem.variantId && !lineItem.templateId) || !lineItem.unitPrice) return
    const qty = Number(lineItem.qty || 0)
    const unitPrice = Number(lineItem.unitPrice || 0)
    const lineTotal = qty * unitPrice

    await createPurchase({
      vendorId: vendorId as any,
      currency,
      status: status as any,
      notes: notes || undefined,
      lineItems: [
        {
          templateId: lineItem.templateId || undefined,
          variantId: lineItem.variantId || undefined,
          description: lineItem.description,
          qty,
          uomCode: lineItem.uomCode,
          unitPrice,
          lineTotal,
        },
      ],
    })

    setLineItem(emptyLineItem)
    setNotes('')
  }

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
            onChange={(event) => setVendorId(event.target.value)}
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
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="NIS">NIS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="recorded">Recorded</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            className="border p-2 rounded"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <select
            className="border p-2 rounded bg-white col-span-2"
            value={lineItem.templateId}
            onChange={(event) =>
              setLineItem((prev) => ({ ...prev, templateId: event.target.value, variantId: '' }))
            }
            required
          >
            <option value="">Template</option>
            {templates?.map((item) => (
              <option key={item._id} value={item._id}>
                {item.nameHe}
              </option>
            ))}
          </select>
          <select
            className="border p-2 rounded bg-white col-span-2"
            value={lineItem.variantId}
            onChange={(event) => setLineItem((prev) => ({ ...prev, variantId: event.target.value }))}
          >
            <option value="">Variant (optional)</option>
            {variantsForTemplate.map((variant) => (
              <option key={variant._id} value={variant._id}>
                {variant.labelHe}
              </option>
            ))}
          </select>
          <input
            className="border p-2 rounded col-span-2"
            placeholder="Line description (optional)"
            value={lineItem.description}
            onChange={(event) => setLineItem((prev) => ({ ...prev, description: event.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Qty"
            value={lineItem.qty}
            onChange={(event) => setLineItem((prev) => ({ ...prev, qty: event.target.value }))}
          />
          <select
            className="border p-2 rounded bg-white"
            value={lineItem.uomCode}
            onChange={(event) => setLineItem((prev) => ({ ...prev, uomCode: event.target.value }))}
          >
            <option value="">UOM</option>
            {uoms?.map((uom) => (
              <option key={uom._id} value={uom.code}>
                {uom.labelHe} ({uom.code})
              </option>
            ))}
            {!uoms?.length && (
              <>
                <option value="ea">ea</option>
                <option value="sheet">sheet</option>
                <option value="m">m</option>
                <option value="m2">m2</option>
                <option value="kg">kg</option>
                <option value="l">l</option>
              </>
            )}
          </select>
          <input
            className="border p-2 rounded"
            placeholder="Unit Price"
            value={lineItem.unitPrice}
            onChange={(event) => setLineItem((prev) => ({ ...prev, unitPrice: event.target.value }))}
            required
          />
          <button type="submit" className="px-4 py-2 bg-black text-white rounded font-semibold">
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
                <td className="p-4">
                  {vendors?.find((vendor) => vendor._id === purchase.vendorId)?.name ?? purchase.vendorId}
                </td>
                <td className="p-4 font-mono">
                  {purchase.totalAmount} {purchase.currency}
                </td>
                <td className="p-4 text-xs uppercase text-gray-500">{purchase.status}</td>
                <td className="p-4 text-xs text-gray-500">
                  {new Date(purchase.date).toLocaleDateString()}
                </td>
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
  )
}
