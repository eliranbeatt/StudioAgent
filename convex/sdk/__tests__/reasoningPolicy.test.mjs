import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeReasoningEffort } from '../../lib/reasoning.ts'

test('model-specific effort coercion keeps gpt-5 values valid', () => {
  assert.equal(normalizeReasoningEffort('gpt-5-mini', 'none'), 'minimal')
  assert.equal(normalizeReasoningEffort('gpt-5.2', 'none'), 'minimal')
  assert.equal(normalizeReasoningEffort('gpt-5.2', 'minimal'), 'minimal')
  assert.equal(normalizeReasoningEffort('gpt-5.2', 'xhigh'), 'high')
})

test('reasoning default falls back only for o-series', () => {
  assert.equal(normalizeReasoningEffort('o3', undefined), 'medium')
  assert.equal(normalizeReasoningEffort('gpt-5-mini', undefined), undefined)
})
