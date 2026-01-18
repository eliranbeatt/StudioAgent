"use client"

import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useState } from 'react'
import { Plus, Search, MapPin, Package } from 'lucide-react'

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  
  const items = useQuery(api.inventory.listInventoryItems)
  const templates = useQuery(api.management.searchTemplates, { query: '' })
  const variants = useQuery(api.management.listVariantsAll)
  const createItem = useMutation(api.inventory.createInventoryItem)
  const updateStock = useMutation(api.inventory.updateInventoryStock)

  const [newItem, setNewItem] = useState({
    name: '',
    templateId: '',
    variantId: '',
    uomCode: 'ea',
    initialQty: 0,
    location: '',
    notes: ''
  })

  // Filter items
  const filteredItems = items?.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.location?.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await createItem({
        name: newItem.name,
        templateId: newItem.templateId ? newItem.templateId as any : undefined,
        variantId: newItem.variantId ? newItem.variantId as any : undefined,
        uomCode: newItem.uomCode as any,
        initialQty: Number(newItem.initialQty),
        location: newItem.location || undefined,
        notes: newItem.notes || undefined
    })
    setNewItem({ name: '', templateId: '', variantId: '', uomCode: 'ea', initialQty: 0, location: '', notes: '' })
    setShowAddForm(false)
  }

  const handleUpdateStock = async (id: string, currentQty: number) => {
    const newQty = prompt("Enter new quantity:", String(currentQty))
    if (newQty !== null && !isNaN(Number(newQty))) {
        await updateStock({
            inventoryItemId: id as any,
            newQty: Number(newQty)
        })
    }
  }

  // Helper to filter variants based on selected template
  const availableVariants = variants?.filter(v => v.templateId === newItem.templateId) || []

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500">Track stock levels and locations.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus size={18} /> Add Item
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
            <h3 className="font-bold text-lg mb-4 text-gray-800">New Inventory Item</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Item Name</label>
                    <input className="w-full border p-2 rounded" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Link to Template (Optional)</label>
                    <select 
                        className="w-full border p-2 rounded bg-white" 
                        value={newItem.templateId} 
                        onChange={e => setNewItem({...newItem, templateId: e.target.value, variantId: ''})}
                    >
                        <option value="">None</option>
                        {templates?.map(t => <option key={t._id} value={t._id}>{t.nameHe}</option>)}
                    </select>
                </div>
                {newItem.templateId && (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Link to Variant (Optional)</label>
                        <select 
                            className="w-full border p-2 rounded bg-white" 
                            value={newItem.variantId} 
                            onChange={e => setNewItem({...newItem, variantId: e.target.value})}
                        >
                            <option value="">None</option>
                            {availableVariants.map(v => <option key={v._id} value={v._id}>{v.labelHe}</option>)}
                        </select>
                    </div>
                )}
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Unit (UOM)</label>
                    <select className="w-full border p-2 rounded bg-white" value={newItem.uomCode} onChange={e => setNewItem({...newItem, uomCode: e.target.value})}>
                        <option value="ea">ea</option>
                        <option value="sheet">sheet</option>
                        <option value="m">m</option>
                        <option value="m2">m2</option>
                        <option value="kg">kg</option>
                        <option value="l">l</option>
                        <option value="pack">pack</option>
                        <option value="box">box</option>
                        <option value="roll">roll</option>
                        <option value="set">set</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Initial Qty</label>
                    <input type="number" className="w-full border p-2 rounded" value={newItem.initialQty} onChange={e => setNewItem({...newItem, initialQty: Number(e.target.value)})} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                    <input className="w-full border p-2 rounded" placeholder="Shelf A1..." value={newItem.location} onChange={e => setNewItem({...newItem, location: e.target.value})} />
                </div>
                <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                    <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg">Create</button>
                </div>
            </form>
        </div>
      )}

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Search inventory..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
                <tr>
                    <th className="p-4 font-semibold text-gray-600">Item</th>
                    <th className="p-4 font-semibold text-gray-600">Location</th>
                    <th className="p-4 font-semibold text-gray-600 text-right">On Hand</th>
                    <th className="p-4 font-semibold text-gray-600 text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                {filteredItems?.map(item => (
                    <tr key={item._id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="p-4">
                            <div className="font-medium text-gray-900">{item.name}</div>
                            {item.notes && <div className="text-xs text-gray-500">{item.notes}</div>}
                        </td>
                        <td className="p-4">
                            <div className="flex items-center gap-1 text-gray-600">
                                {item.location ? <><MapPin size={14} /> {item.location}</> : <span className="text-gray-400">-</span>}
                            </div>
                        </td>
                        <td className="p-4 text-right">
                            <span className={`font-mono font-medium ${item.onHandQty <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {item.onHandQty} <span className="text-xs text-gray-400">{item.uomCode}</span>
                            </span>
                        </td>
                        <td className="p-4 text-right">
                            <button 
                                onClick={() => handleUpdateStock(item._id, item.onHandQty)}
                                className="text-sm bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-3 py-1 rounded shadow-sm"
                            >
                                Adjust
                            </button>
                        </td>
                    </tr>
                ))}
                {filteredItems?.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500 flex flex-col items-center justify-center gap-2">
                        <Package size={32} className="opacity-20" />
                        No items found.
                    </td></tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  )
}
