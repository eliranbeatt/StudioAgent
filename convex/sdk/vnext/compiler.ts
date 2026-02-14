import { StageArtifactMap, TargetPlanSpec } from './contracts'

function slugify(input: unknown) {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\u0590-\u05ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toTaskChecklist(task: any) {
  const explicitChecklist = Array.isArray(task?.checklist) ? task.checklist : []
  if (explicitChecklist.length > 0) {
    return explicitChecklist
      .map((item: any, index: number) => {
        const title = String(item?.title ?? item?.textHe ?? item?.labelHe ?? '').trim()
        if (!title) return null
        return {
          id: String(item?.id ?? `item_${index + 1}`),
          title,
          done: typeof item?.done === 'boolean' ? item.done : false,
          order: Number.isFinite(item?.order) ? Number(item.order) : index,
          estimatedHours:
            typeof item?.estimatedHours === 'number'
              ? item.estimatedHours
              : typeof item?.estimatedMinutes === 'number'
                ? item.estimatedMinutes / 60
                : undefined,
          workType: typeof item?.workType === 'string' ? item.workType : undefined,
          workTypeLabelHe: typeof item?.workTypeLabelHe === 'string' ? item.workTypeLabelHe : undefined,
        }
      })
      .filter(Boolean)
  }

  const checklistHe = Array.isArray(task?.checklistHe) ? task.checklistHe : []
  return checklistHe
    .map((value: any, index: number) => {
      const title = String(value ?? '').trim()
      if (!title) return null
      return {
        id: `item_${index + 1}`,
        title,
        done: false,
        order: index,
      }
    })
    .filter(Boolean)
}

export function compileDeterministicChangeSet(args: {
  spec: TargetPlanSpec
  artifacts: StageArtifactMap
}) {
  const ops: any[] = []
  const scopeElements = args.artifacts.scope?.proposedElements ?? args.spec.scope.elements ?? []
  const tasks = args.artifacts.tasks?.tasks ?? []
  const budgetArtifact = (args.artifacts.budget as any) ?? {}
  const pricingArtifact = (args.artifacts.pricing as any) ?? {}
  const materialLines = Array.isArray(pricingArtifact?.materialLines)
    ? pricingArtifact.materialLines
    : Array.isArray(budgetArtifact?.materialLines)
      ? budgetArtifact.materialLines
      : Array.isArray(budgetArtifact?.budgetSkeleton?.materialLines)
        ? budgetArtifact.budgetSkeleton.materialLines
        : []
  const workLines = Array.isArray(pricingArtifact?.workLines)
    ? pricingArtifact.workLines
    : Array.isArray(budgetArtifact?.workLines)
      ? budgetArtifact.workLines
      : Array.isArray(budgetArtifact?.budgetSkeleton?.workLines)
        ? budgetArtifact.budgetSkeleton.workLines
        : []
  const elementTempMap = new Map<string, string>()

  for (const [index, element] of scopeElements.entries()) {
    const elementKey = String(element?.elementKey ?? slugify(element?.nameHe))
    if (!elementKey) continue
    const tempId = `tmp_el_${index + 1}_${slugify(elementKey)}`
    elementTempMap.set(elementKey, tempId)
    ops.push({
      kind: 'element.create',
      payload: {
        tempId,
        dedupKey: `${elementKey}::v1`,
        element: {
          title: element?.nameHe ?? elementKey,
          type: 'mixed',
          tags: ['sdk_vnext'],
        },
      },
    })
  }

  for (const task of tasks) {
    const elementKey = String(task?.elementKey ?? '')
    const elementTempOrId = elementTempMap.get(elementKey)
    const title = String(task?.titleHe ?? '').trim()
    if (!title) continue
    const taskKey = `${elementKey || 'project'}::${slugify(title)}`
    const checklist = toTaskChecklist(task)
    const description = String(task?.doneCriteriaHe ?? '').trim() || (elementKey ? `Element: ${elementKey}` : undefined)
    ops.push({
      kind: 'task.create',
      payload: {
        elementTempOrId,
        fields: {
          title,
          estimatedHours: task?.durationHours,
          category: task?.category,
          stage: task?.stageKey,
          workType: task?.workType,
          workTypeLabelHe: task?.workTypeLabelHe,
          checklist: checklist.length > 0 ? checklist : undefined,
          dedupKey: task?.dedupKey ?? taskKey,
          description,
          createdBy: 'agent',
        },
      },
    })
  }

  for (const [index, line] of materialLines.entries()) {
    const elementKey = String(line?.elementKey ?? '')
    const elementTempOrId = elementTempMap.get(elementKey)
    const taskTitle = String(line?.taskTitleHe ?? line?.taskKey ?? '')
    const title = String(line?.titleHe ?? line?.itemName ?? `חומר ${index + 1}`)
    const quantity = Number(line?.quantity ?? line?.qty ?? 1)
    const unitCost = Number(line?.unitPrice ?? line?.plannedUnitCost ?? 0)
    ops.push({
      kind: 'materialLine.create',
      payload: {
        tempId: `tmp_mat_${index + 1}_${slugify(title)}`,
        elementTempOrId,
        fields: {
          title,
          itemName: line?.itemName ?? title,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          plannedUnitCost: Number.isFinite(unitCost) && unitCost > 0 ? unitCost : 1,
          plannedTotalCost:
            Number.isFinite(quantity) && Number.isFinite(unitCost) && quantity > 0 && unitCost > 0
              ? quantity * unitCost
              : undefined,
          notes: taskTitle ? `Task: ${taskTitle}` : undefined,
        },
      },
    })
  }

  for (const [index, line] of workLines.entries()) {
    const elementKey = String(line?.elementKey ?? '')
    const elementTempOrId = elementTempMap.get(elementKey)
    const title = String(line?.titleHe ?? line?.roleHe ?? `עבודה ${index + 1}`)
    const hours = Number(line?.hours ?? line?.qty ?? 1)
    const rate = Number(line?.hourlyRate ?? line?.plannedUnitCost ?? 0)
    ops.push({
      kind: 'workLine.create',
      payload: {
        tempId: `tmp_work_${index + 1}_${slugify(title)}`,
        elementTempOrId,
        fields: {
          title,
          hours: Number.isFinite(hours) && hours > 0 ? hours : 1,
          plannedUnitCost: Number.isFinite(rate) && rate > 0 ? rate : 1,
          plannedTotalCost:
            Number.isFinite(hours) && Number.isFinite(rate) && hours > 0 && rate > 0
              ? hours * rate
              : undefined,
          workTypeLabelHe: line?.workTypeLabelHe,
        },
      },
    })
  }

  return {
    ops,
    summaryHe: `נבנו ${scopeElements.length} אלמנטים, ${tasks.length} משימות, ${materialLines.length} שורות חומרים ו-${workLines.length} שורות עבודה`,
    coverage: {
      hasElements: scopeElements.length > 0,
      hasTasks: tasks.length > 0,
      hasAccounting: materialLines.length + workLines.length > 0,
    },
  }
}
