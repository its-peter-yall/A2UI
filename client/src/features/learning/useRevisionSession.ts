// useRevisionSession.ts
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
