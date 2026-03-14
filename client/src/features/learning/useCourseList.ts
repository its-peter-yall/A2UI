/**
 * ============================================================================
 * FILE: useCourseList.ts
 * LOCATION: client/src/features/learning/useCourseList.ts
 * ============================================================================
 *
 * PURPOSE:
 *    React Query hook for fetching the paginated list of learning sessions.
 *
 * ROLE IN PROJECT:
 *    Primary data hook for the course dashboard. Wraps getSessionsList with
 *    configurable filtering and sorting, maps camelCase options to snake_case
 *    API params, and includes retry logic for backend startup delays.
 *
 * KEY COMPONENTS:
 *    - useCourseList: Hook returning query result with data, isLoading, isError
 *    - UseCourseListOptions: Interface for status filter, sortBy, limit, offset
 *
 * DEPENDENCIES:
 *    - External: @tanstack/react-query
 *    - Internal: @/lib/learningApi (getSessionsList)
 *
 * USAGE:
 *    const { data, isLoading, isError } = useCourseList({ status: 'in_progress' });
 * ============================================================================
 */
// useCourseList.ts
// React Query hook for fetching the list of learning sessions (courses)

// Provides a typed hook wrapping the getSessionsList API call with
// configurable filtering, sorting, and caching. Used by the course
// dashboard to display the user's learning sessions.
//
// - Accepts optional status filter, sort field, and limit
// - Maps camelCase options to snake_case API params
// - Uses 30-second stale time for responsive dashboard updates

// @see: client/src/lib/learningApi.ts (getSessionsList)
// @see: client/src/types/learning.ts (SessionListResponse)
// @note: queryKey includes options so filters trigger refetch

import { useQuery } from '@tanstack/react-query';

import { getSessionsList } from '@/lib/learningApi';

export interface UseCourseListOptions {
  status?: 'all' | 'in_progress' | 'completed';
  sortBy?: 'updated_at' | 'created_at' | 'progress_percent';
  limit?: number;
  offset?: number;
}

export function useCourseList(options?: UseCourseListOptions) {
  return useQuery({
    queryKey: ['courses', options],
    queryFn: () =>
      getSessionsList({
        status: options?.status,
        sort_by: options?.sortBy,
        limit: options?.limit,
        offset: options?.offset,
      }),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      // Retry network errors (backend not ready) up to 5 times
      const isNetworkError = 
        error instanceof Error && 
        (error.message.includes('Network Error') || error.message.includes('ECONNREFUSED'));
      return isNetworkError && failureCount < 5;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000), // 1s, 2s, 4s, 8s, 8s
    refetchInterval: (query) => {
      // After retries exhausted, poll every 3s for up to 30s total
      if (query.state.status === 'error' && query.state.fetchFailureCount >= 5) {
        const errorDuration = Date.now() - (query.state.errorUpdatedAt ?? 0);
        return errorDuration < 30_000 ? 3000 : false;
      }
      return false;
    },
  });
}
