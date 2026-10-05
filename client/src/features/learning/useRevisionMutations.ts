/**
 * ============================================================================
 * FILE: useRevisionMutations.ts
 * LOCATION: client/src/features/learning/useRevisionMutations.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Request-scoped revision writes with per-node/index pending and error state.
 *
 * ROLE IN PROJECT:
 *    Consumed by RevisionPage to record explicit reading review and quiz
 *    attempts. Quiz mutations never optimistically declare correctness, a topic
 *    pass, or revision completion: a saved attempt is patched into the revision
 *    cache immediately and every aggregate is reconciled by the server's own
 *    revision GET. Only an explicit review may optimistically change its own
 *    pending status, and it rolls back on failure.
 *
 * KEY COMPONENTS:
 *    - useRevisionMutations: markReviewed/submitAnswer with scoped request state
 *    - patchRevisionQuiz: Applies the server's saved attempt to the cache
 *    - Request registry: Token-guarded per-revision, per-node, per-index slots
 *
 * DEPENDENCIES:
 *    - External: react, @tanstack/react-query
 *    - Internal: @/lib/learningApi (markNodeReviewed, submitRevisionQuiz),
 *                @/types/learning, ./useRevisionSession, ./revisionQuizState
 *
 * USAGE:
 *    const { markReviewed, submitAnswer, quizRequestStates } =
 *      useRevisionMutations({ revisionId, onError, onQuizResult });
 * ============================================================================
 */

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markNodeReviewed, submitRevisionQuiz } from '@/lib/learningApi';
import type {
  RevisionNodeProgressWithDetails,
  RevisionQuizResponse,
  RevisionSessionWithProgress,
} from '@/types/learning';
import type {
  RevisionQuizRequestState,
  RevisionQuizRequestStates,
} from './revisionQuizState';
import { mergeRevisionNodeResults, patchRevisionQuiz, revisionQueryKeys } from './useRevisionSession';

/**
 * Immutable identity of one revision write.
 *
 * The revision ID comes from the request rather than the live route so a late
 * response always patches the cache it belongs to.
 */
interface RequestIdentity {
  revisionId: string;
  nodeId: string;
  token: number;
}

interface QuizRequest extends RequestIdentity {
  selectedOptionIds: string[];
  quizIndex: number;
}

/** Request slots keyed by revision ID, then `kind:nodeId:index`. */
type RequestRegistry = Record<
  string,
  Record<string, RevisionQuizRequestState & { token: number }>
>;

export interface UseRevisionMutationsProps {
  revisionId: string;
  onError?: (error: Error, context: string) => void;
  onQuizResult?: (
    nodeId: string,
    isCorrect: boolean,
    result: RevisionQuizResponse,
  ) => void;
}

export function useRevisionMutations({
  revisionId,
  onError,
  onQuizResult,
}: UseRevisionMutationsProps) {
  const queryClient = useQueryClient();
  const sequence = useRef(0);
  const [requests, setRequests] = useState<RequestRegistry>({});

  /**
   * Publish request state for one slot.
   *
   * The monotonic token prevents a slower earlier request from overwriting a
   * newer slot state that has already settled.
   */
  const setRequest = (
    request: RequestIdentity,
    slot: string,
    state: RevisionQuizRequestState,
  ) => {
    setRequests((previous) => {
      const byRevision = previous[request.revisionId] ?? {};
      if ((byRevision[slot]?.token ?? 0) > request.token) return previous;
      return {
        ...previous,
        [request.revisionId]: { ...byRevision, [slot]: { ...state, token: request.token } },
      };
    });
  };

  /**
   * Reconcile server-owned aggregates after a successful revision write.
   *
   * Only revision-scoped keys and dashboard/list metadata are invalidated; the
   * original session cache is never touched by revision activity.
   */
  const invalidate = (id: string) => {
    const session = queryClient.getQueryData<RevisionSessionWithProgress>(
      revisionQueryKeys.session(id),
    );
    void queryClient.invalidateQueries({
      queryKey: revisionQueryKeys.session(id),
      exact: true,
    });
    void queryClient.invalidateQueries({
      queryKey: revisionQueryKeys.summary(id),
      exact: true,
    });
    if (session) {
      void queryClient.invalidateQueries({
        queryKey: revisionQueryKeys.list(session.original_session_id),
        exact: true,
      });
    }
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
  };

  const submitQuizMutation = useMutation({
    mutationFn: async (request: QuizRequest) => {
      const result = await submitRevisionQuiz(
        request.revisionId,
        request.nodeId,
        request.selectedOptionIds,
        request.quizIndex,
      );
      if (
        result.revision_session_id !== request.revisionId ||
        result.node_id !== request.nodeId ||
        result.quiz_index !== request.quizIndex
      ) {
        throw new Error('Revision answer identity mismatch');
      }
      return result;
    },
    onMutate: (request) => {
      setRequest(request, `quiz:${request.nodeId}:${request.quizIndex}`, { isPending: true });
    },
    /**
     * Publish the saved attempt, then reconcile aggregates.
     *
     * An in-flight revision read is cancelled first so it cannot land after the
     * patch and erase this result. Feedback is patched immediately and never
     * waits on the aggregate refetch.
     */
    onSuccess: async (result, request) => {
      await queryClient.cancelQueries({
        queryKey: revisionQueryKeys.session(request.revisionId),
        exact: true,
      });
      queryClient.setQueryData<RevisionSessionWithProgress>(
        revisionQueryKeys.session(request.revisionId),
        (session) => (session ? patchRevisionQuiz(session, result) : session),
      );
      setRequest(request, `quiz:${request.nodeId}:${request.quizIndex}`, { isPending: false });
      onQuizResult?.(request.nodeId, result.is_correct, result);
      invalidate(request.revisionId);
    },
    onError: (error, request) => {
      setRequest(request, `quiz:${request.nodeId}:${request.quizIndex}`, {
        isPending: false,
        error: 'Could not save this answer. Please try again.',
      });
      onError?.(error as Error, 'submitRevisionQuiz');
    },
  });

  const markReviewedMutation = useMutation({
    mutationFn: async (request: RequestIdentity) => {
      const node = await markNodeReviewed(request.revisionId, request.nodeId);
      if (node.node_id !== request.nodeId) throw new Error('Revision review identity mismatch');
      return node;
    },
    /**
     * Optimistically mark only this node's reading status pending-complete.
     *
     * No review timestamp is invented, so header and TOC completion still read
     * `content_reviewed_at` and cannot claim reading is finished before the
     * server confirms it. Revision-level status and progress stay untouched.
     */
    onMutate: async (request) => {
      setRequest(request, `review:${request.nodeId}`, { isPending: true });
      const key = revisionQueryKeys.session(request.revisionId);
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const before = queryClient
        .getQueryData<RevisionSessionWithProgress>(key)
        ?.nodes.find((node) => node.node_id === request.nodeId);
      queryClient.setQueryData<RevisionSessionWithProgress>(key, (session) => {
        if (!session || session.mode !== 'full_review') return session;
        return {
          ...session,
          nodes: session.nodes.map((node) =>
            node.node_id === request.nodeId ? { ...node, status: 'reviewed' } : node,
          ),
        };
      });
      return { previousStatus: before?.status };
    },
    /**
     * Publish the reviewed node, then reconcile aggregates.
     *
     * Node results are merged rather than replaced so a quiz attempt that raced
     * this response is not erased by the slower review reply.
     */
    onSuccess: async (node: RevisionNodeProgressWithDetails, request) => {
      await queryClient.cancelQueries({
        queryKey: revisionQueryKeys.session(request.revisionId),
        exact: true,
      });
      queryClient.setQueryData<RevisionSessionWithProgress>(
        revisionQueryKeys.session(request.revisionId),
        (session) =>
          session
            ? {
                ...session,
                nodes: session.nodes.map((previous) =>
                  previous.node_id === request.nodeId
                    ? mergeRevisionNodeResults(
                        node,
                        previous,
                        request.revisionId,
                        session.mode,
                      )
                    : previous,
                ),
              }
            : session,
      );
      setRequest(request, `review:${request.nodeId}`, { isPending: false });
      invalidate(request.revisionId);
    },
    onError: (error, request, context) => {
      /**
       * Roll back this node's status field only.
       *
       * A concurrently saved quiz result on the same node must survive, and a
       * review that actually succeeded elsewhere must not be undone, so the
       * revert is skipped once the node carries a real review timestamp.
       */
      if (context?.previousStatus) {
        queryClient.setQueryData<RevisionSessionWithProgress>(
          revisionQueryKeys.session(request.revisionId),
          (session) =>
            session
              ? {
                  ...session,
                  nodes: session.nodes.map((node) =>
                    node.node_id === request.nodeId && node.content_reviewed_at === null
                      ? { ...node, status: context.previousStatus ?? 'pending' }
                      : node,
                  ),
                }
              : session,
        );
      }
      setRequest(request, `review:${request.nodeId}`, {
        isPending: false,
        error: 'Could not mark this topic as reviewed. Please try again.',
      });
      onError?.(error as Error, 'markReviewed');
    },
  });

  /**
   * Project the current revision's request slots into card-facing shapes.
   *
   * Slots from other revisions stay in the registry but are never surfaced, so
   * an old route's pending flag or error cannot reach the loaded revision.
   */
  const quizRequestStates: Record<string, RevisionQuizRequestStates> = {};
  const reviewRequestStates: Record<string, RevisionQuizRequestState> = {};
  for (const [slot, state] of Object.entries(requests[revisionId] ?? {})) {
    const [kind, nodeId, index] = slot.split(':');
    if (kind === 'review') reviewRequestStates[nodeId] = state;
    if (kind === 'quiz') {
      quizRequestStates[nodeId] = {
        ...quizRequestStates[nodeId],
        [Number(index)]: state,
      };
    }
  }

  const isSubmitting = Object.values(quizRequestStates).some((states) =>
    Object.values(states).some((state) => state?.isPending),
  );
  const isMarkingReviewed = Object.values(reviewRequestStates).some(
    (state) => state.isPending,
  );

  return {
    submitQuizMutation,
    markReviewedMutation,
    quizRequestStates,
    reviewRequestStates,
    submitAnswer: (nodeId: string, selectedOptionIds: string[], quizIndex = 0) =>
      submitQuizMutation.mutate({
        revisionId,
        nodeId,
        selectedOptionIds: [...selectedOptionIds],
        quizIndex,
        token: ++sequence.current,
      }),
    markReviewed: (nodeId: string) =>
      markReviewedMutation.mutate({ revisionId, nodeId, token: ++sequence.current }),
    isSubmitting,
    isMarkingReviewed,
    isAnyLoading: isSubmitting || isMarkingReviewed,
  };
}