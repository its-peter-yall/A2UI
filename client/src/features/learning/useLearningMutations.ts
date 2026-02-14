/**
 * ============================================================================
 * FILE: useLearningMutations.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Central React Query mutations hook that handles all learning state
 * transitions with optimistic updates, automatic rollback on error, and
 * mastery-based progression. Provides a clean API for the sequential
 * learning flow: VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK →
 * (retry or COMPLETED). Manages cache invalidation and provides both raw
 * mutations and convenience wrapper functions.
 * 
 * KEY COMPONENTS:
 * - useLearningMutations: Main hook returning mutation functions and states
 * - proceedToQuiz: Transition from VIEWING_EXPLANATION to IN_QUIZ
 * - submitAnswer: Submit quiz answer, triggers SHOWING_FEEDBACK
 * - retry: Retry quiz after incorrect (SHOWING_FEEDBACK → IN_QUIZ)
 * - continueToNext: Mark as complete and unlock next node
 * - regenerate: Retry failed content generation (ERROR → VIEWING_EXPLANATION)
 * - Optimistic updates: Instant UI feedback via onMutate handlers
 * - Callbacks: onQuizResult, onMasteryAchieved, onRetryNeeded, onError
 * 
 * DEPENDENCIES:
 * - @tanstack/react-query: useMutation, useQueryClient
 * - @/lib/learningApi: transitionNode, submitQuiz, retryQuiz, regenerateNode
 * - @/types/learning: NodeStatus, QuizSubmitResponse, LearningSessionWithNodes
 * - @/features/learning/optimisticUpdates: optimisticStatusUpdate, optimisticMasteryUpdate
 * 
 * USAGE PATTERN:
 * ```tsx
 * import { useLearningMutations } from '@/features/learning/useLearningMutations';
 * 
 * // In LearningPathContainer or ConceptCard:
 * const {
 *   proceedToQuiz,
 *   submitAnswer,
 *   retry,
 *   continueToNext,
 *   isAnyLoading,
 * } = useLearningMutations({
 *   sessionId: session.id,
 *   onMasteryAchieved: (nodeId) => {
 *     setShowCelebration(true);
 *   },
 *   onRetryNeeded: (nodeId, result) => {
 *     showToast('Keep trying! You\'ll get it.');
 *   },
 *   onError: (error) => {
 *     showErrorToast(error.message);
 *   },
 * });
 * 
 * // Usage in component:
 * <Button
 *   onClick={() => proceedToQuiz(node.id)}
 *   disabled={isAnyLoading || !actions.canProceedToQuiz}
 * >
 *   I understand, proceed to quiz
 * </Button>
 * ```
 * 
 * ERROR HANDLING:
 * - onMutate returns rollback function; onError calls it for instant reversal
 * - onSettled always invalidates queries to sync with server state
 * - All mutations have error callbacks that propagate to onError prop
 * - completeMasteryMutation handles dual transition (IN_QUIZ→FEEDBACK→COMPLETED)
 * 
 * PERFORMANCE NOTES:
 * - queryClient.cancelQueries prevents race conditions during rapid clicks
 * - Optimistic updates apply immediately (no network wait)
 * - Cache invalidation happens after every mutation success/error
 * - isAnyLoading combines all mutation states for global loading UI
 * 
 * RELATED FILES:
 * - @/lib/learningApi: API functions called by mutations
 * - optimisticUpdates.ts: optimisticStatusUpdate, optimisticMasteryUpdate helpers
 * - learningQueryKeys: Query key factory for cache management
 * - ConceptCard.tsx: Calls mutation functions based on node state
 * - LearningPathContainer.tsx: Provides sessionId and handles callbacks
 * 
 * NOTES:
 * - Mastery definition: 100% score required to unlock next topic
 * - Mutation functions use .mutate() (async fire-and-forget), not await
 * - isPending is TanStack Query v5 terminology (v4 used isLoading)
 * - completeMasteryMutation handles both status transition AND next node unlock
 * - All state transitions mirror server validation in learning_persistence.py
 * ============================================================================
 */

// useLearningMutations.ts
// React Query mutations for sequential learning flow

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
    }) => {
      // Server handles status transition internally
      return submitQuiz(nodeId, { selected_option_id: selectedOptionId });
    },
    
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
    
    onSettled: () => {
      // Always invalidate to sync server state after quiz submission
      invalidateSession();
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
      // Get current session state to check actual status
      const session = queryClient.getQueryData<LearningSessionWithNodes>(queryKey);
      const currentNode = session?.nodes.find((n) => n.id === nodeId);

      // If still in IN_QUIZ, first transition to SHOWING_FEEDBACK
      if (currentNode && currentNode.status === 'IN_QUIZ') {
        await transitionNode(nodeId, 'SHOWING_FEEDBACK');
      }

      // Then transition to COMPLETED
      await transitionNode(nodeId, 'COMPLETED');

      // Unlock next node
      if (nextNodeId) {
        await transitionNode(nextNodeId, 'VIEWING_EXPLANATION');
      }
    },

    onMutate: async ({ nodeId }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });

      const session = queryClient.getQueryData<LearningSessionWithNodes>(queryKey);
      const currentNode = session?.nodes.find((n) => n.id === nodeId);
      const nodeIndex = session?.nodes.findIndex((n) => n.id === nodeId) ?? -1;

      if (nodeIndex >= 0) {
        // First optimistic transition to SHOWING_FEEDBACK if needed
        if (currentNode && currentNode.status === 'IN_QUIZ') {
          const rollbackShowFeedback = optimisticStatusUpdate(
            queryClient,
            sessionId,
            nodeId,
            'SHOWING_FEEDBACK'
          );
          // Then optimistic transition to COMPLETED
          const rollback = optimisticMasteryUpdate(
            queryClient,
            sessionId,
            nodeId,
            nodeIndex
          );
          return {
            rollback: () => {
              rollbackShowFeedback();
              rollback();
            },
          };
        }

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
