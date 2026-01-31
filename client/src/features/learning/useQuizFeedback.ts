// useQuizFeedback.ts
// Custom hook for managing quiz feedback state

// Fetches and caches the latest quiz result and attempt history
// for a node. Used by ConceptCard in SHOWING_FEEDBACK state.

// @see: client/src/lib/learningApi.ts - API functions
// @note: Result is passed in after submission, history fetched if needed

import { useQuery } from '@tanstack/react-query';
import { getQuizAttempts } from '@/lib/learningApi';
import type { QuizSubmitResponse } from '@/types/learning';

interface UseQuizFeedbackProps {
  nodeId: string;
  latestResult?: QuizSubmitResponse;
  enabled?: boolean;
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

  // Use latest result if provided, otherwise derive from history
  const result = latestResult;
  const attemptCount = latestResult?.attempt_number ?? history?.total_attempts ?? 0;

  return {
    result,
    attemptCount,
    isLoading,
    error: error as Error | null,
  };
}
