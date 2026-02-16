// RevisionConceptCard.test.tsx
// Unit tests for RevisionConceptCard component

// Tests rendering for both full_review and quiz_only modes, status badges
// for all 4 states, callback invocations, and no sequential locking.

// @see: RevisionConceptCard.tsx
// @see: ConceptCard.test.tsx (pattern reference)

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionConceptCard } from './RevisionConceptCard';
import type {
  ConceptNode,
  RevisionNodeProgressWithDetails,
  RevisionMode,
  RevisionNodeStatus,
} from '@/types/learning';

// Mock MarkdownRenderer to avoid rendering complexity
vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

const mockNode: ConceptNode = {
  id: 'node-1',
  learning_session_id: 'session-1',
  sequence_index: 0,
  title: 'Test Topic',
  content_markdown: '# Test Content\n\nThis is test content.',
  status: 'COMPLETED',
  error_message: null,
  retry_available: false,
  quiz: {
    question_text: 'What is the answer?',
    options: [
      { option_id: 'opt-a', display_label: 'A', text: 'Option A', is_correct: false, explanation: 'Wrong' },
      { option_id: 'opt-b', display_label: 'B', text: 'Option B', is_correct: true, explanation: 'Correct!' },
      { option_id: 'opt-c', display_label: 'C', text: 'Option C', is_correct: false, explanation: 'Wrong' },
      { option_id: 'opt-d', display_label: 'D', text: 'Option D', is_correct: false, explanation: 'Wrong' },
    ],
    difficulty: 'medium',
  },
  quiz_set: null,
  quiz_hidden: null,
  quiz_set_hidden: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockNodeNoQuiz: ConceptNode = {
  ...mockNode,
  id: 'node-no-quiz',
  quiz: null,
};

function createProgress(
  overrides: Partial<RevisionNodeProgressWithDetails> = {}
): RevisionNodeProgressWithDetails {
  return {
    id: 'progress-1',
    node_id: 'node-1',
    node_title: 'Test Topic',
    sequence_index: 0,
    status: 'pending',
    reviewed_at: null,
    ...overrides,
  };
}

const defaultProps = {
  node: mockNode,
  revisionMode: 'full_review' as RevisionMode,
  revisionProgress: createProgress(),
  onMarkReviewed: vi.fn(),
  onQuizSubmit: vi.fn(),
};

describe('RevisionConceptCard', () => {
  describe('full_review mode', () => {
    it('shows markdown content and "Mark as Reviewed" button', () => {
      render(<RevisionConceptCard {...defaultProps} />);

      expect(screen.getByTestId('revision-full-review-content')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
      expect(screen.getByTestId('mark-reviewed-button')).toBeInTheDocument();
      expect(screen.getByText('Mark as Reviewed')).toBeInTheDocument();
    });

    it('shows quiz section below content', () => {
      render(<RevisionConceptCard {...defaultProps} />);

      expect(screen.getByTestId('revision-quiz-section')).toBeInTheDocument();
      expect(screen.getByText('What is the answer?')).toBeInTheDocument();
      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
    });

    it('hides "Mark as Reviewed" when status is not pending', () => {
      render(
        <RevisionConceptCard
          {...defaultProps}
          revisionProgress={createProgress({ status: 'reviewed' })}
        />
      );

      expect(screen.queryByTestId('mark-reviewed-button')).not.toBeInTheDocument();
    });

    it('calls onMarkReviewed when button is clicked', () => {
      const onMarkReviewed = vi.fn();
      render(
        <RevisionConceptCard
          {...defaultProps}
          onMarkReviewed={onMarkReviewed}
        />
      );

      fireEvent.click(screen.getByTestId('mark-reviewed-button'));
      expect(onMarkReviewed).toHaveBeenCalledWith('node-1');
    });

    it('disables "Mark as Reviewed" when isMarkingReviewed is true', () => {
      render(
        <RevisionConceptCard
          {...defaultProps}
          isMarkingReviewed={true}
        />
      );

      const button = screen.getByTestId('mark-reviewed-button');
      expect(button).toBeDisabled();
      expect(screen.getByText('Marking...')).toBeInTheDocument();
    });
  });

  describe('quiz_only mode', () => {
    it('hides content and shows quiz immediately', () => {
      render(
        <RevisionConceptCard
          {...defaultProps}
          revisionMode="quiz_only"
        />
      );

      expect(screen.getByTestId('revision-quiz-only-content')).toBeInTheDocument();
      expect(screen.queryByTestId('revision-full-review-content')).not.toBeInTheDocument();
      expect(screen.queryByTestId('markdown-content')).not.toBeInTheDocument();
      expect(screen.getByText('What is the answer?')).toBeInTheDocument();
    });

    it('shows context text "Test your knowledge"', () => {
      render(
        <RevisionConceptCard
          {...defaultProps}
          revisionMode="quiz_only"
        />
      );

      expect(screen.getByText(/test your knowledge/i)).toBeInTheDocument();
    });

    it('shows "No quiz available" when node has no quiz', () => {
      render(
        <RevisionConceptCard
          {...defaultProps}
          node={mockNodeNoQuiz}
          revisionMode="quiz_only"
          revisionProgress={createProgress({ node_id: 'node-no-quiz' })}
        />
      );

      expect(screen.getByText(/no quiz available/i)).toBeInTheDocument();
    });
  });

  describe('quiz submission', () => {
    it('calls onQuizSubmit when an option is selected and submitted', () => {
      const onQuizSubmit = vi.fn();
      render(
        <RevisionConceptCard
          {...defaultProps}
          onQuizSubmit={onQuizSubmit}
        />
      );

      // Select an option
      fireEvent.click(screen.getByText('Option A'));
      // Submit
      fireEvent.click(screen.getByTestId('revision-quiz-submit'));

      expect(onQuizSubmit).toHaveBeenCalledWith('node-1', 'opt-a', 0);
    });

    it('disables submit button when no option is selected', () => {
      render(<RevisionConceptCard {...defaultProps} />);

      const submitButton = screen.getByTestId('revision-quiz-submit');
      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when isSubmitting is true', () => {
      render(
        <RevisionConceptCard
          {...defaultProps}
          isSubmitting={true}
        />
      );

      // Select an option first
      fireEvent.click(screen.getByText('Option A'));

      const submitButton = screen.getByTestId('revision-quiz-submit');
      expect(submitButton).toBeDisabled();
      expect(screen.getByText('Submitting...')).toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    const statuses: Array<{ status: RevisionNodeStatus; label: string }> = [
      { status: 'pending', label: 'Pending' },
      { status: 'reviewed', label: 'Reviewed' },
      { status: 'quiz_passed', label: 'Passed' },
      { status: 'quiz_failed', label: 'Try Again' },
    ];

    it.each(statuses)(
      'renders correct badge for $status status',
      ({ status, label }) => {
        render(
          <RevisionConceptCard
            {...defaultProps}
            revisionProgress={createProgress({ status })}
          />
        );

        const badge = screen.getByTestId('revision-status-badge');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(label);
      }
    );
  });

  describe('accessibility and structure', () => {
    it('renders as an article element', () => {
      render(<RevisionConceptCard {...defaultProps} />);

      expect(screen.getByTestId('revision-concept-card').tagName).toBe('ARTICLE');
    });

    it('shows node title in header', () => {
      render(<RevisionConceptCard {...defaultProps} />);

      expect(screen.getByText('Test Topic')).toBeInTheDocument();
    });

    it('shows topic number based on sequence_index', () => {
      render(<RevisionConceptCard {...defaultProps} />);

      expect(screen.getByText('Topic #1')).toBeInTheDocument();
    });

    it('all cards are accessible — no locked state', () => {
      // Render with any status — card should always be interactive
      render(
        <RevisionConceptCard
          {...defaultProps}
          revisionProgress={createProgress({ status: 'pending' })}
        />
      );

      // Should NOT show any "locked" or "complete previous" message
      expect(screen.queryByText(/locked/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/complete the previous/i)).not.toBeInTheDocument();

      // Content should be visible
      expect(screen.getByTestId('revision-full-review-content')).toBeInTheDocument();
    });
  });
});
