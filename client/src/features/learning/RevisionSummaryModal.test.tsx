/**
 * ============================================================================
 * FILE: RevisionSummaryModal.test.tsx
 * LOCATION: client/src/features/learning/RevisionSummaryModal.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests for RevisionSummaryModal component rendering and interactions.
 *
 * ROLE IN PROJECT:
 *    Validates the completion modal displays correct stats, comparison data
 *    with positive/negative/zero improvement styling, action button callbacks,
 *    and accessibility behaviors (Escape key, backdrop click, aria attributes).
 *
 * KEY COMPONENTS:
 *    - Mode badge rendering (full_review / quiz_only)
 *    - Stats: topics reviewed, quiz score, quizzes passed/failed, time spent
 *    - Comparison section with improvement badge variants
 *    - Action buttons: Revise Again, Back to Dashboard
 *    - Accessibility: Escape key, backdrop click, role/aria-modal
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: ./RevisionSummaryModal, @/types/learning
 *
 * USAGE:
 *    npm run test -- RevisionSummaryModal.test.tsx
 * ============================================================================
 */
// RevisionSummaryModal.test.tsx
// Tests for RevisionSummaryModal component rendering and interactions

// Validates display of mode badge, quiz scores, comparison data with
// positive/negative/zero improvement, action button callbacks, and
// Escape key close behavior.

// @see: RevisionSummaryModal.tsx
// @see: client/src/types/learning.ts (RevisionSummary)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RevisionSummaryModal } from './RevisionSummaryModal';
import type { RevisionSummary } from '@/types/learning';

/**
 * Create a mock RevisionSummary with optional overrides.
 */
function createMockSummary(
  overrides: Partial<RevisionSummary> = {}
): RevisionSummary {
  return {
    revision_id: 'rev-1',
    mode: 'full_review',
    progress_percent: 100,
    total_quiz_score_percent: 80,
    nodes_reviewed: 3,
    nodes_total: 3,
    quizzes_passed: 2,
    quizzes_failed: 1,
    quizzes_total: 3,
    time_spent_seconds: 120,
    comparison: {
      original_quiz_score_percent: 60,
      improvement_percent: 20,
    },
    ...overrides,
  };
}

describe('RevisionSummaryModal', () => {
  const defaultOnClose = vi.fn();
  const defaultOnReviseAgain = vi.fn();
  const defaultOnBackToDashboard = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal(summary: RevisionSummary) {
    return render(
      <RevisionSummaryModal
        revisionSummary={summary}
        onClose={defaultOnClose}
        onReviseAgain={defaultOnReviseAgain}
        onBackToDashboard={defaultOnBackToDashboard}
      />
    );
  }

  it('renders "Revision Complete!" title and celebration icon', () => {
    renderModal(createMockSummary());

    expect(screen.getByText('Revision Complete!')).toBeInTheDocument();
    expect(screen.getByTestId('celebration-icon')).toBeInTheDocument();
  });

  it('renders correct mode badge for full_review', () => {
    renderModal(createMockSummary({ mode: 'full_review' }));

    const badge = screen.getByTestId('mode-badge');
    expect(badge).toHaveTextContent('Full Review');
  });

  it('renders correct mode badge for quiz_only', () => {
    renderModal(createMockSummary({ mode: 'quiz_only' }));

    const badge = screen.getByTestId('mode-badge');
    expect(badge).toHaveTextContent('Quiz Only');
  });

  it('renders topics reviewed and quiz score stats', () => {
    renderModal(createMockSummary({
      nodes_reviewed: 3,
      nodes_total: 5,
      total_quiz_score_percent: 85,
    }));

    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('Topics Reviewed')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Quiz Score')).toBeInTheDocument();
  });

  it('shows N/A when quiz score is null', () => {
    renderModal(createMockSummary({ total_quiz_score_percent: null }));

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('renders quizzes passed and failed counts', () => {
    renderModal(createMockSummary({
      quizzes_passed: 4,
      quizzes_failed: 1,
      quizzes_total: 5,
    }));

    const passed = screen.getByTestId('quizzes-passed');
    expect(passed).toHaveTextContent('4');

    const failed = screen.getByTestId('quizzes-failed');
    expect(failed).toHaveTextContent('1');
  });

  it('shows time spent when available', () => {
    renderModal(createMockSummary({ time_spent_seconds: 150 }));

    const timeSpent = screen.getByTestId('time-spent');
    expect(timeSpent).toHaveTextContent('Time spent: 2m 30s');
  });

  it('hides time spent when null', () => {
    renderModal(createMockSummary({ time_spent_seconds: null }));

    expect(screen.queryByTestId('time-spent')).not.toBeInTheDocument();
  });

  describe('Comparison section', () => {
    it('renders comparison section with original score', () => {
      renderModal(createMockSummary({
        comparison: {
          original_quiz_score_percent: 60,
          improvement_percent: 20,
        },
      }));

      expect(screen.getByTestId('comparison-section')).toBeInTheDocument();
      expect(screen.getByTestId('original-score')).toHaveTextContent('60%');
    });

    it('positive improvement shows green styling with up arrow', () => {
      renderModal(createMockSummary({
        comparison: {
          original_quiz_score_percent: 50,
          improvement_percent: 30,
        },
      }));

      const badge = screen.getByTestId('improvement-badge');
      expect(badge).toHaveTextContent('+30%');
      expect(badge).toHaveAttribute('data-improvement', 'positive');
    });

    it('negative improvement shows red styling with down arrow', () => {
      renderModal(createMockSummary({
        comparison: {
          original_quiz_score_percent: 80,
          improvement_percent: -15,
        },
      }));

      const badge = screen.getByTestId('improvement-badge');
      expect(badge).toHaveTextContent('-15%');
      expect(badge).toHaveAttribute('data-improvement', 'negative');
    });

    it('zero improvement shows gray styling with "No change"', () => {
      renderModal(createMockSummary({
        comparison: {
          original_quiz_score_percent: 70,
          improvement_percent: 0,
        },
      }));

      const badge = screen.getByTestId('improvement-badge');
      expect(badge).toHaveTextContent('No change');
      expect(badge).toHaveAttribute('data-improvement', 'neutral');
    });

    it('hides comparison section when comparison is null', () => {
      renderModal(createMockSummary({ comparison: null }));

      expect(screen.queryByTestId('comparison-section')).not.toBeInTheDocument();
    });
  });

  describe('Action buttons', () => {
    it('"Revise Again" calls onReviseAgain', () => {
      renderModal(createMockSummary());

      fireEvent.click(screen.getByTestId('revise-again-btn'));
      expect(defaultOnReviseAgain).toHaveBeenCalledTimes(1);
    });

    it('"Back to Dashboard" calls onBackToDashboard', () => {
      renderModal(createMockSummary());

      fireEvent.click(screen.getByTestId('back-to-dashboard-btn'));
      expect(defaultOnBackToDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('Escape key closes modal', () => {
      renderModal(createMockSummary());

      const modal = screen.getByTestId('revision-summary-modal');
      fireEvent.keyDown(modal, { key: 'Escape' });
      expect(defaultOnClose).toHaveBeenCalledTimes(1);
    });

    it('modal has aria-modal and role=dialog', () => {
      renderModal(createMockSummary());

      const modal = screen.getByTestId('revision-summary-modal');
      expect(modal).toHaveAttribute('role', 'dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    it('backdrop click closes modal', () => {
      renderModal(createMockSummary());

      const backdrop = screen.getByTestId('revision-summary-backdrop');
      fireEvent.click(backdrop);
      expect(defaultOnClose).toHaveBeenCalledTimes(1);
    });
  });
});
