/**
 * ============================================================================
 * FILE: QuizFeedback.tsx
 * LOCATION: client/src/features/learning/QuizFeedback.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Normal-learning quiz feedback wrapper: shows result details via the
 *    shared QuizResultDetails presentation and retains this flow's own
 *    progress header, mastery badge, retry, next-quiz, and continue actions.
 *
 * ROLE IN PROJECT:
 *    Feedback layer within the learning feature, rendered by ConceptCard when
 *    node status is SHOWING_FEEDBACK. Drives the retry-or-continue decision
 *    point in the sequential learning flow. Option/result rendering is
 *    delegated to the shared QuizResultDetails so learning and revision stay
 *    consistent; mastery policy remains exclusive to this component.
 *
 * KEY COMPONENTS:
 *    - QuizFeedback: QuizSet progress/difficulty header and action policy
 *    - QuizResultDetails (delegated): Stable-ID result header and options
 *    - Action Buttons: Retry, Next Quiz, or Continue (learning-only)
 *
 * DEPENDENCIES:
 *    - External: (none)
 *    - Internal: @/lib/utils (cn), @/types/learning, ./QuizResultDetails
 *
 * USAGE:
 *    ```tsx
 *    <QuizFeedback
 *      quiz={node.quiz}
 *      result={feedbackResult}
 *      attemptCount={attemptCount}
 *      onRetry={() => handleRetry()}
 *      onContinue={feedbackResult.is_mastered ? () => onContinueToNext?.(node.id) : undefined}
 *    />
 *    ```
 * ============================================================================
 */

import { cn } from '@/lib/utils';
import type { QuizCard, QuizSet, QuizSubmitResponse } from '@/types/learning';
import { QuizResultDetails } from './QuizResultDetails';

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
  quiz, result, attemptCount, currentQuizIndex = 0,
  onRetry, onContinue, onNextQuiz,
}: QuizFeedbackProps) {
  const isQuizSet = 'quizzes' in quiz;
  const currentQuiz = isQuizSet ? quiz.quizzes[currentQuizIndex] ?? quiz.quizzes[0] : quiz;
  if (!currentQuiz) {
    return <div className="p-4 text-center text-muted-foreground">No quiz data available.</div>;
  }
  const totalQuizzes = isQuizSet ? quiz.quizzes.length : 1;
  const hasMoreQuizzes = currentQuizIndex < totalQuizzes - 1;
  const difficultyStyles = {
    easy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <div className="space-y-6">
      {isQuizSet && totalQuizzes > 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Quiz {currentQuizIndex + 1} of {totalQuizzes}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', difficultyStyles[currentQuiz.difficulty])}>
            {currentQuiz.difficulty.charAt(0).toUpperCase() + currentQuiz.difficulty.slice(1)}
          </span>
        </div>
      )}
      <QuizResultDetails quiz={currentQuiz} result={result} attemptCount={attemptCount}
        headerAccessory={result.is_mastered ? (
          <span className="ml-auto rounded bg-green-500 px-2 py-1 text-sm font-medium text-white">Mastered!</span>
        ) : undefined} />
      <div className="flex justify-end gap-3 border-t pt-4">
        {isQuizSet && result.is_correct && hasMoreQuizzes && onNextQuiz && (
          <button type="button" onClick={onNextQuiz}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">
            Next Quiz →
          </button>
        )}
        {!result.is_mastered && onRetry && (!isQuizSet || !result.is_correct || !hasMoreQuizzes) && (
          <button type="button" onClick={onRetry} className="rounded-md border px-4 py-2 hover:bg-muted">Try Again</button>
        )}
        {result.is_mastered && onContinue && (
          <button type="button" onClick={onContinue}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">
            {result.next_node_unlocked ? 'Continue to Next Topic →' : 'Complete Course 🎉'}
          </button>
        )}
        {result.is_mastered && !onContinue && (
          <span className="px-4 py-2 text-muted-foreground">Course complete! 🎉</span>
        )}
      </div>
    </div>
  );
}
