'use client';

import { useAction, useMutation, useQuery } from 'convex/react';
import { useState, useEffect } from 'react';
import { api, internal } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { CheckCircle, Loader2, Play } from 'lucide-react';
import { QuestionsBlock } from '../../agent/_components/Blocks/QuestionsBlock';

type QuestionSet = {
  groupKey: string;
  groupLabelHe: string;
  questions: Array<{
    id: string;
    questionHe: string;
    type?: string;
    options?: Array<{ value: string; labelHe: string }>;
    suggestedAnswers?: Array<{ value: string; labelHe: string }>;
  }>;
};

export function ProjectPlanningTab({ projectId }: { projectId: Id<'projects'> }) {
  const [conversationId, setConversationId] = useState<Id<'agentConversations'> | null>(null);
  const [runId, setRunId] = useState<Id<'sdkRuns'> | null>(null);
  const [currentStep, setCurrentStep] = useState<'start' | 'braindump' | 'questions' | 'finalizing' | 'report'>('start');
  const [brainDumpText, setBrainDumpText] = useState('');
  const [currentQuestionSet, setCurrentQuestionSet] = useState<QuestionSet | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionSetIndex, setQuestionSetIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [finalReport, setFinalReport] = useState<any>(null);
  const [progress, setProgress] = useState({ stage: '', percent: 0 });
  const [sessionRestored, setSessionRestored] = useState(false);

  const existingSession = useQuery(api.sdk.projectPlanning.getPlanningSession, { projectId });
  const checkContextQuery = useQuery(api.sdk.api.contextGet, projectId ? { projectId, packs: ['project', 'elements', 'tasks'] } : 'skip');
  const submitBrainDump = useMutation(api.sdk.projectPlanning.submitBrainDump);
  const initiatePlanning = useAction(api.sdk.projectPlanning.initiatePlanning);
  const getQuestionSets = useQuery(
    api.sdk.projectPlanning.getQuestionSets,
    runId ? { runId, setIndex: questionSetIndex } : 'skip'
  );
  const submitAnswers = useMutation(api.sdk.projectPlanning.submitAnswers);
  const savePlanningState = useMutation(api.sdk.projectPlanning.savePlanningState);
  const regenerateQuestions = useAction(api.sdk.projectPlanning.regenerateQuestions);
  const finalizeProject = useAction(api.sdk.projectPlanning.finalizeProject);
  const finalizationProgress = useQuery(
    api.sdk.projectPlanning.getFinalizationProgress,
    runId ? { runId } : 'skip'
  );
  const phaseResults = useQuery(
    api.sdk.projectPlanning.getPhaseResults,
    runId ? { runId } : 'skip'
  );
  const rerunPhase = useAction(api.sdk.projectPlanning.rerunPhase);
  const restartPlanning = useAction(api.sdk.projectPlanning.restartPlanning);

  // Restore existing session on mount
  useEffect(() => {
    if (existingSession && !sessionRestored) {
      setConversationId(existingSession.conversationId);
      setRunId(existingSession.runId);
      setCurrentStep(existingSession.currentStep);
      setQuestionSetIndex(existingSession.questionSetIndex);
      setSessionRestored(true);
    }
  }, [existingSession, sessionRestored]);

  useEffect(() => {
    if (finalizationProgress) {
      setProgress(finalizationProgress);
      if (finalizationProgress.stage === 'completed') {
        setCurrentStep('report');
      }
    }
  }, [finalizationProgress]);

  const handleStart = async () => {
    setIsProcessing(true);
    try {
      // Check project context using query result
      const hasContext = 
        (checkContextQuery as any)?.elements?.length > 0 || 
        (checkContextQuery as any)?.tasks?.length > 0 ||
        (checkContextQuery as any)?.projectContext?.length > 0;

      if (!hasContext) {
        setCurrentStep('braindump');
      } else {
        // Start planning directly
        const result = await initiatePlanning({ projectId });
        setConversationId((result as any).conversationId);
        setRunId((result as any).runId);
        setCurrentStep('questions');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBrainDumpSubmit = async () => {
    if (!brainDumpText.trim()) return;
    setIsProcessing(true);
    try {
      const result = await submitBrainDump({
        projectId,
        brainDump: brainDumpText,
      });
      setConversationId((result as any).conversationId);
      setRunId((result as any).runId);
      setBrainDumpText('');
      
      // Now start planning
      const planResult = await initiatePlanning({ projectId, conversationId: (result as any).conversationId });
      
      // Save state
      await savePlanningState({
        runId: (result as any).runId,
        currentStep: 'questions',
        questionSetIndex: 0,
      });
      
      setCurrentStep('questions');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnswerSubmit = async () => {
    if (!runId) return;
    setIsProcessing(true);
    try {
      await submitAnswers({
        runId,
        answers: Object.entries(answers).map(([questionId, answer]) => ({
          questionId: questionId as Id<'qaPairs'>,
          answer,
        })),
      });
      
      setAnswers({});
      setQuestionSetIndex(prev => prev + 1);
      
      // Check if there are more question sets
      // If not, move to finalizing step automatically
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegenerateQuestions = async () => {
    if (!runId) return;
    setIsProcessing(true);
    try {
      await regenerateQuestions({ projectId, runId });
      setQuestionSetIndex(0); // Reset to first set
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinalizeNow = async () => {
    if (!runId) return;
    setIsProcessing(true);
    
    // Save state
    await savePlanningState({
      runId,
      currentStep: 'finalizing',
    });
    setCurrentStep('finalizing');
    
    try {
      const report = await finalizeProject({ projectId, runId, conversationId: conversationId! });
      setFinalReport(report);
      
      // Save completed state
      await savePlanningState({
        runId,
        currentStep: 'report',
      });
      setCurrentStep('report');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRerunPhase = async (phase: string) => {
    if (!runId || !conversationId) return;
    setIsProcessing(true);
    try {
      await rerunPhase({ projectId, runId, conversationId, phase });
      // Report will be updated via phase results query
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestartPlanning = async () => {
    if (!runId) return;
    setIsProcessing(true);
    try {
      await restartPlanning({ projectId, runId });
      setQuestionSetIndex(0);
      
      // Save state
      await savePlanningState({
        runId,
        currentStep: 'questions',
        questionSetIndex: 0,
      });
      setCurrentStep('questions');
    } finally {
      setIsProcessing(false);
    }
  };

  if (currentStep === 'start') {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="max-w-2xl p-8 bg-white rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Project Planning</h2>
          <p className="text-slate-600 mb-6">
            Welcome to the structured project planning flow. This will guide you through a complete
            planning process from context gathering to full project breakdown with pricing.
          </p>
          <button
            onClick={handleStart}
            disabled={isProcessing}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? (
              <><Loader2 className="animate-spin" size={20} /> Checking context...</>
            ) : (
              <><Play size={20} /> Start Planning</>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (currentStep === 'braindump') {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50 p-8">
        <div className="max-w-3xl w-full p-8 bg-white rounded-lg shadow-sm border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Tell Us About Your Project</h2>
          <p className="text-slate-600 mb-6">
            No project context found. Please share everything you know about the project:
            scope, requirements, constraints, goals, timeline, budget, etc.
          </p>
          <textarea
            className="w-full h-64 border border-slate-300 rounded-lg p-4 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none"
            placeholder="כתוב כאן את כל מה שאתה יודע על הפרויקט..."
            value={brainDumpText}
            onChange={(e) => setBrainDumpText(e.target.value)}
            disabled={isProcessing}
          />
          <button
            onClick={handleBrainDumpSubmit}
            disabled={!brainDumpText.trim() || isProcessing}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  if (currentStep === 'questions') {
    const questionSet = getQuestionSets?.currentSet;
    const hasMore = getQuestionSets?.hasMore ?? false;
    const totalSets = getQuestionSets?.totalSets ?? 0;

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Planning Questions</h2>
              <p className="text-xs text-slate-500">
                Set {questionSetIndex + 1} of {totalSets} • {questionSet?.groupLabelHe ?? 'Loading...'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerateQuestions}
                disabled={isProcessing}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Regenerate Questions
              </button>
              <button
                onClick={handleFinalizeNow}
                disabled={isProcessing}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                Finalize Now
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!questionSet ? (
            <div className="text-center text-slate-400 py-20">Loading questions...</div>
          ) : conversationId ? (
            <div className="max-w-3xl mx-auto">
              {/* Use existing QuestionsBlock component with proper format */}
              <QuestionsBlock
                block={{
                  type: 'QuestionsBlock',
                  titleHe: questionSet.groupLabelHe,
                  questions: questionSet.questions.map((q) => ({
                    id: q.id,
                    textHe: q.questionHe,
                    text_he: q.questionHe,
                    optionsHe: q.options?.map(o => o.labelHe),
                    options_he: q.options?.map(o => o.labelHe),
                    suggestedAnswers: q.suggestedAnswers,
                    type: q.type,
                  })),
                  submitLabelHe: hasMore ? 'Submit & Next Set' : 'Submit & Finalize',
                  submitLabel_he: hasMore ? 'Submit & Next Set' : 'Submit & Finalize',
                  showFreeText: true,
                  freeTextTitleHe: 'הערות נוספות',
                  freeTextPromptHe: 'כל דבר נוסף שתרצה להוסיף...',
                  autoRun: false,
                }}
                conversationId={conversationId}
                projectId={projectId}
                disabled={isProcessing}
              />
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleRegenerateQuestions}
                  disabled={isProcessing}
                  className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  Regenerate Questions
                </button>
                <button
                  onClick={handleFinalizeNow}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  Skip to Finalize
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (currentStep === 'finalizing' || currentStep === 'report') {
    const phases = phaseResults ?? [];
    const getPhaseStatus = (phaseName: string) => {
      const phase = phases.find(p => p.phase === phaseName);
      if (!phase) {
        // Check progress for running state
        if (progress.stage === phaseName) return 'running';
        // Check if earlier phases completed
        const phaseOrder = ['elements', 'tasks', 'budget', 'pricing', 'audit'];
        const currentIndex = phaseOrder.indexOf(progress.stage);
        const targetIndex = phaseOrder.indexOf(phaseName);
        if (currentIndex > targetIndex) return 'success';
        return 'pending';
      }
      return phase.status;
    };

    const allPhasesComplete = progress.stage === 'completed' || 
      phases.filter(p => p.status === 'success').length >= 5;

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {allPhasesComplete ? 'Project Plan Ready' : 'Finalizing Project Plan'}
              </h2>
              <p className="text-sm text-slate-500">
                {allPhasesComplete ? 'All phases completed successfully' : 'Running finalization stages'}
              </p>
            </div>
            {allPhasesComplete && (
              <button
                onClick={handleRestartPlanning}
                disabled={isProcessing}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                🔄 Restart Planning
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
              <h3 className="text-xl font-bold text-slate-800 mb-6">Finalization Phases</h3>
              
              <div className="space-y-4 mb-8">
                <FinalizePhaseRow
                  label="Planning Elements"
                  phase="elements"
                  status={getPhaseStatus('elements')}
                  onRerun={() => handleRerunPhase('elements')}
                  disabled={isProcessing}
                />
                <FinalizePhaseRow
                  label="Breaking Down Tasks"
                  phase="tasks"
                  status={getPhaseStatus('tasks')}
                  onRerun={() => handleRerunPhase('tasks')}
                  disabled={isProcessing}
                />
                <FinalizePhaseRow
                  label="Building Budget"
                  phase="budget"
                  status={getPhaseStatus('budget')}
                  onRerun={() => handleRerunPhase('budget')}
                  disabled={isProcessing}
                />
                <FinalizePhaseRow
                  label="Resolving Pricing"
                  phase="pricing"
                  status={getPhaseStatus('pricing')}
                  onRerun={() => handleRerunPhase('pricing')}
                  disabled={isProcessing}
                />
                <FinalizePhaseRow
                  label="Auditing & Validation"
                  phase="audit"
                  status={getPhaseStatus('audit')}
                  onRerun={() => handleRerunPhase('audit')}
                  disabled={isProcessing}
                />
              </div>

              {allPhasesComplete && finalReport && (
                <>
                  <div className="border-t border-slate-200 pt-8 mt-8">
                    <div className="flex items-center gap-3 mb-6">
                      <CheckCircle className="text-emerald-600" size={32} />
                      <h3 className="text-2xl font-bold text-slate-800">Planning Complete!</h3>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6 mb-8">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <div className="text-sm text-blue-600 font-medium mb-1">Elements</div>
                        <div className="text-3xl font-bold text-blue-900">{finalReport?.counts?.elements ?? 0}</div>
                      </div>
                      <div className="p-4 bg-emerald-50 rounded-lg">
                        <div className="text-sm text-emerald-600 font-medium mb-1">Tasks</div>
                        <div className="text-3xl font-bold text-emerald-900">{finalReport?.counts?.tasks ?? 0}</div>
                      </div>
                      <div className="p-4 bg-amber-50 rounded-lg">
                        <div className="text-sm text-amber-600 font-medium mb-1">Total Price</div>
                        <div className="text-3xl font-bold text-amber-900">
                          {formatCurrency(finalReport?.counts?.totalPrice ?? 0)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-slate-800">Summary</h4>
                      <p className="text-slate-600">{finalReport?.summary ?? 'Project plan has been generated successfully.'}</p>
                      
                      {finalReport?.elements && finalReport.elements.length > 0 && (
                        <>
                          <h4 className="text-lg font-semibold text-slate-800 pt-4">Elements Breakdown</h4>
                          <div className="space-y-3">
                            {finalReport.elements.map((el: any, idx: number) => (
                              <div key={idx} className="border border-slate-200 rounded-lg p-4">
                                <div className="font-medium text-slate-800 mb-2">{el.nameHe}</div>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <span className="text-slate-500">Tasks:</span>
                                    <span className="ml-2 font-semibold">{el.tasksCount ?? 0}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Materials:</span>
                                    <span className="ml-2 font-semibold">{formatCurrency(el.materialCost ?? 0)}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Labor:</span>
                                    <span className="ml-2 font-semibold">{formatCurrency(el.laborCost ?? 0)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!allPhasesComplete && (
                <div className="mt-6 bg-slate-100 rounded-lg p-4">
                  <div className="flex justify-between text-sm text-slate-600 mb-2">
                    <span>Overall Progress</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-8 pt-6 border-t border-slate-200">
                <button
                  onClick={handleRestartPlanning}
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  🔄 Restart Planning (Keep Context)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function FinalizePhaseRow({ 
  label, 
  phase,
  status,
  onRerun,
  disabled 
}: { 
  label: string; 
  phase: string;
  status: 'pending' | 'running' | 'success' | 'failed'; 
  onRerun: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg">
      <div className="flex-shrink-0">
        {status === 'pending' && <div className="w-6 h-6 rounded-full border-2 border-slate-300" />}
        {status === 'running' && <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />}
        {status === 'success' && <CheckCircle className="w-6 h-6 text-emerald-600" />}
        {status === 'failed' && <span className="w-6 h-6 text-red-600 font-bold text-xl flex items-center justify-center">✗</span>}
      </div>
      <span className={`flex-1 text-sm font-medium ${
        status === 'success' ? 'text-slate-800' : 
        status === 'running' ? 'text-blue-600' : 
        status === 'failed' ? 'text-red-600' :
        'text-slate-400'
      }`}>
        {label}
      </span>
      {(status === 'success' || status === 'failed') && (
        <button
          onClick={onRerun}
          disabled={disabled}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🔄 Rerun
        </button>
      )}
    </div>
  );
}

function FinalizeStage({ label, status }: { label: string; status: 'pending' | 'running' | 'completed' }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-lg">
      <div className="flex-shrink-0">
        {status === 'pending' && <div className="w-6 h-6 rounded-full border-2 border-slate-300" />}
        {status === 'running' && <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />}
        {status === 'completed' && <CheckCircle className="w-6 h-6 text-emerald-600" />}
      </div>
      <span className={`text-sm font-medium ${status === 'completed' ? 'text-slate-800' : status === 'running' ? 'text-blue-600' : 'text-slate-400'}`}>
        {label}
      </span>
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(amount);
}
