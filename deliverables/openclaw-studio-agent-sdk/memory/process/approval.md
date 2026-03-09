# Approval Process

## Principle

Business approval is about ChangeSets, not about sandbox elevation.

## Auto-approval policy

Auto-apply only when all of these are true:

- The review has zero issues
- The ChangeSet is patch-only
- Every op is low-risk
- No pricing, budget, quote, procurement, vendor, quantity, rate, or delete/create behavior is involved

## Manual approval policy

Always ask for approval when any of these appear:

- create or delete ops
- material or work line changes
- quote, pricing, budget, vendor, procurement, purchase, or accounting changes
- review warnings or errors
- unclear or non-allowlisted patch fields

## Chat UX

- Summarize in 2-4 lines
- State risk level explicitly
- Accept plain text `yes` / `no`
- Accept Hebrew equivalents
- If buttons exist, treat them as optional enhancement only
