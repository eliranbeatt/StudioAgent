---
id: DEC-004
title: "AutoFlow Non-Blocking Contract"
type: decision
status: accepted
created: 2026-02-24
updated: 2026-02-24
source: "docs/autoflow_v2_1_contract.md"
expires: null
tags: [architecture, agent, ux]
links:
  - rel: constrains
    target: "[[WI-002-flow-agent-autoflow]]"
---

# Decision: AutoFlow Non-Blocking Contract

## Decision
The Flow Engine runs gates to completion without waiting for user input. The Clarification Engine asks questions in chat but never blocks the flow. Users can ignore questions indefinitely; late answers affect future gates only.

## Rationale
Blocking on user input creates poor UX and slows autonomous planning. By decoupling the flow from user responses, the system can make progress while the user provides additional information at their own pace.

## Alternatives Considered
- Blocking on each gate for user approval: rejected (too slow)
- Fully autonomous with no questions: rejected (loses accuracy)

## Consequences
- Gates must handle missing answers via explicit assumptions
- Each gate records its `answerVersionUsed` for traceability
- Debug UI must show assumption and confidence data
- Audit/polish step appears only after flow completes

## Related

- Constrains [[WI-002-flow-agent-autoflow]]
