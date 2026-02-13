import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allowedToolsForChatIntent,
  detectChatIntent,
  packsForIntent,
  shouldAttachSuggestions,
} from '../chatPolicy.ts'

test('detectChatIntent routes greeting to smalltalk', () => {
  assert.equal(detectChatIntent('hi'), 'chat_smalltalk')
  assert.equal(detectChatIntent('שלום'), 'chat_smalltalk')
})

test('detectChatIntent routes read and write intents', () => {
  assert.equal(detectChatIntent('show me my tasks and priorities'), 'project_read_qna')
  assert.equal(detectChatIntent('change budget for task 2'), 'project_write_change')
})

test('chat smalltalk has no bootstrap packs and no tools', () => {
  assert.deepEqual(packsForIntent('chat_smalltalk', 'hi'), [])
  assert.deepEqual(allowedToolsForChatIntent('chat_smalltalk'), [])
})

test('audit intent allows audit tool explicitly', () => {
  const tools = allowedToolsForChatIntent('audit_request')
  assert.equal(tools.includes('audit.project'), true)
  assert.equal(tools.includes('context.get'), true)
})

test('suggestions attach only when useful', () => {
  assert.equal(
    shouldAttachSuggestions({
      intent: 'chat_smalltalk',
      userText: 'hi',
      summaryHe: 'שלום',
    }),
    false
  )
  assert.equal(
    shouldAttachSuggestions({
      intent: 'project_write_change',
      userText: 'change budget',
      summaryHe: 'ביצעתי שינוי',
    }),
    true
  )
})
