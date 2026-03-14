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
 *
 * DEPENDENCIES:
 *    - External: @tanstack/react-query
 *    - Internal: @/lib/learningApi (getRevisionSession)
 *
 * USAGE:
 *    const { data, isLoading } = useRevisionSession(revisionId);
 * ============================================================================
 */
// React Query hook for fetching revision session data with progress details

import { useQuery } from '@tanstack/react-query';
import { getRevisionSession } from '@/lib/learningApi';

/**
 * Query key factory for revision sessions.
 */
export const revisionQueryKeys = {
  session: (revisionId: string) => ['revision', revisionId] as const,
} as const;

/**
 * Hook to fetch a revision session with all node progress details.
 *
 * @param revisionId - The revision session ID to fetch
 * @returns React Query result containing RevisionSessionWithProgress
 */
export function useRevisionSession(revisionId: string) {
  return useQuery({
    queryKey: revisionQueryKeys.session(revisionId),
    queryFn: () => getRevisionSession(revisionId),
    enabled: !!revisionId,
    staleTime: 30_000,
  });
}
