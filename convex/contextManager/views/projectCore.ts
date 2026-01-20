import { Id } from '../../_generated/dataModel'

export async function buildProjectCorePacks(
  ctx: any,
  args: { projectId: Id<'projects'>; params?: any; packIds: string[] }
) {
  const requested = new Set(args.packIds ?? [])
  const needsProject = requested.has('project')
  const needsElements = requested.has('elements')
  const needsTasks = requested.has('tasks')
  const needsQaPairs = requested.has('qaPairs')
  const needsUserInput = requested.has('userInput')
  const needsMemories = requested.has('memories')
  const needsFiles = requested.has('files')
  const needsAccounting = requested.has('accounting')
  const needsQuote = requested.has('quote')
  const needsCatalog = requested.has('catalog')

  const project = needsProject ? await ctx.db.get(args.projectId) : null
  const scopeElementIds = args.params?.scope?.elementIds

  const elements = needsElements
    ? await ctx.db
        .query('elements')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .take(120)
    : []

  const tasks = needsTasks
    ? await ctx.db
        .query('tasks')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .take(200)
    : []

  const qaPairs = needsQaPairs
    ? await ctx.db
        .query('qaPairs')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .order('desc')
        .take(20)
    : []

  const projectFiles = needsFiles
    ? await ctx.db
        .query('projectFiles')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .take(20)
    : []

  const memoryDocs = needsMemories
    ? await ctx.db
        .query('memoryDocs')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .take(20)
    : []

  const runningMemory = needsUserInput
    ? await ctx.db
        .query('memoryDocs')
        .withIndex('by_project_kind', (q: any) => q.eq('projectId', args.projectId).eq('kind', 'RUNNING_MEMORY'))
        .first()
    : null

  const userInputLog = needsUserInput
    ? await ctx.db
        .query('memoryDocs')
        .withIndex('by_project_kind', (q: any) => q.eq('projectId', args.projectId).eq('kind', 'USER_INPUT_LOG'))
        .first()
    : null

  const quoteVersions = needsQuote
    ? await ctx.db
        .query('quoteVersions')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .order('desc')
        .take(1)
    : []

  const latestQuote = quoteVersions[0]

  const allMaterialLines = needsAccounting
    ? await ctx.db
        .query('materialLines')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .take(200)
    : []

  const allWorkLines = needsAccounting
    ? await ctx.db
        .query('workLines')
        .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
        .take(200)
    : []

  const materialLines = needsAccounting
    ? Array.isArray(scopeElementIds)
      ? allMaterialLines.filter((l: any) => l.elementId && scopeElementIds.includes(l.elementId))
      : allMaterialLines
    : []

  const workLines = needsAccounting
    ? Array.isArray(scopeElementIds)
      ? allWorkLines.filter((l: any) => l.elementId && scopeElementIds.includes(l.elementId))
      : allWorkLines
    : []

  const catalogPriceRecords = needsCatalog ? await ctx.db.query('catalogPriceRecords').order('desc').take(50) : []
  const materialTemplates = needsCatalog ? await ctx.db.query('materialTemplates').take(200) : []
  const materialVariants = needsCatalog ? await ctx.db.query('materialVariants').take(200) : []

  const scopedElements = Array.isArray(scopeElementIds)
    ? elements.filter((e: any) => scopeElementIds.includes(e._id))
    : elements

  return {
    project: project
      ? {
          id: project._id,
          name: project.name,
          summaryHe: project.overviewSummary ?? project.description ?? '',
          description: project.description,
          userNotes: project.notes,
          details: project.details,
          clientHe: project.clientName ?? undefined,
          eventDate: project.details?.eventDate ?? project.eventDate ?? undefined,
          locationHe: project.details?.location ?? undefined,
        }
      : null,
    elements: scopedElements
      .filter((e: any) => e.status !== 'archived')
      .map((e: any) => ({
        id: e._id,
        title: e.title,
        status: e.status === 'drafting' ? 'approvedForQuote' : e.status,
        type: e.type,
      })),
    tasks: tasks.map((t: any) => ({
      id: t._id,
      title: t.title,
      status: t.status,
      stage: t.stage,
      workType: t.workType,
      workTypeLabelHe: t.workTypeLabelHe,
      estimatedHours:
        t.estimatedHours ?? (t.estimatedMinutes !== undefined ? t.estimatedMinutes / 60 : undefined),
      elementId: t.elementId,
      category: t.category,
      descriptionHe: t.description,
    })),
    qaPairs: qaPairs.map((qa: any) => ({
      questionHe: qa.question_he,
      questionKey: qa.questionKey,
      answerHe: qa.answer_he,
      createdAt: qa.createdAt,
    })),
    userInput: needsUserInput
      ? {
          latestFreeText: args.params?.freeText ?? null,
          log: userInputLog?.contentMd_he ?? '',
          currentKnowledge: runningMemory?.contentMd_he ?? '',
        }
      : null,
    memories: memoryDocs.map((m: any) => ({
      title: m.title_he,
      content: m.contentMd_he ?? m.rawText_he,
      summary: m.aiSummary?.summaryMd_he,
    })),
    files: projectFiles.map((f: any) => ({
      fileName: f.fileName,
      summary: f.summary ?? f.extractedInfo?.summary,
      extractedTextSnippet: f.extractedText ? f.extractedText.slice(0, 800) : undefined,
    })),
    accounting: needsAccounting
      ? {
          materialLines: materialLines.map((line: any) => ({
            id: line._id,
            title: line.title ?? line.itemName,
            itemName: line.itemName,
            spec: line.spec,
            quantity: line.quantity,
            uomCode: line.uomCode,
            plannedUnitCost: line.plannedUnitCost,
            plannedTotalCost: line.plannedTotalCost,
            vendorName: line.vendorName,
            taskId: line.taskId,
            elementId: line.elementId,
          })),
          workLines: workLines.map((line: any) => ({
            id: line._id,
            title: line.title ?? line.roleHe,
            roleHe: line.roleHe,
            plannedQuantity: line.plannedQuantity,
            plannedUnitCost: line.plannedUnitCost,
            plannedTotalCost: line.plannedTotalCost,
            taskId: line.taskId,
            elementId: line.elementId,
            status: line.status,
            assignee: line.assignee,
          })),
        }
      : null,
    quote: needsQuote
      ? latestQuote
        ? {
            status: latestQuote.status,
            version: latestQuote.version,
            createdAt: latestQuote.createdAt,
          }
        : { status: 'none' }
      : null,
    catalog: needsCatalog
      ? {
          priceRecords: catalogPriceRecords.map((record: any) => ({
            id: record._id,
            variantId: record.variantId,
            templateId: record.templateId,
            amount: record.amount,
            currency: record.currency,
            pricingModel: record.pricingModel,
            sourceType: record.sourceType,
            checkedAt: record.checkedAt,
            url: record.url,
          })),
          templates: materialTemplates.map((template: any) => ({
            id: template._id,
            nameHe: template.nameHe,
            kind: template.kind,
            defaultUomCode: template.defaultUomCode,
            searchKeywords: template.searchKeywords ?? [],
          })),
          variants: materialVariants.map((variant: any) => ({
            id: variant._id,
            templateId: variant.templateId,
            labelHe: variant.labelHe,
            attributes: variant.attributes,
            normalizedKey: variant.normalizedKey,
            thicknessMm: variant.thicknessMm,
            widthMm: variant.widthMm,
            heightMm: variant.heightMm,
            lengthMm: variant.lengthMm,
            uomCode: variant.uomCode,
          })),
        }
      : null,
  }
}
