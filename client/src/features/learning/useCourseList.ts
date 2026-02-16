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
  });
}
