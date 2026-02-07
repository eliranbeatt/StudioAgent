import { GateResult } from '../contracts'

export function validateConcept(): GateResult {
  return { status: 'pass', issues: [], blockingQuestions: [] }
}

