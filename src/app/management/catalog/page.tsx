"use client"

import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useState } from 'react'
import { Plus, Search, Trash, X } from 'lucide-react'

type CatalogAttributeDef = {
  key: string
  labelHe: string
  type: "number" | "enum" | "boolean" | "text"
  unit?: string
  required?: boolean
  enumOptions?: { value: string; labelHe: string }[]
}

export default function CatalogPage() {
  const [search, setSearch] = useState('')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  
  // Template Form State
  const [templateForm, setTemplateForm] = useState({
    nameHe: '',
    categoryId: '',
    kind: 'material',
    defaultUomCode: 'ea',
    attributeDefs: [] as CatalogAttributeDef[]
  })

  // Variant Form State
  const [activeVariantTemplateId, setActiveVariantTemplateId] = useState<string | null>(null)
  const [variantForm, setVariantForm] = useState({
    labelHe: '',
    uomCode: '',
    attributes: {} as Record<string, any>,
    // Legacy/Convenience fields
    thicknessMm: '',
    widthMm: '',
    heightMm: '',
    lengthMm: '',
  })

  const templates = useQuery(api.management.searchTemplates, { query: search })
  const variants = useQuery(api.management.listVariantsAll)
  const categories = useQuery(api.management.listCategories)
  const uoms = useQuery(api.management.listUoms)
  const synonyms = useQuery(api.management.listSynonyms)

  const createTemplate = useMutation(api.management.createTemplate)
  const createVariant = useMutation(api.management.createVariant)
  const createCategory = useMutation(api.management.createCategory)
  const createUom = useMutation(api.management.createUom)
  const createSynonym = useMutation(api.management.createSynonym)

  // Sub-forms state
  const [categoryName, setCategoryName] = useState('')
  const [uomForm, setUomForm] = useState({ code: 'ea', labelHe: 'ea', baseDimension: 'count', toBaseFactor: '1' })
  const [synonymForm, setSynonymForm] = useState({ phrase: '', templateId: '', boost: '', notesHe: '' })
  const [error, setError] = useState('')

  // --- Template Form Logic ---

  const handleAddAttributeDef = () => {
    setTemplateForm({
      ...templateForm,
      attributeDefs: [
        ...templateForm.attributeDefs,
        { key: '', labelHe: '', type: 'text', required: false }
      ]
    })
  }

  const handleRemoveAttributeDef = (index: number) => {
    const next = [...templateForm.attributeDefs]
    next.splice(index, 1)
    setTemplateForm({ ...templateForm, attributeDefs: next })
  }

  const updateAttributeDef = (index: number, field: keyof CatalogAttributeDef, value: any) => {
    const next = [...templateForm.attributeDefs]
    next[index] = { ...next[index], [field]: value }
    setTemplateForm({ ...templateForm, attributeDefs: next })
  }

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await createTemplate({
        nameHe: templateForm.nameHe,
        categoryId: templateForm.categoryId ? (templateForm.categoryId as any) : undefined,
        kind: templateForm.kind as any,
        defaultUomCode: templateForm.defaultUomCode as any,
        attributeDefs: templateForm.attributeDefs,
      })
      setTemplateForm({ nameHe: '', categoryId: '', kind: 'material', defaultUomCode: 'ea', attributeDefs: [] })
      setShowTemplateForm(false)
    } catch (err: any) {
      setError(err.message)
    }
  }

  // --- Variant Form Logic ---

  const openVariantForm = (templateId: string) => {
    setActiveVariantTemplateId(templateId)
    setVariantForm({ labelHe: '', uomCode: '', attributes: {}, thicknessMm: '', widthMm: '', heightMm: '', lengthMm: '' })
  }

  const handleCreateVariant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeVariantTemplateId) return
    setError('')
    
    // Auto-fill convenience fields if they exist in attributes
    // This supports the legacy/fast filtering columns in DB
    const thickness = variantForm.attributes.thicknessMm || variantForm.thicknessMm
    const width = variantForm.attributes.widthMm || variantForm.widthMm
    const height = variantForm.attributes.heightMm || variantForm.heightMm
    const length = variantForm.attributes.lengthMm || variantForm.lengthMm

    try {
      await createVariant({
        templateId: activeVariantTemplateId as any,
        labelHe: variantForm.labelHe,
        attributes: variantForm.attributes,
        uomCode: variantForm.uomCode ? (variantForm.uomCode as any) : undefined,
        thicknessMm: thickness ? Number(thickness) : undefined,
        widthMm: width ? Number(width) : undefined,
        heightMm: height ? Number(height) : undefined,
        lengthMm: length ? Number(length) : undefined,
      })
      openVariantForm(activeVariantTemplateId) // Reset form but keep open
    } catch (err: any) {
      setError(err.message)
    }
  }

  // --- Sub Forms Logic ---

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryName.trim()) return
    await createCategory({ nameHe: categoryName.trim() })
    setCategoryName('')
  }

  const handleCreateUom = async (e: React.FormEvent) => {
    e.preventDefault()
    await createUom({
      code: uomForm.code as any,
      labelHe: uomForm.labelHe,
      baseDimension: uomForm.baseDimension as any,
      toBaseFactor: Number(uomForm.toBaseFactor || 1),
    })
    setUomForm({ code: 'ea', labelHe: 'ea', baseDimension: 'count', toBaseFactor: '1' })
  }

  const handleCreateSynonym = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!synonymForm.phrase.trim() || !synonymForm.templateId) return
    await createSynonym({
      phrase: synonymForm.phrase.trim(),
      templateId: synonymForm.templateId as any,
      boost: synonymForm.boost ? Number(synonymForm.boost) : undefined,
      notesHe: synonymForm.notesHe || undefined,
    })
    setSynonymForm({ phrase: '', templateId: '', boost: '', notesHe: '' })
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Catalog Templates</h1>
          <p className="text-gray-500">Manage item types, SKUs, and normalization rules.</p>
        </div>
        <button
          onClick={() => setShowTemplateForm(!showTemplateForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus size={18} /> Add Template
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm border border-red-100">
          {error}
        </div>
      )}

      {/* --- CREATE TEMPLATE FORM --- */}
      {showTemplateForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
          <h3 className="font-bold text-lg mb-4 text-gray-800">New Template</h3>
          <form onSubmit={handleCreateTemplate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name (Hebrew)</label>
                <input
                  className="w-full border border-gray-300 p-2 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={templateForm.nameHe}
                  onChange={(e) => setTemplateForm({ ...templateForm, nameHe: e.target.value })}
                  required
                  placeholder="e.g. לביד בירץ׳"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded-md bg-white"
                  value={templateForm.categoryId}
                  onChange={(e) => setTemplateForm({ ...templateForm, categoryId: e.target.value })}
                >
                  <option value="">Uncategorized</option>
                  {categories?.map((cat) => (
                    <option key={cat._id} value={cat._id}>{cat.nameHe}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kind</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded-md bg-white"
                  value={templateForm.kind}
                  onChange={(e) => setTemplateForm({ ...templateForm, kind: e.target.value })}
                >
                  <option value="material">Material</option>
                  <option value="print_service">Print Service</option>
                  <option value="cut_service">Cut Service</option>
                  <option value="rental">Rental</option>
                  <option value="shipping">Shipping</option>
                  <option value="other_service">Other Service</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Default Unit</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded-md bg-white"
                  value={templateForm.defaultUomCode}
                  onChange={(e) => setTemplateForm({ ...templateForm, defaultUomCode: e.target.value })}
                >
                  {uoms?.map((uom) => (
                    <option key={uom._id} value={uom.code}>{uom.labelHe} ({uom.code})</option>
                  ))}
                  {!uoms?.length && <option value="ea">ea</option>}
                </select>
              </div>
            </div>

            {/* Attribute Builder */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-gray-700">Attributes Definition</label>
                <button
                  type="button"
                  onClick={handleAddAttributeDef}
                  className="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-1"
                >
                  <Plus size={12} /> Add Field
                </button>
              </div>
              
              {templateForm.attributeDefs.length === 0 && (
                <p className="text-sm text-gray-400 italic text-center py-2">No attributes defined yet.</p>
              )}

              <div className="space-y-2">
                {templateForm.attributeDefs.map((def, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <input
                      placeholder="Key (e.g. thicknessMm)"
                      className="flex-1 border p-1.5 rounded text-sm"
                      value={def.key}
                      onChange={(e) => updateAttributeDef(idx, 'key', e.target.value)}
                    />
                    <input
                      placeholder="Label (e.g. עובי)"
                      className="flex-1 border p-1.5 rounded text-sm"
                      value={def.labelHe}
                      onChange={(e) => updateAttributeDef(idx, 'labelHe', e.target.value)}
                    />
                    <select
                      className="w-24 border p-1.5 rounded text-sm bg-white"
                      value={def.type}
                      onChange={(e) => updateAttributeDef(idx, 'type', e.target.value)}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Bool</option>
                      <option value="enum">Enum</option>
                    </select>
                    <input
                      placeholder="Unit"
                      className="w-16 border p-1.5 rounded text-sm"
                      value={def.unit || ''}
                      onChange={(e) => updateAttributeDef(idx, 'unit', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveAttributeDef(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowTemplateForm(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm"
              >
                Create Template
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- TEMPLATES GRID --- */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Search templates..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {templates?.map((template) => {
          const templateVariants = variants?.filter((v) => v.templateId === template._id) ?? []
          const isActive = activeVariantTemplateId === template._id

          return (
            <div key={template._id} className={`bg-white border rounded-xl transition-shadow ${isActive ? 'ring-2 ring-blue-500 shadow-md' : 'shadow-sm hover:shadow-md'}`}>
              <div className="p-5 border-b border-gray-100 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{template.nameHe}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">{template.kind}</span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">{template.defaultUomCode}</span>
                  </div>
                </div>
                <button
                  onClick={() => isActive ? setActiveVariantTemplateId(null) : openVariantForm(template._id)}
                  className={`text-sm px-3 py-1.5 rounded font-medium transition-colors ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                >
                  {isActive ? 'Close Form' : 'Add Variant'}
                </button>
              </div>

              {/* Variant List */}
              <div className="p-5 bg-gray-50/50">
                {templateVariants.length > 0 ? (
                  <div className="space-y-2">
                    {templateVariants.map((variant) => (
                      <div key={variant._id} className="bg-white border rounded-lg px-3 py-2 flex justify-between items-center group">
                        <div>
                          <p className="font-medium text-sm text-gray-800">{variant.labelHe}</p>
                          <p className="text-xs text-gray-500 font-mono mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {Object.entries(variant.attributes).map(([k, v]) => `${k}:${v}`).join(', ')}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border">
                          {variant.uomCode ?? template.defaultUomCode}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No variants yet.</p>
                )}
              </div>

              {/* Variant Creation Form */}
              {isActive && (
                <div className="p-5 border-t border-gray-200 bg-white rounded-b-xl">
                  <h4 className="font-semibold text-sm mb-3 text-gray-800">New Variant</h4>
                  <form onSubmit={handleCreateVariant} className="space-y-3">
                    <input
                      placeholder="Variant Label (e.g. 17mm Standard)"
                      className="w-full border p-2 rounded text-sm"
                      value={variantForm.labelHe}
                      onChange={(e) => setVariantForm({ ...variantForm, labelHe: e.target.value })}
                      required
                    />
                    
                    {/* Dynamic Inputs */}
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded border border-gray-100">
                      {template.attributeDefs?.length ? (
                        (template.attributeDefs as CatalogAttributeDef[]).map((def) => (
                          <div key={def.key} className="flex flex-col">
                            <label className="text-xs font-medium text-gray-600 mb-1">
                              {def.labelHe} {def.unit && <span className="opacity-50">({def.unit})</span>}
                            </label>
                            {def.type === 'boolean' ? (
                              <select
                                className="border p-1.5 rounded text-sm bg-white"
                                value={variantForm.attributes[def.key] !== undefined ? String(variantForm.attributes[def.key]) : ''}
                                onChange={(e) => setVariantForm({
                                  ...variantForm,
                                  attributes: { ...variantForm.attributes, [def.key]: e.target.value === 'true' }
                                })}
                              >
                                <option value="">-</option>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </select>
                            ) : (
                              <input
                                type={def.type === 'number' ? 'number' : 'text'}
                                className="border p-1.5 rounded text-sm"
                                placeholder={def.key}
                                value={variantForm.attributes[def.key] ?? ''}
                                onChange={(e) => setVariantForm({
                                  ...variantForm,
                                  attributes: { ...variantForm.attributes, [def.key]: def.type === 'number' ? Number(e.target.value) : e.target.value }
                                })}
                              />
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="col-span-2 text-xs text-gray-400 italic">No attributes defined for this template.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <select
                        className="border p-2 rounded text-sm bg-white flex-1"
                        value={variantForm.uomCode}
                        onChange={(e) => setVariantForm({ ...variantForm, uomCode: e.target.value })}
                      >
                        <option value="">Default Unit ({template.defaultUomCode})</option>
                        {uoms?.map((uom) => (
                          <option key={uom._id} value={uom.code}>{uom.labelHe}</option>
                        ))}
                      </select>
                      <button type="submit" className="px-4 py-2 bg-black text-white rounded text-sm font-medium hover:bg-gray-800">
                        Save Variant
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Categories */}
        <div className="bg-white border rounded-xl p-5 shadow-sm h-fit">
          <h2 className="font-bold text-gray-800 mb-4">Categories</h2>
          <form onSubmit={handleCreateCategory} className="flex gap-2 mb-4">
            <input
              className="border p-2 rounded text-sm flex-1"
              placeholder="New Category..."
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
            <button type="submit" className="bg-gray-900 text-white px-3 rounded text-sm"><Plus size={16} /></button>
          </form>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {categories?.map((c) => (
              <div key={c._id} className="text-sm border px-3 py-2 rounded bg-gray-50 text-gray-700">
                {c.nameHe}
              </div>
            ))}
          </div>
        </div>

        {/* UOMs */}
        <div className="bg-white border rounded-xl p-5 shadow-sm h-fit">
          <h2 className="font-bold text-gray-800 mb-4">Units (UOM)</h2>
          <form onSubmit={handleCreateUom} className="space-y-2 mb-4">
            <div className="flex gap-2">
              <input className="border p-2 rounded text-sm flex-1" placeholder="Code (e.g. kg)" value={uomForm.code} onChange={e => setUomForm({...uomForm, code: e.target.value})} />
              <input className="border p-2 rounded text-sm flex-1" placeholder="Label (e.g. ק״ג)" value={uomForm.labelHe} onChange={e => setUomForm({...uomForm, labelHe: e.target.value})} />
            </div>
            <div className="flex gap-2">
              <select className="border p-2 rounded text-sm flex-1 bg-white" value={uomForm.baseDimension} onChange={e => setUomForm({...uomForm, baseDimension: e.target.value})}>
                <option value="count">Count</option>
                <option value="length">Length</option>
                <option value="area">Area</option>
                <option value="volume">Volume</option>
                <option value="weight">Weight</option>
              </select>
              <button type="submit" className="bg-gray-900 text-white px-4 rounded text-sm">Add</button>
            </div>
          </form>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {uoms?.map((u) => (
              <div key={u._id} className="text-sm border px-3 py-2 rounded bg-gray-50 flex justify-between">
                <span className="font-medium">{u.labelHe}</span>
                <span className="text-gray-500 font-mono text-xs">{u.code}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Synonyms */}
        <div className="bg-white border rounded-xl p-5 shadow-sm h-fit">
          <h2 className="font-bold text-gray-800 mb-4">Synonyms</h2>
          <form onSubmit={handleCreateSynonym} className="space-y-2 mb-4">
            <input className="border p-2 rounded text-sm w-full" placeholder="Phrase (e.g. פלטת עץ)" value={synonymForm.phrase} onChange={e => setSynonymForm({...synonymForm, phrase: e.target.value})} />
            <select className="border p-2 rounded text-sm w-full bg-white" value={synonymForm.templateId} onChange={e => setSynonymForm({...synonymForm, templateId: e.target.value})}>
              <option value="">Map to Template...</option>
              {templates?.map(t => <option key={t._id} value={t._id}>{t.nameHe}</option>)}
            </select>
            <button type="submit" className="bg-gray-900 text-white w-full py-2 rounded text-sm">Add Synonym</button>
          </form>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {synonyms?.map((s) => (
              <div key={s._id} className="text-sm border px-3 py-2 rounded bg-gray-50">
                <span className="font-medium text-gray-900">{s.phrase}</span>
                <span className="mx-2 text-gray-400">→</span>
                <span className="text-gray-600">
                  {templates?.find(t => t._id === s.templateId)?.nameHe ?? 'Unknown'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}