const LOW_RISK_PATCH_KINDS = new Set([
  'element.patch',
  'task.patch',
])

const SAFE_PATCH_FIELDS = new Set([
  'description',
  'descriptionHe',
  'notes',
  'notesHe',
  'tags',
  'status',
  'stage',
  'priority',
  'startDate',
  'dueDate',
  'checklist',
])

const RESTRICTED_FIELD_PATTERNS = [
  /price/i,
  /cost/i,
  /budget/i,
  /quote/i,
  /procure/i,
  /purchase/i,
  /vendor/i,
  /currency/i,
  /amount/i,
  /total/i,
  /quantity/i,
  /^qty$/i,
  /rate/i,
  /leadTime/i,
]

function getPatchFields(op) {
  const patch = op?.payload?.patch
  const fields = op?.payload?.fields
  const target =
    patch && typeof patch === 'object' && !Array.isArray(patch)
      ? patch
      : fields && typeof fields === 'object' && !Array.isArray(fields)
        ? fields
        : {}
  return Object.keys(target)
}

function isRestrictedField(fieldName) {
  return RESTRICTED_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName))
}

export function evaluateChangeSetPolicy(changeSet, review) {
  const ops = Array.isArray(changeSet?.ops) ? changeSet.ops : []
  const issues = Array.isArray(review?.issues)
    ? review.issues
    : [
        ...(Array.isArray(review?.errors) ? review.errors : []),
        ...(Array.isArray(review?.warnings) ? review.warnings : []),
      ]

  const reasons = []

  if (ops.length === 0) {
    reasons.push('empty_changeset')
  }

  if (issues.length > 0) {
    reasons.push('review_has_issues')
  }

  let onlyLowRiskPatches = true
  let restrictedFieldTouched = false
  let unknownPatchField = false

  for (const op of ops) {
    const kind = String(op?.kind ?? '')
    if (!LOW_RISK_PATCH_KINDS.has(kind)) {
      onlyLowRiskPatches = false
      reasons.push(`non_low_risk_op:${kind || 'unknown'}`)
      continue
    }

    const fields = getPatchFields(op)
    for (const field of fields) {
      if (isRestrictedField(field)) {
        restrictedFieldTouched = true
        reasons.push(`restricted_field:${field}`)
      } else if (!SAFE_PATCH_FIELDS.has(field)) {
        unknownPatchField = true
        reasons.push(`non_allowlisted_patch_field:${field}`)
      }
    }
  }

  const autoApplyEligible =
    ops.length > 0 &&
    issues.length === 0 &&
    onlyLowRiskPatches &&
    !restrictedFieldTouched &&
    !unknownPatchField

  let risk = 'high'
  if (autoApplyEligible) {
    risk = 'low'
  } else if (issues.length === 0 && !restrictedFieldTouched) {
    risk = 'medium'
  }

  return {
    autoApplyEligible,
    risk,
    reasons: Array.from(new Set(reasons)),
    summary: autoApplyEligible
      ? 'Low-risk patch-only ChangeSet. Auto-apply is allowed.'
      : 'Manual approval is required.',
  }
}
