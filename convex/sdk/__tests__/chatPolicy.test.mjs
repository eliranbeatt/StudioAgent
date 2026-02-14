import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allowedToolsForChatIntent,
  detectChatIntent,
  isWorkflowReply,
  packsForIntent,
  shouldAttachSuggestions,
} from '../chatPolicy.ts'

test('detectChatIntent routes greeting to smalltalk', () => {
  assert.equal(detectChatIntent('hi'), 'chat_smalltalk')
  assert.equal(detectChatIntent('\u05e9\u05dc\u05d5\u05dd'), 'chat_smalltalk')
})

test('detectChatIntent routes read and write intents', () => {
  assert.equal(detectChatIntent('show me my tasks and priorities'), 'project_read_qna')
  assert.equal(detectChatIntent('change budget for task 2'), 'project_write_change')
})

test('detectChatIntent routes hebrew planning request', () => {
  assert.equal(detectChatIntent('\u05ea\u05d9\u05d9\u05e6\u05e8 \u05de\u05d6\u05d4 \u05de\u05e9\u05d9\u05de\u05d5\u05ea'), 'planning_request')
})

test('workflow replies are recognized and keep write context when pending', () => {
  assert.equal(isWorkflowReply('\u05db\u05df'), true)
  assert.equal(isWorkflowReply('1'), true)
  assert.equal(detectChatIntent('\u05db\u05df', { hasPendingAction: true }), 'project_write_change')
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

test('planning intent includes changeset compile but not review', () => {
  const tools = allowedToolsForChatIntent('planning_request')
  assert.equal(tools.includes('changeset.compile'), true)
  assert.equal(tools.includes('changeset.review'), false)
})

test('write intent includes compile/apply but not review by default', () => {
  const tools = allowedToolsForChatIntent('project_write_change')
  assert.equal(tools.includes('changeset.compile'), true)
  assert.equal(tools.includes('changeset.apply'), true)
  assert.equal(tools.includes('changeset.review'), false)
})

test('suggestions attach only when useful', () => {
  assert.equal(
    shouldAttachSuggestions({
      intent: 'chat_smalltalk',
      userText: 'hi',
      summaryHe: '\u05e9\u05dc\u05d5\u05dd',
    }),
    false
  )
  assert.equal(
    shouldAttachSuggestions({
      intent: 'project_write_change',
      userText: 'change budget',
      summaryHe: '\u05d1\u05d9\u05e6\u05e2\u05ea\u05d9 \u05e9\u05d9\u05e0\u05d5\u05d9',
    }),
    true
  )
})
