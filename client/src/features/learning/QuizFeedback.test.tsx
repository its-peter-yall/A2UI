/**
 * ============================================================================
 * FILE: QuizFeedback.test.tsx
 * LOCATION: client/src/features/learning/QuizFeedback.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Protect normal-learning feedback disclosure and action policy.
 * ROLE IN PROJECT:
 *    Ensure sharing presentation does not transfer mastery into revision.
 * KEY COMPONENTS:
 *    - QuizFeedback tests: Own explanations, retry, next, mastery, completion
 * ============================================================================
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizCard, QuizSubmitResponse } from '@/types/learning';
import { QuizFeedback } from './QuizFeedback';
vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  InlineMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));
afterEach(cleanup);
const quiz: QuizCard = {
  question_text: 'Select primes', difficulty: 'medium', question_type: 'multiple_choice',
  options: [
    { option_id: 'two', display_label: 'D', text: 'Two', is_correct: true, explanation: 'Own explanation for two' },
    { option_id: 'nine', display_label: 'A', text: 'Nine', is_correct: false, explanation: 'Own explanation for nine' },
    { option_id: 'three', display_label: 'B', text: 'Three', is_correct: true, explanation: 'Own explanation for three' },
    { option_id: 'four', display_label: 'C', text: 'Four', is_correct: false, explanation: 'Own explanation for four' },
  ],
};
const result: QuizSubmitResponse = {
  node_id: 'n1', attempt_number: 2, is_correct: true, score_percent: 100,
  selected_option_ids: ['three', 'two'], correct_option_ids: ['two', 'three'],
  explanation: 'Aggregate explanation must not replace option explanations',
  is_mastered: false, next_node_unlocked: false, node_status: 'SHOWING_FEEDBACK',
};
describe('QuizFeedback original learning policy', () => {
  it('uses each correct option explanation rather than repeating the aggregate', () => {
    render(<QuizFeedback quiz={quiz} result={result} attemptCount={2} />);
    expect(screen.getByText('Own explanation for two')).toBeInTheDocument();
    expect(screen.getByText('Own explanation for three')).toBeInTheDocument();
    expect(screen.queryByText(result.explanation)).not.toBeInTheDocument();
  });
  it('retains retry for incorrect non-mastered learning attempts', () => {
    const retry = vi.fn();
    render(<QuizFeedback quiz={quiz} result={{ ...result, is_correct: false,
      score_percent: 0, selected_option_ids: ['nine'], correct_option_ids: [], explanation: '',
    }} attemptCount={2} onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByText('Own explanation for two')).not.toBeInTheDocument();
  });
  it('retains Next Quiz without retry before the final correct quiz in a set', () => {
    const next = vi.fn();
    render(<QuizFeedback quiz={{ quizzes: [quiz, quiz], current_index: 0, shuffle_seed: null }}
      result={result} attemptCount={2} onNextQuiz={next} onRetry={vi.fn()} />);
    expect(screen.getByText('Quiz 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next Quiz →' }));
    expect(next).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });
  it.each([true, false])('retains mastered continuation, unlocked=%s', (unlocked) => {
    const next = vi.fn();
    render(<QuizFeedback quiz={quiz} result={{ ...result, is_mastered: true,
      next_node_unlocked: unlocked }} attemptCount={2} onContinue={next} onRetry={vi.fn()} />);
    expect(screen.getByText('Mastered!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: unlocked ? 'Continue to Next Topic →' : 'Complete Course 🎉',
    }));
    expect(next).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });
  it('retains course-complete copy without a continuation callback', () => {
    render(<QuizFeedback quiz={quiz} result={{ ...result, is_mastered: true }} attemptCount={2} />);
    expect(screen.getByText('Course complete! 🎉')).toBeInTheDocument();
  });
  it('retains empty-set guidance', () => {
    render(<QuizFeedback quiz={{ quizzes: [], current_index: 0, shuffle_seed: null }}
      result={result} attemptCount={2} />);
    expect(screen.getByText('No quiz data available.')).toBeInTheDocument();
  });
});
