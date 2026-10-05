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
import { revisionQueryKeys, useRevisionSession } from './useRevisionSession';
import type { RevisionSessionWithProgress } from '@/types/learning';

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