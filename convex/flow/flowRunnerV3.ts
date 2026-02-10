import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { DEFAULT_FLAGS, isEnabled, normalizeFlags } from '../featureFlags'
import { Id } from '../_generated/dataModel'
import { FLOW_GRAPH_V3, getNode } from './graph'

const SETTINGS_KEY = 'featureFlags'

// V3 Stage order
const V3_STAGE_ORDER = ['A', 'B', 'C', 'D', 'E'] as const
type V3StageKey = typeof V3_STAGE_ORDER[number]

// Skill mappings for each stage
const V3_QUESTION_SKILLS: Record<V3StageKey, string> = {
    A: 'V3_Q_A_INTAKE',
    B: 'V3_Q_B_PLAN',
    C: 'V3_Q_C_COST',
    D: 'V3_Q_D_POLISH_APPROVALS',
    E: 'V3_Q_E_QUOTE',
}

const V3_BUILDER_SKILLS: Record<V3StageKey, string> = {
    A: 'V3_BUILD_A_MEMORYDOCS',
    B: 'V3_BUILD_B_PLAN',
    C: 'V3_BUILD_C_ACCOUNTING',
    D: 'V3_BUILD_D_POLISH',
    E: 'V3_BUILD_E_QUOTE',
}

function getPlanningMode(run: any): 'separated' | 'combined' {
    return run?.toggles?.planningMode === 'combined' ? 'combined' : 'separated'
}

function getBuilderSkillForStage(stageKey: V3StageKey, run: any): string {
    const planningMode = getPlanningMode(run)
    if (stageKey === 'B' && planningMode === 'combined') return 'V3_BUILD_BC_COMBINED_PLAN_ACCOUNTING'
    return V3_BUILDER_SKILLS[stageKey]
}

function getNextStageForRun(current: V3StageKey, run: any): V3StageKey | undefined {
    const planningMode = getPlanningMode(run)
    const nextStage = getNextStage(current)
    if (planningMode === 'combined' && current === 'B') return 'D'
    if (planningMode === 'combined' && current === 'C') return 'D'
    return nextStage
}

async function loadFlags(ctx: any): Promise<Record<string, boolean>> {
    if (ctx.db && typeof ctx.db.query === 'function') {
        try {
            const existing = await ctx.db
                .query('appSettings')
                .withIndex('by_key', (q: any) => q.eq('key', SETTINGS_KEY))
                .first()
            const stored = normalizeFlags(existing?.value)
            return { ...DEFAULT_FLAGS, ...stored }
        } catch {
            // Fall through
        }
    }
    if (typeof ctx.runQuery === 'function') {
        try {
            return await ctx.runQuery(api.featureFlags.getAll)
        } catch {
            return { ...DEFAULT_FLAGS }
        }
    }
    return { ...DEFAULT_FLAGS }
}

function isResolvedChangeSetStatus(status: unknown): boolean {
    return status === 'APPLIED' || status === 'DISCARDED' || status === 'PARTIALLY_APPLIED'
}

function isPositiveAnswer(text?: string | null): boolean {
    if (!text) return false
    const value = String(text).trim().toLowerCase()
    return value === 'yes' || value === 'true' || value === '1' || value.includes('כן') || value.includes('מאשר')
}

async function resolveV3Policies(ctx: any, run: any) {
    if (!run?.projectId) return { allowHardDelete: false }
    const qaPairs = await ctx.runQuery(internal.flow.flowRunnerV3.listQaPairsSince, {
        projectId: run.projectId,
        dateFrom: run.v3RunStartedAtISO,
        limit: 200,
    })
    const allowHardDelete = qaPairs.some((qa: any) =>
        String(qa?.question_he ?? '').includes('POLICY:ALLOW_HARD_DELETE') && isPositiveAnswer(qa?.answer_he)
    )
    return { allowHardDelete }
}

async function applyChangeSetOpsWithRevision(
    ctx: any,
    args: {
        flowRunId: Id<'flowRuns'>
        changeSetId: Id<'changeSets'>
        opIndices: number[]
        appliedBy: 'auto' | 'user' | 'system'
        allowHardDelete: boolean
    }
) {
    try {
        await ctx.runMutation(api.changeSets.applyChangeSetOps, {
            changeSetId: args.changeSetId,
            opIndices: args.opIndices,
            allowHardDelete: args.allowHardDelete,
        })

        await ctx.runMutation(internal.flow.artifactRevisions.recordApplySuccess, {
            flowRunId: args.flowRunId,
            changeSetId: args.changeSetId,
            appliedBy: args.appliedBy,
        })
    } catch (error: any) {
        await ctx.runMutation(internal.flow.artifactRevisions.recordApplyFailure, {
            flowRunId: args.flowRunId,
            changeSetId: args.changeSetId,
            appliedBy: args.appliedBy,
            error: error?.message ?? String(error),
        })
        throw error
    }
}

function getNextStage(current: V3StageKey): V3StageKey | undefined {
    const idx = V3_STAGE_ORDER.indexOf(current)
    return idx >= 0 && idx < V3_STAGE_ORDER.length - 1 ? V3_STAGE_ORDER[idx + 1] : undefined
}

// Initialize a V3 run
export const initV3Run = internalMutation({
    args: { flowRunId: v.id('flowRuns') },
    handler: async (ctx, args) => {
        const run = await ctx.db.get(args.flowRunId)
        if (!run) return

        const now = Date.now()
        await ctx.db.patch(args.flowRunId, {
            v3StageKey: 'A',
            v3Mode: 'questions',
            v3RunStartedAtISO: new Date(now).toISOString(),
            graphVersion: 'v3.0',
            currentGateId: 'A', // For backward compatibility
            updatedAt: now,
        })
    },
})

// Update V3 stage/mode
export const updateV3Stage = internalMutation({
    args: {
        flowRunId: v.id('flowRuns'),
        stageKey: v.optional(v.union(
            v.literal('A'), v.literal('B'), v.literal('C'), v.literal('D'), v.literal('E')
        )),
        mode: v.optional(v.union(v.literal('questions'), v.literal('build'))),
    },
    handler: async (ctx, args) => {
        const updates: any = { updatedAt: Date.now() }
        if (args.stageKey) {
            updates.v3StageKey = args.stageKey
            updates.currentGateId = args.stageKey // For backward compatibility
        }
        if (args.mode) updates.v3Mode = args.mode
        await ctx.db.patch(args.flowRunId, updates)
    },
})

export const logV3TimelineEvent = internalMutation({
    args: {
        flowRunId: v.id('flowRuns'),
        stageKey: v.optional(v.string()),
        eventType: v.string(),
        detail: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert('flowRunTimelineEvents', {
            runId: args.flowRunId,
            stageKey: args.stageKey,
            eventType: args.eventType,
            detail: args.detail,
            createdAt: Date.now(),
        })
    },
})

export const listQaPairsSince = internalQuery({
    args: {
        projectId: v.id('projects'),
        dateFrom: v.optional(v.string()),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const query = ctx.db
            .query('qaPairs')
            .withIndex('by_project', (q: any) => q.eq('projectId', args.projectId))
            .order('desc')
        const items = await query.take(typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 200) : 200)
        if (!args.dateFrom) return items
        const dateFromMs = Date.parse(args.dateFrom)
        if (!Number.isFinite(dateFromMs)) return items
        return items.filter((qa: any) => (qa.createdAt ?? 0) >= dateFromMs)
    },
})

// Save V3 QuestionsBlock to flowQuestionSets for UI display
export const saveV3QuestionSet = internalMutation({
    args: {
        flowRunId: v.id('flowRuns'),
        stageKey: v.union(v.literal('A'), v.literal('B'), v.literal('C'), v.literal('D'), v.literal('E')),
        questionsBlock: v.any(),
    },
    handler: async (ctx, args) => {
        const run = await ctx.db.get(args.flowRunId)
        if (!run) return

        console.log('[flowRunnerV3.saveV3QuestionSet] start', { flowRunId: args.flowRunId, stageKey: args.stageKey })

        const now = Date.now()
        const questionSetId = `${args.flowRunId}:${now}`

        // CRITICAL: Archive old unanswered question sets for this stage to prevent them from reappearing
        const existingQuestionSets = await ctx.db
            .query('flowQuestionSets')
            .withIndex('by_run', (q) => q.eq('runId', args.flowRunId))
            .collect()

        const responses = await ctx.db
            .query('flowQuestionSetResponses')
            .withIndex('by_run', (q) => q.eq('runId', args.flowRunId))
            .collect()

        const responded = new Set(responses.map((r) => String(r.questionSetId)))

        // Archive any unanswered question sets for this stage
        for (const oldSet of existingQuestionSets) {
            if (oldSet.gateId === args.stageKey && !responded.has(String(oldSet._id))) {
                console.log('[flowRunnerV3.saveV3QuestionSet] archiving old unanswered question set', {
                    oldSetId: oldSet._id,
                    gateId: oldSet.gateId
                })
                // Mark as skipped so it won't show in UI
                await ctx.db.insert('flowQuestionSetResponses', {
                    runId: args.flowRunId,
                    questionSetId: oldSet._id,
                    intent: 'skip',
                    status: 'skipped',
                    createdAt: now,
                })
            }
        }

        // Convert QuestionsBlock to flowQuestionSets format
        const questions = Array.isArray(args.questionsBlock.questions)
            ? args.questionsBlock.questions.map((q: any, idx: number) => ({
                questionId: String(q.id ?? `q${idx}`),
                fieldKey: String(q.topicKey ?? q.id ?? `q${idx}`),
                prompt: String(q.textHe ?? q.text ?? ''),
                choices: Array.isArray(q.optionsHe) ? q.optionsHe.map((o: any) => String(o)) : undefined,
                type: typeof q.type === 'string' ? q.type : undefined,
                placeholderHe: typeof q.placeholderHe === 'string' ? q.placeholderHe : undefined,
                priority: idx + 1,
                whyAsked: q.detailHe ? String(q.detailHe) : undefined,
            }))
            : []

        console.log('[flowRunnerV3.saveV3QuestionSet] questions count', { count: questions.length })

        if (questions.length === 0) return

        await ctx.db.insert('flowQuestionSets', {
            runId: args.flowRunId,
            questionSetId,
            createdAt: now,
            gateId: args.stageKey,
            titleHe: args.questionsBlock.titleHe ?? `שלב ${args.stageKey}`,
            basedOnArtifactRevisionId: run.currentArtifactRevisionId,
            basedOnAnswerVersion: run.latestAnswerVersion,
            questions,
            emittedToChatAt: now,
        })

        console.log('[flowRunnerV3.saveV3QuestionSet] saved to flowQuestionSets', { questionSetId, gateId: args.stageKey })
    },
})


// Main V3 tick orchestrator
export const tickV3 = internalAction({
    args: {
        flowRunId: v.id('flowRuns'),
    },
    handler: async (ctx, args) => {
        const { flowRunId } = args

        console.log('[flowRunnerV3.tickV3] start', { flowRunId })

        const flags = await loadFlags(ctx)
        if (!isEnabled(flags, 'ff_flow_agent_backend', false)) {
            throw new Error('Flow Agent is disabled (ff_flow_agent_backend)')
        }
        if (!isEnabled(flags, 'ff_flow_runner_v3', false)) {
            throw new Error('V3 Flow runner is disabled (ff_flow_runner_v3)')
        }

        // Load run state
        const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
        if (!run) return

        // Terminal states - stop
        if (['paused', 'failed', 'cancelled', 'completed'].includes(run.status)) {
            console.log('[flowRunnerV3.tickV3] early-exit status', { flowRunId, status: run.status })
            return
        }

        // Initialize V3 if needed
        if (!run.v3StageKey || !run.v3Mode) {
            console.log('[flowRunnerV3.tickV3] initializing V3 run')
            await ctx.runMutation(internal.flow.flowRunnerV3.initV3Run, { flowRunId })
            // Re-schedule to continue
            await ctx.scheduler.runAfter(0, internal.flow.flowRunnerV3.tickV3, { flowRunId })
            return
        }

        const stageKey = run.v3StageKey as V3StageKey
        const mode = run.v3Mode as 'questions' | 'build'
        const projectId = run.projectId

        console.log('[flowRunnerV3.tickV3] current state', { flowRunId, stageKey, mode })

        if (getPlanningMode(run) === 'combined' && stageKey === 'C') {
            console.log('[flowRunnerV3.tickV3] skipping stage C in combined mode', { flowRunId, mode })
            await ctx.runMutation(internal.flow.flowRunnerV3.updateV3Stage, {
                flowRunId,
                stageKey: 'D',
                mode,
            })
            if (run.toggles?.autoRun) {
                await ctx.scheduler.runAfter(0, internal.flow.flowRunnerV3.tickV3, { flowRunId })
            }
            return
        }

        // Ensure conversation exists
        const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId })

        if (mode === 'questions') {
            // Run questions skill
            const skillId = V3_QUESTION_SKILLS[stageKey]
            console.log('[flowRunnerV3.tickV3] running questions skill', { skillId, stageKey })
            await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                flowRunId,
                stageKey,
                eventType: 'stage_started',
                detail: { mode },
            })

            // V3 questions should use runStartedAtISO for per-run scoping
            const blocks = await ctx.runAction(api.skills.runner.runSkill, {
                projectId,
                conversationId,
                skillId,
                params: {
                    source: 'flow_runner_v3',
                    stageKey,
                    runId: flowRunId,
                    runStartedAtISO: run.v3RunStartedAtISO,
                    answerVersion: run.latestAnswerVersion ?? 0,
                    autoApprove: !!run.toggles?.autoApprove,
                },
            })

            console.log('[flowRunnerV3.tickV3] questions skill completed', {
                skillId,
                blocksCount: Array.isArray(blocks) ? blocks.length : 0,
            })

            // Save QuestionsBlock to flowQuestionSets for UI display
            if (Array.isArray(blocks)) {
                let questionsCount = 0
                for (const block of blocks) {
                    if (block?.type === 'QuestionsBlock' && Array.isArray(block.questions)) {
                        await ctx.runMutation(internal.flow.flowRunnerV3.saveV3QuestionSet, {
                            flowRunId,
                            stageKey,
                            questionsBlock: block,
                        })
                        questionsCount += block.questions.length
                    }
                }
                await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                    flowRunId,
                    stageKey,
                    eventType: 'questions_emitted',
                    detail: { questionsCount },
                })
            }

            // Questions skill returns QuestionsBlock - wait for user action
            // The submitV3Answers action will handle the next step
            return
        }

        if (mode === 'build') {
            // Run builder skill
            const skillId = getBuilderSkillForStage(stageKey, run)
            console.log('[flowRunnerV3.tickV3] running builder skill', { skillId, stageKey })
            await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                flowRunId,
                stageKey,
                eventType: 'builder_started',
                detail: { skillId },
            })

            const blocks = await ctx.runAction(api.skills.runner.runSkill, {
                projectId,
                conversationId,
                skillId,
                params: {
                    source: 'flow_runner_v3',
                    stageKey,
                    runId: flowRunId,
                    runStartedAtISO: run.v3RunStartedAtISO,
                    answerVersion: run.latestAnswerVersion ?? 0,
                    autoApprove: !!run.toggles?.autoApprove,
                },
            })

            console.log('[flowRunnerV3.tickV3] builder skill completed', {
                skillId,
                blocksCount: Array.isArray(blocks) ? blocks.length : 0,
            })

            // Handle special outputs for stages A and E
            if (stageKey === 'A') {
                // Stage A builder outputs memoryDocs - handled in skill runner
                const kinds = Array.from(new Set((Array.isArray(blocks) ? blocks : [])
                    .flatMap((b: any) => Array.isArray(b?.memoryDocs) ? b.memoryDocs.map((d: any) => d?.kind).filter(Boolean) : [])))
                await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                    flowRunId,
                    stageKey,
                    eventType: 'memorydocs_saved',
                    detail: { kinds },
                })
            }

            if (stageKey === 'E') {
                // Stage E builder outputs quote - handled in skill runner
                const savedId = (Array.isArray(blocks) ? blocks : [])
                    .map((b: any) => b?.quoteDraftSavedId)
                    .find(Boolean)
                await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                    flowRunId,
                    stageKey,
                    eventType: 'quote_saved',
                    detail: { quoteDraftSavedId: savedId ?? null },
                })
            }

            // Process ChangeSets if any
            const changeSetIds: Id<'changeSets'>[] = []
            for (const block of Array.isArray(blocks) ? blocks : []) {
                if (block?.changeSetId) changeSetIds.push(block.changeSetId)
            }

            if (changeSetIds.length > 0) {
                await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                    flowRunId,
                    stageKey,
                    eventType: 'changeset_generated',
                    detail: { changeSetIds },
                })

                // If autoApprove, apply ChangeSets
                if (run.toggles?.autoApprove) {
                    const policies = await resolveV3Policies(ctx, run)
                    console.log('[flowRunnerV3.tickV3] auto-applying ChangeSets', { count: changeSetIds.length })
                    for (const changeSetId of changeSetIds) {
                        const cs = await ctx.runQuery(api.changeSets.get, { id: changeSetId })
                        if (!cs || isResolvedChangeSetStatus(cs.status)) continue
                        const opCount = cs.ops?.length ?? 0
                        if (opCount === 0) continue
                        const opIndices = Array.from({ length: opCount }, (_, i) => i)
                        try {
                            await applyChangeSetOpsWithRevision(ctx, {
                                flowRunId,
                                changeSetId,
                                opIndices,
                                appliedBy: 'auto',
                                allowHardDelete: policies.allowHardDelete,
                            })
                            await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                                flowRunId,
                                stageKey,
                                eventType: 'changeset_applied',
                                detail: { changeSetId },
                            })
                        } catch (error: any) {
                            await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                                flowRunId,
                                stageKey,
                                eventType: 'apply_failed',
                                detail: { changeSetId, error: error?.message ?? String(error) },
                            })
                        }
                    }
                } else {
                    // Wait for user approval
                    console.log('[flowRunnerV3.tickV3] ChangeSets pending approval', { count: changeSetIds.length })
                    await ctx.runMutation(internal.flowRuns.setAwaitingApproval, {
                        flowRunId,
                        gateId: stageKey,
                        draftChangeSetIds: changeSetIds,
                    })
                    return
                }
            }

            // Advance to next stage
            const nextStage = getNextStageForRun(stageKey, run)
            if (!nextStage) {
                // Flow completed
                console.log('[flowRunnerV3.tickV3] flow completed', { flowRunId })
                await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                    flowRunId,
                    stageKey,
                    eventType: 'stage_completed',
                })
                await ctx.runMutation(internal.flowRuns.setRunStatus, { flowRunId, status: 'completed' })
                return
            }

            // Move to next stage, start with questions
            console.log('[flowRunnerV3.tickV3] advancing to next stage', { from: stageKey, to: nextStage })
            await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
                flowRunId,
                stageKey,
                eventType: 'stage_completed',
            })
            await ctx.runMutation(internal.flow.flowRunnerV3.updateV3Stage, {
                flowRunId,
                stageKey: nextStage,
                mode: 'questions',
            })

            // Continue immediately if autoRun
            if (run.toggles?.autoRun) {
                await ctx.scheduler.runAfter(0, internal.flow.flowRunnerV3.tickV3, { flowRunId })
            }
        }
    },
})

// Handle V3 answer submission
export const submitV3Answers = internalAction({
    args: {
        flowRunId: v.id('flowRuns'),
        answersByKey: v.record(v.string(), v.string()),
        action: v.union(v.literal('submit_skip'), v.literal('submit_more')),
        questionKeys: v.optional(v.array(v.string())),
        freeText: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { flowRunId, answersByKey, action } = args

        console.log('[flowRunnerV3.submitV3Answers]', { flowRunId, action, answersCount: Object.keys(answersByKey).length })

        const run = await ctx.runQuery(internal.flowRuns.getRunInternal, { flowRunId })
        if (!run) throw new Error('Flow run not found')

        const stageKey = run.v3StageKey as V3StageKey
        if (!stageKey) throw new Error('V3 stage not set')

        const conversationId = await ctx.runMutation(internal.flowRuns.ensureConversation, { flowRunId })

        // Save answers to qaPairs with V3 format: v3.<runId>.<stage>.<topicKey>
        const answers = answersByKey ?? {}
        const answerKeys = Object.keys(answers).filter((key) => String(answers[key] ?? '').trim())

        if (answerKeys.length > 0) {
            // Save to flowAnswers
            await ctx.runMutation(api.flowAnswers.submitAnswers, {
                flowRunId,
                answersByKey: answers,
            })
        }

        // Save freeText to memory if provided
        if (args.freeText?.trim()) {
            await ctx.runMutation(internal.memory.appendUserInput, {
                projectId: run.projectId,
                text: `V3 Stage ${stageKey}: ${args.freeText.trim()}`,
            })
        }

        // Emit summary to chat
        const summary = answerKeys.length > 0
            ? `נשמרו ${answerKeys.length} תשובות לשלב ${stageKey}.`
            : `עודכן שלב ${stageKey}.`
        await ctx.runMutation(internal.flow.chat.emitUserSummary, {
            conversationId,
            text: summary,
        })

        await ctx.runMutation(internal.flow.flowRunnerV3.logV3TimelineEvent, {
            flowRunId,
            stageKey,
            eventType: 'answers_saved',
            detail: { answersCount: answerKeys.length },
        })

        // Update memoryDocs after saving answers to keep context fresh (especially for Stage A)
        if (answerKeys.length > 0 && stageKey === 'A') {
            console.log('[flowRunnerV3.submitV3Answers] updating memoryDocs', { stageKey })
            try {
                await ctx.runAction(api.skills.runner.runSkill, {
                    projectId: run.projectId,
                    conversationId,
                    skillId: 'V3_BUILD_A_MEMORYDOCS',
                    params: {
                        source: 'flow_runner_v3_answer_update',
                        stageKey,
                        runId: flowRunId,
                        runStartedAtISO: run.v3RunStartedAtISO,
                        answerVersion: run.latestAnswerVersion ?? 0,
                    },
                })
            } catch (error: any) {
                console.error('[flowRunnerV3.submitV3Answers] failed to update memoryDocs', error)
                // Don't block the flow, just log the error
            }
        }

        // Update QA_DIGEST deterministically after each submit
        try {
            const qaPairs = await ctx.runQuery(internal.flow.flowRunnerV3.listQaPairsSince, {
                projectId: run.projectId,
                dateFrom: run.v3RunStartedAtISO,
                limit: 200,
            })
            const latestByKey = new Map<string, any>()
            for (const qa of qaPairs) {
                const key = String(qa?.questionKey ?? qa?.question_he ?? '').trim()
                if (!key) continue
                if (!latestByKey.has(key)) latestByKey.set(key, qa)
            }

            const latestLines = Array.from(latestByKey.values()).map((qa: any) => {
                const q = String(qa?.question_he ?? qa?.questionKey ?? '').trim()
                const a = String(qa?.answer_he ?? '').trim()
                return q && a ? `- ${q}: ${a}` : null
            }).filter(Boolean)

            const policyLines = qaPairs
                .filter((qa: any) => String(qa?.question_he ?? '').includes('POLICY:'))
                .map((qa: any) => {
                    const q = String(qa?.question_he ?? '').trim()
                    const a = String(qa?.answer_he ?? '').trim()
                    return q && a ? `- ${q}: ${a}` : null
                })
                .filter(Boolean)

            const contentMd_he = [
                '**תשובות אחרונות**',
                latestLines.length ? latestLines.join('\n') : '- אין תשובות חדשות.',
                '',
                '**החלטות מדיניות**',
                policyLines.length ? policyLines.join('\n') : '- אין החלטות מדיניות מתועדות.',
                '',
                '**שאלות פתוחות**',
                '- אין כרגע שאלות פתוחות.',
            ].join('\n')

            await ctx.runMutation(internal.memory.saveQADigest, {
                projectId: run.projectId,
                contentMd_he,
            })
        } catch (error: any) {
            console.error('[flowRunnerV3.submitV3Answers] failed to update QA_DIGEST', error)
        }

        if (action === 'submit_more') {
            // Re-run questions skill
            console.log('[flowRunnerV3.submitV3Answers] re-running questions', { stageKey })
            await ctx.scheduler.runAfter(0, internal.flow.flowRunnerV3.tickV3, { flowRunId })
            return
        }

        // submit_skip - proceed to builder
        console.log('[flowRunnerV3.submitV3Answers] proceeding to build', { stageKey })
        await ctx.runMutation(internal.flow.flowRunnerV3.updateV3Stage, {
            flowRunId,
            mode: 'build',
        })

        await ctx.scheduler.runAfter(0, internal.flow.flowRunnerV3.tickV3, { flowRunId })
    },
})
