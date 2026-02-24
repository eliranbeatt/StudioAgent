# Corpus Schema Reference

## Common Frontmatter (all types)

```yaml
id: TYPE-NNN               # e.g. TERM-001, WI-006, SCN-012
title: "Human-readable title"
type: term | decision | constraint | work-item | scenario | person
status: <see per-type below>
created: YYYY-MM-DD
updated: YYYY-MM-DD
source: "https://..." | "AI-proposed from https://..."
tags: [tag1, tag2]
links:
  - rel: <verb>
    target: "[[filename-without-extension]]"
```

## Type-Specific Fields

| Type | Extra required fields | Valid statuses |
|---|---|---|
| `term` | — | active, deprecated |
| `decision` | `expires: null \| YYYY-MM-DD` | accepted, superseded |
| `constraint` | — | active, resolved |
| `work-item` | `item_type: epic \| feature \| task` | active, proposed, done, deprecated |
| `scenario` | — | active, deprecated |
| `person` | — | active |
| `diagram` | `image: filename.{ext}` | active, deprecated |

## File Naming

`{TYPE-PREFIX}-{NNN}-{slug}.md`

- `NNN`: zero-padded 3-digit integer (001, 002, …)
- `slug`: lowercase, hyphens only, derived from title. No special chars.
- Examples: `TERM-001-draglass.md`, `WI-006-wikilink.md`, `SCN-001-wikilink-navigate.md`

ID gaps (retired IDs) are intentional — never renumber.

## Approved Relationship Verbs

```
created by      uses            implements      includes feature
includes scenario  is part of   defined by      formalized in
implemented by  selected by     powered by      used by
enables         visualized by   visualizes      depends on      constrains
defines         selects         resolves        blocks
applies to      is consequence of   extends     describes
supports        related to
```

---

## Complete Examples

### term

```yaml
---
id: TERM-002
title: "Vault"
type: term
status: active
created: 2026-02-22
updated: 2026-02-22
source: "https://example.com/docs"
tags: [core-concept, storage]
links:
  - rel: defined by
    target: "[[DEC-004-markdown-as-storage]]"
  - rel: constrains
    target: "[[CON-002-web-no-filesystem]]"
---

# Vault

A Vault is a folder of `.md` files that the application treats as a single knowledge base.
```

### decision

```yaml
---
id: DEC-001
title: "Local-First Architecture"
type: decision
status: accepted
created: 2026-02-22
updated: 2026-02-22
source: "https://example.com"
expires: null
tags: [architecture, privacy]
links:
  - rel: implements
    target: "[[TERM-008-local-first]]"
  - rel: constrains
    target: "[[TERM-001-product]]"
---

# Decision: Local-First Architecture

## Decision
All user data is stored locally. No cloud backend, no telemetry.

## Rationale
Privacy is a first-class value.

## Alternatives Considered
- Cloud sync: rejected (requires server trust).

## Consequences
Users are responsible for backups.

## Revisit When
Strong demand for built-in collaboration arises.
```

### constraint

```yaml
---
id: CON-001
title: "No Pre-Built Binaries Available"
type: constraint
status: active
created: 2026-02-22
updated: 2026-02-22
source: "https://example.com/download"
tags: [distribution, adoption]
links:
  - rel: blocks
    target: "[[WI-001-prebuilt-binaries]]"
---

# Constraint: No Pre-Built Binaries Available

## Description
No release binaries published yet. Users must build from source.

## Impact
High barrier to entry for non-technical users.

## Resolution Path
[[WI-001-prebuilt-binaries]] targets this directly.

## Lifted When
Binaries published for all supported platforms.
```

### work-item (feature)

```yaml
---
id: WI-006
title: "Wikilink"
type: work-item
item_type: feature
status: active
created: 2026-02-22
updated: 2026-02-22
source: "https://example.com/features"
tags: [core-feature, navigation]
links:
  - rel: is part of
    target: "[[TERM-001-product]]"
  - rel: includes scenario
    target: "[[SCN-001-wikilink-navigate]]"
  - rel: includes scenario
    target: "[[SCN-002-wikilink-create-note]]"
---

# Feature: Wikilink

Connect notes using `[[double bracket]]` syntax.

## Behavior
- Clicking a wikilink opens the target note; creates it if absent.
- Case-insensitive matching.

## Scenarios
- [[SCN-001-wikilink-navigate]]
- [[SCN-002-wikilink-create-note]]
```

### work-item (epic)

```yaml
---
id: WI-001
title: "Distribute Pre-Built Binaries"
type: work-item
item_type: epic
status: proposed
created: 2026-02-22
updated: 2026-02-22
source: "AI-proposed from https://example.com/download"
tags: [distribution, release]
links:
  - rel: resolves
    target: "[[CON-001-no-prebuilt-binaries]]"
---

# Epic: Distribute Pre-Built Binaries

Build and publish installer binaries for Windows, macOS, and Linux.
```

### scenario

````yaml
---
id: SCN-001
title: "Navigate to existing note via wikilink"
type: scenario
status: active
created: 2026-02-22
updated: 2026-02-22
source: "https://example.com/features"
tags: [wikilink, navigation]
links:
  - rel: describes
    target: "[[WI-006-wikilink]]"
---

# Scenario: Navigate to existing note via wikilink

```gherkin
Feature: Wikilink navigation

  Scenario: Navigate to an existing note via wikilink
    Given I have a note "Note A" open in the editor
    And a note "Note B" exists in the vault
    And "Note A" contains the text [[Note B]]
    When I click the wikilink [[Note B]] in Live Preview mode
    Then "Note B" becomes the active note in the editor
```
````

### person

```yaml
---
id: PERSON-001
title: "jsmith"
type: person
status: active
created: 2026-02-22
updated: 2026-02-22
source: "https://github.com/jsmith"
tags: [creator, maintainer]
links:
  - rel: created
    target: "[[TERM-001-product]]"
---

# jsmith

Creator and maintainer of [[TERM-001-product|Product]].
```

### diagram

```yaml
---
id: DIAG-001
title: "ContextUP Architecture Overview"
type: diagram
status: active
created: 2026-02-22
updated: 2026-02-22
source: "https://example.com/docs/architecture"
image: "DIAG-001-contextup-architecture-overview.png"
tags: [architecture, overview]
links:
  - rel: visualizes
    target: "[[WI-011-contextup-mvp]]"
---

# Diagram: ContextUP Architecture Overview

![[DIAG-001-contextup-architecture-overview.png]]

**Explanation**: This diagram shows the three top-level layers of the ContextUP MVP:
the browser extension (left), the BFF (middle), and the remote corpus service (right).
Arrows indicate data flow: the extension sends a context query to the BFF, which
forwards it to the corpus service and returns enriched suggestions.

Key components visible:
- **Extension** — captures editor context and sends payloads.
- **BFF** — NestJS gateway; handles auth and request routing.
- **Corpus Service** — reads/writes markdown files; returns ranked nodes.

## Related

- Visualizes [[WI-011-contextup-mvp]]
```
