/**
 * ============================================================================
 * FILE: CourseCard.test.tsx
 * LOCATION: client/src/features/learning/CourseCard.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the CourseCard component covering all states and interactions.
 *
 * ROLE IN PROJECT:
 *    Validates in-progress and completed card states, progress bar rendering,
 *    action button callbacks, revision history visibility, and accessibility.
 *
 * KEY COMPONENTS:
 *    - CourseCard tests: state rendering, button callbacks, aria attributes
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query
 *    - Internal: ./CourseCard, @/types/learning, @/lib/learningApi
 *
 * USAGE:
 *    npm run test -- src/features/learning/CourseCard.test.tsx
 * ============================================================================
 */
// CourseCard.test.tsx
// Tests for CourseCard component rendering and interactions

// Validates both in-progress and completed states, action button callbacks,
// progress bar width, revision history section visibility, and last active
// node display.

// @see: client/src/features/learning/CourseCard.tsx
// @see: client/src/features/learning/RevisionHistoryList.tsx
// @see: client/src/types/learning.ts (LearningSessionSummary)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { CourseCard } from './CourseCard';
import type { LearningSessionSummary } from '@/types/learning';

// Mock learningApi for RevisionHistoryList lazy loading
vi.mock('@/lib/learningApi', () => ({
  getRevisionsList: vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    article: ({ children, ...props }: Record<string, unknown>) => {
      const filtered: Record<string, unknown> = {};
      const motionKeys = ['variants', 'initial', 'animate', 'exit', 'custom',
        'transition', 'whileHover', 'whileTap', 'layout'];
      for (const [key, value] of Object.entries(props)) {
        if (!motionKeys.includes(key)) {
          filtered[key] = value;
        }
      }
      return <article {...filtered}>{children as ReactNode}</article>;
    },
    div: ({ children, ...props }: Record<string, unknown>) => {
      const filtered: Record<string, unknown> = {};
      const motionKeys = ['variants', 'initial', 'animate', 'exit', 'custom',
        'transition', 'whileHover', 'whileTap', 'layout'];
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

const mockInProgressSession: LearningSessionSummary = {
  id: 'session-1',
  query: 'Explain quantum computing basics',
  course_title: 'Quantum Computing Fundamentals',
  status: 'in_progress',
  progress_percent: 60,
  total_nodes: 5,
  completed_nodes: 3,
  last_active_node_title: "Newton's Third Law",
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-20T14:30:00Z',
  completed_at: null,
  revision_count: 0,
};

const mockCompletedSession: LearningSessionSummary = {
  id: 'session-2',
  query: 'Learn about machine learning algorithms',
  course_title: 'Machine Learning Essentials',
  status: 'completed',
  progress_percent: 100,
  total_nodes: 4,
  completed_nodes: 4,
  last_active_node_title: null,
  created_at: '2025-01-10T08:00:00Z',
  updated_at: '2025-01-18T16:00:00Z',
  completed_at: '2025-01-18T16:00:00Z',
  revision_count: 2,
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

describe('CourseCard', () => {
  const defaultOnResume = vi.fn();
  const defaultOnRevise = vi.fn();
  const defaultOnViewRevision = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders in-progress state with progress bar at correct width', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Quantum Computing Fundamentals')).toBeInTheDocument();
    expect(screen.getByText('3/5 topics completed')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();

    const progressFill = screen.getByTestId('progress-bar-fill');
    expect(progressFill).toHaveStyle({ width: '60%' });
  });

  it('renders completed state with green badge', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Machine Learning Essentials')).toBeInTheDocument();
    expect(screen.getByTestId('completed-badge')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('"Resume Course" button calls onResume with sessionId', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByText('Resume Course'));
    expect(defaultOnResume).toHaveBeenCalledWith('session-1');
    expect(defaultOnResume).toHaveBeenCalledTimes(1);
  });

  it('"Revise Course" calls onRevise with full_review', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByText('Revise Course'));
    expect(defaultOnRevise).toHaveBeenCalledWith('session-2', 'full_review');
    expect(defaultOnRevise).toHaveBeenCalledTimes(1);
  });

  it('"Practice Quizzes" calls onRevise with quiz_only', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByText('Practice Quizzes'));
    expect(defaultOnRevise).toHaveBeenCalledWith('session-2', 'quiz_only');
    expect(defaultOnRevise).toHaveBeenCalledTimes(1);
  });

  it('progress bar shows correct percentage text', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('3/5 topics completed')).toBeInTheDocument();
  });

  it('revision history section hidden when revision_count is 0', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByTestId('revision-history-section')).not.toBeInTheDocument();
  });

  it('revision history section shown when revision_count > 0', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('revision-history-section')).toBeInTheDocument();
    expect(screen.getByText('Revision History')).toBeInTheDocument();
  });

  it('revision history section hidden when onViewRevision is not provided', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByTestId('revision-history-section')).not.toBeInTheDocument();
  });

  it('revision history is expandable when revision_count > 0', async () => {
    (api.getRevisionsList as ReturnType<typeof vi.fn>).mockResolvedValue({
      revisions: [
        {
          id: 'rev-1',
          original_session_id: 'session-2',
          revision_number: 1,
          mode: 'full_review',
          status: 'completed',
          progress_percent: 100,
          total_quiz_score_percent: 85,
          started_at: '2025-02-10T10:00:00Z',
          completed_at: '2025-02-10T10:30:00Z',
        },
      ],
      total_count: 1,
    });

    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
        onViewRevision={defaultOnViewRevision}
      />,
      { wrapper: createWrapper() }
    );

    // Toggle should be collapsed
    const toggle = screen.getByTestId('revision-history-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Should fetch revisions
    await waitFor(() => {
      expect(api.getRevisionsList).toHaveBeenCalledWith('session-2');
    });

    // Should show revision row
    await waitFor(() => {
      expect(screen.getByTestId('revision-row')).toBeInTheDocument();
    });
  });

  it('last active node title shown for in-progress', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Newton's Third Law")).toBeInTheDocument();
    expect(screen.getByText('Last active:')).toBeInTheDocument();
  });

  it('last active node title hidden for completed sessions', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText('Last active:')).not.toBeInTheDocument();
  });

  it('does not show "Resume Course" for completed sessions', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText('Resume Course')).not.toBeInTheDocument();
  });

  it('does not show "Revise Course" for in-progress sessions', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText('Revise Course')).not.toBeInTheDocument();
    expect(screen.queryByText('Practice Quizzes')).not.toBeInTheDocument();
  });

  it('has accessible progress bar with aria attributes', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />,
      { wrapper: createWrapper() }
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '60');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });
});
