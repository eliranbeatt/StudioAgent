'use client'

import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  BookOpen,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  UploadCloud,
} from 'lucide-react'

type TabKey = 'files' | 'qa' | 'knowledge' | 'projectContext' | 'userInput'

type TabConfig = {
  key: TabKey
  label: string
  icon: ComponentType<{ size?: number }>
}

type ProjectKnowledgePanelProps = {
  projectId: Id<'projects'>
}

export function ProjectKnowledgePanel({ projectId }: ProjectKnowledgePanelProps) {
  const files = useQuery(api.files.listProjectFiles, { projectId })
  const qaPairs = useQuery(api.memory.listQAPairs, { projectId })
  const runningMemory = useQuery(api.memory.getRunningMemory, { projectId })
  const projectContext = useQuery(api.memory.getProjectContextDoc, { projectId })
  const userInputLog = useQuery(api.memory.getUserInputLog, { projectId })

  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const saveUploadedFile = useAction(api.filesActions.saveUploadedFile)
  const updateRunningMemory = useMutation(api.memory.updateRunningMemory)
  const updateProjectContextDoc = useMutation(api.memory.updateProjectContextDoc)
  const setRunningMemoryAutoAppend = useMutation(api.memory.setRunningMemoryAutoAppend)
  const regenerateRunningMemory = useAction(api.memory.regenerateRunningMemory)
  const generateProjectContextDoc = useAction(api.memory.generateProjectContextDoc)

  const [activeTab, setActiveTab] = useState<TabKey>('files')
  const [editorValue, setEditorValue] = useState('')
  const [contextEditorValue, setContextEditorValue] = useState('')
  const [contextFeedback, setContextFeedback] = useState('')
  const [qaSearch, setQaSearch] = useState('')
  const [openFileId, setOpenFileId] = useState<Id<'projectFiles'> | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingContext, setIsSavingContext] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isGeneratingContext, setIsGeneratingContext] = useState(false)

  const fileUrl = useQuery(
    api.files.getFileUrl,
    openFileId ? { fileId: openFileId } : 'skip'
  )

  useEffect(() => {
    setEditorValue(runningMemory?.contentMd_he ?? '')
  }, [runningMemory?.contentMd_he])

  useEffect(() => {
    setContextEditorValue(projectContext?.contentMd_he ?? '')
  }, [projectContext?.contentMd_he])

  useEffect(() => {
    if (!fileUrl?.url) return
    window.open(fileUrl.url, '_blank', 'noopener,noreferrer')
    setOpenFileId(null)
  }, [fileUrl])

  const filteredQAPairs = useMemo(() => {
    if (!qaPairs) return []
    const needle = qaSearch.trim().toLowerCase()
    if (!needle) return qaPairs
    return qaPairs.filter((qa) => {
      const q = (qa.question_he ?? '').toLowerCase()
      const a = (qa.answer_he ?? '').toLowerCase()
      return q.includes(needle) || a.includes(needle)
    })
  }, [qaPairs, qaSearch])

  const lastUpdated = runningMemory?.updatedAt
    ? new Date(runningMemory.updatedAt).toLocaleString()
    : 'Not updated yet'

  const autoAppendEnabled = runningMemory?.autoAppendEnabled ?? true
  const hasChanges = editorValue !== (runningMemory?.contentMd_he ?? '')
  const hasContextChanges = contextEditorValue !== (projectContext?.contentMd_he ?? '')

  const tabs: TabConfig[] = [
    { key: 'files', label: 'Uploaded Files', icon: FileText },
    { key: 'qa', label: 'QA', icon: Search },
    { key: 'knowledge', label: 'Current Knowledge', icon: BookOpen },
    { key: 'projectContext', label: 'Project Context', icon: BookOpen },
    { key: 'userInput', label: 'User Input', icon: FileText },
  ]

  if (!files || !qaPairs) {
    return <div className='text-gray-500'>Loading knowledge...</div>
  }

  return (
    <div className='mt-6'>
      <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8'>
        <div>
          <h3 className='text-2xl font-bold'>Knowledge</h3>
          <p className='text-sm text-gray-500 mt-1'>Shared context for all project agent runs</p>
        </div>
        <div className='flex flex-wrap items-center gap-3 text-xs'>
          <div className='px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold uppercase tracking-wider'>
            Updated: {lastUpdated}
          </div>
          <button
            onClick={async () => {
              setIsRegenerating(true)
              try {
                await regenerateRunningMemory({ projectId })
              } finally {
                setIsRegenerating(false)
              }
            }}
            className='px-3 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold uppercase tracking-wider hover:bg-gray-50 disabled:opacity-60'
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <span className='flex items-center gap-2'><Loader2 className='animate-spin' size={14} /> Regenerating</span>
            ) : (
              <span className='flex items-center gap-2'><RefreshCcw size={14} /> Regenerate</span>
            )}
          </button>
          <label className='inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold uppercase tracking-wider cursor-pointer'>
            <input
              type='checkbox'
              checked={autoAppendEnabled}
              onChange={async (e) => {
                await setRunningMemoryAutoAppend({ projectId, enabled: e.target.checked })
              }}
            />
            Auto-append
          </label>
        </div>
      </div>

      <div className='flex flex-wrap gap-2 mb-6'>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${isActive
                ? 'bg-black text-white shadow-md'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
              <span className='inline-flex items-center gap-2'>
                <tab.icon size={16} /> {tab.label}
              </span>
            </button>
          )
        })}
      </div>

      {activeTab === 'files' && (
        <div className='bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden'>
          <div className='px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50'>
            <h3 className='font-semibold text-gray-900'>Uploaded Files</h3>
            <label className='inline-flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer'>
              <UploadCloud size={14} /> Upload files
              <input
                type='file'
                multiple
                className='hidden'
                onChange={async (e) => {
                  if (!e.target.files) return
                  for (const file of Array.from(e.target.files)) {
                    const uploadUrl = await generateUploadUrl({})
                    const result = await fetch(uploadUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': file.type },
                      body: file,
                    })
                    const { storageId } = await result.json()
                    await saveUploadedFile({
                      projectId,
                      storageId,
                      fileName: file.name,
                      contentType: file.type,
                      size: file.size,
                    })
                  }
                }}
              />
            </label>
          </div>
          <div className='divide-y'>
            {files.length > 0 ? (
              files.map((file) => (
                <div key={file._id} className='p-6'>
                  <div className='flex flex-col md:flex-row md:items-start md:justify-between gap-4'>
                    <div>
                      <div className='font-semibold text-gray-900'>{file.fileName}</div>
                      <div className='text-xs text-gray-500 mt-1'>
                        {Math.round(file.size / 1024)} KB - Uploaded {new Date(file.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className='flex items-center gap-3 text-xs font-semibold uppercase tracking-wider'>
                      <button
                        className='text-gray-600 hover:text-gray-900 flex items-center gap-1'
                        onClick={() => setOpenFileId(file._id)}
                      >
                        <ExternalLink size={12} /> View file
                      </button>
                    </div>
                  </div>
                  <div className='mt-4 text-sm text-gray-700'>
                    {file.summary || file.extractedInfo?.summary ? (
                      <div className='prose prose-sm max-w-none text-gray-700'>
                        {file.extractedInfo?.summary ?? file.summary}
                      </div>
                    ) : (
                      <div className='text-gray-400 italic'>No summary available yet.</div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className='p-8 text-center text-gray-500'>No files uploaded yet.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'qa' && (
        <div className='bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden'>
          <div className='px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
            <h3 className='font-semibold text-gray-900'>QA Pairs</h3>
            <div className='relative w-full md:w-72'>
              <Search size={14} className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-400' />
              <input
                className='w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-xs text-gray-700'
                placeholder='Search questions or answers'
                value={qaSearch}
                onChange={(e) => setQaSearch(e.target.value)}
              />
            </div>
          </div>
          <div className='divide-y'>
            {filteredQAPairs.length > 0 ? (
              filteredQAPairs.map((qa) => (
                <div key={qa._id} className='p-6 space-y-3'>
                  <div>
                    <div className='text-xs font-semibold uppercase tracking-wider text-gray-400'>Question</div>
                    <div className='mt-1 text-sm text-gray-900'>{qa.question_he}</div>
                  </div>
                  <div>
                    <div className='text-xs font-semibold uppercase tracking-wider text-gray-400'>Answer</div>
                    <div className='mt-1 text-sm text-gray-700 whitespace-pre-wrap'>{qa.answer_he}</div>
                  </div>
                  <div className='text-xs text-gray-400'>
                    {qa.createdAt ? `Saved ${new Date(qa.createdAt).toLocaleString()}` : ''}
                  </div>
                </div>
              ))
            ) : (
              <div className='p-8 text-center text-gray-500'>No QA pairs yet.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          <div className='bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col'>
            <div className='px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between'>
              <h3 className='font-semibold text-gray-900'>Current Knowledge (Markdown)</h3>
              <button
                className='px-3 py-2 rounded-lg bg-black text-white text-xs font-semibold uppercase tracking-wider disabled:opacity-60'
                onClick={async () => {
                  setIsSaving(true)
                  try {
                    await updateRunningMemory({ projectId, contentMd_he: editorValue })
                  } finally {
                    setIsSaving(false)
                  }
                }}
                disabled={isSaving || !hasChanges}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <textarea
              className='flex-1 p-6 text-sm text-gray-800 outline-none resize-none min-h-[320px]'
              value={editorValue}
              onChange={(e) => setEditorValue(e.target.value)}
              placeholder='Summarized knowledge will appear here. You can edit freely.'
            />
          </div>
          <div className='bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden'>
            <div className='px-6 py-4 border-b border-gray-100 bg-gray-50/50'>
              <h3 className='font-semibold text-gray-900'>Preview</h3>
            </div>
            <div className='p-6 text-sm text-gray-700'>
              {editorValue.trim() ? (
                <div className='prose prose-sm max-w-none'>
                  <ReactMarkdown>{editorValue}</ReactMarkdown>
                </div>
              ) : (
                <div className='text-gray-400 italic'>Nothing to preview yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'projectContext' && (
        <div className='space-y-6'>
          <div className='bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden'>
            <div className='px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between'>
              <h3 className='font-semibold text-gray-900'>Project Context (Markdown)</h3>
              <div className='flex items-center gap-2'>
                <button
                  className='px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold uppercase tracking-wider disabled:opacity-60'
                  onClick={async () => {
                    setIsSavingContext(true)
                    try {
                      await updateProjectContextDoc({ projectId, contentMd_he: contextEditorValue })
                    } finally {
                      setIsSavingContext(false)
                    }
                  }}
                  disabled={isSavingContext || !hasContextChanges}
                >
                  {isSavingContext ? 'Saving...' : 'Save'}
                </button>
                <button
                  className='px-3 py-2 rounded-lg bg-black text-white text-xs font-semibold uppercase tracking-wider disabled:opacity-60'
                  onClick={async () => {
                    setIsGeneratingContext(true)
                    try {
                      await generateProjectContextDoc({ projectId })
                    } finally {
                      setIsGeneratingContext(false)
                    }
                  }}
                  disabled={isGeneratingContext}
                >
                  {isGeneratingContext ? 'Generating...' : 'Regenerate'}
                </button>
              </div>
            </div>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 p-6'>
              <textarea
                className='min-h-[320px] w-full rounded-lg border border-gray-200 p-4 text-sm text-gray-800 outline-none resize-none'
                value={contextEditorValue}
                onChange={(e) => setContextEditorValue(e.target.value)}
                placeholder='Project context summary will appear here. You can edit freely.'
              />
              <div className='text-sm text-gray-700'>
                {contextEditorValue.trim() ? (
                  <div className='prose prose-sm max-w-none'>
                    <ReactMarkdown>{contextEditorValue}</ReactMarkdown>
                  </div>
                ) : (
                  <div className='text-gray-400 italic'>No project context document yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className='bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden'>
            <div className='px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between'>
              <h4 className='font-semibold text-gray-900'>Regeneration feedback</h4>
              <button
                className='px-3 py-2 rounded-lg bg-black text-white text-xs font-semibold uppercase tracking-wider disabled:opacity-60'
                onClick={async () => {
                  setIsGeneratingContext(true)
                  try {
                    await generateProjectContextDoc({
                      projectId,
                      feedback: contextFeedback.trim() || undefined,
                    })
                    setContextFeedback('')
                  } finally {
                    setIsGeneratingContext(false)
                  }
                }}
                disabled={isGeneratingContext || contextFeedback.trim().length === 0}
              >
                {isGeneratingContext ? 'Generating...' : 'Regenerate with feedback'}
              </button>
            </div>
            <div className='p-6'>
              <textarea
                className='min-h-[120px] w-full rounded-lg border border-gray-200 p-4 text-sm text-gray-800 outline-none resize-none'
                placeholder='Add feedback to refine the project context (missing scope, risks, costs, etc.)'
                value={contextFeedback}
                onChange={(e) => setContextFeedback(e.target.value)}
              />
              <p className='mt-2 text-xs text-gray-500'>Feedback is stored in the project log and used to regenerate the document.</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'userInput' && (
        <div className='bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col'>
          <div className='px-6 py-4 border-b border-gray-100 bg-gray-50/50'>
            <h3 className='font-semibold text-gray-900'>User Input Log (append-only)</h3>
          </div>
          <textarea
            className='flex-1 p-6 text-sm text-gray-800 outline-none resize-none min-h-[320px] bg-white'
            value={userInputLog?.contentMd_he ?? ''}
            readOnly
            placeholder='User input will appear here as it is submitted in the context gate.'
          />
        </div>
      )}
    </div>
  )
}
