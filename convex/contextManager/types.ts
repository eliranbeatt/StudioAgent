export type ContextView = 'project_core_v1'

export type ContextPack = {
  id: string
  title: string
  content: string
  bytes: number
}

export type ContextPackManifest = {
  view: ContextView
  version: string
  toolBundleId?: string
  skillId?: string
  params?: any
  packs: Array<{ id: string; title: string; bytes: number }>
}

export type ContextPackEnvelope = {
  view: ContextView
  version: string
  pulledAt: number
  manifest: ContextPackManifest
  packs: ContextPack[]
  stats: {
    packCount: number
    totalBytes: number
  }
}
