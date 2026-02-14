'use client'

function normalizeSuggestions(block: any) {
  const source = Array.isArray(block?.suggestions)
    ? block.suggestions
    : Array.isArray(block?.items)
      ? block.items
      : []
  return source
    .map((item: any, index: number) => {
      const label = String(item?.labelHe ?? item?.label_he ?? item?.label ?? item?.text ?? item?.title ?? item?.description ?? '').trim()
      if (!label) return null
      const actionKey = String(item?.actionKey ?? item?.payload?.action ?? item?.id ?? `action_${index + 1}`).trim()
      return {
        id: String(item?.id ?? `s_${index + 1}`),
        label,
        why: String(item?.whyHe ?? item?.why_he ?? item?.why ?? '').trim(),
        actionKey,
      }
    })
    .filter(Boolean) as Array<{ id: string; label: string; why: string; actionKey: string }>
}

export function SdkSuggestionBlock({
  block,
  disabled,
  selectedIds,
  onToggle,
}: {
  block: any
  disabled?: boolean
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  const title = String(block?.titleHe ?? block?.title_he ?? 'Suggested actions')
  const suggestions = normalizeSuggestions(block)

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3' dir='auto'>
      <div className='text-xs font-semibold text-gray-900'>{title}</div>
      <div className='space-y-2'>
        {suggestions.map((item) => {
          const selected = selectedIds.includes(item.id) || selectedIds.includes(item.actionKey)
          return (
            <button
              key={item.id}
              onClick={() => onToggle(item.id)}
              disabled={disabled}
              className={`w-full text-start p-3 border rounded transition-colors group ${
                selected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-200'
              }`}
            >
              <div className={`font-semibold text-xs ${selected ? 'text-blue-700' : 'text-slate-800 group-hover:text-blue-700'}`}>
                {item.label}
              </div>
              {item.why ? <div className='text-[10px] text-slate-500 mt-1'>{item.why}</div> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
