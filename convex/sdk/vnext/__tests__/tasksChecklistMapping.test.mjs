import test from 'node:test'
import assert from 'node:assert/strict'
import { validateTasks } from '../validators/validateTasks.ts'

test('validateTasks fails when checklist is missing', () => {
  const gate = validateTasks({
    artifact: {
      tasks: [{ elementKey: 'wall', titleHe: 'הרכבה', durationHours: 2 }],
    },
  })

  assert.equal(gate.status, 'fail')
  assert.ok(gate.issues.some((issue) => issue.code === 'tasks.missing_checklist'))
})

test('validateTasks passes when checklist and done criteria exist', () => {
  const gate = validateTasks({
    artifact: {
      tasks: [
        {
          elementKey: 'wall',
          titleHe: 'הרכבה',
          durationHours: 2,
          checklist: [
            { id: 'i1', title: 'חיתוך', done: false },
            { id: 'i2', title: 'קיבוע', done: false },
          ],
          doneCriteriaHe: 'האלמנט עומד ומקובע',
        },
      ],
    },
  })

  assert.equal(gate.status, 'pass')
})
