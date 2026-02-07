# SDK vNext Rollout Runbook

## Flags
- `ff_sdk_vnext_soft_gates`
- `ff_sdk_vnext_pricing_queue`
- `ff_sdk_vnext_stage_budgets`
- `ff_sdk_vnext_pipeline`
- `ff_sdk_vnext_ui`

## Recommended rollout order
1. Enable `ff_sdk_vnext_pipeline` and `ff_sdk_vnext_ui` for internal projects only.
2. Keep new controls enabled:
   - `ff_sdk_vnext_soft_gates=true`
   - `ff_sdk_vnext_pricing_queue=true`
   - `ff_sdk_vnext_stage_budgets=true`
3. Monitor run events for 3-5 days:
   - `vnext_stage_result`
   - `pricing_queue_snapshot`
   - `vnext_no_progress_guard`
   - `dispatch_cycle_budget_warn`
   - `vnext_stage_budget_checkpoint`
4. Ramp to all SDK projects after stable completion rate and no stuck runs.

## Rollback plan
1. If runs get stuck in pricing, set:
   - `ff_sdk_vnext_pricing_queue=false`
2. If runs over-block due to soft gates:
   - `ff_sdk_vnext_soft_gates=false`
3. If stage budgets interrupt useful long operations:
   - `ff_sdk_vnext_stage_budgets=false`
4. If severe issues continue:
   - `ff_sdk_vnext_pipeline=false`

## Validation checklist
- Successful runs end with status `completed`.
- Pricing stage shows queue progress and resolves all items or marks failures with reason.
- `needs_input` states include actionable reason text.
- No infinite spinner in SDK UI.

## Flag matrix smoke checks
Run each combination for one short internal run and verify stage transitions, pricing, and terminal status.

1. Baseline fallback
   - `ff_sdk_vnext_pipeline=true`
   - `ff_sdk_vnext_ui=true`
   - `ff_sdk_vnext_soft_gates=false`
   - `ff_sdk_vnext_pricing_queue=false`
   - `ff_sdk_vnext_stage_budgets=false`
2. Soft gates only
   - `ff_sdk_vnext_soft_gates=true`
   - `ff_sdk_vnext_pricing_queue=false`
   - `ff_sdk_vnext_stage_budgets=false`
3. Pricing queue only
   - `ff_sdk_vnext_soft_gates=false`
   - `ff_sdk_vnext_pricing_queue=true`
   - `ff_sdk_vnext_stage_budgets=false`
4. Full guarded mode
   - `ff_sdk_vnext_soft_gates=true`
   - `ff_sdk_vnext_pricing_queue=true`
   - `ff_sdk_vnext_stage_budgets=true`
