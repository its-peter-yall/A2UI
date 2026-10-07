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
 *    - feedbackFromHistory: Rebuilds QuizSubmitResponse from selected_option_ids
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
import type {
  NodeStatus,
  QuizAttemptHistory,
  QuizCard,
  QuizSubmitResponse,
} from '@/types/learning';

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

function feedbackFromHistory(
  nodeId: string,
  nodeStatus: NodeStatus,
  history: QuizAttemptHistory,
  quiz?: QuizCard | null,
): QuizSubmitResponse | undefined {
  if (history.attempts.length === 0) {
    return undefined;
  }
  const lastAttempt = history.attempts[history.attempts.length - 1];
  const selectedIds = lastAttempt.selected_option_ids ?? [];
  if (selectedIds.length === 0) {
    return undefined;
  }

  const isCorrect = lastAttempt.is_correct;
  const selectedOptions = quiz?.options.filter((option) =>
    selectedIds.includes(option.option_id),
  ) ?? [];
  const correctOptions = quiz?.options.filter((option) => option.is_correct) ?? [];
  const correctOptionIds = isCorrect
    ? (lastAttempt.correct_option_ids?.length
        ? lastAttempt.correct_option_ids
        : correctOptions.map((option) => option.option_id))
    : [];

  return {
    node_id: nodeId,
    attempt_number: lastAttempt.attempt_number,
    is_correct: isCorrect,
    score_percent: lastAttempt.score_percent ?? (isCorrect ? 100 : 0),
    correct_option_ids: correctOptionIds,
    selected_option_ids: selectedIds,
    explanation: isCorrect
      ? (lastAttempt.explanation || correctOptions[0]?.explanation || '')
      : '',
    selected_explanation: isCorrect
      ? undefined
      : (lastAttempt.selected_explanation
          || selectedOptions[0]?.explanation
          || lastAttempt.explanation
          || undefined),
    quiz_index: lastAttempt.quiz_index ?? 0,
    is_mastered: history.is_mastered ?? isCorrect,
    next_node_unlocked: history.is_mastered ?? isCorrect,
    node_status: nodeStatus,
  };
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

  // Rebuild from persisted history after reload. Do not require the selected
  // option to exist on `quiz`: after a correct non-mastered answer the server
  // advances current_index, so node.quiz may already be the next card.
  const fallbackResult =
    !hasLatestResult && history
      ? feedbackFromHistory(nodeId, nodeStatus, history, quiz)
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
