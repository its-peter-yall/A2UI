/**
 * ============================================================================
 * FILE: QuizFeedback.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Displays detailed quiz results after a user submits an answer. Shows whether
 * the answer was correct/incorrect, displays the correct answer, provides
 * explanations for all options, and offers action buttons to retry or continue.
 * Rendered inside ConceptCard when node status is SHOWING_FEEDBACK.
 * 
 * KEY COMPONENTS:
 * - QuizFeedback: Main component with result header and action buttons
 * - Result Header: Shows correct/incorrect icon, attempt count, score percentage
 * - Option Feedback: Each quiz option shows correct/incorrect state with explanation
 * - Action Buttons: Retry (if not mastered) or Continue (if mastered)
 * 
 * DEPENDENCIES:
 * - @/lib/utils: cn() utility for conditional className composition
 * - @/types/learning: QuizCard, QuizSubmitResponse types for type safety
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Inside ConceptCard when status === SHOWING_FEEDBACK
 * <QuizFeedback
 *   quiz={node.quiz}
 *   result={feedbackResult}
 *   attemptCount={attemptCount}
 *   onRetry={() => handleRetry()}
 *   onContinue={feedbackResult.is_mastered ? () => onContinueToNext?.(node.id) : undefined}
 * />
 * ```
 * 
 * ERROR HANDLING:
 * - This component assumes quiz and result are always provided
 * - Error states handled by parent ConceptCard (LoadingState/ErrorState)
 * 
 * PERFORMANCE NOTES:
 * - Lightweight component with minimal re-renders
 * - Uses CSS transitions for hover states
 * - Conditional rendering only includes relevant option feedback
 * 
 * RELATED FILES:
 * - ConceptCard.tsx: Parent component that renders QuizFeedback
 * - useQuizFeedback.ts: Hook that fetches and manages feedback data
 * - @/types/learning.ts: QuizCard, QuizSubmitResponse type definitions
 * 
 * NOTES:
 * - Shows "Mastered!" badge when is_mastery_achieved is true
 * - Score percent shows user's current score (not cumulative)
 * - "Continue to Next Topic" or "Complete Course" based on next_node_unlocked
 * ============================================================================
 */

import { cn } from '@/lib/utils';
import type { QuizCard, QuizSubmitResponse } from '@/types/learning';

interface QuizFeedbackProps {
  quiz: QuizCard;
  result: QuizSubmitResponse;
  attemptCount: number;
  onRetry?: () => void;
  onContinue?: () => void;
}

export function QuizFeedback({
  quiz,
  result,
  attemptCount,
  onRetry,
  onContinue,
}: QuizFeedbackProps) {
  const { is_correct, is_mastered, selected_option_id, correct_option_id } = result;

  return (
    <div className="space-y-6">
      {/* Result header */}
      <div
        className={cn(
          'flex items-center gap-3 p-4 rounded-lg',
          is_correct
            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
        )}
      >
        <span className="text-2xl">{is_correct ? '✅' : '❌'}</span>
        <div>
          <p className="font-semibold text-lg">
            {is_correct ? 'Correct!' : 'Incorrect'}
          </p>
          <p className="text-sm opacity-80">
            Attempt #{attemptCount} • Score: {result.score_percent}%
          </p>
        </div>
        {is_mastered && (
          <span className="ml-auto text-sm font-medium bg-green-500 text-white px-2 py-1 rounded">
            Mastered!
          </span>
        )}
      </div>

      {/* Question */}
      <div>
        <p className="font-medium text-lg">{quiz.question_text}</p>
      </div>

      {/* Options with feedback */}
      <div className="space-y-3">
        {quiz.options.map((option) => {
          const isSelected = option.id === selected_option_id;
          const isCorrect = option.id === correct_option_id;

          return (
            <div
              key={option.id}
              className={cn(
                'p-4 rounded-lg border-2 transition-all',
                isCorrect && 'border-green-500 bg-green-50 dark:bg-green-900/20',
                isSelected && !isCorrect && 'border-red-500 bg-red-50 dark:bg-red-900/20',
                !isSelected && !isCorrect && 'border-muted bg-muted/30'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Option indicator */}
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-sm font-mono shrink-0',
                    isCorrect && 'bg-green-500 text-white',
                    isSelected && !isCorrect && 'bg-red-500 text-white',
                    !isSelected && !isCorrect && 'bg-muted text-muted-foreground'
                  )}
                >
                  {option.id}
                </div>

                {/* Option content */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{option.text}</span>
                    {isSelected && (
                      <span className="text-xs text-muted-foreground">
                        (Your answer)
                      </span>
                    )}
                    {isCorrect && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        ✓ Correct answer
                      </span>
                    )}
                  </div>

                  {/* Explanation */}
                  <p
                    className={cn(
                      'text-sm',
                      isCorrect
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-muted-foreground'
                    )}
                  >
                    {option.explanation}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        {!is_mastered && onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
          >
            Try Again
          </button>
        )}
        {is_mastered && onContinue && (
          <button
            onClick={onContinue}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {result.next_node_unlocked ? 'Continue to Next Topic →' : 'Complete Course 🎉'}
          </button>
        )}
        {is_mastered && !onContinue && (
          <span className="px-4 py-2 text-muted-foreground">
            Course complete! 🎉
          </span>
        )}
      </div>
    </div>
  );
}
