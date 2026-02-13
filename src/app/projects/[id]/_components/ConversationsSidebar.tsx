'use client'

import { useState } from 'react'
import { Check, Edit2, Plus, Sparkles, Trash2, X } from 'lucide-react'

type ConversationItem = {
  _id: string
  title: string
  updatedAt?: number
}

export function ConversationsSidebar({
  title = 'Conversations',
  items,
  activeId,
  loading,
  emptyLabel = 'No history yet',
  onSelect,
  onCreate,
  onRename,
  onGenerateTitle,
  onDelete,
}: {
  title?: string
  items: ConversationItem[] | undefined
  activeId: string | null
  loading?: boolean
  emptyLabel?: string
  onSelect: (id: string) => void
  onCreate: () => Promise<void> | void
  onRename: (id: string, title: string) => Promise<void> | void
  onGenerateTitle?: (id: string) => Promise<void> | void
  onDelete?: (id: string) => Promise<void> | void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const startEditing = (e: React.MouseEvent, item: ConversationItem) => {
    e.stopPropagation()
    setEditingId(item._id)
    setEditTitle(item.title)
  }

  const saveTitle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editingId || !editTitle.trim()) return
    setBusyAction(`rename:${editingId}`)
    try {
      await onRename(editingId, editTitle.trim())
      setEditingId(null)
    } finally {
      setBusyAction(null)
    }
  }

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(null)
  }

  const handleGenerate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!onGenerateTitle) return
    setBusyAction(`title:${id}`)
    try {
      await onGenerateTitle(id)
    } finally {
      setBusyAction(null)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!onDelete) return
    const confirmed = window.confirm('Delete this conversation?')
    if (!confirmed) return
    setBusyAction(`delete:${id}`)
    try {
      await onDelete(id)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className='w-64 border-r border-slate-200 bg-white flex flex-col'>
      <div className='p-4 border-b border-slate-100 flex justify-between items-center'>
        <h2 className='font-semibold text-sm text-slate-700'>{title}</h2>
        <button
          onClick={() => onCreate()}
          className='text-blue-600 hover:bg-blue-50 p-1 rounded'
          title='New Session'
        >
          <Plus size={16} />
        </button>
      </div>

      <div className='flex-1 overflow-y-auto p-2 space-y-1'>
        {loading || !items ? (
          <div className='text-xs text-slate-400 p-2'>Loading...</div>
        ) : items.length === 0 ? (
          <div className='text-xs text-slate-400 p-2'>{emptyLabel}</div>
        ) : (
          items.map((item) => (
            <div
              key={item._id}
              className={`group flex items-center w-full rounded-md text-xs transition-colors ${
                activeId === item._id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => onSelect(item._id)}
            >
              {editingId === item._id ? (
                <div className='flex items-center flex-1 p-1 gap-1'>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className='flex-1 border border-blue-300 rounded px-1 py-0.5 outline-none bg-white'
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button onClick={saveTitle} className='text-green-600 hover:bg-green-50 p-0.5 rounded'>
                    <Check size={14} />
                  </button>
                  <button onClick={cancelEditing} className='text-red-500 hover:bg-red-50 p-0.5 rounded'>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className='flex-1 flex justify-between items-center p-2 cursor-pointer'>
                  <div className='flex flex-col truncate'>
                    <span className='truncate'>{item.title}</span>
                    <span className='text-[10px] text-slate-400 font-normal'>
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}
                    </span>
                  </div>

                  <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                    {onGenerateTitle ? (
                      <button
                        onClick={(e) => handleGenerate(e, item._id)}
                        className={`p-1 rounded hover:bg-purple-100 text-purple-600 ${
                          busyAction === `title:${item._id}` ? 'animate-spin' : ''
                        }`}
                        title='Auto-rename'
                      >
                        <Sparkles size={12} />
                      </button>
                    ) : null}
                    <button
                      onClick={(e) => startEditing(e, item)}
                      className='p-1 rounded hover:bg-slate-200 text-slate-500'
                      title='Rename'
                    >
                      <Edit2 size={12} />
                    </button>
                    {onDelete ? (
                      <button
                        onClick={(e) => handleDelete(e, item._id)}
                        className='p-1 rounded hover:bg-red-100 text-red-500'
                        title='Delete'
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
