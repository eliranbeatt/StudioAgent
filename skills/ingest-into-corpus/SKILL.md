---
name: ingest-into-corpus
description: >
  Crawl a product website (or any source URL) and populate a markdown-based knowledge corpus.
  Use when the user asks to "ingest", "crawl", "add to corpus", "build a corpus from", or
  "create corpus entries for" a URL, product, documentation site, or any source material.
  The corpus stores typed knowledge nodes (terms, decisions, constraints, work items, scenarios,
  people) as markdown files with YAML frontmatter and wikilink relationships.
  Also use when the user asks to add a single entry to an existing corpus.
---

# Ingest into Corpus

## Corpus Location & Layout

```
corpus/
  terms/        TERM-NNN-slug.md
  decisions/    DEC-NNN-slug.md
  constraints/  CON-NNN-slug.md
  work-items/   WI-NNN-slug.md
  scenarios/    SCN-NNN-slug.md
  people/       PERSON-NNN-slug.md
  diagrams/     DIAG-NNN-slug.md  +  DIAG-NNN-slug.{png,svg,...}
```

Determine the corpus root using this priority order:
1. **Explicit path from the user** — if the user names a directory in their request (e.g. "ingest into `~/projects/foo/corpus`"), use that path directly.
2. **Existing `corpus/` in the workspace** — check for a `corpus/` directory relative to the workspace root.
3. **Ask** — if neither applies, ask the user where the corpus lives before proceeding.

## Crawling Mode

Choose the crawling mode automatically based on what the site requires. Do not ask the user unless the situation is ambiguous.

| Situation | Mode |
|---|---|
| Public site, no login, standard HTML | Regular fetch (`fetch_webpage`) |
| Site returns login wall, 401/403, or blank content | Agent-browser (authenticated) |
| Site is a SPA / heavy JS that doesn't render over fetch | Agent-browser |
| User explicitly says "scrape" or "use browser" | Agent-browser |
| User explicitly says "ingest" or "crawl" without qualification | Regular fetch first; fall back to agent-browser if content is missing |

**Authentication flow (agent-browser mode):**
1. Invoke the `agent-browser` skill with the source URL.
2. Pause and tell the user: "The site requires authentication. Please log in in the browser window, then let me know when you're ready."
3. Wait for the user to confirm before continuing.
4. Once confirmed, use agent-browser for all subsequent page and image fetches for this session.

## Ingestion Workflow

1. **Crawl** — fetch all pages reachable from the source URL using the appropriate mode (see above).
   Target: home, features, docs, download, about, changelog, roadmap.
   **Exception**: for ALM systems (ADO, Jira), use the Work Item Traversal strategy below instead.

2. **Identify and ingest diagrams** — for each page, identify meaningful images (architecture
   diagrams, data-flow charts, UI wireframes, component maps). Discard decorative images (icons,
   avatars, backgrounds). Use agent-browser for image fetching when in authenticated mode.

   For each diagram found:
   a. **Download** the image file to `corpus/diagrams/DIAG-NNN-slug.{ext}` using the methods below.
   b. **Create** a `corpus/diagrams/DIAG-NNN-slug.md` wrapper node.
   c. **Embed** the image in the wrapper prose: `![[DIAG-NNN-slug.ext]]`.
   d. **Write an explanation** — describe what the diagram shows (components, flows, key relationships).
   e. **Link** from the diagram to the work-item or term it documents: `rel: visualizes`.
   f. **Back-link** from the work-item/term to the diagram: `rel: visualized by`.

   **Download methods (choose the first that works):**
   1. *Public image URL* — `curl -sL "<img-src-url>" -o corpus/diagrams/DIAG-NNN-slug.ext`
   2. *Authenticated URL (SharePoint, ADO, etc.)* — navigate agent-browser directly to the image
      URL, then `agent-browser screenshot corpus/diagrams/DIAG-NNN-slug.png`.
   3. *Inline SVG* — extract with:
      ```
      agent-browser eval "document.querySelector('svg').outerHTML"
      ```
      then write the result to `corpus/diagrams/DIAG-NNN-slug.svg` via a Python one-liner.
   4. *Base64 data-URI* — extract `img.src` via `agent-browser eval` and decode with:
      ```
      python3 -c "import base64,sys; open('corpus/diagrams/DIAG-NNN-slug.png','wb').write(base64.b64decode(sys.stdin.read().split(',',1)[1]))" <<< "<DATA_URI>"
      ```

   **Finding diagrams on a page:**
   ```js
   // Run via: agent-browser eval "JSON.stringify(...)"
   JSON.stringify(
     Array.from(document.querySelectorAll('img'))
       .filter(img => img.naturalWidth > 200 && img.naturalHeight > 100)
       .map(img => ({ src: img.src, alt: img.alt, w: img.naturalWidth, h: img.naturalHeight }))
   )
   ```

3. **Classify** — for each piece of information (text or image-derived), assign a type (see Classification Rules below).

4. **Assign IDs** — scan existing files to find the highest NNN per type prefix; continue from there.
   Never reuse a retired ID; leave gaps.

5. **Write files** — one `.md` file per node. See `references/schema.md` for full field specs
   and one complete example per type.

6. **Validate** — after all files are written, run:
   ```
   python scripts/validate_corpus.py [corpus-dir]
   ```
   Fix every reported error before finishing.

---

## ALM / Work Item Traversal (ADO & Jira)

When the source URL is an ADO work item or a Jira issue, the ingestion is **hierarchy-first**,
not page-crawl-first. A single URL is just the entry point into a tree.

### Traversal Strategy

```
Given a starting URL (any level in the hierarchy):
  1. Navigate to the item and extract its data.
  2. If the item has a PARENT, navigate UP to the parent and extract it too —
     stop at the top of the relevant scope (don't ingest an entire project backlog).
  3. Navigate DOWN to every direct child listed on the page.
     For each child: extract data, collect its children links, recurse.
  4. Continue recursing until there are no more children (leaf nodes).
```

**Scope default**: full recursive traversal — ingest the starting item, its parent (if present), and the entire subtree beneath it. Do NOT stop at any arbitrary depth. Continue until leaves.

Only halt expansion early if the user explicitly scopes it (e.g. "just the epic, not the tasks") or if child items are clearly out of scope (e.g. linking to a completely different project/team).

### ADO-Specific Extraction

ADO uses minified/obfuscated React class names — **never rely on `[class*="..."]` selectors**.
Instead, use these reliable extraction patterns in order of preference:

```js
// 1. Main form text dump — most reliable; parse labels/values from visible text
document.querySelector('[class*="work-item-form"]')?.innerText

// 2. Aria-label scan — structured but sparse
Array.from(document.querySelectorAll('[aria-label]'))
  .map(el => ({ label: el.getAttribute('aria-label'), text: el.innerText?.trim() }))
  .filter(x => x.label && x.text && x.text.length < 300)

// 3. Input values — for title and editable combo fields
Array.from(document.querySelectorAll('input[value], textarea'))
  .map(el => ({ name: el.name || el.getAttribute('aria-label') || el.id, value: el.value }))
  .filter(x => x.value && x.name)

// 4. Child work item links
Array.from(document.querySelectorAll('a[href*="workitems/edit"]'))
  .map(a => ({ id: a.href.match(/\/edit\/(\d+)/)?.[1], text: a.innerText.trim(), href: a.href }))
```

From the `innerText` dump, parse fields by looking for label–value pairs separated by newlines
(ADO renders "State\nActive" or "Area\nContextUP / Data Platform" as adjacent lines).

**Quill / rich-text fields** (Description, Acceptance Criteria): content lives in `.ql-editor`
inside an iframe-like sandboxed region. If `innerText` is blank for description, try:
```js
document.querySelector('.ql-editor')?.innerText
```

### Jira-Specific Extraction

Jira (Cloud) renders work items as a two-column layout with stable `data-testid` attributes:

```js
// Title
document.querySelector('[data-testid="issue.views.field.summary.title"]')?.innerText

// Status / Type / Priority badges
document.querySelectorAll('[data-testid*="lozenge"]')
  .forEach(el => console.log(el.innerText))

// Description (Atlassian Document Format rendered)
document.querySelector('[data-testid="issue.views.field.description.rendered-field"]')?.innerText

// Child issues panel
document.querySelectorAll('[data-testid*="child-issues"] a')
  .map(a => ({ text: a.innerText.trim(), href: a.href }))

// Parent link
document.querySelector('[data-testid*="parent-link"]')?.innerText
```

### Work Item Type → Corpus Type Mapping

| ADO Type | Jira Type | Corpus `item_type` |
|---|---|---|
| Epic | Epic | `epic` |
| Feature | Story | `feature` |
| User Story | Story | `feature` |
| Task / Sub-task | Task / Sub-task | `task` |
| Bug | Bug | `constraint` (if it's a known limitation) or `task` |

A `feature`-level item must still get 2+ Gherkin scenario children (see Feature → Scenario Rule).
`epic` and `task` items do **not** require scenarios.

### Navigation Order

Navigate items in this order so that parent IDs exist before children reference them:
1. Root / top-level ancestor first
2. Direct children next
3. Grandchildren last

Use `agent-browser navigate` or `open <url>` between items; always wait for the page to fully
load before extracting (`wait --load networkidle`).

## Classification Rules

| What you found | Type | Notes |
|---|---|---|
| Named product, technology, concept, or vocabulary word | `term` | |
| Named capability the product ships today | `work-item` (feature) | Requires Gherkin scenarios |
| Roadmap / wishlist / future capability | `work-item` (epic or feature) | `status: proposed` |
| Architectural or design choice with rationale | `decision` | Needs `expires` field |
| Limitation, restriction, or known boundary | `constraint` | |
| Person, team, or org mentioned explicitly | `person` | |
| Behavioral test of a feature | `scenario` | Gherkin; child of a feature WI |
| Architecture/flow/UI/wireframe diagram embedded in a page | `diagram` | Download image; create DIAG wrapper with `![[...]]` embed and explanation |

**Never** model a named feature as a `term`. If it's a user-facing capability, it is a
`work-item/feature`.

## Source & Status Rules

- Content found directly on the source site → `status: active`, `source: <exact URL>`
- Item inferred or proposed by you (AI) → `status: proposed`, `source: "AI-proposed from <url>"`
- Decision has been made and is in effect → `status: accepted`

## Feature → Scenario Rule

Every `work-item` with `item_type: feature` must have at least 2 Gherkin scenario children.

- Write 2–4 scenarios per feature covering the main happy path and one edge case.
- Each scenario file links back: `{rel: describes, target: "[[WI-NNN-slug]]"}`
- The parent feature lists each child: `{rel: includes scenario, target: "[[SCN-NNN-slug]]"}`

## Quality Rules (check at write time, not at audit time)

1. **Verify UI against documented features** — never write a `When` step that uses a UI element
   not confirmed in the product's feature list.
2. **No hardcoded dates** — use `YYYY-MM-DD` as a placeholder in Gherkin `Then` clauses.
3. **Don't overspecify UI state** — only assert observable outcomes explicitly documented.
4. **Use correct dependency strength** — `depends on` = hard prerequisite with no workaround;
   `related to` = soft or optional relationship.
5. **Every frontmatter link must appear in prose** — every `[[wikilink]]` declared in `links[]`
   must also appear somewhere in the markdown body. If the link doesn't arise naturally in the
   prose, add a `## Related` section at the end of the file and list it there, e.g.:
   ```markdown
   ## Related

   - Part of [[WI-012-remote-corpus-access]]
   - Describes [[WI-006-wikilink]]
   ```
   The validator enforces this: a link present only in frontmatter but absent from prose is an error.
   **Exception for diagram links in prose**: when a wikilink in the prose body points to a diagram
   node, it must use `![[DIAG-NNN-slug.ext]]` (with `!` prefix and file extension), not plain
   `[[DIAG-NNN-slug]]`. The corresponding frontmatter `links[]` entry still uses the plain
   `[[DIAG-NNN-slug]]` form (no `!`, no extension) because frontmatter is metadata, not a render
   directive.
6. **Diagram nodes must embed and explain** — every `diagram` node's `.md` file must:
   - Embed its image with `![[DIAG-NNN-slug.ext]]` in the prose body.
   - Include a plain-English explanation of what the diagram shows.
   The validator checks that the `![[...]]` embed is present.
7. **All diagram references in prose must include extension and `!` prefix** — any wikilink in
   a markdown body that references a diagram image or diagram node must be written as
   `![[filename.ext]]` (e.g. `![[DIAG-001-html-link-diagram.png]]`). Never write a bare
   `[[DIAG-NNN-slug]]` in prose; always include the file extension and the `!` so the image
   renders inline.

## Ownership Rule

Do not add an `owner` field anywhere. The only "created by" relationship lives on the root
product term pointing to the creator person node.

## Relationship Verbs

See `references/schema.md` for the full approved verb list.
For novel relationships not on the list, choose the nearest existing verb; only coin new verbs
if none fit.
