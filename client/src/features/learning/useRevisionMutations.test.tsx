/**
 * ============================================================================
 * FILE: useRevisionMutations.test.tsx
 * LOCATION: client/src/features/learning/useRevisionMutations.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify request-scoped revision writes, cache patches, and failure recovery.
 * ROLE IN PROJECT:
 *    Exercises real QueryClient caches without providers or original writes.
 * KEY COMPONENTS:
 *    - deferred: Explicit response ordering
 *    - harness: Typed saved attempts and independent revision caches
 * ============================================================================
 */
import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RevisionQuizResponse, RevisionSessionWithProgress } from '@/types/learning';
import { useRevisionMutations } from './useRevisionMutations';
import { revisionQueryKeys } from './useRevisionSession';

const api = vi.hoisted(() => ({ markNodeReviewed: vi.fn(), submitRevisionQuiz: vi.fn(), getRevisionSession: vi.fn() }));

vi.mock('@/lib/learningApi', () => api);

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('uninitialized resolve'); };
  let reject: (error: Error) => void = () => { throw new Error('uninitialized reject'); };
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function revision(id = 'r'): RevisionSessionWithProgress {
  return {
    id, original_session_id: 's', revision_number: 1, mode: 'quiz_only',
    status: 'in_progress', progress_percent: 0, total_quiz_score_percent: null,
    started_at: '2026-10-05T00:00:00Z', completed_at: null, notices: [],
    nodes: [{ id: `${id}-n`, node_id: 'n', node_title: 'Topic', sequence_index: 0,
      status: 'pending', reviewed_at: null, content_reviewed_at: null, quiz_count: 2, quiz_results: [] }],
  };
}

function attempt(overrides: Partial<RevisionQuizResponse> = {}): RevisionQuizResponse {
  return { id: 'a', revision_session_id: 'r', node_id: 'n', quiz_index: 0,
    attempt_number: 9, quiz_attempt_count: 1, selected_option_ids: ['b'],
    is_correct: false, score_percent: 0, correct_option_ids: [], explanation: '',
    selected_explanation: 'B explanation', created_at: '2026-10-05T00:01:00Z',
    revision_node_status: 'pending', ...overrides };
}

const clients: QueryClient[] = [];

function harness(id = 'r') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(revisionQueryKeys.session(id), revision(id));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ revisionId }) => useRevisionMutations({ revisionId }), {
    wrapper, initialProps: { revisionId: id },
  });
  return { client, ...hook };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

it('patches only a saved quiz before aggregate refetch and never assumes a pass', async () => {
  const pending = deferred<RevisionQuizResponse>();
  api.submitRevisionQuiz.mockReturnValue(pending.promise);
  const { client, result } = harness();
  const original = { marker: 'unchanged' };
  client.setQueryData(['learningSession', 's'], original);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  act(() => result.current.submitAnswer('n', ['b'], 0));
  await waitFor(() => expect(result.current.quizRequestStates.n?.[0]?.isPending).toBe(true));
  expect(client.getQueryData(revisionQueryKeys.session('r'))).toEqual(revision());
  await act(async () => pending.resolve(attempt()));
  await waitFor(() => expect(result.current.quizRequestStates.n?.[0]?.isPending).toBe(false));
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'))?.nodes[0].quiz_results).toEqual([
    expect.objectContaining({ id: 'a', quiz_index: 0, is_correct: false, quiz_attempt_count: 1 }),
  ]);
  expect(client.getQueryData(['learningSession', 's'])).toBe(original);
  expect(client.getQueryState(['learningSession', 's'])?.isInvalidated).toBe(false);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['revision-summary', 'r'], exact: true });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['revisions', 's'], exact: true });
});

it('keeps saved results on failed retry and clears only its request pending flag', async () => {
  const saved = revision(); saved.nodes[0].quiz_results = [attempt()];
  const { client, result } = harness();
  client.setQueryData(revisionQueryKeys.session('r'), saved);
  api.submitRevisionQuiz.mockRejectedValue(new Error('offline'));
  act(() => result.current.submitAnswer('n', ['b'], 0));
  await waitFor(() => expect(result.current.quizRequestStates.n?.[0]?.error).toBe('Could not save this answer. Please try again.'));
  expect(result.current.quizRequestStates.n?.[0]?.isPending).toBe(false);
  expect(client.getQueryData(revisionQueryKeys.session('r'))).toEqual(saved);
});