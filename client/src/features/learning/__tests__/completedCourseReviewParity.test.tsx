/**
 * ============================================================================
 * FILE: completedCourseReviewParity.test.tsx
 * LOCATION: client/src/features/learning/__tests__/completedCourseReviewParity.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Prove cross-layer review parity through real revision components.
 * ROLE IN PROJECT:
 *    P7 acceptance uses serialized route fixtures, real queries, and routing.
 *    Only HTTP/stream boundaries and browser limitations are replaced.
 * KEY COMPONENTS:
 *    - mountRevision: Fresh QueryClient, real router, serialized wire responses
 *    - Acceptance scenarios: Feedback, completion, isolation, and chat lifecycle
 * ============================================================================
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { ConceptNode, LearningSessionWithNodes, RevisionMode,
  RevisionNodeProgressWithDetails, RevisionQuizAttemptResult,
  RevisionQuizResponse, RevisionSessionWithProgress, RevisionSummary } from '@/types/learning';
import { RevisionPage } from '../RevisionPage';
import { RevisionHistoryList } from '../RevisionHistoryList';

describe.each<RevisionMode>(['full_review', 'quiz_only'])('%s integrated feedback', (mode) => {
  it('A1/A2/A3: patches feedback before refetch and keeps independent neutral indicators', async () => {
    const h = mountRevision(mode);
    await screen.findByRole('heading', { name: 'Topic A' });
    h.holdRefetch();
    fireEvent.click(screen.getByRole('radio', { name: /Option 0/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByText('Correct!');
    for (const index of [0, 1, 2, 3]) {
      expect(screen.getByText(`Explanation q0-${index}`)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'Quiz 2: unanswered' })).toHaveClass('bg-muted');
    fireEvent.click(screen.getByRole('button', { name: 'Next quiz' }));
    fireEvent.click(screen.getByRole('radio', { name: /Option 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByText('Incorrect');
    expect(screen.getByText('Explanation q1-1')).toBeInTheDocument();
    for (const index of [0, 2, 3]) {
      expect(screen.queryByText(`Explanation q1-${index}`)).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'Quiz 2: incorrect' })).toHaveClass('bg-red-500');
    expect(screen.getByTestId('revision-concept-card')).toHaveClass('border-border');
    expect(screen.getByTestId('revision-concept-card')).not.toHaveClass('border-green-500', 'border-red-500');
    expect(screen.queryByRole('button', { name: /Complete Course|Mastered|Unlock/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 1: correct' }));
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.queryByText('Incorrect')).not.toBeInTheDocument();
    expect(h.posts()).toHaveLength(2);
    await h.releaseRefetch();
  });
});

describe.each<RevisionMode>(['full_review', 'quiz_only'])('%s navigation and completion', (mode) => {
  it('A5/A6: mounted drafts survive quiz/topic navigation; remount restores matching saved results', async () => {
    const h = mountRevision(mode);
    await screen.findByRole('heading', { name: 'Topic A' });
    fireEvent.click(screen.getByRole('radio', { name: /Option 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next quiz' }));
    fireEvent.click(screen.getByRole('radio', { name: /Option 0/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous quiz' }));
    expect(screen.getByRole('radio', { name: /Option 1/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Skip quiz' }));
    expect(screen.getByRole('radio', { name: /Option 0/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
    await screen.findByRole('heading', { name: 'Topic B' });
    fireEvent.click(screen.getByRole('button', { name: 'Previous topic' }));
    await screen.findByRole('heading', { name: 'Topic A' });
    expect(screen.getByRole('radio', { name: /Option 0/ })).toBeChecked();
    expect(h.posts()).toHaveLength(0);
    h.view.unmount();
    const restored = mountRevision(mode, h.wire.mixed);
    await screen.findByRole('button', { name: 'Quiz 1: correct' });
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
    expect(screen.getByText('Explanation q1-1')).toBeInTheDocument();
    expect(screen.getByText('Attempt #1 • Score: 0%')).toBeInTheDocument();
    expect(screen.getByTestId('quiz-result-option-q1-1')).toHaveTextContent('Your answer');
    expect(screen.getByTestId('quiz-result-option-q1-0')).not.toHaveTextContent('Your answer');
    expect(screen.queryByText('Explanation q1-0')).not.toBeInTheDocument();
    await navigateTo(restored, restored.wire.fresh.id);
    await screen.findByRole('button', { name: 'Quiz 1: unanswered' });
    expect(screen.getByRole('button', { name: 'Quiz 2: unanswered' })).toBeInTheDocument();
    expect(screen.queryByText('Incorrect')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Option 1/ })).not.toBeChecked();
  });

  it('A7/A8/A9/A10/A16: completion and latest feedback stay independent of attempt accuracy', async () => {
    const h = mountRevision(mode);
    await screen.findByRole('heading', { name: 'Topic A' });
    fireEvent.click(screen.getByRole('radio', { name: /Option 0/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByText('Correct!');
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent(
      mode === 'full_review' ? 'Reading pending' : 'Practice pending');
    fireEvent.click(screen.getByRole('button', { name: 'Next quiz' }));
    fireEvent.click(screen.getByRole('radio', { name: /Option 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByText('Incorrect');
    if (mode === 'full_review') {
      expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeEnabled();
      await completeReading();
    }
    await screen.findByRole('button', { name: 'View Summary' });
    await waitFor(() => expect(screen.getByText(mode === 'full_review'
      ? /2\s*\/\s*2.*reviewed/i : /1\s*\/\s*1.*(?:finished|attempted)/i)).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent(
      mode === 'full_review' ? 'Reviewed' : 'Practice finished');
    fireEvent.click(screen.getByRole('button', { name: 'View Summary' }));
    const firstSummary = await screen.findByRole('dialog', { name: 'Revision Summary' });
    expect(within(firstSummary).getByText('50%')).toBeInTheDocument();
    expect(within(firstSummary).getByTestId('quizzes-passed')).toHaveTextContent(/correct attempts/i);
    expect(within(firstSummary).getByTestId('quizzes-failed')).toHaveTextContent(/incorrect attempts/i);
    fireEvent.keyDown(firstSummary, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByRole('radio', { name: /Option 1/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Quiz 2: incorrect' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Option 0/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByText('Attempt #2 • Score: 100%');
    expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz 2: correct' })).toBeInTheDocument();
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent(
      mode === 'full_review' ? 'Reviewed' : 'Practice finished');
    fireEvent.click(screen.getByRole('button', { name: 'View Summary' }));
    const nextSummary = await screen.findByRole('dialog', { name: 'Revision Summary' });
    await waitFor(() => expect(within(nextSummary).getByText('66%')).toBeInTheDocument());
    expect(within(nextSummary).getByTestId('quizzes-passed')).toHaveTextContent('2');
    expect(within(nextSummary).getByTestId('quizzes-failed')).toHaveTextContent('1');
    expect(h.wire.retry.completed_at).toBe(h.wire.mixed.completed_at);
    fireEvent.keyDown(nextSummary, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Open Table of Contents' }));
    const toc = await screen.findByRole('dialog');
    expect(within(toc).queryByText(/Mastered/)).not.toBeInTheDocument();
    const aRow = within(toc).getByRole('button', { name: 'Topic A' }).closest('tr');
    if (!aRow) throw new Error('Expected Topic A table row');
    expect(aRow).toHaveTextContent(mode === 'full_review' ? /Reviewed/ : /Practice finished/);
    fireEvent.keyDown(toc, { key: 'Escape' });
    await act(async () => { await h.router.navigate('/history'); });
    fireEvent.click(await screen.findByTestId('revision-history-toggle'));
    const row = await screen.findByTestId('revision-row');
    expect(row).toHaveTextContent('66%');
    expect(row).not.toHaveTextContent(/Mastered/);
    fireEvent.click(row);
    await screen.findByRole('heading', { name: 'Topic A' });
    expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
  });
});

describe('failure and route isolation', () => {
  it('A14: failed retry and review preserve previous feedback, inputs and reading state', async () => {
    const h = mountRevision('full_review', wires.full_review.before_review);
    await screen.findByRole('button', { name: 'Quiz 2: incorrect' });
    fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    fireEvent.click(screen.getByRole('radio', { name: /Option 0/ }));
    transport.submit.mockRejectedValueOnce(new Error('Disposable submission failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('radio', { name: /Option 0/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Quiz 2: incorrect' })).toHaveClass('bg-red-500');
    expect(screen.getByText('Explanation q1-1')).toBeInTheDocument();
    transport.review.mockRejectedValueOnce(new Error('Disposable review failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
    await waitFor(() => expect(transport.review).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeEnabled());
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reading pending');
    expect(screen.getByRole('radio', { name: /Option 0/ })).toBeChecked();
    expect(h.wire.original.nodes[0].status).toBe('COMPLETED');
  });

  it.each(['resolve', 'reject'])('A19: late %s cannot leak loading/results/selections/summary into a new route', async (outcome) => {
    const h = mountRevision('quiz_only');
    await screen.findByRole('heading', { name: 'Topic A' });
    const pending = deferred<RevisionQuizResponse>();
    transport.submit.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('radio', { name: /Option 0/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByRole('button', { name: 'Submitting...' });
    await navigateTo(h, h.wire.fresh.id);
    await screen.findByRole('button', { name: 'Quiz 1: unanswered' });
    expect(screen.getByRole('radio', { name: /Option 0/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeDisabled();
    await act(async () => {
      if (outcome === 'resolve') pending.resolve(h.wire.submissions[0]);
      else pending.reject(new Error('Old-route failure'));
    });
    expect(screen.getByRole('button', { name: 'Quiz 1: unanswered' })).toBeInTheDocument();
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submitting...' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Summary' })).not.toBeInTheDocument();
  });

  it('A19: a late review and an old summary response cannot complete or obscure the destination', async () => {
    const h = mountRevision('full_review');
    await screen.findByRole('heading', { name: 'Topic A' });
    const review = deferred<RevisionNodeProgressWithDetails>();
    transport.review.mockReturnValueOnce(review.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
    await waitFor(() => expect(transport.review).toHaveBeenCalledOnce());
    await navigateTo(h, h.wire.fresh.id);
    await screen.findByRole('button', { name: 'Mark as Reviewed' });
    await act(async () => { review.resolve(h.wire.reviews[0]); });
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reading pending');
    expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeEnabled();
    h.setCurrent(h.wire.mixed);
    await navigateTo(h, h.wire.initial.id);
    await screen.findByRole('button', { name: 'View Summary' });
    const summaryGate = deferred<RevisionSummary>();
    transport.summary.mockReturnValueOnce(summaryGate.promise);
    fireEvent.click(screen.getByRole('button', { name: 'View Summary' }));
    await waitFor(() => expect(transport.summary).toHaveBeenCalled());
    await navigateTo(h, h.wire.fresh.id);
    await act(async () => { summaryGate.resolve(h.wire.summary_mixed); });
    await waitFor(() => expect(screen.getByTestId('revision-status-badge'))
      .toHaveTextContent('Reading pending'));
    expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Summary' })).not.toBeInTheDocument();
  });
});

async function navigateTo(h: ReturnType<typeof mountRevision>, id: string) {
  await act(async () => { await h.router.navigate(h.route(id)); });
}
async function completeReading() {
  fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
  await waitFor(() => expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reviewed'));
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  await screen.findByRole('heading', { name: 'Topic B' });
  fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
  await waitFor(() => expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reviewed'));
  fireEvent.click(screen.getByRole('button', { name: 'Previous topic' }));
  await screen.findByRole('heading', { name: 'Topic A' });
}

// Framer Motion spring/exit transitions do not run deterministically in jsdom;
// every client component test in this repository mocks the same boundary. All
// revision components, hooks, QueryClient, and the router remain real.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: ComponentPropsWithoutRef<'div'>) => <div {...props}>{children}</div>,
    article: ({ children, ...props }: ComponentPropsWithoutRef<'article'>) => <article {...props}>{children}</article>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

// React Router passes a jsdom AbortSignal into undici Request on navigation,
// which rejects the cross-realm signal. No loaders/actions are used, so
// dropping the incompatible signal is safe test infrastructure.
const NativeRequest = globalThis.Request;
function nativeRequestAccepts(signal: unknown): boolean {
  try {
    new NativeRequest('http://localhost/', { signal: signal as AbortSignal });
    return true;
  } catch {
    return false;
  }
}
class RouterCompatibleRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal != null && !nativeRequestAccepts(init.signal)) {
      const rest: RequestInit = { ...init };
      delete rest.signal;
      super(input, rest);
      return;
    }
    super(input, init);
  }
}
globalThis.Request = RouterCompatibleRequest;

const transport = vi.hoisted(() => ({
  original: vi.fn(), revision: vi.fn(), submit: vi.fn(), review: vi.fn(),
  summary: vi.fn(), create: vi.fn(), list: vi.fn(), stream: vi.fn(),
}));
vi.mock('@/lib/learningApi', () => ({
  getLearningSession: transport.original,
  getRevisionSession: transport.revision,
  submitRevisionQuiz: transport.submit,
  markNodeReviewed: transport.review,
  getRevisionSummary: transport.summary,
  createRevisionSession: transport.create,
  getRevisionsList: transport.list,
}));
vi.mock('@/lib/chatApi', () => ({ streamConceptChat: transport.stream }));

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function nodeStatus(value: unknown): value is RevisionNodeProgressWithDetails['status'] {
  return value === 'pending' || value === 'reviewed' || value === 'quiz_passed' || value === 'quiz_failed';
}
function attempt(value: unknown): value is RevisionQuizAttemptResult {
  return object(value) && typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.revision_session_id === 'string' && typeof value.node_id === 'string' &&
    Number.isInteger(value.quiz_index) && typeof value.quiz_index === 'number' && value.quiz_index >= 0 &&
    Number.isInteger(value.attempt_number) && Number.isInteger(value.quiz_attempt_count) &&
    strings(value.selected_option_ids) && typeof value.is_correct === 'boolean' &&
    (value.score_percent === 0 || value.score_percent === 100) && strings(value.correct_option_ids) &&
    typeof value.explanation === 'string' && nullableString(value.selected_explanation) &&
    typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
}
function submission(value: unknown): value is RevisionQuizResponse {
  return attempt(value) && object(value) && nodeStatus(value.revision_node_status);
}
function progress(value: unknown): value is RevisionNodeProgressWithDetails {
  return object(value) && typeof value.id === 'string' && typeof value.node_id === 'string' &&
    typeof value.node_title === 'string' && Number.isInteger(value.sequence_index) &&
    nodeStatus(value.status) && nullableString(value.reviewed_at) && nullableString(value.content_reviewed_at) &&
    Number.isInteger(value.quiz_count) && Array.isArray(value.quiz_results) && value.quiz_results.every(attempt);
}
function notices(value: unknown): boolean {
  return Array.isArray(value) && value.every((notice: unknown) => object(notice) &&
    ['legacy_review_inferred', 'legacy_review_required', 'incompatible_attempts', 'completion_recalculated']
      .includes(String(notice.code)) && nullableString(notice.node_id) && Number.isInteger(notice.attempt_count));
}
function revision(value: unknown): value is RevisionSessionWithProgress {
  return object(value) && typeof value.id === 'string' && typeof value.original_session_id === 'string' &&
    Number.isInteger(value.revision_number) && (value.mode === 'full_review' || value.mode === 'quiz_only') &&
    (value.status === 'in_progress' || value.status === 'completed') && Number.isInteger(value.progress_percent) &&
    (value.total_quiz_score_percent === null || Number.isInteger(value.total_quiz_score_percent)) &&
    typeof value.started_at === 'string' && nullableString(value.completed_at) && notices(value.notices) &&
    Array.isArray(value.nodes) && value.nodes.every(progress);
}
function summary(value: unknown): value is RevisionSummary {
  return object(value) && typeof value.revision_id === 'string' &&
    (value.mode === 'full_review' || value.mode === 'quiz_only') && Number.isInteger(value.progress_percent) &&
    (value.total_quiz_score_percent === null || Number.isInteger(value.total_quiz_score_percent)) &&
    ['nodes_reviewed', 'nodes_total', 'quizzes_passed', 'quizzes_failed', 'quizzes_total']
      .every((key) => Number.isInteger(value[key])) &&
    (value.time_spent_seconds === null || typeof value.time_spent_seconds === 'number') &&
    (value.comparison === null || (object(value.comparison) &&
      typeof value.comparison.original_quiz_score_percent === 'number' &&
      typeof value.comparison.improvement_percent === 'number')) && notices(value.notices);
}
function concept(value: unknown): value is ConceptNode {
  if (!object(value) || typeof value.id !== 'string' || typeof value.learning_session_id !== 'string' ||
    typeof value.title !== 'string' || typeof value.content_markdown !== 'string' ||
    value.status !== 'COMPLETED' || !Number.isInteger(value.sequence_index) ||
    !nullableString(value.error_message) || typeof value.retry_available !== 'boolean' ||
    !nullableString(value.updated_at) || typeof value.created_at !== 'string') return false;
  const cards: unknown[] = [];
  if (value.quiz !== null && value.quiz !== undefined) cards.push(value.quiz);
  if (value.quiz_set !== null && value.quiz_set !== undefined) {
    if (!object(value.quiz_set) || !Array.isArray(value.quiz_set.quizzes)) return false;
    cards.push(...value.quiz_set.quizzes);
  }
  return cards.every((card) => object(card) && typeof card.question_text === 'string' &&
    (card.question_type === 'single_choice' || card.question_type === 'multiple_choice') &&
    ['easy', 'medium', 'hard'].includes(String(card.difficulty)) && Array.isArray(card.options) &&
    card.options.every((option: unknown) => object(option) && typeof option.option_id === 'string' &&
      typeof option.display_label === 'string' && typeof option.text === 'string' &&
      typeof option.explanation === 'string' && typeof option.is_correct === 'boolean'));
}
function original(value: unknown): value is LearningSessionWithNodes {
  return object(value) && typeof value.id === 'string' && typeof value.query === 'string' &&
    typeof value.course_title === 'string' && nullableString(value.user_id) &&
    Number.isInteger(value.total_nodes) && Number.isInteger(value.completed_nodes) &&
    nullableString(value.last_active_node_id) && typeof value.created_at === 'string' &&
    nullableString(value.updated_at) && Array.isArray(value.nodes) && value.nodes.every(concept);
}
interface Wire {
  original: LearningSessionWithNodes;
  initial: RevisionSessionWithProgress;
  partial: RevisionSessionWithProgress;
  before_review: RevisionSessionWithProgress;
  mixed: RevisionSessionWithProgress;
  retry: RevisionSessionWithProgress;
  fresh: RevisionSessionWithProgress;
  submissions: RevisionQuizResponse[];
  reviews: RevisionNodeProgressWithDetails[];
  summary_mixed: RevisionSummary;
  summary_retry: RevisionSummary;
}
function decode(value: unknown): Wire {
  if (!object(value) || !original(value.original) || !revision(value.initial) ||
    !revision(value.partial) || !revision(value.before_review) || !revision(value.mixed) ||
    !revision(value.retry) || !revision(value.fresh) || !Array.isArray(value.submissions) ||
    !value.submissions.every(submission) || !Array.isArray(value.reviews) ||
    !value.reviews.every(progress) || !summary(value.summary_mixed) || !summary(value.summary_retry)) {
    throw new Error('Serialized server response fails the required frontend contract');
  }
  return { original: value.original, initial: value.initial, partial: value.partial,
    before_review: value.before_review, mixed: value.mixed, retry: value.retry, fresh: value.fresh,
    submissions: value.submissions, reviews: value.reviews,
    summary_mixed: value.summary_mixed, summary_retry: value.summary_retry };
}
const raw: unknown = JSON.parse(execFileSync(
  resolve('../server/.venv/Scripts/python.exe'),
  ['-m', 'server.tests.revision_acceptance_helpers', '--wire'],
  { cwd: resolve('..'), encoding: 'utf8' },
));
if (!object(raw)) throw new Error('Expected both serialized modes');
const wires: Record<RevisionMode, Wire> = {
  full_review: decode(raw.full_review), quiz_only: decode(raw.quiz_only),
};
const clients: QueryClient[] = [];
beforeEach(() => {
  for (const mock of Object.values(transport)) mock.mockReset();
  localStorage.clear();
  transport.stream.mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    media: query, matches: !query.includes('prefers-reduced-motion'), onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: () => true,
  }));
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function deferred<T>() {
  let resolveValue: (value: T) => void = () => { throw new Error('Uninitialized resolver'); };
  let rejectValue: (error: Error) => void = () => { throw new Error('Uninitialized rejecter'); };
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveValue = resolvePromise; rejectValue = rejectPromise;
  });
  return { promise, resolve: resolveValue, reject: rejectValue };
}
function mountRevision(mode: RevisionMode, initial?: RevisionSessionWithProgress,
  source?: LearningSessionWithNodes) {
  const wire = structuredClone(wires[mode]);
  if (source) wire.original = source;
  let current = initial ?? wire.initial;
  let hold = false;
  const gates: Array<ReturnType<typeof deferred<RevisionSessionWithProgress>>> = [];
  let submissionCount = 0;
  let reviewCount = 0;
  transport.original.mockResolvedValue(wire.original);
  transport.revision.mockImplementation(async (id: string) => {
    if (id === wire.fresh.id) return wire.fresh;
    if (id !== wire.initial.id) throw new Error(`Unexpected revision ${id}`);
    if (hold) { const gate = deferred<RevisionSessionWithProgress>(); gates.push(gate); return gate.promise; }
    return current;
  });
  transport.submit.mockImplementation(async (rid: string, node: string, ids: string[], index?: number) => {
    const response = wire.submissions[submissionCount];
    if (!response || response.revision_session_id !== rid || response.node_id !== node ||
      response.quiz_index !== index || JSON.stringify(response.selected_option_ids) !== JSON.stringify(ids)) {
      throw new Error('Request identity/selection does not match the serialized response');
    }
    submissionCount += 1;
    current = submissionCount === 1 ? wire.partial : submissionCount === 2
      ? (mode === 'full_review' && reviewCount < 2 ? wire.before_review : wire.mixed) : wire.retry;
    return response;
  });
  transport.review.mockImplementation(async (rid: string, node: string) => {
    const response = wire.reviews.find((item) => item.node_id === node);
    if (rid !== wire.initial.id || !response) throw new Error('Unexpected review request');
    reviewCount += 1;
    current = { ...current, nodes: current.nodes.map((item) => item.node_id === node ? response : item),
      progress_percent: reviewCount === 2 ? 100 : 50,
      status: reviewCount === 2 ? 'completed' : 'in_progress',
      completed_at: reviewCount === 2 ? wire.mixed.completed_at : null };
    return response;
  });
  transport.summary.mockImplementation(async () => submissionCount >= 3 ? wire.summary_retry : wire.summary_mixed);
  transport.create.mockResolvedValue(wire.fresh);
  transport.list.mockImplementation(async () => ({ revisions: [current], total_count: 1 }));
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: 0 }, mutations: { retry: false },
  } });
  clients.push(queryClient);
  const route = (id: string) => `/learn/${wire.original.id}/revise/${id}`;
  const router: ReturnType<typeof createMemoryRouter> = createMemoryRouter([
    { path: '/learn/:sessionId/revise/:revisionId', element: <RevisionPage /> },
    { path: '/history', element: <RevisionHistoryList sessionId={wire.original.id}
      onViewRevision={(id) => { void router.navigate(route(id)); }} /> },
    { path: '/learn', element: <p>Disposable dashboard</p> },
  ], { initialEntries: [route(current.id)] });
  const view = render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
  return { wire, queryClient, router, view, route,
    posts: () => transport.submit.mock.calls,
    holdRefetch: () => { hold = true; },
    releaseRefetch: async () => {
      hold = false;
      await act(async () => { for (const gate of gates.splice(0)) gate.resolve(current); });
    },
    setCurrent: (value: RevisionSessionWithProgress) => { current = value; },
  };
}
