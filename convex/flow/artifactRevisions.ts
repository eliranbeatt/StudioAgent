import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { internalMutation } from '../_generated/server'
import { buildProjectSnapshot } from './snapshotBuilder'
import { applyChangeSetInternalLogic } from '../changeSets'

type RevisionSource = 'runStart' | 'autoApply' | 'manualApply' | 'audit' | 'replay'
type AppliedBy = 'auto' | 'user' | 'system'

function stableStringify(value: any): string {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function mapAppliedByToSource(appliedBy: AppliedBy): RevisionSource {
  if (appliedBy === 'user') return 'manualApply'
  if (appliedBy === 'system') return 'autoApply'
  return 'autoApply'
}

export async function createRevisionFromSnapshot(
  ctx: any,
  args: {
    projectId: Id<'projects'>
    snapshot: any
    source: RevisionSource
    runId?: Id<'flowRuns'>
    baseRevisionId?: Id<'flowArtifactRevisions'>
  }
) {
  const hash = hashString(stableStringify(args.snapshot))
  const now = Date.now()
  return await ctx.db.insert('flowArtifactRevisions', {
    projectId: args.projectId,
    runId: args.runId,
    snapshot: args.snapshot,
    hash,
    createdAt: now,
    source: args.source,
    baseRevisionId: args.baseRevisionId,
  })
}

export async function createRevisionFromLive(
  ctx: any,
  args: {
    projectId: Id<'projects'>
    source: RevisionSource
    runId?: Id<'flowRuns'>
    baseRevisionId?: Id<'flowArtifactRevisions'>
  }
) {
  const snapshot = await buildProjectSnapshot(ctx, args.projectId)
  return await createRevisionFromSnapshot(ctx, {
    projectId: args.projectId,
    snapshot,
    source: args.source,
    runId: args.runId,
    baseRevisionId: args.baseRevisionId,
  })
}

export async function applyChangeSetAndCreateRevision(
  ctx: any,
  args: {
    changeSetId: Id<'changeSets'>
    baseRevisionId?: Id<'flowArtifactRevisions'>
    runId?: Id<'flowRuns'>
    nodeId?: string
    appliedBy: AppliedBy
  }
) {
  const changeSet = await ctx.db.get(args.changeSetId)
  if (!changeSet) throw new Error('ChangeSet not found')

  if (changeSet.artifactRevisionInId && args.baseRevisionId) {
    if (changeSet.artifactRevisionInId !== args.baseRevisionId) {
      throw new Error('ChangeSet base revision does not match current artifact revision')
    }
  }

  const appliedAt = Date.now()
  try {
    await applyChangeSetInternalLogic(ctx, { changeSetId: args.changeSetId })
    const artifactRevisionOutId = await createRevisionFromLive(ctx, {
      projectId: changeSet.projectId,
      source: mapAppliedByToSource(args.appliedBy),
      runId: args.runId,
      baseRevisionId: args.baseRevisionId,
    })

    if (args.runId) {
      await ctx.db.patch(args.runId, {
        currentArtifactRevisionId: artifactRevisionOutId,
        updatedAt: Date.now(),
      })
    }

    await ctx.db.insert('flowChangeSetApplyLogs', {
      changeSetId: args.changeSetId,
      runId: args.runId,
      nodeId: args.nodeId,
      appliedBy: args.appliedBy,
      appliedAt,
      result: 'success',
      artifactRevisionOutId,
    })

    return { ok: true, artifactRevisionOutId }
  } catch (error: any) {
    await ctx.db.insert('flowChangeSetApplyLogs', {
      changeSetId: args.changeSetId,
      runId: args.runId,
      nodeId: args.nodeId,
      appliedBy: args.appliedBy,
      appliedAt,
      result: 'failure',
      error: error?.message ?? String(error),
    })
    throw error
  }
}

export const recordApplySuccess = internalMutation({
  args: {
    flowRunId: v.id('flowRuns'),
    changeSetId: v.id('changeSets'),
    appliedBy: v.union(v.literal('auto'), v.literal('user'), v.literal('system')),
    nodeId: v.optional(v.string()),
    baseRevisionId: v.optional(v.id('flowArtifactRevisions')),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.flowRunId)
    if (!run) return null

    const baseRevisionId = args.baseRevisionId ?? run.currentArtifactRevisionId
    const artifactRevisionOutId = await createRevisionFromLive(ctx, {
      projectId: run.projectId,
      source: mapAppliedByToSource(args.appliedBy),
      runId: args.flowRunId,
      baseRevisionId,
    })

    await ctx.db.patch(args.flowRunId, {
      currentArtifactRevisionId: artifactRevisionOutId,
      updatedAt: Date.now(),
    })

    await ctx.db.insert('flowChangeSetApplyLogs', {
      changeSetId: args.changeSetId,
      runId: args.flowRunId,
      nodeId: args.nodeId,
      appliedBy: args.appliedBy,
      appliedAt: Date.now(),
      result: 'success',
      artifactRevisionOutId,
    })

    return artifactRevisionOutId
  },
})

export const recordApplyFailure = internalMutation({
  args: {
    flowRunId: v.id('flowRuns'),
    changeSetId: v.id('changeSets'),
    appliedBy: v.union(v.literal('auto'), v.literal('user'), v.literal('system')),
    nodeId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('flowChangeSetApplyLogs', {
      changeSetId: args.changeSetId,
      runId: args.flowRunId,
      nodeId: args.nodeId,
      appliedBy: args.appliedBy,
      appliedAt: Date.now(),
      result: 'failure',
      error: args.error,
    })
  },
})
