# ChangeSet Operations Reference

## Exact TypeScript Operation Kinds

Here are the **exact** operation kinds supported by `applyChangeSetInternalLogic()` in `convex/changeSets.ts`:

---

## Project Operations

**Currently NO project.patch operation exists in the codebase.** Projects are updated through other mechanisms, not via ChangeSets.

---

## Element Operations

### `element.create`
Creates a new element.

**Payload Structure:**
```typescript
{
  kind: "element.create",
  payload: {
    tempId?: string,           // Temporary ID for cross-referencing
    element: {
      title?: string,           // Element title (default: "Untitled Element")
      type?: string,            // "build" | "rent" | "buy" | "print" | "transport" | "install" | "subcontract" | "mixed"
    },
    draft?: any                 // Optional draft data
  }
}
```

**Type Normalization:**
- Accepts: `"build"`, `"rent"`, `"buy"`, `"print"`, `"transport"`, `"install"`, `"subcontract"`, `"mixed"`
- Aliases: `"purchase"|"procure"|"procurement"` → `"buy"`, `"vendor"|"external"` → `"subcontract"`
- Default: `"build"`

**Behavior:**
- Always creates with `status: "approvedForQuote"` and `rev: 1`
- `tempId` is stored in `elementTempMap` for cross-referencing in the same ChangeSet

---

### `element.patch`
Updates an existing element.

**Payload Structure:**
```typescript
{
  kind: "element.patch",
  payload: {
    elementId?: string,        // Actual element ID (required if no tempId)
    elementTempOrId?: string,  // Temp ID or actual ID
    patch: {
      title?: string,
      description?: string,
      type?: string,
      status?: string,
      tags?: string[],
      // ... any other element fields
    }
  }
}
```

**Behavior:**
- Increments `rev` automatically
- Sets `hasUnapprovedChanges: false`

---

## Task Operations

### `task.create`
Creates a new task.

**Payload Structure:**
```typescript
{
  kind: "task.create",
  payload: {
    tempId?: string,           // Temporary ID for cross-referencing
    elementTempOrId?: string,  // Link to element (temp or actual ID)
    elementId?: string,        // Direct element ID
    fields: {
      title?: string,           // Task title (default: "Untitled Task")
      description?: string,
      status?: string,          // Default: "TODO"
      priority?: string,
      category?: string,
      startDate?: string,
      endDate?: string,
      estimatedHours?: number,
      estimatedMinutes?: number,
      assignee?: string,
      dependencies?: string[],  // Array of task IDs (can be tempIds)
      
      // V3 fields
      stage?: string,           // "clarification" | "quote" | "procurement" | "build" | "install" | "teardown" | "accounting"
      workType?: string,        // "carpentry" | "metal_fab" | "paint_finish" | "printing_graphics" | "props_sculpt" | "rigging_install" | "transport_logistics" | "purchasing" | "management"
      workTypeLabelHe?: string,
      plannedStartDate?: string,
      plannedEndDate?: string,
      durationBucket?: string,
      checklist?: Array<{
        id: string,
        title: string,
        description?: string,
        workType?: string,
        workTypeLabelHe?: string,
        estimatedHours?: number,
        estimatedMinutes?: number,
        order?: number,
        done?: boolean,
        dependsOnItemIds?: string[]
      }>,
      accountingLinks?: Array<{
        lineType: "material" | "work",
        lineId: string,         // Can be tempId - will be resolved
        relation?: "primary" | "supporting",
        note?: string
      }>,
      dedupKey?: string         // For identifying duplicate tasks
    }
  }
}
```

**De-duplication:**
- If `dedupKey` is provided, checks for existing task with same `dedupKey`
- Otherwise, checks for existing task with same **title** (case-insensitive, trimmed) within the element
- If found, **patches the existing task** instead of creating a new one

**Behavior:**
- `tempId` is stored in `taskTempMap` for cross-referencing
- Task title is also stored in `taskTitleMap` for title-based lookups
- Dependencies are resolved after all tasks are created

---

### `task.patch`
Updates an existing task.

**Payload Structure:**
```typescript
{
  kind: "task.patch",
  payload: {
    taskId?: string,           // Actual task ID (required if no tempId)
    taskTempOrId?: string,     // Temp ID or actual ID
    fields: {
      title?: string,
      description?: string,
      status?: string,
      priority?: string,
      category?: string,
      startDate?: string,
      endDate?: string,
      estimatedHours?: number,
      assignee?: string,
      stage?: string,
      workType?: string,
      workTypeLabelHe?: string,
      plannedStartDate?: string,
      plannedEndDate?: string,
      durationBucket?: string,
      checklist?: Array<...>,
      accountingLinks?: Array<...>,
      dedupKey?: string,
      // ... any other task fields
    }
  }
}
```

**Behavior:**
- Audit log entry is created with before/after state

---

### `task.delete`
**HARD DELETE** - Permanently removes a task.

**Payload Structure:**
```typescript
{
  kind: "task.delete",
  payload: {
    taskId?: string,
    taskTempOrId?: string
  }
}
```

**⚠️ WARNING: This is a DESTRUCTIVE operation!**
- Permanently deletes the task from the database
- Use `task.patch` with `status: "archived"` for **non-destructive archival**

---

### ✅ **NON-DESTRUCTIVE ARCHIVE PATTERN (Recommended)**

**Instead of `task.delete`, use:**
```typescript
{
  kind: "task.patch",
  payload: {
    taskId: "...",
    fields: {
      status: "archived"  // Non-destructive soft delete
    }
  }
}
```

This is the **recommended approach** for "archiving" tasks without losing data.

---

## Material Line Operations

### `materialLine.create`
Creates a new material/BOM line.

**Payload Structure:**
```typescript
{
  kind: "materialLine.create",
  payload: {
    tempId?: string,           // For cross-referencing
    elementTempOrId?: string,  // Element reference
    elementId?: string,        // Direct element ID
    taskTempOrId?: string,     // Task reference (can be tempId)
    taskRef?: any,             // Alternative task reference
    elementScope?: string,     // "project" | "projectLevel" | "global"
    projectLevel?: boolean,    // Force project-level (not element-scoped)
    fields: {
      itemName: string,        // REQUIRED
      title?: string,
      spec?: string,
      quantity?: number,
      uomCode?: string,        // "ea" | "sheet" | "m" | "m2" | "m3" | "kg" | "l" | "set" | "box" | "roll" | "pack" | "job" | "hour"
      plannedUnitCost?: number,
      plannedTotalCost?: number,
      actualUnitCost?: number,
      actualTotalCost?: number,
      vendorName?: string,
      sectionKey?: string,     // Accounting section
      sectionLabelHe?: string,
      procurementCode?: string, // "in_stock" | "local_buy" | "import" | "rental"
      pricingModel?: string,   // "per_unit" | "per_sheet" | "per_m" | "per_m2" | "per_pack" | "tiered" | "formula" | "unknown"
      // ... other fields
    }
  }
}
```

**Element Resolution:**
- If `elementId` or `elementTempOrId` provided → uses that
- Else if `projectLevel: true` → project-level line (no element)
- Else if `taskId` provided → uses task's elementId
- Otherwise → undefined

**Behavior:**
- Creates or resolves accounting section based on `sectionKey`/`sectionLabelHe`
- `tempId` stored in `materialLineTempMap` for task accounting links

---

### `materialLine.patch`
Updates an existing material line.

**Payload Structure:**
```typescript
{
  kind: "materialLine.patch",
  payload: {
    lineId: string,            // REQUIRED
    fields: {
      itemName?: string,
      quantity?: number,
      plannedUnitCost?: number,
      actualUnitCost?: number,
      // ... any materialLine field
    }
  }
}
```

---

### `materialLine.delete`
**HARD DELETE** - Permanently removes a material line.

**Payload Structure:**
```typescript
{
  kind: "materialLine.delete",
  payload: {
    lineId: string
  }
}
```

**⚠️ WARNING: Destructive operation!**

---

## Work Line Operations

### `workLine.create`
Creates a new labor/work line.

**Payload Structure:**
```typescript
{
  kind: "workLine.create",
  payload: {
    tempId?: string,
    elementTempOrId?: string,
    elementId?: string,
    taskTempOrId?: string,
    taskRef?: any,
    elementScope?: string,
    projectLevel?: boolean,
    fields: {
      roleHe: string,          // REQUIRED (Hebrew role name)
      title?: string,
      plannedQuantity?: number,
      plannedUnitCost?: number,
      plannedTotalCost?: number,
      actualQuantity?: number,
      actualUnitCost?: number,
      actualTotalCost?: number,
      status?: string,
      assignee?: string,
      sectionKey?: string,
      sectionLabelHe?: string,
      // ... other fields
    }
  }
}
```

**Same element resolution logic as `materialLine.create`**

---

### `workLine.patch`
Updates an existing work line.

**Payload Structure:**
```typescript
{
  kind: "workLine.patch",
  payload: {
    lineId: string,            // REQUIRED
    fields: {
      roleHe?: string,
      plannedQuantity?: number,
      plannedUnitCost?: number,
      status?: string,
      // ... any workLine field
    }
  }
}
```

---

### `workLine.delete`
**HARD DELETE** - Permanently removes a work line.

**Payload Structure:**
```typescript
{
  kind: "workLine.delete",
  payload: {
    lineId: string
  }
}
```

**⚠️ WARNING: Destructive operation!**

---

## Generic Accounting Line Operations (Legacy)

### `accountingLine.create`
Creates a material OR work line (automatically determined).

**Payload Structure:**
```typescript
{
  kind: "accountingLine.create",
  payload: {
    elementTempOrId?: string,
    elementId?: string,
    taskTempOrId?: string,
    fields: {
      lineType: "material" | "work",  // REQUIRED
      // ... rest depends on lineType (see materialLine/workLine.create)
    }
  }
}
```

**Behavior:**
- If `lineType === "material"` → creates materialLine
- If `lineType === "work"` → creates workLine
- Also accepts Hebrew: "חומר"/"חומרים" → material, "עבודה"/"כח אדם" → work

---

### `accountingLine.patch`
Updates a material OR work line.

**Payload Structure:**
```typescript
{
  kind: "accountingLine.patch",
  payload: {
    accountingLineId?: string,
    lineId?: string,
    fields: {
      lineType?: "material" | "work",
      // ... fields to update
    }
  }
}
```

**Behavior:**
- Queries both `materialLines` and `workLines` to find the line
- Updates whichever type it finds

---

### `accountingLine.delete`
**HARD DELETE** - Removes material OR work line.

**Payload Structure:**
```typescript
{
  kind: "accountingLine.delete",
  payload: {
    accountingLineId?: string,
    lineId?: string,
    lineType?: "material" | "work"
  }
}
```

---

## Task-Accounting Link Operations

### `taskAccountingLink.create`
Links a task to a work line.

**Payload Structure:**
```typescript
{
  kind: "taskAccountingLink.create",
  payload: {
    fields: {
      taskId?: string,
      taskTempOrId?: string,
      workLineId: string,      // REQUIRED (can be tempId)
      relation?: "primary" | "supporting"
    }
  }
}
```

**Behavior:**
- Creates entry in `taskAccountingLinks` table
- Prevents duplicates (same task + workLine)

---

### `taskAccountingLink.delete`
Removes a task-workLine link.

**Payload Structure:**
```typescript
{
  kind: "taskAccountingLink.delete",
  payload: {
    fields: {
      linkId?: string,          // Direct link ID
      // OR composite key:
      taskId?: string,
      workLineId?: string
    }
  }
}
```

---

## Vendor Operations

### `vendor.create`
Creates or updates a vendor.

**Payload Structure:**
```typescript
{
  kind: "vendor.create",
  payload: {
    tempId?: string,
    fields: {
      name: string,            // REQUIRED
      type?: string,           // Default: "general"
      phone?: string,
      email?: string,
      address?: string,
      notes?: string,
      active?: boolean         // Default: true
    }
  }
}
```

**Behavior:**
- If vendor with same **name** exists → **patches it**
- Otherwise → creates new vendor
- `tempId` stored in `vendorTempMap`

---

## Print Part Operations

### `printPart.create`
Creates or updates a print part for an element.

**Payload Structure:**
```typescript
{
  kind: "printPart.create",
  payload: {
    elementTempOrId?: string,
    elementId?: string,       // REQUIRED
    fields: {
      label: string,          // REQUIRED
      substrate?: string,
      qty?: number,           // Default: 1
      size?: string,
      requiresProof?: boolean
    }
  }
}
```

**Behavior:**
- If print part with same `label` exists for element → **patches it**
- Otherwise → creates new print part

---

## Purchase Operations

### `purchase.create`
Creates a purchase record.

**Payload Structure:**
```typescript
{
  kind: "purchase.create",
  payload: {
    tempId?: string,
    fields: {
      vendorId?: string,       // Vendor ID (can be tempId)
      vendorName?: string,
      itemDescription?: string,
      quantity?: number,
      unitCost?: number,
      totalCost?: number,
      purchaseDate?: string,
      notes?: string,
      status?: string
    }
  }
}
```

---

### `receipt.attach`
Attaches a receipt to a purchase.

**Payload Structure:**
```typescript
{
  kind: "receipt.attach",
  payload: {
    purchaseId?: string,
    purchaseTempOrId?: string,
    storageId: string          // _storage file ID
  }
}
```

---

## Catalog Price Record Operations

### `catalogPriceRecord.create`
Creates a catalog price entry.

**Payload Structure:**
```typescript
{
  kind: "catalogPriceRecord.create",
  payload: {
    fields: {
      vendorId?: string,
      vendorName?: string,     // REQUIRED
      itemName: string,        // REQUIRED
      spec?: string,
      uomCode?: string,
      unitPrice?: number,
      pricingModel?: string,
      quantity?: number,
      validFrom?: string,
      validTo?: string,
      notes?: string
    }
  }
}
```

**Behavior:**
- If record with same `vendorName + itemName + uomCode` exists → **patches it**
- Otherwise → creates new record

---

## Quote Operations

**Currently NO quote operations exist in the ChangeSet system.**

Quotes are managed separately through the `quoteVersions` table and are not part of the ChangeSet workflow.

---

## Summary Table

| Entity | Create | Patch | Delete/Archive | Notes |
|--------|--------|-------|----------------|-------|
| **Project** | ❌ | ❌ | ❌ | Not in ChangeSet system |
| **Element** | ✅ `element.create` | ✅ `element.patch` | ⚠️ Use patch with `status: "archived"` | Auto-increments `rev` |
| **Task** | ✅ `task.create` | ✅ `task.patch` | ⚠️ `task.delete` OR patch with `status: "archived"` | De-duplication by dedupKey or title |
| **Material Line** | ✅ `materialLine.create` | ✅ `materialLine.patch` | ⚠️ `materialLine.delete` | Can be project-level or element-scoped |
| **Work Line** | ✅ `workLine.create` | ✅ `workLine.patch` | ⚠️ `workLine.delete` | Can be project-level or element-scoped |
| **Accounting Line** | ✅ `accountingLine.create` | ✅ `accountingLine.patch` | ⚠️ `accountingLine.delete` | Legacy - dispatches to material/work |
| **Vendor** | ✅ `vendor.create` | (auto-patch if exists) | ❌ | De-duplicates by name |
| **Print Part** | ✅ `printPart.create` | (auto-patch if exists) | ❌ | De-duplicates by label per element |
| **Purchase** | ✅ `purchase.create` | ❌ | ❌ | - |
| **Receipt** | ✅ `receipt.attach` | ❌ | ❌ | Attaches to purchase |
| **Catalog Price** | ✅ `catalogPriceRecord.create` | (auto-patch if exists) | ❌ | De-duplicates by vendor+item+uom |
| **Task-Accounting Link** | ✅ `taskAccountingLink.create` | ❌ | ✅ `taskAccountingLink.delete` | Links task to workLine |
| **Quote** | ❌ | ❌ | ❌ | Not in ChangeSet system |

---

## 🎯 Non-Destructive Archive Pattern

**The #1 Polish Rule:** Always use **soft deletion** for user-facing entities.

### ✅ RECOMMENDED: Soft Delete (Non-Destructive)

```typescript
// Archive a task
{
  kind: "task.patch",
  payload: {
    taskId: "j97...",
    fields: { status: "archived" }
  }
}

// Archive an element
{
  kind: "element.patch",
  payload: {
    elementId: "j97...",
    patch: { status: "archived" }
  }
}

// Mark accounting line as non-billable (soft delete)
{
  kind: "accountingLine.patch",
  payload: {
    lineId: "j97...",
    fields: {
      billable: false,
      notes: "archived"
    }
  }
}
```

### ❌ AVOID: Hard Delete (Destructive)

```typescript
// DON'T use these unless absolutely necessary:
{ kind: "task.delete", payload: { taskId: "..." } }
{ kind: "materialLine.delete", payload: { lineId: "..." } }
{ kind: "workLine.delete", payload: { lineId: "..." } }
```

**Why?**
- Hard deletes lose audit history
- Soft deletes allow "undo" functionality
- Users expect to see archived items, not have them vanish

---

## Field Normalization Reference

### Stage Values
Valid: `"clarification"` | `"quote"` | `"procurement"` | `"build"` | `"install"` | `"teardown"` | `"accounting"`

### Work Type Values
Valid: `"carpentry"` | `"metal_fab"` | `"paint_finish"` | `"printing_graphics"` | `"props_sculpt"` | `"rigging_install"` | `"transport_logistics"` | `"purchasing"` | `"management"`

### UOM Codes
Valid: `"ea"` | `"sheet"` | `"m"` | `"m2"` | `"sqm"` | `"m3"` | `"kg"` | `"l"` | `"set"` | `"box"` | `"roll"` | `"pack"` | `"job"` | `"hour"`

Aliases:
- `"m2"` ← `"sqm"`, `"m^2"`
- `"ea"` ← `"each"`, `"units"`
- `"m"` ← `"meter"`, `"meters"`

### Procurement Codes
Valid: `"in_stock"` | `"local_buy"` | `"import"` | `"rental"`

### Pricing Models
Valid: `"per_unit"` | `"per_sheet"` | `"per_m"` | `"per_m2"` | `"per_pack"` | `"tiered"` | `"formula"` | `"unknown"`

Aliases:
- `"per_unit"` ← `"unit"`, `"ea"`, `"each"`
- `"per_sheet"` ← `"sheet"`, `"sheets"`
- `"per_m"` ← `"m"`, `"meter"`
- `"per_m2"` ← `"m2"`, `"sqm"`
- `"per_pack"` ← `"pack"`, `"box"`
