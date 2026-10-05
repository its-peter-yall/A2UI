/**
 * ============================================================================
 * FILE: RevisionSummaryModal.test.tsx
 * LOCATION: client/src/features/learning/RevisionSummaryModal.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify mode-specific completion and attempt-accuracy summary presentation.
 * ROLE IN PROJECT:
 *    Guards correct metrics labels while retaining original comparison/actions.
 * KEY COMPONENTS:
 *    - RevisionSummaryModal: Explicitly opened summary dialog
 * ============================================================================
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { RevisionMode, RevisionSummary } from '@/types/learning';
import { RevisionSummaryModal } from './RevisionSummaryModal';

afterEach(cleanup);

function summary(mode: RevisionMode): RevisionSummary {
  return {
    revision_id: 'r', mode, progress_percent: 100, nodes_reviewed: 1, nodes_total: 1,
    total_quiz_score_percent: 66, quizzes_passed: 2, quizzes_failed: 1, quizzes_total: 3,
    time_spent_seconds: 60,
    comparison: { original_quiz_score_percent: 25, improvement_percent: 41 },
    notices: [],
  };
}

it.each<RevisionMode>(['full_review', 'quiz_only'])(
  'labels %s completion separately from attempt accuracy',
  (mode) => {
    const close = vi.fn(); const again = vi.fn(); const dashboard = vi.fn();
    render(
      <RevisionSummaryModal
        revisionSummary={summary(mode)}
        onClose={close}
        onReviseAgain={again}
        onBackToDashboard={dashboard}
      />,
    );
    expect(screen.getByText(mode === 'full_review' ? 'Topics Reviewed' : 'Topics Finished')).toBeInTheDocument();
    expect(screen.getByText('Attempt Accuracy')).toBeInTheDocument();
    expect(screen.getByText(/2 correct attempts/)).toBeInTheDocument();
    expect(screen.getByText(/1 incorrect attempts/)).toBeInTheDocument();
    expect(screen.getByText(/3 total attempts/)).toBeInTheDocument();
    expect(screen.getByTestId('original-score')).toHaveTextContent('25%');
    fireEvent.click(screen.getByRole('button', { name: 'Revise Again' }));
    expect(again).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Dashboard' }));
    expect(dashboard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close summary' }));
    expect(close).toHaveBeenCalledTimes(1);
  },
);

it('represents no compatible attempts as unavailable, not zero percent', () => {
  render(
    <RevisionSummaryModal
      revisionSummary={{
        ...summary('full_review'),
        total_quiz_score_percent: null,
        quizzes_total: 0,
        quizzes_passed: 0,
        quizzes_failed: 0,
        comparison: null,
      }}
      onClose={vi.fn()}
      onReviseAgain={vi.fn()}
      onBackToDashboard={vi.fn()}
    />,
  );
  expect(screen.getByText('N/A')).toBeInTheDocument();
  expect(screen.getByText('No compatible quiz attempts yet.')).toBeInTheDocument();
  expect(screen.queryByText('0%')).not.toBeInTheDocument();
});