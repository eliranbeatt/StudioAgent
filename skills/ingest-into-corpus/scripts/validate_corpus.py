#!/usr/bin/env python3
"""
Validate corpus files.

Checks every .md file in the corpus for:
  - YAML frontmatter presence
  - Required common fields
  - Type-specific required fields
  - Valid type and status values
  - Filename matches id field
  - All [[wikilink]] targets in links[] resolve to actual files
  - Every [[wikilink]] in links[] also appears somewhere in the prose body

Usage:
    python validate_corpus.py [corpus-dir]

corpus-dir defaults to ../corpus relative to this script.
"""

import re
import sys
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

# ──────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────

REQUIRED_FIELDS = {"id", "title", "type", "status", "created", "updated", "source", "links"}

VALID_TYPES = {"term", "decision", "constraint", "work-item", "scenario", "person", "diagram"}

VALID_STATUSES = {
    "term":        {"active", "deprecated"},
    "decision":    {"accepted", "superseded"},
    "constraint":  {"active", "resolved"},
    "work-item":   {"active", "proposed", "done", "deprecated"},
    "scenario":    {"active", "deprecated"},
    "person":      {"active"},
    "diagram":     {"active", "deprecated"},
}

TYPE_EXTRAS = {
    "decision":  ["expires"],
    "work-item": ["item_type"],
    "diagram":   ["image"],
}

VALID_ITEM_TYPES = {"epic", "feature", "task"}

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

WIKILINK_RE = re.compile(r'^\[\[(.+?)(?:\|.+?)?\]\]$')


def parse_frontmatter(path: Path) -> Optional[dict]:
    """Return parsed YAML frontmatter dict, or None if not found."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return None
    try:
        end = text.index("---", 3)
    except ValueError:
        return None
    try:
        return yaml.safe_load(text[3:end]) or {}
    except yaml.YAMLError:
        return None


def extract_wikilink(value: str) -> Optional[str]:
    """Extract filename from '[[filename]]' or '"[[filename]]"'."""
    cleaned = str(value).strip().strip('"').strip("'")
    m = WIKILINK_RE.match(cleaned)
    return m.group(1) if m else None


def build_file_index(corpus_dir: Path) -> dict:
    """Map stem -> Path for every .md file under corpus_dir."""
    return {f.stem: f for f in corpus_dir.rglob("*.md")}


def get_node_type(path: Path) -> Optional[str]:
    """Return the 'type' field from a file's frontmatter, or None."""
    fm = parse_frontmatter(path)
    return fm.get("type") if fm else None


# ──────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────

def _prose_contains_link(wikilink: str, file_index: dict, prose: str) -> bool:
    """Return True if the prose body contains the expected wikilink form.

    For diagram targets the required form is  ![[stem.ext]]  (with ! and extension).
    For all other targets the required form is [[stem]] (plain wikilink, optional pipe alias).
    """
    target_path = file_index.get(wikilink)
    if target_path and get_node_type(target_path) == "diagram":
        # Accept ![[stem.anything]] — extension required, bare [[stem]] is NOT accepted.
        return bool(re.search(r'!\[\[' + re.escape(wikilink) + r'\.[^\]]+\]\]', prose))
    return bool(re.search(r'\[\[' + re.escape(wikilink) + r'(?:\|[^\]]+)?\]\]', prose))


def validate_file(path: Path, file_index: dict, corpus_dir: Path) -> list:
    errors = []
    rel = str(path.relative_to(corpus_dir.parent))

    fm = parse_frontmatter(path)
    if fm is None:
        return [f"{rel}: No valid YAML frontmatter"]

    # Required fields
    for field in sorted(REQUIRED_FIELDS):
        if field not in fm:
            errors.append(f"Missing required field: {field!r}")

    node_type = fm.get("type")
    node_id   = str(fm.get("id", ""))
    status    = fm.get("status")

    # Valid type
    if node_type and node_type not in VALID_TYPES:
        errors.append(f"Unknown type: {node_type!r}. Must be one of: {sorted(VALID_TYPES)}")

    # Valid status
    if node_type and node_type in VALID_STATUSES:
        allowed = VALID_STATUSES[node_type]
        if status and status not in allowed:
            errors.append(f"Invalid status {status!r} for type {node_type!r}. Allowed: {sorted(allowed)}")

    # Type-specific extra fields
    for extra in TYPE_EXTRAS.get(node_type or "", []):
        if extra not in fm:
            errors.append(f"Missing type-specific field for {node_type!r}: {extra!r}")

    # work-item item_type value
    if node_type == "work-item":
        it = fm.get("item_type")
        if it and it not in VALID_ITEM_TYPES:
            errors.append(f"Invalid item_type: {it!r}. Must be one of: {sorted(VALID_ITEM_TYPES)}")

    # Filename vs id
    if node_id:
        normalized_id = node_id.replace(" ", "-")
        if not path.stem.startswith(normalized_id):
            errors.append(f"Filename {path.stem!r} does not start with id {node_id!r}")

    # Wikilink resolution + prose presence
    text = path.read_text(encoding="utf-8")
    prose = text[text.index("---", 3) + 3:].lstrip("\n") if "---" in text[3:] else ""

    links = fm.get("links") or []
    if not isinstance(links, list):
        errors.append("'links' must be a list")
    else:
        for i, link in enumerate(links):
            if not isinstance(link, dict):
                errors.append(f"links[{i}] is not a dict")
                continue
            if "rel" not in link:
                errors.append(f"links[{i}] missing 'rel'")
            target = link.get("target", "")
            wikilink = extract_wikilink(target)
            if wikilink is None:
                errors.append(f"links[{i}] target is not a wikilink: {target!r}")
            elif wikilink not in file_index:
                errors.append(f"links[{i}] unresolved wikilink: [[{wikilink}]]")
            elif not _prose_contains_link(wikilink, file_index, prose):
                errors.append(f"links[{i}] target [[{wikilink}]] present in frontmatter but missing from prose body")

    # Diagram-specific: image file must exist and be embedded in prose
    if node_type == "diagram":
        image_file = fm.get("image")
        if image_file:
            image_path = corpus_dir / "diagrams" / image_file
            if not image_path.exists():
                errors.append(f"image file not found: {image_file!r} (expected at corpus/diagrams/{image_file})")
            if not re.search(r'!\[\[' + re.escape(image_file) + r'(?:\|[^\]]+)?\]\]', prose):
                errors.append(f"diagram image ![[{image_file}]] not embedded in prose body")

    return [f"{rel}: {e}" for e in errors]


def validate(corpus_dir: Path) -> bool:
    all_files = sorted(corpus_dir.rglob("*.md"))
    if not all_files:
        print(f"No .md files found under {corpus_dir}")
        return False

    file_index = build_file_index(corpus_dir)
    all_errors = []

    for path in all_files:
        file_errors = validate_file(path, file_index, corpus_dir)
        all_errors.extend(file_errors)

    total  = len(all_files)
    failed = len({e.split(":")[0] for e in all_errors})
    passed = total - failed

    print(f"\nCorpus validation — {total} files: {passed} passed, {failed} failed\n")

    if all_errors:
        for e in all_errors:
            print(f"  x  {e}")
        print()
        return False
    else:
        print("  ok  All files valid.\n")
        return True


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) > 1:
        corpus = Path(sys.argv[1])
    else:
        corpus = Path(__file__).resolve().parent.parent / "corpus"

    if not corpus.exists():
        sys.exit(f"Corpus directory not found: {corpus}")

    ok = validate(corpus)
    sys.exit(0 if ok else 1)
