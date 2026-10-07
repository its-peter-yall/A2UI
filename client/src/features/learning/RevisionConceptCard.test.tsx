/**
 * ============================================================================
 * FILE: RevisionConceptCard.test.tsx
 * LOCATION: client/src/features/learning/RevisionConceptCard.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify Full Review and Practice topic presentation and callbacks.
 * ROLE IN PROJECT:
 *    Protect reading independence, controlled retention, and normal UI parity.
 * KEY COMPONENTS:
 *    - CardHarness: State retained above topic unmounting
 *    - Card tests: Both modes, callbacks, citations, failures, and neutral borders
 * ============================================================================
 */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConceptNode, QuizCard, RevisionMode, RevisionNodeProgressWithDetails,
  RevisionQuizAttemptResult, RevisionQuizResponse } from '@/types/learning';
import { RevisionConceptCard } from './RevisionConceptCard';
import { createRevisionQuizState } from './revisionQuizState';
import type { RevisionQuizRequestStates } from './revisionQuizState';

interface MarkdownProps {
  content: string;
  enableHeadingChat?: boolean;
  selectedHeadingIds?: string[];
  onToggleHeadingChat?: (headingId: string) => void;
}
vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content, enableHeadingChat, selectedHeadingIds = [], onToggleHeadingChat }: MarkdownProps) => (
    <div>
      <div data-testid="markdown-content">{content}</div>
      {enableHeadingChat && <button type="button" aria-label="Discuss heading"
        aria-pressed={selectedHeadingIds.includes('basics')}
        onClick={() => onToggleHeadingChat?.('basics')}>Heading chat</button>}
    </div>
  ),
  InlineMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));
afterEach(cleanup);
const quiz: QuizCard = {
  question_text: 'Topic quiz', question_type: 'single_choice', difficulty: 'easy', options: [
    { option_id: 'x', display_label: 'D', text: 'Correct choice', is_correct: true, explanation: 'X exact reason' },
    { option_id: 'y', display_label: 'A', text: 'Wrong choice', is_correct: false, explanation: 'Y exact reason' },
    { option_id: 'z', display_label: 'B', text: 'Z choice', is_correct: false, explanation: 'Z exact reason' },
    { option_id: 'w', display_label: 'C', text: 'W choice', is_correct: false, explanation: 'W exact reason' },
  ],
};
const node: ConceptNode = {
  id: 'n1', learning_session_id: 's1', sequence_index: 0, title: 'Topic title',
  content_markdown: '## Basics\nExplanation body\n\n## Curious to explore more?\n- Why learn this?',
  status: 'COMPLETED', error_message: null, retry_available: false,
  quiz, quiz_set: null, quiz_hidden: null, quiz_set_hidden: null,
  created_at: '2026-10-05T00:00:00Z', updated_at: null,
  citations: [{ source_id: 'source1', citation_number: 1, title: 'Retained source',
    url: 'https://example.com/source', publisher: null, published_at: null, retrieved_at: null }],
};
function attempt(index: number, correct: boolean): RevisionQuizAttemptResult {
  return { id: `attempt-${index}`, revision_session_id: 'r1', node_id: 'n1', quiz_index: index,
    attempt_number: index + 5, quiz_attempt_count: 1, selected_option_ids: [correct ? 'x' : 'y'],
    is_correct: correct, score_percent: correct ? 100 : 0,
    correct_option_ids: correct ? ['x'] : [], explanation: correct ? 'Unused aggregate' : '',
    selected_explanation: null, created_at: '2026-10-05T01:00:00Z' };
}
function progress(results: RevisionQuizAttemptResult[] = [], reviewed = false): RevisionNodeProgressWithDetails {
  return { id: 'progress1', node_id: 'n1', node_title: 'Topic title', sequence_index: 0,
    status: reviewed ? 'reviewed' : 'pending', reviewed_at: null,
    content_reviewed_at: reviewed ? '2026-10-05T02:00:00Z' : null,
    quiz_count: 2, quiz_results: results };
}
interface HarnessProps {
  mode: RevisionMode;
  data?: RevisionNodeProgressWithDetails;
  topic?: ConceptNode;
  visible?: boolean;
  marking?: boolean;
  reviewError?: string;
  requests?: RevisionQuizRequestStates;
  onReviewed?: (id: string) => void;
  onSubmit?: (id: string, ids: string[], index?: number) => void;
  onAsk?: (question: string) => void;
  onHeading?: (id: string) => void;
}
function CardHarness({ mode, data = progress(), topic = node, visible = true,
  marking = false, reviewError, requests, onReviewed = vi.fn(), onSubmit = vi.fn(),
  onAsk = vi.fn(), onHeading = vi.fn(),
}: HarnessProps) {
  const [state, setState] = useState(createRevisionQuizState);
  return visible ? <RevisionConceptCard node={topic} revisionId="r1"
    revisionMode={mode} revisionProgress={data} quizState={state} onQuizStateChange={setState}
    quizRequestStates={requests} onMarkReviewed={onReviewed} onQuizSubmit={onSubmit}
    isMarkingReviewed={marking} markReviewedError={reviewError}
    onAskQuestion={onAsk} selectedHeadingIds={['basics']} onToggleHeadingChat={onHeading} /> : null;
}
const modes: RevisionMode[] = ['full_review', 'quiz_only'];
describe.each(modes)('RevisionConceptCard %s', (mode) => {
  it('shows immediate correct/wrong independent feedback with neutral outer borders and no mastery actions', () => {
    const twoQuizzes: ConceptNode = { ...node,
      quiz_set: { quizzes: [quiz, { ...quiz, question_text: 'Second quiz' }], current_index: 0, shuffle_seed: null } };
    const { rerender } = render(<CardHarness mode={mode} topic={twoQuizzes} data={progress([attempt(0, true)])} />);
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText('W exact reason')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'Quiz 2: unanswered' })).toHaveClass('bg-muted');
    rerender(<CardHarness mode={mode} topic={twoQuizzes} data={{
      ...progress([attempt(0, true), attempt(1, false)]), status: 'quiz_failed',
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
    expect(screen.getByText('Y exact reason')).toBeInTheDocument();
    expect(screen.queryByText('X exact reason')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'Quiz 2: incorrect' })).toHaveClass('bg-red-500');
    const card = screen.getByTestId('revision-concept-card');
    expect(card).toHaveClass('border-border');
    expect(card.className).not.toMatch(/border-(?:l-)?(?:green|red)/);
    expect(screen.queryByText(/Mastered|Complete Course|Course complete|unlock/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue to Next Topic/ })).not.toBeInTheDocument();
  });
  it('preserves parent selections across card unmount and does not submit on navigation', () => {
    const submit = vi.fn();
    const { rerender } = render(<CardHarness mode={mode} onSubmit={submit} />);
    fireEvent.click(screen.getByRole('radio', { name: /Wrong choice/ }));
    rerender(<CardHarness mode={mode} visible={false} onSubmit={submit} />);
    rerender(<CardHarness mode={mode} onSubmit={submit} />);
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toBeChecked();
    expect(submit).not.toHaveBeenCalled();
  });
  it('discloses incomplete shuffled multi-select as partially correct and allows retry', () => {
    const multi: ConceptNode = { ...node, quiz: { ...quiz, question_type: 'multiple_choice',
      options: quiz.options.map((option) => option.option_id === 'z' ? { ...option, is_correct: true } : option) } };
    const wrong = { ...attempt(0, false), selected_option_ids: ['x'] };
    render(<CardHarness mode={mode} topic={multi} data={progress([wrong])} />);
    expect(screen.getByText('Partially correct')).toBeInTheDocument();
    expect(screen.getByText('There is more than one correct option.')).toBeInTheDocument();
    expect(screen.getByText('X exact reason')).toBeInTheDocument();
    expect(screen.queryByText('Z exact reason')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getAllByRole('checkbox').every((input) => input instanceof HTMLInputElement && !input.checked)).toBe(true);
  });
  it('explains every multi-correct option after success with shuffled display labels', () => {
    const multi: ConceptNode = { ...node, quiz: { ...quiz, question_type: 'multiple_choice',
      options: quiz.options.map((option) => option.option_id === 'z' ? { ...option, is_correct: true } : option) } };
    render(<CardHarness mode={mode} topic={multi} data={progress([{
      ...attempt(0, true), selected_option_ids: ['z', 'x'], correct_option_ids: ['x', 'z'],
    }])} />);
    expect(screen.getByText('X exact reason')).toBeInTheDocument();
    expect(screen.getByText('Z exact reason')).toBeInTheDocument();
    expect(screen.getByText('Y exact reason')).toBeInTheDocument();
    expect(screen.getByText('W exact reason')).toBeInTheDocument();
    expect(screen.getAllByText('Correct answer')).toHaveLength(2);
  });
  it('shows recoverable quiz failure without clearing inputs or manufacturing a green result', () => {
    const { rerender } = render(<CardHarness mode={mode} />);
    fireEvent.click(screen.getByRole('radio', { name: /Wrong choice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    rerender(<CardHarness mode={mode} requests={{ 0: { isPending: false, error: 'Save failed; try again.' } }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed; try again.');
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Quiz 1: unanswered' })).toHaveClass('bg-muted');
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
  });
  it('handles absent and empty quiz sets without phantom indicators', () => {
    const { rerender } = render(<CardHarness mode={mode} topic={{ ...node, quiz: null }} />);
    expect(screen.getByText('No quiz available for this topic.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quiz 1:/ })).not.toBeInTheDocument();
    rerender(<CardHarness mode={mode} topic={{ ...node, quiz: null,
      quiz_set: { quizzes: [], current_index: 0, shuffle_seed: null } }} />);
    expect(screen.getByText('No quiz available for this topic.')).toBeInTheDocument();
    if (mode === 'full_review') expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeInTheDocument();
  });
});
describe('RevisionConceptCard mode and callbacks', () => {
  it('orders full-review explanation, curiosity, citations, review action, then quiz', () => {
    render(<CardHarness mode="full_review" />);
    const content = screen.getByText('## Basics Explanation body');
    const curiosity = screen.getByRole('button', { name: 'Why learn this?' });
    const citation = screen.getByRole('link', { name: '1. Retained source' });
    const review = screen.getByRole('button', { name: 'Mark as Reviewed' });
    const section = screen.getByTestId('revision-quiz-section');
    for (const [before, after] of [[content, curiosity], [curiosity, citation], [citation, review], [review, section]]) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
    expect(screen.getAllByTestId('markdown-content').map((element) => element.textContent)).not.toContain(node.content_markdown);
    expect(screen.getAllByText('Why learn this?')).toHaveLength(1);
  });
  it('forwards repeated curiosity and heading actions only as callbacks', () => {
    const ask = vi.fn(); const heading = vi.fn(); const submit = vi.fn(); const reviewed = vi.fn();
    render(<CardHarness mode="full_review" onAsk={ask} onHeading={heading} onSubmit={submit} onReviewed={reviewed} />);
    const question = screen.getByRole('button', { name: 'Why learn this?' });
    fireEvent.click(question); fireEvent.click(question);
    expect(ask.mock.calls).toEqual([['Why learn this?'], ['Why learn this?']]);
    const button = screen.getByRole('button', { name: 'Discuss heading' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(heading).toHaveBeenCalledWith('basics');
    expect(submit).not.toHaveBeenCalled(); expect(reviewed).not.toHaveBeenCalled();
  });
  it('preserves fallback markdown with no recognized curiosity section', () => {
    const fallback = '## Other heading\nPlain fallback\n- Not a curiosity question';
    render(<CardHarness mode="full_review" topic={{ ...node, content_markdown: fallback }} />);
    expect(screen.getAllByTestId('markdown-content').map((element) => element.textContent)).toContain(fallback);
    expect(screen.queryByText('Curious to explore more?')).not.toBeInTheDocument();
  });
  it('does not hide content if a callback is unavailable', () => {
    render(<RevisionConceptCard node={node} revisionMode="full_review" revisionProgress={progress()}
      onMarkReviewed={vi.fn()} onQuizSubmit={vi.fn()} />);
    expect(screen.getAllByTestId('markdown-content').map((element) => element.textContent)).toContain(node.content_markdown);
  });
  it('keeps Practice quiz-only with no review/chat-content/citation widgets', () => {
    render(<CardHarness mode="quiz_only" />);
    expect(screen.queryByText(/Explanation body/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why learn this?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discuss heading' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '1. Retained source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as Reviewed' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toBeInTheDocument();
  });
  it('makes reading explicit, idempotent in presentation, and independent of quiz status', () => {
    const mark = vi.fn();
    const { rerender } = render(<CardHarness mode="full_review" data={{ ...progress([attempt(0, true)]), status: 'quiz_passed' }} onReviewed={mark} />);
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reading pending');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
    expect(mark).toHaveBeenCalledWith('n1');
    rerender(<CardHarness mode="full_review" data={{ ...progress([attempt(0, false)], true), status: 'quiz_failed' }} onReviewed={mark} />);
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reviewed');
    expect(screen.queryByRole('button', { name: 'Mark as Reviewed' })).not.toBeInTheDocument();
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByTestId('revision-concept-card').className).not.toMatch(/border-(?:l-)?(?:green|red)/);
  });
  it('shows review pending/failure recovery without manufacturing completion', () => {
    const mark = vi.fn();
    const data = progress([attempt(0, false)]);
    const { rerender } = render(<CardHarness mode="full_review" data={data} marking={true} onReviewed={mark} />);
    expect(screen.getByRole('button', { name: 'Marking...' })).toBeDisabled();
    rerender(<CardHarness mode="full_review" data={data} reviewError="Review save failed. Retry marking." onReviewed={mark} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Review save failed. Retry marking.');
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reading pending');
    expect(screen.getByText('Y exact reason')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz 1: incorrect' })).toHaveClass('bg-red-500');
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
    expect(mark).toHaveBeenCalledOnce();
  });
  it('labels Practice coverage from authoritative topic status, not one correct quiz, and retains completion during retry', () => {
    const twoQuizzes: ConceptNode = { ...node, quiz_set: {
      quizzes: [quiz, quiz], current_index: 0, shuffle_seed: null,
    } };
    const { rerender } = render(<CardHarness mode="quiz_only" topic={twoQuizzes} data={progress([attempt(0, true)])} />);
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Practice pending');
    rerender(<CardHarness mode="quiz_only" topic={twoQuizzes} data={{ ...progress([attempt(0, true), attempt(1, false)]), status: 'quiz_failed' }} />);
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Practice finished');
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Practice finished');
    expect(screen.getByRole('button', { name: 'Quiz 2: incorrect' })).toHaveClass('bg-red-500');
    expect(screen.queryByText(/Passed|Mastered/)).not.toBeInTheDocument();
  });
  it('supports the legacy additive caller without using topic correctness for feedback', () => {
    const result: RevisionQuizResponse = { ...attempt(0, false), revision_node_status: 'pending' };
    render(<RevisionConceptCard node={node} revisionMode="full_review" revisionProgress={progress()}
      quizResult={result} onMarkReviewed={vi.fn()} onQuizSubmit={vi.fn()} />);
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeInTheDocument();
  });
});
