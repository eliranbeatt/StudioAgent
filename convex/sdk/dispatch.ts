"use node";

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { randomUUID } from 'crypto';
import { api, internal } from '../_generated/api';
import { REGISTRY } from './registry';
import { runToolInternal } from './runner';
import { assertAsciiKeys } from './schemas';
import { searchWeb } from '../lib/webSearch';
import { completionWithTracing } from '../lib/llm';
import { runVNextStage } from './vnext/pipeline';
import { getNextVNextStage, normalizeVNextStage } from './vnext/stages';
import { ensureSuggestionFooter } from './footer';
import {
  allowedToolsForChatIntent,
  detectChatIntent,
  isWorkflowReply,
  packsForIntent,
  shouldAttachSuggestions,
} from './chatPolicy';

const MAX_TOOL_LOOPS = 6;
const QUEUED_INPUT_OPEN = '[SDK_QUEUED_INPUT_V1]';
const QUEUED_INPUT_CLOSE = '[/SDK_QUEUED_INPUT_V1]';

type ApprovalDecision = 'approve' | 'reject' | 'ambiguous';

type SanitizedQueuedInput = {
  suggestionDecision: 'accepted' | 'declined' | null;
  answers: {
    yesNo: boolean | null;
    choice: string | null;
    clarify: string | null;
  };
  suggestions: {
    actionPrimary: string | null;
    actionSecondary: string | null;
    changeSetAction: string | null;
  };
  sentAt: number | null;
};

type QueuedExplicitAction =
  | 'create_changeset'
  | 'build_tasks'
  | 'build_elements'
  | 'build_budget'
  | 'build_quote'
  | 'clarify'
  | 'focus_task'
  | null;

type ParsedQueuedInputEnvelope = {
  text: string;
  queuedInput: SanitizedQueuedInput | null;
  explicitAction: QueuedExplicitAction;
};

const EMPTY_QUEUED_INPUT: SanitizedQueuedInput = {
  suggestionDecision: null,
  answers: { yesNo: null, choice: null, clarify: null },
  suggestions: { actionPrimary: null, actionSecondary: null, changeSetAction: null },
  sentAt: null,
};

function normalizeActionToken(value: any) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function resolveQueuedActionToken(value: any): QueuedExplicitAction {
  const token = normalizeActionToken(value);
  if (!token) return null;
  if (
    token === 'create_changeset' ||
    token === 'compile_and_review_changeset' ||
    token === 'changeset.compile' ||
    token === 's_changeset' ||
    token.includes('changeset')
  ) {
    return 'create_changeset';
  }
  if (token === 'build_tasks' || token === 'generate_tasks_from_elements' || token === 'plan.tasks' || token === 's_build_tasks') {
    return 'build_tasks';
  }
  if (token === 'build_elements' || token === 'define_core_elements' || token === 'plan.elements' || token === 's_define_elements') {
    return 'build_elements';
  }
  if (token === 'build_budget' || token === 'draft_budget_lines' || token === 'cost.build_budget' || token === 's_budget_lines') {
    return 'build_budget';
  }
  if (token === 'build_quote' || token === 'generate_quote_draft' || token === 'quote.generate' || token === 's_quote_first') {
    return 'build_quote';
  }
  if (token === 'clarify' || token === 'fill_single_blocker_gap' || token === 'clarify.next_questions' || token === 's_context_gap') {
    return 'clarify';
  }
  if (token === 'focus_task' || token === 'focus_open_task' || token === 's_task_focus') {
    return 'focus_task';
  }
  return null;
}

function resolveQueuedExplicitAction(queuedInput: SanitizedQueuedInput | null): QueuedExplicitAction {
  if (!queuedInput) return null;
  const candidates = [
    queuedInput.suggestions.changeSetAction,
    queuedInput.suggestions.actionPrimary,
    queuedInput.suggestions.actionSecondary,
    queuedInput.answers.choice,
    queuedInput.answers.clarify,
  ];
  for (const candidate of candidates) {
    const action = resolveQueuedActionToken(candidate);
    if (action) return action;
  }
  return null;
}

function detectExplicitActionFromText(userText?: string): QueuedExplicitAction {
  const text = String(userText ?? '').trim().toLowerCase();
  if (!text) return null;
  const normalized = text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const compact = normalized.replace(/\s+/g, '');

  const mentionsChangeSet =
    normalized.includes('changeset') ||
    normalized.includes('change set') ||
    normalized.includes('chageset') ||
    normalized.includes('chage set') ||
    normalized.includes('chhange set') ||
    normalized.includes('changset') ||
    normalized.includes('chagneset');

  const looksLikeChangeSetTypo =
    /cha+n?g+e?\s*s+e+t/.test(normalized) ||
    compact.includes('createchangeset');

  const hasCreateChangesetIntent =
    normalized.includes('create_changeset') ||
    normalized.includes('changeset.compile') ||
    normalized.includes('compile changeset') ||
    mentionsChangeSet ||
    looksLikeChangeSetTypo ||
    ((normalized.includes('create') || normalized.includes('generate') || normalized.includes('build') || normalized.includes('make') || normalized.includes('compile')) &&
      (mentionsChangeSet || looksLikeChangeSetTypo));

  const hasNegationNearChangeset =
    normalized.includes("don't create changeset") ||
    normalized.includes('do not create changeset') ||
    normalized.includes('without changeset') ||
    normalized.includes('no changeset');

  if (hasCreateChangesetIntent && !hasNegationNearChangeset) return 'create_changeset';
  return null;
}

function isLikelyCompileConfirmation(userText?: string) {
  const text = String(userText ?? '').trim().toLowerCase();
  if (!text) return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const compact = normalized.replace(/\s+/g, '');

  const exactSignals = new Set([
    '1',
    'a',
    'a1',
    'yes',
    'approve',
    'approved',
    'ok',
    'okay',
    'go',
    'y',
  ]);

  if (exactSignals.has(normalized) || exactSignals.has(compact)) return true;
  if (/^(option|choose)\s*1$/.test(normalized)) return true;
  if (/^(yes|approve|ok)\b/.test(normalized) && normalized.includes('change')) return true;
  if (normalized.includes('create_changeset') || normalized.includes('changeset')) return true;
  return false;
}
function asOptionalShortString(value: any, maxLen: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function sanitizeQueuedInput(value: any): SanitizedQueuedInput | null {
  if (!value || typeof value !== 'object') return null;
  const suggestionDecision = value?.suggestionDecision === 'accepted' || value?.suggestionDecision === 'declined'
    ? value.suggestionDecision
    : null;
  const yesNo = typeof value?.answers?.yesNo === 'boolean' ? value.answers.yesNo : null;
  const choice = asOptionalShortString(value?.answers?.choice, 180);
  const clarify = asOptionalShortString(value?.answers?.clarify, 500);
  const actionPrimary = asOptionalShortString(value?.suggestions?.actionPrimary, 180);
  const actionSecondary = asOptionalShortString(value?.suggestions?.actionSecondary, 180);
  const changeSetAction = asOptionalShortString(value?.suggestions?.changeSetAction, 180);
  const sentAt = Number.isFinite(value?.sentAt) ? Number(value.sentAt) : null;

  const sanitized: SanitizedQueuedInput = {
    suggestionDecision,
    answers: { yesNo, choice, clarify },
    suggestions: { actionPrimary, actionSecondary, changeSetAction },
    sentAt,
  };
  const hasAnySelection =
    Boolean(suggestionDecision) ||
    yesNo !== null ||
    Boolean(choice) ||
    Boolean(clarify) ||
    Boolean(actionPrimary) ||
    Boolean(actionSecondary) ||
    Boolean(changeSetAction);
  return hasAnySelection ? sanitized : null;
}

function parseQueuedInputEnvelope(userMessage?: string): ParsedQueuedInputEnvelope {
  const raw = String(userMessage ?? '');
  const start = raw.indexOf(QUEUED_INPUT_OPEN);
  const end = raw.indexOf(QUEUED_INPUT_CLOSE);
  if (start === -1 || end === -1 || end <= start) {
    const textOnly = raw.trim();
    return {
      text: textOnly,
      queuedInput: null,
      explicitAction: detectExplicitActionFromText(textOnly),
    };
  }

  const payloadRaw = raw.slice(start + QUEUED_INPUT_OPEN.length, end).trim();
  let queuedInput: SanitizedQueuedInput | null = null;
  try {
    queuedInput = sanitizeQueuedInput(payloadRaw ? JSON.parse(payloadRaw) : null);
  } catch {
    queuedInput = null;
  }

  const cleanedText = `${raw.slice(0, start)} ${raw.slice(end + QUEUED_INPUT_CLOSE.length)}`
    .replace(/\s+/g, ' ')
    .trim();

  return {
    text: cleanedText,
    queuedInput,
    explicitAction: resolveQueuedExplicitAction(queuedInput) ?? detectExplicitActionFromText(cleanedText),
  };
}

function buildQueuedInputPrompt(queuedInput: any) {
  if (!queuedInput || typeof queuedInput !== 'object') return null;
  const suggestionDecision = queuedInput.suggestionDecision ?? null;
  const yesNo = queuedInput.answers?.yesNo ?? null;
  const choice = queuedInput.answers?.choice ?? null;
  const clarify = queuedInput.answers?.clarify ?? null;
  const actionPrimary = queuedInput.suggestions?.actionPrimary ?? null;
  const actionSecondary = queuedInput.suggestions?.actionSecondary ?? null;
  const changeSetAction = queuedInput.suggestions?.changeSetAction ?? null;
  const explicitAction = resolveQueuedExplicitAction(queuedInput);
  const sentAt = queuedInput.sentAt ?? null;
  return [
    'QUEUED_UI_INPUT (staged from chat blocks):',
    `- suggestionDecision: ${JSON.stringify(suggestionDecision)}`,
    `- yesNo: ${JSON.stringify(yesNo)}`,
    `- choice: ${JSON.stringify(choice)}`,
    `- clarify: ${JSON.stringify(clarify)}`,
    `- actionPrimary: ${JSON.stringify(actionPrimary)}`,
    `- actionSecondary: ${JSON.stringify(actionSecondary)}`,
    `- changeSetAction: ${JSON.stringify(changeSetAction)}`,
    `- explicitAction: ${JSON.stringify(explicitAction)}`,
    `- sentAt: ${JSON.stringify(sentAt)}`,
    'Treat these values as explicit user inputs for this turn.',
  ].join('\n');
}

function parseApprovalDecision(userMessage?: string): ApprovalDecision {
  const text = String(userMessage ?? '').trim().toLowerCase();
  if (!text) return 'ambiguous';
  const approveTokens = [
    'yes',
    'approve',
    'approved',
    'ok',
    'done',
    'sure',
    '\u05db\u05df',
    '\u05de\u05d0\u05e9\u05e8',
    '\u05de\u05d0\u05e9\u05e8\u05ea',
    '\u05d9\u05d0\u05dc\u05dc\u05d4',
    '\u05e1\u05d1\u05d1\u05d4',
  ];
  const rejectTokens = [
    'no',
    'reject',
    'decline',
    'cancel',
    'stop',
    '\u05dc\u05d0',
    '\u05d1\u05d8\u05dc',
    '\u05e2\u05d6\u05d5\u05d1',
  ];
  if (approveTokens.some((token) => text === token || text.includes(`${token} `) || text.includes(` ${token}`))) {
    return 'approve';
  }
  if (rejectTokens.some((token) => text === token || text.includes(`${token} `) || text.includes(` ${token}`))) {
    return 'reject';
  }
  if (isWorkflowReply(text)) return 'ambiguous';
  return 'ambiguous';
}

function toHeList(items: any) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.map((item) => {
    if (typeof item === 'string') return item;
    if (item?.messageHe) return item.messageHe;
    if (item?.message_he) return item.message_he;
    if (item?.labelHe) return item.labelHe;
    if (item?.label_he) return item.label_he;
    if (item?.titleHe) return item.titleHe;
    if (item?.title_he) return item.title_he;
    return JSON.stringify(item);
  });
}

function buildReviewBlock(args: { titleHe: string; summaryHe?: string; risks?: any }) {
  const risksHe = toHeList(args.risks ?? []);
  const highlightsHe = args.summaryHe ? [args.summaryHe] : [];
  return {
    type: 'ReviewBlock',
    titleHe: args.titleHe,
    sections: [
      {
        sectionHe: 'סיכום',
        highlightsHe,
        risksHe,
      },
    ],
    risksHe,
  };
}

function collectIntentsFromResult(result: any, sourceToolId?: string | null): any[] {
  const mergePayloadFromResult = (intent: any) => {
    if (!intent || typeof intent !== 'object') return intent
    const type = String(intent?.type ?? '')
    if (!type) return intent
    const payload =
      intent?.payload && typeof intent.payload === 'object' && !Array.isArray(intent.payload)
        ? { ...intent.payload }
        : {}
    let changed = false
    const setIfMissing = (key: string, value: any) => {
      if (payload[key] !== undefined || value === undefined) return
      payload[key] = value
      changed = true
    }

    if (type === 'plan.tasks_intent') {
      setIfMissing('tasks', Array.isArray(result?.tasks) ? result.tasks : undefined)
      setIfMissing('elements', Array.isArray(result?.elements) ? result.elements : undefined)
      setIfMissing('meta', result?.meta)
    } else if (type === 'plan.elements_intent') {
      setIfMissing('elements', Array.isArray(result?.elements) ? result.elements : undefined)
      setIfMissing('meta', result?.meta)
    } else if (type === 'cost.budget_intent') {
      setIfMissing('materialLines', Array.isArray(result?.materialLines) ? result.materialLines : undefined)
      setIfMissing('workLines', Array.isArray(result?.workLines) ? result.workLines : undefined)
      setIfMissing('meta', result?.meta)
    } else if (type === 'quote.intent') {
      setIfMissing('quote', result?.quote)
      setIfMissing('meta', result?.meta)
    } else if (type === 'runbook.install_intent') {
      setIfMissing('runbook', result?.runbook)
      setIfMissing('meta', result?.meta)
    } else if (type === 'ops.daily_plan_intent') {
      setIfMissing('dailyPlan', Array.isArray(result?.dailyPlan) ? result.dailyPlan : undefined)
      setIfMissing('meta', result?.meta)
    }

    if (!changed) return intent
    return { ...intent, payload }
  }

  const out: any[] = []
  if (result?.intent) out.push(mergePayloadFromResult(result.intent))
  if (Array.isArray(result?.intents)) out.push(...result.intents.map((item: any) => mergePayloadFromResult(item)))
  if (Array.isArray(result?.fixIntents)) out.push(...result.fixIntents.map((item: any) => mergePayloadFromResult(item)))
  if (Array.isArray(result?.repairIntents)) out.push(...result.repairIntents.map((item: any) => mergePayloadFromResult(item)))

  const source = String(sourceToolId ?? '').trim()
  if (out.length === 0 && source) {
    if (source === 'plan.tasks' && Array.isArray(result?.tasks) && result.tasks.length > 0) {
      out.push({
        type: 'plan.tasks_intent',
        payload: {
          tasks: result.tasks,
          elements: Array.isArray(result?.elements) ? result.elements : undefined,
          meta: result?.meta,
        },
      })
    } else if (source === 'plan.elements' && Array.isArray(result?.elements) && result.elements.length > 0) {
      out.push({
        type: 'plan.elements_intent',
        payload: {
          elements: result.elements,
          meta: result?.meta,
        },
      })
    } else if (
      source === 'cost.build_budget' &&
      (
        (Array.isArray(result?.materialLines) && result.materialLines.length > 0) ||
        (Array.isArray(result?.workLines) && result.workLines.length > 0)
      )
    ) {
      out.push({
        type: 'cost.budget_intent',
        payload: {
          materialLines: Array.isArray(result?.materialLines) ? result.materialLines : [],
          workLines: Array.isArray(result?.workLines) ? result.workLines : [],
          meta: result?.meta,
        },
      })
    } else if (source === 'quote.generate' && result?.quote) {
      out.push({
        type: 'quote.intent',
        payload: {
          quote: result.quote,
          meta: result?.meta,
        },
      })
    } else if (source === 'runbook.installation' && result?.runbook) {
      out.push({
        type: 'runbook.install_intent',
        payload: {
          runbook: result.runbook,
          meta: result?.meta,
        },
      })
    } else if (source === 'ops.daily_plan' && Array.isArray(result?.dailyPlan) && result.dailyPlan.length > 0) {
      out.push({
        type: 'ops.daily_plan_intent',
        payload: {
          dailyPlan: result.dailyPlan,
          meta: result?.meta,
        },
      })
    }
  }

  return out.filter(Boolean)
}

function normalizeReviewIssues(review: any): any[] {
  if (!review) return [];
  if (Array.isArray(review.issues)) return review.issues;
  const errors = Array.isArray(review.errors) ? review.errors : [];
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  return [...errors, ...warnings];
}

function hasChangeProducingIntents(intents: any[]) {
  return (Array.isArray(intents) ? intents : []).some((intent: any) => {
    const type = String(intent?.type ?? '').toLowerCase();
    if (!type) return false;
    return (
      type.includes('create') ||
      type.includes('patch') ||
      type.includes('update') ||
      type.includes('delete') ||
      type.includes('plan.') ||
      type.includes('cost.') ||
      type.includes('quote.') ||
      type.includes('runbook.') ||
      type.includes('ops.')
    );
  });
}


function summarizeChangeSetCoverage(changeSet: any) {
  const ops = Array.isArray(changeSet?.ops) ? changeSet.ops : [];
  const entities = ops.map((op: any) => String(op?.entity ?? '').toLowerCase());
  return {
    opCount: ops.length,
    hasElements: entities.includes('element'),
    hasTasks: entities.includes('task'),
    hasAccounting:
      entities.includes('materialline') ||
      entities.includes('workline'),
  };
}

function extractQuestionTexts(text: string): string[] {
  const source = String(text ?? '').trim();
  if (!source) return [];
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const direct = lines.filter((line) => line.includes('?'));
  if (direct.length > 0) return direct.slice(0, 3);
  const sentenceMatches = source.match(/[^?]+\?/g) ?? [];
  return sentenceMatches.map((s) => s.trim()).filter(Boolean).slice(0, 3);
}

function parseListLikeItems(source: string, maxItems: number) {
  const lines = String(source ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLike = lines
    .map((line) => line.replace(/^[-*•]\s+/, '').replace(/^\d+[\.)]\s+/, '').trim())
    .filter(Boolean);
  if (bulletLike.length > 0) return bulletLike.slice(0, maxItems);
  return lines.slice(0, maxItems);
}

function extractLabeledBlocksFromText(text: string) {
  const source = String(text ?? '').trim();
  if (!source) return [] as any[];

  const questionsMatch =
    source.match(/(?:^|\n)\s*(?:questions?|clarifications?)\s*:\s*([\s\S]*?)(?=\n\s*(?:suggestions?|actions?)\s*:|$)/i) ??
    source.match(/(?:^|\n)\s*(?:שאלות|הבהרות)\s*:\s*([\s\S]*?)(?=\n\s*(?:הצעות|פעולות)\s*:|$)/i);
  const suggestionsMatch =
    source.match(/(?:^|\n)\s*(?:suggestions?|actions?)\s*:\s*([\s\S]*?)(?=\n\s*(?:questions?|clarifications?)\s*:|$)/i) ??
    source.match(/(?:^|\n)\s*(?:הצעות|פעולות)\s*:\s*([\s\S]*?)(?=\n\s*(?:שאלות|הבהרות)\s*:|$)/i);

  const questionsText = questionsMatch?.[1] ?? '';
  const suggestionsText = suggestionsMatch?.[1] ?? '';
  const extractedQuestions = parseListLikeItems(questionsText, 3);
  const extractedSuggestions = parseListLikeItems(suggestionsText, 3);

  const blocks: any[] = [];
  if (extractedQuestions.length > 0) {
    blocks.push({
      type: 'QuestionsBlock',
      titleHe: 'שאלת הבהרה קצרה',
      questions: [
        {
          id: 'q_from_labeled_text',
          textHe: extractedQuestions[0],
          type: 'text',
        },
      ],
    });
  }
  if (extractedSuggestions.length > 0) {
    blocks.push({
      type: 'SuggestionsBlock',
      titleHe: 'צעדים מומלצים להמשך',
      suggestions: extractedSuggestions.slice(0, 3).map((label: string, index: number) => ({
        id: `s_from_labeled_text_${index + 1}`,
        actionKey: `text_suggestion_${index + 1}`,
        labelHe: label,
        whyHe: 'הומר מתוך טקסט התשובה',
      })),
      freeTextPromptHe: 'אפשר גם לכתוב תשובה חופשית בצ׳אט.',
    });
  }
  return blocks;
}

function buildFallbackSuggestionBlock(isPlanningRequest: boolean) {
  return buildContextAwareSuggestionBlock({
    isPlanningRequest,
    intent: isPlanningRequest ? 'planning_request' : 'project_read_qna',
    userText: isPlanningRequest ? 'planning follow-up' : 'next step',
    context: null,
  });
}

function normalizeForCompare(value: any) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectRecentBlockTexts(history: any[], limit = 8) {
  const messages = Array.isArray(history) ? history.slice(-limit) : [];
  const out: string[] = [];
  for (const message of messages) {
    const blocks = Array.isArray(message?.blocks) ? message.blocks : [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'SuggestionsBlock' || block.type === 'SuggestionBlock') {
        const suggestions = Array.isArray(block.suggestions) ? block.suggestions : [];
        for (const item of suggestions) {
          const label = String(item?.labelHe ?? item?.titleHe ?? item?.label ?? '').trim();
          const why = String(item?.whyHe ?? item?.descriptionHe ?? '').trim();
          if (label) out.push(label);
          if (why) out.push(why);
        }
      }
      if (block.type === 'QuestionsBlock') {
        const questions = Array.isArray(block.questions) ? block.questions : [];
        for (const question of questions) {
          const text = String(question?.textHe ?? question?.questionHe ?? '').trim();
          if (text) out.push(text);
        }
      }
    }
  }
  return out.map((entry) => normalizeForCompare(entry)).filter(Boolean);
}

function isRepeatedText(value: string, recentNormalized: string[]) {
  const normalized = normalizeForCompare(value);
  if (!normalized) return false;
  return recentNormalized.some((item) => item === normalized || item.includes(normalized) || normalized.includes(item));
}

const GENERIC_HINTS = [
  'next action',
  'continue',
  'follow up',
  'clarify',
  'quick clarification',
  'answer from context',
  'ask one clarifying question',
  'choose one or more',
  'how should we continue',
  'המשך',
  'הבהרה',
  'שאלת הבהרה',
  'שאלה כללית',
  'פעולה הבאה',
  'איך נמשיך',
];

function isGenericText(value: any) {
  const normalized = normalizeForCompare(value);
  if (!normalized) return true;
  if (normalized.length < 8) return true;
  return GENERIC_HINTS.some((hint) => normalized.includes(normalizeForCompare(hint)));
}

function summarizeContextSignals(context: any) {
  const tasks = Array.isArray(context?.tasks) ? context.tasks : [];
  const elements = Array.isArray(context?.elements) ? context.elements : [];
  const materialLines = Array.isArray(context?.materialLines) ? context.materialLines : [];
  const workLines = Array.isArray(context?.workLines) ? context.workLines : [];
  const quote = context?.quote ?? null;

  const openTask = tasks.find((task: any) =>
    ['todo', 'open', 'pending', 'in_progress', 'blocked'].includes(String(task?.status ?? '').toLowerCase())
  ) ?? tasks[0] ?? null;
  const openElement = elements.find((element: any) =>
    ['draft', 'pending', 'open', 'in_progress'].includes(String(element?.status ?? '').toLowerCase())
  ) ?? elements[0] ?? null;
  const focusTitle = String(openTask?.title ?? openElement?.title ?? context?.project?.name ?? '').trim();

  return {
    taskCount: tasks.length,
    elementCount: elements.length,
    materialCount: materialLines.length,
    workCount: workLines.length,
    hasQuote: Boolean(quote),
    openTaskTitle: String(openTask?.title ?? '').trim(),
    openElementTitle: String(openElement?.title ?? '').trim(),
    focusTitle,
  };
}

function buildContextAwareSuggestionBlock(args: {
  isPlanningRequest: boolean;
  intent?: string | null;
  userText?: string;
  context?: any;
  recentBlockTexts?: string[];
}) {
  const projectName = String(args.context?.project?.name ?? '').trim();
  const userText = String(args.userText ?? '').trim();
  const writeLike = args.intent === 'project_write_change' || args.intent === 'planning_request' || args.isPlanningRequest;
  const recent = Array.isArray(args.recentBlockTexts) ? args.recentBlockTexts : [];
  const signals = summarizeContextSignals(args.context);

  const candidates: any[] = [];
  if (signals.openTaskTitle) {
    candidates.push({
      id: 's_task_focus',
      actionKey: 'focus_task',
      labelHe: `לקדם עכשיו את המשימה: ${signals.openTaskTitle}`,
      whyHe: 'זו המשימה הפתוחה עם ההשפעה הגבוהה ביותר כרגע.',
      payload: { action: 'focus_task', focusTaskTitle: signals.openTaskTitle },
    });
  }
  if (signals.taskCount === 0 && signals.elementCount > 0) {
    candidates.push({
      id: 's_build_tasks',
      actionKey: 'build_tasks',
      labelHe: `לייצר משימות לביצוע עבור ${signals.openElementTitle || 'האלמנטים שהוגדרו'}`,
      whyHe: 'יש אלמנטים, אבל עדיין אין פירוק ביצועי למשימות.',
      payload: { action: 'build_tasks' },
    });
  }
  if (signals.elementCount === 0) {
    candidates.push({
      id: 's_define_elements',
      actionKey: 'build_elements',
      labelHe: 'להגדיר עכשיו 2-4 אלמנטים מרכזיים',
      whyHe: 'בלי מבנה אלמנטים אי אפשר להתקדם לתכנון אמין.',
      payload: { action: 'build_elements' },
    });
  }
  if (signals.materialCount + signals.workCount === 0 && signals.taskCount > 0) {
    candidates.push({
      id: 's_budget_lines',
      actionKey: 'build_budget',
      labelHe: 'לבנות שורות חומר + עבודה למשימות הפעילות',
      whyHe: 'המשימות קיימות, אבל חסרה כרגע תמונת עלות.',
      payload: { action: 'build_budget' },
    });
  }
  if (!signals.hasQuote && (signals.materialCount > 0 || signals.workCount > 0)) {
    candidates.push({
      id: 's_quote_first',
      actionKey: 'build_quote',
      labelHe: 'להפיק טיוטת הצעת מחיר ראשונה מהעלויות הקיימות',
      whyHe: 'כבר קיימות שורות עלות, אז אפשר לייצר בסיס להצעה ללקוח.',
      payload: { action: 'build_quote' },
    });
  }
  candidates.push({
    id: 's_context_gap',
    actionKey: 'clarify',
    labelHe: signals.focusTitle
      ? `לחדד חסם אחד שחוסם את ${signals.focusTitle}`
      : 'לחדד את החסם המרכזי הבא',
    whyHe: 'החלטה אחת נכונה עכשיו תפתח את הצעד המעשי הבא.',
    payload: { action: 'clarify' },
  });
  if (writeLike) {
    candidates.push({
      id: 's_changeset',
      actionKey: 'create_changeset',
      labelHe: 'לייצר ChangeSet לאישור',
      whyHe: 'להכין עדכונים לבדיקה ואישור בלי החלה אוטומטית.',
      payload: { action: 'create_changeset' },
    });
  }

  const suggestions = candidates
    .filter((candidate) => !isGenericText(candidate?.labelHe))
    .filter((candidate) => !isRepeatedText(String(candidate?.labelHe ?? ''), recent))
    .slice(0, 3);

  while (suggestions.length < (writeLike ? 3 : 2) && suggestions.length < candidates.length) {
    const next = candidates[suggestions.length];
    if (!next) break;
    if (!suggestions.some((item) => String(item?.actionKey ?? '') === String(next?.actionKey ?? ''))) {
      suggestions.push(next);
    }
  }

  return {
    type: 'SuggestionsBlock',
    titleHe: `צעדים מומלצים להמשך${projectName ? ` - ${projectName}` : ''}${userText ? `: ${clipText(userText, 56)}` : ''}`,
    suggestions: suggestions.slice(0, 3),
  };
}
function hasSuggestionControls(block: any) {
  if (!block) return false;
  if (block.type !== 'SuggestionBlock' && block.type !== 'SuggestionsBlock') return false;
  const items = Array.isArray(block.suggestions)
    ? block.suggestions
    : Array.isArray(block.items)
      ? block.items
      : [];
  return items.length > 0;
}

function hasUsableQuestionControls(block: any) {
  if (!block || block.type !== 'QuestionsBlock') return false;
  const questions = Array.isArray(block.questions) ? block.questions : [];
  return questions.length > 0;
}

function buildContextAwareQuestionsBlock(args: {
  isPlanningRequest: boolean;
  intent?: string | null;
  userText?: string;
  context?: any;
  recentBlockTexts?: string[];
}) {
  const userText = String(args.userText ?? '').trim();
  const writeLike = args.intent === 'project_write_change' || args.intent === 'planning_request' || args.isPlanningRequest;
  const recent = Array.isArray(args.recentBlockTexts) ? args.recentBlockTexts : [];
  const signals = summarizeContextSignals(args.context);
  const focusLabel = signals.openTaskTitle || signals.openElementTitle || signals.focusTitle || 'היקף הפרויקט הנוכחי';
  const primaryGap = signals.elementCount === 0
    ? 'חסרה הגדרת אלמנטים מרכזיים'
    : signals.taskCount === 0
      ? 'חסרות משימות ביצוע'
      : signals.materialCount + signals.workCount === 0
        ? 'חסרות שורות עלות'
        : !signals.hasQuote
          ? 'חסר בסיס להצעת מחיר'
          : 'חסרה החלטה קריטית אחת';

  let yesNoQuestionText = `להתמקד עכשיו ב-${focusLabel}?`;
  if (writeLike) yesNoQuestionText = `לבצע עכשיו את העדכון הבא עבור ${focusLabel}?`;
  if (userText) yesNoQuestionText = `${yesNoQuestionText} (הקשר: ${clipText(userText, 52)})`;
  if (isRepeatedText(yesNoQuestionText, recent) || isGenericText(yesNoQuestionText)) {
    yesNoQuestionText = writeLike
      ? `להחיל בסבב הזה את העדכון הבא סביב ${focusLabel}?`
      : `שהתשובה הבאה תהיה ממוקדת אך ורק ב-${focusLabel}?`;
  }

  const optionsHe = [
    writeLike ? `להכין ChangeSet עבור ${focusLabel}` : `לתת תשובה ממוקדת עבור ${focusLabel}`,
    `לסגור פער: ${primaryGap}`,
    signals.taskCount > 0 ? 'לפרק את העבודה לצעדי ביצוע' : 'לייצר רשימת משימות ביצוע ראשונה',
    signals.materialCount + signals.workCount > 0 ? 'להמיר עלויות קיימות לטיוטת הצעת מחיר' : 'לבנות בסיס עלויות ראשוני',
  ]
    .filter((option) => !isRepeatedText(option, recent))
    .slice(0, 4);
  if (optionsHe.length < 2) {
    optionsHe.push('לשאול שאלה חוסמת אחת שתפתח התקדמות');
  }

  const multiQuestionText = `מה התוצאה הכי דחופה שצריך לקדם בסבב הבא עבור ${focusLabel}?`;

  return {
    type: 'QuestionsBlock',
    titleHe: 'החלטות קצרות להמשך',
    questions: [
      {
        id: 'q_yes_no',
        textHe: yesNoQuestionText,
        type: 'toggle',
      },
      {
        id: 'q_multi',
        textHe: multiQuestionText,
        type: 'multi',
        optionsHe,
      },
    ],
  };
}
function clipText(value: any, maxLen: number) {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

function compactBootstrapForChat(intent: string | null, context: any) {
  if (!context || typeof context !== 'object') return context;
  const compact: any = {};
  const maxElements = Number(process.env.SDK_CHAT_BOOTSTRAP_MAX_ELEMENTS ?? 8);
  const maxTasks = Number(process.env.SDK_CHAT_BOOTSTRAP_MAX_TASKS ?? 18);
  const maxLines = Number(process.env.SDK_CHAT_BOOTSTRAP_MAX_LINES ?? 12);

  if (context.project) {
    compact.project = {
      id: context.project.id,
      name: context.project.name,
      stage: context.project.stage,
      eventDate: context.project.eventDate,
      status: context.project.status,
      summary: clipText(context.project.summary, 500),
      notes: clipText(context.project.notes, 350),
    };
  }

  if (Array.isArray(context.elements)) {
    compact.elements = context.elements.slice(0, maxElements).map((e: any) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      type: e.type,
      description: clipText(e.description, 220),
    }));
  }

  if (Array.isArray(context.tasks)) {
    compact.tasks = context.tasks.slice(0, maxTasks).map((t: any) => ({
      id: t.id,
      title: t.title,
      elementId: t.elementId,
      status: t.status,
      workType: t.workType,
      estimatedHours: t.estimatedHours,
      description: clipText(t.description, 200),
    }));
  }

  if (intent === 'project_read_qna' || intent === 'project_write_change' || intent === 'planning_request') {
    if (Array.isArray(context.materialLines)) {
      compact.materialLines = context.materialLines.slice(0, maxLines).map((line: any) => ({
        id: line.id,
        taskId: line.taskId,
        elementId: line.elementId,
        title: line.title,
        sectionKey: line.sectionKey,
        plannedTotalCost: line.plannedTotalCost,
      }));
    }
    if (Array.isArray(context.workLines)) {
      compact.workLines = context.workLines.slice(0, maxLines).map((line: any) => ({
        id: line.id,
        taskId: line.taskId,
        elementId: line.elementId,
        title: line.title,
        workType: line.workType,
        hours: line.hours,
        plannedTotalCost: line.plannedTotalCost,
      }));
    }
  }

  if (context.quote) {
    compact.quote = {
      id: context.quote.id,
      titleHe: clipText(context.quote.titleHe, 160),
      createdAt: context.quote.createdAt,
    };
  }

  return compact;
}

function summarizeBlocksForPrompt(blocks: any[]) {
  const lines: string[] = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'ChatBlock') {
      const text = String(block?.markdownHe ?? block?.contentHe ?? '').trim();
      if (text) lines.push(`Chat: ${text}`);
    }
    if (block.type === 'QuestionsBlock') {
      const questions = Array.isArray(block?.questions) ? block.questions : [];
      const list = questions
        .map((question: any) => String(question?.textHe ?? question?.questionHe ?? '').trim())
        .filter(Boolean)
        .slice(0, 4);
      if (list.length > 0) lines.push(`Questions: ${list.join(' | ')}`);
    }
    if (block.type === 'SuggestionsBlock' || block.type === 'SuggestionBlock') {
      const suggestions = Array.isArray(block?.suggestions) ? block.suggestions : [];
      const list = suggestions
        .map((item: any) => String(item?.labelHe ?? item?.titleHe ?? item?.label ?? '').trim())
        .filter(Boolean)
        .slice(0, 4);
      if (list.length > 0) lines.push(`Suggestions: ${list.join(' | ')}`);
    }
  }
  return lines.join('\n');
}

function toPromptMessage(m: any, isChatEditRun: boolean) {
  const text = String(m?.text ?? '').trim();
  if (text) return { role: m.role, content: text };
  if (!isChatEditRun && m?.blocks) {
    return { role: m.role, content: JSON.stringify(m.blocks) };
  }
  const blocks = Array.isArray(m?.blocks) ? m.blocks : [];
  const chatLike = summarizeBlocksForPrompt(blocks);
  return { role: m.role, content: chatLike || '' };
}

function normalizeAssistantBlock(raw: any): any[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return normalizeAssistantBlock(JSON.parse(trimmed));
    } catch {
      return [{ type: 'ChatBlock', markdownHe: trimmed }];
    }
  }
  if (Array.isArray(raw)) return raw.flatMap((item) => normalizeAssistantBlock(item));
  if (typeof raw !== 'object') return [{ type: 'ChatBlock', markdownHe: String(raw) }];
  const out: any[] = [];
  if (raw.ChatBlock) {
    const source = raw.ChatBlock;
    const markdownHe = typeof source === 'string'
      ? source
      : String(source?.markdownHe ?? source?.text ?? source?.contentHe ?? '').trim();
    if (markdownHe) out.push({ type: 'ChatBlock', markdownHe });
  }
  const mapSuggestionItem = (item: any, index: number) => {
    const labelHe = String(item?.labelHe ?? item?.label ?? item?.text ?? item?.title ?? item?.description ?? '').trim();
    if (!labelHe) return null;
    return {
      ...item,
      id: String(item?.id ?? `s_${index + 1}`),
      actionKey: String(item?.actionKey ?? item?.payload?.action ?? item?.id ?? `action_${index + 1}`),
      labelHe,
      whyHe: String(item?.whyHe ?? item?.why ?? '').trim(),
    };
  };
  const mapQuestionItem = (item: any, index: number) => {
    if (typeof item === 'string') {
      const textHe = item.trim();
      if (!textHe) return null;
      return { id: `q_${index + 1}`, textHe, type: 'text' };
    }
    const textHe = String(
      item?.textHe ??
      item?.text_he ??
      item?.text ??
      item?.questionHe ??
      item?.question_he ??
      item?.question ??
      item?.labelHe ??
      item?.label ??
      ''
    ).trim();
    if (!textHe) return null;
    const rawOptions = item?.optionsHe ?? item?.options_he ?? item?.options;
    const optionsHe = Array.isArray(rawOptions)
      ? rawOptions
        .map((option: any) => {
          if (typeof option === 'string') return option.trim();
          return String(option?.labelHe ?? option?.label ?? option?.text ?? option?.title ?? option?.value ?? '').trim();
        })
        .filter(Boolean)
      : undefined;
    return {
      ...item,
      id: String(item?.id ?? `q_${index + 1}`),
      textHe,
      type: item?.type ?? 'text',
      ...(optionsHe && optionsHe.length > 0 ? { optionsHe } : {}),
    };
  };

  if (raw.type) {
    if (raw.type === 'ChatBlock') {
      const markdownHe = String(raw?.markdownHe ?? raw?.contentHe ?? raw?.text ?? '').trim();
      if (!markdownHe) return [];
      return [{ ...raw, type: 'ChatBlock', markdownHe }];
    }
    if (raw.type === 'QuestionsBlock') {
      const questions = (Array.isArray(raw?.questions) ? raw.questions : [])
        .map((item: any, index: number) => mapQuestionItem(item, index))
        .filter(Boolean);
      if (questions.length === 0) return [];
      return [{
        ...raw,
        type: 'QuestionsBlock',
        titleHe: raw?.titleHe ?? raw?.title_he ?? 'שאלת הבהרה קצרה',
        questions,
      }];
    }
    if (raw.type === 'SuggestionBlock' || raw.type === 'SuggestionsBlock') {
      const sourceItems = Array.isArray(raw?.suggestions)
        ? raw.suggestions
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
      const suggestions = sourceItems
        .map((item: any, index: number) => mapSuggestionItem(item, index))
        .filter(Boolean);
      if (suggestions.length === 0) return [];
      return [{
        ...raw,
        type: raw.type === 'SuggestionBlock' ? 'SuggestionBlock' : 'SuggestionsBlock',
        titleHe: raw?.titleHe ?? raw?.title_he ?? 'Suggested next steps',
        suggestions,
      }];
    }
    if (raw.type === 'ChangeSetBlock' || raw.type === 'ReviewBlock') return [raw];
    return [raw];
  }

  if (raw.QuestionsBlock) {
    const source = raw.QuestionsBlock;
    const fromArray = Array.isArray(source)
      ? source.map((q: any, i: number) => (typeof q === 'string' ? { id: `q_${i + 1}`, textHe: q, type: 'text' } : q))
      : [];
    const fromSingleQuestion = !Array.isArray(source) && typeof source?.question === 'string'
      ? [{ id: 'q_1', textHe: source.question, type: 'text' }]
      : [];
    const fromObjectText = !Array.isArray(source) && typeof source?.textHe === 'string'
      ? [{ id: String(source?.id ?? 'q_1'), textHe: source.textHe, type: source?.type ?? 'text', optionsHe: source?.optionsHe }]
      : [];
    const questions = [...fromArray, ...fromSingleQuestion, ...fromObjectText].filter(Boolean);
    out.push({
      type: 'QuestionsBlock',
      titleHe: raw.titleHe ?? raw.title_he ?? source?.titleHe ?? source?.title_he ?? 'שאלת הבהרה קצרה',
      questions,
    });
  }
  if (raw.SuggestionBlock) {
    const source = raw.SuggestionBlock;
    const sourceItems = Array.isArray(source?.suggestions)
      ? source.suggestions
      : Array.isArray(source)
        ? source
        : source?.suggestion
          ? [source.suggestion]
          : source && typeof source === 'object'
            ? [source]
            : [];
    out.push({
      type: 'SuggestionBlock',
      ...(source && typeof source === 'object' && !Array.isArray(source) ? source : {}),
      suggestions: sourceItems.map((item: any, index: number) => mapSuggestionItem(item, index)).filter(Boolean),
    });
  }
  if (raw.SuggestionsBlock) {
    const source = raw.SuggestionsBlock;
    const sourceItems = Array.isArray(source?.suggestions)
      ? source.suggestions
      : Array.isArray(source)
        ? source
        : source && typeof source === 'object' && source.text
          ? [source]
          : [];
    out.push({
      type: 'SuggestionsBlock',
      ...(source && typeof source === 'object' && !Array.isArray(source) ? source : {}),
      titleHe: source?.titleHe ?? source?.title_he ?? 'Suggested next steps',
      suggestions: sourceItems.map((item: any, index: number) => mapSuggestionItem(item, index)).filter(Boolean),
    });
  }
  if (raw.ChangeSetBlock) {
    const source = Array.isArray(raw.ChangeSetBlock) ? raw.ChangeSetBlock[0] : raw.ChangeSetBlock;
    if (source && typeof source === 'object') out.push({ type: 'ChangeSetBlock', ...source });
  }
  if (raw.ReviewBlock) {
    const source = Array.isArray(raw.ReviewBlock) ? raw.ReviewBlock[0] : raw.ReviewBlock;
    if (source && typeof source === 'object') {
      const summaryHe = String(source?.summaryHe ?? source?.text ?? source?.markdownHe ?? '').trim();
      out.push({
        type: 'ReviewBlock',
        ...source,
        ...(summaryHe ? { summaryHe } : {}),
      });
    }
  }
  if (out.length > 0) return out;
  const markdown = String(raw.markdownHe ?? raw.contentHe ?? raw.summaryHe ?? '').trim();
  if (markdown) return [{ type: 'ChatBlock', markdownHe: markdown }];
  return [{ type: 'ChatBlock', markdownHe: JSON.stringify(raw) }];
}

function isTaskGenerationRequest(text: string) {
  const value = String(text ?? '').toLowerCase()
  if (!value.trim()) return false
  return (
    value.includes('task') ||
    value.includes('tasks') ||
    value.includes('plan.tasks') ||
    value.includes('build_tasks') ||
    value.includes('משימ')
  )
}

function hasTasksIntent(intents: any[]) {
  return (Array.isArray(intents) ? intents : []).some((intent: any) => {
    if (String(intent?.type ?? '') !== 'plan.tasks_intent') return false
    return Array.isArray(intent?.payload?.tasks) && intent.payload.tasks.length > 0
  })
}

function hasWrapperShapeCoercion(raw: any) {
  if (!raw || typeof raw !== 'object') return false;
  const source = raw?.blocks ?? raw;
  const list = Array.isArray(source) ? source : [source];
  return list.some((item: any) => {
    if (!item || typeof item !== 'object') return false;
    if (item.ChatBlock && typeof item.ChatBlock === 'object') return true;
    if (Array.isArray(item.SuggestionsBlock)) return true;
    if (Array.isArray(item.ChangeSetBlock) || Array.isArray(item.ReviewBlock)) return true;
    return false;
  });
}

function normalizeAssistantResponse(parsed: any, rawText: string) {
  const blocks = normalizeAssistantBlock(parsed?.blocks ?? parsed);
  if (blocks.length > 0) return blocks;
  const fallbackText = String(parsed?.summaryHe ?? parsed?.contentHe ?? rawText ?? '').trim();
  if (!fallbackText) return [];
  return [{ type: 'ChatBlock', markdownHe: fallbackText }];
}

function ensureMinimumBlocks(args: {
  blocks: any;
  summaryHe?: string;
  rawText?: string;
  isPlanningRequest: boolean;
  includeSuggestions?: boolean;
  alwaysIncludeNextSet?: boolean;
  skipSyntheticNextSet?: boolean;
  intent?: string | null;
  userText?: string;
  context?: any;
  history?: any[];
}) {
  const blocks = Array.isArray(args.blocks) ? args.blocks.filter(Boolean) : [];
  const recentBlockTexts = collectRecentBlockTexts(args.history ?? []);
  if (args.alwaysIncludeNextSet && !args.skipSyntheticNextSet) {
    if (blocks.length > 0) {
      return blocks;
    }
    const baseBlocks = blocks.filter((block: any) => block?.type !== 'SuggestionBlock' && block?.type !== 'SuggestionsBlock' && block?.type !== 'QuestionsBlock');
    const questionBlock = blocks.find((block: any) => hasUsableQuestionControls(block));
    const suggestionBlock = blocks.find((block: any) => hasSuggestionControls(block));
    const output = baseBlocks.length > 0
      ? [...baseBlocks]
      : [{ type: 'ChatBlock', markdownHe: String(args.rawText ?? args.summaryHe ?? 'איך תרצה/י שנמשיך?').trim() || 'איך תרצה/י שנמשיך?' }];
    output.push(
      questionBlock &&
      hasUsableQuestionControls(questionBlock) &&
      !isGenericText(String(questionBlock?.questions?.[0]?.textHe ?? '')) &&
      !isRepeatedText(String(questionBlock?.questions?.[0]?.textHe ?? ''), recentBlockTexts)
        ? {
          ...questionBlock,
          titleHe: questionBlock?.titleHe ?? questionBlock?.title_he ?? 'שאלת הבהרה קצרה',
          questions: (() => {
            const fallback = buildContextAwareQuestionsBlock({
              isPlanningRequest: args.isPlanningRequest,
              intent: args.intent,
              userText: args.userText,
              context: args.context,
              recentBlockTexts,
            }).questions;
            const current = Array.isArray(questionBlock?.questions) && questionBlock.questions.length > 0
              ? questionBlock.questions.slice(0, 2)
              : [];
            if (current.length >= 2) return current;
            const next = [...current];
            for (const candidate of fallback) {
              if (next.length >= 2) break;
              const id = String(candidate?.id ?? '');
              const exists = next.some((item: any) => String(item?.id ?? '') === id);
              if (!exists) next.push(candidate);
            }
            return next.slice(0, 2);
          })(),
        }
        : buildContextAwareQuestionsBlock({
          isPlanningRequest: args.isPlanningRequest,
          intent: args.intent,
          userText: args.userText,
          context: args.context,
          recentBlockTexts,
        })
    );
    output.push(
      (() => {
        const fallbackSuggestions = buildContextAwareSuggestionBlock({
          isPlanningRequest: args.isPlanningRequest,
          intent: args.intent,
          userText: args.userText,
          context: args.context,
          recentBlockTexts,
        })
        if (!(suggestionBlock && hasSuggestionControls(suggestionBlock))) {
          return fallbackSuggestions
        }
        const existing = Array.isArray(suggestionBlock?.suggestions) ? suggestionBlock.suggestions : []
        const merged = existing.filter((item: any) => {
          const label = String(item?.labelHe ?? item?.titleHe ?? item?.label ?? '');
          return !isGenericText(label) && !isRepeatedText(label, recentBlockTexts);
        })
        for (const candidate of fallbackSuggestions.suggestions ?? []) {
          if (merged.length >= 3) break
          const key = String(candidate?.actionKey ?? candidate?.id ?? '')
          const already = merged.some((item: any) => String(item?.actionKey ?? item?.id ?? '') === key)
          if (!already) merged.push(candidate)
        }
        return {
          ...suggestionBlock,
          suggestions: merged.slice(0, 3),
        }
      })()
    );

    const writeLike = args.intent === 'project_write_change' || args.intent === 'planning_request' || args.isPlanningRequest;
    const suggestionOut = output.find((block: any) => block?.type === 'SuggestionsBlock' || block?.type === 'SuggestionBlock');
    if (suggestionOut && Array.isArray(suggestionOut.suggestions)) {
      const all = suggestionOut.suggestions.filter(Boolean);
      const isChangeSetSuggestion = (item: any) => {
        const actionKey = String(item?.actionKey ?? '').toLowerCase();
        const payloadAction = String(item?.payload?.action ?? '').toLowerCase();
        return actionKey.includes('changeset') || payloadAction === 'create_changeset' || payloadAction === 'changeset.compile';
      };
      const actionSuggestions = all.filter((item: any) => !isChangeSetSuggestion(item)).slice(0, 2);
      const changeSetSuggestion = all.find((item: any) => isChangeSetSuggestion(item));
      suggestionOut.suggestions = writeLike && changeSetSuggestion
        ? [...actionSuggestions, changeSetSuggestion]
        : actionSuggestions;
    }
    return output;
  }
  if (blocks.length > 0) {
    if (!args.includeSuggestions) return blocks;
    const hasNextControls = blocks.some(
      (block: any) =>
        block?.type === 'SuggestionBlock' ||
        block?.type === 'SuggestionsBlock' ||
        block?.type === 'QuestionsBlock'
    );
    if (hasNextControls) return blocks;
    return [
      ...blocks,
      buildContextAwareSuggestionBlock({
        isPlanningRequest: args.isPlanningRequest,
        intent: args.intent,
        userText: args.userText,
        context: args.context,
        recentBlockTexts,
      }),
    ];
  }

  const sourceText = String(args.rawText ?? args.summaryHe ?? '').trim();
  const questionTexts = extractQuestionTexts(sourceText);
  if (questionTexts.length > 0) {
    return [
      {
        type: 'QuestionsBlock',
        titleHe: 'שאלת הבהרה קצרה',
        questions: [{ id: 'q_auto_1', textHe: questionTexts[0], type: 'text' }],
      },
    ];
  }

  if (sourceText) {
    if (!args.includeSuggestions) {
      return [{ type: 'ChatBlock', markdownHe: sourceText }];
    }
    return [
      { type: 'ChatBlock', markdownHe: sourceText },
      buildContextAwareSuggestionBlock({
        isPlanningRequest: args.isPlanningRequest,
        intent: args.intent,
        userText: args.userText,
        context: args.context,
        recentBlockTexts,
      }),
    ];
  }

  if (!args.includeSuggestions) {
    return [{ type: 'ChatBlock', markdownHe: 'יש לי תשובה קצרה. איך תרצה/י שנמשיך?' }];
  }
  return [
    buildContextAwareSuggestionBlock({
      isPlanningRequest: args.isPlanningRequest,
      intent: args.intent,
      userText: args.userText,
      context: args.context,
      recentBlockTexts,
    }),
    buildContextAwareQuestionsBlock({
      isPlanningRequest: args.isPlanningRequest,
      intent: args.intent,
      userText: args.userText,
      context: args.context,
      recentBlockTexts,
    }),
  ];
}

function stableHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function normalizeQaQuestionType(value: any): 'text' | 'number' | 'date' | 'single' | 'multi' | 'toggle' {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'number') return 'number';
  if (raw === 'date') return 'date';
  if (raw === 'single' || raw === 'select') return 'single';
  if (raw === 'multi' || raw === 'multiselect') return 'multi';
  if (raw === 'toggle' || raw === 'boolean' || raw === 'bool') return 'toggle';
  return 'text';
}

function extractVNextQuestionsFromBlocks(blocks: any[]) {
  const out: Array<{
    id: string;
    textHe: string;
    type: 'text' | 'number' | 'date' | 'single' | 'multi' | 'toggle';
    options: Array<{ value: string; labelHe?: string }>;
    blockingLevel: 'blocker' | 'helpful' | 'optional';
  }> = [];

  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || block.type !== 'QuestionsBlock') continue;
    const rawQuestions = Array.isArray(block.questions) ? block.questions : [];
    for (const raw of rawQuestions) {
      const textHe = String(raw?.textHe ?? raw?.questionHe ?? '').trim();
      if (!textHe) continue;
      const options = (Array.isArray(raw?.optionsHe) ? raw.optionsHe : [])
        .map((item: any, index: number) => {
          if (typeof item === 'string') {
            const label = item.trim();
            if (!label) return null;
            return { value: `opt_${index + 1}`, labelHe: label };
          }
          const label = String(item?.labelHe ?? item?.label ?? item?.value ?? '').trim();
          if (!label) return null;
          const value = String(item?.value ?? `opt_${index + 1}`).trim() || `opt_${index + 1}`;
          return { value, labelHe: label };
        })
        .filter(Boolean) as Array<{ value: string; labelHe?: string }>;

      out.push({
        id: String(raw?.id ?? stableHash(textHe.toLowerCase())),
        textHe,
        type: normalizeQaQuestionType(raw?.type),
        options,
        blockingLevel: 'blocker',
      });
    }
  }

  return out;
}

const STAGE_ORDER = ['intake', 'planning', 'costing', 'quote', 'review', 'execution'] as const;
type StageKey = (typeof STAGE_ORDER)[number];

function normalizeStageKey(value: any): StageKey | null {
  if (!value || typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return (STAGE_ORDER as readonly string[]).includes(key) ? (key as StageKey) : null;
}

function enforceStageTransition(current: StageKey, requested: StageKey) {
  const currentIndex = STAGE_ORDER.indexOf(current);
  const requestedIndex = STAGE_ORDER.indexOf(requested);
  if (requestedIndex === -1) return { next: current, reason: 'invalid' as const };
  if (requestedIndex <= currentIndex) return { next: requested, reason: 'same_or_back' as const };
  if (requestedIndex === currentIndex + 1) return { next: requested, reason: 'ok' as const };
  return { next: STAGE_ORDER[Math.min(currentIndex + 1, STAGE_ORDER.length - 1)], reason: 'skip' as const };
}

type ToolHandler = (args: any) => Promise<any>;

function toOpenAIToolName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Rich tool descriptions that tell the LLM WHEN and WHY to use each tool
const TOOL_DESCRIPTIONS: Record<string, string> = {
  'context.get': 'Fetch project context (elements, tasks, accounting, etc). USE THIS at the start of any planning/costing action to get current state.',
  'knowledge.summarize_or_update': 'Update working knowledge doc with new facts. USE THIS when you learn new info about the project.',
  'changeset.compile': 'Convert intents to ChangeSet ops to create/update entities in database. USE THIS after generating intents from plan.* or cost.* tools.',
  'changeset.review': 'Review a ChangeSet draft for issues when explicitly requested.',
  'changeset.apply': 'Apply ChangeSet after user approval token is present.',
  'clarify.next_questions': 'Ask focused clarifying questions. USE THIS only if you truly cannot proceed with 80% rule - prefer making assumptions.',
  'chat.free': 'Free conversation without structured output. USE THIS only when user explicitly wants to chat, not plan.',
  'pricing.resolve_lines': 'Research prices for materials/items. USE THIS when budget lines need verified pricing.',
  'procurement.shopping_plan': 'Plan procurement/shopping list. USE THIS for purchasing planning after budget exists.',
  'finance.ingest_receipt': 'Process and ingest a receipt. USE THIS when user provides receipt for expense tracking.',
  'audit.project': 'Audit plan for completeness and issues. USE THIS before finalizing quote or when user asks to review.',
  'qa.print_files': 'QA check for print files. USE THIS when reviewing graphics/print deliverables.',
  'maint.sync_and_repair': 'Fix data integrity issues. USE THIS when audit finds problems to fix.',
  'intake.parse_brief': 'Parse initial project brief into structured format. USE THIS at very start with raw user input.',
  'plan.elements': 'Generate elements (deliverables) for the project. USE THIS when user asks to plan a project and you have basic info. Returns element intents.',
  'plan.tasks': 'Generate tasks linked to elements. USE THIS after elements exist or together with plan.elements. Returns task intents.',
  'plan.execution_phases': 'Define execution phases with milestones. USE THIS after tasks are planned to organize timeline.',
  'cost.build_budget': 'Generate material and labor cost lines. USE THIS after tasks exist to build budget. Returns accounting intents.',
  'quote.generate': 'Generate client-facing quote from accounting data. USE THIS after budget is built.',
  'runbook.installation': 'Generate install-day runbook. USE THIS when planning installation day operations.',
  'ops.daily_plan': 'Generate daily execution plan. USE THIS for day-to-day work scheduling.',
  'finalize.build_structured_package': 'Build final structured package from current project context and QA assumptions.',
  'admin.set_labor_rates': 'Set labor rates for work types. USE THIS when updating pricing configuration.',
  'admin.confirm_measurements': 'Confirm/update element measurements. USE THIS when measurements are verified.',
};

function buildToolDefinitions(allowedTools: string[], nameMap: Map<string, string>) {
  const usedNames = new Set<string>();
  const makeUniqueName = (base: string) => {
    let candidate = base || 'tool';
    let counter = 1;
    while (usedNames.has(candidate)) {
      candidate = `${base || 'tool'}_${counter}`;
      counter += 1;
    }
    usedNames.add(candidate);
    return candidate;
  };

  return allowedTools.map((name, index) => {
    const baseName = toOpenAIToolName(name);
    const safeBase = /^[a-zA-Z0-9_-]+$/.test(baseName) ? baseName : `tool_${index}`;
    const openAiName = makeUniqueName(safeBase);
    nameMap.set(openAiName, name);
    if (name === 'context.get') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Fetch minimal project context by packs.',
          parameters: {
            type: 'object',
            properties: {
              packs: { type: 'array', items: { type: 'string' } },
              filters: { type: 'object' },
            },
            required: ['packs'],
          },
        },
      };
    }
    if (name === 'knowledge.summarize_or_update') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Update working knowledge doc with new facts.',
          parameters: {
            type: 'object',
            properties: {
              currentDoc: { type: 'object' },
              newFacts: { type: 'array', items: { type: 'string' } },
              userText: { type: 'string' },
            },
            required: ['newFacts'],
          },
        },
      };
    }
    if (name === 'changeset.compile') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Compile intents into a ChangeSet draft.',
          parameters: {
            type: 'object',
            properties: {
              intents: { type: 'array', items: { type: 'object' } },
              context: { type: 'object' },
            },
            required: ['intents'],
          },
        },
      };
    }
    if (name === 'changeset.review') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Review a ChangeSet draft.',
          parameters: {
            type: 'object',
            properties: {
              changeSetId: { type: 'string' },
              changeSet: { type: 'object' },
            },
          },
        },
      };
    }
    if (name === 'changeset.apply') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Apply ChangeSet after approval.',
          parameters: {
            type: 'object',
            properties: {
              approvalToken: { type: 'string' },
            },
            required: ['approvalToken'],
          },
        },
      };
    }
    if (name === 'web_search') {
      return {
        type: 'function',
        function: {
          name: openAiName,
          description: 'Search the web for real-time information.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              templateId: { type: 'string', description: 'materialTemplates id for logging' },
              variantId: { type: 'string', description: 'materialVariants id for logging' },
              uomCode: { type: 'string', description: 'UOM code for pricing context' },
            },
            required: ['query'],
          },
        },
      };
    }
    return {
      type: 'function',
      function: {
        name: openAiName,
        description: TOOL_DESCRIPTIONS[name] ?? `Run tool ${name}`,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'object' },
          },
        },
      },
    };
  });
}

export const runNext = action({
  args: {
    projectId: v.id('projects'),
    conversationId: v.id('agentConversations'),
    runId: v.id('sdkRuns'),
    userMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cycleStartedAt = Date.now();
    const cycleBudgetMs = Number(process.env.SDK_DISPATCH_CYCLE_BUDGET_MS ?? 120000);
    const flags = await ctx.runQuery(api.featureFlags.getAll, {});
    const useVNextPipeline = Boolean(flags?.ff_sdk_vnext_pipeline);
    const explicitChangeSetOnly = Boolean(flags?.ff_sdk_chat_explicit_changeset_only);

    const sdkApi = (api as any)['sdk/api'] ?? (api as any).sdk?.api;
    const sdkKnowledge = (api as any)['sdk/knowledge'] ?? (api as any).sdk?.knowledge;
    const sdkChangeset = (api as any)['sdk/changeset'] ?? (api as any).sdk?.changeset;
    const sdkFinalize = (api as any)['sdk/finalize'] ?? (api as any).sdk?.finalize;
    if (!sdkApi || !sdkKnowledge || !sdkChangeset || !sdkFinalize) {
      throw new Error('SDK API modules not available. Run Convex codegen and restart the server.');
    }

    const run = await ctx.runQuery(internal.sdk.queries.getRun, {
      runId: args.runId,
    });
    if (!run) throw new Error('Run not found');
    const runMode = run.runMode ?? 'PLANNING_FLOW';
    const isPlanningRun = runMode === 'PLANNING_FLOW';
    const shouldUseVNextPipeline = useVNextPipeline && isPlanningRun;

    const parsedInput = parseQueuedInputEnvelope(args.userMessage);
    const userMessage = args.userMessage === '__continue__' ? '__continue__' : parsedInput.text;
    const queuedInputPrompt = buildQueuedInputPrompt(parsedInput.queuedInput);
    const explicitQueuedAction = parsedInput.explicitAction;
    const compileConfirmedByText =
      explicitQueuedAction === 'create_changeset' ||
      (explicitQueuedAction === null && isLikelyCompileConfirmation(userMessage));
    if (parsedInput.queuedInput) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_queued_input_received',
        payload: {
          ...parsedInput.queuedInput,
          explicitAction: explicitQueuedAction,
        },
      });
    }

    if (
      run.status === 'paused' ||
      run.status === 'cancelled' ||
      run.status === 'completed' ||
      run.status === 'failed'
    ) {
      return { status: run.status };
    }

    // Waiting states are hard-blocking only for planning flow.
    if (run.status === 'blocked' || run.status === 'needs_input') {
      if (!isPlanningRun && userMessage && userMessage !== '__continue__') {
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
          runId: args.runId,
          status: 'running',
          lastError: undefined,
        });
      } else {
      return {
        status: run.status,
        lastError: run.lastError,
        pendingChangeSetId: run.pendingChangeSetId,
      };
      }
    }

    if (userMessage && userMessage !== '__continue__') {
      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'user',
        text: userMessage,
        runId: args.runId,
      });
    }

    if (run.status === 'awaiting_approval') {
      if (!userMessage || userMessage === '__continue__') {
        return { status: 'awaiting_approval', pendingChangeSetId: run.pendingChangeSetId };
      }

      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'sdk_pending_action_detected',
        payload: {
          pendingChangeSetId: run.pendingChangeSetId ?? null,
          userMessage: userMessage.slice(0, 120),
        },
      });

      const decision = parseApprovalDecision(userMessage);
      if (decision === 'approve') {
        if (!run.pendingChangeSetId || !run.approvalToken) {
          await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
            conversationId: args.conversationId,
            role: 'assistant',
            text: 'אין ChangeSet ממתין לאישור.',
            blocks: [{ type: 'ChatBlock', markdownHe: 'אין ChangeSet ממתין לאישור.' }],
            runId: args.runId,
          });
          return { status: 'success', output: { ok: false, reason: 'missing_pending_changeset' } };
        }

        const result = await ctx.runAction(sdkApi.approveChangeSet, {
          runId: args.runId,
          approvalToken: run.approvalToken,
        });

        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'sdk_pending_action_resolved',
          payload: {
            action: 'approve',
            pendingChangeSetId: run.pendingChangeSetId,
          },
        });

        await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
          conversationId: args.conversationId,
          role: 'assistant',
          text: 'השינויים אושרו והוחלו.',
          blocks: [{ type: 'ChatBlock', markdownHe: 'אישרתי והחלתי את ה-ChangeSet.' }],
          runId: args.runId,
        });

        return { status: 'success', output: result };
      }

      if (decision === 'reject') {
        if (run.pendingChangeSetId) {
          await ctx.runMutation(api.changeSets.discardChangeSet, { changeSetId: run.pendingChangeSetId });
        }
        await ctx.runMutation(internal.sdk.telemetry.clearPendingChangeSet, { runId: args.runId });
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
          runId: args.runId,
          status: 'running',
          currentAgentName: run.currentAgentName ?? 'orchestrator',
          lastError: undefined,
        });
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'sdk_pending_action_resolved',
          payload: {
            action: 'reject',
            pendingChangeSetId: run.pendingChangeSetId ?? null,
          },
        });
        await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
          conversationId: args.conversationId,
          role: 'assistant',
          text: 'ביטלתי את השינויים המוצעים.',
          blocks: [{ type: 'ChatBlock', markdownHe: 'בוטל. לא הוחלו שינויים.' }],
          runId: args.runId,
        });
        return {
          status: 'success',
          output: { ok: true, discarded: run.pendingChangeSetId ?? null },
        };
      }

      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'assistant',
        text: 'כדי להמשיך כתוב "כן" לאישור או "לא" לביטול.',
        blocks: [
          {
            type: 'SuggestionBlock',
            titleHe: 'נדרש אישור',
            suggestions: [
              { id: 'approve_changeset', labelHe: 'כן, אשר והחל' },
              { id: 'reject_changeset', labelHe: 'לא, בטל' },
            ],
          },
        ],
        runId: args.runId,
      });

      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'approval_loop_detected',
        payload: {
          pendingChangeSetId: run.pendingChangeSetId ?? null,
          userMessage: userMessage.slice(0, 120),
        },
      });

      return { status: 'awaiting_approval', pendingChangeSetId: run.pendingChangeSetId };
    }

    if (shouldUseVNextPipeline) {
      let effectiveRun = run;
      if (userMessage === '__continue__') {
        const currentStage = normalizeVNextStage(run.stageKey);
        const stageArtifact = await ctx.runQuery(
          internal['sdk/vnext/artifacts'].getStageArtifactByRunStage,
          {
            runId: args.runId,
            stageKey: currentStage,
          }
        );
        const canAdvance = stageArtifact?.status === 'ready_for_checkpoint';
        const nextStage = canAdvance ? getNextVNextStage(currentStage) : null;
        if (nextStage) {
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            stageKey: nextStage,
            status: 'running',
            currentAgentName: 'vnext_pipeline',
            progressKey: `${nextStage}:init`,
            progressCount: 0,
            noProgressCount: 0,
          });
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'vnext_stage_transition',
            payload: {
              fromStage: currentStage,
              toStage: nextStage,
            },
          });
          effectiveRun = { ...run, stageKey: nextStage, status: 'running' };
        } else {
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            status: 'running',
            currentAgentName: 'vnext_pipeline',
          });
        }
      }

      const result = await runVNextStage({
        ctx,
        projectId: args.projectId,
        conversationId: args.conversationId,
        run: effectiveRun,
        runId: args.runId,
        userMessage,
        options: {
          softGates: Boolean(flags?.ff_sdk_vnext_soft_gates ?? true),
          pricingQueue: Boolean(flags?.ff_sdk_vnext_pricing_queue ?? true),
          stageBudgets: Boolean(flags?.ff_sdk_vnext_stage_budgets ?? true),
        },
      });
      const cycleElapsedMs = Date.now() - cycleStartedAt;
      if (cycleElapsedMs > cycleBudgetMs) {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'dispatch_cycle_budget_warn',
          payload: {
            cycleElapsedMs,
            cycleBudgetMs,
            stageKey: result.stageKey,
          },
        });
      }

      const vnextQuestions = extractVNextQuestionsFromBlocks(result.blocks);
      let qaBridge: { created: number; updated: number; reusedResolved: number; total: number } | null = null;
      if (vnextQuestions.length > 0) {
        qaBridge = await ctx.runMutation(internal['sdk/questions'].upsertVNextQuestionsBridge, {
          projectId: args.projectId,
          stageKey: String(result.stageKey ?? 'brief'),
          questions: vnextQuestions,
        });
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'vnext_questions_seeded_qapairs',
          payload: qaBridge,
        });
      }

      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'assistant',
        text: `vNext stage ${result.stageKey}: ${result.status}`,
        blocks: result.blocks,
        runId: args.runId,
      });
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'vnext_stage_result',
        payload: { ...result, qaBridge },
      });
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'vnext_stage_exit',
        payload: {
          stageKey: result.stageKey,
          status: result.status,
          nextStageKey: result.nextStageKey ?? null,
        },
      });

      return {
        status: 'success',
        output: result,
      };
    }

    const pendingIntents: any[] = [];
    let autoCompiled = false;
    let taskIntentBackfillAttempted = false;

    const orchestrator = REGISTRY.orchestrator;
    if (!orchestrator) throw new Error('Agent orchestrator not found in registry');

    await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
      runId: args.runId,
      status: 'running',
      currentAgentName: 'orchestrator',
    });

    const historyLimit = 50;
    const history = await ctx.runQuery(sdkApi.listMessages, {
      conversationId: args.conversationId,
      limit: historyLimit,
    });

    const isPlanningRequest = (text: string): boolean => {
      const patterns = [
        'plan',
        'planning',
        'start plan',
        'create plan',
        'build budget',
        'budget',
        'quote',
        'elements',
        'tasks',
        'תכנון',
        'תכנן',
        'תקציב',
      ];
      const lower = (text || '').toLowerCase();
      return patterns.some((p) => lower.includes(p.toLowerCase()));
    };

    const lastUserMsg = userMessage ||
      history.filter((m: any) => m.role === 'user').slice(-1)[0]?.text || '';
    const isChatEditRun = runMode === 'CHAT_EDIT';
    const chatIntent = isChatEditRun
      ? detectChatIntent(lastUserMsg, {
        hasPendingAction:
          run.status === 'awaiting_approval' ||
          run.status === 'needs_input' ||
          run.status === 'blocked' ||
          Boolean(run.pendingChangeSetId),
      })
      : null;
    const shouldForceTools = !isChatEditRun && isPlanningRequest(lastUserMsg);
    const requiresTasksIntent = isChatEditRun && isTaskGenerationRequest(lastUserMsg);
    const strictFullPlanMode = !isChatEditRun && shouldForceTools;

    if (isChatEditRun) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'chat_intent_detected',
        payload: { intent: chatIntent, userMessage: lastUserMsg.slice(0, 250) },
      });
    }

    const bootstrapPacks = isChatEditRun
      ? packsForIntent(chatIntent ?? 'project_read_qna', lastUserMsg)
      : ['project', 'elements', 'tasks', 'accounting', 'quote', 'knowledge', 'qa'];
    const shouldBootstrapContext = bootstrapPacks.length > 0 && (!isChatEditRun || chatIntent !== 'chat_smalltalk');
    const bootstrapContext = shouldBootstrapContext
      ? await ctx.runQuery(sdkApi.contextGet, {
        projectId: args.projectId,
        packs: bootstrapPacks,
      })
      : null;

    if (isChatEditRun) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'chat_context_fetch',
        payload: {
          intent: chatIntent,
          packs: bootstrapPacks,
          fetched: Boolean(bootstrapContext),
        },
      });
    }

    const promptBootstrapContext = bootstrapContext;

    const messages: any[] = [
      { role: 'system', content: orchestrator.systemPrompt },
      {
        role: 'system',
        content: isChatEditRun
          ? 'Chat mode policy (internal instructions in English): discussion-first and clarification-first. User-facing content must stay Hebrew unless an English technical token is required. Always include a ChatBlock. Include QuestionsBlock only for truly blocking clarifications (do not repeat the same clarification after user answered). Include SuggestionsBlock only when actionable next steps exist. Suggestions for write/planning intents should include explicit create_changeset when relevant. Never create a ChangeSet unless explicit queued action resolves to create_changeset. Keep suggestions in timeline and avoid generic or repeated text.'
          : 'Planning mode policy: progress the planning pipeline with structured outputs.',
      },
      ...(promptBootstrapContext ? [{
        role: 'system',
        content: `PROJECT CONTEXT (bootstrap, may be partial):\n${JSON.stringify(promptBootstrapContext, null, 2)}`,
      }] : []),
      ...(queuedInputPrompt ? [{ role: 'system', content: queuedInputPrompt }] : []),
      ...history.map((m: any) => toPromptMessage(m, isChatEditRun)),
    ];

    const toolHandlers: Record<string, ToolHandler> = {
      'context.get': async (input: any) =>
        ctx.runQuery(sdkApi.contextGet, {
          projectId: args.projectId,
          packs: input?.packs ?? (
            isChatEditRun
              ? packsForIntent(chatIntent ?? 'project_read_qna', lastUserMsg)
              : ['project', 'knowledge']
          ),
          filters: input?.filters,
        }),
      'knowledge.summarize_or_update': async (input: any) =>
        ctx.runAction(sdkKnowledge.summarizeOrUpdate, {
          projectId: args.projectId,
          currentDoc: input?.currentDoc,
          newFacts: input?.newFacts ?? [],
          userText: input?.userText,
          runId: args.runId,
          conversationId: args.conversationId,
        }),
      'changeset.compile': async (input: any) => {
        if (isChatEditRun && explicitChangeSetOnly && !compileConfirmedByText) {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'chat_compile_skipped_no_explicit_action',
            payload: {
              explicitAction: explicitQueuedAction,
              compileConfirmedByText,
              hasQueuedInput: Boolean(parsedInput.queuedInput),
            },
          });
          return {
            skipped: true,
            code: 'EXPLICIT_ACTION_REQUIRED',
            reason: 'Compile in chat mode requires explicit create_changeset action.',
          };
        }

        let intents =
          Array.isArray(input?.intents) && input.intents.length > 0
            ? input.intents
            : pendingIntents;

        if (
          isChatEditRun &&
          requiresTasksIntent &&
          !hasTasksIntent(intents) &&
          !taskIntentBackfillAttempted &&
          allowedTools.includes('plan.tasks')
        ) {
          taskIntentBackfillAttempted = true;
          const latestElementsIntent = [...pendingIntents]
            .reverse()
            .find(
              (intent: any) =>
                String(intent?.type ?? '') === 'plan.elements_intent' &&
                Array.isArray(intent?.payload?.elements) &&
                intent.payload.elements.length > 0
            );
          const backfillContext =
            latestElementsIntent?.payload?.elements && latestElementsIntent.payload.elements.length > 0
              ? { ...(bootstrapContext ?? {}), elements: latestElementsIntent.payload.elements }
              : bootstrapContext;
          let taskBackfillResult: any;
          try {
            taskBackfillResult = await runToolInternal({
              ctx,
              projectId: args.projectId,
              toolId: 'plan.tasks',
              input: {
                userText: lastUserMsg,
                context: backfillContext,
              },
              runId: args.runId,
              conversationId: args.conversationId,
            });
          } catch (error: any) {
            taskBackfillResult = { error: error?.message ?? String(error) };
          }

          const backfillIntents = collectIntentsFromResult(taskBackfillResult, 'plan.tasks');
          if (backfillIntents.length > 0) {
            pendingIntents.push(...backfillIntents);
            if (Array.isArray(input?.intents) && input.intents.length > 0) {
              intents = [...input.intents, ...backfillIntents];
            } else {
              intents = pendingIntents;
            }
          }

          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'chat_tasks_intent_backfill',
            payload: {
              ok: !taskBackfillResult?.error,
              intentsAdded: backfillIntents.length,
              hasTasksIntent: hasTasksIntent(backfillIntents),
              tasksCount: Array.isArray(taskBackfillResult?.tasks) ? taskBackfillResult.tasks.length : 0,
              error: taskBackfillResult?.error ? String(taskBackfillResult.error) : null,
            },
          });
        }

        if (isChatEditRun && requiresTasksIntent && !hasTasksIntent(intents)) {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'chat_compile_blocked_missing_tasks_intent',
            payload: {
              intent: chatIntent,
              explicitAction: explicitQueuedAction,
              pendingIntents: pendingIntents.length,
              providedIntents: Array.isArray(input?.intents) ? input.intents.length : 0,
            },
          });
          return {
            skipped: true,
            code: 'TASK_INTENT_REQUIRED',
            reason: 'Task request requires a non-empty plan.tasks_intent before changeset.compile.',
          };
        }

        if (intents.length === 0) {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'changeset_compile_error',
            payload: { reason: 'empty_intents' },
          });
          return {
            error: 'changeset.compile דורש intents. קודם צריך לייצר intents דרך plan.elements / plan.tasks / cost.build_budget.',
            code: 'EMPTY_INTENTS',
          };
        }

        const result = await ctx.runAction(sdkChangeset.compile, {
          projectId: args.projectId,
          intents,
          context: input?.context,
          runId: args.runId,
          conversationId: args.conversationId,
        });

        if (result?.changeSetId && !run.shadowMode) {
          if (isChatEditRun && explicitChangeSetOnly) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'chat_compile_started_explicit_action',
              payload: {
                explicitAction: explicitQueuedAction,
                changeSetId: result.changeSetId,
              },
            });
          }

          const blocks: any[] = [];
          const coverage = summarizeChangeSetCoverage(result?.changeSet);
          const coverageIssues: string[] = [];
          if (strictFullPlanMode && !coverage.hasElements) {
            coverageIssues.push('חסרות פעולות אלמנטים ב-ChangeSet');
          }
          if (strictFullPlanMode && !coverage.hasTasks) {
            coverageIssues.push('חסרות פעולות משימות ב-ChangeSet');
          }
          if (strictFullPlanMode && !coverage.hasAccounting) {
            coverageIssues.push('חסרות פעולות חומר/עבודה (material/work lines) ב-ChangeSet');
          }
          if (coverageIssues.length > 0) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'changeset_coverage_failed',
              payload: {
                changeSetId: result.changeSetId,
                coverage,
                issues: coverageIssues,
              },
            });
            blocks.push(
              buildReviewBlock({
                titleHe: 'בדיקת שלמות ChangeSet',
                summaryHe: 'ה-ChangeSet לא מכסה את כל הרכיבים הנדרשים לבקשה.',
                risks: coverageIssues,
              })
            );
            await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
              runId: args.runId,
              status: 'blocked',
              pendingChangeSetId: result.changeSetId,
              approvalToken: undefined,
              lastError: 'CHANGESET_INCOMPLETE',
            });
            await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
              conversationId: args.conversationId,
              role: 'assistant',
              text: 'ה-ChangeSet לא שלם. נדרש תיקון לפני אישור.',
              blocks,
              runId: args.runId,
            });
            return {
              ...result,
              error: 'CHANGESET_INCOMPLETE',
              coverage,
            };
          }

          const approvalToken = randomUUID();
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            status: 'awaiting_approval',
            pendingChangeSetId: result.changeSetId,
            approvalToken,
          });

          blocks.push({
            type: 'ChangeSetBlock',
            titleHe: 'שינויים מוצעים',
            summaryHe: 'נדרש אישור לפני ביצוע.',
            changeSetId: result.changeSetId,
          });

          await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
            conversationId: args.conversationId,
            role: 'assistant',
            text: 'יש שינויים מוצעים לאישור.',
            blocks,
            runId: args.runId,
          });
        }

        return result;
      },
      'changeset.review': async (input: any) =>
        ctx.runAction(sdkChangeset.review, {
          projectId: args.projectId,
          changeSetId: input?.changeSetId,
          changeSet: input?.changeSet,
          runId: args.runId,
          conversationId: args.conversationId,
        }),
      'changeset.apply': async (input: any) =>
        ctx.runAction(sdkChangeset.apply, {
          runId: args.runId,
          approvalToken: input?.approvalToken ?? '',
        }),
      'finalize.build_structured_package': async (input: any) =>
        ctx.runAction(sdkFinalize.buildStructuredPackage, {
          projectId: args.projectId,
          runId: args.runId,
          includeAssumptions: input?.includeAssumptions,
        }),
      web_search: async (input: any) => {
        const q = String(input?.query ?? '');
        if (!q) {
          return { error: 'Missing query' };
        }
        const result = await searchWeb(q);
        return result;
      },
    };

    for (const toolId of Object.keys(REGISTRY)) {
      if (!toolHandlers[toolId]) {
        toolHandlers[toolId] = async (input: any) =>
          runToolInternal({
            ctx,
            projectId: args.projectId,
            toolId,
            input: input?.input ?? input ?? {},
            runId: args.runId,
            conversationId: args.conversationId,
          });
      }
    }

    const toolNameMap = new Map<string, string>();
    const allowedTools = isChatEditRun
      ? allowedToolsForChatIntent(chatIntent ?? 'project_read_qna')
      : (orchestrator.allowedTools ?? []);
    const tools = buildToolDefinitions(allowedTools, toolNameMap);

    if (isChatEditRun) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'chat_tool_policy',
        payload: {
          intent: chatIntent,
          allowedTools,
        },
      });
    }

    if (strictFullPlanMode) {
      const deterministicIntents: any[] = [];
      const planningPayload = {
        userText: lastUserMsg,
        context: bootstrapContext,
      };
      const deterministicTools = ['plan.elements', 'plan.tasks', 'cost.build_budget'];
      for (const toolId of deterministicTools) {
        let toolResult: any;
        try {
          toolResult = await runToolInternal({
            ctx,
            projectId: args.projectId,
            toolId,
            input: planningPayload,
            runId: args.runId,
            conversationId: args.conversationId,
          });
        } catch (error: any) {
          toolResult = { error: error?.message ?? String(error) };
        }

        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'deterministic_tool_result',
          payload: {
            toolId,
            ok: !toolResult?.error,
          },
        });

        if (toolResult?.error) {
          await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
            runId: args.runId,
            status: 'blocked',
            approvalToken: undefined,
            lastError: `DETERMINISTIC_TOOL_FAILED:${toolId}`,
          });
          const blocks = [
            buildReviewBlock({
              titleHe: 'כשלון בביצוע כלי דטרמיניסטי',
              summaryHe: `הכלי ${toolId} נכשל`,
              risks: [String(toolResult.error)],
            }),
          ];
          await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
            conversationId: args.conversationId,
            role: 'assistant',
            text: 'התהליך נעצר בגלל שגיאת כלי. נדרש תיקון.',
            blocks,
            runId: args.runId,
          });
          return {
            status: 'success',
            output: { summaryHe: 'Pipeline blocked', blocks },
          };
        }

        const intents = collectIntentsFromResult(toolResult, toolId);
        if (intents.length > 0) deterministicIntents.push(...intents);
      }

      if (deterministicIntents.length === 0) {
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
          runId: args.runId,
          status: 'blocked',
          approvalToken: undefined,
          lastError: 'NO_INTENTS_FROM_PIPELINE',
        });
        const blocks = [
          buildReviewBlock({
            titleHe: 'כשלון יצירת אינטנטים',
            summaryHe: 'לא נוצרו אינטנטים תקינים לתכנון',
            risks: ['NO_INTENTS_FROM_PIPELINE'],
          }),
        ];
        await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
          conversationId: args.conversationId,
          role: 'assistant',
          text: 'לא נוצרו אינטנטים. התהליך נעצר כדי למנוע פעולות מיותרות.',
          blocks,
          runId: args.runId,
        });
        return {
          status: 'success',
          output: { summaryHe: 'Pipeline blocked', blocks },
        };
      }

      const compileResult = await toolHandlers['changeset.compile']({
        intents: deterministicIntents,
        context: bootstrapContext,
      });

      if (compileResult?.error && !compileResult?.changeSetId) {
        await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
          runId: args.runId,
          status: 'blocked',
          approvalToken: undefined,
          lastError: 'CHANGESET_COMPILE_FAILED',
        });
        const blocks = [
          buildReviewBlock({
            titleHe: 'כשלון קומפילציית ChangeSet',
            summaryHe: 'לא ניתן להפיק ChangeSet תקין',
            risks: [String(compileResult.error)],
          }),
        ];
        await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
          conversationId: args.conversationId,
          role: 'assistant',
          text: 'לא ניתן להשלים שינויים מערכתיים. התהליך נעצר לתיקון.',
          blocks,
          runId: args.runId,
        });
      }

      return {
        status: 'success',
        output: compileResult,
      };
    }

    let finalContent: string | null = null;
    let lastToolSignature: string | null = null;
    let repeatedToolSignatureCount = 0;
    const maxToolLoops = isChatEditRun ? 2 : MAX_TOOL_LOOPS;
    const runtimeModel = isChatEditRun ? 'gpt-5-mini' : orchestrator.model;
    const runtimeReasoningEffort = isChatEditRun ? 'minimal' : orchestrator.reasoningEffort;
    const runtimeMaxCompletionTokens = isChatEditRun
      ? undefined
      : orchestrator.maxCompletionTokens;
    const runtimeMaxTokens = isChatEditRun
      ? undefined
      : orchestrator.maxTokens;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }
    for (let i = 0; i < maxToolLoops; i++) {
      const toolChoice = (i === 0 && shouldForceTools && tools.length > 0) ? 'required' : 'auto';

      const response = await completionWithTracing(
        ctx,
        {
          model: runtimeModel,
          reasoning_effort: runtimeReasoningEffort,
          temperature: orchestrator.temperature,
          ...(typeof runtimeMaxTokens === 'number' ? { max_tokens: runtimeMaxTokens } : {}),
          ...(typeof runtimeMaxCompletionTokens === 'number' ? { max_completion_tokens: runtimeMaxCompletionTokens } : {}),
          messages,
          tools,
          tool_choice: toolChoice,
          traceMeta: {
            source: 'sdk',
            runId: args.runId,
            forcedTools: toolChoice === 'required',
          },
        },
        {
          projectId: args.projectId,
          conversationId: args.conversationId,
          runId: args.runId,
        }
      ) as any;
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error('Empty LLM response');

      if (message.tool_calls && message.tool_calls.length > 0) {
        let toolCalledCompile = false;
        const currentToolSignature = message.tool_calls
          .map((call: any) => String(call?.function?.name ?? ''))
          .sort()
          .join('|');
        if (currentToolSignature && currentToolSignature === lastToolSignature) {
          repeatedToolSignatureCount += 1;
        } else {
          repeatedToolSignatureCount = 0;
          lastToolSignature = currentToolSignature;
        }
        if (repeatedToolSignatureCount >= 2) {
          finalContent = JSON.stringify({
            summaryHe: 'Run stopped because the same tool sequence repeated without progress.',
            blocks: [
              buildReviewBlock({
                titleHe: 'Detected repeated tool loop',
                summaryHe: 'The orchestrator repeated the same tool calls multiple times without advancing state.',
                risks: ['REPEATED_TOOL_SEQUENCE'],
              }),
              buildFallbackSuggestionBlock(false),
            ],
          });
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'loop_guard_triggered',
            payload: {
              signature: currentToolSignature,
              repeatCount: repeatedToolSignatureCount,
            },
          });
          break;
        }
        messages.push({
          role: 'assistant',
          content: message.content ?? '',
          tool_calls: message.tool_calls,
        });

        for (const call of message.tool_calls) {
          const openAiToolName = call.function.name;
          const toolName = toolNameMap.get(openAiToolName) ?? openAiToolName;
          if (toolName === 'changeset.compile') toolCalledCompile = true;
          let toolArgs: any = {};
          try {
            toolArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch (err) {
            toolArgs = {};
          }

          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'tool_call',
            payload: { toolName, toolArgs },
          });

          if (isChatEditRun && !allowedTools.includes(toolName)) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'chat_heavy_tool_blocked',
              payload: { toolName, reason: 'not_allowed_for_intent', intent: chatIntent },
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: `Tool ${toolName} is not allowed for current intent` }),
            });
            continue;
          }

          let result: any;
          try {
            const handler = toolHandlers[toolName];
            if (!handler) throw new Error(`Tool ${toolName} not available`);
            result = await handler(toolArgs);
          } catch (error: any) {
            result = { error: error?.message ?? String(error) };
          }

          const intentsFromResult = collectIntentsFromResult(result, toolName);
          if (intentsFromResult.length > 0) {
            pendingIntents.push(...intentsFromResult);
          }

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        if (
          isChatEditRun &&
          explicitChangeSetOnly &&
          compileConfirmedByText &&
          requiresTasksIntent &&
          !hasTasksIntent(pendingIntents) &&
          !taskIntentBackfillAttempted &&
          allowedTools.includes('plan.tasks')
        ) {
          taskIntentBackfillAttempted = true;
          const latestElementsIntent = [...pendingIntents]
            .reverse()
            .find(
              (intent: any) =>
                String(intent?.type ?? '') === 'plan.elements_intent' &&
                Array.isArray(intent?.payload?.elements) &&
                intent.payload.elements.length > 0
            );
          const backfillContext =
            latestElementsIntent?.payload?.elements && latestElementsIntent.payload.elements.length > 0
              ? { ...(bootstrapContext ?? {}), elements: latestElementsIntent.payload.elements }
              : bootstrapContext;
          let taskBackfillResult: any;
          try {
            taskBackfillResult = await runToolInternal({
              ctx,
              projectId: args.projectId,
              toolId: 'plan.tasks',
              input: {
                userText: lastUserMsg,
                context: backfillContext,
              },
              runId: args.runId,
              conversationId: args.conversationId,
            });
          } catch (error: any) {
            taskBackfillResult = { error: error?.message ?? String(error) };
          }

          const backfillIntents = collectIntentsFromResult(taskBackfillResult, 'plan.tasks');
          if (backfillIntents.length > 0) {
            pendingIntents.push(...backfillIntents);
          }

          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'chat_tasks_intent_backfill',
            payload: {
              ok: !taskBackfillResult?.error,
              intentsAdded: backfillIntents.length,
              hasTasksIntent: hasTasksIntent(backfillIntents),
              tasksCount: Array.isArray(taskBackfillResult?.tasks) ? taskBackfillResult.tasks.length : 0,
              error: taskBackfillResult?.error ? String(taskBackfillResult.error) : null,
            },
          });

          messages.push({
            role: 'system',
            content: `AUTO TOOL RESULT (plan.tasks): ${JSON.stringify(taskBackfillResult)}`,
          });
        }

        const shouldCompileFromExplicitAction =
          isChatEditRun &&
          explicitChangeSetOnly &&
          (
          compileConfirmedByText
          ) &&
          !toolCalledCompile &&
          !autoCompiled &&
          (!requiresTasksIntent || hasTasksIntent(pendingIntents)) &&
          hasChangeProducingIntents(pendingIntents);

        const shouldLogSkippedCompile =
          isChatEditRun &&
          explicitChangeSetOnly &&
          !compileConfirmedByText &&
          !toolCalledCompile &&
          !autoCompiled &&
          hasChangeProducingIntents(pendingIntents);

        if (
          isChatEditRun &&
          explicitChangeSetOnly &&
          compileConfirmedByText &&
          !toolCalledCompile &&
          !autoCompiled &&
          requiresTasksIntent &&
          !hasTasksIntent(pendingIntents)
        ) {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'chat_compile_blocked_missing_tasks_intent',
            payload: {
              intent: chatIntent,
              explicitAction: explicitQueuedAction,
              pendingIntents: pendingIntents.length,
            },
          });
        }

        if ((!isChatEditRun || shouldCompileFromExplicitAction) && !toolCalledCompile && pendingIntents.length > 0 && !autoCompiled) {
          autoCompiled = true;
          let compileResult: any;
          try {
            compileResult = await toolHandlers['changeset.compile']({
              intents: pendingIntents,
            });
          } catch (error: any) {
            compileResult = { error: error?.message ?? String(error) };
          }

          messages.push({
            role: 'system',
            content: `AUTO TOOL RESULT (changeset.compile): ${JSON.stringify(compileResult)}`,
          });

          if (shouldCompileFromExplicitAction) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'chat_compile_started_explicit_action',
              payload: {
                intent: chatIntent,
                explicitAction: explicitQueuedAction,
                pendingIntents: pendingIntents.length,
                hasError: Boolean(compileResult?.error),
                hasChangeSetId: Boolean(compileResult?.changeSetId),
              },
            });
            return {
              status: 'success',
              output: compileResult,
            };
          }
        }

        if (shouldLogSkippedCompile) {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'chat_compile_skipped_no_explicit_action',
            payload: {
              intent: chatIntent,
              explicitAction: explicitQueuedAction,
              pendingIntents: pendingIntents.length,
            },
          });
        }

        continue;
      }

      finalContent = message.content ?? '';
      break;
    }

    if (!finalContent && isChatEditRun) {
      const rescueResponse = await completionWithTracing(
        ctx,
        {
          model: runtimeModel,
          reasoning_effort: runtimeReasoningEffort,
          ...(typeof runtimeMaxTokens === 'number' ? { max_tokens: runtimeMaxTokens } : {}),
          messages: [
            ...messages,
            {
              role: 'system',
              content: 'Return a short direct Hebrew answer as plain text now. Do not call tools.',
            },
          ],
          traceMeta: {
            source: 'sdk',
            runId: args.runId,
            rescue: true,
          },
        },
        {
          projectId: args.projectId,
          conversationId: args.conversationId,
          runId: args.runId,
        }
      ) as any;

      const rescueMessage = rescueResponse?.choices?.[0]?.message;
      const rescueContent = String(rescueMessage?.content ?? '').trim();
      if (rescueContent) {
        finalContent = rescueContent;
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'chat_rescue_text_success',
          payload: {
            finishReason: rescueResponse?.choices?.[0]?.finish_reason ?? null,
          },
        });
      } else {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'chat_rescue_text_empty',
          payload: {
            finishReason: rescueResponse?.choices?.[0]?.finish_reason ?? null,
          },
        });
      }
    }

    if (!finalContent) {
      finalContent = 'לא התקבלה תשובה. נסה שוב.';
    }

    if (isChatEditRun) {
      let chatText = String(finalContent ?? '').trim()
      if (chatText.startsWith('{')) {
        try {
          const parsedJson = JSON.parse(chatText)
          const fromSummary = String(parsedJson?.summaryHe ?? parsedJson?.text ?? parsedJson?.contentHe ?? '').trim()
          const fromChatBlock = Array.isArray(parsedJson?.blocks)
            ? String(
              parsedJson.blocks.find((block: any) => block?.type === 'ChatBlock')?.contentHe ??
              parsedJson.blocks.find((block: any) => block?.type === 'ChatBlock')?.markdownHe ??
              ''
            ).trim()
            : ''
          chatText = fromSummary || fromChatBlock || chatText
        } catch {
          // keep raw assistant text
        }
      }

      const textWithFooter = ensureSuggestionFooter(chatText)
      const parsed = {
        summaryHe: textWithFooter,
        text: textWithFooter,
        blocks: [],
      }

      await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
        conversationId: args.conversationId,
        role: 'assistant',
        text: textWithFooter,
        blocks: [],
        runId: args.runId,
      })

      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'chat_plain_text_emit',
        payload: {
          length: textWithFooter.length,
          hadJsonEnvelope: String(finalContent ?? '').trim().startsWith('{'),
        },
      })

      return {
        status: 'success',
        output: parsed,
      }
    }

    let parsed: any;
    let parseFailed = false;
    try {
      parsed = JSON.parse(finalContent);
      assertAsciiKeys(parsed);
    } catch (error) {
      parseFailed = true;
      parsed = { blocks: [{ type: 'ChatBlock', contentHe: finalContent }] };
    }

    if (parseFailed) {
      const repairModel = String(process.env.SDK_CHAT_FORMAT_REPAIR_MODEL ?? runtimeModel);
      try {
        const repairResponse = await completionWithTracing(
          ctx,
          {
            model: repairModel,
            reasoning_effort: 'minimal',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: 'Convert assistant output into strict JSON. Output one JSON object with ASCII keys only. Allowed block types: ChatBlock, QuestionsBlock, SuggestionBlock, SuggestionsBlock, ChangeSetBlock, ReviewBlock. Preserve meaning from input. If unsure, keep only ChatBlock text. Never invent actions, questions, or suggestions.',
              },
              {
                role: 'user',
                content: finalContent,
              },
            ],
            traceMeta: {
              source: 'sdk',
              runId: args.runId,
              formatRepair: true,
            },
          },
          {
            projectId: args.projectId,
            conversationId: args.conversationId,
            runId: args.runId,
          }
        ) as any;

        const repairContent = String(repairResponse?.choices?.[0]?.message?.content ?? '').trim();
        if (repairContent) {
          const repaired = JSON.parse(repairContent);
          assertAsciiKeys(repaired);
          parsed = repaired;
          parseFailed = false;
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'format_repair_success',
            payload: { repairModel },
          });
        } else {
          await ctx.runMutation(internal.sdk.telemetry.logEvent, {
            runId: args.runId,
            type: 'format_repair_empty',
            payload: { repairModel },
          });
        }
      } catch (repairError: any) {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'format_repair_failed',
          payload: {
            repairModel,
            message: String(repairError?.message ?? repairError ?? 'unknown'),
          },
        });
      }
    }
    parsed = {
      ...parsed,
      blocks: normalizeAssistantResponse(parsed, finalContent),
    };

    // Helper: Check if response has actionable structured content
    const hasActionableContent = (p: any): boolean => {
      const blocks = p?.blocks ?? [];
      const hasBlocks = blocks.some((b: any) =>
        b?.type === 'ChatBlock' ||
        b?.type === 'QuestionsBlock' ||
        b?.type === 'SuggestionBlock' ||
        b?.type === 'SuggestionsBlock' ||
        b?.type === 'ChangeSetBlock' ||
        b?.type === 'ReviewBlock'
      );
      const hasIntent = p?.intent != null;
      return hasBlocks || hasIntent;
    };

    // Helper: Check if text contains refusal phrases
    const isRefusal = (text: string): boolean => {
      const refusalPhrases = [
        'אני לא יכול',
        'לא יכול',
        'אין לי מספיק',
        'צריך יותר מידע',
        'cannot create',
        'cannot generate',
        'I need more information',
        'I can\'t',
      ];
      const lower = (text || '').toLowerCase();
      return refusalPhrases.some(p => lower.includes(p.toLowerCase()));
    };

    // Helper: Check if agent is talking ABOUT doing instead of DOING
    const isTalkingAboutDoing = (text: string): boolean => {
      const patterns = [
        'נצטרך לפרט',
        'בשלב הבא',
        'אני אתחיל',
        'אני אעבור',
        'אני אמשיך',
        'נתחיל ב',
        'אני מתכנן',
        'התכנון יכלול',
        'אני אעשה',
        'הנה מה שאני מתכנן',
        'כרגע אני מתקדם',
        'הנחות עבודה',
        'שאלות כדי לנעול',
        'כדי להתקדם',
        'אעדכן את',
        'I will create',
        'I will generate',
        'Let me start by',
        'I\'ll proceed',
        'I am going to',
      ];
      const lower = (text || '').toLowerCase();
      return patterns.some(p => lower.includes(p.toLowerCase()));
    };

    let summaryHe = parsed.summaryHe ?? parsed.contentHe ?? 'תשובה מסוכמת';
    const looksLikeRawChangeSetDump = (text: string): boolean => {
      const value = String(text ?? '').toLowerCase();
      if (!value) return false;
      const hasOpsJson = value.includes('"ops"') || value.includes('{ "ops"') || value.includes('"op"');
      const hasChangeSetTerms =
        value.includes('changeset') ||
        value.includes('change set') ||
        value.includes('changeset.apply') ||
        value.includes('אשר והחל') ||
        value.includes('להלן changeset');
      const hasApplyLanguage =
        value.includes('apply') ||
        value.includes('נא אשר') ||
        value.includes('אישור נדרש');
      return (hasOpsJson && hasChangeSetTerms) || (hasChangeSetTerms && hasApplyLanguage);
    };

    let blocks = normalizeAssistantResponse(parsed, finalContent);

    // Check if agent needs recovery - use finalContent for pattern matching, not summaryHe
    // This is critical because when plain text is wrapped in ChatBlock, summaryHe becomes fallback
    const needsRecovery =
      !isChatEditRun && (
        !hasActionableContent(parsed) ||
        isRefusal(finalContent) ||
        isTalkingAboutDoing(finalContent)
      );

    // DYNAMIC RECOVERY: If agent gave refusal, lacks actionable content, or is just talking about doing
    if (needsRecovery) {
      const reason = isRefusal(finalContent) ? 'refusal_detected' :
        looksLikeRawChangeSetDump(finalContent) ? 'raw_changeset_dump' :
        isTalkingAboutDoing(finalContent) ? 'talking_not_doing' :
          'no_actionable_blocks';
      console.warn(`[SDK] Agent response needs recovery: ${reason}, re-prompting...`);

      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'recovery_triggered',
        payload: {
          reason,
          originalSummary: summaryHe
        },
      });

      // Add recovery system message with explicit tool hints
      messages.push({
        role: 'assistant',
        content: finalContent,
      });
      messages.push({
        role: 'system',
        content: `RECOVERY REQUIRED: You described what you will do but did not actually DO it.

Your response: "${summaryHe.slice(0, 150)}..."

This is NOT acceptable. You must CALL TOOLS, not describe calling them.

CALL ONE OF THESE TOOLS NOW:
- plan.elements - to generate elements for the project
- plan.tasks - to generate tasks
- cost.build_budget - to generate budget lines
- changeset.compile - to create a ChangeSet from intents
- clarify.next_questions - ONLY if you truly cannot proceed (use 80% rule first)

DO NOT respond with text describing what you will do.
DO NOT ask generic questions.
CALL A TOOL and produce real output.
DO NOT print raw "ops" JSON in chat.
If this is a write/planning request, produce a real ChangeSetBlock via changeset.compile.

The user asked to plan - so call plan.elements to generate elements NOW.
After elements, call plan.tasks to generate tasks.
Then call changeset.compile to create the ChangeSet.`
      });

      // Re-run LLM with tool_choice required to force tool usage
      const recoveryResponse = await completionWithTracing(
        ctx,
        {
          model: runtimeModel,
          reasoning_effort: runtimeReasoningEffort,
          temperature: orchestrator.temperature ? Math.min(orchestrator.temperature + 0.1, 0.5) : undefined,
          ...(typeof runtimeMaxTokens === 'number' ? { max_tokens: runtimeMaxTokens } : {}),
          ...(typeof runtimeMaxCompletionTokens === 'number' ? { max_completion_tokens: runtimeMaxCompletionTokens } : {}),
          messages,
          tools,
          tool_choice: 'required',
          traceMeta: { source: 'sdk', runId: args.runId, recovery: true },
        },
        { projectId: args.projectId, conversationId: args.conversationId, runId: args.runId }
      ) as any;

      const recoveryMessage = recoveryResponse.choices?.[0]?.message;

      // Handle tool calls from recovery
      if (recoveryMessage?.tool_calls?.length) {
        let recoveryCalledCompile = false;
        for (const toolCall of recoveryMessage.tool_calls) {
          const originalName = toolNameMap.get(toolCall.function.name) ?? toolCall.function.name;
          if (originalName === 'changeset.compile') recoveryCalledCompile = true;
          let toolArgs: any = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch { }

          if (isChatEditRun && !allowedTools.includes(originalName)) {
            await ctx.runMutation(internal.sdk.telemetry.logEvent, {
              runId: args.runId,
              type: 'chat_heavy_tool_blocked',
              payload: { toolName: originalName, reason: 'not_allowed_in_recovery', intent: chatIntent },
            });
            continue;
          }

          const handler = toolHandlers[originalName];
          if (handler) {
            const result = await handler(toolArgs.input ?? toolArgs);
            const intentsFromResult = collectIntentsFromResult(result, originalName);
            if (intentsFromResult.length > 0) {
              pendingIntents.push(...intentsFromResult);
            }
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });

            // If tool returned structured output, use it
            if (result?.blocks || result?.intent || result?.intents) {
              parsed = result;
              summaryHe = result.summaryHe ?? result.contentHe ?? 'תוצאה מסוכמת';
              blocks = normalizeAssistantResponse(result, finalContent ?? '');
            }
          }
        }
        if (!recoveryCalledCompile && pendingIntents.length > 0 && !autoCompiled) {
          autoCompiled = true;
          let compileResult: any;
          try {
            compileResult = await toolHandlers['changeset.compile']({
              intents: pendingIntents,
            });
          } catch (error: any) {
            compileResult = { error: error?.message ?? String(error) };
          }

          if (compileResult?.blocks || compileResult?.intent || compileResult?.intents) {
            parsed = compileResult;
            summaryHe = compileResult.summaryHe ?? compileResult.contentHe ?? 'תוצאה מסוכמת';
            blocks = normalizeAssistantResponse(compileResult, finalContent ?? '');
          }
        }
      } else if (recoveryMessage?.content) {
        try {
          const recoveryParsed = JSON.parse(recoveryMessage.content);
          assertAsciiKeys(recoveryParsed);
          parsed = recoveryParsed;
          parseFailed = false;
          summaryHe = parsed.summaryHe ?? parsed.contentHe ?? 'תשובה מסוכמת';
          blocks = normalizeAssistantResponse(parsed, recoveryMessage.content ?? finalContent ?? '');
        } catch {
          // If recovery also fails to parse, keep original with ChatBlock wrapper
          blocks = normalizeAssistantResponse({ blocks: [{ type: 'ChatBlock', contentHe: recoveryMessage.content }] }, recoveryMessage.content ?? '');
          summaryHe = recoveryMessage.content.slice(0, 100);
        }
      }
    }

    if (isChatEditRun && typeof summaryHe === 'string' && summaryHe.length > 360) {
      summaryHe = `${summaryHe.slice(0, 357)}...`;
    }

    const includeSuggestions = shouldAttachSuggestions({
      intent: isChatEditRun ? (chatIntent ?? 'project_read_qna') : 'planning_flow',
      userText: lastUserMsg,
      summaryHe,
    });

    const hadShapeCoercion = hasWrapperShapeCoercion(parsed);
    const hadParsedBlocksBeforeEnsure = Array.isArray(blocks) && blocks.length > 0;

    blocks = ensureMinimumBlocks({
      blocks,
      summaryHe,
      rawText: finalContent ?? summaryHe,
      isPlanningRequest: shouldForceTools,
      includeSuggestions,
      alwaysIncludeNextSet: isChatEditRun,
      skipSyntheticNextSet: parseFailed,
      intent: isChatEditRun ? chatIntent : null,
      userText: lastUserMsg,
      context: promptBootstrapContext,
      history,
    });

    if (hadShapeCoercion) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'shape_coercion_applied',
        payload: {
          parseFailed,
        },
      });
    }

    if (isChatEditRun && !parseFailed && hadParsedBlocksBeforeEnsure) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'synthetic_skipped_real_blocks',
        payload: {
          blockCount: blocks.length,
        },
      });
    }

    if (isChatEditRun && !parseFailed && !hadParsedBlocksBeforeEnsure) {
      await ctx.runMutation(internal.sdk.telemetry.logEvent, {
        runId: args.runId,
        type: 'synthetic_used_empty_blocks',
        payload: {
          blockCount: blocks.length,
        },
      });
    }

    await ctx.runMutation(internal.sdk.telemetry.appendMessage, {
      conversationId: args.conversationId,
      role: 'assistant',
      text: summaryHe,
      blocks,
      runId: args.runId,
    });

    await ctx.runMutation(internal.sdk.telemetry.logEvent, {
      runId: args.runId,
      type: 'block_emit',
      payload: { blocks },
    });

    const rawStage = parsed?.meta?.nextStageKey ?? parsed?.meta?.stageKey ?? parsed?.meta?.stageKeyHint;
    const requestedStage = normalizeStageKey(rawStage);
    if (requestedStage) {
      const currentStage = normalizeStageKey(run.stageKey) ?? 'intake';
      const { next, reason } = enforceStageTransition(currentStage, requestedStage);
      if (reason === 'skip') {
        await ctx.runMutation(internal.sdk.telemetry.logEvent, {
          runId: args.runId,
          type: 'stage_guard',
          payload: {
            currentStage,
            requestedStage,
            appliedStage: next,
            reason,
          },
        });
      }
      await ctx.runMutation(internal.sdk.telemetry.updateRunState, {
        runId: args.runId,
        stageKey: next,
      });
    }

    return {
      status: 'success',
      output: parsed,
    };
  },
});







