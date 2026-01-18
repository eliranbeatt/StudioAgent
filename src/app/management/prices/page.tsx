"use client"

import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useMemo, useState } from 'react'

type PriceFormState = {
  templateId: string
  variantId: string
  vendorId: string
  amount: string
  currency: string
  pricingModel: string
  sourceType: string
  url: string
  title: string
  rawSnippet: string
}

const emptyForm: PriceFormState = {
  templateId: '',
  variantId: '',
  vendorId: '',
  amount: '',
  currency: 'NIS',
  pricingModel: 'per_unit',
  sourceType: 'manual',
  url: '',
  title: '',
  rawSnippet: '',
}

export default function PricesPage() {
  const priceRecords = useQuery(api.management.listPriceRecords)
  const vendors = useQuery(api.management.listVendors)
  const templates = useQuery(api.management.searchTemplates, { query: '' })
  const variants = useQuery(api.management.listVariantsAll)
  const createPriceRecord = useMutation(api.management.createPriceRecord)
  const pricingFormulas = useQuery(api.management.listPricingFormulas)
  const createPricingFormula = useMutation(api.management.createPricingFormula)

  const [form, setForm] = useState<PriceFormState>(emptyForm)
  const [formulaForm, setFormulaForm] = useState({
    templateId: '',
    vendorId: '',
    formulaType: 'print_m2',
    paramsJson: '',
    currency: 'NIS',
    sourceType: 'manual',
    evidenceUrl: '',
    notesHe: '',
  })
  const [priceError, setPriceError] = useState('')
  const [formulaError, setFormulaError] = useState('')

  const variantsForTemplate = useMemo(() => {
    if (!form.templateId) return []
    return (variants ?? []).filter((variant) => variant.templateId === form.templateId)
  }, [variants, form.templateId])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPriceError('')
    if (!form.amount || (!form.variantId && !form.templateId)) return
    if (form.sourceType === 'web' && !form.url && !form.title && !form.rawSnippet) {
      setPriceError('Web prices require url, title, or snippet')
      return
    }
    await createPriceRecord({
      templateId: form.templateId ? (form.templateId as any) : undefined,
      variantId: form.variantId ? (form.variantId as any) : undefined,
      vendorId: form.vendorId ? (form.vendorId as any) : undefined,
      amount: Number(form.amount),
      currency: form.currency,
      pricingModel: form.pricingModel as any,
      source: form.sourceType as any,
      url: form.url || undefined,
      title: form.title || undefined,
      rawSnippet: form.rawSnippet || undefined,
    })
    setForm(emptyForm)
  }

  const handleCreateFormula = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormulaError('')
    if (!formulaForm.templateId || !formulaForm.paramsJson.trim()) return
    if (formulaForm.sourceType === 'web' && !formulaForm.evidenceUrl.trim()) {
      setFormulaError('Web formulas require evidenceUrl')
      return
    }
    let params: any = null
    try {
      params = JSON.parse(formulaForm.paramsJson)
    } catch (err) {
      setFormulaError('Invalid params JSON')
      return
    }
    await createPricingFormula({
      templateId: formulaForm.templateId as any,
      vendorId: formulaForm.vendorId ? (formulaForm.vendorId as any) : undefined,
      formulaType: formulaForm.formulaType as any,
      params,
      currency: formulaForm.currency,
      sourceType: formulaForm.sourceType as any,
      evidenceUrl: formulaForm.evidenceUrl || undefined,
      notesHe: formulaForm.notesHe || undefined,
    })
    setFormulaForm({
      templateId: '',
      vendorId: '',
      formulaType: 'print_m2',
      paramsJson: '',
      currency: 'NIS',
      sourceType: 'manual',
      evidenceUrl: '',
      notesHe: '',
    })
  }

  const templateMap = new Map((templates ?? []).map((template) => [template._id, template]))
  const variantMap = new Map((variants ?? []).map((variant) => [variant._id, variant]))

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Price Records</h1>
          <p className="text-gray-500 text-sm">Unified price memory per variant.</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm mb-8">
        <h3 className="font-semibold mb-4">Add Price Record</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 text-sm">
          <select
            className="border p-2 rounded bg-white"
            value={form.templateId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, templateId: event.target.value, variantId: '' }))
            }
            required
          >
            <option value="">Select Template</option>
            {templates?.map((item) => (
              <option key={item._id} value={item._id}>
                {item.nameHe}
              </option>
            ))}
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={form.variantId}
            onChange={(event) => setForm((prev) => ({ ...prev, variantId: event.target.value }))}
          >
            <option value="">Variant (optional)</option>
            {variantsForTemplate.map((variant) => (
              <option key={variant._id} value={variant._id}>
                {variant.labelHe}
              </option>
            ))}
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={form.vendorId}
            onChange={(event) => setForm((prev) => ({ ...prev, vendorId: event.target.value }))}
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
            placeholder="Amount"
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            required
          />
          <select
            className="border p-2 rounded bg-white"
            value={form.pricingModel}
            onChange={(event) => setForm((prev) => ({ ...prev, pricingModel: event.target.value }))}
          >
            <option value="per_unit">Per unit</option>
            <option value="per_sheet">Per sheet</option>
            <option value="per_m">Per meter</option>
            <option value="per_m2">Per m2</option>
            <option value="per_pack">Per pack</option>
            <option value="tiered">Tiered</option>
            <option value="formula">Formula</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={form.sourceType}
            onChange={(event) => setForm((prev) => ({ ...prev, sourceType: event.target.value }))}
          >
            <option value="manual">Manual</option>
            <option value="purchase">Purchase</option>
            <option value="web">Web</option>
            <option value="quote">Quote</option>
            <option value="approvedElement">Approved element</option>
          </select>
          <input
            className="border p-2 rounded"
            placeholder="Evidence URL (optional)"
            value={form.url}
            onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Title (optional)"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <input
            className="border p-2 rounded col-span-2"
            placeholder="Snippet (optional)"
            value={form.rawSnippet}
            onChange={(event) => setForm((prev) => ({ ...prev, rawSnippet: event.target.value }))}
          />
          {priceError && <div className="text-xs text-red-600 col-span-2">{priceError}</div>}
          <button type="submit" className="px-4 py-2 bg-black text-white rounded font-semibold">
            Save Record
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm mb-8">
        <h3 className="font-semibold mb-4">Add Pricing Formula</h3>
        <form onSubmit={handleCreateFormula} className="grid grid-cols-2 gap-4 text-sm">
          <select
            className="border p-2 rounded bg-white"
            value={formulaForm.templateId}
            onChange={(event) => setFormulaForm((prev) => ({ ...prev, templateId: event.target.value }))}
            required
          >
            <option value="">Select Template</option>
            {templates?.map((item) => (
              <option key={item._id} value={item._id}>
                {item.nameHe}
              </option>
            ))}
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={formulaForm.vendorId}
            onChange={(event) => setFormulaForm((prev) => ({ ...prev, vendorId: event.target.value }))}
          >
            <option value="">Vendor (optional)</option>
            {vendors?.map((vendor) => (
              <option key={vendor._id} value={vendor._id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={formulaForm.formulaType}
            onChange={(event) => setFormulaForm((prev) => ({ ...prev, formulaType: event.target.value }))}
          >
            <option value="print_m2">Print per m2</option>
            <option value="cnc_cut">CNC cut</option>
            <option value="custom">Custom</option>
          </select>
          <select
            className="border p-2 rounded bg-white"
            value={formulaForm.sourceType}
            onChange={(event) => setFormulaForm((prev) => ({ ...prev, sourceType: event.target.value }))}
          >
            <option value="manual">Manual</option>
            <option value="purchase">Purchase</option>
            <option value="web">Web</option>
            <option value="quote">Quote</option>
            <option value="approvedElement">Approved element</option>
          </select>
          <textarea
            className="border p-2 rounded col-span-2 h-24"
            placeholder='Params JSON (e.g. {"baseRatePerM2":120,"minCharge":200})'
            value={formulaForm.paramsJson}
            onChange={(event) => setFormulaForm((prev) => ({ ...prev, paramsJson: event.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Evidence URL (optional)"
            value={formulaForm.evidenceUrl}
            onChange={(event) => setFormulaForm((prev) => ({ ...prev, evidenceUrl: event.target.value }))}
          />
          <input
            className="border p-2 rounded"
            placeholder="Notes (optional)"
            value={formulaForm.notesHe}
            onChange={(event) => setFormulaForm((prev) => ({ ...prev, notesHe: event.target.value }))}
          />
          {formulaError && <div className="text-xs text-red-600 col-span-2">{formulaError}</div>}
          <button type="submit" className="px-4 py-2 bg-black text-white rounded font-semibold">
            Save Formula
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-8">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Template</th>
              <th className="p-4 font-semibold text-gray-600">Vendor</th>
              <th className="p-4 font-semibold text-gray-600">Type</th>
              <th className="p-4 font-semibold text-gray-600">Source</th>
              <th className="p-4 font-semibold text-gray-600">Checked</th>
            </tr>
          </thead>
          <tbody>
            {pricingFormulas?.map((formula) => (
              <tr key={formula._id} className="border-b">
                <td className="p-4">
                  {templateMap.get(formula.templateId)?.nameHe ?? formula.templateId}
                </td>
                <td className="p-4">
                  {vendors?.find((vendor) => vendor._id === formula.vendorId)?.name ?? '-'}
                </td>
                <td className="p-4 text-xs uppercase text-gray-500">{formula.formulaType}</td>
                <td className="p-4 text-xs uppercase text-gray-500">{formula.sourceType}</td>
                <td className="p-4 text-xs text-gray-500">
                  {new Date(formula.checkedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {pricingFormulas?.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  No pricing formulas yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Template</th>
              <th className="p-4 font-semibold text-gray-600">Variant</th>
              <th className="p-4 font-semibold text-gray-600">Vendor</th>
              <th className="p-4 font-semibold text-gray-600">Amount</th>
              <th className="p-4 font-semibold text-gray-600">Source</th>
              <th className="p-4 font-semibold text-gray-600">Checked</th>
            </tr>
          </thead>
          <tbody>
            {priceRecords?.map((record) => (
              <tr key={record._id} className="border-b">
                <td className="p-4">
                  {record.templateId
                    ? templateMap.get(record.templateId)?.nameHe ?? record.templateId
                    : '-'}
                </td>
                <td className="p-4">
                  {record.variantId ? variantMap.get(record.variantId)?.labelHe ?? record.variantId : '-'}
                </td>
                <td className="p-4">
                  {vendors?.find((vendor) => vendor._id === record.vendorId)?.name ?? '-'}
                </td>
                <td className="p-4 font-mono">
                  {record.amount ?? '-'} {record.currency}
                </td>
                <td className="p-4 text-xs uppercase text-gray-500">{record.sourceType}</td>
                <td className="p-4 text-xs text-gray-500">
                  {new Date(record.checkedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {priceRecords?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  No price records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
