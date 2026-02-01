// useLearningMutations.ts
// React Query mutations for sequential learning flow

// Provides mutations for all learning state transitions with cache
// invalidation, optimistic updates, and mastery-based progression.
//
// Sequential Flow:
//   VIEWING_EXPLANATION → (proceedToQuiz) → IN_QUIZ
//   IN_QUIZ → (submitQuiz) → SHOWING_FEEDBACK
//   SHOWING_FEEDBACK → (retryQuiz) → IN_QUIZ [if not mastered]
//   SHOWING_FEEDBACK → (continueToNext) → next node unlocks [if mastered]
//
// Best Practices Applied (TanStack Query v5):
// - Cancel queries in onMutate to prevent race conditions
// - Snapshot previous data for rollback
// - Use isPending (not isLoading) for mutation states
// - Invalidate queries in onSettled (both success and error)
// - Return context from onMutate for rollback in onError

// @see: client/src/lib/learningApi.ts - API functions
// @note: Mastery = 100% score required to unlock next topic

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  transitionNode,
  submitQuiz,
  retryQuiz,
  regenerateNode,
} from '@/lib/learningApi';
import type {
  NodeStatus,
  QuizSubmitResponse,
  LearningSessionWithNodes,
} from '@/types/learning';
import {
  optimisticStatusUpdate,
  optimisticMasteryUpdate,
  learningQueryKeys,
  type RollbackFn,
} from './optimisticUpdates';

/**
 * Props for useLearningMutations hook.
 */
export interface UseLearningMutationsProps {
  /** Session ID for cache operations */
  sessionId: string;
  /** Called after any quiz submission with the result */
  onQuizResult?: (result: QuizSubmitResponse) => void;
  /** Called when user achieves 100% mastery on a topic */
  onMasteryAchieved?: (nodeId: string) => void;
  /** Called when user needs to retry (score < 100%) */
  onRetryNeeded?: (nodeId: string, result: QuizSubmitResponse) => void;
  /** Called on any mutation error */
  onError?: (error: Error, context: string) => void;
}

/**
 * Context returned from onMutate for rollback.
 */
interface MutationContext {
  rollback: RollbackFn;
}

/**
 * Hook providing all learning-related mutations with sequential flow enforcement.
 * 
 * Features:
 * - Optimistic updates for instant UI feedback
 * - Automatic rollback on error
 * - Cache invalidation after mutations
 * - Loading states for all mutations
 * - Callbacks for mastery and retry paths
 * 
 * @example
 * ```tsx
 * const {
 *   proceedToQuiz,
 *   submitAnswer,
 *   retry,
 *   isAnyLoading,
 * } = useLearningMutations({
 *   sessionId: 'session-123',
 *   onMasteryAchieved: (nodeId) => celebrate(),
 *   onRetryNeeded: (nodeId) => showEncouragement(),
 * });
 * 
 * // User clicks "I understand, proceed to quiz"
 * <button onClick={() => proceedToQuiz(nodeId)} disabled={isAnyLoading}>
 *   Proceed to Quiz
 * </button>
 * ```
 */
export function useLearningMutations({
  sessionId,
  onQuizResult,
  onMasteryAchieved,
  onRetryNeeded,
  onError,
}: UseLearningMutationsProps) {
  const queryClient = useQueryClient();
  const queryKey = learningQueryKeys.session(sessionId);

  /**
   * Helper to invalidate session data.
   * Called in onSettled to ensure UI matches server after mutation.
   */
  const invalidateSession = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  // ============================================================
  // TRANSITION: VIEWING_EXPLANATION → IN_QUIZ
  // User clicks "I understand, proceed to quiz"
  // ============================================================
  const transitionMutation = useMutation({
    mutationFn: ({
      nodeId,
      targetStatus,
    }: {
      nodeId: string;
      targetStatus: NodeStatus;
    }) => transitionNode(nodeId, targetStatus),
    
    onMutate: async ({ nodeId, targetStatus }): Promise<MutationContext> => {
      // Best Practice: Cancel outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey });

      // Optimistically update status
      const rollback = optimisticStatusUpdate(
        queryClient,
        sessionId,
        nodeId,
        targetStatus
      );

      return { rollback };
    },
    
    onError: (error, _variables, context) => {
      // Rollback on error
      context?.rollback();
      onError?.(error as Error, 'transition');
    },
    
    onSettled: () => {
      // Always refetch to sync with server
      invalidateSession();
    },
  });

  // ============================================================
  // SUBMIT QUIZ: IN_QUIZ → SHOWING_FEEDBACK
  // User submits answer; server validates and returns result
  // ============================================================
  const submitQuizMutation = useMutation({
    mutationFn: ({
      nodeId,
      selectedOptionId,
    }: {
      nodeId: string;
      selectedOptionId: string;
    }) => submitQuiz(nodeId, { selected_option_id: selectedOptionId }),
    
    onMutate: async ({ nodeId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });

      // Optimistically transition to SHOWING_FEEDBACK
      const rollback = optimisticStatusUpdate(
        queryClient,
        sessionId,
        nodeId,
        'SHOWING_FEEDBACK'
      );

      return { rollback };
    },
    
    onSuccess: (result, { nodeId }) => {
      // Always call the generic quiz result callback
      onQuizResult?.(result);

      // Handle mastery vs retry paths
      if (result.is_mastered) {
        // User achieved 100% - can proceed to next
        onMasteryAchieved?.(nodeId);
      } else {
        // User did not achieve 100% - must retry
        onRetryNeeded?.(nodeId, result);
      }
    },
    
    onError: (error, _variables, context) => {
      context?.rollback();
      onError?.(error as Error, 'submitQuiz');
    },
    
    onSettled: (result, error) => {
      if (error || !result?.is_mastered) {
        invalidateSession();
      }
    },
  });

  // ============================================================
  // RETRY QUIZ: SHOWING_FEEDBACK → IN_QUIZ
  // User clicks "Retry" after incorrect answer
  // ============================================================
  const retryQuizMutation = useMutation({
    mutationFn: (nodeId: string) => retryQuiz(nodeId),
    
    onMutate: async (nodeId): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });

      // Optimistically transition back to IN_QUIZ
      const rollback = optimisticStatusUpdate(
        queryClient,
        sessionId,
        nodeId,
        'IN_QUIZ'
      );

      return { rollback };
    },
    
    onError: (error, _nodeId, context) => {
      context?.rollback();
      onError?.(error as Error, 'retryQuiz');
    },
    
    onSettled: () => {
      invalidateSession();
    },
  });

  const completeMasteryMutation = useMutation({
    mutationFn: async ({
      nodeId,
      nextNodeId,
    }: {
      nodeId: string;
      nextNodeId?: string;
    }) => {
      await transitionNode(nodeId, 'COMPLETED');
      if (nextNodeId) {
        await transitionNode(nextNodeId, 'VIEWING_EXPLANATION');
      }
    },

    onMutate: async ({ nodeId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });

      const session = queryClient.getQueryData<LearningSessionWithNodes>(queryKey);
      const nodeIndex = session?.nodes.findIndex((n) => n.id === nodeId) ?? -1;

      if (nodeIndex >= 0) {
        const rollback = optimisticMasteryUpdate(
          queryClient,
          sessionId,
          nodeId,
          nodeIndex
        );
        return { rollback };
      }

      return { rollback: () => undefined };
    },

    onError: (error, _variables, context) => {
      context?.rollback();
      onError?.(error as Error, 'complete');
    },

    onSettled: () => {
      invalidateSession();
    },
  });

  // ============================================================
  // REGENERATE: ERROR → VIEWING_EXPLANATION
  // User clicks "Retry" on a failed generation
  // ============================================================
  const regenerateMutation = useMutation({
    mutationFn: (nodeId: string) => regenerateNode(nodeId),
    
    onSuccess: () => {
      invalidateSession();
    },
    
    onError: (error: Error) => {
      onError?.(error, 'regenerate');
    },
  });

  // ============================================================
  // Convenience functions for cleaner component code
  // ============================================================

  /**
   * Proceed from explanation to quiz.
   * Only valid from VIEWING_EXPLANATION state.
   * 
   * @param nodeId - Node to transition
   */
  const proceedToQuiz = (nodeId: string) => {
    transitionMutation.mutate({
      nodeId,
      targetStatus: 'IN_QUIZ',
    });
  };

  /**
   * Submit quiz answer.
   * Only valid from IN_QUIZ state.
   * Result determines if user can proceed or must retry.
   * 
   * @param nodeId - Node with the quiz
   * @param optionId - Selected option ID (A, B, C, or D)
   */
  const submitAnswer = (nodeId: string, optionId: string) => {
    submitQuizMutation.mutate({
      nodeId,
      selectedOptionId: optionId,
    });
  };

  /**
   * Retry quiz after incorrect answer.
   * Only valid from SHOWING_FEEDBACK state when not mastered.
   * 
   * @param nodeId - Node to retry
   */
  const retry = (nodeId: string) => {
    retryQuizMutation.mutate(nodeId);
  };

  /**
   * Continue to next topic after mastery.
   * Triggers scroll to next node and marks current as reviewed.
   * Only valid from SHOWING_FEEDBACK state when mastered.
   * 
   * Note: Status is already COMPLETED from submitAnswer success path.
   * This function just handles the UI transition (scrolling).
   * 
   * @param nodeId - Current node (for reference)
   * @param nextNodeId - Next node to scroll to
   */
  const continueToNext = (_nodeId: string, nextNodeId?: string) => {
    completeMasteryMutation.mutate({
      nodeId: _nodeId,
      nextNodeId,
    });
    if (nextNodeId) {
      document.getElementById(`node-${nextNodeId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  /**
   * Regenerate a failed node.
   * Only valid from ERROR state.
   * 
   * @param nodeId - Node to regenerate
   */
  const regenerate = (nodeId: string) => {
    regenerateMutation.mutate(nodeId);
  };

  return {
    // Raw mutations (for advanced use cases)
    transitionMutation,
    submitQuizMutation,
    retryQuizMutation,
    regenerateMutation,

    // Convenience functions (recommended for most use cases)
    proceedToQuiz,
    submitAnswer,
    retry,
    continueToNext,
    regenerate,

    // Loading states (TanStack Query v5 uses isPending for mutations)
    isTransitioning: transitionMutation.isPending,
    isSubmitting: submitQuizMutation.isPending,
    isRetrying: retryQuizMutation.isPending,
    isRegenerating: regenerateMutation.isPending,
    isCompleting: completeMasteryMutation.isPending,
    
    /** True if any mutation is in progress */
    isAnyLoading:
      transitionMutation.isPending ||
      submitQuizMutation.isPending ||
      retryQuizMutation.isPending ||
      regenerateMutation.isPending ||
      completeMasteryMutation.isPending,
  };
}
