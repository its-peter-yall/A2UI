/**
 * ============================================================================
 * FILE: useRevisionSession.ts
 * LOCATION: client/src/features/learning/useRevisionSession.ts
 * ============================================================================
 *
 * PURPOSE:
 *    React Query hook for fetching a revision session with node progress details.
 *
 * ROLE IN PROJECT:
 *    Provides data-fetching logic for the RevisionPage, abstracting the React
 *    Query configuration needed to load a revision session and its per-node
 *    progress state. Keeps query keys consistent via the exported factory.
 *
 * KEY COMPONENTS:
 *    - revisionQueryKeys: Query key factory for revision session cache entries
 *    - useRevisionSession: Hook returning a React Query result for a given revisionId
 *    - patchRevisionQuiz: Applies one saved attempt to the revision cache
 *    - getRevisionCompletion: Mode-aware completion projection over membership
 *
 * DEPENDENCIES:
 *    - External: @tanstack/react-query
 *    - Internal: @/lib/learningApi (getRevisionSession), @/types/learning
 *
 * USAGE:
 *    const { data, isLoading } = useRevisionSession(revisionId);
 * ============================================================================
 */
// React Query hook for fetching revision session data with progress details

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRevisionSession } from '@/lib/learningApi';
import type {
  RevisionMode,
  RevisionNodeProgressWithDetails,
  RevisionNodeStatus,
  RevisionQuizAttemptResult,
  RevisionQuizResponse,
  RevisionSessionWithProgress,
} from '@/types/learning';

/**
 * Query key factory for revision sessions, summaries, and per-session lists.
 */
export const revisionQueryKeys = {
  session: (revisionId: string) => ['revision', revisionId] as const,
  summary: (revisionId: string) => ['revision-summary', revisionId] as const,
  list: (sessionId: string) => ['revisions', sessionId] as const,
} as const;

/**
 * Hook to fetch a revision session with all node progress details.
 *
 * @param revisionId - The revision session ID to fetch
 * @returns React Query result containing RevisionSessionWithProgress
 */
export function useRevisionSession(revisionId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: revisionQueryKeys.session(revisionId),
    queryFn: async ({ signal }) => {
      const incoming = await getRevisionSession(revisionId, signal);
      if (incoming.id !== revisionId) throw new Error('Revision identity mismatch');
      const cached = queryClient.getQueryData<RevisionSessionWithProgress>(
        revisionQueryKeys.session(revisionId),
      );
      return {
        ...incoming,
        nodes: incoming.nodes.map((node) =>
          mergeRevisionNodeResults(
            node,
            cached?.nodes.find((previous) => previous.node_id === node.node_id),
            revisionId,
            incoming.mode,
          ),
        ),
      };
    },
    enabled: !!revisionId,
    staleTime: 30_000,
  });
}

/**
 * Compare two saved attempts of the same quiz for the same node.
 *
 * Ordering uses the stored attempt sequence first, then the attempt ID as a
 * deterministic tie-breaker so late or duplicated responses cannot regress a
 * newer saved attempt.
 */
export function isNewerRevisionAttempt(
  next: RevisionQuizAttemptResult,
  previous: RevisionQuizAttemptResult,
): boolean {
  return (
    next.attempt_number > previous.attempt_number ||
    (next.attempt_number === previous.attempt_number && next.id > previous.id)
  );
}

/**
 * Project a submitted attempt response into the stored attempt shape.
 *
 * The response carries a mode-aware aggregate `revision_node_status` that
 * restored attempts deliberately omit, so the cached row is constructed
 * explicitly rather than by spreading the response.
 */
function toSavedAttempt(result: RevisionQuizResponse): RevisionQuizAttemptResult {
  return {
    id: result.id,
    revision_session_id: result.revision_session_id,
    node_id: result.node_id,
    quiz_index: result.quiz_index,
    attempt_number: result.attempt_number,
    quiz_attempt_count: result.quiz_attempt_count,
    selected_option_ids: result.selected_option_ids,
    is_correct: result.is_correct,
    score_percent: result.score_percent,
    correct_option_ids: result.correct_option_ids,
    explanation: result.explanation,
    selected_explanation: result.selected_explanation,
    created_at: result.created_at,
  };
}

/**
 * Derive a node's mode-specific status from its own saved attempts.
 *
 * Full Review completion comes only from the explicit review timestamp, so a
 * quiz submission can never complete or undo reading. Practice completion is
 * submission coverage over the topic's available quizzes.
 */
function deriveNodeStatus(
  session: RevisionSessionWithProgress,
  node: RevisionSessionWithProgress['nodes'][number],
  quizResults: RevisionQuizAttemptResult[],
): RevisionNodeStatus {
  if (session.mode === 'full_review') {
    return node.content_reviewed_at !== null ? 'reviewed' : 'pending';
  }
  if (quizResults.length < node.quiz_count) return 'pending';
  return quizResults.every((row) => row.is_correct) ? 'quiz_passed' : 'quiz_failed';
}

/**
 * Apply one successful quiz result to a cached revision session.
 *
 * Correctness, topic status, and coverage all derive from the server's saved
 * attempt; nothing is assumed before the response arrives. Results addressed to
 * another revision, unknown node, or out-of-range quiz index are ignored.
 */
export function patchRevisionQuiz(
  session: RevisionSessionWithProgress,
  result: RevisionQuizResponse,
): RevisionSessionWithProgress {
  if (session.id !== result.revision_session_id) return session;
  const saved = toSavedAttempt(result);
  return {
    ...session,
    nodes: session.nodes.map((node) => {
      if (
        node.node_id !== result.node_id ||
        result.quiz_index < 0 ||
        result.quiz_index >= node.quiz_count
      ) {
        return node;
      }
      const previous = node.quiz_results.find(
        (row) => row.quiz_index === result.quiz_index,
      );
      if (previous && !isNewerRevisionAttempt(saved, previous)) return node;
      const quiz_results = [
        ...node.quiz_results.filter((row) => row.quiz_index !== saved.quiz_index),
        saved,
      ].sort((a, b) => a.quiz_index - b.quiz_index);
      return { ...node, quiz_results, status: deriveNodeStatus(session, node, quiz_results) };
    }),
  };
}

/**
 * Merge an incoming node projection with a newer already-cached one.
 *
 * A revision GET refetch triggered by a write can be assembled before that
 * write's attempt is committed, so its rows are merged with the cache rather
 * than replacing them. Rows are restricted to this revision, this node, and
 * available quiz indices, so incompatible historical attempts are retained on
 * the server but never projected into feedback, coverage, or accuracy.
 *
 * The node's own status is recomputed from the merged rows so Practice coverage
 * survives a stale read, while the revision's aggregate score, progress, and
 * timestamps stay authoritative.
 */
export function mergeRevisionNodeResults(
  incoming: RevisionNodeProgressWithDetails,
  cached: RevisionNodeProgressWithDetails | undefined,
  id: string,
  mode?: RevisionMode,
): RevisionNodeProgressWithDetails {
  const rows = new Map<number, RevisionQuizAttemptResult>();
  for (const row of [...incoming.quiz_results, ...(cached?.quiz_results ?? [])]) {
    if (
      row.revision_session_id !== id ||
      row.node_id !== incoming.node_id ||
      row.quiz_index >= incoming.quiz_count
    ) {
      continue;
    }
    const existing = rows.get(row.quiz_index);
    if (!existing || isNewerRevisionAttempt(row, existing)) rows.set(row.quiz_index, row);
  }
  const quiz_results = [...rows.values()].sort((a, b) => a.quiz_index - b.quiz_index);
  const status: RevisionNodeStatus =
    mode === 'quiz_only' && incoming.quiz_count > 0
      ? quiz_results.length < incoming.quiz_count
        ? 'pending'
        : quiz_results.every((row) => row.is_correct)
          ? 'quiz_passed'
          : 'quiz_failed'
      : mode === 'full_review'
        ? incoming.content_reviewed_at !== null
          ? 'reviewed'
          : 'pending'
        : incoming.status;
  return { ...incoming, quiz_results, status };
}

/**
 * Project mode-specific completion over the revision's participating topics.
 *
 * Practice excludes quizless topics from the denominator entirely, so an
 * empty denominator reports no completion rather than a full one.
 */
export function getRevisionCompletion(session: RevisionSessionWithProgress): {
  total: number;
  completed: number;
} {
  const participating = session.nodes.filter(
    (node) => session.mode === 'full_review' || node.quiz_count > 0,
  );
  const completed = participating.filter((node) =>
    session.mode === 'full_review'
      ? node.content_reviewed_at !== null
      : node.quiz_results.length === node.quiz_count,
  ).length;
  return { total: participating.length, completed };
}
