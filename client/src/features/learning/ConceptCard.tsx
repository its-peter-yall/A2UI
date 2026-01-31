// ConceptCard.tsx
// Visual card component for concept nodes in the learning path

// Renders state-based content: explanation view, quiz view, feedback view,
// or locked/completed states. Enforces sequential flow by showing appropriate
// content and actions for each state.

// @see: client/src/types/learning.ts - Node and status types
// @note: Content visibility is server-authoritative; card respects status

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ConceptNode, NodeStatus, QuizSubmitResponse } from '@/types/learning';
import { MarkdownRenderer } from './MarkdownRenderer';
import { QuizFeedback } from './QuizFeedback';

interface ConceptCardProps {
  node: ConceptNode;
  isActive?: boolean;
  quizResult?: QuizSubmitResponse;
  onProceedToQuiz?: (nodeId: string) => void;
  onQuizSubmit?: (nodeId: string, optionId: string) => void;
  onRetryQuiz?: (nodeId: string) => void;
  onContinueToNext?: (nodeId: string) => void;
  onRegenerate?: (nodeId: string) => void;
}

export function ConceptCard({
  node,
  isActive = false,
  onProceedToQuiz,
  onQuizSubmit,
  onRetryQuiz,
  onContinueToNext,
  onRegenerate,
  quizResult,
}: ConceptCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

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
    ERROR: '⚠️',
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
    <article
      className={cn(
        'border rounded-lg transition-all duration-300',
        statusStyles[node.status],
        isActive && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 p-4 border-b">
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

        {/* SHOWING_FEEDBACK state */}
        {node.status === 'SHOWING_FEEDBACK' && node.quiz && quizResult && (
          <QuizFeedback
            quiz={node.quiz}
            result={quizResult}
            attemptCount={quizResult.attempt_number}
            onRetry={handleRetry}
            onContinue={
              quizResult.next_node_unlocked
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
            <div className="flex items-center gap-2 text-destructive">
              <span className="text-xl">⚠️</span>
              <span className="font-medium">Failed to generate content</span>
            </div>
            <button
              onClick={() => onRegenerate?.(node.id)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Retry Generation
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
