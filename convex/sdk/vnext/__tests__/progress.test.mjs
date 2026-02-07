import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeStageProgress,
  shouldTriggerNoProgressGuard,
  MAX_NO_PROGRESS_CYCLES,
} from '../progress.ts'

test('computeStageProgress increments progress when signature changes', () => {
  const result = computeStageProgress({
    stageKey: 'pricing',
    specHash: 'specA',
    artifactHash: 'artA',
    runStageKey: 'pricing',
    runProgressCount: 2,
    runNoProgressCount: 1,
    runProgressKey: 'pricing:specOld:artOld',
    now: 12345,
  })

  assert.equal(result.madeProgress, true)
  assert.equal(result.progressMeta.progressCount, 3)
  assert.equal(result.progressMeta.noProgressCount, 0)
  assert.equal(result.progressMeta.lastProgressAt, 12345)
})

test('computeStageProgress increments no-progress when signature unchanged', () => {
  const result = computeStageProgress({
    stageKey: 'pricing',
    specHash: 'specA',
    artifactHash: 'artA',
    runStageKey: 'pricing',
    runProgressCount: 2,
    runNoProgressCount: 1,
    runProgressKey: 'pricing:specA:artA',
    lastProgressAt: 9999,
  })

  assert.equal(result.madeProgress, false)
  assert.equal(result.progressMeta.progressCount, 2)
  assert.equal(result.progressMeta.noProgressCount, 2)
  assert.equal(result.progressMeta.lastProgressAt, 9999)
})

test('no-progress guard triggers only at threshold without progress', () => {
  assert.equal(
    shouldTriggerNoProgressGuard({
      madeProgress: false,
      noProgressCount: MAX_NO_PROGRESS_CYCLES - 1,
    }),
    false
  )
  assert.equal(
    shouldTriggerNoProgressGuard({
      madeProgress: false,
      noProgressCount: MAX_NO_PROGRESS_CYCLES,
    }),
    true
  )
  assert.equal(
    shouldTriggerNoProgressGuard({
      madeProgress: true,
      noProgressCount: MAX_NO_PROGRESS_CYCLES + 10,
    }),
    false
  )
})
