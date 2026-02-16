// RevisionConceptCard.tsx
// Card component for revision mode that adapts rendering based on
// full_review or quiz_only mode, with status badges and no sequential locking.

// @see: ConceptCard.tsx (original learning card)
// @see: useRevisionMutations.ts (mutation handlers)

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  ConceptNode,
  RevisionNodeProgressWithDetails,
  RevisionMode,
  RevisionNodeStatus,
} from '@/types/learning';
import { MarkdownRenderer } from './MarkdownRenderer';

interface RevisionConceptCardProps {
  /** Original concept node with content and quiz data */
  node: ConceptNode;
  /** Current revision mode */
  revisionMode: RevisionMode;
  /** Revision-specific progress for this node */
  revisionProgress: RevisionNodeProgressWithDetails;
  /** Callback when user marks node as reviewed (full_review only) */
  onMarkReviewed: (nodeId: string) => void;
  /** Callback when user submits a quiz answer */
  onQuizSubmit: (nodeId: string, optionId: string, quizIndex?: number) => void;
  /** Whether the mark-reviewed mutation is loading */
  isMarkingReviewed?: boolean;
  /** Whether the quiz submit mutation is loading */
  isSubmitting?: boolean;
}

/**
 * Status badge configuration for revision node states.
 */
const statusBadges: Record<RevisionNodeStatus, { icon: string; label: string; className: string }> = {
  pending: {
    icon: '\u23F3',
    label: 'Pending',
    className: 'bg-muted text-muted-foreground',
  },
  reviewed: {
    icon: '\u2705',
    label: 'Reviewed',
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  quiz_passed: {
    icon: '\u2705',
    label: 'Passed',
    className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  quiz_failed: {
    icon: '\u274C',
    label: 'Try Again',
    className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
};

export function RevisionConceptCard({
  node,
  revisionMode,
  revisionProgress,
  onMarkReviewed,
  onQuizSubmit,
  isMarkingReviewed = false,
  isSubmitting = false,
}: RevisionConceptCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const badge = statusBadges[revisionProgress.status];

  // Determine card border style based on status
  const borderStyle = (() => {
    switch (revisionProgress.status) {
      case 'quiz_passed':
      case 'reviewed':
        return 'border-green-500 bg-green-50 dark:bg-green-950';
      case 'quiz_failed':
        return 'border-red-500 bg-red-50 dark:bg-red-950';
      default:
        return 'border-border bg-card';
    }
  })();

  const handleQuizSubmit = (quizIndex: number) => {
    if (selectedOption) {
      onQuizSubmit(node.id, selectedOption, quizIndex);
      setSelectedOption(null);
    }
  };

  const renderStatusBadge = () => (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        badge.className
      )}
      data-testid="revision-status-badge"
    >
      <span aria-hidden="true">{badge.icon}</span>
      {badge.label}
    </span>
  );

  const renderQuizSection = () => {
    // Use quiz data from original node: first try quiz_set, then single quiz
    const quizData = node.quiz_set ?? (node.quiz ? { quizzes: [node.quiz], current_index: 0, shuffle_seed: null } : null);
    if (!quizData || quizData.quizzes.length === 0) return null;

    const currentQuizIndex = 0; // In revision, always start from first quiz
    const currentQuiz = quizData.quizzes[currentQuizIndex];
    if (!currentQuiz) return null;

    return (
      <div className="space-y-4 mt-4 pt-4 border-t" data-testid="revision-quiz-section">
        {quizData.quizzes.length > 1 && (
          <div className="text-sm text-muted-foreground">
            Quiz {currentQuizIndex + 1} of {quizData.quizzes.length}
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
                name={`revision-quiz-${node.id}`}
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
        <div className="flex justify-end pt-2">
          <button
            onClick={() => handleQuizSubmit(currentQuizIndex)}
            disabled={!selectedOption || isSubmitting}
            className={cn(
              'px-4 py-2 rounded-md transition-colors',
              selectedOption && !isSubmitting
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
            data-testid="revision-quiz-submit"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Answer'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <article
      className={cn(
        'border rounded-lg overflow-hidden',
        borderStyle
      )}
      data-testid="revision-concept-card"
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-card/50">
        <div className="flex-1">
          <h3 className="font-semibold">{node.title}</h3>
          <span className="text-xs text-muted-foreground">
            Topic #{node.sequence_index + 1}
          </span>
        </div>
        {renderStatusBadge()}
      </div>

      {/* Card Body */}
      <div className="p-4">
        {revisionMode === 'full_review' && (
          <div className="space-y-4" data-testid="revision-full-review-content">
            {/* Always show explanation content in full_review */}
            <MarkdownRenderer content={node.content_markdown} />

            {/* Mark as Reviewed button */}
            {revisionProgress.status === 'pending' && (
              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={() => onMarkReviewed(node.id)}
                  disabled={isMarkingReviewed}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="mark-reviewed-button"
                >
                  {isMarkingReviewed ? 'Marking...' : 'Mark as Reviewed'}
                </button>
              </div>
            )}

            {/* Quiz section below content */}
            {renderQuizSection()}
          </div>
        )}

        {revisionMode === 'quiz_only' && (
          <div data-testid="revision-quiz-only-content">
            {/* Show only topic title as context, no explanation */}
            <p className="text-sm text-muted-foreground mb-2">
              Test your knowledge on this topic:
            </p>

            {/* Quiz immediately visible */}
            {renderQuizSection()}

            {/* If no quiz available */}
            {!node.quiz && !node.quiz_set && (
              <p className="text-muted-foreground text-center py-4">
                No quiz available for this topic.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
