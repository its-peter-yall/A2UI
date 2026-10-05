# P4 — Shared Feedback and Revision Card/Quiz Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this harness load `executing-plans` and `test-driven-development`; do not dispatch research or review agents.

**Goal:** Give Full Review and Practice independent, accessible per-quiz feedback, preserved controlled inputs/retries, neutral topic cards, and normal-learning curiosity/citation presentation without changing original mastery.

**Architecture:** Extract a stateless option/result renderer; normal learning retains its existing action policy around it. A controlled revision quiz section consumes authoritative attempts separately from a small pure UI reducer, and the revision card forwards topic-scoped chat callbacks. P6 owns the reducer state above topic unmounting, server/query/cache orchestration, request routing, completion, summary, and chat transport.

**Tech Stack:** Existing React 19, strict TypeScript, Tailwind 4, `cn`, MarkdownRenderer/InlineMarkdown, CuriositySpark/parser, SourceCitations, Vitest 3, Testing Library and jsdom; no dependencies added.

---

## Read first, scope, and fixed contracts

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/TESTING.md`, `docs/CONVENTIONS.md`, `docs/STRUCTURE.md`, `docs/INTEGRATIONS.md`, `docs/CONCERNS.md`, and all of `docs/completed-course-review-parity/goal.md`; read P4 ownership, acceptance, commit safety, and P1/P5 handoffs in `docs/completed-course-review-parity/state.md`. This plan consumes P1's actual committed contracts and P5's actual controller. No stack deviation is proposed.

Inline official-doc verification (not a research phase): React's controlled input and pure reducer patterns were checked through Context7 `/reactjs/react.dev`, sources `https://react.dev/reference/react-dom/components/input`, `https://react.dev/reference/react/useReducer`, and `https://react.dev/learn/sharing-state-between-components`. Use boolean `checked`, synchronous parent updates, stable option IDs, and immutable reducers. Existing Testing Library/Markdown APIs below follow installed local patterns.

P1 facts that must not change:

- `RevisionQuizAttemptResult`: `id`, `revision_session_id`, `node_id`, **required** zero-based `quiz_index`, `attempt_number` (node-wide sequence), `quiz_attempt_count` (per revision/node/quiz), `selected_option_ids`, `is_correct`, `score_percent: 0 | 100`, `correct_option_ids`, `explanation`, `selected_explanation: string | null`, `created_at`.
- `RevisionQuizResponse` extends that with `revision_node_status`; this is **not** quiz correctness.
- Restore metadata is `content_reviewed_at: string | null`, `quiz_count`, `quiz_results: RevisionQuizAttemptResult[]`. Do not reinterpret `reviewed_at`, mastery, or sticky topic statuses as reading completion.
- Incorrect attempts disclose no correct IDs or aggregate explanation. The renderer uses each option's **own** explanation, never the aggregate `explanation`/`selected_explanation` or another option's explanation.
- Stable-ID evaluation is server-owned. P4 never re-evaluates an answer using `option.is_correct`.

P5 facts: card callbacks must call P6, which can wrap `chat.askQuestion(question, node.id, node.title)` and `chat.toggleHeadingChat(headingId, node.id, node.title)`. Only pass `chat.selectedHeadingIds` to a card when `chat.chatNodeId === node.id`. P4 does not import the chat controller, mount chat, send messages, manage prefill, or delete chat history.

### File responsibility map (exclusive P4 ownership)

| Path | Action and responsibility |
| --- | --- |
| `client/src/features/learning/QuizResultDetails.tsx` | Create presentation-only result header/question/options; own explanation disclosure and feedback focus/live region; accept an optional header accessory for the learning wrapper. |
| `client/src/features/learning/QuizFeedback.tsx` | Modify to delegate details; preserve the existing QuizSet progress/difficulty and original mastery/next/retry/continue policy. |
| `client/src/features/learning/revisionQuizState.ts` | Create UI state, immutable navigation/selection/retry reducer, matched-result selector and feedback/input view helper. No requests or completion calculations. |
| `client/src/features/learning/RevisionQuizSection.tsx` | Create controlled section; radio/checkbox inputs, submit callback, Previous/Next/Skip, independent compact indicators, retry, scoped pending/error rendering. |
| `client/src/features/learning/RevisionConceptCard.tsx` | Modify mode layout, neutral border, explicit reading/practice badges, review action/error, parser/widget/citations, callbacks, and section delegation. |
| `client/src/features/learning/QuizResultDetails.test.tsx` | Create stable-ID, shuffled multi-correct, own-explanation/disclosure/focus tests. |
| `client/src/features/learning/QuizFeedback.test.tsx` | Create delegation regression plus learning-only mastery/action policy tests. |
| `client/src/features/learning/revisionQuizState.test.ts` | Create immutable reducer/matching/retry/navigation tests. |
| `client/src/features/learning/RevisionQuizSection.test.tsx` | Create controlled interaction/restoration/pending/error/navigation/indicator tests. |
| `client/src/features/learning/RevisionConceptCard.test.tsx` | Create both-mode component tests, reading/coverage presentation, unmount preservation, curiosity/heading/citation/layout/failure tests. |
| `client/src/features/learning/ConceptCard.test.tsx` | Add **only** normal feedback regressions; retain all existing tests and mocks. |

No other source/config/server/page/hook/test file is writable. In particular `ConceptCard.tsx`, `RevisionPage.tsx`, the revision hooks/API/history/summary, P5 files, parser/widget production files, and barrel files stay untouched. Import the new exports directly by file path. Read `git status --short` and owned-file diffs before every edit; preserve concurrent work.

### Controlled state and temporary additive compatibility

The current page still passes `quizResult`, `isSubmitting` and no UI controller. Keep these existing props and make the new card props additive so the P4 commit builds before P6. Only the card has a local fallback state for that legacy caller. The new section is **always controlled**. P6 must supply `revisionId`, `quizState`, `onQuizStateChange`, and keyed request state; never rely on the fallback for mounted-course navigation persistence.

Saved results are separate props, not copied into the reducer. Retry stores the ID of the saved wrong attempt it hides, and clears **only** that quiz's draft selection. Its indicator remains red. When a new saved attempt ID arrives, feedback automatically shows; refetching the same saved attempt must not cancel an active retry. Submission never clears draft inputs or creates correctness/completion. A failed request therefore preserves both draft inputs and saved results. On retry failure show the prior saved feedback in a labeled details disclosure alongside editable inputs; do not silently discard it or replace it with manufactured green feedback.

On wrong feedback, option texts already visible in the quiz can remain neutral. “Hide unselected correct answers” means no unselected explanations, correctness labels, correctness icons, or `is_correct`-derived styling; the full quiz's option text alone is not an answer key. Incorrect multi-select feedback says the **selection** is incorrect and labels every disclosed selected explanation neutrally. It never claims every selected item is individually wrong or points to missing correct choices.

## Commands and safe atomic commits

Every `npm`/`npx` command below runs in **`D:/Peter/Personal Stuffs/A2UI/client`**. Git commands run in **`D:/Peter/Personal Stuffs/A2UI`**. Red means the new behavior assertion or missing new module fails, not a deliberately broken import to an existing library. Stop if a red unexpectedly passes, or if failure is unrelated; establish an honest failing behavior before implementing.

For **each** task commit use this exact PowerShell pattern from the root, setting `$paths` to that task's explicit file list and `$message` to its stated message. Never use broad staging. Stop on foreign staged files. The only backslash in the mutex string below is required Windows namespace syntax, not a file path.

```powershell
$mutex = [System.Threading.Mutex]::new($false, 'Local\A2UI_completed_course_review_parity_git')
$held = $false
try {
  try { $held = $mutex.WaitOne(120000) }
  catch [System.Threading.AbandonedMutexException] { $held = $true }
  if (-not $held) { throw 'Commit mutex timeout; coordinate with orchestrator.' }
  $foreign = @(git diff --cached --name-only)
  if ($LASTEXITCODE -ne 0 -or $foreign.Count -gt 0) {
    throw 'Existing staged changes; STOP without altering the index.'
  }
  git add -- $paths
  if ($LASTEXITCODE -ne 0) { throw 'Staging failed.' }
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace check failed.' }
  git diff --cached --stat
  $staged = @(git diff --cached --name-only)
  if (@($staged | Where-Object { $_ -notin $paths }).Count -gt 0) {
    throw 'Foreign staged paths detected; STOP.'
  }
  git diff --cached -- $paths
  git commit -m $message
  if ($LASTEXITCODE -ne 0) { throw 'Commit failed; report index state.' }
} finally {
  if ($held) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
```

Use the full mandatory banner in every new source/test code block below. These are **source snippets**, not a plan-level banner. Existing banners remain. Do not add `as` casts, default exports, suppressions, or empty catch blocks.

## Task 1: Shared stable-ID result details (A1, A2, A4)

**Files:** Create `client/src/features/learning/QuizResultDetails.tsx` and `client/src/features/learning/QuizResultDetails.test.tsx`.

- [ ] **Step 1: Write the failing tests** in the exact new test path:

```tsx
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

  it('does not claim an individually correct selected item is wrong in an incomplete multi-selection', () => {
    render(<QuizResultDetails quiz={quiz} result={{
      ...correct, is_correct: false, score_percent: 0,
      selected_option_ids: ['two'], correct_option_ids: [],
    }} attemptCount={1} />);
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('Your selection is incorrect.')).toBeInTheDocument();
    expect(screen.getByText('Two is the only even prime.')).toBeInTheDocument();
    expect(screen.queryByText('Three has only two divisors.')).not.toBeInTheDocument();
    expect(screen.queryByText('Nine factors as three times three.')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
    expect(screen.queryByText(/Why this is incorrect/)).not.toBeInTheDocument();
    expect(screen.getByTestId('quiz-result-option-three')).not.toHaveClass('border-green-500');
    expect(screen.getByTestId('quiz-result-option-two')).toHaveClass('border-red-500');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
```

- [ ] **Step 2: RED.** Run `npm run test -- --run src/features/learning/QuizResultDetails.test.tsx`. Expect FAIL: new renderer missing. Record command, exit code, and failing assertion/module.
- [ ] **Step 3: Create the minimal renderer** in the exact new source path:

```tsx
/**
 * ============================================================================
 * FILE: QuizResultDetails.tsx
 * LOCATION: client/src/features/learning/QuizResultDetails.tsx
 * ============================================================================
 * PURPOSE:
 *    Render quiz outcome and option-specific explanations without actions.
 * ROLE IN PROJECT:
 *    Shared presentation for normal learning and revision; callers own policy.
 * KEY COMPONENTS:
 *    - QuizResultDetails: Stable-ID disclosure and accessible result focus
 * ============================================================================
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { QuizCard, QuizSubmitResponse } from '@/types/learning';
import { cn } from '@/lib/utils';
import { InlineMarkdown, MarkdownRenderer } from './MarkdownRenderer';

export interface QuizResultDetailsProps {
  quiz: QuizCard;
  result: Pick<QuizSubmitResponse,
    'is_correct' | 'score_percent' | 'selected_option_ids' | 'correct_option_ids'>;
  attemptCount: number;
  headerAccessory?: ReactNode;
}

export function QuizResultDetails({
  quiz, result, attemptCount, headerAccessory,
}: QuizResultDetailsProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { headerRef.current?.focus(); }, [result]);
  const selected = new Set(result.selected_option_ids);
  const correct = new Set(result.is_correct ? result.correct_option_ids : []);
  return (
    <div className="space-y-6">
      <div ref={headerRef} tabIndex={-1} role="status" aria-label="Quiz result"
        aria-live="polite" aria-atomic="true" className={cn(
          'flex items-center gap-3 rounded-lg p-4 focus-visible:ring-2 focus-visible:ring-primary',
          result.is_correct
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
        )}>
        <span aria-hidden="true">{result.is_correct ? '✅' : '❌'}</span>
        <div>
          <p className="text-lg font-semibold">{result.is_correct ? 'Correct!' : 'Incorrect'}</p>
          <p className="text-sm">Attempt #{attemptCount} • Score: {result.score_percent}%</p>
          {!result.is_correct && quiz.question_type === 'multiple_choice' && (
            <p className="text-sm">Your selection is incorrect.</p>
          )}
        </div>
        {headerAccessory}
      </div>
      <MarkdownRenderer content={quiz.question_text} className="text-lg font-medium [&>div]:!mt-0" />
      <div className="space-y-3">
        {quiz.options.map((option) => {
          const isSelected = selected.has(option.option_id);
          const isCorrect = correct.has(option.option_id);
          const disclose = result.is_correct || isSelected;
          return (
            <div key={option.option_id} data-testid={`quiz-result-option-${option.option_id}`}
              className={cn('rounded-lg border-2 p-4',
                isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : !result.is_correct && isSelected
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-muted bg-muted/30',
              )}>
              <div className="flex items-start gap-3">
                <span className="shrink-0 font-mono">{option.display_label}.</span>
                <div className="flex-1 space-y-2">
                  <InlineMarkdown content={option.text} className="font-medium" />
                  {isSelected && <span className="ml-2 text-xs text-muted-foreground">Your answer</span>}
                  {result.is_correct && (
                    <p className="text-xs font-medium">{isCorrect ? 'Correct answer' : 'Distractor'}</p>
                  )}
                  {disclose && (
                    <div>
                      {!result.is_correct && <p className="text-xs font-medium">Selected option explanation</p>}
                      <MarkdownRenderer content={option.explanation} className="text-sm [&>div]:!mt-0" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: GREEN.** Run `npm run test -- --run src/features/learning/QuizResultDetails.test.tsx`; expect all tests PASS. Do not render mastery or retry inside this shared component.
- [ ] **Step 5: Commit** using the mutex pattern: `$paths = @('client/src/features/learning/QuizResultDetails.tsx', 'client/src/features/learning/QuizResultDetails.test.tsx')`; `$message = 'feat(review-parity): share stable-id quiz result details'`.

## Task 2: Preserve original learning policy while delegating details

**Files:** Modify `client/src/features/learning/QuizFeedback.tsx`, create `client/src/features/learning/QuizFeedback.test.tsx`, append normal-feedback regression only to `client/src/features/learning/ConceptCard.test.tsx`. Do not change `ConceptCard.tsx` or `useQuizFeedback.ts`.

- [ ] **Step 1: Write `QuizFeedback.test.tsx`**:

```tsx
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
```

- [ ] **Step 2: Append the following regression** to `ConceptCard.test.tsx`, retaining its banner, mocks, `mockNode`, `renderWithProviders` and all prior tests. Add `QuizCard, QuizSubmitResponse` to its existing type import. Do not mock `QuizFeedback`, `QuizResultDetails`, or `useQuizFeedback`:

```tsx
describe('ConceptCard normal feedback regression', () => {
  test('keeps learning mastery actions and explains each multi-correct option', () => {
    const quiz: QuizCard = {
      question_text: 'Normal learning multi-select', difficulty: 'easy',
      question_type: 'multiple_choice', options: [
        { option_id: 'x', display_label: 'D', text: 'X', is_correct: true, explanation: 'X explanation is unique' },
        { option_id: 'y', display_label: 'A', text: 'Y', is_correct: true, explanation: 'Y explanation is unique' },
        { option_id: 'z', display_label: 'B', text: 'Z', is_correct: false, explanation: 'Z distractor explanation' },
        { option_id: 'w', display_label: 'C', text: 'W', is_correct: false, explanation: 'W distractor explanation' },
      ],
    };
    const result: QuizSubmitResponse = {
      node_id: mockNode.id, attempt_number: 1, is_correct: true,
      score_percent: 100, selected_option_ids: ['y', 'x'], correct_option_ids: ['x', 'y'],
      explanation: 'X explanation is unique', is_mastered: true,
      next_node_unlocked: true, node_status: 'SHOWING_FEEDBACK',
    };
    const onContinue = vi.fn();
    renderWithProviders(<ConceptCard node={{ ...mockNode, status: 'SHOWING_FEEDBACK', quiz }}
      quizResult={result} onContinueToNext={onContinue} />);
    expect(screen.getByText('Y explanation is unique')).toBeInTheDocument();
    expect(screen.getByText('Mastered!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Next Topic →' }));
    expect(onContinue).toHaveBeenCalledWith(mockNode.id);
  });
});
```

- [ ] **Step 3: RED, separately.** Run `npm run test -- --run src/features/learning/QuizFeedback.test.tsx` and `npm run test -- --run src/features/learning/ConceptCard.test.tsx`. Both must FAIL on missing second correct option's own explanation before delegation; existing action tests may already pass. Record both red runs.
- [ ] **Step 4: Replace the imports and implementation after the existing `QuizFeedback.tsx` banner** with this minimal wrapper; retain its filename/location banner and refresh purpose/key components to mention delegated presentation:

```tsx
import { cn } from '@/lib/utils';
import type { QuizCard, QuizSet, QuizSubmitResponse } from '@/types/learning';
import { QuizResultDetails } from './QuizResultDetails';

interface QuizFeedbackProps {
  quiz: QuizCard | QuizSet;
  result: QuizSubmitResponse;
  attemptCount: number;
  currentQuizIndex?: number;
  onRetry?: () => void;
  onContinue?: () => void;
  onNextQuiz?: () => void;
}
export function QuizFeedback({
  quiz, result, attemptCount, currentQuizIndex = 0,
  onRetry, onContinue, onNextQuiz,
}: QuizFeedbackProps) {
  const isQuizSet = 'quizzes' in quiz;
  const currentQuiz = isQuizSet ? quiz.quizzes[currentQuizIndex] ?? quiz.quizzes[0] : quiz;
  if (!currentQuiz) {
    return <div className="p-4 text-center text-muted-foreground">No quiz data available.</div>;
  }
  const totalQuizzes = isQuizSet ? quiz.quizzes.length : 1;
  const hasMoreQuizzes = currentQuizIndex < totalQuizzes - 1;
  const difficultyStyles = {
    easy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <div className="space-y-6">
      {isQuizSet && totalQuizzes > 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Quiz {currentQuizIndex + 1} of {totalQuizzes}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', difficultyStyles[currentQuiz.difficulty])}>
            {currentQuiz.difficulty.charAt(0).toUpperCase() + currentQuiz.difficulty.slice(1)}
          </span>
        </div>
      )}
      <QuizResultDetails quiz={currentQuiz} result={result} attemptCount={attemptCount}
        headerAccessory={result.is_mastered ? (
          <span className="ml-auto rounded bg-green-500 px-2 py-1 text-sm font-medium text-white">Mastered!</span>
        ) : undefined} />
      <div className="flex justify-end gap-3 border-t pt-4">
        {isQuizSet && result.is_correct && hasMoreQuizzes && onNextQuiz && (
          <button type="button" onClick={onNextQuiz}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">
            Next Quiz →
          </button>
        )}
        {!result.is_mastered && onRetry && (!isQuizSet || !result.is_correct || !hasMoreQuizzes) && (
          <button type="button" onClick={onRetry} className="rounded-md border px-4 py-2 hover:bg-muted">Try Again</button>
        )}
        {result.is_mastered && onContinue && (
          <button type="button" onClick={onContinue}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90">
            {result.next_node_unlocked ? 'Continue to Next Topic →' : 'Complete Course 🎉'}
          </button>
        )}
        {result.is_mastered && !onContinue && (
          <span className="px-4 py-2 text-muted-foreground">Course complete! 🎉</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: GREEN.** Run `npm run test -- --run src/features/learning/QuizFeedback.test.tsx` and `npm run test -- --run src/features/learning/ConceptCard.test.tsx`; expect all old and new tests PASS. Original retry policy intentionally remains `!is_mastered`, including existing non-mastered correct-last-quiz behavior. Do not “simplify” mastery policy to revision's wrong-only retry.
- [ ] **Step 6: Commit:** `$paths = @('client/src/features/learning/QuizFeedback.tsx', 'client/src/features/learning/QuizFeedback.test.tsx', 'client/src/features/learning/ConceptCard.test.tsx')`; `$message = 'refactor(review-parity): delegate learning feedback without changing mastery'`.

## Task 3: Pure controlled navigation, drafts, retry, and result matching (A3–A5, A9, A14)

**Files:** Create `client/src/features/learning/revisionQuizState.ts` and `client/src/features/learning/revisionQuizState.test.ts`.

- [ ] **Step 1: Write exact failing reducer tests**:

```ts
/**
 * ============================================================================
 * FILE: revisionQuizState.test.ts
 * LOCATION: client/src/features/learning/revisionQuizState.test.ts
 * ============================================================================
 * PURPOSE:
 *    Verify revision quiz UI state without requests or mastery state.
 * ROLE IN PROJECT:
 *    Protect navigation persistence and independent saved-result identity.
 * KEY COMPONENTS:
 *    - Reducer tests: Drafts, retry, result selection, and immutable updates
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import type { QuizCard, RevisionQuizAttemptResult } from '@/types/learning';
import { createRevisionQuizState, getRevisionQuizView,
  revisionQuizReducer, selectRevisionQuizResult } from './revisionQuizState';

const quiz: QuizCard = {
  question_text: 'Q', difficulty: 'easy', question_type: 'single_choice',
  options: [
    { option_id: 'x', display_label: 'B', text: 'X', is_correct: true, explanation: 'X reason' },
    { option_id: 'y', display_label: 'A', text: 'Y', is_correct: false, explanation: 'Y reason' },
    { option_id: 'z', display_label: 'D', text: 'Z', is_correct: false, explanation: 'Z reason' },
    { option_id: 'w', display_label: 'C', text: 'W', is_correct: false, explanation: 'W reason' },
  ],
};
const wrong: RevisionQuizAttemptResult = {
  id: 'a1', revision_session_id: 'r1', node_id: 'n1', quiz_index: 0,
  attempt_number: 6, quiz_attempt_count: 2, selected_option_ids: ['y'],
  is_correct: false, score_percent: 0, correct_option_ids: [], explanation: '',
  selected_explanation: null, created_at: '2026-10-05T10:00:00Z',
};
describe('revisionQuizState', () => {
  it('preserves keyed selections through Previous/Next/Skip without changing input state', () => {
    const initial = createRevisionQuizState();
    const selected = revisionQuizReducer(initial, { type: 'select', quizIndex: 0, optionIds: ['y', 'y'] });
    const next = revisionQuizReducer(selected, { type: 'navigate', quizIndex: 1, quizCount: 2 });
    const other = revisionQuizReducer(next, { type: 'select', quizIndex: 1, optionIds: ['x'] });
    const back = revisionQuizReducer(other, { type: 'navigate', quizIndex: 0, quizCount: 2 });
    expect(back.selections).toEqual({ 0: ['y'], 1: ['x'] });
    expect(initial.selections).toEqual({});
    expect(selected.currentQuizIndex).toBe(0);
    expect(next.currentQuizIndex).toBe(1);
    expect(revisionQuizReducer(back, { type: 'navigate', quizIndex: -4, quizCount: 2 }).currentQuizIndex).toBe(0);
    expect(revisionQuizReducer(back, { type: 'navigate', quizIndex: 9, quizCount: 2 }).currentQuizIndex).toBe(1);
    expect(revisionQuizReducer(back, { type: 'navigate', quizIndex: 9, quizCount: 0 }).currentQuizIndex).toBe(0);
  });
  it('opens empty retry inputs only for its wrong quiz and retains the saved attempt', () => {
    const base = revisionQuizReducer(createRevisionQuizState(), { type: 'select', quizIndex: 1, optionIds: ['z'] });
    const retry = revisionQuizReducer(base, { type: 'retry', result: wrong });
    expect(getRevisionQuizView(retry, 0, wrong)).toEqual({ selectedOptionIds: [], showFeedback: false });
    expect(retry.selections[1]).toEqual(['z']);
    expect(wrong.selected_option_ids).toEqual(['y']);
    const edited = revisionQuizReducer(retry, { type: 'select', quizIndex: 0, optionIds: ['x'] });
    expect(getRevisionQuizView(edited, 0, { ...wrong })).toEqual({ selectedOptionIds: ['x'], showFeedback: false });
    expect(getRevisionQuizView(edited, 0, { ...wrong, id: 'a2' }).showFeedback).toBe(true);
    // Request errors/pending are external props: no reducer action erases drafts/results.
    expect(edited.selections[0]).toEqual(['x']);
  });
  it('restores saved selections and refuses retry for a correct result', () => {
    const correct: RevisionQuizAttemptResult = { ...wrong, is_correct: true,
      score_percent: 100, selected_option_ids: ['x'], correct_option_ids: ['x'], explanation: 'X reason' };
    const state = createRevisionQuizState();
    expect(getRevisionQuizView(state, 0, correct)).toEqual({ selectedOptionIds: ['x'], showFeedback: true });
    expect(revisionQuizReducer(state, { type: 'retry', result: correct })).toBe(state);
    expect(getRevisionQuizView(state, 1)).toEqual({ selectedOptionIds: [], showFeedback: false });
  });
  it('requires matching revision, node, quiz index, and resolvable stable IDs', () => {
    const results = [wrong, { ...wrong, id: 'foreign', revision_session_id: 'r2' },
      { ...wrong, id: 'other-node', node_id: 'n2' }, { ...wrong, id: 'q2', quiz_index: 1 }];
    expect(selectRevisionQuizResult(results, 'r1', 'n1', 0, quiz)).toEqual(wrong);
    expect(selectRevisionQuizResult(results, 'r3', 'n1', 0, quiz)).toBeUndefined();
    expect(selectRevisionQuizResult([{ ...wrong, selected_option_ids: ['missing'] }], 'r1', 'n1', 0, quiz)).toBeUndefined();
    expect(selectRevisionQuizResult([{ ...wrong, correct_option_ids: ['missing'] }], 'r1', 'n1', 0, quiz)).toBeUndefined();
    expect(selectRevisionQuizResult([wrong], undefined, 'n1', 0, quiz)).toEqual(wrong);
  });
});
```

- [ ] **Step 2: RED.** Run `npm run test -- --run src/features/learning/revisionQuizState.test.ts`; expect FAIL because new helpers are absent.
- [ ] **Step 3: Implement the focused helpers** (no imports from API/query/chat):

```ts
/**
 * ============================================================================
 * FILE: revisionQuizState.ts
 * LOCATION: client/src/features/learning/revisionQuizState.ts
 * ============================================================================
 * PURPOSE:
 *    Pure revision quiz navigation, selection, and retry-display helpers.
 * ROLE IN PROJECT:
 *    Page-owned ephemeral UI state stays separate from authoritative attempts.
 * KEY COMPONENTS:
 *    - revisionQuizReducer: Immutable UI changes
 *    - selectRevisionQuizResult: Identity and option compatibility boundary
 *    - getRevisionQuizView: Restored feedback versus editable retry inputs
 * ============================================================================
 */
import type { QuizCard, RevisionQuizAttemptResult } from '@/types/learning';

export interface RevisionQuizUiState {
  currentQuizIndex: number;
  selections: Partial<Record<number, string[]>>;
  retryAttemptIds: Partial<Record<number, string>>;
}
export type RevisionQuizUiAction =
  | { type: 'navigate'; quizIndex: number; quizCount: number }
  | { type: 'select'; quizIndex: number; optionIds: string[] }
  | { type: 'retry'; result: RevisionQuizAttemptResult };
export interface RevisionQuizRequestState {
  isPending: boolean;
  error?: string;
}
export type RevisionQuizRequestStates = Partial<Record<number, RevisionQuizRequestState>>;

export function createRevisionQuizState(): RevisionQuizUiState {
  return { currentQuizIndex: 0, selections: {}, retryAttemptIds: {} };
}
export function revisionQuizReducer(
  state: RevisionQuizUiState, action: RevisionQuizUiAction,
): RevisionQuizUiState {
  switch (action.type) {
    case 'navigate':
      return { ...state, currentQuizIndex: Math.max(0,
        Math.min(action.quizIndex, Math.max(0, action.quizCount - 1))) };
    case 'select':
      return { ...state, selections: { ...state.selections,
        [action.quizIndex]: [...new Set(action.optionIds)] } };
    case 'retry':
      if (action.result.is_correct) return state;
      return { ...state,
        selections: { ...state.selections, [action.result.quiz_index]: [] },
        retryAttemptIds: { ...state.retryAttemptIds,
          [action.result.quiz_index]: action.result.id },
      };
  }
}
export function selectRevisionQuizResult(
  results: RevisionQuizAttemptResult[], revisionId: string | undefined,
  nodeId: string, quizIndex: number, quiz: QuizCard,
): RevisionQuizAttemptResult | undefined {
  const availableIds = new Set(quiz.options.map((option) => option.option_id));
  return results.find((result) =>
    (revisionId === undefined || result.revision_session_id === revisionId) &&
    result.node_id === nodeId && result.quiz_index === quizIndex &&
    result.selected_option_ids.every((id) => availableIds.has(id)) &&
    result.correct_option_ids.every((id) => availableIds.has(id)),
  );
}
export function getRevisionQuizView(
  state: RevisionQuizUiState, quizIndex: number, result?: RevisionQuizAttemptResult,
): { selectedOptionIds: string[]; showFeedback: boolean } {
  const showFeedback = result !== undefined && state.retryAttemptIds[quizIndex] !== result.id;
  return {
    selectedOptionIds: showFeedback && result
      ? result.selected_option_ids : state.selections[quizIndex] ?? [],
    showFeedback,
  };
}
```

`revisionId: string | undefined` is a required positional input to the selector, not an optional component prop; the undefined branch exists only for the legacy card bridge. P6 always passes the actual ID. Results are already latest per index under P1; do not implement another score/progress projection here.

- [ ] **Step 4: GREEN.** Re-run `npm run test -- --run src/features/learning/revisionQuizState.test.ts`; expect PASS.
- [ ] **Step 5: Commit:** `$paths = @('client/src/features/learning/revisionQuizState.ts', 'client/src/features/learning/revisionQuizState.test.ts')`; `$message = 'feat(review-parity): add controlled revision quiz ui state helpers'`.

## Task 4: Controlled quiz UI, independent indicators, failure-safe retries (A1–A5, A8, A9, A14)

**Files:** Create `client/src/features/learning/RevisionQuizSection.tsx` and `client/src/features/learning/RevisionQuizSection.test.tsx`.

- [ ] **Step 1: Write exact failing section tests**. This harness deliberately retains state outside the child and changes results through explicit props; there is no query/API mock because the section must not perform I/O:

```tsx
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
```

- [ ] **Step 2: RED.** Run `npm run test -- --run src/features/learning/RevisionQuizSection.test.tsx`; expect FAIL because section is missing.
- [ ] **Step 3: Create props, input and navigation UI** with the complete source below. Review the first half separately: the section never calls a state setter internally, submits without clearing inputs, and all navigation dispatches only `navigate`.

```tsx
/**
 * ============================================================================
 * FILE: RevisionQuizSection.tsx
 * LOCATION: client/src/features/learning/RevisionQuizSection.tsx
 * ============================================================================
 * PURPOSE:
 *    Controlled revision quiz inputs, navigation, feedback, and indicators.
 * ROLE IN PROJECT:
 *    Topic presentation consumes saved attempts and page-owned UI state.
 * KEY COMPONENTS:
 *    - RevisionQuizSection: Accessible controls with no mastery or requests
 * ============================================================================
 */
import type { QuizCard, RevisionQuizAttemptResult } from '@/types/learning';
import { cn } from '@/lib/utils';
import { InlineMarkdown, MarkdownRenderer } from './MarkdownRenderer';
import { QuizResultDetails } from './QuizResultDetails';
import { getRevisionQuizView, revisionQuizReducer, selectRevisionQuizResult } from './revisionQuizState';
import type { RevisionQuizUiState, RevisionQuizUiAction, RevisionQuizRequestStates } from './revisionQuizState';

export interface RevisionQuizSectionProps {
  revisionId?: string;
  nodeId: string;
  quizzes: QuizCard[];
  results: RevisionQuizAttemptResult[];
  state: RevisionQuizUiState;
  onStateChange: (next: RevisionQuizUiState) => void;
  onSubmit: (nodeId: string, optionIds: string[], quizIndex: number) => void;
  requestStates?: RevisionQuizRequestStates;
}
const controlClass = 'rounded-md border px-3 py-1.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40';
export function RevisionQuizSection({
  revisionId, nodeId, quizzes, results, state, onStateChange, onSubmit, requestStates = {},
}: RevisionQuizSectionProps) {
  const index = Math.max(0, Math.min(state.currentQuizIndex, quizzes.length - 1));
  const quiz = quizzes[index];
  if (!quiz) return <p className="py-4 text-center text-muted-foreground">No quiz available for this topic.</p>;
  const result = selectRevisionQuizResult(results, revisionId, nodeId, index, quiz);
  const { selectedOptionIds, showFeedback } = getRevisionQuizView(state, index, result);
  const request = requestStates[index];
  const pending = request?.isPending ?? false;
  const selected = new Set(selectedOptionIds);
  const change = (action: RevisionQuizUiAction) => onStateChange(revisionQuizReducer(state, action));
  const navigate = (quizIndex: number) => change({ type: 'navigate', quizIndex, quizCount: quizzes.length });
  const questionId = `revision-quiz-question-${nodeId}-${index}`;
  return (
    <section className="mt-4 space-y-4 border-t pt-4" aria-label="Revision quizzes" data-testid="revision-quiz-section">
      <nav className="flex flex-wrap items-center gap-2" aria-label="Quiz navigation">
        <button type="button" aria-label="Previous quiz" className={controlClass}
          disabled={index === 0} onClick={() => navigate(index - 1)}>← Previous Quiz</button>
        <span className="text-sm text-muted-foreground">Quiz {index + 1} of {quizzes.length}</span>
        <div className="flex gap-1" role="group" aria-label="Quiz results">
          {quizzes.map((card, quizIndex) => {
            const saved = selectRevisionQuizResult(results, revisionId, nodeId, quizIndex, card);
            const outcome = saved ? saved.is_correct ? 'correct' : 'incorrect' : 'unanswered';
            return <button key={quizIndex} type="button" aria-label={`Quiz ${quizIndex + 1}: ${outcome}`}
              title={`Quiz ${quizIndex + 1}: ${outcome}`} aria-current={index === quizIndex ? 'step' : undefined}
              onClick={() => navigate(quizIndex)} className={cn(
                'h-7 min-w-7 rounded-full px-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary',
                saved ? saved.is_correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  : 'bg-muted text-muted-foreground',
                index === quizIndex && 'ring-2 ring-primary ring-offset-1',
              )}>{quizIndex + 1}</button>;
          })}
        </div>
        <button type="button" aria-label="Next quiz" className={controlClass}
          disabled={index === quizzes.length - 1} onClick={() => navigate(index + 1)}>Next Quiz →</button>
      </nav>
      {showFeedback && result ? (
        <>
          <QuizResultDetails quiz={quiz} result={result} attemptCount={result.quiz_attempt_count} />
          {!result.is_correct && <button type="button" className={controlClass}
            disabled={pending} onClick={() => change({ type: 'retry', result })}>Try Again</button>}
        </>
      ) : (
        <>
          <div id={questionId}><MarkdownRenderer content={quiz.question_text} className="text-lg font-medium [&>div]:!mt-0" /></div>
          <fieldset disabled={pending} className="space-y-2" aria-describedby={questionId}
            role={quiz.question_type === 'multiple_choice' ? 'group' : 'radiogroup'}>
            <legend className="sr-only">Quiz options</legend>
            {quiz.options.map((option) => <label key={option.option_id} className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md border p-3',
              selected.has(option.option_id) ? 'border-primary bg-primary/10' : 'border-muted hover:border-primary/50',
            )}>
              <input type={quiz.question_type === 'multiple_choice' ? 'checkbox' : 'radio'}
                name={`revision-quiz-${nodeId}-${index}`} value={option.option_id}
                checked={selected.has(option.option_id)} onChange={(event) => {
                  const ids = quiz.question_type === 'single_choice' ? [option.option_id]
                    : event.target.checked ? [...selectedOptionIds, option.option_id]
                      : selectedOptionIds.filter((id) => id !== option.option_id);
                  change({ type: 'select', quizIndex: index, optionIds: ids });
                }} className="h-4 w-4 focus-visible:ring-2 focus-visible:ring-primary" />
              <span className="font-mono text-sm text-muted-foreground">{option.display_label}.</span>
              <InlineMarkdown content={option.text} />
            </label>)}
          </fieldset>
          <button type="button" data-testid="revision-quiz-submit"
            disabled={selectedOptionIds.length === 0 || pending} onClick={() => {
              if (selectedOptionIds.length > 0 && !pending) onSubmit(nodeId, [...selectedOptionIds], index);
            }} className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            {pending ? 'Submitting...' : 'Submit Answer'}
          </button>
        </>
      )}
      {request?.error && <div role="alert" className="text-sm text-destructive">{request.error}</div>}
      {!showFeedback && result && request?.error && (
        <details open className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Previous saved feedback</summary>
          <QuizResultDetails quiz={quiz} result={result} attemptCount={result.quiz_attempt_count} />
        </details>
      )}
      {quizzes.length > 1 && <button type="button" aria-label="Skip quiz" className={controlClass}
        disabled={index === quizzes.length - 1} onClick={() => navigate(index + 1)}>Skip / Next Quiz →</button>}
    </section>
  );
}
```

- [ ] **Step 4: Check the feedback half against the tests and finish the file.** There is one indicator per quiz even for a single quiz, next to navigation. Wrong feedback exposes Try Again only; correct feedback does not. The latest saved result colors only its own indicator. `quiz_attempt_count`, not node-wide `attempt_number`, labels revision attempts. Every wrong feedback path uses the shared safe disclosure. The only green styling outside option feedback is a compact correct indicator, not a topic border. Pending/error are keyed by visible index, so navigation stays available during a request.
- [ ] **Step 5: GREEN.** Run `npm run test -- --run src/features/learning/RevisionQuizSection.test.tsx`, then `npm run test -- --run src/features/learning/revisionQuizState.test.ts src/features/learning/QuizResultDetails.test.tsx`; expect PASS. Investigate any real reducer/renderer defects only in owned files; do not adjust P1 payload contracts.
- [ ] **Step 6: Commit:** `$paths = @('client/src/features/learning/RevisionQuizSection.tsx', 'client/src/features/learning/RevisionQuizSection.test.tsx')`; `$message = 'feat(review-parity): render controlled quizzes with independent saved indicators'`.

## Task 5: Mode-specific neutral cards, explicit review, curiosity and callbacks (A1–A5, A7–A9, A11, A14)

**Files:** Modify `client/src/features/learning/RevisionConceptCard.tsx`; create `client/src/features/learning/RevisionConceptCard.test.tsx`. No page/query/cache/chat orchestration.

- [ ] **Step 1: Write exact failing card tests**. Real section, real parser, real CuriositySpark and real SourceCitations remain mounted. Only MarkdownRenderer is replaced with a typed lightweight adapter to inspect passed heading props without loading the heavy math/diagram renderer:

```tsx
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
  it('discloses incomplete shuffled multi-select as an incorrect selection and allows retry', () => {
    const multi: ConceptNode = { ...node, quiz: { ...quiz, question_type: 'multiple_choice',
      options: quiz.options.map((option) => option.option_id === 'z' ? { ...option, is_correct: true } : option) } };
    const wrong = { ...attempt(0, false), selected_option_ids: ['x'] };
    render(<CardHarness mode={mode} topic={multi} data={progress([wrong])} />);
    expect(screen.getByText('Your selection is incorrect.')).toBeInTheDocument();
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
```

- [ ] **Step 2: RED.** Run `npm run test -- --run src/features/learning/RevisionConceptCard.test.tsx`; expect behavioral failures (current card ignores controlled props, colors outer borders, hides full-review feedback under pending status, lacks callbacks/citations, clears selections). Vitest does not typecheck new props during this red run; do not weaken props types to make a pre-implementation build pass.
- [ ] **Step 3: Replace imports/old local renderer after the existing card banner** with the source below; retain/update its mandatory banner to describe the controlled section and callbacks. First implement the prop/fallback bridge and authoritative result combination. Existing legacy `quizResult` overrides the restored result for **its explicit index only**, with revision/node checks; never infer index from the displayed quiz. P6 should patch canonical `quiz_results` and stop passing the legacy single-result prop.

```tsx
import { useState } from 'react';
import type { ConceptNode, RevisionMode, RevisionNodeProgressWithDetails,
  RevisionQuizAttemptResult, RevisionQuizResponse } from '@/types/learning';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CuriositySpark } from './CuriositySpark';
import { parseCuriosityQuestions } from './curiosityParser';
import { SourceCitations } from './SourceCitations';
import { RevisionQuizSection } from './RevisionQuizSection';
import { createRevisionQuizState } from './revisionQuizState';
import type { RevisionQuizUiState, RevisionQuizRequestStates } from './revisionQuizState';

export interface RevisionConceptCardProps {
  node: ConceptNode;
  revisionMode: RevisionMode;
  revisionProgress: RevisionNodeProgressWithDetails;
  onMarkReviewed: (nodeId: string) => void;
  onQuizSubmit: (nodeId: string, optionIds: string[], quizIndex?: number) => void;
  isMarkingReviewed?: boolean;
  isSubmitting?: boolean;
  quizResult?: RevisionQuizResponse;
  revisionId?: string;
  quizState?: RevisionQuizUiState;
  onQuizStateChange?: (next: RevisionQuizUiState) => void;
  quizResults?: RevisionQuizAttemptResult[];
  quizRequestStates?: RevisionQuizRequestStates;
  markReviewedError?: string;
  selectedHeadingIds?: string[];
  onToggleHeadingChat?: (headingId: string) => void;
  onAskQuestion?: (question: string) => void;
}
export function RevisionConceptCard({
  node, revisionMode, revisionProgress, onMarkReviewed, onQuizSubmit,
  isMarkingReviewed = false, isSubmitting = false, quizResult, revisionId,
  quizState, onQuizStateChange, quizResults, quizRequestStates, markReviewedError,
  selectedHeadingIds = [], onToggleHeadingChat, onAskQuestion,
}: RevisionConceptCardProps) {
  const [fallbackState, setFallbackState] = useState(createRevisionQuizState);
  const state = quizState ?? fallbackState;
  const updateState = onQuizStateChange ?? setFallbackState;
  const quizzes = node.quiz_set ? node.quiz_set.quizzes : node.quiz ? [node.quiz] : [];
  const restoredResults = quizResults ?? revisionProgress.quiz_results;
  const acceptsLegacy = quizResult !== undefined && quizResult.node_id === node.id &&
    (revisionId === undefined || quizResult.revision_session_id === revisionId);
  const results = acceptsLegacy && quizResult
    ? [quizResult, ...restoredResults.filter((result) => result.quiz_index !== quizResult.quiz_index)]
    : restoredResults;
  const readingDone = revisionProgress.content_reviewed_at !== null;
  const practiceDone = quizzes.length > 0 &&
    (revisionProgress.status === 'quiz_passed' || revisionProgress.status === 'quiz_failed');
  const badge = revisionMode === 'full_review' ? readingDone ? 'Reviewed' : 'Reading pending'
    : quizzes.length === 0 ? 'No practice quiz' : practiceDone ? 'Practice finished' : 'Practice pending';
  const parsed = revisionMode === 'full_review' && onAskQuestion
    ? parseCuriosityQuestions(node.content_markdown)
    : { mainContent: node.content_markdown, questions: [] };
  const requests = quizRequestStates ?? {
    [state.currentQuizIndex]: { isPending: isSubmitting },
  };
  return (
    <article className="topic-card-content overflow-hidden rounded-lg border border-border bg-card"
      data-testid="revision-concept-card">
      <header className="flex items-center gap-3 border-b bg-card/50 p-4">
        <div className="flex-1">
          <h3 className="font-semibold">{node.title}</h3>
          <span className="text-xs text-muted-foreground">Topic #{node.sequence_index + 1}</span>
        </div>
        <span data-testid="revision-status-badge" className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {badge}
        </span>
      </header>
      <div className="p-4">
        {revisionMode === 'full_review' && (
          <div className="space-y-4" data-testid="revision-full-review-content">
            <MarkdownRenderer content={parsed.mainContent} selectedHeadingIds={selectedHeadingIds}
              onToggleHeadingChat={onToggleHeadingChat} enableHeadingChat={onToggleHeadingChat !== undefined} />
            {parsed.questions.length > 0 && onAskQuestion && (
              <CuriositySpark questions={parsed.questions} onAskQuestion={onAskQuestion} />
            )}
            <SourceCitations citations={node.citations ?? []} />
            {!readingDone && <div className="flex justify-end border-t pt-4">
              <button type="button" data-testid="mark-reviewed-button" disabled={isMarkingReviewed}
                onClick={() => onMarkReviewed(node.id)}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                {isMarkingReviewed ? 'Marking...' : 'Mark as Reviewed'}
              </button>
            </div>}
            {markReviewedError && <p role="alert" className="text-sm text-destructive">{markReviewedError}</p>}
          </div>
        )}
        <div data-testid={revisionMode === 'quiz_only' ? 'revision-quiz-only-content' : 'revision-full-review-quizzes'}>
          {revisionMode === 'quiz_only' && <p className="mb-2 text-sm text-muted-foreground">Test your knowledge on this topic:</p>}
          <RevisionQuizSection revisionId={revisionId} nodeId={node.id} quizzes={quizzes}
            results={results} state={state} onStateChange={updateState} onSubmit={onQuizSubmit}
            requestStates={requests} />
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Finish/review the body/callback portion** against tests: explanation → curiosity → citations → review action → quizzes in Full Review; Practice exposes no topic explanation/review controls. No content status transitions or correctness computation. `content_reviewed_at` exclusively decides reading; authoritative practice status labels coverage without saying passed/mastered. An empty quiz set never gains a phantom quiz/green completion badge. Parser fallback remains unchanged. Repeated widget clicks always invoke callback; sending/focus/retarget are P5/P6 responsibility. There are no animations/celebrations or status-based outer borders.
- [ ] **Step 5: GREEN.** Run `npm run test -- --run src/features/learning/RevisionConceptCard.test.tsx`, then `npm run test -- --run src/features/learning/RevisionQuizSection.test.tsx src/features/learning/QuizFeedback.test.tsx src/features/learning/ConceptCard.test.tsx`; expect all tests PASS.
- [ ] **Step 6: Commit:** `$paths = @('client/src/features/learning/RevisionConceptCard.tsx', 'client/src/features/learning/RevisionConceptCard.test.tsx')`; `$message = 'feat(review-parity): align revision cards with explicit review and curiosity callbacks'`.

## Task 6: Exit gates, coverage, self-check, and explicit P6 handoff

**Files:** No new source/test/config files. Only update the checkboxes/results in `docs/completed-course-review-parity/plan4.md` if recording execution evidence. Orchestrator owns `state.md`; report updates rather than editing it. P7 owns the eventual dedicated coverage configuration and cross-layer acceptance artifacts.

- [ ] **Step 1: Run all six owned suites together** from `client/`:

```powershell
npm run test -- --run src/features/learning/QuizResultDetails.test.tsx src/features/learning/QuizFeedback.test.tsx src/features/learning/revisionQuizState.test.ts src/features/learning/RevisionQuizSection.test.tsx src/features/learning/RevisionConceptCard.test.tsx src/features/learning/ConceptCard.test.tsx
```

Expect PASS. Record command, exit code, test/file counts. Then run `npm run test -- --run src/features/learning/RevisionPage.test.tsx src/features/learning/LearningPathContainer.test.tsx` to verify the additive bridge and normal learning consumer. If an existing test expects the old broken revision behavior, report the conflict to P6; do not edit P6-owned tests or fake a passing gate.

- [ ] **Step 2: Run diagnostics/full regression** from `client/`, each separately: `npm run test -- --run`, `npm run build`, `npm run lint`. Expect PASS (document any unrelated pre-existing failure or generated-coverage warning separately). TypeScript must accept the unchanged current `RevisionPage.tsx` caller and all new typed fixtures. Never change types/contracts to assert away a mismatch. Root `git diff --check` must pass.
- [ ] **Step 3: Measure new-unit coverage with no config edits**, from `client/`:

```powershell
npx vitest run src/features/learning/QuizResultDetails.test.tsx src/features/learning/QuizFeedback.test.tsx src/features/learning/revisionQuizState.test.ts src/features/learning/RevisionQuizSection.test.tsx src/features/learning/RevisionConceptCard.test.tsx src/features/learning/ConceptCard.test.tsx --coverage --coverage.provider=v8 --coverage.include=src/features/learning/QuizResultDetails.tsx --coverage.include=src/features/learning/revisionQuizState.ts --coverage.include=src/features/learning/RevisionQuizSection.tsx --coverage.thresholds.perFile --coverage.thresholds.lines=81 --coverage.thresholds.functions=81 --coverage.thresholds.branches=81 --coverage.thresholds.statements=81
```

Expect each new production unit above 80% in all four dimensions. If the installed Vitest CLI rejects a flag, check `npx vitest --help --coverage` and official Vitest 3 documentation inline; do not weaken thresholds or add a new config outside ownership. Add a failing behavior test first for genuine uncovered behavior; if no behavior change is needed, coverage-only characterization tests may pass immediately and must be reported as such, not falsely labeled red. Keep generated coverage ignored. P7 will independently repeat its scoped gate; no full-repo coverage claim here.

- [ ] **Step 4: Self-check the following acceptance map and ownership boundary**. P4 proves UI outcomes with authoritative result/progress fixtures, not server evaluation, clock persistence, request routing or summary metrics; those remain upstream/P6/P7 gates.

| Acceptance | Exact P4 assertion evidence |
| --- | --- |
| A1 | Shared all-option single/multi feedback; section immediate correct saved result, own green indicator; card both-mode correct results. |
| A2 | Shared wrong selected-only disclosure; section wrong feedback/retry; card same behavior in both modes. |
| A3 | Section and both-mode card mixed green/red/gray independent results, navigation restores each quiz; neutral outer card. |
| A4 | Shared/card multi-correct distinct explanations and shuffled labels; section checkbox submission IDs; server exact-match evaluation remains P1/P2/P3. |
| A5 | Reducer keyed draft preservation, Previous/Next/Skip with no submissions; both-mode card parent-owned state survives child unmount. |
| A7 | Full-review quiz result with pending reading still exposes Mark as Reviewed; timestamp review survives wrong result and action disappears. Server idempotent write remains P2/P3. |
| A8 | Practice pending after one of two attempts, finished after second wrong authoritative status, independent red/green indicators and no mastery copy. Server coverage remains P1/P2/P3/P6. |
| A9 | Retry clears only its editable inputs, saved indicator/results stay intact; new saved ID returns to feedback, existing completed practice badge stays finished. Score/summary/timestamps remain P6/server. |
| A11 | Existing parser/widget, exact callback for repeated question clicks, intact fallback Markdown, heading callback/selected props, no quiz/review side effect. Composer prefill/focus/no send remains P5/P6. |
| A14 | First and retry quiz failure retain inputs, expose actionable error and prior saved feedback, no green guess; review pending/failure leaves explicit reading pending. Mutations/rollback remain P6. |

Check no placeholders, invented result IDs/indexes, mastery in revision, query/API imports, default exports, casts/suppressions, ownership violations, or whole-card correctness colors. Check every new source/test includes its mandatory banner; the Markdown plan itself begins with its title/header, never a source banner.

- [ ] **Step 5: Send an explicit P6 handoff to the orchestrator** with the exact interfaces below. The orchestrator **will not read this plan**. Report component signatures, reducer exports, compatibility bridge, per-quiz request shape, and callback adapters in the worker/planner completion summary; P6 may plan against these signatures immediately and executes only after P4 worker exits.

```ts
// Exports in client/src/features/learning/revisionQuizState.ts
interface RevisionQuizUiState {
  currentQuizIndex: number;
  selections: Partial<Record<number, string[]>>;
  retryAttemptIds: Partial<Record<number, string>>;
}
type RevisionQuizUiAction =
  | { type: 'navigate'; quizIndex: number; quizCount: number }
  | { type: 'select'; quizIndex: number; optionIds: string[] }
  | { type: 'retry'; result: RevisionQuizAttemptResult };
interface RevisionQuizRequestState { isPending: boolean; error?: string; }
type RevisionQuizRequestStates = Partial<Record<number, RevisionQuizRequestState>>;
// createRevisionQuizState(): RevisionQuizUiState
// revisionQuizReducer(state, action): RevisionQuizUiState
// selectRevisionQuizResult(results, revisionId, nodeId, quizIndex, quiz): RevisionQuizAttemptResult | undefined
// getRevisionQuizView(state, quizIndex, result?): { selectedOptionIds: string[]; showFeedback: boolean }

// RevisionQuizSectionProps in client/src/features/learning/RevisionQuizSection.tsx
interface RevisionQuizSectionProps {
  revisionId?: string; // P6 must supply, optional only for additive legacy card
  nodeId: string;
  quizzes: QuizCard[];
  results: RevisionQuizAttemptResult[];
  state: RevisionQuizUiState;
  onStateChange: (next: RevisionQuizUiState) => void;
  onSubmit: (nodeId: string, optionIds: string[], quizIndex: number) => void;
  requestStates?: RevisionQuizRequestStates;
}

// RevisionConceptCardProps in client/src/features/learning/RevisionConceptCard.tsx
interface RevisionConceptCardProps {
  node: ConceptNode;
  revisionMode: RevisionMode;
  revisionProgress: RevisionNodeProgressWithDetails;
  onMarkReviewed: (nodeId: string) => void;
  onQuizSubmit: (nodeId: string, optionIds: string[], quizIndex?: number) => void;
  isMarkingReviewed?: boolean;
  isSubmitting?: boolean; // legacy global fallback only
  quizResult?: RevisionQuizResponse; // legacy single-result bridge only
  revisionId?: string; // mandatory in P6 usage
  quizState?: RevisionQuizUiState; // mandatory in P6 usage
  onQuizStateChange?: (next: RevisionQuizUiState) => void; // mandatory with quizState
  quizResults?: RevisionQuizAttemptResult[]; // defaults to revisionProgress.quiz_results
  quizRequestStates?: RevisionQuizRequestStates; // authoritative per-node/index UI request state
  markReviewedError?: string;
  selectedHeadingIds?: string[];
  onToggleHeadingChat?: (headingId: string) => void;
  onAskQuestion?: (question: string) => void;
}
```

P6 usage requirements (do not implement page wiring in P4):

1. Hold `Partial<Record<string, RevisionQuizUiState>>` per node under a revision-scoped page owner. Supply `stateByNode[node.id] ?? createRevisionQuizState()` and store the returned next state under that same node. Clear the whole map on revision-ID change; keep it across topic unmounting. Never couple this reset to revision completion or chat history.
2. Pass the real `revisionId`, `revisionProgress.quiz_results` (or the correctly scoped immediately patched equivalent), and request states keyed **node → quiz index** from P6's mutation controller. Section results themselves still require revision/node/index identity. Submit callbacks always receive an actual zero-based index; preserve optional-index compatibility only at the legacy card prop boundary.
3. Do not clear state/results on submit/retry failure. Successful attempt with a **new ID** automatically overrides the retry display; same-ID GET refresh does not. Retry markers may remain in ephemeral state harmlessly until revision reset; don't delete saved attempts for retry.
4. Review success/failure updates authoritative/rolled-back `content_reviewed_at`; no quiz result or badge causes a review mutation. Practice finished badges consume `quiz_passed` **or** `quiz_failed`; correctness remains per saved attempt. P6 still owns header/TOC/history/summary progress.
5. `onAskQuestion={(question) => chat.askQuestion(question, node.id, node.title)}`; `onToggleHeadingChat={(headingId) => chat.toggleHeadingChat(headingId, node.id, node.title)}`; `selectedHeadingIds={chat.chatNodeId === node.id ? chat.selectedHeadingIds : []}`. P4 owns callbacks only, P5 owns controller/layout and P6 mounts/wires them.
6. Shared `QuizResultDetailsProps`: `quiz: QuizCard`, `result: Pick<QuizSubmitResponse, 'is_correct' | 'score_percent' | 'selected_option_ids' | 'correct_option_ids'>`, `attemptCount: number`, `headerAccessory?: ReactNode`. Revision never supplies a mastery accessory or uses the normal `QuizFeedback` wrapper.

- [ ] **Step 6: Commit completed P4 execution evidence if the plan changed**, using `$paths = @('docs/completed-course-review-parity/plan4.md')`; `$message = 'docs(review-parity): record P4 presentation verification and handoff'`. If no doc update occurred, no empty commit. Add a non-overwriting git note to the last P4 implementation commit (`git notes append -m 'P4 presentation complete: shared feedback, controlled revision quizzes/cards; P6 interfaces reported; verification results in worker handoff.' <actual-P4-commit>`); if notes have concurrent updates, coordinate and preserve existing notes. Report all atomic hashes, actual gate results, and any blocker. Do not claim end-to-end completion or edit `state.md`.

## Planning self-review and limitations

- Planner validation: all 11 planned source/test snippets were checked with an in-memory TypeScript compiler overlay against the actual `client/tsconfig.app.json` and installed dependencies: **0 diagnostics**, without creating/modifying source files. `npx vitest --help --coverage` confirmed the planned CLI include/threshold flags on installed Vitest 3.2.4. No implementation tests/build/lint/coverage were run by the planner.
- The planned UI tests cover both modes explicitly; the section is intentionally mode-independent, so feedback policy cannot diverge between them.
- P4 does not prove storage/API exact-match evaluation, accuracy/timestamps, no forced summary, mutation race isolation, or real composer behavior by mocking them away. Those responsibilities remain in the acceptance mapping above.
- The additive legacy bridge is necessary to keep the untouched P6-owned page compiling. Full navigation persistence and revision route isolation require P6 to supply all controlled props and stop passing a global pending/single-result cache. This is a sequenced handoff, not permission to extend P4 into page orchestration.
- No ownership conflict or contract change is required. If another agent has changed an owned file, foreign staged work exists, a baseline gate is failing, or a component API must change, STOP and report the exact blocker before expanding scope.
- Six tasks, **34 checkbox steps**: five TDD implementation tasks (5/6/5/6/6 steps) plus six verification/handoff steps. Every owned test file has an explicit red command and the identical green command. Task 6's full/build/lint/coverage gates must be genuinely run by the worker; this planner does not claim them as executed.
