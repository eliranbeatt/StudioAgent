'use client'

import { useState } from 'react'

export type ChipOption = {
  value: string
  labelHe: string
}

export type AnswerSource = 'typed' | 'option' | 'suggestion' | 'dont_know'

type AnswerChipsProps = {
  options?: ChipOption[]
  optionsHe?: string[]
  suggestedAnswers?: ChipOption[]
  allowDontKnow?: boolean
  selected?: string
  onSelect: (value: string, source: AnswerSource) => void
}

export function AnswerChips({
  options,
  optionsHe,
  suggestedAnswers,
  allowDontKnow = true,
  selected,
  onSelect,
}: AnswerChipsProps) {
  // Merge optionsHe (string[]) into ChipOption format
  const resolvedOptions: ChipOption[] = options ?? (optionsHe ?? []).map((label) => ({
    value: label,
    labelHe: label,
  }))

  const resolved = suggestedAnswers ?? []
  const hasChips = resolvedOptions.length > 0 || resolved.length > 0 || allowDontKnow

  if (!hasChips) return null

  return (
    <div dir="rtl" className="flex flex-wrap gap-1.5 mt-1.5">
      {/* Predefined options — solid style */}
      {resolvedOptions.map((opt) => (
        <button
          key={`opt-${opt.value}`}
          type="button"
          onClick={() => onSelect(opt.value, 'option')}
          className={`
            rounded-full px-3 py-1 text-[11px] font-medium transition-colors
            border cursor-pointer select-none
            ${selected === opt.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}
          `}
        >
          {opt.labelHe}
        </button>
      ))}

      {/* Suggested answers — outlined/dotted style */}
      {resolved.map((sug) => (
        <button
          key={`sug-${sug.value}`}
          type="button"
          onClick={() => onSelect(sug.value, 'suggestion')}
          className={`
            rounded-full px-3 py-1 text-[11px] font-medium transition-colors
            border border-dashed cursor-pointer select-none
            ${selected === sug.value
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'}
          `}
        >
          {sug.labelHe}
        </button>
      ))}

      {/* Always-on "don't know" chip */}
      {allowDontKnow && (
        <button
          type="button"
          onClick={() => onSelect('__dont_know__', 'dont_know')}
          className={`
            rounded-full px-3 py-1 text-[11px] font-medium transition-colors
            border border-dashed cursor-pointer select-none
            ${selected === '__dont_know__'
              ? 'bg-slate-600 text-white border-slate-600'
              : 'bg-slate-50 text-slate-500 border-slate-300 hover:bg-slate-100'}
          `}
        >
          לא ידוע
        </button>
      )}
    </div>
  )
}
