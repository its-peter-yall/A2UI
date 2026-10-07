/**
 * ============================================================================
 * FILE: QuizResultDetails.test.tsx
 * LOCATION: client/src/features/learning/QuizResultDetails.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify stable-ID explanation disclosure for shared quiz feedback.
 * ROLE IN PROJECT:
 *    Protect both learning and revision result presentation.
 * KEY COMPONENTS:
 *    - QuizResultDetails tests: Disclosure, option identity, and focus
 * ============================================================================
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizCard, QuizSubmitResponse } from '@/types/learning';
import { QuizResultDetails } from './QuizResultDetails';

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  InlineMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));
afterEach(cleanup);

const quiz: QuizCard = {
  question_text: 'Select the primes', difficulty: 'medium',
  question_type: 'multiple_choice', options: [
    { option_id: 'nine', display_label: 'A', text: 'Nine', is_correct: false, explanation: 'Nine factors as three times three.' },
    { option_id: 'three', display_label: 'D', text: 'Three', is_correct: true, explanation: 'Three has only two divisors.' },
    { option_id: 'two', display_label: 'B', text: 'Two', is_correct: true, explanation: 'Two is the only even prime.' },
    { option_id: 'four', display_label: 'C', text: 'Four', is_correct: false, explanation: 'Four factors as two times two.' },
  ],
};
const correct: Pick<QuizSubmitResponse,
  'is_correct' | 'score_percent' | 'selected_option_ids' | 'correct_option_ids'> = {
  is_correct: true, score_percent: 100,
  selected_option_ids: ['two', 'three'], correct_option_ids: ['three', 'two'],
};

describe('QuizResultDetails', () => {
  it('explains every shuffled option using its own explanation and stable ID', () => {
    render(<QuizResultDetails quiz={quiz} result={correct} attemptCount={3} />);
    for (const option of quiz.options) {
      const row = screen.getByTestId(`quiz-result-option-${option.option_id}`);
      expect(within(row).getByText(option.explanation)).toBeInTheDocument();
      expect(within(row).queryByText('Your answer')).toBe(
        option.is_correct ? within(row).getByText('Your answer') : null,
      );
    }
    expect(screen.getByRole('status', { name: 'Quiz result' })).toHaveFocus();
    expect(screen.getByText('Attempt #3 • Score: 100%')).toBeInTheDocument();
    expect(screen.getAllByText('Correct answer')).toHaveLength(2);
  });

  it('shows partially correct feedback with yellow indication for incomplete multi-selection', () => {
    render(<QuizResultDetails quiz={quiz} result={{
      ...correct, is_correct: false, score_percent: 0,
      selected_option_ids: ['two'], correct_option_ids: [],
    }} attemptCount={1} />);
    expect(screen.getByText('Partially correct')).toBeInTheDocument();
    expect(screen.getByText('There is more than one correct option.')).toBeInTheDocument();
    expect(screen.getByText('Two is the only even prime.')).toBeInTheDocument();
    expect(screen.queryByText('Three has only two divisors.')).not.toBeInTheDocument();
    expect(screen.queryByText('Nine factors as three times three.')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    expect(screen.queryByText(/Why this is incorrect/)).not.toBeInTheDocument();
    expect(screen.getByTestId('quiz-result-option-three')).not.toHaveClass('border-green-500');
    expect(screen.getByTestId('quiz-result-option-two')).toHaveClass('border-amber-500');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells mixed multi-select that some selected options are incorrect', () => {
    render(<QuizResultDetails quiz={quiz} result={{
      ...correct, is_correct: false, score_percent: 0,
      selected_option_ids: ['two', 'nine', 'four'], correct_option_ids: [],
    }} attemptCount={2} />);
    expect(screen.getByText('Partially correct')).toBeInTheDocument();
    expect(screen.getByText('Some of the selected options are incorrect.')).toBeInTheDocument();
    expect(screen.queryByText('There is more than one correct option.')).not.toBeInTheDocument();
  });

  it('tells a single wrong multi-select that the selected option is incorrect', () => {
    render(<QuizResultDetails quiz={quiz} result={{
      ...correct, is_correct: false, score_percent: 0,
      selected_option_ids: ['nine'], correct_option_ids: [],
    }} attemptCount={1} />);
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('The selected option is incorrect.')).toBeInTheDocument();
  });

  it('tells a fully wrong multi-select that the selected options are incorrect', () => {
    render(<QuizResultDetails quiz={quiz} result={{
      ...correct, is_correct: false, score_percent: 0,
      selected_option_ids: ['nine', 'four'], correct_option_ids: [],
    }} attemptCount={1} />);
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('The selected options are incorrect.')).toBeInTheDocument();
  });

  it('explains only the wrong selected single-choice option, ignoring leaked correct IDs', () => {
    render(<QuizResultDetails quiz={{ ...quiz, question_type: 'single_choice' }} result={{
      ...correct, is_correct: false, score_percent: 0,
      selected_option_ids: ['nine'], correct_option_ids: ['two', 'three'],
    }} attemptCount={2} />);
    expect(screen.getByText('Nine factors as three times three.')).toBeInTheDocument();
    expect(screen.queryByText('Two is the only even prime.')).not.toBeInTheDocument();
    expect(screen.queryByText('Three has only two divisors.')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
  });
});
