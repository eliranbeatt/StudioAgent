# Studio Ontology

## Core entities

- `Project`: the root.
- `Element`: the main deliverable unit.
- `Task`: executable work package, usually one element each.
- `MaterialLine`: BOM / purchases / rentals / consumables / print / services.
- `WorkLine`: labor.
- `PrintPart`: print deliverable with QA implications.
- `ChangeSet`: batched proposed writes.
- `KnowledgeDoc`: durable project memory.

## Element-centric rule

Most planning should start at the element level. If something is built, printed, moved, installed, or priced, it should usually be traceable back to one or more elements.

Use project-level scope only for truly shared work like:

- transport
- meals
- general logistics
- cross-project coordination

## Task doctrine

- Tasks should be studio-real.
- Small tasks are typically 1-4 hours.
- Larger work should be split rather than hidden inside vague mega-tasks.
- Checklists should be atomic and operational.

## Work types

Canonical work types used by the SDK prompts:

- `carpentry`
- `metal_fab`
- `paint_finish`
- `printing_graphics`
- `props_sculpt`
- `rigging_install`
- `transport_logistics`
- `purchasing`
- `management`

## Accounting doctrine

Accounting is not abstract budgeting. It is the concrete cost layer for studio work:

- materials
- printing
- consumables
- rentals
- transport
- labor

Every cost-bearing task should map to work lines and/or material lines.

## Procurement doctrine

Procurement must reason about:

- buy vs build vs rent vs stock vs subcontract
- vendor and evidence links
- lead time
- online ordering feasibility
- install date and critical path

## Execution doctrine

When relevant, execution planning must cover:

- packaging / protection
- loading and unloading
- transport
- onsite installation
- quick-fix kit
- teardown / returns / storage
