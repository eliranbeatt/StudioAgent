import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const SETTINGS_KEY = 'featureFlags'

const DEFAULT_FLAGS: Record<string, boolean> = {
  // Core Flow Agent
  ff_flow_agent_tab: false,
  ff_flow_agent_backend: false,
  ff_flow_validators_v1: false,
  ff_flow_clarification_pack_v1: false,
  ff_flow_runner_v1: false,

  // Pricing + ops
  ff_flow_pricing_gates: false,
  ff_flow_web_pricing: false,

  // Prompt/context performance
  ff_ctx_packs_v1: false,
  ff_prompt_cache: false,
  ff_prompt_cache_24h: false,

  // Wizard
  ff_wizard_brain_dump: false,
}

function normalizeFlags(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

export function isEnabled(
  flags: Record<string, boolean> | null | undefined,
  name: string,
  defaultValue = false
): boolean {
  if (flags && typeof flags[name] === 'boolean') return flags[name]
  if (typeof DEFAULT_FLAGS[name] === 'boolean') return DEFAULT_FLAGS[name]
  return defaultValue
}

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('appSettings')
      .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
      .first()

    const stored = normalizeFlags(existing?.value)
    return { ...DEFAULT_FLAGS, ...stored }
  },
})

export const setAll = mutation({
  args: {
    flags: v.record(v.string(), v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('appSettings')
      .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
      .first()

    const next = { ...DEFAULT_FLAGS, ...args.flags }

    if (!existing) {
      await ctx.db.insert('appSettings', { key: SETTINGS_KEY, value: next })
      return
    }

    await ctx.db.patch(existing._id, { value: next })
  },
})

export const setFlag = mutation({
  args: {
    name: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('appSettings')
      .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
      .first()

    const stored = normalizeFlags(existing?.value)
    const next = { ...DEFAULT_FLAGS, ...stored, [args.name]: args.enabled }

    if (!existing) {
      await ctx.db.insert('appSettings', { key: SETTINGS_KEY, value: next })
      return
    }

    await ctx.db.patch(existing._id, { value: next })
  },
})
