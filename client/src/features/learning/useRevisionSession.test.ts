/**
 * ============================================================================
 * FILE: useRevisionSession.test.ts
 * LOCATION: client/src/features/learning/useRevisionSession.test.ts
 * ============================================================================
 * PURPOSE:
 *    Verify batched revision queries, scoped keys, and authoritative projections.
 * ROLE IN PROJECT:
 *    Guards revision restoration without per-node queries or original mutations.
 * KEY COMPONENTS:
 *    - QueryClient hook harness: Deterministic revision transport
 * ============================================================================
 */
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { revisionQueryKeys, useRevisionSession, mergeRevisionNodeResults, patchRevisionQuiz } from './useRevisionSession';
import type { RevisionQuizResponse, RevisionSessionWithProgress } from '@/types/learning';

const api = vi.hoisted(() => ({ getRevisionSession: vi.fn() }));

vi.mock('@/lib/learningApi', () => api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('uses stable revision summary and list keys without fetching an empty ID', async () => {
  expect(revisionQueryKeys.session('r')).toEqual(['revision', 'r']);
  expect(revisionQueryKeys.summary('r')).toEqual(['revision-summary', 'r']);
  expect(revisionQueryKeys.list('s')).toEqual(['revisions', 's']);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(({ id }) => useRevisionSession(id), {
    wrapper, initialProps: { id: '' },
  });
  expect(api.getRevisionSession).not.toHaveBeenCalled();
  const restored: RevisionSessionWithProgress = {
    id: 'r', original_session_id: 's', revision_number: 1, mode: 'quiz_only',
    status: 'in_progress', progress_percent: 0, total_quiz_score_percent: null,
    started_at: '2026-10-05T00:00:00Z', completed_at: null, notices: [], nodes: [],
  };
  api.getRevisionSession.mockResolvedValue(restored);
  hook.rerender({ id: 'r' });
  await waitFor(() => expect(hook.result.current.data).toEqual(restored));
  expect(api.getRevisionSession).toHaveBeenCalledTimes(1);
  expect(api.getRevisionSession).toHaveBeenCalledWith('r', expect.any(AbortSignal));
  hook.unmount();
  client.clear();
});

it('merges latest sequence/ID deterministically without losing saved feedback', () => {
  const result: RevisionQuizResponse = {
    id: 'z', revision_session_id: 'r', node_id: 'n', quiz_index: 0,
    attempt_number: 9, quiz_attempt_count: 3, selected_option_ids: ['b'],
    is_correct: false, score_percent: 0, correct_option_ids: [], explanation: '',
    selected_explanation: 'B', created_at: '2026-10-05T00:01:00Z', revision_node_status: 'pending',
  };
  const session: RevisionSessionWithProgress = {
    id: 'r', original_session_id: 's', revision_number: 1, mode: 'quiz_only',
    status: 'in_progress', progress_percent: 0, total_quiz_score_percent: 66,
    started_at: '2026-10-05T00:00:00Z', completed_at: null, notices: [],
    nodes: [{ id: 'p', node_id: 'n', node_title: 'N', sequence_index: 0,
      status: 'pending', reviewed_at: null, content_reviewed_at: null, quiz_count: 2, quiz_results: [] }],
  };
  const cached = patchRevisionQuiz(session, result);
  const incoming = { ...session.nodes[0], quiz_results: [{ ...result, id: 'a', attempt_number: 8 }] };
  expect(mergeRevisionNodeResults(incoming, cached.nodes[0], 'r').quiz_results[0].id).toBe('z');
  expect(patchRevisionQuiz(cached, { ...result, id: 'a' }).nodes[0].quiz_results[0].id).toBe('z');
  expect(patchRevisionQuiz(cached, { ...result, revision_session_id: 'other' })).toBe(cached);
});