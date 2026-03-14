/**
 * ============================================================================
 * FILE: useQuizFeedback.ts
 * LOCATION: client/src/features/learning/useQuizFeedback.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Custom React hook for managing quiz feedback state and retrieving attempt
 *    history. Fetches the latest quiz result and historical attempt data for a
 *    specific node, enabling the UI to display correct/incorrect feedback.
 *
 * ROLE IN PROJECT:
 *    Bridges immediate mutation results with persisted attempt history so the
 *    feedback view works correctly on both first submission and page reload.
 *    Consumed by ConceptCard when a node is in SHOWING_FEEDBACK state.
 *
 * KEY COMPONENTS:
 *    - useQuizFeedback: Returns result, attemptCount, isLoading, error
 *    - Fallback result builder: Reconstructs QuizSubmitResponse from history
 *
 * DEPENDENCIES:
 *    - External: @tanstack/react-query
 *    - Internal: @/lib/learningApi, @/types/learning
 *
 * USAGE:
 *    ```tsx
 *    const { result, attemptCount, isLoading } = useQuizFeedback({
 *      nodeId: node.id, latestResult: quizResult, nodeStatus: node.status,
 *      quiz: node.quiz, enabled: node.status === 'SHOWING_FEEDBACK',
 *    });
 *    ```
 * ============================================================================
 */

// useQuizFeedback.ts
// Custom hook for managing quiz feedback state

import { useQuery } from '@tanstack/react-query';
import { getQuizAttempts } from '@/lib/learningApi';
import type { NodeStatus, QuizCard, QuizSubmitResponse } from '@/types/learning';

interface UseQuizFeedbackProps {
  nodeId: string;
  latestResult?: QuizSubmitResponse;
  enabled?: boolean;
  quiz?: QuizCard | null;
  nodeStatus: NodeStatus;
}

interface UseQuizFeedbackReturn {
  result: QuizSubmitResponse | undefined;
  attemptCount: number;
  isLoading: boolean;
  error: Error | null;
}

export function useQuizFeedback({
  nodeId,
  latestResult,
  enabled = true,
  quiz,
  nodeStatus,
}: UseQuizFeedbackProps): UseQuizFeedbackReturn {
  // IMPORTANT: If we have a latestResult (from mutation), always use it
  // regardless of enabled state to prevent flickering during session refetch
  const hasLatestResult = !!latestResult;

  // Fetch attempt history if no latest result provided
  const {
    data: history,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['quizAttempts', nodeId],
    queryFn: () => getQuizAttempts(nodeId),
    // Only fetch if enabled AND no latest result
    enabled: enabled && !hasLatestResult,
  });

  // If we have latestResult, use its attempt number, otherwise fall back to history
  const attemptCount = hasLatestResult
    ? latestResult.attempt_number
    : (history?.total_attempts ?? 0);

  // Build fallback result from history (when user reloads page)
  const fallbackResult =
    !hasLatestResult && history && history.attempts.length > 0 && quiz
      ? (() => {
          const lastAttempt = history.attempts[history.attempts.length - 1];
          const correctOption = quiz.options.find((option) => option.is_correct);
          const selectedOption = quiz.options.find(
            (option) => option.option_id === lastAttempt.selected_option_id
          );
          if (!correctOption || !selectedOption) {
            return undefined;
          }
          const isCorrect = lastAttempt.is_correct ?? selectedOption.is_correct;
          const scorePercent =
            lastAttempt.score_percent ?? (isCorrect ? 100 : 0);
          const isMastered = history.is_mastered ?? isCorrect;
          // Only reveal correct answer if the last attempt was correct
          // For wrong answers, don't reveal the correct option to maintain learning
          return {
            node_id: nodeId,
            attempt_number: lastAttempt.attempt_number,
            is_correct: isCorrect,
            score_percent: scorePercent,
            correct_option_id: isCorrect ? correctOption.option_id : null,
            selected_option_id: lastAttempt.selected_option_id,
            explanation: isCorrect ? correctOption.explanation : "",
            selected_explanation: isCorrect ? undefined : selectedOption.explanation,
            is_mastered: isMastered,
            next_node_unlocked: isMastered,
            node_status: nodeStatus,
          };
        })()
      : undefined;

  // Priority: latestResult (from mutation) > fallbackResult (from history) > undefined
  const result = hasLatestResult ? latestResult : fallbackResult;

  return {
    result,
    attemptCount,
    isLoading,
    error: error as Error | null,
  };
}
