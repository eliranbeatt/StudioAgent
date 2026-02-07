import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePricing } from '../validators/validatePricing.ts'

test('validatePricing fails when queue has pending items', () => {
  const result = validatePricing({
    pricingArtifact: {
      workQueue: [{ status: 'pending', itemName: 'Line A' }],
      pricedLines: [],
    },
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'pricing.queue_pending'))
})

test('validatePricing fails when failed items are missing reason', () => {
  const result = validatePricing({
    pricingArtifact: {
      workQueue: [{ status: 'failed', itemName: 'Line A' }],
      pricedLines: [],
    },
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'pricing.failed_without_reason'))
})

test('validatePricing fails when estimated items are missing assumption', () => {
  const result = validatePricing({
    pricingArtifact: {
      workQueue: [{ status: 'estimated', itemName: 'Line A' }],
      pricedLines: [{ itemName: 'Line A', unitPrice: 10, isEstimate: true }],
    },
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'pricing.estimated_without_reason'))
})

test('validatePricing passes for resolved queue with estimate assumptions', () => {
  const result = validatePricing({
    pricingArtifact: {
      workQueue: [
        { status: 'priced', itemName: 'Line A', reasonHe: '' },
        { status: 'estimated', itemName: 'Line B', assumptionHe: 'Web estimate' },
      ],
      pricedLines: [
        { itemName: 'Line A', unitPrice: 25, knownPriceId: 'p1', isEstimate: false },
        { itemName: 'Line B', unitPrice: 40, isEstimate: true, assumptionHe: 'Web estimate' },
      ],
    },
  })

  assert.equal(result.status, 'pass')
  assert.equal(result.issues.length, 0)
})
