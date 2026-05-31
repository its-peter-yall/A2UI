/**
 * ============================================================================
 * FILE: RevisionHistoryList.test.tsx
 * LOCATION: client/src/features/learning/RevisionHistoryList.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests for RevisionHistoryList component rendering and interactions.
 *
 * ROLE IN PROJECT:
 *    Verifies the expandable revision history panel behaves correctly:
 *    lazy-loads data only when expanded, sorts revisions by date descending,
 *    and fires the correct callback when a row is clicked.
 *
 * KEY COMPONENTS:
 *    - Collapsed/expanded toggle behavior
 *    - Lazy fetch (data not loaded until expanded)
 *    - Row rendering: number, date, mode badge, score
 *    - Empty state and loading state
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query
 *    - Internal: ./RevisionHistoryList, @/lib/learningApi, @/types/learning
 *
 * USAGE:
 *    npm run test -- RevisionHistoryList.test.tsx
 * ============================================================================
 */
// RevisionHistoryList.test.tsx
// Tests for RevisionHistoryList component rendering and interactions

// Validates expandable behavior, lazy data loading, revision row display
// (number, date, mode, score), click callback, empty state, and loading state.

// @see: RevisionHistoryList.tsx
// @see: client/src/types/learning.ts (RevisionListResponse)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { RevisionListResponse, RevisionSessionResponse } from '@/types/learning';

// Mock learningApi
vi.mock('@/lib/learningApi', () => ({
  getRevisionsList: vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const filtered: Record<string, unknown> = {};
      const motionKeys = ['variants', 'initial', 'animate', 'exit', 'custom', 'transition'];
      for (const [key, value] of Object.entries(props)) {
        if (!motionKeys.includes(key)) {
          filtered[key] = value;
        }
      }
      return <div {...filtered}>{children as ReactNode}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import * as api from '@/lib/learningApi';
import { RevisionHistoryList } from './RevisionHistoryList';

function createMockRevision(
  overrides: Partial<RevisionSessionResponse> = {}
): RevisionSessionResponse {
  return {
    id: 'rev-1',
    original_session_id: 'session-1',
    revision_number: 1,
    mode: 'full_review',
    status: 'completed',
    progress_percent: 100,
    total_quiz_score_percent: 85,
    started_at: '2025-02-14T10:00:00Z',
    completed_at: '2025-02-14T10:30:00Z',
    ...overrides,
  };
}

const mockRevisionsResponse: RevisionListResponse = {
  revisions: [
    createMockRevision({
      id: 'rev-1',
      revision_number: 1,
      mode: 'full_review',
      total_quiz_score_percent: 70,
      started_at: '2025-02-10T10:00:00Z',
    }),
    createMockRevision({
      id: 'rev-2',
      revision_number: 2,
      mode: 'quiz_only',
      total_quiz_score_percent: 90,
      started_at: '2025-02-14T10:00:00Z',
    }),
    createMockRevision({
      id: 'rev-3',
      revision_number: 3,
      mode: 'full_review',
      total_quiz_score_percent: 100,
      started_at: '2025-02-12T10:00:00Z',
    }),
  ],
  total_count: 3,
};

const emptyRevisionsResponse: RevisionListResponse = {
  revisions: [],
  total_count: 0,
};

function createWrapper() {
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
}

describe('RevisionHistoryList', () => {
  const defaultOnViewRevision = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders collapsed by default with toggle button', () => {
    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    const toggle = screen.getByTestId('revision-history-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Revision History')).toBeInTheDocument();
    expect(screen.queryByTestId('revision-history-content')).not.toBeInTheDocument();
  });

  it('does not fetch data when collapsed', () => {
    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    expect(api.getRevisionsList).not.toHaveBeenCalled();
  });

  it('expands on toggle click and fetches data', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue(mockRevisionsResponse);

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId('revision-history-toggle'));

    expect(screen.getByTestId('revision-history-toggle')).toHaveAttribute('aria-expanded', 'true');

    await waitFor(() => {
      expect(api.getRevisionsList).toHaveBeenCalledWith('session-1');
    });
  });

  it('renders all revisions sorted by date descending', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue(mockRevisionsResponse);

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId('revision-history-toggle'));

    await waitFor(() => {
      const rows = screen.getAllByTestId('revision-row');
      expect(rows).toHaveLength(3);
    });

    // Most recent first: rev-2 (Feb 14), rev-3 (Feb 12), rev-1 (Feb 10)
    const rows = screen.getAllByTestId('revision-row');
    expect(rows[0]).toHaveAttribute('data-revision-id', 'rev-2');
    expect(rows[1]).toHaveAttribute('data-revision-id', 'rev-3');
    expect(rows[2]).toHaveAttribute('data-revision-id', 'rev-1');
  });

  it('shows correct mode badge per revision', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue(mockRevisionsResponse);

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId('revision-history-toggle'));

    await waitFor(() => {
      const badges = screen.getAllByTestId('revision-mode-badge');
      expect(badges).toHaveLength(3);
    });

    const badges = screen.getAllByTestId('revision-mode-badge');
    // First row is rev-2 (quiz_only), second is rev-3 (full_review), third is rev-1 (full_review)
    expect(badges[0]).toHaveTextContent('Quiz Only');
    expect(badges[1]).toHaveTextContent('Full Review');
    expect(badges[2]).toHaveTextContent('Full Review');
  });

  it('shows correct score for each revision', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue(mockRevisionsResponse);

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId('revision-history-toggle'));

    await waitFor(() => {
      const scores = screen.getAllByTestId('revision-score');
      expect(scores).toHaveLength(3);
    });

    const scores = screen.getAllByTestId('revision-score');
    // Most recent first: rev-2=90%, rev-3=100%, rev-1=70%
    expect(scores[0]).toHaveTextContent('90%');
    expect(scores[1]).toHaveTextContent('100%');
    expect(scores[2]).toHaveTextContent('70%');
  });

  it('clicking a revision row fires onViewRevision with correct id', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue(mockRevisionsResponse);

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId('revision-history-toggle'));

    await waitFor(() => {
      expect(screen.getAllByTestId('revision-row')).toHaveLength(3);
    });

    // Click the first row (rev-2, most recent)
    fireEvent.click(screen.getAllByTestId('revision-row')[0]);
    expect(defaultOnViewRevision).toHaveBeenCalledWith('rev-2');
    expect(defaultOnViewRevision).toHaveBeenCalledTimes(1);
  });

  it('shows "No revisions yet" when list is empty', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue(emptyRevisionsResponse);

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId('revision-history-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('revision-history-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('No revisions yet')).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId('revision-history-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('revision-history-loading')).toBeInTheDocument();
    });

    expect(screen.getByText('Loading revisions...')).toBeInTheDocument();
  });

  it('collapses when toggle is clicked again', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue(mockRevisionsResponse);

    render(
      <RevisionHistoryList
        sessionId="session-1"
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    const toggle = screen.getByTestId('revision-history-toggle');

    // Expand
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getAllByTestId('revision-row')).toHaveLength(3);
    });

    // Collapse
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
