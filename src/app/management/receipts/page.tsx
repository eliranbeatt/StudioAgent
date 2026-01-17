"use client"

import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { Id } from '../../../../convex/_generated/dataModel'
import { useEffect, useMemo, useState } from 'react'

type ReceiptItemDraft = {
  nameRaw: string
  qty: string
  unit: string
  unitPrice: string
  total: string
  mappedDraftMaterialId?: string
  mappedDraftWorkId?: string
  mappedAccountingLineId?: Id<'accountingLines'>
  mappedMaterialLineId?: Id<'materialLines'>
  mappedWorkLineId?: Id<'workLines'>
}

export default function ManagementReceiptsPage() {
  const projects = useQuery(api.projects.list)
  const vendors = useQuery(api.management.listVendors)

  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const projectId = selectedProjectId as Id<'projects'>

  const receipts = useQuery(
    api.receipts.listByProject,
    selectedProjectId ? { projectId } : 'skip'
  )
  const files = useQuery(
    api.files.listProjectFiles,
    selectedProjectId ? { projectId } : 'skip'
  )
  const accounting = useQuery(
    api.financials.getAccountingView,
    selectedProjectId ? { projectId } : 'skip'
  )
  const lineOptions = useQuery(
    api.receipts.listLineOptions,
    selectedProjectId ? { projectId } : 'skip'
  )

  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const saveUploadedFile = useAction(api.filesActions.saveUploadedFile)

  const createReceipt = useMutation(api.receipts.createReceipt)
  const updateReceipt = useMutation(api.receipts.updateReceipt)
  const upsertReceiptItems = useMutation(api.receipts.upsertReceiptItems)
  const approveReceipt = useMutation(api.receipts.approveReceipt)
  const analyzeReceipt = useAction(api.receiptsActions.analyzeReceipt)

  const [selectedReceiptId, setSelectedReceiptId] = useState<Id<'receipts'> | null>(null)
  const selectedItems = useQuery(
    api.receipts.listItems,
    selectedReceiptId ? { receiptId: selectedReceiptId } : 'skip'
  )

  const [newReceipt, setNewReceipt] = useState({
    fileId: '',
    vendorId: '',
    date: '',
    total: '',
    currency: 'NIS',
  })

  const [receiptPatch, setReceiptPatch] = useState({
    vendorId: '',
    status: '',
    date: '',
    total: '',
    currency: '',
  })

  const [itemDrafts, setItemDrafts] = useState<ReceiptItemDraft[]>([])
  const [isSavingItems, setIsSavingItems] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [itemsSaveError, setItemsSaveError] = useState<string | null>(null)
  const [itemsSaveSuccess, setItemsSaveSuccess] = useState(false)

  const receiptsSorted = useMemo(() => {
    return (receipts ?? []).slice().sort((a, b) => {
      return (b.receipt.createdAt ?? 0) - (a.receipt.createdAt ?? 0)
    })
  }, [receipts])

  const draftMaterialOptions = useMemo(() => {
    if (!accounting) return []
    const options: Array<{ id: string; label: string }> = []
    accounting.elements.forEach((element: any) => {
      element.materials.forEach((line: any) => {
        options.push({
          id: line.id,
          label: `${element.title} / ${line.name}`,
        })
      })
    })
    if (accounting.projectCosts?.materials?.length) {
      accounting.projectCosts.materials.forEach((line: any) => {
        options.push({ id: line.id, label: `Project / ${line.name}` })
      })
    }
    return options
  }, [accounting])

  const draftWorkOptions = useMemo(() => {
    if (!accounting) return []
    const options: Array<{ id: string; label: string }> = []
    accounting.elements.forEach((element: any) => {
      element.labor.forEach((line: any) => {
        options.push({
          id: line.id,
          label: `${element.title} / ${line.role ?? line.title ?? 'Labor'}`,
        })
      })
    })
    if (accounting.projectCosts?.labor?.length) {
      accounting.projectCosts.labor.forEach((line: any) => {
        options.push({
          id: line.id,
          label: `Project / ${line.role ?? line.title ?? 'Labor'}`,
        })
      })
    }
    return options
  }, [accounting])

  const selectedReceipt = receiptsSorted.find(
    (entry) => entry.receipt._id === selectedReceiptId
  )

  useEffect(() => {
    if (!selectedReceipt) return
    setReceiptPatch({
      vendorId: selectedReceipt.receipt.vendorId ?? '',
      status: selectedReceipt.receipt.status ?? '',
      date: selectedReceipt.receipt.date ? formatDateInput(selectedReceipt.receipt.date) : '',
      total: selectedReceipt.receipt.total ? String(selectedReceipt.receipt.total) : '',
      currency: selectedReceipt.receipt.currency ?? '',
    })
  }, [selectedReceipt])

  useEffect(() => {
    if (!selectedItems) {
      setItemDrafts([])
      return
    }
    setItemDrafts(
      selectedItems.map((item) => ({
        nameRaw: item.nameRaw ?? '',
        qty: item.qty !== undefined ? String(item.qty) : '',
        unit: item.unit ?? '',
        unitPrice: item.unitPrice !== undefined ? String(item.unitPrice) : '',
        total: item.total !== undefined ? String(item.total) : '',
        mappedDraftMaterialId: item.mappedDraftMaterialId ?? undefined,
        mappedDraftWorkId: item.mappedDraftWorkId ?? undefined,
        mappedAccountingLineId: item.mappedAccountingLineId ?? undefined,
        mappedMaterialLineId: item.mappedMaterialLineId ?? undefined,
        mappedWorkLineId: item.mappedWorkLineId ?? undefined,
      }))
    )
  }, [selectedItems])

  useEffect(() => {
    setSelectedReceiptId(null)
  }, [selectedProjectId])

  const handleUploadFiles = async (filesToUpload: FileList | null) => {
    if (!filesToUpload || !selectedProjectId) {
      setUploadError('Select a project before uploading receipts.')
      return
    }
    setUploadError(null)
    for (const file of Array.from(filesToUpload)) {
      try {
        const uploadUrl = await generateUploadUrl({})
        const result = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!result.ok) {
          throw new Error(`Upload failed (${result.status})`)
        }
        const { storageId } = await result.json()
        const saved = await saveUploadedFile({
          projectId,
          storageId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        })
        if (saved?.fileId) {
          setNewReceipt((prev) => ({ ...prev, fileId: saved.fileId }))
        }
      } catch (error: any) {
        setUploadError(error?.message ?? 'Upload failed. Please try again.')
        break
      }
    }
  }

  const handleCreateReceipt = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newReceipt.fileId || !selectedProjectId) return
    const receiptId = await createReceipt({
      projectId,
      fileId: newReceipt.fileId as Id<'projectFiles'>,
      vendorId: newReceipt.vendorId ? (newReceipt.vendorId as Id<'vendors'>) : undefined,
    })
    const date = parseDateInput(newReceipt.date)
    const total = parseNumberInput(newReceipt.total)
    await updateReceipt({
      receiptId,
      vendorId: newReceipt.vendorId ? (newReceipt.vendorId as Id<'vendors'>) : undefined,
      date: date ?? undefined,
      total: total ?? undefined,
      currency: newReceipt.currency || undefined,
    })
    setNewReceipt({
      fileId: '',
      vendorId: '',
      date: '',
      total: '',
      currency: 'NIS',
    })
    setSelectedReceiptId(receiptId)
  }

  const handleSaveReceiptMeta = async () => {
    if (!selectedReceiptId) return
    const date = parseDateInput(receiptPatch.date)
    const total = parseNumberInput(receiptPatch.total)
    await updateReceipt({
      receiptId: selectedReceiptId,
      vendorId: receiptPatch.vendorId
        ? (receiptPatch.vendorId as Id<'vendors'>)
        : undefined,
      status: receiptPatch.status || undefined,
      date: date ?? undefined,
      total: total ?? undefined,
      currency: receiptPatch.currency || undefined,
    })
  }

  const handleSaveItems = async () => {
    if (!selectedReceiptId) return
    if (itemDrafts.length === 0) {
      setItemsSaveError('Add at least one line item before saving.')
      return
    }
    setIsSavingItems(true)
    setItemsSaveError(null)
    setItemsSaveSuccess(false)
    try {
      await upsertReceiptItems({
        receiptId: selectedReceiptId,
        items: itemDrafts.map((draft) => {
          const qty = parseNumberInput(draft.qty)
          const unitPrice = parseNumberInput(draft.unitPrice)
          const total = parseNumberInput(draft.total)
          return {
            nameRaw: draft.nameRaw.trim() || 'Item',
            qty: qty ?? undefined,
            unit: draft.unit || undefined,
            unitPrice: unitPrice ?? undefined,
            total: total ?? (qty !== null && unitPrice !== null ? qty * unitPrice : undefined),
            mappedDraftMaterialId: draft.mappedDraftMaterialId,
            mappedDraftWorkId: draft.mappedDraftWorkId,
            mappedAccountingLineId: draft.mappedAccountingLineId,
            mappedMaterialLineId: draft.mappedMaterialLineId,
            mappedWorkLineId: draft.mappedWorkLineId,
          }
        }),
      })
      setItemsSaveSuccess(true)
    } catch (error: any) {
      setItemsSaveError(error?.message ?? 'Failed to save items.')
    } finally {
      setIsSavingItems(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedReceiptId) return
    setIsApproving(true)
    try {
      await approveReceipt({ receiptId: selectedReceiptId })
    } finally {
      setIsApproving(false)
    }
  }

  const handleAnalyze = async () => {
    if (!selectedReceiptId) return
    setIsAnalyzing(true)
    try {
      await analyzeReceipt({ receiptId: selectedReceiptId })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const addItemDraft = () => {
    setItemDrafts((prev) => [
      ...prev,
      {
        nameRaw: '',
        qty: '',
        unit: '',
        unitPrice: '',
        total: '',
      },
    ])
  }

  const updateItemDraft = (index: number, patch: Partial<ReceiptItemDraft>) => {
    setItemDrafts((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    )
  }

  const removeItemDraft = (index: number) => {
    setItemDrafts((prev) => prev.filter((_, idx) => idx !== index))
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Receipts</h1>
          <p className="text-sm text-gray-500">
            Upload receipts, extract data, and map to accounting lines.
          </p>
        </div>
        <select
          className="border border-gray-200 rounded px-3 py-2 text-sm"
          value={selectedProjectId}
          onChange={(event) => setSelectedProjectId(event.target.value)}
        >
          <option value="">Select project</option>
          {(projects ?? []).map((project) => (
            <option key={project._id} value={project._id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedProjectId ? (
        <div className="text-sm text-gray-500">Select a project to manage receipts.</div>
      ) : (
        <>
          <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Upload receipt</h2>
              <label className="text-xs font-semibold text-gray-600 cursor-pointer">
                Upload files
                <input
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(event) => handleUploadFiles(event.target.files)}
                />
              </label>
            </div>
            {uploadError ? (
              <div className="mb-3 text-xs text-red-600">{uploadError}</div>
            ) : null}
            <form className="grid grid-cols-1 md:grid-cols-5 gap-3" onSubmit={handleCreateReceipt}>
              <select
                className="border border-gray-200 rounded px-3 py-2 text-sm"
                value={newReceipt.fileId}
                onChange={(event) =>
                  setNewReceipt((prev) => ({ ...prev, fileId: event.target.value }))
                }
              >
                <option value="">Select file</option>
                {(files ?? []).map((file) => (
                  <option key={file._id} value={file._id}>
                    {file.fileName}
                  </option>
                ))}
              </select>
              <select
                className="border border-gray-200 rounded px-3 py-2 text-sm"
                value={newReceipt.vendorId}
                onChange={(event) =>
                  setNewReceipt((prev) => ({ ...prev, vendorId: event.target.value }))
                }
              >
                <option value="">Vendor (optional)</option>
                {(vendors ?? []).map((vendor) => (
                  <option key={vendor._id} value={vendor._id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="border border-gray-200 rounded px-3 py-2 text-sm"
                value={newReceipt.date}
                onChange={(event) =>
                  setNewReceipt((prev) => ({ ...prev, date: event.target.value }))
                }
              />
              <input
                type="number"
                className="border border-gray-200 rounded px-3 py-2 text-sm"
                placeholder="Total"
                value={newReceipt.total}
                onChange={(event) =>
                  setNewReceipt((prev) => ({ ...prev, total: event.target.value }))
                }
              />
              <div className="flex gap-2">
                <input
                  className="border border-gray-200 rounded px-3 py-2 text-sm w-24"
                  value={newReceipt.currency}
                  onChange={(event) =>
                    setNewReceipt((prev) => ({ ...prev, currency: event.target.value }))
                  }
                />
                <button
                  type="submit"
                  className="bg-black text-white px-4 py-2 rounded text-sm font-semibold"
                >
                  Create
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
            <div className="bg-white border border-gray-100 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Receipts</h2>
              {receiptsSorted.length === 0 ? (
                <div className="text-sm text-gray-500">No receipts yet.</div>
              ) : (
                <div className="space-y-3">
                  {receiptsSorted.map(({ receipt, vendor, file }) => {
                    const isActive = receipt._id === selectedReceiptId
                    return (
                      <button
                        key={receipt._id}
                        className={`w-full text-left border rounded-lg px-4 py-3 transition ${
                          isActive ? 'border-black bg-gray-50' : 'border-gray-100 hover:border-gray-200'
                        }`}
                        onClick={() => setSelectedReceiptId(receipt._id)}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="font-semibold text-gray-900">
                            {file?.fileName ?? 'Receipt'}
                          </div>
                          <span className="text-xs text-gray-500">
                            {receipt.status ?? 'uploaded'}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {vendor?.name ?? 'No vendor'} -
                          {receipt.total ? `${receipt.total} ${receipt.currency ?? ''}` : 'No total'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Receipt details</h2>
              {!selectedReceipt ? (
                <div className="text-sm text-gray-500">Select a receipt to edit.</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <select
                      className="border border-gray-200 rounded px-3 py-2 text-sm"
                      value={receiptPatch.vendorId}
                      onChange={(event) =>
                        setReceiptPatch((prev) => ({ ...prev, vendorId: event.target.value }))
                      }
                    >
                      <option value="">Vendor</option>
                      {(vendors ?? []).map((vendor) => (
                        <option key={vendor._id} value={vendor._id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="border border-gray-200 rounded px-3 py-2 text-sm"
                      value={receiptPatch.status}
                      onChange={(event) =>
                        setReceiptPatch((prev) => ({ ...prev, status: event.target.value }))
                      }
                    >
                      <option value="">Status</option>
                      <option value="uploaded">uploaded</option>
                      <option value="extracted">extracted</option>
                      <option value="reviewed">reviewed</option>
                      <option value="approved">approved</option>
                    </select>
                    <input
                      type="date"
                      className="border border-gray-200 rounded px-3 py-2 text-sm"
                      value={receiptPatch.date}
                      onChange={(event) =>
                        setReceiptPatch((prev) => ({ ...prev, date: event.target.value }))
                      }
                    />
                    <input
                      type="number"
                      className="border border-gray-200 rounded px-3 py-2 text-sm"
                      placeholder="Total"
                      value={receiptPatch.total}
                      onChange={(event) =>
                        setReceiptPatch((prev) => ({ ...prev, total: event.target.value }))
                      }
                    />
                    <div className="flex gap-2">
                      <input
                        className="border border-gray-200 rounded px-3 py-2 text-sm w-24"
                        value={receiptPatch.currency}
                        onChange={(event) =>
                          setReceiptPatch((prev) => ({ ...prev, currency: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="bg-gray-900 text-white px-3 py-2 rounded text-sm font-semibold"
                        onClick={handleSaveReceiptMeta}
                      >
                        Save
                      </button>
                    </div>
                  </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    className="border border-gray-200 px-3 py-2 rounded text-sm font-semibold disabled:opacity-60"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Analyze receipt'}
                  </button>
                  <button
                    type="button"
                    className="border border-gray-200 px-3 py-2 rounded text-sm font-semibold disabled:opacity-60"
                    onClick={handleApprove}
                    disabled={isApproving}
                  >
                    {isApproving ? 'Approving...' : 'Approve + apply actuals'}
                  </button>
                </div>

                {selectedReceipt.receipt.extraction ? (
                  <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Extraction
                    </div>
                    <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">
                      {JSON.stringify(selectedReceipt.receipt.extraction, null, 2)}
                    </pre>
                  </div>
                ) : null}

                <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">Line items</h3>
                      <button
                        type="button"
                        onClick={addItemDraft}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                      >
                        + Add item
                      </button>
                    </div>
                    {itemDrafts.length === 0 ? (
                      <div className="text-xs text-gray-500">No items yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {itemDrafts.map((item, index) => (
                          <div key={`item-${index}`} className="border border-gray-100 rounded-lg p-3">
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                              <input
                                className="border border-gray-200 rounded px-2 py-1 text-xs md:col-span-2"
                                placeholder="Item name"
                                value={item.nameRaw}
                                onChange={(event) =>
                                  updateItemDraft(index, { nameRaw: event.target.value })
                                }
                              />
                              <input
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                placeholder="Qty"
                                value={item.qty}
                                onChange={(event) =>
                                  updateItemDraft(index, { qty: event.target.value })
                                }
                              />
                              <input
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                placeholder="Unit"
                                value={item.unit}
                                onChange={(event) =>
                                  updateItemDraft(index, { unit: event.target.value })
                                }
                              />
                              <input
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                placeholder="Unit price"
                                value={item.unitPrice}
                                onChange={(event) =>
                                  updateItemDraft(index, { unitPrice: event.target.value })
                                }
                              />
                              <input
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                placeholder="Total"
                                value={item.total}
                                onChange={(event) =>
                                  updateItemDraft(index, { total: event.target.value })
                                }
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_2fr_2fr_2fr_auto] gap-2 mt-2">
                              <select
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                value={item.mappedDraftMaterialId ?? ''}
                                onChange={(event) =>
                                  updateItemDraft(index, {
                                    mappedDraftMaterialId: event.target.value || undefined,
                                  })
                                }
                              >
                                <option value="">Map material</option>
                                {draftMaterialOptions.map((line) => (
                                  <option key={line.id} value={line.id}>
                                    {line.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                value={item.mappedDraftWorkId ?? ''}
                                onChange={(event) =>
                                  updateItemDraft(index, {
                                    mappedDraftWorkId: event.target.value || undefined,
                                  })
                                }
                              >
                                <option value="">Map labor</option>
                                {draftWorkOptions.map((line) => (
                                  <option key={line.id} value={line.id}>
                                    {line.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                value={item.mappedAccountingLineId ?? ''}
                                onChange={(event) =>
                                  updateItemDraft(index, {
                                    mappedAccountingLineId: event.target.value
                                      ? (event.target.value as Id<'accountingLines'>)
                                      : undefined,
                                  })
                                }
                              >
                                <option value="">Map accounting line</option>
                                {(lineOptions?.accounting ?? []).map((line) => (
                                  <option key={line.id} value={line.id}>
                                    {line.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                value={item.mappedMaterialLineId ?? ''}
                                onChange={(event) =>
                                  updateItemDraft(index, {
                                    mappedMaterialLineId: event.target.value
                                      ? (event.target.value as Id<'materialLines'>)
                                      : undefined,
                                  })
                                }
                              >
                                <option value="">Map material line</option>
                                {(lineOptions?.materials ?? []).map((line) => (
                                  <option key={line.id} value={line.id}>
                                    {line.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="border border-gray-200 rounded px-2 py-1 text-xs"
                                value={item.mappedWorkLineId ?? ''}
                                onChange={(event) =>
                                  updateItemDraft(index, {
                                    mappedWorkLineId: event.target.value
                                      ? (event.target.value as Id<'workLines'>)
                                      : undefined,
                                  })
                                }
                              >
                                <option value="">Map labor line</option>
                                {(lineOptions?.labor ?? []).map((line) => (
                                  <option key={line.id} value={line.id}>
                                    {line.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => removeItemDraft(index)}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(lineOptions?.accounting?.length ?? 0) === 0 && (
                      <div className="mt-3 text-xs text-gray-500">
                        No accounting lines found for this project. Create them in Project
                        Accounting, then refresh.
                      </div>
                    )}
                    {(lineOptions?.materials?.length ?? 0) === 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        No material lines found yet. Create material lines in Project Accounting,
                        then refresh.
                      </div>
                    )}
                    {draftMaterialOptions.length === 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        No material lines found in the Accounting view.
                      </div>
                    )}
                    {draftWorkOptions.length === 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        No labor lines found in the Accounting view.
                      </div>
                    )}
                    <div className="mt-3 text-xs text-gray-500">
                      Items only affect project costs after approval.
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        type="button"
                        className="bg-black text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-60"
                        onClick={handleSaveItems}
                        disabled={isSavingItems}
                      >
                        {isSavingItems ? 'Saving...' : 'Save items'}
                      </button>
                      {itemsSaveSuccess ? (
                        <span className="text-xs text-emerald-600">Saved.</span>
                      ) : null}
                      {itemsSaveError ? (
                        <span className="text-xs text-red-600">{itemsSaveError}</span>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatDateInput(timestamp?: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function parseDateInput(value: string) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function parseNumberInput(value: string) {
  if (value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}
