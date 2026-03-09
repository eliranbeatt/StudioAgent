# Appendix B — Work Types and Stages

## Canonical Work Types (9)

| Key | Hebrew Label | Description |
|-----|-------------|-------------|
| `carpentry` | נגרות | Wood construction, CNC, joinery |
| `metal_fab` | מסגרות/ברזל | Metal fabrication, welding, steel structures |
| `paint_finish` | צביעה/גימור | Painting, finishing, coating, lacquer |
| `printing_graphics` | פרינט/גרפיקה | Large-format printing, signage, vinyl |
| `props_sculpt` | פיסול/אביזרים | Sculpting, props, 3D elements |
| `rigging_install` | הקמה/התקנה | Installation, rigging, assembly on-site |
| `transport_logistics` | הובלה/לוגיסטיקה | Transport, loading, delivery |
| `purchasing` | רכש/קניות | Procurement, purchasing, supplier management |
| `management` | ניהול | Project management, coordination |

## Task Stages (9)

| Key | Hebrew | Typical Duration |
|-----|--------|-----------------|
| `prep` | הכנה | Planning, measurements, approvals |
| `build` | בנייה | Core fabrication/construction |
| `finish` | גימור | Painting, finishing touches |
| `qa` | בקרת איכות | Quality checks, corrections |
| `pack` | אריזה | Packaging, protection, labeling |
| `transport` | הובלה | Loading, transport, unloading |
| `install` | התקנה | On-site assembly, rigging |
| `teardown` | פירוק | Disassembly, returns, cleanup |
| `management` | ניהול | Coordination, client communication |

## Accounting Section Keys (14)

| Key | Hebrew | Line Type |
|-----|--------|-----------|
| `materials_wood` | חומרי עץ | material |
| `materials_metal` | חומרי מתכת | material |
| `materials_paint` | חומרי צבע | material |
| `materials_print` | חומרי דפוס | material |
| `materials_props` | חומרי פיסול | material |
| `consumables` | מתכלים | material |
| `packaging` | אריזה | material |
| `transport` | הובלה | material/work |
| `meals` | ארוחות | material |
| `equipment_rental` | השכרת ציוד | material |
| `permits` | היתרים | material |
| `storage` | אחסון | material |
| `teardown` | פירוק | work |
| `management` | ניהול | work |
| `labor_direct` | עבודה (סטודיו) | work |

## Pipeline Stage Keys (6)

| Key | Description | Primary Activities |
|-----|-------------|-------------------|
| `intake` | Project intake | Brief parsing, initial questions |
| `planning` | Structural planning | Elements, tasks, dependencies |
| `costing` | Budget creation | Materials, labor, overhead |
| `quote` | Client quote | Quote draft, pricing, exclusions |
| `review` | Plan review | Audit, gap check, risk review |
| `execution` | Active execution | Daily plans, runbooks, receipts |

## VNext Stage Order (10)

```
brief → scope → concept → tasks → budget → pricing → ops → quote → audit → compile
```
