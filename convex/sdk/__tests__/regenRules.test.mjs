import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyRegenCaps,
  canApplyPlanDocCas,
  shouldAllowStatusTransition,
  shouldInsertQuestionFromDedupe,
  shouldPreemptWithProjectBlockers,
} from '../regenRules.ts'

test('CAS mismatch fails apply gate', () => {
  assert.equal(canApplyPlanDocCas(3, 3), true)
  assert.equal(canApplyPlanDocCas(3, 4), false)
})

test('resolved questions are not reopened', () => {
  assert.equal(shouldAllowStatusTransition('answered', 'open'), false)
  assert.equal(shouldAllowStatusTransition('dismissed', 'open'), false)
  assert.equal(shouldAllowStatusTransition('resolved', 'resolved'), true)
  assert.equal(shouldAllowStatusTransition('open', 'dismissed'), true)
})

test('dedupe insertion requires follow-up reason when resolved duplicate exists', () => {
  assert.equal(
    shouldInsertQuestionFromDedupe({
      hasOpenWithSameDedupe: true,
      hasResolvedWithSameDedupe: false,
      followUp: false,
      whyNow: '',
    }),
    false
  )
  assert.equal(
    shouldInsertQuestionFromDedupe({
      hasOpenWithSameDedupe: false,
      hasResolvedWithSameDedupe: true,
      followUp: false,
      whyNow: ' ',
    }),
    false
  )
  assert.equal(
    shouldInsertQuestionFromDedupe({
      hasOpenWithSameDedupe: false,
      hasResolvedWithSameDedupe: true,
      followUp: true,
      whyNow: 'Need exact mounting type after scope update',
    }),
    true
  )
})

test('caps truncate extra add ops and blocker overflow', () => {
  const items = [
    { id: 'a1', blockingLevel: 'blocker' },
    { id: 'a2', blockingLevel: 'blocker' },
    { id: 'a3', blockingLevel: 'helpful' },
    { id: 'a4', blockingLevel: 'optional' },
    { id: 'a5', blockingLevel: 'blocker' },
  ]
  const result = applyRegenCaps(items, 3, 1)
  assert.equal(result.kept.length, 3)
  assert.equal(result.blockersKept, 1)
  assert.equal(result.truncated, 2)
  assert.deepEqual(result.kept.map((item) => item.id), ['a1', 'a3', 'a4'])
})

test('project blockers preempt cursor, otherwise cursor must advance', () => {
  assert.equal(
    shouldPreemptWithProjectBlockers({
      hasProjectBlockers: true,
      cursorOrderKey: 'PH/000/general/000010',
      candidateOrderKey: 'PO/000/general/000020',
    }),
    true
  )
  assert.equal(
    shouldPreemptWithProjectBlockers({
      hasProjectBlockers: false,
      cursorOrderKey: 'PH/000/general/000010',
      candidateOrderKey: 'PH/000/general/000009',
    }),
    false
  )
  assert.equal(
    shouldPreemptWithProjectBlockers({
      hasProjectBlockers: false,
      cursorOrderKey: 'PH/000/general/000010',
      candidateOrderKey: 'PH/000/general/000011',
    }),
    true
  )
})

