// CourseCard.test.tsx
// Tests for CourseCard component rendering and interactions

// Validates both in-progress and completed states, action button callbacks,
// progress bar width, revision badge visibility, and last active node display.

// @see: client/src/features/learning/CourseCard.tsx
// @see: client/src/types/learning.ts (LearningSessionSummary)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CourseCard } from './CourseCard';
import type { LearningSessionSummary } from '@/types/learning';

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

describe('CourseCard', () => {
  const defaultOnResume = vi.fn();
  const defaultOnRevise = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders in-progress state with progress bar at correct width', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />
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
      />
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
      />
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
      />
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
      />
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
      />
    );

    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('3/5 topics completed')).toBeInTheDocument();
  });

  it('revision count badge hidden when 0', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />
    );

    expect(screen.queryByTestId('revision-badge')).not.toBeInTheDocument();
  });

  it('revision count badge shown when > 0', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />
    );

    expect(screen.getByTestId('revision-badge')).toBeInTheDocument();
    expect(screen.getByText('Revised 2 times')).toBeInTheDocument();
  });

  it('shows singular "time" when revision_count is 1', () => {
    const sessionWithOneRevision: LearningSessionSummary = {
      ...mockCompletedSession,
      revision_count: 1,
    };

    render(
      <CourseCard
        session={sessionWithOneRevision}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />
    );

    expect(screen.getByText('Revised 1 time')).toBeInTheDocument();
  });

  it('last active node title shown for in-progress', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />
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
      />
    );

    expect(screen.queryByText('Last active:')).not.toBeInTheDocument();
  });

  it('does not show "Resume Course" for completed sessions', () => {
    render(
      <CourseCard
        session={mockCompletedSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />
    );

    expect(screen.queryByText('Resume Course')).not.toBeInTheDocument();
  });

  it('does not show "Revise Course" for in-progress sessions', () => {
    render(
      <CourseCard
        session={mockInProgressSession}
        onResume={defaultOnResume}
        onRevise={defaultOnRevise}
      />
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
      />
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '60');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });
});
