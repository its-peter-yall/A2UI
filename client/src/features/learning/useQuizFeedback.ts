// useQuizFeedback.ts
// Custom hook for managing quiz feedback state

// Fetches and caches the latest quiz result and attempt history
// for a node. Used by ConceptCard in SHOWING_FEEDBACK state.

// @see: client/src/lib/learningApi.ts - API functions
// @note: Result is passed in after submission, history fetched if needed

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
  // Fetch attempt history if no latest result provided
  const {
    data: history,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['quizAttempts', nodeId],
    queryFn: () => getQuizAttempts(nodeId),
    enabled: enabled && !latestResult,
  });

  const attemptCount = latestResult?.attempt_number ?? history?.total_attempts ?? 0;

  const fallbackResult =
    history && history.attempts.length > 0 && quiz
      ? (() => {
          const lastAttempt = history.attempts[history.attempts.length - 1];
          const correctOption = quiz.options.find((option) => option.is_correct);
          const selectedOption = quiz.options.find(
            (option) => option.id === lastAttempt.selected_option_id
          );
          if (!correctOption || !selectedOption) {
            return undefined;
          }
          const isCorrect = lastAttempt.is_correct ?? selectedOption.is_correct;
          const scorePercent =
            lastAttempt.score_percent ?? (isCorrect ? 100 : 0);
          const isMastered = history.is_mastered ?? isCorrect;
          return {
            node_id: nodeId,
            attempt_number: lastAttempt.attempt_number,
            is_correct: isCorrect,
            score_percent: scorePercent,
            correct_option_id: correctOption.id,
            selected_option_id: lastAttempt.selected_option_id,
            explanation: selectedOption.explanation,
            is_mastered: isMastered,
            next_node_unlocked: isMastered,
            node_status: nodeStatus,
          };
        })()
      : undefined;

  const result = latestResult ?? fallbackResult;

  return {
    result,
    attemptCount,
    isLoading,
    error: error as Error | null,
  };
}
