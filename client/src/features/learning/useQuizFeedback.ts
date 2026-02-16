/**
 * ============================================================================
 * FILE: useQuizFeedback.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Custom React hook for managing quiz feedback state and retrieving attempt
 * history. Fetches the latest quiz result and historical attempt data for a
 * specific node, enabling the UI to display correct/incorrect feedback with
 * explanations. Supports both immediate results (from submission) and cached
 * historical data (for page reloads or navigation).
 * 
 * KEY COMPONENTS:
 * - useQuizFeedback: Main hook returning result, attemptCount, loading, error
 * - Quiz result resolution: Prefers latestResult prop, falls back to history
 * - Attempt count aggregation: Combines latest result and historical data
 * - Fallback result builder: Constructs QuizSubmitResponse from history if needed
 * 
 * DEPENDENCIES:
 * - @tanstack/react-query: useQuery for fetching attempt history
 * - @/lib/learningApi: getQuizAttempts API function
 * - @/types/learning: NodeStatus, QuizCard, QuizSubmitResponse types
 * 
 * USAGE PATTERN:
 * ```tsx
 * import { useQuizFeedback } from '@/features/learning/useQuizFeedback';
 * 
 * // In ConceptCard (SHOWING_FEEDBACK state):
 * const { result, attemptCount, isLoading, error } = useQuizFeedback({
 *   nodeId: node.id,
 *   latestResult: quizResult, // From mutation response
 *   nodeStatus: node.status,
 *   quiz: node.quiz,
 *   enabled: node.status === 'SHOWING_FEEDBACK',
 * });
 * 
 * if (isLoading) return <Skeleton />;
 * if (error) return <ErrorMessage error={error} />;
 * 
 * return (
 *   <QuizFeedbackDisplay
 *     isCorrect={result?.is_correct}
 *     score={result?.score_percent}
 *     explanation={result?.explanation}
 *     attemptNumber={attemptCount}
 *   />
 * );
 * ```
 * 
 * ERROR HANDLING:
 * - Returns error state from React Query if history fetch fails
 * - Returns undefined result if history exists but options are missing
 * - Gracefully handles missing correctOption or selectedOption in fallback
 * 
 * PERFORMANCE NOTES:
 * - React Query caches attempt history by nodeId
 * - Query is disabled when latestResult is provided (no unnecessary fetch)
 * - Fallback result is computed once per render, not memoized (simple object)
 * 
 * RELATED FILES:
 * - @/lib/learningApi: getQuizAttempts API call
 * - @/types/learning: QuizSubmitResponse type definition
 * - ConceptCard.tsx: Primary consumer of this hook
 * - QuizFeedback.tsx: Display component using result data
 * 
 * NOTES:
 * - The hook serves two use cases: (1) immediate result after submission,
 *   (2) historical result when revisiting a completed node
 * - attemptCount combines both latest result and history for display
 * - Fallback logic reconstructs QuizSubmitResponse shape from raw history
 * - Server is authoritative; this provides client-side data reconciliation
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
