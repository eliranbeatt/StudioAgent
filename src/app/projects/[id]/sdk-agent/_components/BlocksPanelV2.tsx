'use client'

type SuggestionItem = {
  id: string
  labelHe: string
  actionKey?: string
}

type QuestionsV2 = {
  yesNoQuestionHe: string
  multiQuestionHe: string
  multiOptions: SuggestionItem[]
}

type BlocksPanelV2Props = {
  suggestions: SuggestionItem[]
  questions: QuestionsV2 | null
  selectedSuggestionIds: string[]
  yesNo: 'yes' | 'no' | null
  selectedMultiIds: string[]
  onToggleSuggestion: (id: string) => void
  onSetYesNo: (value: 'yes' | 'no') => void
  onToggleMulti: (id: string) => void
  disabled?: boolean
}

function gridColsClass(count: number) {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  return 'grid-cols-3'
}

export function BlocksPanelV2({
  suggestions,
  questions,
  selectedSuggestionIds,
  yesNo,
  selectedMultiIds,
  onToggleSuggestion,
  onSetYesNo,
  onToggleMulti,
  disabled,
}: BlocksPanelV2Props) {
  const hasSuggestions = suggestions.length > 0
  const hasQuestions = Boolean(questions)
  if (!hasSuggestions && !hasQuestions) return null

  return (
    <div className='space-y-2 p-4 pb-0 bg-white border-t border-slate-200'>
      {hasSuggestions ? (
        <div className={`grid ${gridColsClass(suggestions.length)} gap-2`}>
          {suggestions.map((item) => {
            const selected = selectedSuggestionIds.includes(item.id)
            return (
              <button
                key={item.id}
                disabled={disabled}
                onClick={() => onToggleSuggestion(item.id)}
                className={`h-9 rounded-full border px-3 text-xs font-medium text-left transition-colors ${
                  selected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {item.labelHe}
              </button>
            )
          })}
        </div>
      ) : null}

      {questions ? (
        <div className='rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3'>
          <div className='text-[11px] font-semibold uppercase tracking-wider text-slate-500'>שאלות מהירות להמשך</div>

          <div className='space-y-2'>
            <div className='text-xs text-slate-700'>{questions.yesNoQuestionHe}</div>
            <div className='inline-flex rounded-lg border border-slate-300 bg-white p-0.5'>
              <button
                disabled={disabled}
                onClick={() => onSetYesNo('yes')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  yesNo === 'yes' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                } disabled:opacity-50`}
              >
                כן
              </button>
              <button
                disabled={disabled}
                onClick={() => onSetYesNo('no')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  yesNo === 'no' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                } disabled:opacity-50`}
              >
                לא
              </button>
            </div>
          </div>

          <div className='space-y-2'>
            <div className='text-xs text-slate-700'>{questions.multiQuestionHe}</div>
            <div className='flex flex-wrap gap-2'>
              {questions.multiOptions.map((item) => {
                const selected = selectedMultiIds.includes(item.id)
                return (
                  <button
                    key={item.id}
                    disabled={disabled}
                    onClick={() => onToggleMulti(item.id)}
                    className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {item.labelHe}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
