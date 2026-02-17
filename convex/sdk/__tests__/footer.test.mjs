import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureSuggestionFooter } from '../footer.ts'

test('ensureSuggestionFooter accepts multi-line numbered options', () => {
    const text = `
Here is a suggestion.
1) Option A
2) Option B
  `.trim()

    const result = ensureSuggestionFooter(text)
    // It should NOT append the fallback
    assert.equal(result, text)
})

test('ensureSuggestionFooter accepts Hebrew "Choose one"', () => {
    const text = `בחר אחת מהאפשרויות הבאות:
1) אופציה א
2) אופציה ב
`
    const result = ensureSuggestionFooter(text)
    assert.deepEqual(result.trim().split('\n'), text.trim().split('\n'))
})

test('ensureSuggestionFooter appends fallback when no footer present', () => {
    const text = "Just some text."
    const result = ensureSuggestionFooter(text)
    assert.ok(result.includes('אפשרויות המשך'))
})
