/**
 * ============================================================================
 * FILE: RevisionHistoryList.test.tsx
 * LOCATION: client/src/features/learning/RevisionHistoryList.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify lazy revision history with authoritative completion and accuracy.
 * ROLE IN PROJECT:
 *    Prevents history presenting Practice completion as mastery or score passes.
 * KEY COMPONENTS:
 *    - QueryClient list harness: Mode, null accuracy and navigation tests
 * ============================================================================
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { RevisionListResponse } from '@/types/learning';
import { RevisionHistoryList } from './RevisionHistoryList';

const api = vi.hoisted(() => ({ getRevisionsList: vi.fn() }));

vi.mock('@/lib/learningApi', () => api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('lazy-loads mode completion and server attempt accuracy without an 80% pass rule', async () => {
  const data: RevisionListResponse = {
    total_count: 2,
    revisions: [
      { id: 'r', original_session_id: 's', revision_number: 2, mode: 'quiz_only', status: 'completed',
        progress_percent: 100, total_quiz_score_percent: 66, started_at: '2026-10-05T00:00:00Z',
        completed_at: '2026-10-05T00:01:00Z', notices: [] },
      { id: 'r0', original_session_id: 's', revision_number: 1, mode: 'full_review', status: 'in_progress',
        progress_percent: 50, total_quiz_score_percent: null, started_at: '2026-10-04T00:00:00Z',
        completed_at: null, notices: [] },
    ],
  };
  api.getRevisionsList.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigate = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <RevisionHistoryList sessionId="s" onViewRevision={navigate} />
    </QueryClientProvider>,
  );
  expect(api.getRevisionsList).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revision History' }));
  expect(await screen.findByText('Practice Quizzes')).toBeInTheDocument();
  expect(screen.getByText('100% practice finished')).toBeInTheDocument();
  expect(screen.getByText('50% reviewed')).toBeInTheDocument();
  expect(screen.getByText('66% attempt accuracy')).toBeInTheDocument();
  expect(screen.getByText('Attempt accuracy: N/A')).toBeInTheDocument();
  expect(screen.queryByText(/mastered|passed|failed/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByTestId('revision-row')[0]);
  expect(navigate).toHaveBeenCalledWith('r');
  expect(api.getRevisionsList).toHaveBeenCalledTimes(1);
  view.unmount();
  client.clear();
});