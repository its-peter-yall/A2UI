/**
 * ============================================================================
 * FILE: QuizFeedback.tsx
 * ============================================================================
 *
 * PURPOSE:
 * Displays detailed quiz results after a user submits an answer. Shows whether
 * the answer was correct/incorrect, displays the correct answer, provides
 * explanations for all options, and offers action buttons to retry or continue.
 * Now supports both single QuizCard and QuizSet (multiple quizzes per node).
 * Rendered inside ConceptCard when node status is SHOWING_FEEDBACK.
 *
 * KEY COMPONENTS:
 * - QuizFeedback: Main component with result header and action buttons
 * - Result Header: Shows correct/incorrect icon, attempt count, score percentage
 * - Quiz Set Progress: Shows "Quiz X of Y" when displaying a QuizSet
 * - Option Feedback: Each quiz option shows correct/incorrect state with explanation
 * - Action Buttons: Retry (if not mastered), Next Quiz (if in set), or Continue
 *
 * DEPENDENCIES:
 * - @/lib/utils: cn() utility for conditional className composition
 * - @/types/learning: QuizCard, QuizSet, QuizSubmitResponse types
 *
 * USAGE PATTERN:
 * ```tsx
 * // Single quiz feedback
 * <QuizFeedback
 *   quiz={node.quiz}
 *   result={feedbackResult}
 *   attemptCount={attemptCount}
 *   onRetry={() => handleRetry()}
 *   onContinue={feedbackResult.is_mastered ? () => onContinueToNext?.(node.id) : undefined}
 * />
 *
 * // Quiz set feedback
 * <QuizFeedback
 *   quiz={node.quiz_set}
 *   result={feedbackResult}
 *   attemptCount={attemptCount}
 *   currentQuizIndex={currentIndex}
 *   onNextQuiz={() => handleNextQuiz()}
 *   onRetry={() => handleRetry()}
 *   onContinue={() => onContinueToNext?.(node.id)}
 * />
 * ```
 *
 * ERROR HANDLING:
 * - This component assumes quiz and result are always provided
 * - Error states handled by parent ConceptCard (LoadingState/ErrorState)
 * - Gracefully handles edge cases like empty quiz sets
 *
 * PERFORMANCE NOTES:
 * - Lightweight component with minimal re-renders
 * - Uses CSS transitions for hover states
 * - Conditional rendering only includes relevant option feedback
 * - Memoized quiz extraction to prevent unnecessary recalculation
 *
 * RELATED FILES:
 * - ConceptCard.tsx: Parent component that renders QuizFeedback
 * - useQuizFeedback.ts: Hook that fetches and manages feedback data
 * - @/types/learning.ts: QuizCard, QuizSet, QuizSubmitResponse type definitions
 *
 * NOTES:
 * - Shows "Mastered!" badge when is_mastery_achieved is true
 * - Score percent shows user's current score (not cumulative)
 * - "Continue to Next Topic" or "Complete Course" based on next_node_unlocked
 * - QuizSet navigation only shows when there are more quizzes and current is correct
 * - display_label (A-D) is preserved even when options are shuffled
 * ============================================================================
 */

import { cn } from '@/lib/utils';
import type { QuizCard, QuizSet, QuizSubmitResponse } from '@/types/learning';

interface QuizFeedbackProps {
  quiz: QuizCard | QuizSet;
  result: QuizSubmitResponse;
  attemptCount: number;
  currentQuizIndex?: number;
  onRetry?: () => void;
  onContinue?: () => void;
  onNextQuiz?: () => void;
}

export function QuizFeedback({
  quiz,
  result,
  attemptCount,
  currentQuizIndex = 0,
  onRetry,
  onContinue,
  onNextQuiz,
}: QuizFeedbackProps) {
  const { is_correct, is_mastered, selected_option_id, correct_option_id } =
    result;

  // Determine if we're dealing with a QuizSet and extract current quiz
  const isQuizSet = 'quizzes' in quiz;
  const currentQuiz = isQuizSet
    ? quiz.quizzes[currentQuizIndex] ?? quiz.quizzes[0]
    : quiz;

  // Guard against undefined current quiz (edge case: empty quiz set)
  if (!currentQuiz) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No quiz data available.
      </div>
    );
  }

  const totalQuizzes = isQuizSet ? quiz.quizzes.length : 1;
  const hasMoreQuizzes = currentQuizIndex < totalQuizzes - 1;

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

      {/* Quiz set progress indicator */}
      {isQuizSet && totalQuizzes > 1 && (
        <div className="text-sm text-muted-foreground mb-4">
          Quiz {currentQuizIndex + 1} of {totalQuizzes}
        </div>
      )}

      {/* Question */}
      <div>
        <p className="font-medium text-lg">{currentQuiz.question_text}</p>
      </div>

      {/* Options with feedback */}
      <div className="space-y-3">
        {currentQuiz.options.map((option) => {
          const isSelected = option.option_id === selected_option_id;
          const isCorrectOption = option.option_id === correct_option_id;

          return (
            <div
              key={option.option_id}
              className={cn(
                'p-4 rounded-lg border-2 transition-all',
                isCorrectOption &&
                  'border-green-500 bg-green-50 dark:bg-green-900/20',
                isSelected &&
                  !isCorrectOption &&
                  'border-red-500 bg-red-50 dark:bg-red-900/20',
                !isSelected &&
                  !isCorrectOption &&
                  'border-muted bg-muted/30'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Option indicator with display_label */}
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-sm font-mono shrink-0',
                    isCorrectOption && 'bg-green-500 text-white',
                    isSelected && !isCorrectOption && 'bg-red-500 text-white',
                    !isSelected && !isCorrectOption && 'bg-muted text-muted-foreground'
                  )}
                >
                  {option.display_label}
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
                    {isCorrectOption && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        ✓ Correct answer
                      </span>
                    )}
                  </div>

                  {/* Explanation */}
                  <p
                    className={cn(
                      'text-sm',
                      isCorrectOption
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
        {/* Next Quiz button - only show for QuizSet when correct and more quizzes exist */}
        {isQuizSet && is_correct && hasMoreQuizzes && onNextQuiz && (
          <button
            onClick={onNextQuiz}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Next Quiz →
          </button>
        )}

        {/* Retry button - show when not mastered and no next quiz or not in set */}
        {!is_mastered && onRetry && (!isQuizSet || !is_correct || !hasMoreQuizzes) && (
          <button
            onClick={onRetry}
            className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
          >
            Try Again
          </button>
        )}

        {/* Continue button - only show when mastered */}
        {is_mastered && onContinue && (
          <button
            onClick={onContinue}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {result.next_node_unlocked
              ? 'Continue to Next Topic →'
              : 'Complete Course 🎉'}
          </button>
        )}

        {/* Course complete message when mastered but no continue handler */}
        {is_mastered && !onContinue && (
          <span className="px-4 py-2 text-muted-foreground">
            Course complete! 🎉
          </span>
        )}
      </div>
    </div>
  );
}
