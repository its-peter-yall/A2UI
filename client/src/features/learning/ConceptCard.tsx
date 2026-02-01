// ConceptCard.tsx
// Visual card component for concept nodes in the learning path

// Longer description (2-4 lines):
// - Renders explanation, quiz, feedback, completed, and error states.
// - Enforces sequential flow by showing only status-appropriate content.
// - Delegates markdown and feedback rendering to subcomponents.

// @see: client/src/types/learning.ts - Node and status types
// @note: Content visibility is server-authoritative; card respects status

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { ConceptNode, NodeStatus, QuizSubmitResponse } from '@/types/learning';
import { MarkdownRenderer } from './MarkdownRenderer';
import { QuizFeedback } from './QuizFeedback';
import { useQuizFeedback } from './useQuizFeedback';
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
  onQuizSubmit?: (nodeId: string, optionId: string) => void;
  onRetryQuiz?: (nodeId: string) => void;
  onContinueToNext?: (nodeId: string) => void;
  onRegenerate?: (nodeId: string) => void;
  onSkipNode?: (nodeId: string) => void;
  isRegenerating?: boolean;
  canSkip?: boolean;
}

export function ConceptCard({
  node,
  isActive = false,
  onProceedToQuiz,
  onQuizSubmit,
  onRetryQuiz,
  onContinueToNext,
  onRegenerate,
  onSkipNode,
  isRegenerating = false,
  canSkip = false,
  quizResult,
}: ConceptCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

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

  const { result: feedbackResult, attemptCount } = useQuizFeedback({
    nodeId: node.id,
    latestResult: quizResult,
    enabled: node.status === 'SHOWING_FEEDBACK',
    quiz: node.quiz,
    nodeStatus: node.status,
  });

  // Status-based styling
  const statusStyles: Record<NodeStatus, string> = {
    LOCKED: 'opacity-50 bg-muted cursor-not-allowed',
    VIEWING_EXPLANATION: 'border-primary bg-card',
    IN_QUIZ: 'border-primary bg-card',
    SHOWING_FEEDBACK: 'border-amber-500 bg-amber-50 dark:bg-amber-950',
    COMPLETED: 'border-green-500 bg-green-50 dark:bg-green-950',
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
    onProceedToQuiz?.(node.id);
  };

  const handleSubmitQuiz = () => {
    if (selectedOption) {
      onQuizSubmit?.(node.id, selectedOption);
      setSelectedOption(null);
    }
  };

  const handleRetry = () => {
    setSelectedOption(null);
    onRetryQuiz?.(node.id);
  };

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
              <h3 className="font-semibold">{node.title}</h3>
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
                  <div className="flex justify-end pt-4 border-t">
                    <button
                      onClick={handleProceedToQuiz}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                      I understand, proceed to quiz →
                    </button>
                  </div>
                </div>
              )}

              {/* IN_QUIZ state */}
              {node.status === 'IN_QUIZ' && node.quiz && (
                <div className="space-y-4">
                  <p className="font-medium text-lg">{node.quiz.question_text}</p>
                  <div className="space-y-2">
                    {node.quiz.options.map((option) => (
                      <label
                        key={option.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                          selectedOption === option.id
                            ? 'border-primary bg-primary/10'
                            : 'border-muted hover:border-primary/50'
                        )}
                      >
                        <input
                          type="radio"
                          name={`quiz-${node.id}`}
                          value={option.id}
                          checked={selectedOption === option.id}
                          onChange={() => setSelectedOption(option.id)}
                          className="w-4 h-4"
                        />
                        <span className="font-mono text-sm text-muted-foreground">
                          {option.id}.
                        </span>
                        <span>{option.text}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end pt-4 border-t">
                    <button
                      onClick={handleSubmitQuiz}
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
              )}

              {node.status === 'SHOWING_FEEDBACK' && node.quiz && feedbackResult && (
                <QuizFeedback
                  quiz={node.quiz}
                  result={feedbackResult}
                  attemptCount={attemptCount}
                  onRetry={handleRetry}
                  onContinue={
                    feedbackResult.next_node_unlocked
                      ? () => onContinueToNext?.(node.id)
                      : undefined
                  }
                />
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
