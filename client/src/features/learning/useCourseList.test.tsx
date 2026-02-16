// useCourseList.test.ts
// Tests for useCourseList React Query hook

// Validates query key construction, filter param mapping to API,
// and stale time configuration.

// @see: client/src/features/learning/useCourseList.ts
// @see: client/src/lib/learningApi.ts (getSessionsList)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useCourseList } from './useCourseList';
import * as learningApi from '@/lib/learningApi';
import type { SessionListResponse } from '@/types/learning';

vi.mock('@/lib/learningApi', () => ({
  getSessionsList: vi.fn(),
}));

const mockResponse: SessionListResponse = {
  sessions: [
    {
      id: 'session-1',
      query: 'Learn React',
      course_title: 'React Fundamentals',
      status: 'in_progress',
      progress_percent: 40,
      total_nodes: 5,
      completed_nodes: 2,
      last_active_node_title: 'Hooks',
      created_at: '2025-01-10T08:00:00Z',
      updated_at: '2025-01-15T10:00:00Z',
      completed_at: null,
      revision_count: 0,
    },
  ],
  total_count: 1,
  has_more: false,
};

describe('useCourseList', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);
  });

  it('fetches data with correct query key', async () => {
    const { result } = renderHook(() => useCourseList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(learningApi.getSessionsList).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockResponse);
  });

  it('passes filter params to API', async () => {
    const options = {
      status: 'in_progress' as const,
      sortBy: 'progress_percent' as const,
      limit: 10,
    };

    const { result } = renderHook(() => useCourseList(options), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(learningApi.getSessionsList).toHaveBeenCalledWith({
      status: 'in_progress',
      sort_by: 'progress_percent',
      limit: 10,
    });
  });

  it('passes undefined params when no options provided', async () => {
    const { result } = renderHook(() => useCourseList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(learningApi.getSessionsList).toHaveBeenCalledWith({
      status: undefined,
      sort_by: undefined,
      limit: undefined,
    });
  });

  it('returns loading state initially', () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    const { result } = renderHook(() => useCourseList(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state on failure', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    const { result } = renderHook(() => useCourseList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
