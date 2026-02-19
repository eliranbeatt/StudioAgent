import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compressMaterialNameHe,
  compressTaskTitleHe,
  postProcessToolOutput,
  splitAlternativesIfExplicit,
} from '../postprocess.ts'

test('compressTaskTitleHe strips parentheses and keeps short action title', () => {
  const input = 'חיתוך והכנה (דיקט 12 מ"מ + תבנית + שיוף)'
  const result = compressTaskTitleHe(input)
  assert.equal(result.title.includes('('), false)
  assert.equal(result.title.split(' ').length <= 7, true)
  assert.equal(Boolean(result.movedDetails), true)
})

test('compressMaterialNameHe removes meta tokens and parentheses', () => {
  const input = 'PVC מוקצף (Forex) 4 מ"מ (מחיר משוער)'
  const output = compressMaterialNameHe(input)
  assert.equal(output.includes('('), false)
  assert.equal(output.includes('משוער'), false)
  assert.equal(output.split(' ').length <= 8, true)
})

test('splitAlternativesIfExplicit splits unambiguous alternatives', () => {
  const input = 'PVC מוקצף 4 מ"מ או PVC מוקצף 5 מ"מ'
  const split = splitAlternativesIfExplicit(input)
  assert.equal(split.primary.length > 0, true)
  assert.equal(split.alternatives.length, 1)
})

test('postProcessToolOutput pricing creates separate alternative recommendations', () => {
  const payload = {
    recommendations: [
      {
        lineRef: { lineTempOrId: 'line_1' },
        itemHe: 'PVC מוקצף 4 מ"מ או PVC מוקצף 5 מ"מ',
        recommended: { unitPrice: 120, currency: 'ILS', unitHe: 'פלטה' },
        confidence: 'medium',
      },
    ],
  }
  const next = postProcessToolOutput('pricing.resolve_lines', payload)
  assert.equal(Array.isArray(next.recommendations), true)
  assert.equal(next.recommendations.length, 2)
  assert.equal(next.recommendations.every((item) => !String(item.itemHe).includes('(')), true)
})
