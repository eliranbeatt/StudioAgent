import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeReasoningEffort } from '../../lib/reasoning.ts'

test('gpt-5 none is coerced to minimal and explicit effort is preserved', () => {
  assert.equal(normalizeReasoningEffort('gpt-5-mini', 'none'), 'minimal')
  assert.equal(normalizeReasoningEffort('gpt-5.2', 'minimal'), 'minimal')
})

test('reasoning default falls back only for o-series', () => {
  assert.equal(normalizeReasoningEffort('o3', undefined), 'medium')
  assert.equal(normalizeReasoningEffort('gpt-5-mini', undefined), undefined)
})
