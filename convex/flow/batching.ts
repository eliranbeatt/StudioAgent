
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'

export type BatchSelection = {
  elementIds: Id<'elements'>[]
  batchId: string // e.g., "loc_A_sys_B_1"
  reason?: string // "Location: Kitchen, System: Cabinetry"
}

// Deterministic batch selection helper
export function selectBatch(
  elements: Array<{
    _id: Id<'elements'>
    location?: string
    system?: string
    subSystem?: string
  }>,
  limit: number = 5
): BatchSelection | null {
  if (elements.length === 0) return null

  // Sort by stable key: location -> system -> _id
  const sorted = [...elements].sort((a, b) => {
    const locA = a.location || ''
    const locB = b.location || ''
    if (locA !== locB) return locA.localeCompare(locB)
    
    const sysA = a.system || ''
    const sysB = b.system || ''
    if (sysA !== sysB) return sysA.localeCompare(sysB)
    
    return a._id.localeCompare(b._id)
  })

  // Take top N
  const batch = sorted.slice(0, limit)
  
  // Create a stable batch ID (hash or concat)
  const first = batch[0]
  const batchId = `b_${first.location || 'noloc'}_${first.system || 'nosys'}_${batch.length}`.replace(/[^a-zA-Z0-9_]/g, '')

  return {
    elementIds: batch.map(e => e._id),
    batchId,
    reason: `Batch of ${batch.length} elements (Location: ${first.location || 'N/A'}, System: ${first.system || 'N/A'})`
  }
}
