# P6 — Revision Orchestration, Cache, Completion, and Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Load `test-driven-development` before source changes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the completed P1–P5 revision contracts, controlled quiz cards, and explicit chat controller so revision attempts, completion, restoration, errors, and explicitly opened summaries remain correct and revision-scoped.

**Architecture:** Server responses are authoritative; the revision GET cache owns saved per-quiz results and aggregate metrics, while a route-keyed page body owns temporary selections, retry display, topic navigation, and summary visibility. Mutation variables carry immutable revision/node/quiz identity; successful writes patch only that revision cache immediately, then reconcile session, summary, history, and dashboard queries. Reuse P4/P5 unchanged, adapting revision-only TOC wording and mobile panel width within the owned page.

**Tech Stack:** React 19, strict TypeScript 5.9, TanStack Query 5, React Router 7, Axios, Tailwind 4, existing Framer Motion/Lucide components, Vitest 3 and Testing Library/jsdom; no dependencies added.

---

## Read-first baseline and scope

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/TESTING.md`, `docs/CONVENTIONS.md`, `docs/STRUCTURE.md`, `docs/INTEGRATIONS.md`, `docs/CONCERNS.md`, and the **whole** `docs/completed-course-review-parity/goal.md` and `state.md`. This plan consumes the real committed P1–P5 implementation, not proposed upstream interfaces.

The historical Mongo baseline failure in `state.md` is resolved by P3. Do not attribute it to P6, fix server files, apply/drop the unrelated stash, or alter another workflow. P7 owns cross-store acceptance, the revision coverage config, and browser evidence. P6 records diagnostic results in its worker report rather than editing orchestrator/P7 artifacts.

Official documentation checked during planning: TanStack Query query cancellation passes `queryFn`'s `signal` to Axios, `cancelQueries` precedes a cache patch, and `invalidateQueries({ exact: true, refetchType: 'active' })` refetches matching active queries without removing cached data. Sources: `https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation` and `https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation`. Use hook-level mutation callbacks, not per-call callbacks that depend on an observer remaining mounted.

### File map (exclusive production ownership)

| File | Responsibility / permitted changes |
| --- | --- |
| `client/src/lib/learningApi.ts` | Revision transport only: cancellable revision GET/summary, unchanged URLs and secret-free writes |
| `client/src/features/learning/useRevisionSession.ts` | Shared exact query keys; completion/result merge helpers; one batched revision GET |
| `client/src/features/learning/useRevisionMutations.ts` | Request-identity variables, per-action pending/errors, successful result cache patch, review-only rollback, scoped invalidation |
| `client/src/features/learning/RevisionPage.tsx` | Keyed route body, original content query, controlled node UI state, explicit summary, notices, revision TOC, split/overlay chat integration |
| `client/src/features/learning/RevisionSummaryModal.tsx` | Mode-specific completion labels, attempt-based breakdown, explicit close action, retained original comparison/focus behavior |
| `client/src/features/learning/RevisionHistoryList.tsx` | Mode, authoritative progress percentage and attempt-accuracy labels; lazy list query |

Tests: modify `client/src/lib/learningApi.test.ts` and `client/src/features/learning/RevisionPage.test.tsx`; create `useRevisionSession.test.ts`, `useRevisionMutations.test.tsx`, `RevisionSummaryModal.test.tsx`, and `RevisionHistoryList.test.tsx` in `client/src/features/learning/`. No extra helper files. Test fixtures remain inline in their owning test; do not import a test module into another test module.

**Do not change:** anything under `server/`; P4/P5 components/helpers/tests; `TableOfContentsModal.tsx`; the barrel, router, dependency files or coverage config. The normal TOC says **Mastered**, so use a non-exported revision TOC inside `RevisionPage.tsx` rather than mapping revision statuses to original mastery. P5's overlay provides the container but `ChatPanel` still animates a percentage width: apply a page-scoped responsive width override. These are caller adaptations, not upstream contract changes.

### Fixed interfaces to consume

- `RevisionQuizResponse` has all P1 attempt fields plus `revision_node_status`; restored `RevisionQuizAttemptResult` omits that status. Never invent IDs/indexes or derive correctness from node status.
- `RevisionNodeProgressWithDetails`: `content_reviewed_at`, `quiz_count`, `quiz_results`; review POST returns this complete shape.
- `RevisionSummary.quizzes_passed/failed/total` are **attempt counts**, not unique quizzes; `nodes_reviewed` means mode-specific completed participating topics. Null accuracy is not zero.
- P1 notices: `legacy_review_inferred`, `legacy_review_required`, `incompatible_attempts`, `completion_recalculated`.
- `RevisionConceptCard`: pass `revisionId`, `quizState`, `onQuizStateChange`, `quizResults`, `quizRequestStates`, `markReviewedError`, `selectedHeadingIds`, `onToggleHeadingChat`, `onAskQuestion`. Stop using the transitional `quizResult` prop/global loading fallback.
- `createRevisionQuizState()` returns `{ currentQuizIndex, selections, retryAttemptIds }`; `getRevisionQuizView` restores selections/feedback directly from saved results. **No extra attempt-history requests or separate feedback seeding effect is necessary.** Wrong retry keeps the old result and keys editable display to its attempt ID; new successful attempt automatically exits retry display.
- `useConceptChatPanel({ sessionId, activeTopicId, activeTopicTitle })`: explicit `askQuestion(question,nodeId,title)`, `toggleHeadingChat(headingId,nodeId,title)`, `openChat`, `closeChat`, width, target/title/headings, prefill/consume methods.
- `ConceptChatLayout`: `isChatOpen`, `chatWidthPercent`, `onChatWidthChange`, `onCloseChat`, `chatPanel`, `children`. `ChatPanel`: controller target/title/headings/prefill plus `sessionId`, `widthPercent`; **always omit `isCourseComplete` for revision**.

### Invariants

1. Zero quiz correctness/status/completion writes before successful quiz evaluation. Only an explicit review may optimistically change its own pending status, with field-level rollback.
2. Immutable request revision/node/index controls the cache destination, never current route/current quiz. Old-route pending/errors/local selections cannot enter the destination.
3. Preserve old feedback and selections on error. Never roll back an entire session snapshot over an unrelated successful quiz/review.
4. Original `['learningSession', sessionId]`, node feedback/history, and last-active queries are never patched/invalidated by revision writes. Only dashboard/list metadata may refresh.
5. Summary visibility starts false even on completed re-entry; fetching metrics never opens it. Every successful write invalidates summary/history and reconciles aggregate accuracy; do not calculate accuracy from latest results.
6. Revision membership controls the topics shown. No fallback fabricated progress IDs for missing membership. Original content missing for a revision topic is a recoverable data notice, not authority to invent membership.

## Commands, headers, and commit safety

All red/green/test/build/lint commands below run with **working directory `D:/Peter/Personal Stuffs/A2UI/client`**. All git commands run with **working directory `D:/Peter/Personal Stuffs/A2UI`**. A test's red and green commands are identical: run it before implementation and observe the specified behavioral failure, then run it after the minimal change. Tests already guaranteed by an earlier task are regression assertions and need not be made artificially red.

Every new source/test file starts with its concrete source banner below. Existing owned files retain/update their existing banner when substantially rewritten; this Markdown document intentionally has **no plan-level source banner**.

For **every** task commit, substitute its exact file list/message into this PowerShell procedure. Keep this mutex only for index inspection/staging/commit. Check `$LASTEXITCODE` after each git operation; do not commit foreign staged work.

```powershell
$mutex = [System.Threading.Mutex]::new($false, 'Local\A2UI_completed_course_review_parity_git')
$held = $false
try {
  try { $held = $mutex.WaitOne() }
  catch [System.Threading.AbandonedMutexException] { $held = $true }
  $staged = @(git diff --cached --name-only)
  if ($LASTEXITCODE -ne 0 -or $staged.Count -gt 0) {
    throw 'STOP: staged/index state needs coordination; do not unstage it.'
  }
  git add -- $ownedPaths
  if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'staged whitespace check failed' }
  git diff --cached --stat
  git diff --cached
  git commit -m $message
  if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }
} finally {
  if ($held) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
```

Inspect `git status --short` before edits. Stage explicit owned paths only; never `git add .`/`-A`, checkout/reset/delete unknown work. Task 12 adds a git note only if none exists, otherwise appends without replacing existing notes.

## Task 1: Cancellable revision transport and exact cache keys

**Files:** modify `client/src/lib/learningApi.ts`, `client/src/lib/learningApi.test.ts`, `client/src/features/learning/useRevisionSession.ts`; create `client/src/features/learning/useRevisionSession.test.ts`.

- [ ] **Step 1 — Add exact failing tests.** Extend the existing API imports with `createRevisionSession`, `getRevisionSession`, `getRevisionSummary`, `getRevisionsList`, `markNodeReviewed`, `submitRevisionQuiz`, and `submitQuiz`. Add these cases to its existing secret-scope suite:

```ts
it.each([
  ['createRevisionSession', () => createRevisionSession('session-1', { mode: 'full_review' })],
  ['getRevisionSession', () => getRevisionSession('rev-1')],
  ['getRevisionSummary', () => getRevisionSummary('rev-1')],
  ['getRevisionsList', () => getRevisionsList('session-1', 20, 0)],
  ['markNodeReviewed', () => markNodeReviewed('rev-1', 'node-1')],
  ['submitRevisionQuiz', () => submitRevisionQuiz('rev-1', 'node-1', ['stable-id'], 1)],
  ['submitQuiz', () => submitQuiz('node-1', ['stable-id'], 0)],
])('%s remains credential-free', async (_name, invoke) => {
  await invoke();
  expect(JSON.stringify(lastRequestConfig()?.headers ?? {})).not.toMatch(
    /Authorization|X-Provider-Api-Key|X-OpenRouter-Key|X-GeneralCompute-Key|X-Tavily-Key|X-Exa-Key|X-Brave-Key|X-SerpApi-Key|llm-secret|tvly-secret/i,
  );
});
it('passes cancellation signals only as transport configuration', async () => {
  const controller = new AbortController();
  await getRevisionSession('rev-1', controller.signal);
  expect(mocks.instance.get).toHaveBeenLastCalledWith(
    '/learning/revisions/rev-1', { signal: controller.signal },
  );
  await getRevisionSummary('rev-1', controller.signal);
  expect(mocks.instance.get).toHaveBeenLastCalledWith(
    '/learning/revisions/rev-1/summary', { signal: controller.signal },
  );
  await submitRevisionQuiz('rev-1', 'node-1', ['stable-id'], 1);
  expect(mocks.instance.post).toHaveBeenLastCalledWith(
    '/learning/revisions/rev-1/nodes/node-1/submit-quiz',
    { selected_option_ids: ['stable-id'], quiz_index: 1 },
  );
});
```

Create the hook test (no JSX in `.test.ts`):

```ts
/**
 * ============================================================================
 * FILE: useRevisionSession.test.ts
 * LOCATION: client/src/features/learning/useRevisionSession.test.ts
 * ============================================================================
 * PURPOSE:
 *    Verify batched revision queries, scoped keys, and authoritative projections.
 * ROLE IN PROJECT:
 *    Guards revision restoration without per-node queries or original mutations.
 * KEY COMPONENTS:
 *    - QueryClient hook harness: Deterministic revision transport
 * ============================================================================
 */
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { revisionQueryKeys, useRevisionSession } from './useRevisionSession';
import type { RevisionSessionWithProgress } from '@/types/learning';
const api = vi.hoisted(() => ({ getRevisionSession: vi.fn() }));
vi.mock('@/lib/learningApi', () => api);
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('uses stable revision summary and list keys without fetching an empty ID', async () => {
  expect(revisionQueryKeys.session('r')).toEqual(['revision', 'r']);
  expect(revisionQueryKeys.summary('r')).toEqual(['revision-summary', 'r']);
  expect(revisionQueryKeys.list('s')).toEqual(['revisions', 's']);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(({ id }) => useRevisionSession(id), {
    wrapper, initialProps: { id: '' },
  });
  expect(api.getRevisionSession).not.toHaveBeenCalled();
  const restored: RevisionSessionWithProgress = {
    id: 'r', original_session_id: 's', revision_number: 1, mode: 'quiz_only',
    status: 'in_progress', progress_percent: 0, total_quiz_score_percent: null,
    started_at: '2026-10-05T00:00:00Z', completed_at: null, notices: [], nodes: [],
  };
  api.getRevisionSession.mockResolvedValue(restored);
  hook.rerender({ id: 'r' });
  await waitFor(() => expect(hook.result.current.data).toEqual(restored));
  expect(api.getRevisionSession).toHaveBeenCalledTimes(1);
  expect(api.getRevisionSession).toHaveBeenCalledWith('r', expect.any(AbortSignal));
  hook.unmount(); client.clear();
});
```

- [ ] **Step 2 — RED.** Run `npm run test -- --run src/lib/learningApi.test.ts src/features/learning/useRevisionSession.test.ts`. Expected FAIL: missing summary/list factories and missing forwarded signal. Existing no-key cases should already pass; do not regress them.
- [ ] **Step 3 — Minimal implementation.** In `learningApi.ts`, add `signal?: AbortSignal` to **only** `getRevisionSession` and `getRevisionSummary`; their GET configuration is `signal ? { signal } : undefined`, preserving the one-argument call when absent:

```ts
export const getRevisionSession = async (
  revisionId: string, signal?: AbortSignal,
): Promise<RevisionSessionWithProgress> => {
  const response = signal
    ? await api.get<RevisionSessionWithProgress>(`/learning/revisions/${revisionId}`, { signal })
    : await api.get<RevisionSessionWithProgress>(`/learning/revisions/${revisionId}`);
  return response.data;
};
export const getRevisionSummary = async (
  revisionId: string, signal?: AbortSignal,
): Promise<RevisionSummary> => {
  const response = signal
    ? await api.get<RevisionSummary>(`/learning/revisions/${revisionId}/summary`, { signal })
    : await api.get<RevisionSummary>(`/learning/revisions/${revisionId}/summary`);
  return response.data;
};
```

No provider/settings/header builder calls. Replace the key factory and hook query function:

```ts
export const revisionQueryKeys = {
  session: (id: string): readonly ['revision', string] => ['revision', id],
  summary: (id: string): readonly ['revision-summary', string] => ['revision-summary', id],
  list: (id: string): readonly ['revisions', string] => ['revisions', id],
};
// Keep useRevisionSession's existing enabled/staleTime settings.
// Replace its queryFn:
queryFn: ({ signal }) => getRevisionSession(revisionId, signal),
```

- [ ] **Step 4 — GREEN.** Repeat Step 2; all cases PASS. Run `npm run build` for new transport signatures.
- [ ] **Step 5 — Commit.** Stage exactly the four Task 1 paths using the mutex. Message: `fix(review-parity): scope revision query keys and cancellable reads`.

## Task 2: Successful quiz cache patch and request-scoped pending/errors

**Files:** modify `client/src/features/learning/useRevisionSession.ts`, `client/src/features/learning/useRevisionMutations.ts`; create `client/src/features/learning/useRevisionMutations.test.tsx`.

- [ ] **Step 1 — Add the test harness and failing quiz test.** The following inline fixtures/harness are also used by Task 3/5 tests in this same test file.

```tsx
/**
 * ============================================================================
 * FILE: useRevisionMutations.test.tsx
 * LOCATION: client/src/features/learning/useRevisionMutations.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify request-scoped revision writes, cache patches, and failure recovery.
 * ROLE IN PROJECT:
 *    Exercises real QueryClient caches without providers or original writes.
 * KEY COMPONENTS:
 *    - deferred: Explicit response ordering
 *    - harness: Typed saved attempts and independent revision caches
 * ============================================================================
 */
import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RevisionQuizResponse, RevisionSessionWithProgress } from '@/types/learning';
import { useRevisionMutations } from './useRevisionMutations';
import { revisionQueryKeys } from './useRevisionSession';
const api = vi.hoisted(() => ({ markNodeReviewed: vi.fn(), submitRevisionQuiz: vi.fn(), getRevisionSession: vi.fn() }));
vi.mock('@/lib/learningApi', () => api);
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('uninitialized resolve'); };
  let reject: (error: Error) => void = () => { throw new Error('uninitialized reject'); };
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function revision(id = 'r'): RevisionSessionWithProgress {
  return {
    id, original_session_id: 's', revision_number: 1, mode: 'quiz_only',
    status: 'in_progress', progress_percent: 0, total_quiz_score_percent: null,
    started_at: '2026-10-05T00:00:00Z', completed_at: null, notices: [],
    nodes: [{ id: `${id}-n`, node_id: 'n', node_title: 'Topic', sequence_index: 0,
      status: 'pending', reviewed_at: null, content_reviewed_at: null, quiz_count: 2, quiz_results: [] }],
  };
}
function attempt(overrides: Partial<RevisionQuizResponse> = {}): RevisionQuizResponse {
  return { id: 'a', revision_session_id: 'r', node_id: 'n', quiz_index: 0,
    attempt_number: 9, quiz_attempt_count: 1, selected_option_ids: ['b'],
    is_correct: false, score_percent: 0, correct_option_ids: [], explanation: '',
    selected_explanation: 'B explanation', created_at: '2026-10-05T00:01:00Z',
    revision_node_status: 'pending', ...overrides };
}
const clients: QueryClient[] = [];
function harness(id = 'r') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(revisionQueryKeys.session(id), revision(id));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ revisionId }) => useRevisionMutations({ revisionId }), {
    wrapper, initialProps: { revisionId: id },
  });
  return { client, ...hook };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });
it('patches only a saved quiz before aggregate refetch and never assumes a pass', async () => {
  const pending = deferred<RevisionQuizResponse>();
  api.submitRevisionQuiz.mockReturnValue(pending.promise);
  const { client, result } = harness();
  const original = { marker: 'unchanged' };
  client.setQueryData(['learningSession', 's'], original);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  act(() => result.current.submitAnswer('n', ['b'], 0));
  await waitFor(() => expect(result.current.quizRequestStates.n?.[0]?.isPending).toBe(true));
  expect(client.getQueryData(revisionQueryKeys.session('r'))).toEqual(revision());
  await act(async () => pending.resolve(attempt()));
  await waitFor(() => expect(result.current.quizRequestStates.n?.[0]?.isPending).toBe(false));
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'))?.nodes[0].quiz_results).toEqual([
    expect.objectContaining({ id: 'a', quiz_index: 0, is_correct: false, quiz_attempt_count: 1 }),
  ]);
  expect(client.getQueryData(['learningSession', 's'])).toBe(original);
  expect(client.getQueryState(['learningSession', 's'])?.isInvalidated).toBe(false);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['revision-summary', 'r'], exact: true });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['revisions', 's'], exact: true });
});
it('keeps saved results on failed retry and clears only its request pending flag', async () => {
  const saved = revision(); saved.nodes[0].quiz_results = [attempt()];
  const { client, result } = harness();
  client.setQueryData(revisionQueryKeys.session('r'), saved);
  api.submitRevisionQuiz.mockRejectedValue(new Error('offline'));
  act(() => result.current.submitAnswer('n', ['b'], 0));
  await waitFor(() => expect(result.current.quizRequestStates.n?.[0]?.error).toBe('Could not save this answer. Please try again.'));
  expect(result.current.quizRequestStates.n?.[0]?.isPending).toBe(false);
  expect(client.getQueryData(revisionQueryKeys.session('r'))).toEqual(saved);
});
```

- [ ] **Step 2 — RED.** Run `npm run test -- --run src/features/learning/useRevisionMutations.test.tsx`. Expected FAIL: absent per-node/index state, optimistic `quiz_passed`, no successful cache patch or summary/history invalidation.
- [ ] **Step 3 — Minimal implementation.** Add these helpers/types to `useRevisionSession.ts` (type-only imports from learning types). `patchRevisionQuiz` must drop the response-only status from the stored attempt shape by explicitly constructing the restored payload; destructuring/rest operator would keep that extra field if reused incorrectly.

```ts
export function isNewerRevisionAttempt(next: RevisionQuizAttemptResult, previous: RevisionQuizAttemptResult): boolean {
  return next.attempt_number > previous.attempt_number ||
    (next.attempt_number === previous.attempt_number && next.id > previous.id);
}
export function patchRevisionQuiz(session: RevisionSessionWithProgress, result: RevisionQuizResponse): RevisionSessionWithProgress {
  if (session.id !== result.revision_session_id) return session;
  const saved: RevisionQuizAttemptResult = {
    id: result.id, revision_session_id: result.revision_session_id, node_id: result.node_id,
    quiz_index: result.quiz_index, attempt_number: result.attempt_number,
    quiz_attempt_count: result.quiz_attempt_count, selected_option_ids: result.selected_option_ids,
    is_correct: result.is_correct, score_percent: result.score_percent,
    correct_option_ids: result.correct_option_ids, explanation: result.explanation,
    selected_explanation: result.selected_explanation, created_at: result.created_at,
  };
  return { ...session, nodes: session.nodes.map((node) => {
    if (node.node_id !== result.node_id || result.quiz_index < 0 || result.quiz_index >= node.quiz_count) return node;
    const previous = node.quiz_results.find((row) => row.quiz_index === result.quiz_index);
    if (previous && !isNewerRevisionAttempt(saved, previous)) return node;
    const quiz_results = [...node.quiz_results.filter((row) => row.quiz_index !== saved.quiz_index), saved]
      .sort((a, b) => a.quiz_index - b.quiz_index);
    const status: RevisionNodeStatus = session.mode === 'full_review'
      ? node.content_reviewed_at !== null ? 'reviewed' : 'pending'
      : quiz_results.length < node.quiz_count ? 'pending'
        : quiz_results.every((row) => row.is_correct) ? 'quiz_passed' : 'quiz_failed';
    return { ...node, quiz_results, status };
  }) };
}
export function getRevisionCompletion(session: RevisionSessionWithProgress) {
  const participating = session.nodes.filter((node) => session.mode === 'full_review' || node.quiz_count > 0);
  const completed = participating.filter((node) => session.mode === 'full_review'
    ? node.content_reviewed_at !== null
    : node.quiz_results.length === node.quiz_count).length;
  return { total: participating.length, completed };
}
```

Replace `useRevisionMutations.ts` implementation after its banner with the following imports/interfaces/hook. Preserve the banner but change its description: no optimistic quiz correctness. Task 3 supplies review-only status rollback; start here with non-optimistic review.

```ts
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { markNodeReviewed, submitRevisionQuiz } from '@/lib/learningApi';
import type { RevisionNodeProgressWithDetails, RevisionQuizResponse, RevisionSessionWithProgress } from '@/types/learning';
import type { RevisionQuizRequestState, RevisionQuizRequestStates } from './revisionQuizState';
import { patchRevisionQuiz, revisionQueryKeys } from './useRevisionSession';
interface RequestIdentity { revisionId: string; nodeId: string; token: number }
interface QuizRequest extends RequestIdentity { selectedOptionIds: string[]; quizIndex: number }
type RequestRegistry = Record<string, Record<string, RevisionQuizRequestState & { token: number }>>;
export interface UseRevisionMutationsProps {
  revisionId: string;
  onError?: (error: Error, context: string) => void;
  onQuizResult?: (nodeId: string, isCorrect: boolean, result: RevisionQuizResponse) => void;
}
export function useRevisionMutations({ revisionId, onError, onQuizResult }: UseRevisionMutationsProps) {
  const queryClient = useQueryClient();
  const sequence = useRef(0);
  const [requests, setRequests] = useState<RequestRegistry>({});
  const setRequest = (request: RequestIdentity, slot: string, state: RevisionQuizRequestState) => {
    setRequests((previous) => {
      const byRevision = previous[request.revisionId] ?? {};
      if ((byRevision[slot]?.token ?? 0) > request.token) return previous;
      return { ...previous, [request.revisionId]: { ...byRevision, [slot]: { ...state, token: request.token } } };
    });
  };
  const invalidate = (id: string) => {
    const session = queryClient.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session(id));
    void queryClient.invalidateQueries({ queryKey: revisionQueryKeys.session(id), exact: true });
    void queryClient.invalidateQueries({ queryKey: revisionQueryKeys.summary(id), exact: true });
    if (session) void queryClient.invalidateQueries({ queryKey: revisionQueryKeys.list(session.original_session_id), exact: true });
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
  };
  const submitQuizMutation = useMutation({
    mutationFn: async (request: QuizRequest) => {
      const result = await submitRevisionQuiz(request.revisionId, request.nodeId, request.selectedOptionIds, request.quizIndex);
      if (result.revision_session_id !== request.revisionId || result.node_id !== request.nodeId || result.quiz_index !== request.quizIndex) {
        throw new Error('Revision answer identity mismatch');
      }
      return result;
    },
    onMutate: (request) => {
      setRequest(request, `quiz:${request.nodeId}:${request.quizIndex}`, { isPending: true });
    },
    onSuccess: (result, request) => {
      queryClient.setQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session(request.revisionId),
        (session) => session ? patchRevisionQuiz(session, result) : session);
      setRequest(request, `quiz:${request.nodeId}:${request.quizIndex}`, { isPending: false });
      onQuizResult?.(request.nodeId, result.is_correct, result);
      invalidate(request.revisionId);
    },
    onError: (error, request) => {
      setRequest(request, `quiz:${request.nodeId}:${request.quizIndex}`, {
        isPending: false, error: 'Could not save this answer. Please try again.',
      });
      onError?.(error, 'submitRevisionQuiz');
    },
  });
  const markReviewedMutation = useMutation({
    mutationFn: async (request: RequestIdentity) => {
      const node = await markNodeReviewed(request.revisionId, request.nodeId);
      if (node.node_id !== request.nodeId) throw new Error('Revision review identity mismatch');
      return node;
    },
    onMutate: (request) => setRequest(request, `review:${request.nodeId}`, { isPending: true }),
    onSuccess: (node: RevisionNodeProgressWithDetails, request) => {
      queryClient.setQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session(request.revisionId),
        (session) => session ? { ...session, nodes: session.nodes.map((previous) => previous.node_id === request.nodeId ? node : previous) } : session);
      setRequest(request, `review:${request.nodeId}`, { isPending: false });
      invalidate(request.revisionId);
    },
    onError: (error, request) => {
      setRequest(request, `review:${request.nodeId}`, { isPending: false, error: 'Could not mark this topic as reviewed. Please try again.' });
      onError?.(error, 'markReviewed');
    },
  });
  const quizRequestStates: Record<string, RevisionQuizRequestStates> = {};
  const reviewRequestStates: Record<string, RevisionQuizRequestState> = {};
  for (const [slot, state] of Object.entries(requests[revisionId] ?? {})) {
    const [kind, nodeId, index] = slot.split(':');
    if (kind === 'review') reviewRequestStates[nodeId] = state;
    if (kind === 'quiz') {
      quizRequestStates[nodeId] = { ...quizRequestStates[nodeId], [Number(index)]: state };
    }
  }
  const isSubmitting = Object.values(quizRequestStates).some((states) => Object.values(states).some((state) => state?.isPending));
  const isMarkingReviewed = Object.values(reviewRequestStates).some((state) => state.isPending);
  return {
    submitQuizMutation, markReviewedMutation, quizRequestStates, reviewRequestStates,
    submitAnswer: (nodeId: string, selectedOptionIds: string[], quizIndex = 0) => submitQuizMutation.mutate({
      revisionId, nodeId, selectedOptionIds: [...selectedOptionIds], quizIndex, token: ++sequence.current,
    }),
    markReviewed: (nodeId: string) => markReviewedMutation.mutate({ revisionId, nodeId, token: ++sequence.current }),
    isSubmitting, isMarkingReviewed, isAnyLoading: isSubmitting || isMarkingReviewed,
  };
}
```

Slot keys use node UUIDs (no colons in stored node IDs); immutable revision identity scopes their registry. Review/quiz errors are generic and recoverable; no swallowed promises or API keys. Aggregate score/status/time remain unchanged until revision GET reconciles them.

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS. Run `npm run build` and `npm run lint`; fix strict typing within owned files, not with assertions.
- [ ] **Step 5 — Commit.** Stage Task 2's three paths. Message: `fix(review-parity): patch saved quiz results without optimistic correctness`.

## Task 3: Review-only optimistic status rollback without erasing attempts

**Files:** modify `client/src/features/learning/useRevisionMutations.ts` and `useRevisionMutations.test.tsx`.

- [ ] **Step 1 — Add a failing interleaved rollback test.** Add a type-only import of `RevisionNodeProgressWithDetails` for the deferred review:

```tsx
it('rolls back only review status while retaining a concurrently saved quiz', async () => {
  const review = deferred<RevisionNodeProgressWithDetails>();
  const quiz = deferred<RevisionQuizResponse>();
  api.markNodeReviewed.mockReturnValue(review.promise);
  api.submitRevisionQuiz.mockReturnValue(quiz.promise);
  const { client, result } = harness();
  const full = { ...revision(), mode: 'full_review' satisfies RevisionSessionWithProgress['mode'] };
  client.setQueryData(revisionQueryKeys.session('r'), full);
  act(() => result.current.markReviewed('n'));
  await waitFor(() => expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'))?.nodes[0].status).toBe('reviewed'));
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'))?.nodes[0].content_reviewed_at).toBeNull();
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'))?.status).toBe('in_progress');
  act(() => result.current.submitAnswer('n', ['b'], 0));
  await act(async () => quiz.resolve(attempt()));
  await act(async () => review.reject(new Error('offline')));
  await waitFor(() => expect(result.current.reviewRequestStates.n?.error).toMatch(/Could not mark/));
  const final = client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'));
  expect(final?.nodes[0].status).toBe('pending');
  expect(final?.nodes[0].quiz_results[0].id).toBe('a');
  expect(final?.nodes[0].content_reviewed_at).toBeNull();
});
```

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/useRevisionMutations.test.tsx`. Expected FAIL: review status never enters allowed explicit-review optimistic state.
- [ ] **Step 3 — Minimal implementation.** Replace review `onMutate` and prepend rollback in review `onError`:

```ts
onMutate: async (request) => {
  setRequest(request, `review:${request.nodeId}`, { isPending: true });
  const key = revisionQueryKeys.session(request.revisionId);
  await queryClient.cancelQueries({ queryKey: key, exact: true });
  const before = queryClient.getQueryData<RevisionSessionWithProgress>(key)?.nodes.find((node) => node.node_id === request.nodeId);
  queryClient.setQueryData<RevisionSessionWithProgress>(key, (session) => {
    if (!session || session.mode !== 'full_review') return session;
    return { ...session, nodes: session.nodes.map((node) => node.node_id === request.nodeId
      ? { ...node, status: 'reviewed' } : node) };
  });
  return { previousStatus: before?.status };
},
onError: (error, request, context) => {
  if (context?.previousStatus) {
    queryClient.setQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session(request.revisionId),
      (session) => session ? { ...session, nodes: session.nodes.map((node) =>
        node.node_id === request.nodeId && node.content_reviewed_at === null
          ? { ...node, status: context.previousStatus ?? 'pending' } : node) } : session);
  }
  setRequest(request, `review:${request.nodeId}`, { isPending: false, error: 'Could not mark this topic as reviewed. Please try again.' });
  onError?.(error, 'markReviewed');
},
```

No timestamp is invented. P4 shows its pending button; header/TOC completion uses `content_reviewed_at` and therefore does not claim reading completion before success. Do not optimistically set revision status/progress. Review success must not erase a newer quiz that raced its response: use Task 5's result merge when it becomes available.

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS.
- [ ] **Step 5 — Commit.** Stage the two Task 3 paths. Message: `fix(review-parity): isolate explicit review rollback from quiz results`.

## Task 4: Route-keyed page and controlled mounted selections

**Files:** modify `client/src/features/learning/RevisionPage.tsx`, `RevisionPage.test.tsx`.

- [ ] **Step 1 — Replace page-test doubles with this real query/router harness.** Retain the existing source banner, motion stub, typed `mockNodeWithQuizSet`, original/revision fixtures, and the card navigation smoke test. Append these concrete options to the existing respective quiz fixtures (each then has four options):

```tsx
// Quiz 1 additions:
{ option_id: 'opt-5', text: 'A table', display_label: 'C', explanation: 'Tables are not graph entities.', is_correct: false },
{ option_id: 'opt-6', text: 'A color', display_label: 'D', explanation: 'Colors annotate entities.', is_correct: false },
// Quiz 2 additions:
{ option_id: 'opt-7', text: 'A property', display_label: 'C', explanation: 'Properties describe relations.', is_correct: false },
{ option_id: 'opt-8', text: 'A label', display_label: 'D', explanation: 'Labels identify relations.', is_correct: false },
```

Replace the original hook mock and API mock, and use these helpers:

```tsx
// Extend existing imports: beforeEach, afterEach, it, act, waitFor, within,
// cleanup, createMemoryRouter, RouterProvider; add RevisionQuizResponse,
// RevisionSummary, RevisionMode and revisionQueryKeys type/value imports.
const api = vi.hoisted(() => ({
  getLearningSession: vi.fn(), getRevisionSession: vi.fn(), getRevisionSummary: vi.fn(),
  createRevisionSession: vi.fn(), markNodeReviewed: vi.fn(), submitRevisionQuiz: vi.fn(),
}));
vi.mock('@/lib/learningApi', () => api);
// DELETE the vi.mock('./useRevisionSession', ...) block. Hooks remain real.
// Do not mock RevisionConceptCard, RevisionQuizSection, layout or controller.
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('resolve not initialized'); };
  let reject: (error: Error) => void = () => { throw new Error('reject not initialized'); };
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function saved(overrides: Partial<RevisionQuizResponse> = {}): RevisionQuizResponse {
  return { id: 'attempt-1', revision_session_id: 'rev-1', node_id: 'node-1', quiz_index: 0,
    attempt_number: 5, quiz_attempt_count: 1, selected_option_ids: ['opt-1'], is_correct: true,
    score_percent: 100, correct_option_ids: ['opt-1'], explanation: 'Node explanation',
    selected_explanation: null, created_at: '2026-10-05T00:01:00Z', revision_node_status: 'pending', ...overrides };
}
function summary(overrides: Partial<RevisionSummary> = {}): RevisionSummary {
  return { revision_id: 'rev-1', mode: 'quiz_only', progress_percent: 100,
    nodes_reviewed: 1, nodes_total: 1, total_quiz_score_percent: 50,
    quizzes_passed: 1, quizzes_failed: 1, quizzes_total: 2, time_spent_seconds: 60,
    comparison: { original_quiz_score_percent: 25, improvement_percent: 25 }, notices: [], ...overrides };
}
let revisionData: RevisionSessionWithProgress;
let originalData: LearningSessionWithNodes;
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  originalData = structuredClone(mockOriginalSession);
  originalData.nodes.push({ ...structuredClone(mockNodeWithQuizSet), id: 'node-2', sequence_index: 1, title: 'Second topic' });
  originalData.total_nodes = 2; originalData.completed_nodes = 2;
  revisionData = structuredClone(mockRevisionSession);
  revisionData.nodes.push({ ...structuredClone(mockRevisionSession.nodes[0]), id: 'rev-node-2', node_id: 'node-2', node_title: 'Second topic', sequence_index: 1 });
  api.getLearningSession.mockImplementation(async () => structuredClone(originalData));
  api.getRevisionSession.mockImplementation(async (id: string) => ({ ...structuredClone(revisionData), id }));
  api.getRevisionSummary.mockResolvedValue(summary());
  HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    media, matches: true, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });
function mountRevision(id = 'rev-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const router = createMemoryRouter([
    { path: '/learn/:sessionId/revise/:revisionId', element: <RevisionPage /> },
    { path: '/learn', element: <p>Dashboard fixture</p> },
  ], { initialEntries: [`/learn/session-1/revise/${id}`] });
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { client, router, ...view };
}
const topicNext = () => fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
const topicPrevious = () => fireEvent.click(screen.getByRole('button', { name: 'Previous topic' }));
it.each<RevisionMode>(['full_review', 'quiz_only'])('preserves selections when %s topic cards unmount', async (mode) => {
  revisionData.mode = mode;
  mountRevision();
  await screen.findByText('What is an entity?');
  fireEvent.click(screen.getByRole('radio', { name: /A node/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Next quiz' }));
  fireEvent.click(screen.getByRole('radio', { name: /A vertex/ }));
  topicNext(); await screen.findByRole('heading', { name: 'Second topic' });
  topicPrevious(); await screen.findByRole('heading', { name: 'Knowledge Graphs 101' });
  expect(screen.getByRole('radio', { name: /A vertex/ })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Previous quiz' }));
  expect(screen.getByRole('radio', { name: /A node/ })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Skip quiz' }));
  expect(api.submitRevisionQuiz).not.toHaveBeenCalled();
});
it('resets topic, selection, and summary visibility on a revision route switch', async () => {
  const { router } = mountRevision();
  await screen.findByText('What is an entity?');
  fireEvent.click(screen.getByRole('radio', { name: /A node/ })); topicNext();
  await act(async () => { await router.navigate('/learn/session-1/revise/rev-2'); });
  await screen.findByRole('heading', { name: 'Knowledge Graphs 101' });
  expect(screen.getByRole('radio', { name: /A node/ })).not.toBeChecked();
  expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
});
```

Keep card fixtures defined outside `beforeEach` for the old direct-card smoke case, but migrate the old page smoke case to `mountRevision()`; the real API now includes `getRevisionSession`. Do not leave mock query-key differences (`revisionSession` versus `revision`). Tests use `fireEvent`, not an unavailable user-event dependency.

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/RevisionPage.test.tsx`. Expected FAIL: missing topic accessible labels, unmounted selections lost, route state reused.
- [ ] **Step 3 — Minimal implementation.** Move existing page implementation into a non-exported `RevisionPageBody({ sessionId, revisionId })`. Export only the route wrapper:

```tsx
export function RevisionPage() {
  const { sessionId, revisionId } = useParams<{ sessionId: string; revisionId: string }>();
  if (!sessionId || !revisionId) return <ErrorState title="Missing revision" message="Missing session or revision ID." showHomeLink />;
  return <RevisionPageBody key={`${sessionId}:${revisionId}`} sessionId={sessionId} revisionId={revisionId} />;
}
function RevisionPageBody({ sessionId, revisionId }: { sessionId: string; revisionId: string }) {
  // Existing page hook/body moves here; sessionId/revisionId are non-null strings.
}
```

The move retains existing header, carousel animations, reduced-motion variants, theme/settings, original loading/404/error branches, dashboard and revise-again actions. Delete local `quizResults` state and its mutation-result callback. Delete fabricated fallback progress objects. Use the membership-filtered topic array for **all** carousel counts, clamps and TOC navigation:

```tsx
const topics = originalSession?.nodes.filter((node) => revisionSession?.nodes.some((progress) => progress.node_id === node.id)) ?? [];
const currentNode = topics[currentIndex];
const currentRevisionProgress = revisionSession?.nodes.find((progress) => progress.node_id === currentNode?.id);
const [quizStateByNode, setQuizStateByNode] = useState<Record<string, RevisionQuizUiState>>({});
const mutations = useRevisionMutations({ revisionId });
```

Import `createRevisionQuizState`, type-only `RevisionQuizUiState`. Move topic derivation before the navigation callbacks. Replace the navigation callback and bounds exactly:

```tsx
const goToSlide = useCallback((index: number) => {
  if (topics.length === 0) return;
  const clamped = Math.max(0, Math.min(index, topics.length - 1));
  setDirection(clamped > currentIndex ? 1 : clamped < currentIndex ? -1 : 0);
  setCurrentIndex(clamped);
}, [topics.length, currentIndex]);
const canGoNext = currentIndex < topics.length - 1;
const canGoPrev = currentIndex > 0;
```

The original query function now calls `getLearningSession(sessionId)` without a non-null assertion, and keeps its existing original-session query key/staleTime. Card props replace the legacy bridge:

```tsx
<RevisionConceptCard
  node={currentNode} revisionMode={revisionSession.mode}
  revisionProgress={currentRevisionProgress} revisionId={revisionId}
  quizState={quizStateByNode[currentNode.id] ?? createRevisionQuizState()}
  onQuizStateChange={(next) => setQuizStateByNode((previous) => ({ ...previous, [currentNode.id]: next }))}
  quizResults={currentRevisionProgress.quiz_results}
  quizRequestStates={mutations.quizRequestStates[currentNode.id]}
  onQuizSubmit={mutations.submitAnswer} onMarkReviewed={mutations.markReviewed}
  isMarkingReviewed={mutations.reviewRequestStates[currentNode.id]?.isPending}
  markReviewedError={mutations.reviewRequestStates[currentNode.id]?.error}
/>
```

Label topic buttons `aria-label="Next topic"` / `"Previous topic"`. Show loading only from `mutations.isAnyLoading` scoped to this keyed body. Add route ownership validation after both queries load: if `revisionSession.original_session_id !== sessionId`, return the existing recoverable error branch (`Invalid revision ownership`). The keyed body prevents local summary/chat/navigation/request state from surviving a revision route change, while old hook-level success callbacks can still update their **old** cache.

- [ ] **Step 4 — GREEN.** Repeat Step 2; Task 4 tests PASS. `npm run build` detects renamed mutation variables/imports. Until Task 8 removes the shared TOC, retain a temporary plain status mapping without changing its source; the Task 8 red test will enforce correct wording.
- [ ] **Step 5 — Commit.** Stage the two Task 4 paths. Message: `fix(review-parity): preserve controlled quiz inputs across topic navigation`.

## Task 5: Late response protection, refresh restoration, and read/write races

**Files:** modify `client/src/features/learning/useRevisionSession.ts`, `useRevisionMutations.ts`, `useRevisionSession.test.ts`, `useRevisionMutations.test.tsx`, `RevisionPage.test.tsx`.

- [ ] **Step 1 — Add exact race/restore assertions.** In mutation tests add the following. In hook tests import `mergeRevisionNodeResults`, `patchRevisionQuiz` and `RevisionQuizResponse`; add the pure merge test using the explicit fixture below.

```tsx
it('routes out-of-order results to request revision and independent quiz slots', async () => {
  const first = deferred<RevisionQuizResponse>(); const second = deferred<RevisionQuizResponse>();
  api.submitRevisionQuiz.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { client, result, rerender } = harness();
  client.setQueryData(revisionQueryKeys.session('r2'), revision('r2'));
  act(() => result.current.submitAnswer('n', ['b'], 0));
  act(() => result.current.submitAnswer('n', ['b'], 1));
  rerender({ revisionId: 'r2' });
  expect(result.current.isAnyLoading).toBe(false);
  await act(async () => second.resolve(attempt({ id: 'q2', quiz_index: 1, attempt_number: 10 })));
  await act(async () => first.resolve(attempt()));
  await waitFor(() => expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'))?.nodes[0].quiz_results).toHaveLength(2));
  expect(client.getQueryData(revisionQueryKeys.session('r2'))).toEqual(revision('r2'));
  expect(result.current.quizRequestStates).toEqual({});
});
it('cancels a stale active revision read before publishing a saved quiz', async () => {
  const { client, result } = harness();
  const cancel = vi.spyOn(client, 'cancelQueries');
  api.submitRevisionQuiz.mockResolvedValue(attempt());
  act(() => result.current.submitAnswer('n', ['b'], 0));
  await waitFor(() => expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('r'))?.nodes[0].quiz_results).toHaveLength(1));
  expect(cancel).toHaveBeenCalledWith({ queryKey: ['revision', 'r'], exact: true });
});
it('rejects mismatched serialized result identity without applying feedback', async () => {
  const { client, result } = harness();
  api.submitRevisionQuiz.mockResolvedValue(attempt({ quiz_index: 1, revision_session_id: 'foreign' }));
  act(() => result.current.submitAnswer('n', ['b'], 0));
  await waitFor(() => expect(result.current.quizRequestStates.n?.[0]?.error).toBeDefined());
  expect(client.getQueryData(revisionQueryKeys.session('r'))).toEqual(revision());
});
```

```ts
// Add to useRevisionSession.test.ts; fixtures local to this test.
it('merges latest sequence/ID deterministically without losing saved feedback', () => {
  const result: RevisionQuizResponse = {
    id: 'z', revision_session_id: 'r', node_id: 'n', quiz_index: 0,
    attempt_number: 9, quiz_attempt_count: 3, selected_option_ids: ['b'],
    is_correct: false, score_percent: 0, correct_option_ids: [], explanation: '',
    selected_explanation: 'B', created_at: '2026-10-05T00:01:00Z', revision_node_status: 'pending',
  };
  const session: RevisionSessionWithProgress = {
    id: 'r', original_session_id: 's', revision_number: 1, mode: 'quiz_only',
    status: 'in_progress', progress_percent: 0, total_quiz_score_percent: 66,
    started_at: '2026-10-05T00:00:00Z', completed_at: null, notices: [],
    nodes: [{ id: 'p', node_id: 'n', node_title: 'N', sequence_index: 0,
      status: 'pending', reviewed_at: null, content_reviewed_at: null, quiz_count: 2, quiz_results: [] }],
  };
  const cached = patchRevisionQuiz(session, result);
  const incoming = { ...session.nodes[0], quiz_results: [{ ...result, id: 'a', attempt_number: 8 }] };
  expect(mergeRevisionNodeResults(incoming, cached.nodes[0], 'r').quiz_results[0].id).toBe('z');
  expect(patchRevisionQuiz(cached, { ...result, id: 'a' }).nodes[0].quiz_results[0].id).toBe('z');
  expect(patchRevisionQuiz(cached, { ...result, revision_session_id: 'other' })).toBe(cached);
});
```

Add to page tests:

```tsx
it.each<RevisionMode>(['full_review', 'quiz_only'])('restores independent saved feedback after a fresh %s mount', async (mode) => {
  revisionData.mode = mode;
  revisionData.nodes[0].quiz_results = [saved(), saved({ id: 'wrong', quiz_index: 1, attempt_number: 6,
    quiz_attempt_count: 2, is_correct: false, score_percent: 0, selected_option_ids: ['opt-4'], correct_option_ids: [], explanation: '' })];
  const first = mountRevision();
  await screen.findByText('Correct!');
  expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
  await screen.findByText('Incorrect');
  expect(screen.getByText('Attempt #2 • Score: 0%')).toBeInTheDocument();
  first.unmount();
  mountRevision(); await screen.findByText('Correct!');
  fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
  expect(screen.getByText('Incorrect')).toBeInTheDocument();
  expect(api.getRevisionSession).toHaveBeenCalledTimes(2);
});
it('does not leak late failures or pending into a destination revision route', async () => {
  const pending = deferred<RevisionQuizResponse>(); api.submitRevisionQuiz.mockReturnValue(pending.promise);
  const { router, client } = mountRevision();
  await screen.findByText('What is an entity?');
  fireEvent.click(screen.getByRole('radio', { name: /A node/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(1));
  await act(async () => { await router.navigate('/learn/session-1/revise/rev-2'); });
  await screen.findByText('What is an entity?');
  await act(async () => pending.reject(new Error('late old error')));
  expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument();
  expect(screen.queryByText('Updating...')).not.toBeInTheDocument();
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('rev-2'))?.nodes[0].quiz_results).toEqual([]);
});
it('handles two visible quiz requests resolving in reverse order without crossed feedback', async () => {
  revisionData.mode = 'quiz_only';
  const first = deferred<RevisionQuizResponse>(); const second = deferred<RevisionQuizResponse>();
  api.submitRevisionQuiz.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  mountRevision(); await screen.findByText('What is an entity?');
  fireEvent.click(screen.getByRole('radio', { name: /A node/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Next quiz' }));
  expect(screen.getByRole('button', { name: 'Submit Answer' })).not.toHaveTextContent('Submitting...');
  fireEvent.click(screen.getByRole('radio', { name: /A vertex/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(2));
  await act(async () => second.resolve(saved({ id: 'second', quiz_index: 1, attempt_number: 6,
    is_correct: false, score_percent: 0, selected_option_ids: ['opt-4'], correct_option_ids: [], explanation: '' })));
  await screen.findByText('Incorrect');
  expect(screen.getByRole('button', { name: 'Quiz 1: unanswered' })).toBeInTheDocument();
  await act(async () => first.resolve(saved()));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Quiz 1: correct' })).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Quiz 2: incorrect' })).toBeInTheDocument();
  expect(screen.getByText('Incorrect')).toBeInTheDocument();
  expect(screen.getByTestId('revision-concept-card')).toHaveClass('border-border');
  expect(screen.getByTestId('revision-concept-card')).not.toHaveClass('border-green-500', 'border-red-500');
  fireEvent.click(screen.getByRole('button', { name: 'Previous quiz' }));
  expect(screen.getByText('Correct!')).toBeInTheDocument();
});
```

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/useRevisionSession.test.ts src/features/learning/useRevisionMutations.test.tsx src/features/learning/RevisionPage.test.tsx`. Expected FAIL: merge export absent and quiz success does not cancel a stale read. Route/refresh assertions already enabled by Task 4 are regression guards.
- [ ] **Step 3 — Minimal implementation.** Add `mergeRevisionNodeResults` to `useRevisionSession.ts`, import `useQueryClient`, and merge incoming GET results with newer already-saved cache rows without projecting score from latest rows:

```ts
export function mergeRevisionNodeResults(incoming: RevisionNodeProgressWithDetails, cached: RevisionNodeProgressWithDetails | undefined, id: string): RevisionNodeProgressWithDetails {
  const rows = new Map<number, RevisionQuizAttemptResult>();
  for (const row of [...incoming.quiz_results, ...(cached?.quiz_results ?? [])]) {
    if (row.revision_session_id !== id || row.node_id !== incoming.node_id || row.quiz_index >= incoming.quiz_count) continue;
    const existing = rows.get(row.quiz_index);
    if (!existing || isNewerRevisionAttempt(row, existing)) rows.set(row.quiz_index, row);
  }
  return { ...incoming, quiz_results: [...rows.values()].sort((a, b) => a.quiz_index - b.quiz_index) };
}
// Within useRevisionSession:
const queryClient = useQueryClient();
// Replace queryFn:
queryFn: async ({ signal }) => {
  const incoming = await getRevisionSession(revisionId, signal);
  const cached = queryClient.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session(revisionId));
  if (incoming.id !== revisionId) throw new Error('Revision identity mismatch');
  return { ...incoming, nodes: incoming.nodes.map((node) =>
    mergeRevisionNodeResults(node, cached?.nodes.find((previous) => previous.node_id === node.node_id), revisionId)) };
},
```

In both mutation `onSuccess` callbacks, make them `async`, first `await queryClient.cancelQueries({ queryKey: revisionQueryKeys.session(request.revisionId), exact: true })`, then patch immediately and invalidate. Review success merges node results with `mergeRevisionNodeResults(node, previous, request.revisionId)` instead of replacing the whole node. In quiz success, preserve Full Review's explicit review metadata as already done by `patchRevisionQuiz`. Summary cancellation before invalidation belongs to Task 8; do not block saved feedback on aggregate refetch.

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS. Run `npm run build` and `npm run lint`.
- [ ] **Step 5 — Commit.** Stage exactly Task 5's five paths. Message: `fix(review-parity): reconcile late results without crossing revision routes`.

## Task 6: Summary labels describe attempts, not mastery

**Files:** modify `client/src/features/learning/RevisionSummaryModal.tsx`; create `RevisionSummaryModal.test.tsx`.

- [ ] **Step 1 — Write exact label/null/comparison/action tests.**

```tsx
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
  return { revision_id: 'r', mode, progress_percent: 100, nodes_reviewed: 1, nodes_total: 1,
    total_quiz_score_percent: 66, quizzes_passed: 2, quizzes_failed: 1, quizzes_total: 3,
    time_spent_seconds: 60, comparison: { original_quiz_score_percent: 25, improvement_percent: 41 }, notices: [] };
}
it.each<RevisionMode>(['full_review', 'quiz_only'])('labels %s completion separately from attempt accuracy', (mode) => {
  const close = vi.fn(); const again = vi.fn(); const dashboard = vi.fn();
  render(<RevisionSummaryModal revisionSummary={summary(mode)} onClose={close} onReviseAgain={again} onBackToDashboard={dashboard} />);
  expect(screen.getByText(mode === 'full_review' ? 'Topics Reviewed' : 'Topics Finished')).toBeInTheDocument();
  expect(screen.getByText('Attempt Accuracy')).toBeInTheDocument();
  expect(screen.getByText(/2 correct attempts/)).toBeInTheDocument();
  expect(screen.getByText(/1 incorrect attempts/)).toBeInTheDocument();
  expect(screen.getByText(/3 total attempts/)).toBeInTheDocument();
  expect(screen.getByTestId('original-score')).toHaveTextContent('25%');
  fireEvent.click(screen.getByRole('button', { name: 'Revise Again' })); expect(again).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Back to Dashboard' })); expect(dashboard).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close summary' })); expect(close).toHaveBeenCalledTimes(1);
});
it('represents no compatible attempts as unavailable, not zero percent', () => {
  render(<RevisionSummaryModal revisionSummary={{ ...summary('full_review'), total_quiz_score_percent: null,
    quizzes_total: 0, quizzes_passed: 0, quizzes_failed: 0, comparison: null }}
    onClose={vi.fn()} onReviseAgain={vi.fn()} onBackToDashboard={vi.fn()} />);
  expect(screen.getByText('N/A')).toBeInTheDocument();
  expect(screen.getByText('No compatible quiz attempts yet.')).toBeInTheDocument();
  expect(screen.queryByText('0%')).not.toBeInTheDocument();
});
```

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/RevisionSummaryModal.test.tsx`. Expected FAIL: old “Quiz Score” / passed/failed / Practice Topics Reviewed wording and no close button.
- [ ] **Step 3 — Minimal implementation.** Keep modal styling/focus trap/comparison/actions. Replace mode label `Quiz Only` with `Practice Quizzes`. Replace these JSX pieces:

```tsx
<p className="text-xs text-muted-foreground">{revisionSummary.mode === 'full_review' ? 'Topics Reviewed' : 'Topics Finished'}</p>
<p className="text-xs text-muted-foreground">Attempt Accuracy</p>
<span data-testid="quizzes-passed">{revisionSummary.quizzes_passed} correct attempts</span>
<span data-testid="quizzes-failed">{revisionSummary.quizzes_failed} incorrect attempts</span>
<span>{revisionSummary.quizzes_total} total attempts</span>
// After breakdown, only for zero attempts:
{revisionSummary.quizzes_total === 0 && <p className="text-center text-sm text-muted-foreground">No compatible quiz attempts yet.</p>}
// In the modal header:
<button type="button" aria-label="Close summary" onClick={onClose}
  className="absolute right-3 top-3 rounded-md px-2 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">Close</button>
```

Do not compute score from `quizzes_passed`/latest flags: display `total_quiz_score_percent` exactly as the server integer. Remove `Math.round` only where redundant for the server integer, not duration logic. Replace focus cast with `const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;`. Preserve Escape/backdrop/focus restoration.

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS.
- [ ] **Step 5 — Commit.** Stage both Task 6 paths. Message: `fix(review-parity): label summary metrics as attempt accuracy`.

## Task 7: History shows server progress and consistent accuracy

**Files:** modify `client/src/features/learning/RevisionHistoryList.tsx`; create `RevisionHistoryList.test.tsx`.

- [ ] **Step 1 — Write exact lazy-load and label assertions.**

```tsx
/**
 * ============================================================================
 * FILE: RevisionHistoryList.test.tsx
 * LOCATION: client/src/features/learning/RevisionHistoryList.test.tsx
 * ============================================================================
 * PURPOSE:
 *    Verify lazy revision history with authoritative completion and accuracy.
 * ROLE IN PROJECT:
 *    Prevents history presenting Practice completion as mastery or score passes.
 * KEY COMPONENTS:
 *    - QueryClient list harness: Mode, null accuracy and navigation tests
 * ============================================================================
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { RevisionListResponse } from '@/types/learning';
import { RevisionHistoryList } from './RevisionHistoryList';
const api = vi.hoisted(() => ({ getRevisionsList: vi.fn() }));
vi.mock('@/lib/learningApi', () => api);
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('lazy-loads mode completion and server attempt accuracy without an 80% pass rule', async () => {
  const data: RevisionListResponse = { total_count: 2, revisions: [
    { id: 'r', original_session_id: 's', revision_number: 2, mode: 'quiz_only', status: 'completed',
      progress_percent: 100, total_quiz_score_percent: 66, started_at: '2026-10-05T00:00:00Z', completed_at: '2026-10-05T00:01:00Z', notices: [] },
    { id: 'r0', original_session_id: 's', revision_number: 1, mode: 'full_review', status: 'in_progress',
      progress_percent: 50, total_quiz_score_percent: null, started_at: '2026-10-04T00:00:00Z', completed_at: null, notices: [] },
  ] };
  api.getRevisionsList.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigate = vi.fn();
  const view = render(<QueryClientProvider client={client}><RevisionHistoryList sessionId="s" onViewRevision={navigate} /></QueryClientProvider>);
  expect(api.getRevisionsList).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revision History' }));
  expect(await screen.findByText('Practice Quizzes')).toBeInTheDocument();
  expect(screen.getByText('100% practice finished')).toBeInTheDocument();
  expect(screen.getByText('50% reviewed')).toBeInTheDocument();
  expect(screen.getByText('66% attempt accuracy')).toBeInTheDocument();
  expect(screen.getByText('Attempt accuracy: N/A')).toBeInTheDocument();
  expect(screen.queryByText(/mastered|passed|failed/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByTestId('revision-row')[0]); expect(navigate).toHaveBeenCalledWith('r');
  expect(api.getRevisionsList).toHaveBeenCalledTimes(1);
  view.unmount(); client.clear();
});
```

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/RevisionHistoryList.test.tsx`. Expected FAIL: missing mode completion and attempt-accuracy copy.
- [ ] **Step 3 — Minimal implementation.** Import `revisionQueryKeys` and use `revisionQueryKeys.list(sessionId)`. Replace Practice's label and remove `isPassed`/80% threshold. Use neutral accuracy styling; retain authoritative status “In Progress”, list ordering/loading/error/no-revisions/navigation behavior:

```tsx
<span className="text-muted-foreground">
  {revision.progress_percent}% {revision.mode === 'full_review' ? 'reviewed' : 'practice finished'}
</span>
<span className="shrink-0 font-medium text-muted-foreground" data-testid="revision-score">
  {score === null ? 'Attempt accuracy: N/A' : `${score}% attempt accuracy`}
</span>
```

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS.
- [ ] **Step 5 — Commit.** Stage both Task 7 paths. Message: `fix(review-parity): align history completion and attempt accuracy labels`.

## Task 8: Explicit summary opening and refreshed attempt metrics

**Files:** modify `client/src/features/learning/RevisionPage.tsx`, `useRevisionMutations.ts`, `RevisionPage.test.tsx`.

- [ ] **Step 1 — Write final-attempt/no-auto-open and stale-summary regression tests.** Use the Task 4 page helpers:

```tsx
it('keeps final wrong feedback readable and opens summary only by request', async () => {
  revisionData.mode = 'quiz_only'; revisionData.nodes = [revisionData.nodes[0]];
  revisionData.nodes[0].quiz_results = [saved()];
  api.submitRevisionQuiz.mockImplementation(async () => {
    const result = saved({ id: 'second', quiz_index: 1, attempt_number: 6,
      is_correct: false, score_percent: 0, selected_option_ids: ['opt-4'], correct_option_ids: [], explanation: '', revision_node_status: 'quiz_failed' });
    revisionData.nodes[0].quiz_results.push(result); revisionData.nodes[0].status = 'quiz_failed';
    revisionData.status = 'completed'; revisionData.progress_percent = 100;
    revisionData.total_quiz_score_percent = 50; revisionData.completed_at = '2026-10-05T00:02:00Z';
    return result;
  });
  mountRevision(); await screen.findByText('Correct!');
  fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: unanswered' }));
  fireEvent.click(screen.getByRole('radio', { name: /A vertex/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await screen.findByText('Incorrect');
  expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
  expect(api.getRevisionSummary).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'View Summary' }));
  const modal = await screen.findByRole('dialog', { name: 'Revision Summary' });
  expect(within(modal).getByText('50%')).toBeInTheDocument();
});
it('invalidates a viewed summary on retry and preserves the first completion timestamp', async () => {
  revisionData.mode = 'quiz_only'; revisionData.nodes = [revisionData.nodes[0]];
  const wrong = saved({ id: 'wrong', quiz_index: 1, is_correct: false, score_percent: 0,
    selected_option_ids: ['opt-4'], correct_option_ids: [], explanation: '', attempt_number: 6 });
  revisionData.nodes[0].quiz_results = [saved(), wrong]; revisionData.nodes[0].status = 'quiz_failed';
  revisionData.status = 'completed'; revisionData.progress_percent = 100;
  revisionData.total_quiz_score_percent = 50; revisionData.completed_at = '2026-10-05T00:02:00Z';
  const { client } = mountRevision(); await screen.findByText('Correct!');
  expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View Summary' }));
  await screen.findByRole('dialog', { name: 'Revision Summary' });
  fireEvent.click(screen.getByRole('button', { name: 'Close summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quiz 2: incorrect' }));
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
  api.getRevisionSummary.mockResolvedValue(summary({ total_quiz_score_percent: 66, quizzes_passed: 2, quizzes_failed: 1, quizzes_total: 3 }));
  api.submitRevisionQuiz.mockImplementation(async () => {
    const result = saved({ id: 'retry', quiz_index: 1, attempt_number: 7, quiz_attempt_count: 2,
      selected_option_ids: ['opt-3'], correct_option_ids: ['opt-3'], revision_node_status: 'quiz_passed' });
    revisionData.nodes[0].quiz_results = [saved(), result]; revisionData.nodes[0].status = 'quiz_passed';
    revisionData.total_quiz_score_percent = 66; return result;
  });
  fireEvent.click(screen.getByRole('radio', { name: /An edge/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await screen.findByText('Attempt #2 • Score: 100%');
  await waitFor(() => expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('rev-1'))?.total_quiz_score_percent).toBe(66));
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('rev-1'))?.completed_at).toBe('2026-10-05T00:02:00Z');
  fireEvent.click(screen.getByRole('button', { name: 'View Summary' }));
  const modal = await screen.findByRole('dialog', { name: 'Revision Summary' });
  expect(within(modal).getByText('66%')).toBeInTheDocument();
  expect(within(modal).getByText('3 total attempts')).toBeInTheDocument();
  expect(api.getRevisionSummary).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/RevisionPage.test.tsx`. Expected FAIL: summary auto-fetch/auto-open, no explicit View Summary, stale infinite query.
- [ ] **Step 3 — Minimal implementation.** Delete `summaryDismissed`, `showSummary` derivation, the automatic summary availability/course invalidation effect, and all dismissal logic. Add route-local explicit visibility and query (server status alone does not open anything):

```tsx
const [isSummaryOpen, setIsSummaryOpen] = useState(false);
const summaryQuery = useQuery({
  queryKey: revisionQueryKeys.summary(revisionId),
  queryFn: ({ signal }) => getRevisionSummary(revisionId, signal),
  enabled: isSummaryOpen && revisionSession?.status === 'completed',
  staleTime: 30_000,
});
// Header, only if authoritative completion and a nonzero participating count:
{revisionSession.status === 'completed' && getRevisionCompletion(revisionSession).total > 0 && (
  <button type="button" onClick={() => setIsSummaryOpen(true)} className="rounded-md border px-3 py-1.5 focus-visible:ring-2 focus-visible:ring-primary">View Summary</button>
)}
{isSummaryOpen && summaryQuery.isFetching && <p role="status">Loading summary...</p>}
{isSummaryOpen && summaryQuery.isError && <div role="alert">
  Could not load the summary. <button type="button" onClick={() => { void summaryQuery.refetch(); }}>Try loading summary again</button>
  <button type="button" onClick={() => setIsSummaryOpen(false)}>Close summary</button>
</div>}
{isSummaryOpen && !summaryQuery.isFetching && !summaryQuery.isError && summaryQuery.data?.revision_id === revisionId && (
  <RevisionSummaryModal revisionSummary={summaryQuery.data} onClose={() => setIsSummaryOpen(false)}
    onReviseAgain={handleReviseAgain} onBackToDashboard={() => navigate('/learn')} />
)}
```

Do not wait for metrics before saved feedback. Inside mutation success, before summary invalidation, `await queryClient.cancelQueries({ queryKey: revisionQueryKeys.summary(request.revisionId), exact: true });` to cancel an obsolete in-flight summary; patch quiz feedback **before** this await. Revision invalidation is still immediate via `invalidate`; add summary cancellation before calling it. Opening a stale cached summary hides the old modal while `isFetching`, then displays fresh metrics. Refetch failures have a visible recovery action; do not silently display stale accuracy.

Revise-again remains explicit: guard late navigation from an unmounted route and expose creation failure. Keep `queryClient = useQueryClient()` for these exact scoped invalidations. Replace `handleReviseAgain`:

```tsx
const mounted = useRef(true);
const [createRevisionError, setCreateRevisionError] = useState<string>();
const [isCreatingRevision, setIsCreatingRevision] = useState(false);
useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
const handleReviseAgain = useCallback(async () => {
  if (!revisionSession || isCreatingRevision) return;
  setCreateRevisionError(undefined); setIsCreatingRevision(true);
  try {
    const next = await createRevisionSession(sessionId, { mode: revisionSession.mode });
    void queryClient.invalidateQueries({ queryKey: revisionQueryKeys.list(sessionId), exact: true });
    void queryClient.invalidateQueries({ queryKey: ['courses'] });
    if (mounted.current) navigate(`/learn/${sessionId}/revise/${next.id}`);
  } catch (error: unknown) {
    console.error('Could not create another revision:', error);
    if (mounted.current) setCreateRevisionError('Could not create another revision. Please try again.');
  } finally {
    if (mounted.current) setIsCreatingRevision(false);
  }
}, [revisionSession, sessionId, isCreatingRevision, queryClient, navigate]);
// Outside the carousel and summary dialog:
{createRevisionError && <p role="alert">{createRevisionError}</p>}
```

These hooks precede early returns. The existing modal's repeated clicks are ignored by the `isCreatingRevision` guard; do not alter its prop contract.

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS; `npm run build`.
- [ ] **Step 5 — Commit.** Stage Task 8's three paths. Message: `fix(review-parity): open current revision summaries explicitly`.

## Task 9: Mode-aware progress, revision-only TOC, and compatibility guidance

**Files:** modify `client/src/features/learning/RevisionPage.tsx`, `RevisionPage.test.tsx`, `useRevisionSession.test.ts`.

- [ ] **Step 1 — Add exact completion/notices/empty-state assertions.** Import `getRevisionCompletion` in the hook test and add the denominator test; add page cases:

```ts
it('excludes quizless Practice topics and never completes an empty denominator', () => {
  const base: RevisionSessionWithProgress = {
    id: 'r', original_session_id: 's', revision_number: 1, mode: 'quiz_only', status: 'in_progress',
    progress_percent: 0, total_quiz_score_percent: null, started_at: '2026-10-05T00:00:00Z', completed_at: null, notices: [],
    nodes: [{ id: 'p', node_id: 'n', node_title: 'N', sequence_index: 0,
      status: 'quiz_passed', reviewed_at: null, content_reviewed_at: null, quiz_count: 0, quiz_results: [] }],
  };
  expect(getRevisionCompletion(base)).toEqual({ total: 0, completed: 0 });
  expect(getRevisionCompletion({ ...base, mode: 'full_review' })).toEqual({ total: 1, completed: 0 });
});
```

```tsx
it('uses finished Practice coverage, including wrong attempts, in header and TOC', async () => {
  revisionData.mode = 'quiz_only';
  revisionData.nodes[0].quiz_results = [saved(), saved({ id: 'wrong', quiz_index: 1, is_correct: false,
    score_percent: 0, selected_option_ids: ['opt-4'], correct_option_ids: [], explanation: '' })];
  revisionData.nodes[0].status = 'quiz_failed'; revisionData.progress_percent = 50;
  mountRevision(); await screen.findByText('Correct!');
  expect(screen.getByText('1 / 2 topics finished')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Table of Contents' }));
  const toc = screen.getByRole('dialog', { name: 'Table of Contents' });
  expect(within(toc).getByText('Practice finished')).toBeInTheDocument();
  expect(within(toc).queryByText(/Mastered|Locked/)).not.toBeInTheDocument();
  fireEvent.click(within(toc).getByRole('button', { name: 'Second topic' }));
  expect(screen.getByRole('heading', { name: 'Second topic' })).toBeInTheDocument();
});
it('displays compatibility notices once per page and leaves compatible quizzes usable', async () => {
  revisionData.notices = [
    { code: 'legacy_review_required', node_id: 'node-1', attempt_count: 0 },
    { code: 'legacy_review_required', node_id: 'node-2', attempt_count: 0 },
    { code: 'incompatible_attempts', node_id: 'node-1', attempt_count: 2 },
    { code: 'completion_recalculated', node_id: null, attempt_count: 0 },
    { code: 'legacy_review_inferred', node_id: 'node-2', attempt_count: 0 },
  ];
  mountRevision(); await screen.findByText('What is an entity?');
  expect(screen.getAllByText(/Earlier quiz activity did not record explicit reading review/)).toHaveLength(1);
  expect(screen.getByText(/2 historical attempts were retained/)).toBeInTheDocument();
  expect(screen.getByText(/Completion was recalculated/)).toBeInTheDocument();
  expect(screen.getByText(/Earlier explicit review was restored/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeEnabled();
});
it('keeps quizless topics navigable and never auto-opens an empty Practice summary', async () => {
  revisionData.mode = 'quiz_only'; revisionData.nodes.forEach((node) => { node.quiz_count = 0; });
  originalData.nodes.forEach((node) => { node.quiz = null; node.quiz_set = null; });
  mountRevision(); await screen.findByText('No practice quizzes available.');
  expect(screen.getByText('0 / 0 topics finished')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'View Summary' })).not.toBeInTheDocument();
  topicNext(); await screen.findByRole('heading', { name: 'Second topic' });
  expect(screen.getByText('No quiz available for this topic.')).toBeInTheDocument();
});
it('handles an empty revision without a nonexistent Topic 1 of 0', async () => {
  revisionData.nodes = []; originalData.nodes = [];
  mountRevision(); await screen.findByText('No topics available in this revision.');
  expect(screen.queryByText('Topic 1 of 0')).not.toBeInTheDocument();
  expect(api.getRevisionSummary).not.toHaveBeenCalled();
});
```

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/RevisionPage.test.tsx src/features/learning/useRevisionSession.test.ts`. Expected FAIL: old header count/TOC mastery labels, absent notices/zero guidance.
- [ ] **Step 3 — Minimal implementation.** Header uses `getRevisionCompletion`:

```tsx
const { completed: completedNodes, total: totalNodes } = getRevisionCompletion(revisionSession);
const modeLabel = revisionSession.mode === 'full_review' ? 'Full Review' : 'Practice Quizzes';
// Existing live header text:
{completedNodes} / {totalNodes} topics {revisionSession.mode === 'full_review' ? 'reviewed' : 'finished'}
// Beside count, never derive accuracy from node statuses:
<span>{revisionSession.total_quiz_score_percent === null ? 'Attempt accuracy: N/A' : `${revisionSession.total_quiz_score_percent}% attempt accuracy`}</span>
```

Add a non-exported `RevisionContentsDialog` in `RevisionPage.tsx`. Keep existing TOC button/test ID; remove import/use of the shared learning TOC. This dialog has route-local open state, all topic buttons navigable, mode-specific labels, focus trap/restore, Escape and backdrop close, neutral statuses:

```tsx
function RevisionContentsDialog({ topics, session, currentNodeId, onSelect, onClose }: {
  topics: ConceptNode[]; session: RevisionSessionWithProgress; currentNodeId?: string;
  onSelect: (index: number) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Table of Contents" tabIndex={-1}
      className="max-h-[80dvh] w-full max-w-4xl overflow-y-auto rounded-xl border bg-card p-6"
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const controls = ref.current?.querySelectorAll<HTMLButtonElement>('button');
        const first = controls?.[0]; const last = controls?.[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <button type="button" aria-label="Close Table of Contents" onClick={onClose} className="rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:ring-primary">Close</button>
      <h2 className="text-xl font-bold">Table of Contents</h2>
      <table className="w-full text-left text-sm"><thead><tr><th>Topic</th><th>Quizzes</th><th>Difficulty</th><th>Status</th></tr></thead>
        <tbody>{topics.map((node, index) => {
          const progress = session.nodes.find((row) => row.node_id === node.id);
          const label = session.mode === 'full_review'
            ? progress?.content_reviewed_at ? 'Reviewed' : 'Reading pending'
            : progress?.quiz_count === 0 ? 'No quiz available'
              : progress && progress.quiz_results.length === progress.quiz_count ? 'Practice finished' : 'Practice pending';
          return <tr key={node.id} className="border-t">
            <td className="p-3"><button type="button" aria-current={currentNodeId === node.id ? 'step' : undefined}
              onClick={() => { onSelect(index); onClose(); }} className="rounded text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary">{node.title}</button></td>
            <td>{progress?.quiz_count ?? 0}</td><td>{node.complexity}</td><td>{label}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
```

Import the needed types from P1. In the page render use `{isTOCOpen && <RevisionContentsDialog topics={topics} session={revisionSession} currentNodeId={currentNode?.id} onSelect={goToSlide} onClose={() => setIsTOCOpen(false)} />}`.

Render grouped notice copy once outside the carousel (one message per code, incompatible count summed). The map is exhaustive via `Record<RevisionNoticeCode, string>`:

```tsx
const noticeCopy: Record<RevisionNoticeCode, string> = {
  legacy_review_inferred: 'Earlier explicit review was restored from the saved review date.',
  legacy_review_required: 'Earlier quiz activity did not record explicit reading review. Use Mark as Reviewed to finish reading.',
  incompatible_attempts: `${revisionSession.notices.filter((notice) => notice.code === 'incompatible_attempts').reduce((sum, notice) => sum + notice.attempt_count, 0)} historical attempts were retained but cannot match the available quizzes. They are excluded from feedback, completion, and accuracy.`,
  completion_recalculated: 'Completion was recalculated from reading review or submitted quizzes. Earlier completion totals may be lower; saved compatible feedback remains available.',
};
const noticeCodes = [...new Set(revisionSession.notices.map((notice) => notice.code))];
// Outside topic card:
{noticeCodes.length > 0 && <aside aria-label="Revision compatibility notices" className="rounded-lg border bg-muted/30 p-3">
  {noticeCodes.map((code) => <p key={code} className="text-sm text-muted-foreground">{noticeCopy[code]}</p>)}
</aside>}
{revisionSession.mode === 'quiz_only' && totalNodes === 0 && <p role="status">No practice quizzes available.</p>}
{topics.length === 0 && <p role="status">No topics available in this revision.</p>}
{revisionSession.nodes.some((node) => !originalSession.nodes.some((topic) => topic.id === node.node_id)) && (
  <p role="status">Some saved revision topics are unavailable in this course. Available topics remain usable.</p>
)}
```

Do not use toast/effects repeatedly firing notices. Stable keyed messages remain one per page; refetch can remove resolved notices without duplication. Full Review quizless topics still render Mark as Reviewed; Practice excludes them but keeps them in `topics`. Hide topic counter/buttons/FAB when there is no topic.

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS; run `npm run build` and `npm run lint`.
- [ ] **Step 5 — Commit.** Stage Task 9's three paths. Message: `fix(review-parity): align completion TOC and legacy revision guidance`.

## Task 10: Wire explicit chat targeting into a bounded split/overlay shell

**Files:** modify `client/src/features/learning/RevisionPage.tsx`, `RevisionPage.test.tsx`.

- [ ] **Step 1 — Write card-to-controller-to-panel tests.** Keep actual P4/P5 components; mock only chat transport (`@/lib/chatApi`), not the controller/panel/hook. The inspected `streamConceptChat` parameters include `sessionId`, `nodeId`, `message`, `selectedHeadingIds`, `onDelta`, and optional `signal`. Add these mocks to the page test:

```tsx
const chatApi = vi.hoisted(() => ({ streamConceptChat: vi.fn() }));
vi.mock('@/lib/chatApi', () => chatApi);
// beforeEach addition:
chatApi.streamConceptChat.mockResolvedValue(undefined);
// No secrets are needed until Send is clicked; these tests only prefill/context.
it('prefills repeated curiosity clicks without sending and retains explicit chat ownership', async () => {
  originalData.nodes[0].content_markdown = '## Entities\nBody.\n\n## Curious to explore more?\n- Why use graphs?';
  originalData.nodes[1].content_markdown = '## Relations\nBody.\n\n## Curious to explore more?\n- Why use edges?';
  mountRevision(); const question = await screen.findByRole('button', { name: /Why use graphs/ });
  fireEvent.click(question);
  const composer = await screen.findByRole('textbox', { name: 'Ask a question about this concept' });
  await waitFor(() => expect(composer).toHaveValue('Why use graphs?'));
  await waitFor(() => expect(composer).toHaveFocus());
  expect(chatApi.streamConceptChat).not.toHaveBeenCalled();
  fireEvent.change(composer, { target: { value: 'edited draft' } }); fireEvent.click(question);
  await waitFor(() => expect(composer).toHaveValue('Why use graphs?'));
  topicNext(); await screen.findByRole('heading', { name: 'Second topic' });
  expect(screen.getByRole('heading', { name: 'Chat: Knowledge Graphs 101' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Why use edges/ }));
  expect(screen.getByRole('heading', { name: 'Chat: Second topic' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close concept chat' }));
  fireEvent.click(screen.getByRole('button', { name: /Why use edges/ }));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Why use edges?'));
});
it('places desktop chat within the bounded main shell and preserves it on revision completion', async () => {
  revisionData.status = 'completed'; revisionData.mode = 'full_review';
  revisionData.nodes.forEach((node) => { node.content_reviewed_at = '2026-10-05T00:01:00Z'; node.status = 'reviewed'; });
  localStorage.setItem('concept_chat_session-1_node-1', JSON.stringify({
    messages: [{ role: 'user', content: 'Preserved conversation' }], lastPromptTimestamp: Date.now(), webSearchEnabled: false,
  }));
  mountRevision(); fireEvent.click(await screen.findByRole('button', { name: 'Open concept chat' }));
  const chat = screen.getByRole('dialog', { name: 'Chat: Knowledge Graphs 101' });
  expect(screen.getByRole('main').contains(chat)).toBe(true);
  expect(screen.getByRole('separator', { name: 'Resize chat panel' })).toHaveAttribute('aria-valuenow', '25');
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '38');
  expect(await screen.findByText('Preserved conversation')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Chat:/ })).not.toBeInTheDocument());
  expect(localStorage.getItem('concept_chat_session-1_node-1')).toContain('Preserved conversation');
});
it('uses the mobile overlay without a desktop separator', async () => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({ media, matches: false,
    onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  mountRevision(); fireEvent.click(await screen.findByRole('button', { name: 'Open concept chat' }));
  expect(screen.getByTestId('concept-chat-overlay')).toBeInTheDocument();
  expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  expect(screen.getByRole('main').contains(screen.getByRole('dialog', { name: /Chat:/ }))).toBe(true);
});
```

The inspected chat storage key is `concept_chat_${sessionId}_${nodeId}`. Task 11 includes the exact real-Markdown heading-to-request assertions; the renderer names those buttons `Chat about "Entities"` / `Chat about "Relations"`. Do not edit the renderer or introduce revision chat storage.

- [ ] **Step 2 — RED.** `npm run test -- --run src/features/learning/RevisionPage.test.tsx`. Expected FAIL: missing curiosity callbacks, chat outside main, target follows carousel, completion deletes history, absent split/overlay.
- [ ] **Step 3 — Minimal implementation.** Import `ConceptChatLayout` and `useConceptChatPanel`. Define controller before any early return using the optional current topic:

```tsx
const chat = useConceptChatPanel({ sessionId, activeTopicId: currentNode?.id, activeTopicTitle: currentNode?.title });
// Additional card props:
selectedHeadingIds={chat.chatNodeId === currentNode.id ? chat.selectedHeadingIds : []}
onToggleHeadingChat={(headingId) => chat.toggleHeadingChat(headingId, currentNode.id, currentNode.title)}
onAskQuestion={(question) => chat.askQuestion(question, currentNode.id, currentNode.title)}
```

Delete old `isChatOpen` state and the detached footer-area `<ChatPanel>`. Root becomes `h-dvh min-h-0 flex flex-col overflow-hidden bg-background`; header/footer are `shrink-0`, main is `flex-1 min-h-0 overflow-hidden`. Retain course title/carousel/topic navigation inside the layout's scrollable content:

```tsx
<main id="main-content" className="min-h-0 flex-1 overflow-hidden">
  <ConceptChatLayout isChatOpen={chat.isOpen} chatWidthPercent={chat.chatWidthPercent}
    onChatWidthChange={chat.setChatWidthPercent} onCloseChat={chat.closeChat}
    className="[&_[role=dialog]]:max-md:!w-full"
    chatPanel={<ChatPanel isOpen={chat.isOpen} onClose={chat.closeChat}
      sessionId={sessionId} nodeId={chat.chatNodeId} topicTitle={chat.chatTopicTitle}
      selectedHeadingIds={chat.selectedHeadingIds} onClearHeadings={chat.clearHeadings}
      widthPercent={chat.chatWidthPercent} prefillMessage={chat.prefillMessage} onPrefillConsumed={chat.consumePrefill} />}>
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Existing course title, notices, counter, carousel and topic buttons move here. */}
    </div>
  </ConceptChatLayout>
</main>
```

The comment above identifies the existing block to move, not new omitted code: move it unchanged except the props/counts already specified. Do not introduce a new content component or hide/unmount content when chat opens. Scoped responsive `!w-full` overrides panel animation only below 768px; at 768px use the existing 25–38% width. P7 must verify computed width in a real browser, not infer CSS behavior from jsdom.

FAB uses `!chat.isOpen && currentNode`, `onClick={() => chat.openChat(currentNode.id, currentNode.title)}`. `onClose`/Escape retain controller target, so a question or FAB explicitly captures a destination while carousel alone changes no chat ownership. **Do not pass completion to chat**. Keep existing session-plus-node browser storage and streaming transport.

- [ ] **Step 4 — GREEN.** Repeat Step 2; PASS; `npm run build` and `npm run lint`. If tests expose a P5 producer bug rather than caller wiring, stop and report to that owner; no P5 edits.
- [ ] **Step 5 — Commit.** Stage Task 10's two paths. Message: `fix(review-parity): integrate explicit concept chat split layout`.

## Task 11: Recovery, authoritative completion, and cross-action integration gates

**Files:** modify `client/src/features/learning/RevisionPage.test.tsx` and only the already-owned production file implicated by a failing assertion (`RevisionPage.tsx`, `useRevisionSession.ts` or `useRevisionMutations.ts`). No P7 files.

- [ ] **Step 1 — Add exact recoverability/Full Review ownership tests.**

```tsx
it.each<RevisionMode>(['full_review', 'quiz_only'])('preserves %s inputs and previous feedback through a failed retry', async (mode) => {
  revisionData.mode = mode; revisionData.nodes[0].quiz_results = [saved({ id: 'wrong', is_correct: false,
    score_percent: 0, selected_option_ids: ['opt-2'], correct_option_ids: [], explanation: '' })];
  mountRevision(); await screen.findByText('Incorrect');
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
  fireEvent.click(screen.getByRole('radio', { name: /A node/ }));
  api.submitRevisionQuiz.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await screen.findByText('Could not save this answer. Please try again.');
  expect(screen.getByRole('radio', { name: /A node/ })).toBeChecked();
  expect(screen.getByText('Previous saved feedback')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Quiz 1: incorrect' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeEnabled();
  api.submitRevisionQuiz.mockResolvedValueOnce(saved({ id: 'retry', attempt_number: 6, quiz_attempt_count: 2 }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await screen.findByText('Correct!');
});
it('requires explicit Full Review reading and does not undo it after a wrong quiz', async () => {
  revisionData.mode = 'full_review'; revisionData.nodes = [revisionData.nodes[0]];
  api.markNodeReviewed.mockRejectedValueOnce(new Error('offline'));
  const { client } = mountRevision(); await screen.findByText('What is an entity?');
  fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
  await screen.findByText('Could not mark this topic as reviewed. Please try again.');
  expect(screen.getByText('0 / 1 topics reviewed')).toBeInTheDocument();
  api.markNodeReviewed.mockImplementationOnce(async () => {
    revisionData.nodes[0].content_reviewed_at = '2026-10-05T00:01:00Z'; revisionData.nodes[0].status = 'reviewed';
    revisionData.status = 'completed'; revisionData.progress_percent = 100; revisionData.completed_at = '2026-10-05T00:01:00Z';
    return structuredClone(revisionData.nodes[0]);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
  await screen.findByText('1 / 1 topics reviewed');
  api.submitRevisionQuiz.mockImplementationOnce(async () => {
    const wrong = saved({ id: 'wrong', attempt_number: 6, is_correct: false, score_percent: 0,
      selected_option_ids: ['opt-2'], correct_option_ids: [], explanation: '', revision_node_status: 'reviewed' });
    revisionData.nodes[0].quiz_results = [wrong]; return wrong;
  });
  fireEvent.click(screen.getByRole('radio', { name: /A line/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' })); await screen.findByText('Incorrect');
  expect(screen.getByText('1 / 1 topics reviewed')).toBeInTheDocument();
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('rev-1'))?.nodes[0].content_reviewed_at).toBe('2026-10-05T00:01:00Z');
  expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
});
it('keeps a new saved result visible while a slow aggregate query is pending', async () => {
  revisionData.mode = 'quiz_only'; revisionData.nodes = [revisionData.nodes[0]];
  revisionData.nodes[0].quiz_count = 1;
  originalData.nodes[0].quiz = originalData.nodes[0].quiz_set?.quizzes[0] ?? null;
  originalData.nodes[0].quiz_set = null;
  const slow = deferred<RevisionSessionWithProgress>();
  mountRevision(); await screen.findByText('What is an entity?');
  api.getRevisionSession.mockReturnValueOnce(slow.promise);
  api.submitRevisionQuiz.mockResolvedValueOnce(saved());
  fireEvent.click(screen.getByRole('radio', { name: /A node/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await screen.findByText('Correct!');
  expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Practice finished');
  await act(async () => slow.resolve(structuredClone(revisionData)));
  expect(screen.getByText('Correct!')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Practice finished'));
});
it('surfaces summary fetch failure without hiding readable feedback', async () => {
  revisionData.status = 'completed'; revisionData.nodes.forEach((node) => { node.content_reviewed_at = '2026-10-05T00:01:00Z'; });
  revisionData.nodes[0].quiz_results = [saved()]; api.getRevisionSummary.mockRejectedValueOnce(new Error('offline'));
  mountRevision(); await screen.findByText('Correct!');
  fireEvent.click(screen.getByRole('button', { name: 'View Summary' }));
  await screen.findByText(/Could not load the summary/);
  expect(screen.getByText('Correct!')).toBeInTheDocument();
  api.getRevisionSummary.mockResolvedValueOnce(summary({ mode: 'full_review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Try loading summary again' }));
  await screen.findByRole('dialog', { name: 'Revision Summary' });
});
```

Add these complete late-success and summary-read route races, distinct from Task 5's failure case:

```tsx
it('patches only the old revision cache when a successful answer arrives after navigation', async () => {
  const pending = deferred<RevisionQuizResponse>(); api.submitRevisionQuiz.mockReturnValueOnce(pending.promise);
  const { router, client } = mountRevision(); await screen.findByText('What is an entity?');
  fireEvent.click(screen.getByRole('radio', { name: /A node/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
  await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(1));
  await act(async () => { await router.navigate('/learn/session-1/revise/rev-2'); });
  await screen.findByText('What is an entity?');
  await act(async () => pending.resolve(saved()));
  await waitFor(() => expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('rev-1'))?.nodes[0].quiz_results[0]?.id).toBe('attempt-1'));
  expect(client.getQueryData<RevisionSessionWithProgress>(revisionQueryKeys.session('rev-2'))?.nodes[0].quiz_results).toEqual([]);
  expect(screen.getByRole('radio', { name: /A node/ })).not.toBeChecked();
  expect(screen.queryByText('Updating...')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
});
it('does not open an old requested summary on the destination revision', async () => {
  revisionData.status = 'completed'; revisionData.nodes.forEach((node) => { node.content_reviewed_at = '2026-10-05T00:01:00Z'; });
  const pending = deferred<RevisionSummary>(); api.getRevisionSummary.mockReturnValueOnce(pending.promise);
  const { router } = mountRevision(); await screen.findByRole('button', { name: 'View Summary' });
  fireEvent.click(screen.getByRole('button', { name: 'View Summary' }));
  await waitFor(() => expect(api.getRevisionSummary).toHaveBeenCalledTimes(1));
  await act(async () => { await router.navigate('/learn/session-1/revise/rev-2'); });
  await screen.findByRole('button', { name: 'View Summary' });
  await act(async () => pending.resolve(summary()));
  expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
  expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
});
```

Heading test uses the inspected accessible names and verifies the real request's context. Retain the actual chat hook; the transport mock is the only replacement:

```tsx
it('scopes heading context to the explicit chat target rather than carousel topic', async () => {
  originalData.nodes[0].content_markdown = '## Entities\nBody.';
  originalData.nodes[1].content_markdown = '## Relations\nBody.';
  mountRevision(); await screen.findByText('Entities');
  const headingControl = screen.getByRole('button', { name: 'Chat about "Entities"' });
  fireEvent.click(headingControl);
  expect(screen.getByText('1 heading selected')).toBeInTheDocument();
  topicNext(); await screen.findByText('Relations');
  expect(screen.getByRole('heading', { name: 'Chat: Knowledge Graphs 101' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Chat about "Relations"' }));
  expect(screen.getByRole('heading', { name: 'Chat: Second topic' })).toBeInTheDocument();
  expect(screen.getByText('1 heading selected')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain this section.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(chatApi.streamConceptChat).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 'session-1', nodeId: 'node-2', selectedHeadingIds: ['h-2-relations'],
  })));
});
```

- [ ] **Step 2 — RED/regression gate.** `npm run test -- --run src/features/learning/RevisionPage.test.tsx`. Expected new FAIL: the slow stale aggregate response merges saved rows but resets the single-quiz Practice badge to pending. The remaining integrated assertions should already pass. Do not manufacture a failure by breaking already-correct producer behavior. Record the failing assertion and cause before changing source.
- [ ] **Step 3 — Minimal race hardening only if red.** A stale GET merging newer quiz rows must also retain its compatible derived node status (Practice coverage may stay finished after retries). Use `mergeRevisionNodeResults` in `useRevisionSession.ts` to recompute **node** status from successful compatible results in Practice, and Full Review's explicit timestamp, while leaving revision aggregate score/timestamps authoritative. If Task 11's slow read test exposes a reset, the exact replacement return is:

```ts
// Signature update, using a type-only RevisionMode import:
export function mergeRevisionNodeResults(
  incoming: RevisionNodeProgressWithDetails,
  cached: RevisionNodeProgressWithDetails | undefined,
  id: string,
  mode?: RevisionMode,
): RevisionNodeProgressWithDetails {
  const rows = new Map<number, RevisionQuizAttemptResult>();
  for (const row of [...incoming.quiz_results, ...(cached?.quiz_results ?? [])]) {
    if (row.revision_session_id !== id || row.node_id !== incoming.node_id || row.quiz_index >= incoming.quiz_count) continue;
    const existing = rows.get(row.quiz_index);
    if (!existing || isNewerRevisionAttempt(row, existing)) rows.set(row.quiz_index, row);
  }
  const quiz_results = [...rows.values()].sort((a, b) => a.quiz_index - b.quiz_index);
  const status: RevisionNodeStatus = mode === 'quiz_only' && incoming.quiz_count > 0
    ? quiz_results.length < incoming.quiz_count ? 'pending'
      : quiz_results.every((row) => row.is_correct) ? 'quiz_passed' : 'quiz_failed'
    : mode === 'full_review' ? incoming.content_reviewed_at !== null ? 'reviewed' : 'pending' : incoming.status;
  return { ...incoming, quiz_results, status };
}
```

GET calls `mergeRevisionNodeResults(node, cached?.nodes.find((previous) => previous.node_id === node.node_id), revisionId, incoming.mode)`; review success calls `mergeRevisionNodeResults(node, previous, request.revisionId, session.mode)`.

No per-node reads, original mutations or status transitions. If all Task 11 assertions already pass, Step 3 is a no-source-change regression checkpoint. New source guards beyond this snippet need their own failing assertion and stay in owned files.

- [ ] **Step 4 — GREEN.** Repeat Step 2 and the mutation/hook suites; PASS. Check no empty catches/type suppression/default exports were introduced.
- [ ] **Step 5 — Commit.** Stage `RevisionPage.test.tsx` plus only owned source paths actually changed for a reproduced defect. Message: `test(review-parity): cover restoration recovery and route completion races`.

## Task 12: Exit verification and explicit P7 handoff

**Files:** no production changes unless an owned defect has a new failing reproduction. No `state.md`, coverage config, P7 test/artifact edits.

- [ ] **Step 1 — Run all owned test gates.** Working directory `D:/Peter/Personal Stuffs/A2UI/client`:

```powershell
npm run test -- --run src/lib/learningApi.test.ts src/features/learning/useRevisionSession.test.ts src/features/learning/useRevisionMutations.test.tsx src/features/learning/RevisionPage.test.tsx src/features/learning/RevisionSummaryModal.test.tsx src/features/learning/RevisionHistoryList.test.tsx
```

PASS required. Then run `npm run test -- --run` (full client suite), `npm run build`, and `npm run lint` as **separate commands**. Record exit code, file/test totals, warnings and known baseline differences. Existing generated-coverage lint warnings are not new source errors; do not delete user artifacts or suppress diagnostics.

- [ ] **Step 2 — Check boundaries and acceptance map.** Working directory repository root: `git diff --check`; `git status --short`; inspect task commits' explicit path lists. Confirm no original learning cache invalidation, provider headers, unfiltered attempt-history loads, auto-summary effect or completion-to-chat flag. Confirm these concrete assertions exist:

| Criteria | P6 evidence |
| --- | --- |
| A3/A5/A6 | real cards; independent saved indicators; mounted selections; new QueryClient remount; matching revision only |
| A7/A8/A9 | reading only via action; both Practice coverage statuses finished; retry keeps coverage and updates server accuracy/first timestamp |
| A10 | final feedback readable; explicit View Summary; completed re-entry stays unobscured |
| A11/A12/A13/A20 | real controller/panel; repeated prefill without send; heading isolation/explicit target; split/overlay; preserved chat on completion/Escape |
| A14/A19 | quiz/review failure recovery/field rollback; old-route success/failure/summary response isolation; independent quiz pending states |
| A15/A16 | notice codes grouped once; compatible feedback retained; quizless/empty denominators; header/TOC/history/summary copy consistent |
| A17/A18 | transport retains full fixed contract, rejects mismatched identity, sends no keys, original cache unchanged; server no-write and original snapshot evidence remains P2/P3/P7 |

- [ ] **Step 3 — Record non-destructive checkpoint note.** Repository root, outside the index mutex unless staging a fix: get final tested commit hash with `git rev-parse HEAD`; if `git notes show HEAD` succeeds, use `git notes append -m "P6 complete: scoped revision cache, controlled selections, explicit summary and preserved chat; owned tests/build/lint verified. P7 acceptance/coverage/browser evidence pending." HEAD`; otherwise use `git notes add -m` with the same message. Never force-replace a note. No empty documentation commit is required for this verification-only task.

- [ ] **Step 4 — Explicit P7 handoff (required worker report; orchestrator does not read this plan).** Report:
  - Tested commit hashes and exact focused/full tests/build/lint outcomes, including any unrun gate or baseline warning.
  - Query keys `['revision', id]`, `['revision-summary', id]`, `['revisions', originalSessionId]`; GET/summary accept optional `AbortSignal`; writes remain no-key.
  - P4 quiz state is page-owned per node in a route-keyed body; saved feedback comes from GET cache, not extra attempt requests. Mutation variables include request revision/node/index; old results patch only old cache.
  - View Summary is explicit. Server attempt accuracy/null, first completion timestamps, and summary attempt-count fields are preserved; header/TOC mode labels are reading reviewed/Practice finished.
  - Revision-only TOC lives within `RevisionPage.tsx`; `TableOfContentsModal.tsx` is unchanged. Mobile full width is a page-scoped responsive override; P7 must verify **actual computed width at 767px/768px**, bounded right pane/resizing/independent scrolling and scroll restoration, both themes/reduced motion.
  - Real chat controller/panel are wired to explicit topic IDs/headings/prefill; revision never passes completion to the destructive chat hook. P7 must cover real stream retarget/expiry/focus with deterministic transport and browser evidence, not just jsdom structure.
  - P7 may now implement its own cross-layer acceptance/parity/coverage suite; P6 has not changed server contracts or claimed server original-snapshot coverage. Greater-than-80% focused new-unit coverage is P7's config/evidence responsibility; send uncovered producer paths back to their owner, never weaken thresholds.
  - Any producer defect, ownership conflict, missing original content, or unresolved gate is a blocker with reproduction, not permission to edit P4/P5/server/P7 files.

### Exact red/green command index

Each command is used before and after its implementing task from `D:/Peter/Personal Stuffs/A2UI/client`:

| Owned test file | Exact command | Red tasks |
| --- | --- | --- |
| `client/src/lib/learningApi.test.ts` | `npm run test -- --run src/lib/learningApi.test.ts` | 1 (signal forwarding; secret tests are preservation regressions) |
| `client/src/features/learning/useRevisionSession.test.ts` | `npm run test -- --run src/features/learning/useRevisionSession.test.ts` | 1, 5, 9 |
| `client/src/features/learning/useRevisionMutations.test.tsx` | `npm run test -- --run src/features/learning/useRevisionMutations.test.tsx` | 2, 3, 5 |
| `client/src/features/learning/RevisionPage.test.tsx` | `npm run test -- --run src/features/learning/RevisionPage.test.tsx` | 4, 5, 8, 9, 10; 11 integrated regression/defect reproduction |
| `client/src/features/learning/RevisionSummaryModal.test.tsx` | `npm run test -- --run src/features/learning/RevisionSummaryModal.test.tsx` | 6 |
| `client/src/features/learning/RevisionHistoryList.test.tsx` | `npm run test -- --run src/features/learning/RevisionHistoryList.test.tsx` | 7 |

**Task/step count:** 12 tasks, 59 checked steps (Tasks 1–11: five steps each; Task 12: four). Eleven atomic implementation/test commits plus a non-destructive completion note. Do not commit a red state or claim an unrun gate passed.
