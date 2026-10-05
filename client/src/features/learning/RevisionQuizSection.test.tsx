/**
 * ============================================================================
 * FILE: RevisionQuizSection.test.tsx
 * LOCATION: client/src/features/learning/RevisionQuizSection.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify controlled revision quiz interaction and independent feedback.
 * ROLE IN PROJECT:
 *    Protect UI contracts P6 will use in both revision modes.
 * KEY COMPONENTS:
 *    - SectionHarness: Parent-owned state and authoritative result props
 *    - Interaction tests: Navigation, retry, pending, error, and stable IDs
 * ============================================================================
 */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizCard, RevisionQuizAttemptResult } from '@/types/learning';
import { RevisionQuizSection } from './RevisionQuizSection';
import { createRevisionQuizState } from './revisionQuizState';
import type { RevisionQuizRequestStates } from './revisionQuizState';
vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  InlineMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));
afterEach(cleanup);
const quiz: QuizCard = {
  question_text: 'Question one', difficulty: 'easy', question_type: 'single_choice',
  options: [
    { option_id: 'right', display_label: 'D', text: 'Right choice', is_correct: true, explanation: 'Right unique reason' },
    { option_id: 'wrong', display_label: 'A', text: 'Wrong choice', is_correct: false, explanation: 'Wrong unique reason' },
    { option_id: 'extra', display_label: 'B', text: 'Extra choice', is_correct: false, explanation: 'Extra unique reason' },
    { option_id: 'last', display_label: 'C', text: 'Last choice', is_correct: false, explanation: 'Last unique reason' },
  ],
};
const quizzes = [quiz, { ...quiz, question_text: 'Question two' }];
function attempt(index: number, isCorrect: boolean, id = `a${index}`): RevisionQuizAttemptResult {
  return { id, revision_session_id: 'r1', node_id: 'n1', quiz_index: index,
    attempt_number: index + 8, quiz_attempt_count: 2,
    selected_option_ids: [isCorrect ? 'right' : 'wrong'], is_correct: isCorrect,
    score_percent: isCorrect ? 100 : 0, correct_option_ids: isCorrect ? ['right'] : [],
    explanation: isCorrect ? 'Aggregate unused reason' : '', selected_explanation: null,
    created_at: '2026-10-05T10:00:00Z' };
}
interface HarnessProps {
  results?: RevisionQuizAttemptResult[];
  requestStates?: RevisionQuizRequestStates;
  cards?: QuizCard[];
  onSubmit?: (nodeId: string, ids: string[], index: number) => void;
}
function SectionHarness({ results = [], requestStates = {}, cards = quizzes, onSubmit = vi.fn() }: HarnessProps) {
  const [state, setState] = useState(createRevisionQuizState);
  return <RevisionQuizSection revisionId="r1" nodeId="n1" quizzes={cards}
    results={results} state={state} onStateChange={setState}
    requestStates={requestStates} onSubmit={onSubmit} />;
}
describe('RevisionQuizSection', () => {
  it('uses stable IDs, disables empty submit, and preserves selections through Next/Previous/Skip', () => {
    const submit = vi.fn();
    render(<SectionHarness onSubmit={submit} />);
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quiz 1: unanswered' })).toHaveClass('bg-muted');
    fireEvent.click(screen.getByRole('radio', { name: /Wrong choice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next quiz' }));
    fireEvent.click(screen.getByRole('radio', { name: /Right choice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous quiz' }));
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Skip quiz' }));
    expect(screen.getByRole('radio', { name: /Right choice/ })).toBeChecked();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    expect(submit).toHaveBeenCalledWith('n1', ['right'], 1);
    expect(screen.getByRole('radio', { name: /Right choice/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Quiz 2: unanswered' })).toHaveClass('bg-muted');
  });
  it('accepts shuffled multi-select stable IDs and checkbox toggles without evaluating locally', () => {
    const submit = vi.fn();
    render(<SectionHarness cards={[{ ...quiz, question_type: 'multiple_choice' }]} onSubmit={submit} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Extra choice/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Right choice/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Extra choice/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Wrong choice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    expect(submit).toHaveBeenCalledWith('n1', ['right', 'wrong'], 0);
  });
  it('immediately reveals correct feedback for only its quiz and restores independent wrong feedback', () => {
    const submit = vi.fn();
    const { rerender } = render(<SectionHarness onSubmit={submit} />);
    fireEvent.click(screen.getByRole('radio', { name: /Right choice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    expect(submit).toHaveBeenCalledWith('n1', ['right'], 0);
    rerender(<SectionHarness results={[attempt(0, true)]} onSubmit={submit} />);
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText('Extra unique reason')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'Quiz 2: unanswered' })).toHaveClass('bg-muted');
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
    rerender(<SectionHarness results={[attempt(0, true), attempt(1, false)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('Wrong unique reason')).toBeInTheDocument();
    expect(screen.queryByText('Right unique reason')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz 2: incorrect' })).toHaveClass('bg-red-500');
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toHaveClass('bg-green-500');
    expect(screen.getByText('Attempt #2 • Score: 0%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 1: correct' }));
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.queryByText('Incorrect')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mastered|Complete Course|Course complete|unlock/i)).not.toBeInTheDocument();
  });
  it('clears only retry inputs, keeps the red saved indicator during failure, and accepts the next successful result', () => {
    const submit = vi.fn();
    const wrong = attempt(0, false);
    const { rerender } = render(<SectionHarness results={[wrong, attempt(1, true)]} onSubmit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Right choice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    rerender(<SectionHarness results={[wrong, attempt(1, true)]}
      requestStates={{ 0: { isPending: true } }} onSubmit={submit} />);
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Right choice/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quiz 1: incorrect' })).toHaveClass('bg-red-500');
    rerender(<SectionHarness results={[{ ...wrong }, attempt(1, true)]}
      requestStates={{ 0: { isPending: false, error: 'Could not save. Submit again.' } }} onSubmit={submit} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save. Submit again.');
    expect(screen.getByRole('radio', { name: /Right choice/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeEnabled();
    expect(screen.getByText('Previous saved feedback')).toBeInTheDocument();
    expect(screen.getByText('Wrong unique reason')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: correct' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 1: incorrect' }));
    expect(screen.getByRole('radio', { name: /Right choice/ })).toBeChecked();
    rerender(<SectionHarness results={[attempt(0, true, 'new-attempt'), attempt(1, true)]} onSubmit={submit} />);
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'Quiz 2: correct' })).toHaveClass('bg-green-500');
    expect(submit).toHaveBeenCalledOnce();
  });
  it('keeps first-submission selection on failure and scopes pending to its quiz', () => {
    const submit = vi.fn();
    const { rerender } = render(<SectionHarness onSubmit={submit} />);
    fireEvent.click(screen.getByRole('radio', { name: /Wrong choice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    rerender(<SectionHarness requestStates={{ 0: { isPending: false, error: 'Network failure' } }} onSubmit={submit} />);
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('Network failure');
    expect(screen.getByRole('button', { name: 'Quiz 1: unanswered' })).toHaveClass('bg-muted');
    fireEvent.click(screen.getByRole('button', { name: 'Next quiz' }));
    rerender(<SectionHarness requestStates={{ 0: { isPending: true } }} onSubmit={submit} />);
    fireEvent.click(screen.getByRole('radio', { name: /Right choice/ }));
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeEnabled();
  });
  it('ignores foreign results and renders quizless guidance for empty data', () => {
    const { rerender } = render(<SectionHarness results={[{ ...attempt(0, true), revision_session_id: 'r2' }]} />);
    expect(screen.getByRole('button', { name: 'Quiz 1: unanswered' })).toBeInTheDocument();
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    rerender(<SectionHarness cards={[]} />);
    expect(screen.getByText('No quiz available for this topic.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
