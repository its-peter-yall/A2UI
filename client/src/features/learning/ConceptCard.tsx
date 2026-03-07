/**
 * ============================================================================
 * FILE: ConceptCard.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Visual card component that renders individual concept nodes in the learning path.
 * Displays different content and actions based on the node's current status
 * (LOCKED, VIEWING_EXPLANATION, IN_QUIZ, SHOWING_FEEDBACK, COMPLETED, ERROR).
 * Enforces the sequential learning flow by only showing status-appropriate content.
 * 
 * KEY COMPONENTS:
 * - ConceptCard: Main card wrapper with status-based styling and animations
 * - Status Styles: Visual differentiation for each node status (border colors, backgrounds)
 * - Quiz Interface: Radio button quiz with submit/retry functionality
 * - Review Mode: Expandable explanation in COMPLETED state
 * - Error Handling: Regenerate/skip options for ERROR state
 * 
 * DEPENDENCIES:
 * - react: useState, useEffect, useRef for local state management
 * - @tanstack/react-query: useQuizFeedback hook for feedback data
 * - lucide-react: ChevronLeft icon for navigation
 * - MarkdownRenderer: Renders node content as formatted markdown
 * - QuizFeedback: Shows quiz results with explanations
 * - CardTransitions: AnimatedCard, ContentTransition, UnlockPulse animations
 * 
 * USAGE PATTERN:
 * ```tsx
 * <ConceptCard
 *   node={conceptNode}
 *   isActive={currentSlideNode.id === activeNodeId}
 *   quizResult={quizResults[currentSlideNode.id]}
 *   onProceedToQuiz={(nodeId) => proceedToQuiz(nodeId)}
 *   onQuizSubmit={(nodeId, optionId) => submitAnswer(nodeId, optionId)}
 *   onRetryQuiz={(nodeId) => retry(nodeId)}
 *   onContinueToNext={(nodeId) => continueToNext(nodeId)}
 *   onRegenerate={(nodeId) => regenerate(nodeId)}
 *   isRegenerating={isRegenerating}
 *   isTransitioning={isTransitioning}
 *   canSkip={canGoNext}
 *   canPrevious={canGoPrev}
 * />
 * ```
 * 
 * ERROR HANDLING:
 * - Missing feedback result: Shows LoadingState or ErrorState
 * - Feedback load failure: Shows error message with retry option
 * - Generation error: Shows partial content if available with regenerate/skip options
 * 
 * PERFORMANCE NOTES:
 * - Previous status tracked via ref for animation transitions
 * - Content wrapped in ContentTransition for smooth status changes
 * - UnlockPulse animates when transitioning from LOCKED to VIEWING_EXPLANATION
 * 
 * RELATED FILES:
 * - LearningPathContainer.tsx: Parent container that renders this component
 * - MarkdownRenderer.tsx: Renders the explanation markdown content
 * - QuizFeedback.tsx: Displays quiz results with explanations
 * - useQuizFeedback.ts: Hook for fetching quiz feedback data
 * - useNodeState.ts: Status validation and transition logic
 * 
 * NOTES:
 * - Content visibility is server-authoritative; card respects node.status
 * - Sequential flow: User must progress through each status in order
 * - Status icons: 🔒 LOCKED, 📖 VIEWING_EXPLANATION, ❓ IN_QUIZ, 📊 SHOWING_FEEDBACK, ✅ COMPLETED, ! ERROR
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft } from 'lucide-react';
import type { ConceptNode, NodeStatus, QuizSubmitResponse, QuizCardHidden } from '@/types/learning';
import { getVisibleQuiz } from '@/types/learning';
import { MarkdownRenderer } from './MarkdownRenderer';
import { QuizFeedback } from './QuizFeedback';
import { useQuizFeedback } from './useQuizFeedback';
import { ErrorState, LoadingState } from './ErrorStates';
import {
  AnimatedCard,
  ContentTransition,
  UnlockPulse,
} from './animations/CardTransitions';

interface ConceptCardProps {
  node: ConceptNode;
  isActive?: boolean;
  quizResult?: QuizSubmitResponse;
  onProceedToQuiz?: (nodeId: string) => void;
  onQuizSubmit?: (nodeId: string, optionId: string, quizIndex: number) => void;
  onRetryQuiz?: (nodeId: string) => void;
  onContinueToNext?: (nodeId: string) => void;
  onNextQuiz?: () => void;
  onPreviousQuiz?: (nodeId: string) => void;
  onRegenerate?: (nodeId: string) => void;
  onSkipNode?: (nodeId: string) => void;
  onPrevious?: () => void;
  isRegenerating?: boolean;
  canSkip?: boolean;
  canPrevious?: boolean;
  isTransitioning?: boolean;
}

export function ConceptCard({
  node,
  isActive = false,
  onProceedToQuiz,
  onQuizSubmit,
  onRetryQuiz,
  onContinueToNext,
  onNextQuiz,
  onPreviousQuiz,
  onRegenerate,
  onSkipNode,
  onPrevious,
  isRegenerating = false,
  canSkip = false,
  canPrevious = false,
  isTransitioning = false,
  quizResult,
}: ConceptCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Track previous status for animations

  // Track previous status for animations
  const prevStatusRef = useRef<NodeStatus>(node.status);
  const [previousStatus, setPreviousStatus] = useState<NodeStatus | undefined>();

  useEffect(() => {
    if (prevStatusRef.current !== node.status) {
      setPreviousStatus(prevStatusRef.current);
      prevStatusRef.current = node.status;
    }
  }, [node.status]);

  const isUnlocking =
    previousStatus === 'LOCKED' && node.status === 'VIEWING_EXPLANATION';

  const {
    result: feedbackResult,
    attemptCount,
    isLoading: isFeedbackLoading,
    error: feedbackError,
  } = useQuizFeedback({
    nodeId: node.id,
    latestResult: quizResult,
    enabled: node.status === 'SHOWING_FEEDBACK',
    quiz: node.quiz,
    nodeStatus: node.status,
  });

  // Complexity badge styles
  const complexityStyles = {
    Basic: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    Intermediate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    Advanced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };

  // Difficulty label styles
  const difficultyStyles = {
    easy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };

  // Status-based styling
  const statusStyles: Record<NodeStatus, string> = {
    LOCKED: 'opacity-50 bg-muted cursor-not-allowed',
    VIEWING_EXPLANATION: 'border-primary bg-card',
    IN_QUIZ: 'border-primary bg-card',
    SHOWING_FEEDBACK: 'border-amber-500 bg-card',
    COMPLETED: 'border-green-500 bg-card',
    ERROR: 'border-destructive bg-destructive/10',
  };

  // Status icons
  const statusIcons: Record<NodeStatus, string> = {
    LOCKED: '🔒',
    VIEWING_EXPLANATION: '📖',
    IN_QUIZ: '❓',
    SHOWING_FEEDBACK: '📊',
    COMPLETED: '✅',
    ERROR: '!',
  };

  const handleProceedToQuiz = () => {
    // Prevent transition if not in VIEWING_EXPLANATION state
    if (node.status === 'VIEWING_EXPLANATION') {
      onProceedToQuiz?.(node.id);
    }
  };

  const handleSubmitQuiz = (quizIndex: number) => {
    if (selectedOption) {
      onQuizSubmit?.(node.id, selectedOption, quizIndex);
      setSelectedOption(null);
    }
  };

  const handleRetry = () => {
    setSelectedOption(null);
    onRetryQuiz?.(node.id);
  };

  const renderPreviousButton = () => (
    <button
      onClick={onPrevious}
      disabled={!canPrevious}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-md text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors text-sm font-medium",
        !canPrevious && "opacity-0 pointer-events-none"
      )}
    >
      <ChevronLeft className="w-4 h-4" />
      <span>Previous</span>
    </button>
  );

  return (
    <UnlockPulse isUnlocking={isUnlocking}>
      <AnimatedCard
        status={node.status}
        previousStatus={previousStatus}
        onAnimationComplete={() => setPreviousStatus(undefined)}
      >
        <article
          className={cn(
            'border rounded-lg overflow-hidden', // Removed transition-all duration-300
            statusStyles[node.status],
            isActive && 'ring-2 ring-primary ring-offset-2'
          )}
        >
          {/* Card Header */}
          <div className="flex items-center gap-3 p-4 border-b bg-card/50">
            <span className="text-xl">{statusIcons[node.status]}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{node.title}</h3>
                {node.complexity && (
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    complexityStyles[node.complexity]
                  )}>
                    {node.complexity}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {node.status.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              #{node.sequence_index + 1}
            </span>
          </div>

          {/* Card Body - State-based content */}
          <ContentTransition contentKey={`${node.id}-${node.status}`}>
            <div className="p-4">
              {/* LOCKED state */}
              {node.status === 'LOCKED' && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Complete the previous topic to unlock this one.</p>
                </div>
              )}

              {/* VIEWING_EXPLANATION state */}
              {node.status === 'VIEWING_EXPLANATION' && (
                <div className="space-y-4">
                  <MarkdownRenderer content={node.content_markdown} />
                  <div className="flex justify-between items-center pt-4 border-t">
                    {renderPreviousButton()}
                    <button
                      onClick={handleProceedToQuiz}
                      disabled={isTransitioning}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTransitioning ? 'Transitioning...' : 'I understand, proceed to quiz →'}
                    </button>
                  </div>
                </div>
              )}

              {/* IN_QUIZ state */}
              {node.status === 'IN_QUIZ' && (() => {
                const visibleQuiz = getVisibleQuiz(node);
                if (!visibleQuiz) return null;

                // Type guard for QuizSetHidden (has total_quizzes)
                const isQuizSetHidden = 'quizzes' in visibleQuiz && 'total_quizzes' in visibleQuiz;
                const currentQuizIndex = isQuizSetHidden
                  ? (visibleQuiz as { current_index: number }).current_index
                  : 0;
                const currentQuiz = 'quizzes' in visibleQuiz
                  ? visibleQuiz.quizzes[currentQuizIndex]
                  : visibleQuiz as QuizCardHidden;

                return (
                  <div className="space-y-4">
                    {isQuizSetHidden && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <span>Quiz {currentQuizIndex + 1} of {(visibleQuiz as { total_quizzes: number }).total_quizzes}</span>
                        {currentQuiz?.difficulty && (
                          <span className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            difficultyStyles[currentQuiz.difficulty]
                          )}>
                            {currentQuiz.difficulty.charAt(0).toUpperCase() + currentQuiz.difficulty.slice(1)}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="font-medium text-lg">{currentQuiz.question_text}</p>
                    <fieldset className="space-y-2" role="radiogroup">
                      <legend className="sr-only">Quiz options</legend>
                      {currentQuiz.options.map((option) => (
                        <label
                          key={option.option_id}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                            selectedOption === option.option_id
                              ? 'border-primary bg-primary/10'
                              : 'border-muted hover:border-primary/50'
                          )}
                        >
                          <input
                            type="radio"
                            name={`quiz-${node.id}`}
                            value={option.option_id}
                            checked={selectedOption === option.option_id}
                            onChange={() => setSelectedOption(option.option_id)}
                            className="w-4 h-4"
                          />
                          <span className="font-mono text-sm text-muted-foreground">
                            {option.display_label}.
                          </span>
                          <span>{option.text}</span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="flex justify-between items-center pt-4 border-t">
                      {isQuizSetHidden && currentQuizIndex > 0 ? (
                        <button
                          onClick={() => onPreviousQuiz?.(node.id)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors text-sm font-medium"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Previous</span>
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-muted-foreground/30 cursor-not-allowed transition-colors text-sm font-medium"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Previous</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleSubmitQuiz(currentQuizIndex)}
                        disabled={!selectedOption}
                        className={cn(
                          'px-4 py-2 rounded-md transition-colors',
                          selectedOption
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                        )}
                      >
                        Submit Answer
                      </button>
                    </div>
                  </div>
                );
              })()}

              {node.status === 'SHOWING_FEEDBACK' && (node.quiz || node.quiz_set) && (
                <>
                  {feedbackResult && (
                    <QuizFeedback
                      quiz={node.quiz_set || node.quiz!}
                      result={feedbackResult}
                      attemptCount={attemptCount}
                      currentQuizIndex={
                        feedbackResult.quiz_index ??
                        node.quiz_set_hidden?.current_index ??
                        0
                      }
                      onRetry={handleRetry}
                      onContinue={
                        feedbackResult.is_mastered
                          ? () => onContinueToNext?.(node.id)
                          : undefined
                      }
                      onNextQuiz={onNextQuiz}
                    />
                  )}
                  {!feedbackResult && isFeedbackLoading && (
                    <LoadingState message="Loading quiz feedback..." />
                  )}
                  {!feedbackResult && !isFeedbackLoading && feedbackError && (
                    <ErrorState
                      title="Unable to load feedback"
                      message="Please try again in a moment."
                      showHomeLink={false}
                    />
                  )}
                  {!feedbackResult && !isFeedbackLoading && !feedbackError && (
                    <ErrorState
                      title="Feedback unavailable"
                      message="We couldn't load the latest quiz result."
                      showHomeLink={false}
                    />
                  )}
                </>
              )}

              {/* COMPLETED state */}
              {node.status === 'COMPLETED' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <span className="text-xl">✓</span>
                    <span className="font-medium">Topic mastered!</span>
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      Review explanation
                    </summary>
                    <div className="mt-4 pt-4 border-t">
                      <MarkdownRenderer content={node.content_markdown} />
                    </div>
                  </details>
                  <div className="flex justify-between items-center pt-4 border-t">
                    {renderPreviousButton()}
                    {canSkip ? (
                      <button
                        onClick={() => onSkipNode?.(node.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-md text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors text-sm font-medium"
                      >
                        <span>Next</span>
                        <ChevronLeft className="w-4 h-4 rotate-180" />
                      </button>
                    ) : (
                      <div /> /* Spacer */
                    )}
                  </div>
                </div>
              )}

              {/* ERROR state */}
              {node.status === 'ERROR' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 text-destructive">
                    <span className="text-2xl">!</span>
                    <div>
                      <span className="font-medium">Content generation failed</span>
                      <p className="text-sm text-muted-foreground">
                        This topic couldn't be generated. You can retry or skip
                        to continue.
                      </p>
                    </div>
                  </div>
                  {node.error_message && (
                    <p className="text-xs text-muted-foreground">
                      {node.error_message}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => onRegenerate?.(node.id)}
                      disabled={isRegenerating}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isRegenerating ? 'Regenerating...' : 'Retry Generation'}
                    </button>
                    {canSkip && (
                      <button
                        onClick={() => onSkipNode?.(node.id)}
                        className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
                      >
                        Skip for Now
                      </button>
                    )}
                  </div>
                  {node.content_markdown && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        Show partial content (may be incomplete)
                      </summary>
                      <div className="mt-2 p-4 bg-muted/50 rounded border border-dashed">
                        <MarkdownRenderer content={node.content_markdown} />
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </ContentTransition>
        </article>
      </AnimatedCard>
    </UnlockPulse>
  );
}
