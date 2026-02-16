// useRevisionMutations.ts
// React Query mutations for revision mode: mark reviewed, submit quiz

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markNodeReviewed, submitRevisionQuiz } from '@/lib/learningApi';
import type {
  RevisionSessionWithProgress,
  RevisionNodeStatus,
  RevisionQuizResponse,
} from '@/types/learning';
import { revisionQueryKeys } from './useRevisionSession';

/**
 * Props for useRevisionMutations hook.
 */
export interface UseRevisionMutationsProps {
  /** Revision session ID for cache operations */
  revisionId: string;
  /** Called on any mutation error */
  onError?: (error: Error, context: string) => void;
  /** Called after a quiz is submitted */
  onQuizResult?: (nodeId: string, isCorrect: boolean, result: RevisionQuizResponse) => void;
}

/**
 * Hook providing revision-mode mutations with optimistic updates.
 *
 * Features:
 * - markReviewed: Mark a node as reviewed in full_review mode
 * - submitQuiz: Submit a quiz answer in revision mode
 * - Optimistic updates for instant badge changes
 * - Cache invalidation after mutations
 */
export function useRevisionMutations({
  revisionId,
  onError,
  onQuizResult,
}: UseRevisionMutationsProps) {
  const queryClient = useQueryClient();
  const queryKey = revisionQueryKeys.session(revisionId);

  const invalidateRevision = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  /**
   * Optimistically update a revision node's status in cache.
   */
  const optimisticNodeUpdate = (nodeId: string, newStatus: RevisionNodeStatus) => {
    const previousData = queryClient.getQueryData<RevisionSessionWithProgress>(queryKey);
    if (!previousData) return () => {};

    queryClient.setQueryData<RevisionSessionWithProgress>(queryKey, {
      ...previousData,
      nodes: previousData.nodes.map((node) =>
        node.node_id === nodeId ? { ...node, status: newStatus } : node
      ),
    });

    return () => {
      queryClient.setQueryData(queryKey, previousData);
    };
  };

  // Mark node as reviewed (full_review mode)
  const markReviewedMutation = useMutation({
    mutationFn: (nodeId: string) => markNodeReviewed(revisionId, nodeId),

    onMutate: async (nodeId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const rollback = optimisticNodeUpdate(nodeId, 'reviewed');
      return { rollback };
    },

    onError: (error, _nodeId, context) => {
      context?.rollback();
      onError?.(error as Error, 'markReviewed');
    },

    onSettled: () => {
      invalidateRevision();
    },
  });

  // Submit revision quiz
  const submitQuizMutation = useMutation({
    mutationFn: ({
      nodeId,
      selectedOptionId,
      quizIndex,
    }: {
      nodeId: string;
      selectedOptionId: string;
      quizIndex?: number;
    }) => submitRevisionQuiz(revisionId, nodeId, selectedOptionId, quizIndex),

    onMutate: async ({ nodeId }) => {
      await queryClient.cancelQueries({ queryKey });
      // Optimistically set to quiz_passed (will be corrected by server if wrong)
      const rollback = optimisticNodeUpdate(nodeId, 'quiz_passed');
      return { rollback };
    },

    onSuccess: (result) => {
      onQuizResult?.(result.node_id, result.is_correct, result);
    },

    onError: (error, _variables, context) => {
      context?.rollback();
      onError?.(error as Error, 'submitRevisionQuiz');
    },

    onSettled: () => {
      invalidateRevision();
    },
  });

  // Convenience functions
  const markReviewed = (nodeId: string) => {
    markReviewedMutation.mutate(nodeId);
  };

  const submitAnswer = (nodeId: string, optionId: string, quizIndex?: number) => {
    submitQuizMutation.mutate({
      nodeId,
      selectedOptionId: optionId,
      quizIndex,
    });
  };

  return {
    markReviewedMutation,
    submitQuizMutation,

    markReviewed,
    submitAnswer,

    isMarkingReviewed: markReviewedMutation.isPending,
    isSubmitting: submitQuizMutation.isPending,
    isAnyLoading: markReviewedMutation.isPending || submitQuizMutation.isPending,
  };
}
