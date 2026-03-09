---
id: TERM-012
title: "Material Catalog"
type: term
status: active
created: 2026-02-24
updated: 2026-02-24
source: "convex/schema.ts"
tags: [core-concept, inventory, procurement]
links:
  - rel: is part of
    target: "[[TERM-001-studio-agent]]"
---

# Material Catalog

The Material Catalog is a hierarchical system for managing materials, pricing, and procurement:

- **materialCategories** — top-level groupings (e.g., wood, metal, fabric)
- **materialTemplates** — specific material types with attribute definitions and default UOM
- **materialVariants** — concrete SKUs with specific dimensions and attributes
- **catalogPriceRecords** — unified price memory across vendors, web, and purchases
- **catalogSynonyms** — search aliases for templates
- **pricingFormulas** — calculation formulas for prints and services

The catalog supports multiple pricing models (per_unit, per_sheet, per_m2, tiered, formula) and tracks vendor-specific pricing, availability, lead times, and order methods.

- Supabase: considered but Convex's developer experience and type safety won

## Consequences
- All backend logic must be written in Convex functions
- Schema changes require careful migration planning
- Vendor lock-in to [[TERM-002-convex]] platform

## Related

- Implements [[TERM-002-convex]]
- Constrains [[TERM-001-studio-agent]]
