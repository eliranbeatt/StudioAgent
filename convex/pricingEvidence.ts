import { internalMutation, mutation, query } from './_generated/server'
import { v } from 'convex/values'

function stableHash(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0590-\u05ff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
}

function normalizeCurrency(value: unknown): 'ILS' | 'USD' | 'EUR' {
  const normalized = String(value ?? 'ILS').toUpperCase()
  if (normalized === 'USD' || normalized === 'EUR') return normalized
  return 'ILS'
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'high' || normalized === 'medium') return normalized
  return 'low'
}

function normalizeSourceType(value: unknown): 'web' | 'logged' | 'catalog' | 'fallback' {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'web' || normalized === 'logged' || normalized === 'catalog') return normalized
  return 'fallback'
}

function toQtyBand(quantity?: number) {
  const qty = Number(quantity ?? 0)
  if (!Number.isFinite(qty) || qty <= 0) return 'unknown'
  if (qty <= 1) return 'single'
  if (qty <= 5) return 'small'
  if (qty <= 20) return 'medium'
  return 'bulk'
}

function freshnessDaysForItem(itemHe: string) {
  const text = String(itemHe ?? '').toLowerCase()
  const stableHints = ['wood', 'plywood', 'mdf', 'hardware', '????', '????', '??']
  const rentalHints = ['rental', 'rent', '?????', '?????', 'service', '?????']
  if (rentalHints.some((hint) => text.includes(hint))) return 21
  if (stableHints.some((hint) => text.includes(hint))) return 90
  return 30
}

function buildConstraints(input: {
  region?: string
  maxDeliveryDays?: number
  unitHe?: string
  quantity?: number
  dimensionsKey?: string
}) {
  return {
    region: input.region ?? 'IL',
    maxDeliveryDays: Number.isFinite(Number(input.maxDeliveryDays)) ? Number(input.maxDeliveryDays) : 7,
    unitHe: input.unitHe ?? undefined,
    qtyBand: toQtyBand(input.quantity),
    dimensionsKey: input.dimensionsKey ?? undefined,
  }
}

function buildConstraintsHash(constraints: any) {
  return stableHash(JSON.stringify(constraints))
}

function normalizeCandidates(candidates: any[], fallbackCurrency: 'ILS' | 'USD' | 'EUR') {
  return (Array.isArray(candidates) ? candidates : []).map((candidate: any) => ({
    sourceType: normalizeSourceType(candidate?.sourceType),
    sourceName: candidate?.sourceName ? String(candidate.sourceName) : undefined,
    sourceUrl: candidate?.sourceUrl ? String(candidate.sourceUrl) : undefined,
    title: candidate?.title
      ? String(candidate.title)
      : candidate?.titleHe
        ? String(candidate.titleHe)
        : undefined,
    descriptionHe: candidate?.descriptionHe ? String(candidate.descriptionHe) : undefined,
    quantity: Number.isFinite(Number(candidate?.quantity)) ? Number(candidate.quantity) : undefined,
    unit: candidate?.unit ? String(candidate.unit) : undefined,
    price: Number.isFinite(Number(candidate?.price)) ? Number(candidate.price) : undefined,
    shippingPrice: Number.isFinite(Number(candidate?.shippingPrice)) ? Number(candidate.shippingPrice) : undefined,
    unitPrice: Number.isFinite(Number(candidate?.unitPrice))
      ? Number(candidate.unitPrice)
      : Number.isFinite(Number(candidate?.price))
        ? Number(candidate.price)
        : undefined,
    currency: candidate?.currency ? String(candidate.currency).toUpperCase() : fallbackCurrency,
    unitHe: candidate?.unitHe
      ? String(candidate.unitHe)
      : candidate?.unit
        ? String(candidate.unit)
        : undefined,
    link: candidate?.link
      ? String(candidate.link)
      : candidate?.sourceUrl
        ? String(candidate.sourceUrl)
        : undefined,
    confidence: candidate?.confidence ? normalizeConfidence(candidate.confidence) : undefined,
    whyHe: candidate?.whyHe ? String(candidate.whyHe) : undefined,
    notesHe: candidate?.notesHe ? String(candidate.notesHe) : undefined,
    capturedAt: Number.isFinite(Number(candidate?.capturedAt)) ? Number(candidate.capturedAt) : undefined,
    raw: candidate?.raw,
  }))
}

function computeUsedSources(candidates: any[]) {
  const used = {
    catalog: false,
    logged: false,
    web: false,
    fallback: false,
  }
  for (const candidate of candidates) {
    const sourceType = normalizeSourceType(candidate?.sourceType)
    used[sourceType] = true
  }
  return used
}

async function upsertRun(ctx: any, args: {
  projectId?: any
  itemHe: string
  normalizedKey: string
  constraints: any
  recommended: any
  confidence: 'low' | 'medium' | 'high'
  candidates: any[]
  assumptionsHe?: string[]
  summaryHe?: string
}) {
  const now = Date.now()
  const constraintsHash = buildConstraintsHash(args.constraints)
  const freshnessDays = freshnessDaysForItem(args.itemHe)
  const staleAt = now + freshnessDays * 24 * 60 * 60 * 1000
  const existing = await ctx.db
    .query('webPriceRuns')
    .withIndex('by_project_normalized_constraints', (q: any) =>
      q
        .eq('projectId', args.projectId)
        .eq('normalizedKey', args.normalizedKey)
        .eq('constraintsHash', constraintsHash)
    )
    .first()

  const usedSources = computeUsedSources(args.candidates)
  const sourceDomains = Array.from(
    new Set(
      args.candidates
        .map((candidate: any) => {
          const link = String(candidate?.link ?? '').trim()
          if (!link) return ''
          try {
            return new URL(link).hostname.toLowerCase()
          } catch {
            return ''
          }
        })
        .filter(Boolean)
    )
  )

  const patch = {
    itemHe: args.itemHe,
    normalizedKey: args.normalizedKey,
    constraintsHash,
    constraints: args.constraints,
    meta: {
      usedSources,
      sourceDomains: sourceDomains.length > 0 ? sourceDomains : undefined,
    },
    recommended: args.recommended,
    confidence: args.confidence,
    candidates: args.candidates,
    assumptionsHe: args.assumptionsHe,
    summaryHe: args.summaryHe,
    staleAt,
    updatedAt: now,
  }

  if (existing) {
    await ctx.db.patch(existing._id, patch)
    return existing._id
  }

  return await ctx.db.insert('webPriceRuns', {
    projectId: args.projectId,
    ...patch,
    createdAt: now,
  })
}

export const upsertWebPriceRunFromRecommendation = internalMutation({
  args: {
    projectId: v.optional(v.id('projects')),
    itemHe: v.string(),
    normalizedKey: v.optional(v.string()),
    constraints: v.optional(v.object({
      region: v.optional(v.string()),
      maxDeliveryDays: v.optional(v.number()),
      unitHe: v.optional(v.string()),
      quantity: v.optional(v.number()),
      dimensionsKey: v.optional(v.string()),
    })),
    recommended: v.object({
      unitPrice: v.number(),
      currency: v.optional(v.string()),
      unitHe: v.optional(v.string()),
      priceBasisHe: v.optional(v.string()),
    }),
    confidence: v.optional(v.string()),
    assumptionsHe: v.optional(v.array(v.string())),
    candidates: v.optional(v.array(v.any())),
    summaryHe: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedKey = args.normalizedKey || normalizeKey(args.itemHe)
    const constraints = buildConstraints({
      region: args.constraints?.region,
      maxDeliveryDays: args.constraints?.maxDeliveryDays,
      unitHe: args.constraints?.unitHe ?? args.recommended?.unitHe,
      quantity: args.constraints?.quantity,
      dimensionsKey: args.constraints?.dimensionsKey,
    })
    const currency = normalizeCurrency(args.recommended?.currency)
    const candidates = normalizeCandidates(args.candidates ?? [], currency)

    const runId = await upsertRun(ctx, {
      projectId: args.projectId,
      itemHe: args.itemHe,
      normalizedKey,
      constraints,
      confidence: normalizeConfidence(args.confidence),
      recommended: {
        unitPrice: Number(args.recommended.unitPrice),
        currency,
        unitHe: args.recommended.unitHe,
        priceBasisHe: args.recommended.priceBasisHe,
      },
      candidates,
      assumptionsHe: args.assumptionsHe,
      summaryHe: args.summaryHe,
    })

    return {
      runId,
      normalizedKey,
      constraintsHash: buildConstraintsHash(constraints),
    }
  },
})

export const createMaterialLineSnapshot = internalMutation({
  args: {
    projectId: v.id('projects'),
    materialLineId: v.id('materialLines'),
    webPriceRunId: v.optional(v.id('webPriceRuns')),
    itemHe: v.string(),
    recommended: v.object({
      unitPrice: v.number(),
      currency: v.optional(v.string()),
      unitHe: v.optional(v.string()),
      priceBasisHe: v.optional(v.string()),
    }),
    confidence: v.optional(v.string()),
    assumptionsHe: v.optional(v.array(v.string())),
    candidates: v.optional(v.array(v.any())),
    selectedCandidateIndex: v.optional(v.number()),
    selectedSourceType: v.optional(v.string()),
    appliedBy: v.optional(v.union(v.literal('agent'), v.literal('user'), v.literal('reuse_attach'), v.literal('reuse_create'))),
  },
  handler: async (ctx, args) => {
    const currency = normalizeCurrency(args.recommended.currency)
    const snapshotId = await ctx.db.insert('materialLinePriceSnapshots', {
      projectId: args.projectId,
      materialLineId: args.materialLineId,
      webPriceRunId: args.webPriceRunId,
      itemHe: args.itemHe,
      recommended: {
        unitPrice: Number(args.recommended.unitPrice),
        currency,
        unitHe: args.recommended.unitHe,
        priceBasisHe: args.recommended.priceBasisHe,
      },
      confidence: normalizeConfidence(args.confidence),
      assumptionsHe: Array.isArray(args.assumptionsHe) ? args.assumptionsHe : [],
      candidates: normalizeCandidates(args.candidates ?? [], currency),
      selectedCandidateIndex: args.selectedCandidateIndex,
      selectedSourceType: args.selectedSourceType ? normalizeSourceType(args.selectedSourceType) : undefined,
      appliedBy: args.appliedBy ?? 'agent',
      savedAt: Date.now(),
    })

    await ctx.db.patch(args.materialLineId, {
      latestPriceSnapshotId: snapshotId,
      latestWebPriceRunId: args.webPriceRunId,
      updatedAt: Date.now(),
    })

    return snapshotId
  },
})

export const applyRecommendationToMaterialLine = mutation({
  args: {
    materialLineId: v.id('materialLines'),
    webPriceRunId: v.optional(v.id('webPriceRuns')),
    itemHe: v.string(),
    recommended: v.object({
      unitPrice: v.number(),
      currency: v.optional(v.string()),
      unitHe: v.optional(v.string()),
      priceBasisHe: v.optional(v.string()),
    }),
    confidence: v.optional(v.string()),
    assumptionsHe: v.optional(v.array(v.string())),
    candidates: v.optional(v.array(v.any())),
    appliedBy: v.optional(v.union(v.literal('agent'), v.literal('user'), v.literal('reuse_attach'), v.literal('reuse_create'))),
  },
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.materialLineId)
    if (!line) throw new Error('Material line not found')
    const now = Date.now()
    const unitPrice = Number(args.recommended.unitPrice)
    const qty = Number(line.quantity ?? 0)
    const currency = normalizeCurrency(args.recommended.currency)
    const candidates = normalizeCandidates(args.candidates ?? [], currency)

    await ctx.db.patch(args.materialLineId, {
      plannedUnitCost: unitPrice,
      plannedTotalCost: Number.isFinite(qty) && qty > 0 ? qty * unitPrice : unitPrice,
      pricingSourceCode: 'web',
      priceCheckedAt: now,
      priceUrl: candidates.find((candidate) => candidate.link)?.link,
      confidence: normalizeConfidence(args.confidence) === 'high' ? 0.9 : normalizeConfidence(args.confidence) === 'medium' ? 0.65 : 0.35,
      updatedAt: now,
      latestWebPriceRunId: args.webPriceRunId,
    })

    const snapshotId = await ctx.db.insert('materialLinePriceSnapshots', {
      projectId: line.projectId,
      materialLineId: args.materialLineId,
      webPriceRunId: args.webPriceRunId,
      itemHe: args.itemHe,
      recommended: {
        unitPrice,
        currency,
        unitHe: args.recommended.unitHe,
        priceBasisHe: args.recommended.priceBasisHe,
      },
      confidence: normalizeConfidence(args.confidence),
      assumptionsHe: Array.isArray(args.assumptionsHe) ? args.assumptionsHe : [],
      candidates,
      selectedCandidateIndex: undefined,
      selectedSourceType: candidates.length > 0 ? candidates[0].sourceType : undefined,
      appliedBy: args.appliedBy ?? 'user',
      savedAt: now,
    })

    await ctx.db.patch(args.materialLineId, {
      latestPriceSnapshotId: snapshotId,
      latestWebPriceRunId: args.webPriceRunId,
      updatedAt: now,
    })

    return { snapshotId }
  },
})

export const applyCandidateToMaterialLine = mutation({
  args: {
    materialLineId: v.id('materialLines'),
    webPriceRunId: v.optional(v.id('webPriceRuns')),
    itemHe: v.string(),
    confidence: v.optional(v.string()),
    assumptionsHe: v.optional(v.array(v.string())),
    candidates: v.array(v.any()),
    selectedCandidateIndex: v.number(),
    appliedBy: v.optional(v.union(v.literal('agent'), v.literal('user'), v.literal('reuse_attach'), v.literal('reuse_create'))),
  },
  handler: async (ctx, args) => {
    const selected = args.candidates[args.selectedCandidateIndex]
    if (!selected) throw new Error('Candidate not found')
    const line = await ctx.db.get(args.materialLineId)
    if (!line) throw new Error('Material line not found')

    const currency = normalizeCurrency(selected?.currency)
    const unitPrice = Number(selected?.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('Candidate has no valid unit price')

    const now = Date.now()
    const qty = Number(line.quantity ?? 0)
    const normalizedCandidates = normalizeCandidates(args.candidates, currency)
    const selectedNormalized = normalizedCandidates[args.selectedCandidateIndex]

    await ctx.db.patch(args.materialLineId, {
      plannedUnitCost: unitPrice,
      plannedTotalCost: Number.isFinite(qty) && qty > 0 ? qty * unitPrice : unitPrice,
      pricingSourceCode: selectedNormalized?.sourceType === 'catalog' ? 'catalog_manual' : selectedNormalized?.sourceType === 'logged' ? 'purchase_actual' : selectedNormalized?.sourceType === 'web' ? 'web' : 'estimate',
      priceCheckedAt: now,
      priceUrl: selectedNormalized?.link,
      confidence: normalizeConfidence(args.confidence) === 'high' ? 0.9 : normalizeConfidence(args.confidence) === 'medium' ? 0.65 : 0.35,
      updatedAt: now,
      latestWebPriceRunId: args.webPriceRunId,
    })

    const snapshotId = await ctx.db.insert('materialLinePriceSnapshots', {
      projectId: line.projectId,
      materialLineId: args.materialLineId,
      webPriceRunId: args.webPriceRunId,
      itemHe: args.itemHe,
      recommended: {
        unitPrice,
        currency,
        unitHe: selectedNormalized?.unitHe,
        priceBasisHe: selectedNormalized?.notesHe,
      },
      confidence: normalizeConfidence(args.confidence),
      assumptionsHe: Array.isArray(args.assumptionsHe) ? args.assumptionsHe : [],
      candidates: normalizedCandidates,
      selectedCandidateIndex: args.selectedCandidateIndex,
      selectedSourceType: selectedNormalized?.sourceType,
      appliedBy: args.appliedBy ?? 'user',
      savedAt: now,
    })

    await ctx.db.patch(args.materialLineId, {
      latestPriceSnapshotId: snapshotId,
      latestWebPriceRunId: args.webPriceRunId,
      updatedAt: now,
    })

    return { snapshotId }
  },
})

export const getMaterialLinePriceEvidence = query({
  args: {
    materialLineId: v.id('materialLines'),
  },
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.materialLineId)
    if (!line) return null

    const [latestSnapshot, history] = await Promise.all([
      line.latestPriceSnapshotId ? ctx.db.get(line.latestPriceSnapshotId) : null,
      ctx.db
        .query('materialLinePriceSnapshots')
        .withIndex('by_line_savedAt', (q: any) => q.eq('materialLineId', args.materialLineId))
        .order('desc')
        .take(30),
    ])

    const run = latestSnapshot?.webPriceRunId
      ? await ctx.db.get(latestSnapshot.webPriceRunId)
      : line.latestWebPriceRunId
        ? await ctx.db.get(line.latestWebPriceRunId)
        : null

    return {
      line: {
        _id: line._id,
        projectId: line.projectId,
        itemName: line.itemName,
        quantity: line.quantity,
        unitCost: line.plannedUnitCost,
        total: line.plannedTotalCost,
        uomCode: line.uomCode,
        confidence: line.confidence,
      },
      latestSnapshot,
      history,
      run,
    }
  },
})

export const searchReusableWebPriceRuns = query({
  args: {
    projectId: v.optional(v.id('projects')),
    search: v.optional(v.string()),
    freshness: v.optional(v.union(v.literal('all'), v.literal('fresh'), v.literal('stale'))),
    domain: v.optional(v.string()),
    scope: v.optional(v.union(v.literal('project'), v.literal('global'), v.literal('all'))),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const scope = args.scope ?? 'all'

    const rows = scope === 'project' && args.projectId
      ? await ctx.db
          .query('webPriceRuns')
          .withIndex('by_project_updatedAt', (q: any) => q.eq('projectId', args.projectId))
          .order('desc')
          .take(250)
      : await ctx.db
          .query('webPriceRuns')
          .withIndex('by_updatedAt', (q: any) => q)
          .order('desc')
          .take(400)

    const search = String(args.search ?? '').trim().toLowerCase()
    const domain = String(args.domain ?? '').trim().toLowerCase()

    const filtered = rows.filter((row: any) => {
      if (scope === 'global' && row.projectId) return false
      if (scope === 'project' && args.projectId && String(row.projectId) !== String(args.projectId)) return false

      if (args.freshness === 'fresh' && Number(row.staleAt ?? 0) <= now) return false
      if (args.freshness === 'stale' && Number(row.staleAt ?? 0) > now) return false

      if (search) {
        const hay = `${String(row.itemHe ?? '')} ${String(row.normalizedKey ?? '')}`.toLowerCase()
        if (!hay.includes(search)) return false
      }

      if (domain) {
        const sourceDomains = Array.isArray(row?.meta?.sourceDomains) ? row.meta.sourceDomains : []
        if (!sourceDomains.some((d: string) => String(d).toLowerCase().includes(domain))) return false
      }

      return true
    })

    return filtered.map((row: any) => {
      const prices = (Array.isArray(row.candidates) ? row.candidates : [])
        .map((candidate: any) => Number(candidate?.unitPrice))
        .filter((value: number) => Number.isFinite(value) && value > 0)
      const minPrice = prices.length > 0 ? Math.min(...prices) : null
      const maxPrice = prices.length > 0 ? Math.max(...prices) : null
      return {
        ...row,
        freshness: Number(row.staleAt ?? 0) > now ? 'fresh' : 'stale',
        minPrice,
        maxPrice,
        candidatesCount: Array.isArray(row.candidates) ? row.candidates.length : 0,
      }
    })
  },
})

export const getWebPriceRunDetails = query({
  args: {
    runId: v.id('webPriceRuns'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId)
  },
})

export const markWebPriceRunStale = mutation({
  args: {
    runId: v.id('webPriceRuns'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      staleAt: Date.now() - 1,
      updatedAt: Date.now(),
    })
    return { ok: true }
  },
})

export const listProjectMaterialLines = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('materialLines')
      .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
      .collect()
    return rows
      .map((line: any) => ({
        id: line._id,
        itemName: String(line.itemName ?? 'Untitled Material'),
        quantity: Number(line.quantity ?? 0),
        unitCost: Number(line.plannedUnitCost ?? 0),
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName))
  },
})

export const attachRunCandidateToLine = mutation({
  args: {
    runId: v.id('webPriceRuns'),
    materialLineId: v.id('materialLines'),
    candidateIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Run not found')
    const candidate = Array.isArray(run.candidates) ? run.candidates[args.candidateIndex] : null
    if (!candidate) throw new Error('Candidate not found')

    const line = await ctx.db.get(args.materialLineId)
    if (!line) throw new Error('Material line not found')

    const unitPrice = Number(candidate?.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('Candidate has no valid unit price')

    const now = Date.now()
    const qty = Number(line.quantity ?? 0)
    const currency = normalizeCurrency(candidate?.currency ?? run.recommended?.currency)
    const sourceType = normalizeSourceType(candidate?.sourceType)

    await ctx.db.patch(args.materialLineId, {
      itemName: line.itemName ?? run.itemHe,
      plannedUnitCost: unitPrice,
      plannedTotalCost: Number.isFinite(qty) && qty > 0 ? qty * unitPrice : unitPrice,
      pricingSourceCode: sourceType === 'catalog' ? 'catalog_manual' : sourceType === 'logged' ? 'purchase_actual' : sourceType === 'web' ? 'web' : 'estimate',
      priceCheckedAt: now,
      priceUrl: candidate?.link,
      confidence: run.confidence === 'high' ? 0.9 : run.confidence === 'medium' ? 0.65 : 0.35,
      latestWebPriceRunId: args.runId,
      updatedAt: now,
    })

    const snapshotId = await ctx.db.insert('materialLinePriceSnapshots', {
      projectId: line.projectId,
      materialLineId: args.materialLineId,
      webPriceRunId: args.runId,
      itemHe: run.itemHe,
      recommended: {
        unitPrice,
        currency,
        unitHe: candidate?.unitHe ?? run.recommended?.unitHe,
        priceBasisHe: candidate?.notesHe ?? run.recommended?.priceBasisHe,
      },
      confidence: run.confidence,
      assumptionsHe: Array.isArray(run.assumptionsHe) ? run.assumptionsHe : [],
      candidates: normalizeCandidates(run.candidates ?? [], currency),
      selectedCandidateIndex: args.candidateIndex,
      selectedSourceType: sourceType,
      appliedBy: 'reuse_attach',
      savedAt: now,
    })

    await ctx.db.patch(args.materialLineId, {
      latestPriceSnapshotId: snapshotId,
      latestWebPriceRunId: args.runId,
      updatedAt: now,
    })

    return { snapshotId }
  },
})

export const createMaterialLineFromRunCandidate = mutation({
  args: {
    runId: v.id('webPriceRuns'),
    candidateIndex: v.number(),
    projectId: v.id('projects'),
    elementId: v.optional(v.id('elements')),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Run not found')
    const candidate = Array.isArray(run.candidates) ? run.candidates[args.candidateIndex] : null
    if (!candidate) throw new Error('Candidate not found')

    const unitPrice = Number(candidate?.unitPrice ?? run.recommended?.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('Candidate has no valid unit price')

    const quantity = Number(args.quantity ?? 1)
    const now = Date.now()

    const lineId = await ctx.db.insert('materialLines', {
      projectId: args.projectId,
      elementId: args.elementId,
      itemName: run.itemHe,
      quantity,
      plannedUnitCost: unitPrice,
      plannedTotalCost: quantity * unitPrice,
      pricingSourceCode: normalizeSourceType(candidate?.sourceType) === 'web' ? 'web' : 'estimate',
      priceCheckedAt: now,
      priceUrl: candidate?.link,
      confidence: run.confidence === 'high' ? 0.9 : run.confidence === 'medium' ? 0.65 : 0.35,
      latestWebPriceRunId: args.runId,
      createdAt: now,
      updatedAt: now,
    })

    const currency = normalizeCurrency(candidate?.currency ?? run.recommended?.currency)
    const snapshotId = await ctx.db.insert('materialLinePriceSnapshots', {
      projectId: args.projectId,
      materialLineId: lineId,
      webPriceRunId: args.runId,
      itemHe: run.itemHe,
      recommended: {
        unitPrice,
        currency,
        unitHe: candidate?.unitHe ?? run.recommended?.unitHe,
        priceBasisHe: candidate?.notesHe ?? run.recommended?.priceBasisHe,
      },
      confidence: run.confidence,
      assumptionsHe: Array.isArray(run.assumptionsHe) ? run.assumptionsHe : [],
      candidates: normalizeCandidates(run.candidates ?? [], currency),
      selectedCandidateIndex: args.candidateIndex,
      selectedSourceType: normalizeSourceType(candidate?.sourceType),
      appliedBy: 'reuse_create',
      savedAt: now,
    })

    await ctx.db.patch(lineId, {
      latestPriceSnapshotId: snapshotId,
      latestWebPriceRunId: args.runId,
      updatedAt: Date.now(),
    })

    return { lineId, snapshotId }
  },
})

export const backfillFromSdkRun = mutation({
  args: {
    runId: v.id('sdkRuns'),
    projectId: v.id('projects'),
    applyToLines: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const applyToLines = args.applyToLines ?? true
    const events = await ctx.db
      .query('sdkRunEvents')
      .withIndex('by_run_type', (q: any) => q.eq('runId', args.runId).eq('type', 'tool_result'))
      .order('asc')
      .collect()

    let runsUpserted = 0
    let snapshotsCreated = 0
    let linesPatched = 0
    let recommendationsSeen = 0
    const failures: Array<{ itemHe: string, lineId: string, reason: string }> = []

    for (const event of events as any[]) {
      const toolId = String(event?.payload?.toolId ?? '')
      if (!toolId.startsWith('pricing.resolve_lines')) continue
      const output = event?.payload?.output ?? event?.payload ?? {}
      const recommendations = Array.isArray(output?.recommendations) ? output.recommendations : []

      for (const rec of recommendations) {
        recommendationsSeen += 1
        const itemHe = String(rec?.itemHe ?? '').trim()
        const recommendedPrice = Number(rec?.recommended?.unitPrice)
        if (!itemHe || !Number.isFinite(recommendedPrice) || recommendedPrice <= 0) {
          failures.push({
            itemHe,
            lineId: String(rec?.lineRef?.lineId ?? ''),
            reason: 'missing item or invalid recommended.unitPrice',
          })
          continue
        }

        try {
          const currency = normalizeCurrency(rec?.recommended?.currency)
          const candidates = normalizeCandidates(
            Array.isArray(rec?.candidates) ? rec.candidates : [],
            currency
          )
          const constraints = buildConstraints({
            region: 'IL',
            maxDeliveryDays: 7,
            unitHe: rec?.recommended?.unitHe,
          })
          const runId = await upsertRun(ctx, {
            projectId: args.projectId,
            itemHe,
            normalizedKey: normalizeKey(itemHe),
            constraints,
            recommended: {
              unitPrice: recommendedPrice,
              currency,
              unitHe: rec?.recommended?.unitHe,
              priceBasisHe: rec?.recommended?.priceBasisHe,
            },
            confidence: normalizeConfidence(rec?.confidence),
            candidates,
            assumptionsHe: Array.isArray(rec?.assumptionsHe) ? rec.assumptionsHe : [],
            summaryHe: typeof output?.summaryHe === 'string' ? output.summaryHe : undefined,
          })
          runsUpserted += 1

          if (!applyToLines) continue
          const lineIdRaw = String(rec?.lineRef?.lineId ?? '').trim()
          if (!lineIdRaw) continue

          let line: any = null
          try {
            line = await ctx.db.get(lineIdRaw as any)
          } catch {
            line = null
          }
          if (!line) {
            failures.push({ itemHe, lineId: lineIdRaw, reason: 'material line not found' })
            continue
          }

          const now = Date.now()
          const qty = Number(line.quantity ?? 0)
          await ctx.db.patch(line._id, {
            plannedUnitCost: recommendedPrice,
            plannedTotalCost: Number.isFinite(qty) && qty > 0 ? qty * recommendedPrice : recommendedPrice,
            pricingSourceCode: 'web',
            priceCheckedAt: now,
            priceUrl: candidates.find((candidate) => candidate.link)?.link,
            confidence: normalizeConfidence(rec?.confidence) === 'high'
              ? 0.9
              : normalizeConfidence(rec?.confidence) === 'medium'
                ? 0.65
                : 0.35,
            latestWebPriceRunId: runId,
            updatedAt: now,
          })
          linesPatched += 1

          const snapshotId = await ctx.db.insert('materialLinePriceSnapshots', {
            projectId: args.projectId,
            materialLineId: line._id,
            webPriceRunId: runId,
            itemHe,
            recommended: {
              unitPrice: recommendedPrice,
              currency,
              unitHe: rec?.recommended?.unitHe,
              priceBasisHe: rec?.recommended?.priceBasisHe,
            },
            confidence: normalizeConfidence(rec?.confidence),
            assumptionsHe: Array.isArray(rec?.assumptionsHe) ? rec.assumptionsHe : [],
            candidates,
            selectedCandidateIndex: undefined,
            selectedSourceType: candidates.length > 0 ? candidates[0].sourceType : undefined,
            appliedBy: 'agent',
            savedAt: now,
          })
          snapshotsCreated += 1

          await ctx.db.patch(line._id, {
            latestPriceSnapshotId: snapshotId,
            latestWebPriceRunId: runId,
            updatedAt: now,
          })
        } catch (error: any) {
          failures.push({
            itemHe,
            lineId: String(rec?.lineRef?.lineId ?? ''),
            reason: String(error?.message ?? 'unknown'),
          })
        }
      }
    }

    return {
      recommendationsSeen,
      runsUpserted,
      linesPatched,
      snapshotsCreated,
      failures: failures.slice(0, 20),
    }
  },
})

export const findBestReusableRun = query({
  args: {
    projectId: v.id('projects'),
    itemHe: v.string(),
    constraints: v.optional(v.object({
      region: v.optional(v.string()),
      maxDeliveryDays: v.optional(v.number()),
      unitHe: v.optional(v.string()),
      quantity: v.optional(v.number()),
      dimensionsKey: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const normalizedKey = normalizeKey(args.itemHe)
    const constraints = buildConstraints({
      region: args.constraints?.region,
      maxDeliveryDays: args.constraints?.maxDeliveryDays,
      unitHe: args.constraints?.unitHe,
      quantity: args.constraints?.quantity,
      dimensionsKey: args.constraints?.dimensionsKey,
    })
    const constraintsHash = buildConstraintsHash(constraints)
    const now = Date.now()

    const [projectRun, globalRun] = await Promise.all([
      ctx.db
        .query('webPriceRuns')
        .withIndex('by_project_normalized_constraints', (q: any) =>
          q
            .eq('projectId', args.projectId)
            .eq('normalizedKey', normalizedKey)
            .eq('constraintsHash', constraintsHash)
        )
        .order('desc')
        .first(),
      ctx.db
        .query('webPriceRuns')
        .withIndex('by_normalized_constraints', (q: any) =>
          q
            .eq('normalizedKey', normalizedKey)
            .eq('constraintsHash', constraintsHash)
        )
        .order('desc')
        .first(),
    ])

    const candidate = projectRun ?? (globalRun && !globalRun.projectId ? globalRun : null)
    if (!candidate) return null

    return {
      run: candidate,
      isFresh: Number(candidate.staleAt ?? 0) > now,
      normalizedKey,
      constraintsHash,
    }
  },
})
