# P1 — Shared Revision Contracts and Authoritative Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute only the P1 ownership below; report adapter integration as PENDING.

**Goal:** Define matching revision feedback contracts and a pure, authoritative projection of reading, quiz coverage, accuracy, compatibility notices, and completion timestamps.

**Architecture:** Both repositories will batch-load revision progress, quiz payloads, and append-only attempts and supply normalized values to one pure service. The service filters revision identity, projects latest compatible feedback independently per quiz, and computes mode-specific aggregates without storage, HTTP, or provider operations. Required Pydantic and TypeScript fields stay aligned; P1 makes only the authorized typed fixture/fallback adjustments before handing those files to P6.

**Tech Stack:** Existing Python 3.10+ stdlib dataclasses/typing/unittest, Pydantic v2, TypeScript strict mode, React 19, existing Vite/Vitest tooling. No dependencies or stack changes.

---

## Inputs, scope, and evidence

Read fully before execution: `docs/completed-course-review-parity/goal.md`, `docs/completed-course-review-parity/state.md`, `AGENTS.md`, and `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/TESTING.md`, `docs/CONVENTIONS.md`, `docs/STRUCTURE.md`, `docs/INTEGRATIONS.md`, `docs/CONCERNS.md`. The approved state overrides stale approval text in goal.md. Research/review phases were explicitly skipped: do not create their artifacts or dispatch their agents.

Local patterns inspected: the revision section of `server/schemas/learning.py`; `server/database/repositories/protocols.py`; SQLite and Mongo revision/attempt implementations; `server/schemas/common.py`; `client/src/types/learning.ts`; `client/src/features/learning/RevisionPage.tsx` and its typed test fixtures. Existing schema `model_validator(mode='after')`, required nullable `Field(...)`, enum literals, and stdlib interfaces suffice. Verify any unfamiliar API inline against its official documentation before adding it; do not assume new library behavior.

Planning baseline, repository root, 2026-10-05: `server/.venv/Scripts/python.exe -m unittest server.tests.test_repository_contracts -v` ran 3 tests and failed with two subtest errors because `inspect` is missing. Task 2 adds that import for its own narrow signature assertions and thereby resolves this existing import defect. No application behavior tests/build passes are claimed by this plan.

| File | P1 responsibility |
| --- | --- |
| `server/schemas/learning.py` | Revision models only, including one restored attempt model and its submission subtype |
| `server/database/repositories/protocols.py` | Required typed revision dictionary returns; unchanged facade method names/parameters |
| `server/services/revision_progress.py` | New pure normalization, selection validation, node and revision projection |
| `client/src/types/learning.ts` | Revision/feedback interfaces only |
| `server/tests/test_revision_contracts.py` | New required-field/disclosure/serialized shape tests |
| `server/tests/test_revision_progress.py` | New pure projection tests |
| `server/tests/test_repository_contracts.py` | Narrow signature/required-key assertions and needed imports |
| `client/src/features/learning/RevisionPage.test.tsx` | Required typed fixture fields only |
| `client/src/features/learning/RevisionPage.tsx` | Required typed fallback object only |

Never edit router, adapter, migration, hook, query/cache, component behavior, roadmap/state, or other workflow files. New UI props remain additive in their future owner's work. Source files created during execution must have the mandatory 76-equals Python module header before imports, with FILE/LOCATION/PURPOSE/ROLE IN PROJECT/KEY COMPONENTS and a `main()` test entry point. This Markdown plan has no source-file banner. The source bodies below begin after those execution-time headers.

## Fixed shared decisions

- `RevisionQuizAttemptResult` / TS `RevisionQuizAttemptResult` has required `id`, `revision_session_id`, `node_id`, `quiz_index`, `attempt_number`, `quiz_attempt_count`, `selected_option_ids`, `is_correct`, `score_percent`, `correct_option_ids`, `explanation`, `created_at`; `selected_explanation` is required but nullable. The submission subtype adds required `revision_node_status`. Restored results contain no topic status. Never manufacture IDs or infer an index from visible client state.
- `attempt_number` retains its stored node-wide sequence. `quiz_attempt_count` counts compatible attempts in the specific revision/node/quiz. Latest is the maximum `(attempt_number, id)`; results sort by quiz index. Timestamps do not decide latest feedback.
- Node details require nullable `content_reviewed_at`, integer `quiz_count`, and `quiz_results`. Keep legacy `reviewed_at` for compatibility, but never use it to compute new completion unless the explicit field is absent and legacy Full Review status is exactly `reviewed`.
- Notices are required arrays on session/list entries and summary: code union `legacy_review_inferred`, `legacy_review_required`, `incompatible_attempts`, `completion_recalculated`; nullable `node_id`; nonnegative `attempt_count` (zero except incompatible-attempt notices). P6 chooses wording and displays once per revision page load. These are recomputed metadata, not a new notice persistence table.
- Full Review completes solely from explicit content review. Practice completes coverage after one compatible attempt per available quiz, irrespective of correctness; its completed status is `quiz_passed` only if every latest result is correct, otherwise `quiz_failed`. Quizless Practice nodes stay `pending`, remain navigable, and are excluded from the denominator. An empty denominator has 0% progress, in-progress status, null completion/accuracy.
- Accuracy uses floor integer math `(correct_attempts * 100) // compatible_attempts`, not unique quizzes or topic statuses. Existing summary field names `quizzes_passed/failed/total` remain, with attempt-count semantics. Existing node count names mean participating/completed topics under the selected mode. Comparison with original-only attempts is assembled by adapters later; the pure revision projection has no original-course attempt input.
- Historical attempts keep stored outcome/sequence/IDs. Compatible selections must resolve to the indexed current quiz and agree with stored correctness and 0/100 score; otherwise retain storage records and omit them from feedback, coverage, counts, and accuracy. No remapping display labels or regrading saved attempts. Missing quiz index is accepted only for a single-quiz topic. Mongo arrays, SQLite scalar IDs, and JSON array selections normalize without mutating inputs.
- Timestamp normalization treats legacy naive values as UTC, converts offset-aware values to UTC, and preserves instants. First coverage completion is the latest of the earliest submission timestamps across all participating quizzes, or the latest explicit reading timestamp for Full Review. A valid stored completion timestamp at or after this evidence is preserved on retries. A stored timestamp earlier than completion evidence is disproven and replaced by the evidence time; incomplete projections expose null completion. `completion_reconciled` reports whether persisted metadata differs, allowing P2/P3 to reconcile on a successful write while GET preserves the historical stored value in storage. No clock or provider call occurs in projection.

## Commit discipline for every execution task

Every command below states its working directory. All Python commands run from `D:/Peter/Personal Stuffs/A2UI`; client commands run from `D:/Peter/Personal Stuffs/A2UI/client`. Run git commands from the repository root. Stage only the task's explicitly listed files after inspecting their baseline diffs. Under `Local\A2UI_completed_course_review_parity_git`, inspect foreign staged paths before staging; stop and report if any exist. Hold the mutex only for staging, staged-diff checks, commit; release in `finally`. Use the following exact pattern with each task's literal paths/message (not a wildcard):

```powershell
$commitMutex = [System.Threading.Mutex]::new(
    $false, 'Local\A2UI_completed_course_review_parity_git'
)
$ownsCommitMutex = $false
try {
    try { $ownsCommitMutex = $commitMutex.WaitOne() }
    catch [System.Threading.AbandonedMutexException] {
        $ownsCommitMutex = $true
        git status --short
    }
    $foreignStaged = @(git diff --cached --name-only)
    if ($foreignStaged.Count -gt 0) {
        throw 'Foreign staged changes; stop and coordinate.'
    }
    # Run the task-specific git add and git commit shown below here.
    # Between them run git diff --cached --check and git diff --cached.
    # Stop on any nonzero exit code or unexpected path/hunk.
} finally {
    if ($ownsCommitMutex) { $commitMutex.ReleaseMutex() }
    $commitMutex.Dispose()
}
```

Verify each resulting hash with `git log -1 --stat <actual-hash>` outside the mutex. Do not overwrite existing git notes: after final P1 verification, append a P1 evidence note using `git notes append -m 'P1 verified: shared revision contracts and pure projection; adapters pending P2/P3' <actual-final-code-hash>`. If notes are absent, append creates them. Documentation-only current planner commit is separate from these future implementation commits.

### Task 1: Required, aligned attempt and progress response contracts

**Files:** Modify revision sections only in `server/schemas/learning.py` and `client/src/types/learning.ts`; create `server/tests/test_revision_contracts.py`; modify only the authorized typed fixture and fallback in the two RevisionPage files.

- [ ] **Step 1 — Add exact schema regression tests.** Add the mandatory Python source header, then this body in `server/tests/test_revision_contracts.py`:

```python
from __future__ import annotations

import unittest

from pydantic import ValidationError

from server.schemas.learning import (
    RevisionNodeProgressWithDetails,
    RevisionQuizSubmissionResult,
    RevisionSessionResponse,
)


def attempt_payload() -> dict[str, object]:
    return {
        'id': 'attempt-9', 'revision_session_id': 'revision-1',
        'node_id': 'node-1', 'quiz_index': 1, 'attempt_number': 9,
        'quiz_attempt_count': 2, 'selected_option_ids': ['option-2'],
        'is_correct': False, 'score_percent': 0,
        'correct_option_ids': [], 'explanation': '',
        'selected_explanation': 'Selected option explanation',
        'created_at': '2026-10-05T10:00:00Z',
        'revision_node_status': 'pending',
    }


class RevisionContractTests(unittest.TestCase):
    def test_submission_keeps_required_identity_and_nullable_fields(self) -> None:
        payload = attempt_payload()
        dumped = RevisionQuizSubmissionResult.model_validate(
            payload
        ).model_dump(mode='json')
        self.assertEqual(set(dumped), set(payload))
        self.assertEqual(dumped['node_id'], 'node-1')
        payload['selected_explanation'] = None
        self.assertIsNone(RevisionQuizSubmissionResult.model_validate(
            payload
        ).selected_explanation)
        for field in payload:
            with self.subTest(field=field):
                missing = dict(payload)
                del missing[field]
                with self.assertRaises(ValidationError):
                    RevisionQuizSubmissionResult.model_validate(missing)

    def test_wrong_feedback_cannot_disclose_answers_or_wrong_score(self) -> None:
        for field, value in (
            ('correct_option_ids', ['unselected-correct']),
            ('explanation', 'Hidden answer'), ('score_percent', 100),
            ('quiz_index', -1), ('attempt_number', 0),
            ('quiz_attempt_count', 0), ('selected_option_ids', []),
        ):
            with self.subTest(field=field):
                payload = attempt_payload()
                payload[field] = value
                with self.assertRaises(ValidationError):
                    RevisionQuizSubmissionResult.model_validate(payload)

    def test_restored_shape_matches_submission_without_topic_status(self) -> None:
        payload = attempt_payload()
        del payload['revision_node_status']
        node = RevisionNodeProgressWithDetails.model_validate({
            'id': 'progress-1', 'node_id': 'node-1',
            'node_title': 'Topic', 'sequence_index': 0,
            'status': 'pending', 'reviewed_at': None,
            'content_reviewed_at': None, 'quiz_count': 2,
            'quiz_results': [payload],
        })
        restored = node.model_dump(mode='json')['quiz_results'][0]
        self.assertEqual(set(restored), set(payload))
        self.assertNotIn('revision_node_status', restored)
        for field in ('content_reviewed_at', 'quiz_count', 'quiz_results'):
            data = node.model_dump()
            del data[field]
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    RevisionNodeProgressWithDetails.model_validate(data)

    def test_session_notice_contract_is_required_and_serialized(self) -> None:
        payload = {
            'id': 'revision-1', 'original_session_id': 'original-1',
            'revision_number': 1, 'mode': 'full_review',
            'status': 'in_progress', 'progress_percent': 0,
            'total_quiz_score_percent': None,
            'started_at': '2026-10-05T09:00:00Z', 'completed_at': None,
            'notices': [{
                'code': 'legacy_review_required', 'node_id': 'node-1',
                'attempt_count': 0,
            }],
        }
        dumped = RevisionSessionResponse.model_validate(
            payload
        ).model_dump(mode='json')
        self.assertEqual(dumped['notices'], payload['notices'])
        del payload['notices']
        with self.assertRaises(ValidationError):
            RevisionSessionResponse.model_validate(payload)


def main() -> None:
    unittest.main()


if __name__ == '__main__':
    main()
```

Wrap long test definitions using a parenthesized parameter list to keep each source line within 80 columns.

- [ ] **Step 2 — RED.** Working directory: repository root. Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts -v`. Expect assertion failures for lost required fields, accepted disclosure, and absent node metadata; do not count unrelated import/environment failures as the red result.

- [ ] **Step 3 — Implement the minimal schema definitions.** In the revision section, immediately before `RevisionSessionResponse`, add the two models below. Replace `RevisionQuizSubmissionResult` with the subtype shown, keeping it after the attempt model. Do not change original quiz/learning models.

```python
RevisionNoticeCode = Literal[
    'legacy_review_inferred', 'legacy_review_required',
    'incompatible_attempts', 'completion_recalculated',
]


class RevisionNotice(BaseModel):
    """Compatibility metadata for revision presentation."""

    model_config = ConfigDict(from_attributes=True)

    code: RevisionNoticeCode = Field(..., description='Notice category')
    node_id: Optional[str] = Field(..., description='Affected node or null')
    attempt_count: int = Field(
        ..., ge=0, description='Excluded attempts, zero for other notices'
    )


class RevisionQuizAttemptResult(BaseModel):
    """Shared restored and immediate revision attempt contract."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., min_length=1, description='Saved attempt ID')
    revision_session_id: str = Field(
        ..., min_length=1, description='Owning revision ID'
    )
    node_id: str = Field(..., min_length=1, description='Concept node ID')
    quiz_index: int = Field(..., ge=0, description='Zero-based quiz index')
    attempt_number: int = Field(
        ..., ge=1, description='Stored node-wide attempt sequence'
    )
    quiz_attempt_count: int = Field(
        ..., ge=1, description='Compatible attempts for revision/node/quiz'
    )
    selected_option_ids: List[str] = Field(
        ..., min_length=1, description='Selected stable option IDs'
    )
    is_correct: bool = Field(..., description='Stored exact-match outcome')
    score_percent: Literal[0, 100] = Field(
        ..., description='Zero or 100 according to correctness'
    )
    correct_option_ids: List[str] = Field(
        ..., description='Correct IDs disclosed only after success'
    )
    explanation: str = Field(
        ..., description='Correct explanation on success, empty when wrong'
    )
    selected_explanation: Optional[str] = Field(
        ..., description='Compatibility selected explanation or null'
    )
    created_at: datetime = Field(..., description='Saved attempt timestamp')

    @model_validator(mode='after')
    def validate_disclosure(self) -> 'RevisionQuizAttemptResult':
        """Reject contradictory scores and unsafe wrong-answer feedback."""
        if self.score_percent != (100 if self.is_correct else 0):
            raise ValueError('score_percent contradicts is_correct')
        if not self.is_correct and (
            self.correct_option_ids or self.explanation
        ):
            raise ValueError('wrong answers cannot disclose correct answers')
        if self.is_correct and not self.correct_option_ids:
            raise ValueError('correct answers require correct option IDs')
        if len(set(self.selected_option_ids)) != len(
            self.selected_option_ids
        ):
            raise ValueError('selected option IDs must be unique')
        return self


class RevisionQuizSubmissionResult(RevisionQuizAttemptResult):
    """Immediate result adds the independent mode-aware topic status."""

    revision_node_status: RevisionNodeStatus = Field(
        ..., description='Mode-specific aggregate topic state'
    )
```

Add these exact fields to both `RevisionNodeProgress` and `RevisionNodeProgressWithDetails` (the latter is the GET/mark-review public shape):

```python
    content_reviewed_at: Optional[datetime] = Field(
        ..., description='Explicit reading timestamp, independent of attempts'
    )
    quiz_count: int = Field(..., ge=0, description='Available quiz count')
    quiz_results: List[RevisionQuizAttemptResult] = Field(
        ..., description='Latest compatible attempt per quiz, index ordered'
    )
```

Add `notices` below to `RevisionSessionResponse` and `RevisionSummary`. Constrain their existing progress and nullable score fields with `ge=0, le=100`; preserve other fields/defaults. Preserve the existing summary attempt field names/descriptions. No fallback/default list for new required response fields.

```python
    notices: List[RevisionNotice] = Field(
        ..., description='Recomputed revision compatibility notices'
    )
```

Update only revision interfaces in `client/src/types/learning.ts` with the matching contracts:

```typescript
export type RevisionNoticeCode =
  | 'legacy_review_inferred'
  | 'legacy_review_required'
  | 'incompatible_attempts'
  | 'completion_recalculated';

export interface RevisionNotice {
  code: RevisionNoticeCode;
  node_id: string | null;
  attempt_count: number;
}

export interface RevisionQuizAttemptResult {
  id: string;
  revision_session_id: string;
  node_id: string;
  quiz_index: number;
  attempt_number: number;
  quiz_attempt_count: number;
  selected_option_ids: string[];
  is_correct: boolean;
  score_percent: 0 | 100;
  correct_option_ids: string[];
  explanation: string;
  selected_explanation: string | null;
  created_at: string;
}

export interface RevisionQuizResponse extends RevisionQuizAttemptResult {
  revision_node_status: RevisionNodeStatus;
}
```

Add `notices: RevisionNotice[];` to existing `RevisionSessionResponse` and `RevisionSummary`. Add the following to existing `RevisionNodeProgressWithDetails`:

```typescript
  content_reviewed_at: string | null;
  quiz_count: number;
  quiz_results: RevisionQuizAttemptResult[];
```

`RevisionPage.test.tsx`: add `notices: [],` to `mockRevisionSession`, and `content_reviewed_at: null, quiz_count: 2, quiz_results: [],` to its only node fixture. Do not add page behavior assertions or change component props.

`RevisionPage.tsx`: only annotate the existing fallback variable and add the required fields, removing its existing literal assertion. Replace that declaration with:

```typescript
const currentRevisionProgress: RevisionNodeProgressWithDetails | undefined =
  currentNode
    ? (revisionProgressMap.get(currentNode.id) ?? {
        id: `fallback-${currentNode.id}`,
        node_id: currentNode.id,
        node_title: currentNode.title,
        sequence_index: currentNode.sequence_index,
        status: 'pending',
        reviewed_at: null,
        content_reviewed_at: null,
        quiz_count: currentNode.quiz_set
          ? currentNode.quiz_set.quizzes.length
          : currentNode.quiz ? 1 : 0,
        quiz_results: [],
      })
    : undefined;
```

This UI fallback ID is the pre-existing unsaved progress placeholder, never a fabricated attempt ID. Do not alter result caches, mutation behavior, rendering, or query keys.

- [ ] **Step 4 — GREEN and type compatibility.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts -v` must pass. Client working directory: run `npx tsc -b --pretty false`, `npm run build`, and `npm run test -- --run src/features/learning/RevisionPage.test.tsx`. Preserve/report independent baseline failures; missing required revision fields are P1 failures. If another file needs a typed fixture change, report the ownership conflict rather than weakening interfaces or editing outside scope.

- [ ] **Step 5 — Commit this atomic contract unit under the mutex.** Repository root:

```powershell
git add -- server/schemas/learning.py client/src/types/learning.ts server/tests/test_revision_contracts.py client/src/features/learning/RevisionPage.test.tsx client/src/features/learning/RevisionPage.tsx
git commit -m 'feat(review-parity): define aligned revision attempt contracts'
```

P1 schemas deliberately make the currently incomplete adapters fail their future response validation until P2/P3 implement the contract. Do not call adapter/API parity complete.

### Task 2: Type the repository revision ports without changing runtime interfaces

**Files:** Modify `server/database/repositories/protocols.py` revision contracts only and `server/tests/test_repository_contracts.py` narrow assertions/imports only.

- [ ] **Step 1 — Add exact structural tests.** Add `import inspect` and `from typing import get_type_hints` in stdlib imports of `server/tests/test_repository_contracts.py`. Add this method to `RepositoryContractTests`:

```python
    def test_revision_ports_declare_required_wire_payloads(self) -> None:
        expected = {
            'submit_revision_quiz': {
                'id', 'revision_session_id', 'node_id', 'quiz_index',
                'attempt_number', 'quiz_attempt_count',
                'selected_option_ids', 'is_correct', 'score_percent',
                'correct_option_ids', 'explanation',
                'selected_explanation', 'created_at',
                'revision_node_status',
            },
            'mark_revision_node_reviewed': {
                'id', 'node_id', 'node_title', 'sequence_index', 'status',
                'reviewed_at', 'content_reviewed_at', 'quiz_count',
                'quiz_results',
            },
            'get_revision_summary': {
                'revision_id', 'mode', 'progress_percent',
                'total_quiz_score_percent', 'nodes_reviewed',
                'nodes_total', 'quizzes_passed', 'quizzes_failed',
                'quizzes_total', 'time_spent_seconds', 'comparison',
                'notices',
            },
        }
        for name, keys in expected.items():
            with self.subTest(method=name):
                method = getattr(LearningRepository, name)
                payload_type = get_type_hints(method)['return']
                self.assertEqual(
                    getattr(payload_type, '__required_keys__', frozenset()),
                    keys,
                )
        parameters = inspect.signature(
            LearningRepository.submit_revision_quiz
        ).parameters
        self.assertEqual(parameters['quiz_index'].default, 0)
        self.assertEqual(list(parameters), [
            'self', 'revision_id', 'node_id',
            'selected_option_ids', 'quiz_index',
        ])
```

- [ ] **Step 2 — RED.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_repository_contracts.RepositoryContractTests.test_revision_ports_declare_required_wire_payloads -v`. Must fail because plain `dict` has no required keys, independent of the corrected baseline import.

- [ ] **Step 3 — Add exact TypedDict return shapes.** Add `Literal, TypedDict` to the existing typing import and `RevisionMode, RevisionNodeStatus, RevisionNoticeCode, RevisionSessionStatus` to schema imports in `server/database/repositories/protocols.py`. Place these before `LearningRepository`:

```python
class RevisionNoticePayload(TypedDict):
    code: RevisionNoticeCode
    node_id: Optional[str]
    attempt_count: int


class RevisionAttemptPayload(TypedDict):
    id: str
    revision_session_id: str
    node_id: str
    quiz_index: int
    attempt_number: int
    quiz_attempt_count: int
    selected_option_ids: list[str]
    is_correct: bool
    score_percent: Literal[0, 100]
    correct_option_ids: list[str]
    explanation: str
    selected_explanation: Optional[str]
    created_at: str


class RevisionSubmissionPayload(RevisionAttemptPayload):
    revision_node_status: RevisionNodeStatus


class RevisionNodePayload(TypedDict):
    id: str
    node_id: str
    node_title: str
    sequence_index: int
    status: RevisionNodeStatus
    reviewed_at: Optional[str]
    content_reviewed_at: Optional[str]
    quiz_count: int
    quiz_results: list[RevisionAttemptPayload]


class RevisionSessionPayload(TypedDict):
    id: str
    original_session_id: str
    revision_number: int
    mode: RevisionMode
    status: RevisionSessionStatus
    progress_percent: int
    total_quiz_score_percent: Optional[int]
    started_at: str
    completed_at: Optional[str]
    notices: list[RevisionNoticePayload]


class RevisionWithProgressPayload(RevisionSessionPayload):
    nodes: list[RevisionNodePayload]


class RevisionComparisonPayload(TypedDict):
    original_quiz_score_percent: int
    improvement_percent: int


class RevisionSummaryPayload(TypedDict):
    revision_id: str
    mode: RevisionMode
    progress_percent: int
    total_quiz_score_percent: Optional[int]
    nodes_reviewed: int
    nodes_total: int
    quizzes_passed: int
    quizzes_failed: int
    quizzes_total: int
    time_spent_seconds: Optional[int]
    comparison: Optional[RevisionComparisonPayload]
    notices: list[RevisionNoticePayload]
```

Change only these existing method return annotations, preserving all arguments/body ellipses:

```python
    def create_revision_session(
        self, original_session_id: str, mode: str,
    ) -> RevisionWithProgressPayload: ...

    def get_revisions_for_session(
        self, session_id: str, limit: int = 20, offset: int = 0,
    ) -> tuple[list[RevisionSessionPayload], int]: ...

    def get_revision_session(
        self, revision_id: str,
    ) -> Optional[RevisionWithProgressPayload]: ...

    def mark_revision_node_reviewed(
        self, revision_id: str, node_id: str,
    ) -> RevisionNodePayload: ...

    def submit_revision_quiz(
        self, revision_id: str, node_id: str,
        selected_option_ids: list[str], quiz_index: int = 0,
    ) -> RevisionSubmissionPayload: ...

    def get_revision_summary(
        self, revision_id: str,
    ) -> RevisionSummaryPayload: ...
```

Runtime-checkable structural Protocol tests do not prove adapter wire payloads. Those integrations are PENDING P2/P3. No new public batch query is needed: batching occurs inside each adapter.

- [ ] **Step 4 — GREEN.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_repository_contracts -v` must pass, including the three pre-existing tests. This gate is structural, not SQLite/Mongo behavioral parity.

- [ ] **Step 5 — Commit.** Repository root, under mutex:

```powershell
git add -- server/database/repositories/protocols.py server/tests/test_repository_contracts.py
git commit -m 'refactor(review-parity): type revision repository payloads'
```

### Task 3: Normalize persisted selections/timestamps and validate stable IDs

**Files:** Create `server/services/revision_progress.py` and `server/tests/test_revision_progress.py` (mandatory Python source headers); no adapter changes.

- [ ] **Step 1 — Add these exact tests and deterministic quiz helper.** Body for `server/tests/test_revision_progress.py`:

```python
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from server.schemas.learning import QuizCard
from server.services.revision_progress import (
    evaluate_revision_selection,
    normalize_revision_timestamp,
    normalize_selected_option_ids,
)


def quiz(prefix: str, multiple: bool = False) -> QuizCard:
    return QuizCard.model_validate({
        'question_text': f'Question {prefix}',
        'question_type': (
            'multiple_choice' if multiple else 'single_choice'
        ),
        'options': [
            {
                'option_id': f'{prefix}-{index}',
                'display_label': label, 'text': f'Option {index}',
                'is_correct': index == 0 or (multiple and index == 2),
                'explanation': f'Explanation {prefix}-{index}',
            }
            for index, label in enumerate(('D', 'B', 'A', 'C'))
        ],
    })


class RevisionNormalizationTests(unittest.TestCase):
    def test_legacy_selection_shapes_normalize_without_label_mapping(
        self,
    ) -> None:
        for value, expected in (
            ('q-0', ('q-0',)),
            ('["q-0", "q-2"]', ('q-0', 'q-2')),
            (['q-0', 'q-2'], ('q-0', 'q-2')),
            (None, None), ('[]', None), ('[1]', None),
            (['q-0', 'q-0'], None), ('[broken', None),
        ):
            with self.subTest(value=value):
                self.assertEqual(
                    normalize_selected_option_ids(value), expected
                )
        raw = ['q-0', 'q-2']
        normalize_selected_option_ids(raw)
        self.assertEqual(raw, ['q-0', 'q-2'])

    def test_exact_match_uses_ids_and_validates_selection(self) -> None:
        single = quiz('single')
        multi = quiz('multi', multiple=True)
        self.assertTrue(evaluate_revision_selection(single, ['single-0']))
        self.assertFalse(evaluate_revision_selection(single, ['single-1']))
        self.assertTrue(evaluate_revision_selection(
            multi, ['multi-2', 'multi-0']
        ))
        self.assertFalse(evaluate_revision_selection(multi, ['multi-0']))
        self.assertFalse(evaluate_revision_selection(
            multi, ['multi-0', 'multi-1', 'multi-2']
        ))
        for ids in ([], ['A'], ['single-0', 'single-0'],
                    ['single-0', 'single-1']):
            with self.subTest(ids=ids):
                with self.assertRaises(ValueError):
                    evaluate_revision_selection(single, ids)

    def test_timestamps_reconcile_naive_z_and_offset_instants(self) -> None:
        expected = datetime(2026, 10, 5, 10, tzinfo=timezone.utc)
        for value in (
            '2026-10-05T10:00:00Z', '2026-10-05T15:30:00+05:30',
            datetime(2026, 10, 5, 10), expected,
        ):
            with self.subTest(value=value):
                self.assertEqual(normalize_revision_timestamp(value), expected)
        with self.assertRaises(ValueError):
            normalize_revision_timestamp('bad-date')


def main() -> None:
    unittest.main()


if __name__ == '__main__':
    main()
```

IDs in these fixtures intentionally use stable opaque strings permitted by existing QuizOption schemas; display labels are shuffled.

- [ ] **Step 2 — RED.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_progress.RevisionNormalizationTests -v`. Expect `ModuleNotFoundError` for the new owned service, then failing behavior if an empty service already exists. Verify the failure is for these missing helpers.

- [ ] **Step 3 — Minimal pure normalization implementation.** Add the mandatory header, then this complete body to `server/services/revision_progress.py`:

```python
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional, Sequence, Union

from server.schemas.learning import QuizCard


def normalize_revision_timestamp(
    value: Union[str, datetime],
) -> datetime:
    """Convert a legacy or current timestamp to aware UTC.

    Args:
        value: ISO text or datetime; naive legacy values mean UTC.
    Returns:
        The same instant represented with UTC timezone information.
    Raises:
        ValueError: ISO text cannot be parsed.
    """
    parsed = (
        datetime.fromisoformat(value.replace('Z', '+00:00'))
        if isinstance(value, str) else value
    )
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_selected_option_ids(
    value: object,
) -> Optional[tuple[str, ...]]:
    """Decode saved scalar/array selections without remapping option IDs.

    Args:
        value: SQLite scalar/JSON array or Mongo array field.
    Returns:
        Unique nonempty IDs in stored order, or None for incompatible data.
    """
    decoded = value
    if isinstance(value, str):
        if value.startswith('['):
            try:
                decoded = json.loads(value)
            except json.JSONDecodeError:
                return None
        else:
            decoded = [value]
    if not isinstance(decoded, (list, tuple)) or not decoded:
        return None
    ids: list[str] = []
    for identifier in decoded:
        if not isinstance(identifier, str) or not identifier:
            return None
        ids.append(identifier)
    if len(set(ids)) != len(ids):
        return None
    return tuple(ids)


def evaluate_revision_selection(
    quiz: QuizCard, selected_option_ids: Sequence[str],
) -> bool:
    """Validate stable option identity and evaluate an exact answer set.

    Args:
        quiz: Available quiz with stable option IDs.
        selected_option_ids: Nonempty, duplicate-free selected IDs.
    Returns:
        True only for the exact set of correct options.
    Raises:
        ValueError: Empty, duplicate, foreign, or invalid-cardinality IDs.
    """
    selected = set(selected_option_ids)
    available = {option.option_id for option in quiz.options}
    if not selected or len(selected) != len(selected_option_ids):
        raise ValueError('selection must be nonempty and unique')
    if not selected.issubset(available):
        raise ValueError('selection contains unknown option IDs')
    if quiz.question_type == 'single_choice' and len(selected) != 1:
        raise ValueError('single_choice requires one selected option')
    correct = {
        option.option_id for option in quiz.options if option.is_correct
    }
    return selected == correct
```

Adapters will distinguish malformed persisted rows from malformed new requests: incompatible rows are retained/excluded, while new invalid requests raise before any write. Adapters parse raw identities/numbers and call these normalizers; they must not substitute fabricated values on parse errors.

- [ ] **Step 4 — GREEN.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_progress.RevisionNormalizationTests -v` must pass. No DB/provider mocks are needed because this unit imports neither persistence nor networking.

- [ ] **Step 5 — Commit.** Repository root, under mutex:

```powershell
git add -- server/services/revision_progress.py server/tests/test_revision_progress.py
git commit -m 'feat(review-parity): normalize revision selections and timestamps'
```

### Task 4: Project revision-scoped latest feedback and independent reading

**Files:** Modify `server/services/revision_progress.py` and `server/tests/test_revision_progress.py` only.

- [ ] **Step 1 — Add exact node projection tests.** Add `from dataclasses import replace` and `import copy` to test stdlib imports. Add the following names to its service imports: `RevisionAttemptInput`, `RevisionNodeInput`, `RevisionProjectionInput`, `project_revision_node`. Place helpers and this test class before `main()`:

```python
START = datetime(2026, 10, 5, 9, tzinfo=timezone.utc)
FIRST = datetime(2026, 10, 5, 10, tzinfo=timezone.utc)
SECOND = datetime(2026, 10, 5, 11, tzinfo=timezone.utc)


def revision(mode: RevisionMode = 'quiz_only') -> RevisionProjectionInput:
    return RevisionProjectionInput(
        id='revision-1', mode=mode, started_at=START,
    )


def topic(
    quizzes: Optional[tuple[QuizCard, ...]] = None, *,
    id: str = 'progress-1', revision_session_id: str = 'revision-1',
    node_id: str = 'node-1', sequence_index: int = 0,
    stored_status: RevisionNodeStatus = 'pending',
    reviewed_at: Optional[datetime] = None,
    explicit_review_present: bool = False,
    content_reviewed_at: Optional[datetime] = None,
) -> RevisionNodeInput:
    return RevisionNodeInput(
        id=id, revision_session_id=revision_session_id,
        node_id=node_id, node_title='Topic', sequence_index=sequence_index,
        quizzes=(quiz('q0'), quiz('q1')) if quizzes is None else quizzes,
        stored_status=stored_status, reviewed_at=reviewed_at,
        explicit_review_present=explicit_review_present,
        content_reviewed_at=content_reviewed_at,
    )


def saved(
    identifier: str = 'attempt-a', index: int = 0, number: int = 1,
    correct: bool = True, selected: Optional[tuple[str, ...]] = None,
    created_at: datetime = FIRST,
    revision_id: Optional[str] = 'revision-1',
) -> RevisionAttemptInput:
    return RevisionAttemptInput(
        id=identifier, revision_session_id=revision_id, node_id='node-1',
        attempt_number=number, quiz_index=index,
        selected_option_ids=(
            (f'q{index}-0' if correct else f'q{index}-1',)
            if selected is None else selected
        ),
        is_correct=correct, score_percent=100 if correct else 0,
        created_at=created_at,
    )


class RevisionNodeProjectionTests(unittest.TestCase):
    def test_partial_then_mixed_coverage_is_independent_per_quiz(self):
        first = saved()
        partial = project_revision_node(revision(), topic(), [first])
        self.assertEqual(partial.node.status, 'pending')
        self.assertIsNone(partial.completed_at)
        second = saved('attempt-b', index=1, number=2, correct=False,
                       created_at=SECOND)
        complete = project_revision_node(
            revision(), topic(), [second, first]
        )
        self.assertEqual(complete.node.status, 'quiz_failed')
        self.assertEqual(complete.completed_at, SECOND)
        self.assertEqual(
            [(r.quiz_index, r.is_correct) for r in complete.node.quiz_results],
            [(0, True), (1, False)],
        )
        self.assertIsNone(complete.node.content_reviewed_at)
        wrong = complete.node.quiz_results[1]
        self.assertEqual(wrong.correct_option_ids, [])
        self.assertEqual(wrong.explanation, '')
        self.assertEqual(wrong.selected_explanation, 'Explanation q1-1')
        self.assertEqual(complete.node.quiz_results[0].correct_option_ids,
                         ['q0-0'])

    def test_reading_is_explicit_and_independent_of_quiz_results(self):
        full = revision('full_review')
        attempts = [saved(), saved('wrong', index=1, correct=False)]
        self.assertEqual(project_revision_node(
            full, topic(), attempts
        ).node.status, 'pending')
        reviewed = topic(explicit_review_present=True,
                         content_reviewed_at=FIRST)
        result = project_revision_node(full, reviewed, attempts)
        self.assertEqual(result.node.status, 'reviewed')
        self.assertEqual(result.node.content_reviewed_at, FIRST)
        self.assertEqual(result.completed_at, FIRST)
        self.assertEqual(project_revision_node(
            full, reviewed, []
        ).node.status, 'reviewed')

    def test_legacy_absence_is_distinct_from_intentionally_null(self):
        full = revision('full_review')
        legacy = topic(stored_status='reviewed', reviewed_at=FIRST)
        inferred = project_revision_node(full, legacy, [])
        self.assertEqual(inferred.node.content_reviewed_at, FIRST)
        self.assertEqual(inferred.notices[0].code, 'legacy_review_inferred')
        initialized = replace(
            legacy, explicit_review_present=True,
            content_reviewed_at=inferred.node.content_reviewed_at,
            stored_status='quiz_failed',
        )
        self.assertEqual(project_revision_node(
            full, initialized, []
        ).node.content_reviewed_at, FIRST)
        fallback = project_revision_node(
            full, replace(legacy, reviewed_at=None), []
        )
        self.assertEqual(fallback.node.content_reviewed_at, START)
        explicit_null = replace(legacy, explicit_review_present=True)
        self.assertEqual(project_revision_node(
            full, explicit_null, []
        ).node.status, 'pending')
        for status in ('quiz_passed', 'quiz_failed'):
            result = project_revision_node(
                full, topic(stored_status=status, reviewed_at=FIRST), []
            )
            self.assertIsNone(result.node.content_reviewed_at)
            self.assertEqual(result.notices[0].code, 'legacy_review_required')

    def test_latest_uses_sequence_then_id_and_counts_only_own_attempts(self):
        older = saved('attempt-a', number=9, created_at=SECOND)
        latest = saved('attempt-z', number=9, correct=False, created_at=FIRST)
        original = saved('original', number=500, revision_id=None)
        foreign = saved('foreign', number=501, revision_id='revision-2')
        inputs = [older, latest, original, foreign]
        before = copy.deepcopy(inputs)
        for order in (inputs, list(reversed(inputs))):
            result = project_revision_node(revision(), topic(), order)
            attempt = result.node.quiz_results[0]
            self.assertEqual(attempt.id, 'attempt-z')
            self.assertEqual(attempt.attempt_number, 9)
            self.assertEqual(attempt.quiz_attempt_count, 2)
            self.assertEqual(result.total_attempts, 2)
            self.assertEqual(result.correct_attempts, 1)
        self.assertEqual(inputs, before)
        self.assertEqual(project_revision_node(
            replace(revision(), id='revision-2'),
            topic(revision_session_id='revision-2'), [older, latest],
        ).node.quiz_results, [])

    def test_incompatible_attempts_are_excluded_without_remapping(self):
        attempts = [
            saved('bad-index', index=5),
            saved('old-id', selected=('removed-option',)),
            replace(saved('missing-index'), quiz_index=None),
            replace(saved('bad-score'), score_percent=0),
        ]
        result = project_revision_node(revision(), topic(), attempts)
        self.assertEqual(result.node.quiz_results, [])
        self.assertEqual(result.total_attempts, 0)
        self.assertEqual(result.node.status, 'pending')
        self.assertEqual(result.notices[0].code, 'incompatible_attempts')
        self.assertEqual(result.notices[0].attempt_count, 4)
        legacy_single = project_revision_node(
            revision(), topic(quizzes=(quiz('q0'),)),
            [replace(saved(), quiz_index=None)],
        )
        self.assertEqual(legacy_single.node.quiz_results[0].quiz_index, 0)

    def test_multi_correct_disclosure_preserves_each_option_explanation(self):
        multi = quiz('q0', multiple=True)
        current = topic(quizzes=(multi,))
        wrong = saved('wrong', correct=False, selected=('q0-0',))
        correct = saved('correct', number=2, selected=('q0-2', 'q0-0'))
        wrong_result = project_revision_node(
            revision(), current, [wrong]
        ).node.quiz_results[0]
        self.assertEqual(wrong_result.correct_option_ids, [])
        self.assertEqual(wrong_result.selected_explanation, 'Explanation q0-0')
        result = project_revision_node(
            revision(), current, [wrong, correct]
        ).node.quiz_results[0]
        self.assertEqual(result.correct_option_ids, ['q0-0', 'q0-2'])
        self.assertEqual(result.selected_option_ids, ['q0-2', 'q0-0'])
        self.assertEqual(result.quiz_attempt_count, 2)
        self.assertEqual([o.explanation for o in multi.options if o.is_correct],
                         ['Explanation q0-0', 'Explanation q0-2'])
```

Add `from typing import Optional` to test stdlib imports and `RevisionMode, RevisionNodeStatus` to schema imports for these typed helpers. Annotate all test methods `-> None`. No original-course model/status mutation is part of this unit.

- [ ] **Step 2 — RED.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_progress.RevisionNodeProjectionTests -v`. Expect import failure naming the not-yet-defined input/projector symbols. Once symbols exist, assertions must fail on old sticky correctness/completion/disclosure assumptions until the implementation below is applied.

- [ ] **Step 3 — Add exact pure input/output dataclasses and node implementation.** In `server/services/revision_progress.py`, add `from dataclasses import dataclass`, `Literal` to typing, and the following schema imports: `RevisionMode`, `RevisionNodeProgressWithDetails`, `RevisionNodeStatus`, `RevisionNotice`, `RevisionNoticeCode`, `RevisionQuizAttemptResult`, `RevisionSessionStatus`. Add this code after the helpers:

```python
@dataclass(frozen=True)
class RevisionProjectionInput:
    """Stored revision metadata, without original-course learning state."""

    id: str
    mode: RevisionMode
    started_at: datetime
    stored_status: RevisionSessionStatus = 'in_progress'
    stored_completed_at: Optional[datetime] = None


@dataclass(frozen=True)
class RevisionNodeInput:
    """Batched node/quiz/review values supplied by a repository adapter."""

    id: str
    revision_session_id: str
    node_id: str
    node_title: str
    sequence_index: int
    quizzes: tuple[QuizCard, ...]
    stored_status: RevisionNodeStatus = 'pending'
    reviewed_at: Optional[datetime] = None
    explicit_review_present: bool = False
    content_reviewed_at: Optional[datetime] = None


@dataclass(frozen=True)
class RevisionAttemptInput:
    """A saved attempt; incompatible rows remain in repository storage."""

    id: str
    revision_session_id: Optional[str]
    node_id: str
    attempt_number: int
    quiz_index: Optional[int]
    selected_option_ids: Optional[tuple[str, ...]]
    is_correct: bool
    score_percent: int
    created_at: datetime


@dataclass(frozen=True)
class RevisionNodeProjection:
    """One topic's authoritative details and aggregate evidence."""

    node: RevisionNodeProgressWithDetails
    total_attempts: int
    correct_attempts: int
    completed_at: Optional[datetime]
    notices: tuple[RevisionNotice, ...]


def _notice(
    code: RevisionNoticeCode, node_id: Optional[str], count: int = 0,
) -> RevisionNotice:
    return RevisionNotice(
        code=code, node_id=node_id, attempt_count=count,
    )


def _compatible_quiz_index(
    node: RevisionNodeInput, attempt: RevisionAttemptInput,
) -> Optional[int]:
    index = attempt.quiz_index
    if index is None and len(node.quizzes) == 1:
        index = 0
    if (
        index is None or index < 0 or index >= len(node.quizzes)
        or not attempt.id or attempt.attempt_number < 1
        or attempt.selected_option_ids is None
    ):
        return None
    try:
        correct = evaluate_revision_selection(
            node.quizzes[index], attempt.selected_option_ids,
        )
    except ValueError:
        return None
    if correct != attempt.is_correct:
        return None
    if attempt.score_percent != (100 if attempt.is_correct else 0):
        return None
    return index


def _attempt_result(
    revision_id: str, quiz_index: int, quiz: QuizCard,
    attempt: RevisionAttemptInput, quiz_attempt_count: int,
) -> RevisionQuizAttemptResult:
    selected_ids = list(attempt.selected_option_ids or ())
    selected = [
        option for option in quiz.options
        if option.option_id in selected_ids
    ]
    correct = [option for option in quiz.options if option.is_correct]
    score: Literal[0, 100] = 100 if attempt.is_correct else 0
    return RevisionQuizAttemptResult(
        id=attempt.id, revision_session_id=revision_id,
        node_id=attempt.node_id, quiz_index=quiz_index,
        attempt_number=attempt.attempt_number,
        quiz_attempt_count=quiz_attempt_count,
        selected_option_ids=selected_ids, is_correct=attempt.is_correct,
        score_percent=score,
        correct_option_ids=(
            [option.option_id for option in correct]
            if attempt.is_correct else []
        ),
        explanation=correct[0].explanation if attempt.is_correct else '',
        selected_explanation=(
            selected[0].explanation if not attempt.is_correct else None
        ),
        created_at=normalize_revision_timestamp(attempt.created_at),
    )


def project_revision_node(
    revision: RevisionProjectionInput,
    node: RevisionNodeInput,
    attempts: Sequence[RevisionAttemptInput],
) -> RevisionNodeProjection:
    """Project one topic from explicit reading and its own saved attempts.

    Args:
        revision: Owning revision identity, mode, and metadata.
        node: Batched quiz and explicit-review values for this topic.
        attempts: Batched attempts; foreign revisions/nodes are ignored.
    Returns:
        Independent reading, latest quiz feedback, and completion evidence.
    Raises:
        ValueError: Node does not belong to this revision.
    """
    if node.revision_session_id != revision.id:
        raise ValueError('node belongs to another revision')
    notices: list[RevisionNotice] = []
    content_reviewed_at = node.content_reviewed_at
    if revision.mode == 'full_review':
        if not node.explicit_review_present and node.stored_status == 'reviewed':
            content_reviewed_at = node.reviewed_at or revision.started_at
            notices.append(_notice('legacy_review_inferred', node.node_id))
        elif content_reviewed_at is None and node.stored_status in (
            'quiz_passed', 'quiz_failed',
        ):
            notices.append(_notice('legacy_review_required', node.node_id))
    if content_reviewed_at is not None:
        content_reviewed_at = normalize_revision_timestamp(content_reviewed_at)
    groups: dict[int, list[RevisionAttemptInput]] = {}
    incompatible = 0
    for attempt in attempts:
        if (
            attempt.revision_session_id != revision.id
            or attempt.node_id != node.node_id
        ):
            continue
        index = _compatible_quiz_index(node, attempt)
        if index is None:
            incompatible += 1
            continue
        groups.setdefault(index, []).append(attempt)
    if incompatible:
        notices.append(_notice(
            'incompatible_attempts', node.node_id, incompatible,
        ))
    results: list[RevisionQuizAttemptResult] = []
    for index, group in sorted(groups.items()):
        latest = max(group, key=lambda row: (row.attempt_number, row.id))
        results.append(_attempt_result(
            revision.id, index, node.quizzes[index], latest, len(group),
        ))
    completed_at: Optional[datetime] = None
    status: RevisionNodeStatus = 'pending'
    if revision.mode == 'full_review' and content_reviewed_at is not None:
        status = 'reviewed'
        completed_at = content_reviewed_at
    elif revision.mode == 'quiz_only' and node.quizzes and (
        len(groups) == len(node.quizzes)
    ):
        status = (
            'quiz_passed' if all(result.is_correct for result in results)
            else 'quiz_failed'
        )
        completed_at = max(
            min(normalize_revision_timestamp(row.created_at) for row in group)
            for group in groups.values()
        )
    details = RevisionNodeProgressWithDetails(
        id=node.id, node_id=node.node_id, node_title=node.node_title,
        sequence_index=node.sequence_index, status=status,
        reviewed_at=(normalize_revision_timestamp(node.reviewed_at)
                     if node.reviewed_at is not None else None),
        content_reviewed_at=content_reviewed_at,
        quiz_count=len(node.quizzes), quiz_results=results,
    )
    return RevisionNodeProjection(
        node=details, total_attempts=sum(len(g) for g in groups.values()),
        correct_attempts=sum(
            row.is_correct for group in groups.values() for row in group
        ),
        completed_at=completed_at, notices=tuple(notices),
    )
```

Wrap long `if` and timestamp-comprehension lines to 80 columns when writing. `_attempt_result` uses the first correct explanation only for the legacy aggregate explanation field; all-option rendering must use each `QuizOption.explanation` by stable ID, and must not duplicate this string across correct options. Immediate result assembly in P2/P3 takes the matching projected result (after a saved attempt) plus projected node status; never maintains a separate feedback mapper.

- [ ] **Step 4 — GREEN.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_progress.RevisionNodeProjectionTests server.tests.test_revision_progress.RevisionNormalizationTests -v`. All exact node/normalization assertions must pass, including shuffled multi-select disclosure and unchanged input snapshots.

- [ ] **Step 5 — Commit.** Repository root, under mutex:

```powershell
git add -- server/services/revision_progress.py server/tests/test_revision_progress.py
git commit -m 'feat(review-parity): project independent revision node results'
```

### Task 5: Project consistent revision aggregates and reconcile completion time

**Files:** Modify `server/services/revision_progress.py` and `server/tests/test_revision_progress.py` only.

- [ ] **Step 1 — Add exact aggregate regressions.** Add `project_revision` to the service imports in `server/tests/test_revision_progress.py`. Insert this class before `main()`:

```python
class RevisionAggregateProjectionTests(unittest.TestCase):
    def test_completion_accuracy_and_retry_keep_distinct_meanings(self):
        rows = [saved(), saved('second', index=1, number=2,
                               correct=False, created_at=SECOND)]
        partial = project_revision(
            revision=revision(), nodes=[topic()], attempts=rows[:1],
        )
        self.assertEqual((partial.nodes_completed, partial.nodes_total), (0, 1))
        self.assertEqual(partial.progress_percent, 0)
        self.assertIsNone(partial.completed_at)
        complete = project_revision(
            revision=revision(), nodes=[topic()], attempts=rows,
        )
        self.assertEqual(complete.status, 'completed')
        self.assertEqual(complete.progress_percent, 100)
        self.assertEqual(complete.total_quiz_score_percent, 50)
        self.assertEqual((complete.correct_attempts, complete.incorrect_attempts,
                          complete.total_attempts), (1, 1, 2))
        self.assertEqual(complete.completed_at, SECOND)
        self.assertEqual(complete.time_spent_seconds, 7200)
        persisted = replace(revision(), stored_status='completed',
                            stored_completed_at=SECOND)
        retry = saved('retry', index=1, number=3, correct=True,
                      created_at=datetime(2026, 10, 5, 12,
                                          tzinfo=timezone.utc))
        refreshed = project_revision(
            revision=persisted, nodes=[topic()], attempts=rows + [retry],
        )
        self.assertEqual(refreshed.nodes[0].status, 'quiz_passed')
        self.assertEqual(refreshed.total_quiz_score_percent, 66)
        self.assertEqual(refreshed.total_attempts, 3)
        self.assertEqual(refreshed.completed_at, SECOND)
        self.assertFalse(refreshed.completion_reconciled)

    def test_quizless_and_empty_denominators_do_not_auto_complete(self):
        for nodes in ([], [topic(quizzes=())]):
            with self.subTest(nodes=nodes):
                result = project_revision(
                    revision=revision(), nodes=nodes, attempts=[],
                )
                self.assertEqual(result.status, 'in_progress')
                self.assertEqual(result.nodes_total, 0)
                self.assertEqual(result.progress_percent, 0)
                self.assertIsNone(result.total_quiz_score_percent)
                self.assertIsNone(result.completed_at)
                self.assertIsNone(result.time_spent_seconds)
        quizless = topic(quizzes=(), explicit_review_present=True,
                        content_reviewed_at=FIRST)
        full = project_revision(
            revision=revision('full_review'), nodes=[quizless], attempts=[],
        )
        self.assertEqual(full.status, 'completed')
        self.assertEqual((full.nodes_completed, full.nodes_total), (1, 1))
        self.assertIsNone(full.total_quiz_score_percent)
        self.assertEqual(full.nodes[0].quiz_count, 0)

    def test_participating_counts_and_topic_order_are_deterministic(self):
        skipped = topic(quizzes=(), node_id='no-quiz', id='progress-0',
                        sequence_index=0)
        practicing = topic(sequence_index=1)
        rows = [saved(), saved('second', index=1, correct=False)]
        result = project_revision(
            revision=revision(), nodes=[practicing, skipped], attempts=rows,
        )
        self.assertEqual([node.node_id for node in result.nodes],
                         ['no-quiz', 'node-1'])
        self.assertEqual((result.nodes_completed, result.nodes_total), (1, 1))
        self.assertEqual(result.total_quiz_score_percent, 50)
        incomplete = project_revision(
            revision=revision('full_review'),
            nodes=[replace(practicing, explicit_review_present=True,
                           content_reviewed_at=FIRST), skipped],
            attempts=rows,
        )
        self.assertEqual((incomplete.nodes_completed,
                          incomplete.nodes_total), (1, 2))
        self.assertEqual(incomplete.progress_percent, 50)
        self.assertIsNone(incomplete.completed_at)

    def test_legacy_completion_is_hidden_then_replaced_on_real_coverage(self):
        old = replace(revision(), stored_status='completed',
                      stored_completed_at=FIRST)
        first = saved()
        partial = project_revision(
            revision=old, nodes=[topic(stored_status='quiz_passed')],
            attempts=[first],
        )
        self.assertEqual(partial.status, 'in_progress')
        self.assertIsNone(partial.completed_at)
        self.assertTrue(partial.completion_reconciled)
        self.assertIn('completion_recalculated',
                      [notice.code for notice in partial.notices])
        self.assertEqual(old.stored_completed_at, FIRST)
        later = saved('later', index=1, number=2, correct=False,
                      created_at=SECOND)
        complete = project_revision(
            revision=old, nodes=[topic()], attempts=[first, later],
        )
        self.assertEqual(complete.completed_at, SECOND)
        self.assertTrue(complete.completion_reconciled)
        reconciled = replace(old, stored_completed_at=SECOND)
        restored = project_revision(
            revision=reconciled, nodes=[topic()], attempts=[later, first],
        )
        self.assertEqual(restored.completed_at, SECOND)
        self.assertFalse(restored.completion_reconciled)

    def test_isolation_and_incompatible_data_do_not_enter_accuracy(self):
        attempts = [
            saved(), saved('wrong', correct=False, number=2),
            saved('original', revision_id=None),
            saved('other-revision', revision_id='revision-2'),
            saved('old-options', selected=('missing',)),
        ]
        nodes = [topic()]
        before = copy.deepcopy((nodes, attempts))
        result = project_revision(
            revision=revision(), nodes=nodes, attempts=attempts,
        )
        self.assertEqual(result.total_attempts, 2)
        self.assertEqual(result.total_quiz_score_percent, 50)
        self.assertEqual(result.nodes[0].quiz_results[0].id, 'wrong')
        self.assertEqual(result.notices[0].attempt_count, 1)
        self.assertEqual((nodes, attempts), before)
        all_bad = project_revision(
            revision=revision(), nodes=nodes, attempts=[attempts[-1]],
        )
        self.assertIsNone(all_bad.total_quiz_score_percent)
        self.assertEqual(all_bad.total_attempts, 0)

    def test_invalid_node_ownership_or_duplicate_membership_raises(self):
        for nodes in (
            [topic(revision_session_id='revision-2')],
            [topic(), topic()],
        ):
            with self.subTest(nodes=nodes):
                with self.assertRaises(ValueError):
                    project_revision(
                        revision=revision(), nodes=nodes, attempts=[],
                    )

    def test_own_orphan_attempt_is_not_applied_to_another_topic(self):
        orphan = replace(saved(), node_id='removed-node')
        result = project_revision(
            revision=revision(), nodes=[topic()], attempts=[orphan],
        )
        self.assertEqual(result.total_attempts, 0)
        self.assertEqual(result.nodes[0].quiz_results, [])
        self.assertEqual(result.notices[0].code, 'incompatible_attempts')
        self.assertIsNone(result.notices[0].node_id)
        self.assertEqual(result.notices[0].attempt_count, 1)
```

Annotate test methods `-> None`; all these tests are pure, deterministic, and do not mock the projection.

- [ ] **Step 2 — RED.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_progress.RevisionAggregateProjectionTests -v`. Must fail because `project_revision` is missing, or with concrete aggregate/timestamp assertion failures before implementation.

- [ ] **Step 3 — Implement the aggregate projection.** Append to `server/services/revision_progress.py`:

```python
@dataclass(frozen=True)
class RevisionProjection:
    """Shared metrics for session GET/list, summary, and write reconciliation."""

    nodes: tuple[RevisionNodeProgressWithDetails, ...]
    status: RevisionSessionStatus
    progress_percent: int
    total_quiz_score_percent: Optional[int]
    nodes_completed: int
    nodes_total: int
    correct_attempts: int
    incorrect_attempts: int
    total_attempts: int
    completed_at: Optional[datetime]
    time_spent_seconds: Optional[int]
    notices: tuple[RevisionNotice, ...]
    completion_reconciled: bool


def project_revision(
    *, revision: RevisionProjectionInput,
    nodes: Sequence[RevisionNodeInput],
    attempts: Sequence[RevisionAttemptInput],
) -> RevisionProjection:
    """Derive all revision metrics from batched inputs without I/O.

    Args:
        revision: Stored identity, mode, start, and historical completion.
        nodes: Participating progress rows and their available quiz payloads.
        attempts: Batched saved attempts, including any caller-supplied extras.
    Returns:
        One authoritative view for response and metadata reconciliation.
    Raises:
        ValueError: Node ownership or unique membership is invalid.
    """
    node_ids = {node.node_id for node in nodes}
    if len(node_ids) != len(nodes):
        raise ValueError('duplicate revision node membership')
    if any(node.revision_session_id != revision.id for node in nodes):
        raise ValueError('node belongs to another revision')
    attempts_by_node: dict[str, list[RevisionAttemptInput]] = {}
    orphan_count = 0
    for attempt in attempts:
        if attempt.revision_session_id != revision.id:
            continue
        if attempt.node_id not in node_ids:
            orphan_count += 1
            continue
        attempts_by_node.setdefault(attempt.node_id, []).append(attempt)
    projections = [
        project_revision_node(
            revision, node, attempts_by_node.get(node.node_id, []),
        )
        for node in sorted(nodes, key=lambda row: (row.sequence_index, row.node_id))
    ]
    participating = [
        projection for projection in projections
        if revision.mode == 'full_review' or projection.node.quiz_count > 0
    ]
    completion_times = [
        projection.completed_at for projection in participating
        if projection.completed_at is not None
    ]
    total = len(participating)
    completed = len(completion_times)
    status: RevisionSessionStatus = (
        'completed' if total > 0 and completed == total else 'in_progress'
    )
    started = normalize_revision_timestamp(revision.started_at)
    stored_completed = (
        normalize_revision_timestamp(revision.stored_completed_at)
        if revision.stored_completed_at is not None else None
    )
    completed_at: Optional[datetime] = None
    if status == 'completed':
        evidence_time = max(started, max(completion_times))
        completed_at = (
            stored_completed
            if stored_completed is not None and stored_completed >= evidence_time
            else evidence_time
        )
    total_attempts = sum(p.total_attempts for p in projections)
    correct_attempts = sum(p.correct_attempts for p in projections)
    notices = [notice for p in projections for notice in p.notices]
    if orphan_count:
        notices.append(_notice('incompatible_attempts', None, orphan_count))
    reconciled = (
        status != revision.stored_status or completed_at != stored_completed
    )
    if revision.stored_status == 'completed' and reconciled:
        notices.append(_notice('completion_recalculated', None))
    return RevisionProjection(
        nodes=tuple(p.node for p in projections), status=status,
        progress_percent=(completed * 100) // total if total else 0,
        total_quiz_score_percent=(
            (correct_attempts * 100) // total_attempts
            if total_attempts else None
        ),
        nodes_completed=completed, nodes_total=total,
        correct_attempts=correct_attempts,
        incorrect_attempts=total_attempts - correct_attempts,
        total_attempts=total_attempts, completed_at=completed_at,
        time_spent_seconds=(
            max(0, int((completed_at - started).total_seconds()))
            if completed_at is not None else None
        ),
        notices=tuple(notices), completion_reconciled=reconciled,
    )
```

Wrap long comprehensions/conditionals to 80 columns. The service has O(nodes + attempts + per-topic quiz sorting) in-memory cost with no per-node storage operations. A restored valid completion timestamp is retained; a stale premature timestamp cannot leak into a new completed response. P2/P3 own persisting explicit legacy review inference and successful-write reconciliation. READ responses never write or delete the historical completion value in this pure unit.

- [ ] **Step 4 — GREEN.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_progress -v`. All three classes must pass. Specifically verify 66% after two correct/one wrong attempts, latest-green feedback, and unchanged completion timestamp.

- [ ] **Step 5 — Commit.** Repository root, under mutex:

```powershell
git add -- server/services/revision_progress.py server/tests/test_revision_progress.py
git commit -m 'feat(review-parity): derive authoritative revision aggregates'
```

### Task 6: Close schema validation gates and return the P1 handoff

**Files:** Modify revision-only validators in `server/schemas/learning.py`; extend `server/tests/test_revision_contracts.py` narrowly. Run diagnostics over all owned files; do not implement adapters.

- [ ] **Step 1 — Add exact correct-result and restore-identity tests.** Add `RevisionSummary` to the test module schema imports and these methods to `RevisionContractTests`:

```python
    def test_correct_multi_result_requires_exact_selected_correct_ids(self):
        payload = attempt_payload()
        payload.update({
            'is_correct': True, 'score_percent': 100,
            'selected_option_ids': ['second', 'first'],
            'correct_option_ids': ['first', 'second'],
            'explanation': 'First correct explanation',
            'selected_explanation': None,
        })
        result = RevisionQuizSubmissionResult.model_validate(payload)
        self.assertEqual(result.selected_option_ids, ['second', 'first'])
        payload['correct_option_ids'] = ['first']
        with self.assertRaises(ValidationError):
            RevisionQuizSubmissionResult.model_validate(payload)

    def test_node_restoration_rejects_foreign_duplicate_or_out_of_range_results(self):
        attempt = attempt_payload()
        del attempt['revision_node_status']
        node = {
            'id': 'progress-1', 'node_id': 'node-1', 'node_title': 'Topic',
            'sequence_index': 0, 'status': 'pending', 'reviewed_at': None,
            'content_reviewed_at': None, 'quiz_count': 2,
            'quiz_results': [attempt],
        }
        for results in (
            [dict(attempt, node_id='foreign-node')],
            [attempt, attempt],
            [dict(attempt, quiz_index=2)],
        ):
            with self.subTest(results=results):
                with self.assertRaises(ValidationError):
                    RevisionNodeProgressWithDetails.model_validate(
                        dict(node, quiz_results=results)
                    )

    def test_summary_attempt_counts_serialize_without_zero_accuracy(self):
        payload = {
            'revision_id': 'revision-1', 'mode': 'quiz_only',
            'progress_percent': 0, 'total_quiz_score_percent': None,
            'nodes_reviewed': 0, 'nodes_total': 0,
            'quizzes_passed': 0, 'quizzes_failed': 0, 'quizzes_total': 0,
            'time_spent_seconds': None, 'comparison': None, 'notices': [],
        }
        dumped = RevisionSummary.model_validate(payload).model_dump(mode='json')
        self.assertEqual(dumped, payload)
        del payload['notices']
        with self.assertRaises(ValidationError):
            RevisionSummary.model_validate(payload)
```

Annotate all methods `-> None` and wrap the long test method name/lines with normal Python continuation syntax as needed; method-name definitions can span lines with parentheses.

- [ ] **Step 2 — RED.** Repository root: `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts -v`. The exact-selected-correct-ID and invalid restored-result assertions must fail before the validators below; the summary serialization assertion should already pass.

- [ ] **Step 3 — Add only the failing contract validations.** In `RevisionQuizAttemptResult.validate_disclosure`, immediately before `return self`, add:

```python
        if self.is_correct and set(self.correct_option_ids) != set(
            self.selected_option_ids
        ):
            raise ValueError('correct selection must match correct option IDs')
        if len(set(self.correct_option_ids)) != len(self.correct_option_ids):
            raise ValueError('correct option IDs must be unique')
```

Add this identical validator to `RevisionNodeProgress` and `RevisionNodeProgressWithDetails`; use each enclosing class's name in the return annotation, respectively:

```python
    @model_validator(mode='after')
    def validate_quiz_results(self) -> 'RevisionNodeProgressWithDetails':
        """Require ordered, unique feedback belonging to available quizzes."""
        indices = [result.quiz_index for result in self.quiz_results]
        if indices != sorted(set(indices)):
            raise ValueError('quiz results must be unique and index ordered')
        if any(result.node_id != self.node_id for result in self.quiz_results):
            raise ValueError('quiz result belongs to a different node')
        if any(index >= self.quiz_count for index in indices):
            raise ValueError('quiz result index is outside available quizzes')
        return self
```

For `RevisionNodeProgress` (which has `revision_session_id`), additionally verify each result's revision identity with this check before `return self`:

```python
        if any(
            result.revision_session_id != self.revision_session_id
            for result in self.quiz_results
        ):
            raise ValueError('quiz result belongs to a different revision')
```

For `RevisionSessionWithProgress`, add the following validator to bind restored results to the owning session (node details intentionally omit redundant revision ID):

```python
    @model_validator(mode='after')
    def validate_result_revision(self) -> 'RevisionSessionWithProgress':
        """Reject restored feedback from another revision."""
        if any(
            result.revision_session_id != self.id
            for node in self.nodes for result in node.quiz_results
        ):
            raise ValueError('quiz result belongs to a different revision')
        return self
```

Add `RevisionSessionWithProgress` and `RevisionNodeProgress` to schema test imports and extend the restore test above with these exact assertions, with `node` and `attempt` still in scope:

```python
        with self.assertRaises(ValidationError):
            RevisionNodeProgress.model_validate({
                'id': 'progress-1', 'revision_session_id': 'revision-2',
                'node_id': 'node-1', 'status': 'pending',
                'reviewed_at': None, 'content_reviewed_at': None,
                'quiz_count': 2, 'quiz_results': [attempt],
            })
        session = {
            'id': 'revision-2', 'original_session_id': 'original-1',
            'revision_number': 2, 'mode': 'quiz_only',
            'status': 'in_progress', 'progress_percent': 0,
            'total_quiz_score_percent': None,
            'started_at': '2026-10-05T09:00:00Z', 'completed_at': None,
            'notices': [], 'nodes': [node],
        }
        with self.assertRaises(ValidationError):
            RevisionSessionWithProgress.model_validate(session)
```

Write these last two assertions before their respective validators, rerun the RED command, then implement. They are subcases of the same contract task rather than a post-implementation test addition.

- [ ] **Step 4 — GREEN, full owned verification, and diagnostics.** Repository root:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts -v
server/.venv/Scripts/python.exe -m compileall -q server/schemas/learning.py server/services/revision_progress.py server/database/repositories/protocols.py server/tests/test_revision_contracts.py server/tests/test_revision_progress.py server/tests/test_repository_contracts.py
server/.venv/Scripts/python.exe -m trace --count --missing --summary --coverdir server/.venv/revision-trace --module unittest server.tests.test_revision_contracts server.tests.test_revision_progress
git diff --check
```

All owned assertions and syntax/import diagnostics must pass. stdlib `trace` records statement execution without adding `coverage.py`; its command flags were verified with installed `server/.venv/Scripts/python.exe -m trace --help` during planning. Inspect `server/services/revision_progress.py` summary and `.cover` output for >80% executable-statement coverage; `--missing` marks unexecuted lines. If imported-module counting is unsupported by the installed Python invocation, report that limitation instead of claiming a percentage; the deterministic required behavior assertions and P1 gates must still pass. Generated trace output stays under ignored `.venv`, never staged. No new client runtime unit was introduced by P1, so UI unit coverage is owned by later plans.

Client working directory:

```powershell
npx tsc -b --pretty false
npm run build
npm run test -- --run src/features/learning/RevisionPage.test.tsx
npx eslint src/types/learning.ts src/features/learning/RevisionPage.tsx src/features/learning/RevisionPage.test.tsx
```

Record command, working directory, exit status, test counts, and any baseline-only lint warnings/failures. Do not repair page behavior or other owners' baseline issues. The gate requires passing TypeScript/build and schema/projection tests, not a structural-test inference about repository integration.

- [ ] **Step 5 — Commit validation and send the explicit handoff report.** Repository root, under mutex:

```powershell
git add -- server/schemas/learning.py server/tests/test_revision_contracts.py
git commit -m 'test(review-parity): enforce restored revision result identity'
```

Verify with `git log -1 --stat <actual-hash>`. Add the non-destructive P1 note described above only after actual verification. Report directly to the orchestrator; do not modify its state/verification documents. The report must contain the fields/signatures/rules below so P2/P3/P4/P6 planners can proceed without reading this plan:

1. **Contracts:** `RevisionQuizAttemptResult` shared with immediate `RevisionQuizSubmissionResult`/TS `RevisionQuizResponse`; all attempt identity/selection/count/score/timestamp fields required; `selected_explanation: string | null`; submission-only `revision_node_status`; node-required nullable `content_reviewed_at`, `quiz_count`, ordered `quiz_results`; session/list/summary-required `notices` and their four code values.
2. **Public pure signatures:** `normalize_revision_timestamp(value: Union[str, datetime]) -> datetime`; `normalize_selected_option_ids(value: object) -> Optional[tuple[str, ...]]`; `evaluate_revision_selection(quiz: QuizCard, selected_option_ids: Sequence[str]) -> bool`; `project_revision_node(revision: RevisionProjectionInput, node: RevisionNodeInput, attempts: Sequence[RevisionAttemptInput]) -> RevisionNodeProjection`; `project_revision(*, revision: RevisionProjectionInput, nodes: Sequence[RevisionNodeInput], attempts: Sequence[RevisionAttemptInput]) -> RevisionProjection`. Include dataclass field names/defaults and output aggregate names from Tasks 4/5.
3. **Adapter assembly obligation, PENDING:** batch inputs; preserve absent-vs-null review semantics; persist compatible legacy inference idempotently; retain incompatible attempts; mark-review returns projected node details; immediate result is the matching restored result plus topic status; all GET/list/summary responses use projected aggregates. Map `nodes_completed` to summary `nodes_reviewed`, participating `nodes_total`, and attempt counters to legacy `quizzes_*` field names. Serialize datetime/notice objects through Pydantic `model_dump(mode='json')`; no duplicate hand-written response calculation. Read projection never writes metadata; successful progress writes reconcile status/completion, and Mongo must recover from committed attempt evidence without new transaction requirements.
4. **Ordering/compatibility:** `(attempt_number, id)` latest ordering, index sorted results, compatible per-quiz count, stable exact-match selection, no display-label remapping, missing index only for a single quiz, and incompatible outcomes excluded without regrading/deleting records. Wrong attempts return empty correct IDs/explanation and selected explanation; correct attempts disclose correct IDs and use every option's own explanation in P4.
5. **Completion/accuracy:** explicit-only Full Review; all-submitted Practice coverage; quizless exclusion only in Practice; empty denominator never completes; floor attempt accuracy/null with no compatible attempts; first coverage/reading evidence timestamps and valid stored time preservation; disproven premature completion hidden/replaced; `completion_reconciled` is internal reconciliation metadata, not a persisted new flag or API field.
6. **P1-to-P6 ownership transfer:** name the only fixture/fallback changes and transfer `RevisionPage.tsx`/`RevisionPage.test.tsx` exclusively to P6. No P1 UI behavior, query/cache, router, persistence, or original-mastery implementation changed. P4's result presentation must accept the shared restored attempt shape; component props remain additive until P6 wiring.
7. **Evidence:** hashes of all atomic P1 code commits, actual targeted test/build/diagnostic results, missing-import baseline and its narrow resolution, and any remaining failures. Say verbatim: **Repository-adapter integration is PENDING and owned by P2/P3.**

## Exit assertions and acceptance coverage

| P1 gate / primary criterion | Concrete assertion location |
| --- | --- |
| A1/A2: matching immediate/restored shapes, disclosure | Task 1 required-field and wrong-disclosure tests; Task 4 selected/wrong/correct result assertions; Task 6 correct-selection equality |
| A4: stable shuffled IDs, multiple exact match, individual explanations | Task 3 selection tests and Task 4 multi-correct disclosure test |
| A6: revision isolation and restored latest selection/count | Task 4 revision filtering, reverse-order/tie-ID test; Task 5 snapshot/accuracy isolation; Task 6 session/node revision validation |
| A7: reading independent of attempts/legacy quiz status | Task 4 explicit reading and absence-vs-null tests; Task 5 Full Review denominator test |
| A8: incomplete vs mixed complete Practice coverage | Task 4 partial/mixed node test and Task 5 complete/retry aggregate test |
| A9: retries, attempt counts/accuracy, clock preservation | Task 5 50% -> 66% scenario with latest-green results and retained first completion |
| A15: incompatible legacy attempts, review inference, cached completion | Task 4 incompatible/missing-index and inferred/null review tests; Task 5 disproven completion reconciliation |
| A16: zero denominators/quizless/consistent aggregate meanings | Task 5 empty/quizless/order/count/accuracy tests; Task 6 null summary serialization |
| A17: required validated shapes and pure pre-write selection errors | Tasks 1/2/3/6. Actual serialized HTTP contracts, membership/ownership no-write integration remain P2/P3/P7 |
| Deterministic latest and timestamp reconciliation | Task 4 maximum sequence + ID independent of timestamps; Task 3 offset/naive normalization; Task 5 historical completion tests |
| No database/network/provider operations | Service imports only stdlib + schemas; tests execute real projector without persistence initialization |
| TypeScript and schema diagnostics | Task 1 green and Task 6 complete verification commands |

Six implementation tasks, each with five checkbox steps: **30 planned steps**, six red/green TDD cycles, followed within Task 6's final step by the explicit report. Adapter integration, actual route serialization, storage migrations/recovery, original-course query isolation, UI behavior/cache wiring, and integrated acceptance are deliberately **PENDING their assigned owners**. This plan is ready for the P1 worker only after its own documentation commit is verified.
