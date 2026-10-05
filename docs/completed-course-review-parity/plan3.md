# P3 — Mongo Implementation and Migration Compatibility Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also load `test-driven-development`. This is P3 only; do not dispatch researchers or reviewers.

**Goal:** Make Mongo revision reads, writes, compatibility, and migration restoration satisfy the fixed P1 contract without altering original-course data or requiring multi-document transactions.

**Architecture:** Batch revision progress, concept documents, quiz payloads, and scoped attempts, then adapt them into the existing pure `project_revision` service. Treat attempts and explicit reading timestamps as authoritative; cached revision aggregates are recoverable, not a second source of truth. Keep router/facade/storage selection unchanged, and prove migration retention using temporary SQLite inputs and deterministic Mongo doubles.

**Tech Stack:** Python 3.10+, installed PyMongo 4.16.0, Pydantic v2, stdlib `unittest`/`unittest.mock`/`sqlite3`; existing repository protocol and `server/services/revision_progress.py`.

---

## References, ownership, and fixed decisions

Read `docs/completed-course-review-parity/goal.md` in full, particularly §§7–8, and `docs/completed-course-review-parity/state.md` (P3, acceptance coverage, P1 handoff, commit safety). This plan follows `AGENTS.md` and all seven repository specifications: `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/TESTING.md`, `docs/CONVENTIONS.md`, `docs/STRUCTURE.md`, `docs/INTEGRATIONS.md`, `docs/CONCERNS.md`.

P1 is implemented and fixed. Read these **source files**, not just summaries:

- `server/schemas/learning.py`: `RevisionQuizAttemptResult`, `RevisionQuizSubmissionResult`, `RevisionNodeProgressWithDetails`, session/list/summary models, notices.
- `server/database/repositories/protocols.py`: revision TypedDict payloads and repository methods.
- `server/services/revision_progress.py`: input dataclasses, normalization, selection evaluation, projection.
- `client/src/types/learning.ts`: required fields/nullability (read only).

### File map

| File | Action | Responsibility |
| --- | --- | --- |
| `server/database/repositories/mongo_learning.py` | Modify narrowly | Batched adapters, projected revision reads/writes, original-only attempt scope |
| `server/database/migrate_to_mongo.py` | Normally unchanged | Existing `dict(row)`/`SELECT *` already retain explicit review metadata; change only if retention assertions expose actual loss |
| `server/tests/test_revision_mongo.py` | Create | Stateful deterministic Mongo fixture, behavior/recovery/compatibility tests |
| `server/tests/test_mongo_learning.py` | Modify narrowly | Creation fixture adjustment and original query regressions |
| `server/tests/test_migrate_to_mongo.py` | Modify narrowly | Explicit absent/null/timestamp and attempt retention through real temporary SQL migration and restoration |

Do not modify SQLite persistence, routers, shared P1 files, storage selection, client code, or any other workflow artifact. In particular, `server/database/learning_persistence.py` and `server/routers/learning.py` belong to P2. No new dependencies or production helper files. Existing cascade-delete transactions are unrelated; leave them unchanged. New revision actions must not call `start_session`/`start_transaction`.

### Contract details not to reinterpret

- `attempt_number` remains historical **node-wide** numbering across original/revision attempts. `quiz_attempt_count` counts **compatible** attempts for one revision/node/quiz.
- Latest result uses `(attempt_number, id)`, not timestamp. Restoration is revision-scoped; original node attempt history is never its input.
- Wrong result: `correct_option_ids=[]`, `explanation=''`, nullable `selected_explanation`. Correct result preserves stable IDs and option-specific explanations in the original quiz payload.
- Immediate result adds `revision_node_status`; restored results do not. Node details do not include a redundant `revision_session_id`.
- Summary retains P1 names `quizzes_passed`, `quizzes_failed`, `quizzes_total`: these are **attempt** counts, not unique quiz counts. `nodes_reviewed` means mode-aware completed nodes.
- Read responses include required `notices`; propagate P1 codes unchanged. Notice presentation/once-per-load belongs to P6.
- Missing explicit review field is different from intentionally present `None`. Infer only missing legacy Full Review `status='reviewed'`; never infer from quiz statuses.
- GET/list/summary do not reconcile persisted historical completion metadata. A validated progress write reconciles it. Clear disproven historical completion **before** adding new completion evidence, so a newer historical timestamp cannot be reused incorrectly.
- Do not persist per-quiz flags. Node legacy status may remain stale: every public response projects it. Keeping quiz-derived legacy status preserves P1's `legacy_review_required` notice until explicit review.

### Inline official-document verification (research phase remains skipped)

Installed dependency check performed with `server/.venv/Scripts/python.exe -c "import pymongo; print(pymongo.version)"`: **4.16.0**.

Verified synchronous update/filter semantics against official PyMongo docs via Context7 `/mongodb/docs-pymongo` and Mongo's [null/missing query documentation](https://www.mongodb.com/docs/manual/tutorial/query-for-null-fields/): equality to `None` matches absent **or** null, whereas `$exists: False` matches absent only. Use the latter for compatibility initialization and conditional null update for the explicit user review action. Do not copy the FastAPI example's omission of null fields: intentional null is meaningful here. Existing source already uses `ReturnDocument.AFTER`; no unfamiliar new driver APIs are needed.

## Working directory, baseline, and git safety

**Every command and step below runs from `D:/Peter/Personal Stuffs/A2UI`.** All written paths use forward slashes. Do not use production DB paths, Atlas, credentials, real user collections, `server.main` lifespan, or environment secret values.

Planner measured baseline on 2026-10-05:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_mongo_learning server.tests.test_migrate_to_mongo
```

Result: **24 tests; FAILED with 7 subtest errors**. All errors are existing `KeyError: 'custom_topic_count'` in `test_custom_session_count_round_trips_independently` (four counts) and `test_existing_modes_create_null_count_documents` (three modes); `create_learning_session` does not store this unrelated field. **Do not fix it, remove its assertions, or call the regression gate passed.** Report to the orchestrator: full P3 exit is blocked until its owner resolves the baseline or explicitly records a waiver. New P3 tests must pass independently. Independently reran `server/.venv/Scripts/python.exe -m unittest server.tests.test_migrate_to_mongo -v`: **8 tests, PASS** (0.080s). These are baseline commands only; no planned feature tests have been implemented or run by the planner.

- [ ] Before edits, run `git status --short` and `git diff --` with the five owned paths; preserve foreign work.
- [ ] For each commit, use this PowerShell template, substituting exactly the task's listed paths/message. Only hold the mutex for index inspection/staging/commit; release in `finally`. Never stage the plan during worker commits.

```powershell
$mutex = [System.Threading.Mutex]::new($false, 'Local\A2UI_completed_course_review_parity_git')
$held = $false
try {
    try { $held = $mutex.WaitOne() }
    catch [System.Threading.AbandonedMutexException] { $held = $true }
    if (-not $held) { throw 'Git mutex unavailable' }
    $staged = @(git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect index' }
    if ($staged.Count -gt 0) { throw 'Foreign staged changes: stop and report' }
    git add -- server/database/repositories/mongo_learning.py server/tests/test_revision_mongo.py server/tests/test_migrate_to_mongo.py
    if ($LASTEXITCODE -ne 0) { throw 'Stage failed' }
    git diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace failure' }
    git diff --cached --stat
    git diff --cached --name-only
    git diff --cached
    git commit -m 'feat(review-parity): project batched Mongo revision restoration'
    if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
```

Task 1 uses exactly that path list/message. Later task commit steps specify substitutions. Inspect staged names/content before commit; stop on foreign changes. Record commit hashes and append non-destructive git notes only to your own worker commit after verification (`git notes append`, never overwrite existing notes). Orchestrator owns `state.md` updates.

## Task 1: Batched restoration and migration-retention proof

**Files:** Create `server/tests/test_revision_mongo.py`; modify `server/database/repositories/mongo_learning.py:get_revision_session` and private revision adapter helpers; modify `server/tests/test_migrate_to_mongo.py` imports and add `MigrationRevisionRetentionTests`. Do not change migration production code: it already copies these fields.

### Step 1 — Write the deterministic fixture and failing restoration test

- [ ] Create `server/tests/test_revision_mongo.py` with this exact initial content. This is a **source** header inside a snippet, not a banner on the plan document. The fixture interprets only the used subset of Mongo operations; unsupported operators fail loudly. It deep-copies inputs/outputs so preservation assertions are genuine.

```python
"""
============================================================================
FILE: test_revision_mongo.py
LOCATION: server/tests/test_revision_mongo.py
============================================================================
PURPOSE:
    Deterministic Mongo revision persistence and recovery tests.
ROLE IN PROJECT:
    Exercise the real repository and P1 projection without network access.
    Supply reusable in-memory collections for storage parity acceptance.
KEY COMPONENTS:
    - MemoryMongo: Query-aware, stateful, inspectable collection doubles
    - RevisionMongoTests: Revision contracts and preservation assertions
============================================================================
"""
from __future__ import annotations

import copy
import unittest
from collections import defaultdict
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pymongo.errors import AutoReconnect

from server.database.repositories.mongo_learning import (
    MongoLearningRepository,
)
from server.schemas.learning import (
    QuizCard,
    QuizSet,
    RevisionNodeProgressWithDetails,
    RevisionQuizSubmissionResult,
    RevisionSessionResponse,
    RevisionSessionWithProgress,
    RevisionSummary,
)

START = '2026-10-05T09:00:00+00:00'
FIRST = '2026-10-05T10:00:00+00:00'
SECOND = '2026-10-05T11:00:00+00:00'
THIRD = '2026-10-05T12:00:00+00:00'


def make_quiz(prefix: str, multiple: bool = False) -> QuizCard:
    return QuizCard.model_validate({
        'question_text': prefix,
        'question_type': (
            'multiple_choice' if multiple else 'single_choice'
        ),
        'options': [
            {
                'option_id': f'{prefix}-{index}',
                'display_label': label,
                'text': f'Option {index}',
                'is_correct': index == 0 or (multiple and index == 2),
                'explanation': f'Explanation {prefix}-{index}',
            }
            for index, label in enumerate(('D', 'B', 'A', 'C'))
        ],
    })


def matches(document: dict, query: dict) -> bool:
    for key, expected in query.items():
        actual = document.get(key)
        if isinstance(expected, dict):
            for operator, value in expected.items():
                if operator == '$in':
                    if actual not in value:
                        return False
                elif operator == '$exists':
                    if (key in document) != value:
                        return False
                else:
                    raise AssertionError(f'Unsupported operator {operator}')
        elif actual != expected:
            return False
    return True


class MemoryCursor(list):
    def sort(self, key, direction=1):
        pairs = key if isinstance(key, list) else [(key, direction)]
        for field, order in reversed(pairs):
            super().sort(
                key=lambda row: (row.get(field) is None, row.get(field)),
                reverse=order < 0,
            )
        return self

    def skip(self, count):
        return MemoryCursor(self[count:])

    def limit(self, count):
        return MemoryCursor(self[:count] if count else self)


class MemoryMongo:
    def __init__(self) -> None:
        self.rows = defaultdict(list)
        self.collections = {}
        self.client = MagicMock()
        self.client.start_session.side_effect = AssertionError(
            'Revision operations must not require transactions'
        )

    def find(self, name, query):
        return MemoryCursor(copy.deepcopy([
            row for row in self.rows[name] if matches(row, query)
        ]))

    def insert(self, name, document):
        if any(row['_id'] == document['_id'] for row in self.rows[name]):
            raise AssertionError('Duplicate fixture ID')
        self.rows[name].append(copy.deepcopy(document))
        return SimpleNamespace(inserted_id=document['_id'])

    def update(self, name, query, update):
        if set(update) != {'$set'}:
            raise AssertionError('Fixture supports $set updates only')
        for row in self.rows[name]:
            if matches(row, query):
                before = copy.deepcopy(row)
                row.update(copy.deepcopy(update['$set']))
                return SimpleNamespace(
                    matched_count=1, modified_count=int(before != row),
                )
        return SimpleNamespace(matched_count=0, modified_count=0)

    def __getitem__(self, name):
        if name not in self.collections:
            self.rows[name]  # Initialize empty collections before snapshots.
            collection = MagicMock(name=name)
            collection.find.side_effect = (
                lambda query, projection=None: self.find(name, query)
            )
            collection.find_one.side_effect = (
                lambda query, projection=None: next(
                    iter(self.find(name, query)), None,
                )
            )
            collection.count_documents.side_effect = (
                lambda query: len(self.find(name, query))
            )
            collection.insert_one.side_effect = (
                lambda document: self.insert(name, document)
            )
            collection.insert_many.side_effect = (
                lambda documents: [self.insert(name, d) for d in documents]
            )
            collection.update_one.side_effect = (
                lambda query, update: self.update(name, query, update)
            )
            self.collections[name] = collection
        return self.collections[name]


def make_store(mode: str = 'quiz_only'):
    db = MemoryMongo()
    db.rows['learning_sessions'] = [{
        '_id': 's1', 'status': 'completed', 'progress_percent': 100,
        'last_active_node_id': 'n1', 'created_at': START,
        'updated_at': FIRST, 'completed_at': FIRST,
    }]
    db.rows['concept_nodes'] = [{
        '_id': 'n1', 'learning_session_id': 's1', 'title': 'Topic',
        'sequence_index': 0, 'status': 'COMPLETED',
        'content_markdown': '# Topic', 'created_at': START,
        'updated_at': FIRST, 'completed_at': FIRST,
    }]
    db.rows['quiz_data'] = [{
        '_id': 'quiz-1', 'node_id': 'n1', 'format_version': 1,
        'payload': QuizSet(
            quizzes=[make_quiz('q0'), make_quiz('q1')],
        ).model_dump(mode='json'),
        'current_index': 1, 'shuffle_seed': 'original-seed',
    }]
    db.rows['revision_sessions'] = [{
        '_id': 'r1', 'original_session_id': 's1', 'revision_number': 1,
        'mode': mode, 'status': 'in_progress', 'progress_percent': 0,
        'total_quiz_score_percent': None, 'started_at': START,
        'completed_at': None,
    }]
    db.rows['revision_node_progress'] = [{
        '_id': 'p1', 'revision_session_id': 'r1', 'node_id': 'n1',
        'status': 'pending', 'reviewed_at': None,
        'content_reviewed_at': None,
    }]
    return db, MongoLearningRepository(db)


def attempt(identifier, index=0, number=1, correct=True,
            revision='r1', time=FIRST):
    return {
        '_id': identifier, 'revision_session_id': revision, 'node_id': 'n1',
        'quiz_index': index, 'attempt_number': number,
        'selected_option_id': [f'q{index}-{0 if correct else 1}'],
        'is_correct': correct, 'score_percent': 100 if correct else 0,
        'created_at': time,
    }


class RevisionMongoTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db, self.repo = make_store()

    def test_restore_is_scoped_ordered_disclosed_and_batched(self) -> None:
        self.db.rows['quiz_attempts'] = [
            attempt('a', number=7, time=THIRD),
            attempt('z', number=7, correct=False),
            attempt('b', index=1, number=8, time=SECOND),
            attempt('original', number=99, revision=None),
            attempt('foreign', number=100, revision='r2'),
        ]
        before = copy.deepcopy(self.db.rows)
        restored = self.repo.get_revision_session('r1')
        self.assertIsNotNone(restored)
        validated = RevisionSessionWithProgress.model_validate(restored)
        node = restored['nodes'][0]
        self.assertEqual(node['quiz_count'], 2)
        self.assertEqual(node['status'], 'quiz_failed')
        self.assertIsNone(node['content_reviewed_at'])
        self.assertNotIn('revision_session_id', node)
        wrong, correct = node['quiz_results']
        self.assertEqual([wrong['id'], correct['id']], ['z', 'b'])
        self.assertEqual(wrong['quiz_attempt_count'], 2)
        self.assertEqual(wrong['selected_option_ids'], ['q0-1'])
        self.assertEqual(wrong['correct_option_ids'], [])
        self.assertEqual(wrong['explanation'], '')
        self.assertEqual(wrong['selected_explanation'], 'Explanation q0-1')
        self.assertEqual(correct['correct_option_ids'], ['q1-0'])
        self.assertNotIn('revision_node_status', wrong)
        self.assertEqual(validated.total_quiz_score_percent, 66)
        for name in ('revision_node_progress', 'concept_nodes',
                     'quiz_data', 'quiz_attempts'):
            self.db[name].find.assert_called_once()
            self.db[name].find_one.assert_not_called()
        self.db['quiz_attempts'].find.assert_called_once_with({
            'revision_session_id': {'$in': ['r1']},
        })
        self.assertEqual(self.db.rows, before)


def main() -> None:
    unittest.main()


if __name__ == '__main__':
    main()
```

### Step 2 — Add actual migration-retention assertions and failing round-trip

- [ ] In `server/tests/test_migrate_to_mongo.py`, add `copy` and `json` stdlib imports, import `migrate_table` alongside existing migration functions, and import `FIRST`, `START`, `attempt`, `make_store` from `server.tests.test_revision_mongo`. Add this class before the existing main guard. `FakeCollection` is the existing migration double, not a network collection. Mapping assertions are expected to pass already; **the repository restoration after migration is the red assertion**.

```python
class MigrationRevisionRetentionTests(unittest.TestCase):
    def test_review_and_attempt_fields_survive_migration_and_restore(
        self,
    ) -> None:
        db, repository = make_store('full_review')
        base = {
            'id': 'p1', 'revision_session_id': 'r1', 'node_id': 'n1',
            'status': 'reviewed', 'reviewed_at': FIRST,
        }
        absent = row_to_document('revision_node_progress', base)
        self.assertNotIn('content_reviewed_at', absent)
        connection = sqlite3.connect(':memory:')
        connection.row_factory = sqlite3.Row
        self.addCleanup(connection.close)
        connection.execute(
            'CREATE TABLE revision_node_progress ('
            'id TEXT PRIMARY KEY, revision_session_id TEXT, node_id TEXT, '
            'status TEXT, reviewed_at TEXT, content_reviewed_at TEXT)'
        )
        connection.execute(
            'CREATE TABLE quiz_attempts ('
            'id TEXT PRIMARY KEY, revision_session_id TEXT, node_id TEXT, '
            'attempt_number INTEGER, quiz_index INTEGER, '
            'selected_option_id TEXT, is_correct INTEGER, '
            'score_percent INTEGER, created_at TEXT)'
        )
        saved = attempt('saved', number=8)
        original = attempt('original', number=7, revision=None)
        incompatible = attempt('incompatible', index=20, number=9)
        for row in (saved, original, incompatible):
            connection.execute(
                'INSERT INTO quiz_attempts VALUES (?, ?, ?, ?, ?, ?, '
                '?, ?, ?)',
                (row['_id'], row['revision_session_id'], row['node_id'],
                 row['attempt_number'], row['quiz_index'],
                 json.dumps(row['selected_option_id']),
                 int(row['is_correct']), row['score_percent'],
                 row['created_at']),
            )
        source_attempts = [dict(row) for row in connection.execute(
            'SELECT * FROM quiz_attempts ORDER BY id'
        )]
        attempts_target = FakeCollection()
        migrate_table(connection, attempts_target, 'quiz_attempts', [])
        db.rows['quiz_attempts'] = list(attempts_target.documents.values())
        self.assertEqual(attempts_target.documents, {
            row['id']: row_to_document('quiz_attempts', row)
            for row in source_attempts
        })
        for explicit in (None, FIRST):
            with self.subTest(explicit=explicit):
                connection.execute('DELETE FROM revision_node_progress')
                connection.execute(
                    'INSERT INTO revision_node_progress VALUES '
                    '(?, ?, ?, ?, ?, ?)',
                    ('p1', 'r1', 'n1', 'reviewed', FIRST, explicit),
                )
                target = FakeCollection()
                migrate_table(
                    connection, target, 'revision_node_progress', [],
                )
                first_documents = copy.deepcopy(target.documents)
                migrate_table(
                    connection, target, 'revision_node_progress', [],
                )
                self.assertEqual(target.documents, first_documents)
                self.assertEqual(
                    target.documents['p1']['content_reviewed_at'], explicit,
                )
                db.rows['revision_node_progress'] = list(
                    target.documents.values()
                )
                restored = repository.get_revision_session('r1')
                node = restored['nodes'][0]
                self.assertEqual(
                    node['content_reviewed_at'],
                    explicit.replace('+00:00', 'Z')
                    if explicit is not None else None,
                )
                self.assertEqual(
                    node['status'], 'pending' if explicit is None
                    else 'reviewed',
                )
                self.assertEqual(node['quiz_results'][0]['id'], 'saved')
                self.assertEqual(node['quiz_results'][0]['attempt_number'], 8)
                self.assertEqual(node['quiz_results'][0]['quiz_attempt_count'], 1)
                self.assertEqual(len(db.rows['quiz_attempts']), 3)
                self.assertEqual(restored['total_quiz_score_percent'], 100)
                self.assertEqual(restored['notices'][0]['code'],
                                 'incompatible_attempts')
        self.assertEqual([dict(row) for row in connection.execute(
            'SELECT * FROM quiz_attempts ORDER BY id'
        )], source_attempts)
        self.assertEqual(db.rows['revision_sessions'][0]['started_at'], START)
```

### Step 3 — Record red, before any production edits

- [ ] Run both commands; both must fail on missing required revision fields/results, not import/fixture errors:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo.RevisionMongoTests.test_restore_is_scoped_ordered_disclosed_and_batched -v
server/.venv/Scripts/python.exe -m unittest server.tests.test_migrate_to_mongo.MigrationRevisionRetentionTests -v
```

The migration mapper is not broken: do not manufacture a failing mapper assertion to justify unnecessary changes.

### Step 4 — Add minimal batched P1 input adapters

- [ ] Add these imports in `server/database/repositories/mongo_learning.py` (merge into existing schema imports): `RevisionSessionWithProgress`; import the P1 helpers below. Add module helpers `_revision_quizzes`, `_revision_attempt` and class helper `_load_revision_batch`. Task 6 extends codecs for legacy/malformed data; initially native shapes only.

```python
from server.services.revision_progress import (
    RevisionAttemptInput,
    RevisionNodeInput,
    RevisionProjection,
    RevisionProjectionInput,
    evaluate_revision_selection,
    normalize_revision_timestamp,
    normalize_selected_option_ids,
    project_revision,
)


RevisionBatch = tuple[
    RevisionProjectionInput,
    list[RevisionNodeInput],
    list[RevisionAttemptInput],
    RevisionProjection,
]


def _revision_quizzes(
    document: Optional[dict[str, Any]],
) -> tuple[QuizCard, ...]:
    if document is None:
        return ()
    return tuple(QuizSet.model_validate(document['payload']).quizzes)


def _revision_attempt(
    document: dict[str, Any], started_at: datetime,
) -> RevisionAttemptInput:
    return RevisionAttemptInput(
        id=document['_id'],
        revision_session_id=document.get('revision_session_id'),
        node_id=document['node_id'],
        attempt_number=document['attempt_number'],
        quiz_index=document.get('quiz_index'),
        selected_option_ids=normalize_selected_option_ids(
            document.get('selected_option_id')
        ),
        is_correct=bool(document.get('is_correct')),
        score_percent=int(document.get('score_percent') or 0),
        created_at=normalize_revision_timestamp(document['created_at']),
    )
```

Add this method to `MongoLearningRepository`. It performs at most four collection reads for **the whole input batch**, not one query per node/quiz/revision. Use existing style and add public annotations when replacing public methods. Input dictionary checks in Task 6 make the codecs defensive without changing P1.

Add `from datetime import datetime` to the module's stdlib imports for the adapter signatures.

```python
    def _load_revision_batch(
        self, revisions: list[dict[str, Any]],
    ) -> dict[str, RevisionBatch]:
        if not revisions:
            return {}
        ids = [row['_id'] for row in revisions]
        progress = list(self._revision_nodes.find({
            'revision_session_id': {'$in': ids},
        }))
        node_ids = sorted({row['node_id'] for row in progress})
        concepts = {
            row['_id']: row for row in self._nodes.find({
                '_id': {'$in': node_ids},
            })
        }
        quizzes = {
            row['node_id']: row for row in self._quizzes.find({
                'node_id': {'$in': node_ids},
            })
        }
        saved = list(self._attempts.find({
            'revision_session_id': {'$in': ids},
        }))
        batches = {}
        for document in revisions:
            revision = RevisionProjectionInput(
                id=document['_id'], mode=document['mode'],
                started_at=normalize_revision_timestamp(
                    document['started_at']
                ),
                stored_status=document.get('status', 'in_progress'),
                stored_completed_at=(
                    normalize_revision_timestamp(document['completed_at'])
                    if document.get('completed_at') is not None else None
                ),
            )
            inputs = []
            for row in progress:
                if row['revision_session_id'] != revision.id:
                    continue
                concept = concepts.get(row['node_id'])
                if concept is None:
                    continue
                if (concept['learning_session_id']
                        != document['original_session_id']):
                    raise ValueError('revision node belongs to another course')
                inputs.append(RevisionNodeInput(
                    id=row['_id'], revision_session_id=revision.id,
                    node_id=row['node_id'], node_title=concept['title'],
                    sequence_index=concept['sequence_index'],
                    quizzes=_revision_quizzes(quizzes.get(row['node_id'])),
                    stored_status=row.get('status', 'pending'),
                    reviewed_at=(
                        normalize_revision_timestamp(row['reviewed_at'])
                        if row.get('reviewed_at') is not None else None
                    ),
                    explicit_review_present='content_reviewed_at' in row,
                    content_reviewed_at=(
                        normalize_revision_timestamp(
                            row['content_reviewed_at']
                        ) if row.get('content_reviewed_at') is not None
                        else None
                    ),
                ))
            attempts = [
                _revision_attempt(row, revision.started_at)
                for row in saved
                if row.get('revision_session_id') == revision.id
            ]
            projection = project_revision(
                revision=revision, nodes=inputs, attempts=attempts,
            )
            batches[revision.id] = (revision, inputs, attempts, projection)
        return batches
```

### Step 5 — Replace revision GET with exactly projected response fields

- [ ] Add `_revision_response`, replace the complete old `get_revision_session` body with the following. Nulls must remain present (`exclude_none` must not be used). Repository timestamps are ISO strings; model JSON dumping normalizes to UTC. Avoid returning arbitrary persisted keys or Mongo `_id`.

```python
    def _revision_response(
        self, document: dict[str, Any], projection: RevisionProjection,
    ) -> dict[str, Any]:
        return RevisionSessionWithProgress.model_validate({
            'id': document['_id'],
            'original_session_id': document['original_session_id'],
            'revision_number': document['revision_number'],
            'mode': document['mode'],
            'status': projection.status,
            'progress_percent': projection.progress_percent,
            'total_quiz_score_percent': projection.total_quiz_score_percent,
            'started_at': document['started_at'],
            'completed_at': projection.completed_at,
            'nodes': list(projection.nodes),
            'notices': list(projection.notices),
        }).model_dump(mode='json')

    def get_revision_session(
        self, revision_id: str,
    ) -> Optional[dict[str, Any]]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            return None
        batch = self._load_revision_batch([document])[revision_id]
        return self._revision_response(document, batch[3])
```

### Step 6 — Green

- [ ] Re-run the two exact red commands from Step 3; expect PASS. Then:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo server.tests.test_migrate_to_mongo -v
```

Expected: PASS for new restoration and all migration regressions. Do not run source tests against live databases.

### Step 7 — Atomic commit

- [ ] Use the mutex template above with its exact three paths. Message: **`feat(review-parity): project batched Mongo revision restoration`**. Report hash and red/green evidence. Migration production file stays unchanged unless a genuine preservation failure is discovered and reported.

## Task 2: Project history/summary, comparison, and zero denominators

**Files:** `server/database/repositories/mongo_learning.py:get_revisions_for_session,get_revision_summary`; `server/tests/test_revision_mongo.py:RevisionMongoTests`.

### Step 1 — Add failing consistency tests

- [ ] Add these methods to `RevisionMongoTests`:

```python
    def test_history_summary_share_projection_and_original_comparison(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0].update({
            'status': 'completed', 'progress_percent': 100,
            'completed_at': FIRST, 'total_quiz_score_percent': 100,
        })
        self.db.rows['revision_node_progress'][0]['status'] = 'quiz_passed'
        self.db.rows['quiz_attempts'] = [
            attempt('one'),
            attempt('old', correct=False, revision=None),
            attempt('other', revision='r2'),
        ]
        before = copy.deepcopy(self.db.rows)
        restored = self.repo.get_revision_session('r1')
        history, count = self.repo.get_revisions_for_session('s1')
        summary = self.repo.get_revision_summary('r1')
        self.assertEqual(count, 1)
        for payload in (restored, history[0], summary):
            self.assertEqual(payload['progress_percent'], 0)
            self.assertEqual(payload['total_quiz_score_percent'], 100)
            self.assertIn('completion_recalculated', [
                notice['code'] for notice in payload['notices']
            ])
        self.assertIsNone(restored['completed_at'])
        self.assertIsNone(history[0]['completed_at'])
        self.assertEqual(summary['nodes_reviewed'], 0)
        self.assertEqual(summary['nodes_total'], 1)
        self.assertEqual(summary['quizzes_total'], 1)
        self.assertEqual(summary['comparison'], {
            'original_quiz_score_percent': 0, 'improvement_percent': 100,
        })
        RevisionSessionResponse.model_validate(history[0])
        RevisionSummary.model_validate(summary)
        self.assertEqual(self.db.rows, before)
        self.db['quiz_attempts'].find.assert_any_call({
            'revision_session_id': None, 'node_id': {'$in': ['n1']},
        })

    def test_history_batches_all_revisions_and_respects_pagination(
        self,
    ) -> None:
        second = dict(self.db.rows['revision_sessions'][0])
        second.update(_id='r2', revision_number=2, started_at=SECOND)
        self.db.rows['revision_sessions'].append(second)
        progress = dict(self.db.rows['revision_node_progress'][0])
        progress.update(_id='p2', revision_session_id='r2')
        self.db.rows['revision_node_progress'].append(progress)
        self.db.rows['quiz_attempts'] = [attempt('one')]
        history, count = self.repo.get_revisions_for_session('s1')
        self.assertEqual(count, 2)
        self.assertEqual([row['id'] for row in history], ['r2', 'r1'])
        self.assertIsNone(history[0]['total_quiz_score_percent'])
        self.assertEqual(history[1]['total_quiz_score_percent'], 100)
        for name in ('revision_node_progress', 'concept_nodes',
                     'quiz_data', 'quiz_attempts'):
            self.db[name].find.assert_called_once()
            self.db[name].find_one.assert_not_called()
        page, count = self.repo.get_revisions_for_session('s1', 1, 1)
        self.assertEqual(count, 2)
        self.assertEqual([row['id'] for row in page], ['r1'])

    def test_quizless_empty_and_reviewable_denominators(self) -> None:
        self.db.rows['quiz_data'] = []
        self.db.rows['revision_node_progress'][0]['status'] = 'quiz_passed'
        for empty in (False, True):
            with self.subTest(empty=empty):
                if empty:
                    self.db.rows['revision_node_progress'] = []
                restored = self.repo.get_revision_session('r1')
                summary = self.repo.get_revision_summary('r1')
                self.assertEqual(restored['status'], 'in_progress')
                self.assertIsNone(restored['total_quiz_score_percent'])
                self.assertIsNone(restored['completed_at'])
                self.assertEqual(summary['nodes_total'], 0)
                self.assertEqual(summary['quizzes_total'], 0)
                self.assertIsNone(summary['total_quiz_score_percent'])
        db, repo = make_store('full_review')
        db.rows['quiz_data'] = []
        db.rows['revision_node_progress'][0]['content_reviewed_at'] = FIRST
        restored = repo.get_revision_session('r1')
        self.assertEqual(restored['status'], 'completed')
        self.assertEqual(repo.get_revision_summary('r1')['nodes_total'], 1)
        self.assertEqual(restored['nodes'][0]['quiz_count'], 0)
```

### Step 2 — Red

- [ ] Run; expect FAIL for sticky cached history/summary and missing `notices`:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo.RevisionMongoTests.test_history_summary_share_projection_and_original_comparison server.tests.test_revision_mongo.RevisionMongoTests.test_history_batches_all_revisions_and_respects_pagination server.tests.test_revision_mongo.RevisionMongoTests.test_quizless_empty_and_reviewable_denominators -v
```

### Step 3 — Replace history method

- [ ] Replace `get_revisions_for_session` entirely. Batch **across** the history page; do not call `get_revision_session` inside its loop.

```python
    def get_revisions_for_session(
        self, session_id: str, limit: int = 20, offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        query = {'original_session_id': session_id}
        total = self._revisions.count_documents(query)
        documents = list(
            self._revisions.find(query).sort('started_at', DESCENDING)
            .skip(max(offset, 0)).limit(max(limit, 0))
        )
        batches = self._load_revision_batch(documents)
        responses = []
        for document in documents:
            result = self._revision_response(
                document, batches[document['_id']][3],
            )
            result.pop('nodes')
            responses.append(result)
        return responses, total
```

### Step 4 — Replace summary method

- [ ] Add `RevisionSummary` to schema imports and replace `get_revision_summary`. Original comparison uses only original non-revision attempts, preserving its existing scoring policy. Other revisions cannot enter either side. Revision score/counts come exclusively from compatible P1 projection; do not fall back to cached score.

```python
    def get_revision_summary(self, revision_id: str) -> dict[str, Any]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            raise LookupError(f'Revision session not found: {revision_id}')
        batch = self._load_revision_batch([document])[revision_id]
        projection = batch[3]
        node_ids = sorted(node.node_id for node in batch[1])
        comparison = None
        if projection.total_attempts and node_ids:
            originals = list(self._attempts.find({
                'revision_session_id': None,
                'node_id': {'$in': node_ids},
            }))
            if originals:
                score = (sum(bool(row.get('is_correct'))
                             for row in originals) * 100) // len(originals)
                comparison = {
                    'original_quiz_score_percent': score,
                    'improvement_percent': (
                        projection.total_quiz_score_percent - score
                    ),
                }
        return RevisionSummary.model_validate({
            'revision_id': revision_id, 'mode': document['mode'],
            'progress_percent': projection.progress_percent,
            'total_quiz_score_percent': projection.total_quiz_score_percent,
            'nodes_reviewed': projection.nodes_completed,
            'nodes_total': projection.nodes_total,
            'quizzes_passed': projection.correct_attempts,
            'quizzes_failed': projection.incorrect_attempts,
            'quizzes_total': projection.total_attempts,
            'time_spent_seconds': projection.time_spent_seconds,
            'comparison': comparison, 'notices': list(projection.notices),
        }).model_dump(mode='json')
```

### Step 5 — Green

- [ ] Re-run Step 2's exact command, then `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo server.tests.test_migrate_to_mongo -v`; expect PASS.

### Step 6 — Atomic commit

- [ ] Mutex template; stage only `server/database/repositories/mongo_learning.py` and `server/tests/test_revision_mongo.py`. Message: **`fix(review-parity): derive Mongo history and summaries from attempts`**.

## Task 3: Validated append-only submissions and recoverable aggregates

**Files:** `server/database/repositories/mongo_learning.py:submit_revision_quiz,_update_revision_progress` and private mutation helpers; `server/tests/test_revision_mongo.py:RevisionMongoTests`.

### Step 1 — Add failing mutation, validation, and interruption tests

- [ ] Add these methods:

```python
    def test_practice_submission_retry_and_timestamp_contract(self) -> None:
        self.db.rows['quiz_attempts'] = [
            attempt('original', number=7, revision=None),
        ]
        original = copy.deepcopy([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ])
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=FIRST):
            first = self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        RevisionQuizSubmissionResult.model_validate(first)
        self.assertEqual(first['attempt_number'], 8)
        self.assertEqual(first['quiz_attempt_count'], 1)
        self.assertEqual(first['revision_node_status'], 'pending')
        self.assertEqual(first['revision_session_id'], 'r1')
        self.assertEqual(first['correct_option_ids'], ['q0-0'])
        self.assertEqual(first['explanation'], 'Explanation q0-0')
        self.assertEqual(self.repo.get_revision_session('r1')
                         ['progress_percent'], 0)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=SECOND):
            wrong = self.repo.submit_revision_quiz(
                'r1', 'n1', ['q1-1'], quiz_index=1,
            )
        self.assertEqual(wrong['revision_node_status'], 'quiz_failed')
        self.assertEqual(wrong['correct_option_ids'], [])
        self.assertEqual(wrong['explanation'], '')
        self.assertEqual(wrong['selected_explanation'], 'Explanation q1-1')
        completed = self.repo.get_revision_session('r1')
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=THIRD):
            retry = self.repo.submit_revision_quiz(
                'r1', 'n1', ['q1-0'], quiz_index=1,
            )
        self.assertEqual(retry['quiz_attempt_count'], 2)
        self.assertEqual(retry['revision_node_status'], 'quiz_passed')
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['completed_at'], completed['completed_at'])
        self.assertEqual(restored['total_quiz_score_percent'], 66)
        self.assertEqual(restored['progress_percent'], 100)
        result = restored['nodes'][0]['quiz_results'][1]
        self.assertEqual({key: value for key, value in retry.items()
                          if key != 'revision_node_status'}, result)
        summary = self.repo.get_revision_summary('r1')
        self.assertEqual((summary['quizzes_passed'], summary['quizzes_failed'],
                          summary['quizzes_total']), (2, 1, 3))
        self.assertEqual(summary['time_spent_seconds'], 7200)
        history, _ = self.repo.get_revisions_for_session('s1')
        self.assertEqual(history[0]['total_quiz_score_percent'], 66)
        self.assertEqual([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ], original)
        self.db.client.start_session.assert_not_called()

    def test_multi_select_exact_match_uses_stable_ids(self) -> None:
        self.db.rows['quiz_data'][0]['payload'] = QuizSet(
            quizzes=[make_quiz('q0', multiple=True)],
        ).model_dump(mode='json')
        wrong = self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertFalse(wrong['is_correct'])
        self.assertEqual(wrong['correct_option_ids'], [])
        correct = self.repo.submit_revision_quiz(
            'r1', 'n1', ['q0-2', 'q0-0'],
        )
        self.assertTrue(correct['is_correct'])
        self.assertEqual(correct['correct_option_ids'], ['q0-0', 'q0-2'])
        self.assertEqual(correct['selected_option_ids'], ['q0-2', 'q0-0'])
        self.assertEqual(correct['quiz_attempt_count'], 2)
        payload = self.db.rows['quiz_data'][0]['payload']
        self.assertEqual([option['explanation'] for option in
                          payload['quizzes'][0]['options']
                          if option['is_correct']],
                         ['Explanation q0-0', 'Explanation q0-2'])

    def test_invalid_submission_records_nothing(self) -> None:
        cases = [
            ('missing', 'n1', ['q0-0'], 0, LookupError),
            ('r1', 'foreign', ['q0-0'], 0, LookupError),
            ('r1', 'n1', ['q0-0'], -1, ValueError),
            ('r1', 'n1', ['q0-0'], 2, ValueError),
            ('r1', 'n1', [], 0, ValueError),
            ('r1', 'n1', ['D'], 0, ValueError),
            ('r1', 'n1', ['q0-0', 'q0-0'], 0, ValueError),
            ('r1', 'n1', ['q0-0', 'q0-1'], 0, ValueError),
        ]
        for revision, node, selected, index, error in cases:
            with self.subTest(revision=revision, selected=selected,
                              node=node, index=index):
                before = copy.deepcopy(self.db.rows)
                with self.assertRaises(error):
                    self.repo.submit_revision_quiz(
                        revision, node, selected, index,
                    )
                self.assertEqual(self.db.rows, before)
        self.db.rows['concept_nodes'][0]['learning_session_id'] = 'other'
        before = copy.deepcopy(self.db.rows)
        with self.assertRaises(ValueError):
            self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertEqual(self.db.rows, before)

    def test_committed_attempt_survives_aggregate_failure(self) -> None:
        self.db.rows['quiz_attempts'] = [attempt('first')]
        self.db['revision_sessions'].update_one.side_effect = AutoReconnect(
            'simulated metadata failure'
        )
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=SECOND):
            result = self.repo.submit_revision_quiz(
                'r1', 'n1', ['q1-1'], quiz_index=1,
            )
        RevisionQuizSubmissionResult.model_validate(result)
        self.assertEqual(result['revision_node_status'], 'quiz_failed')
        self.assertEqual(self.db.rows['revision_sessions'][0]
                         ['progress_percent'], 0)
        restored = self.repo.get_revision_session('r1')
        history, _ = self.repo.get_revisions_for_session('s1')
        summary = self.repo.get_revision_summary('r1')
        for payload in (restored, history[0], summary):
            self.assertEqual(payload['progress_percent'], 100)
            self.assertEqual(payload['total_quiz_score_percent'], 50)
        self.assertEqual(restored['nodes'][0]['quiz_results'][1]['id'],
                         result['id'])
        self.assertEqual(len(self.db.rows['quiz_attempts']), 2)

    def test_attempt_insert_failure_keeps_saved_result(self) -> None:
        self.db.rows['quiz_attempts'] = [attempt('saved', correct=False)]
        before = copy.deepcopy(self.db.rows)
        self.db['quiz_attempts'].insert_one.side_effect = AutoReconnect(
            'simulated insert failure'
        )
        with self.assertRaises(AutoReconnect):
            self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertEqual(self.db.rows, before)
        self.assertEqual(self.repo.get_revision_session('r1')['nodes'][0]
                         ['quiz_results'][0]['id'], 'saved')

    def test_disproven_completion_reconciles_before_new_evidence(self) -> None:
        self.db.rows['revision_sessions'][0].update({
            'status': 'completed', 'progress_percent': 100,
            'completed_at': THIRD,
        })
        self.db.rows['quiz_attempts'] = [attempt('first')]
        self.assertIsNone(self.repo.get_revision_session('r1')['completed_at'])
        self.assertEqual(self.db.rows['revision_sessions'][0]
                         ['completed_at'], THIRD)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=SECOND):
            self.repo.submit_revision_quiz('r1', 'n1', ['q1-1'], 1)
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(
            restored['completed_at'],
            '2026-10-05T11:00:00Z',
        )
```

### Step 2 — Red

- [ ] Run; expect FAIL from old incomplete submission payload, sticky correctness, selection validation, and metadata failure:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo.RevisionMongoTests.test_practice_submission_retry_and_timestamp_contract server.tests.test_revision_mongo.RevisionMongoTests.test_multi_select_exact_match_uses_stable_ids server.tests.test_revision_mongo.RevisionMongoTests.test_invalid_submission_records_nothing server.tests.test_revision_mongo.RevisionMongoTests.test_committed_attempt_survives_aggregate_failure server.tests.test_revision_mongo.RevisionMongoTests.test_attempt_insert_failure_keeps_saved_result server.tests.test_revision_mongo.RevisionMongoTests.test_disproven_completion_reconciles_before_new_evidence -v
```

### Step 3 — Add mutation loading and aggregate persistence helpers

- [ ] Add `RevisionQuizSubmissionResult` to schema imports, `PyMongoError` to pymongo error imports, and `replace` from stdlib `dataclasses`. Add `_revision_mutation_inputs`, `_persist_revision_projection`, `_prepare_revision_write`. Replace `_update_revision_progress` with the last method here. P1 owns computation: these helpers only load/reconcile/persist.

```python
    def _revision_mutation_inputs(
        self, revision_id: str, node_id: str,
    ) -> tuple[dict[str, Any], RevisionBatch, RevisionNodeInput]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            raise LookupError(f'Revision session not found: {revision_id}')
        batch = self._load_revision_batch([document])[revision_id]
        target = next((node for node in batch[1]
                       if node.node_id == node_id), None)
        if target is None:
            raise LookupError('Revision node not found')
        return document, batch, target

    def _persist_revision_projection(
        self, revision_id: str, projection: RevisionProjection,
    ) -> None:
        self._revisions.update_one({'_id': revision_id}, {'$set': {
            'status': projection.status,
            'progress_percent': projection.progress_percent,
            'total_quiz_score_percent': projection.total_quiz_score_percent,
            'completed_at': (
                projection.completed_at.isoformat()
                if projection.completed_at is not None else None
            ),
        }})

    def _prepare_revision_write(
        self, batch: RevisionBatch,
    ) -> tuple[
        RevisionProjectionInput,
        list[RevisionNodeInput],
        list[RevisionAttemptInput],
    ]:
        revision, nodes, attempts, projection = batch
        if (revision.stored_status == 'completed'
                and projection.status == 'in_progress'):
            # Validated progress write reconciles disproven history before
            # new evidence could make the revision complete again.
            self._persist_revision_projection(revision.id, projection)
            revision = replace(
                revision, stored_status='in_progress',
                stored_completed_at=None,
            )
        return revision, nodes, attempts

    def _update_revision_progress(self, revision_id: str) -> dict[str, Any]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            raise LookupError(f'Revision session not found: {revision_id}')
        projection = self._load_revision_batch([document])[revision_id][3]
        self._persist_revision_projection(revision_id, projection)
        return self._revision_response(document, projection)
```

### Step 4 — Replace revision submission (do not call original quiz method)

- [ ] Replace `submit_revision_quiz` in full. It validates before **any** source or aggregate write, reads node-wide sequence without renumbering, appends one saved attempt, and constructs the immediate result from the same shared projection as GET. If only a post-commit cached-aggregate write fails, log a safe warning and return the committed authoritative result, avoiding an artificial failed mutation/double retry. Source insert failure is not caught. Failure while reconciling a disproven timestamp before the insert propagates and appends no attempt.

```python
    def submit_revision_quiz(
        self, revision_id: str, node_id: str,
        selected_option_ids: list[str], quiz_index: int = 0,
    ) -> dict[str, Any]:
        document, batch, target = self._revision_mutation_inputs(
            revision_id, node_id,
        )
        if quiz_index < 0 or quiz_index >= len(target.quizzes):
            raise ValueError('Invalid quiz_index')
        correct = evaluate_revision_selection(
            target.quizzes[quiz_index], selected_option_ids,
        )
        revision, nodes, attempts = self._prepare_revision_write(batch)
        last = self._attempts.find_one(
            {'node_id': node_id},
            sort=[('attempt_number', DESCENDING), ('_id', DESCENDING)],
        )
        number = int(last['attempt_number']) + 1 if last else 1
        now = utc_iso()
        saved = {
            '_id': str(uuid.uuid4()), 'revision_session_id': revision_id,
            'node_id': node_id, 'quiz_index': quiz_index,
            'attempt_number': number,
            'selected_option_id': list(selected_option_ids),
            'is_correct': correct, 'score_percent': 100 if correct else 0,
            'created_at': now,
        }
        self._attempts.insert_one(saved)
        projected = project_revision(
            revision=revision, nodes=nodes,
            attempts=attempts + [_revision_attempt(saved, revision.started_at)],
        )
        node = next(row for row in projected.nodes if row.node_id == node_id)
        result = next(row for row in node.quiz_results
                      if row.quiz_index == quiz_index)
        try:
            self._persist_revision_projection(revision_id, projected)
        except PyMongoError as error:
            logger.warning(
                'Revision aggregate deferred revision_id=%s error_type=%s',
                revision_id, type(error).__name__,
            )
        return RevisionQuizSubmissionResult.model_validate({
            **result.model_dump(), 'revision_node_status': node.status,
        }).model_dump(mode='json')
```

`find_one(sort=...)` is existing documented PyMongo usage (also used by migration counter lookup). Extend fixture `find_one` side effect **before red** in Step 1 to accept `sort=None`, sorting the `MemoryCursor` before selecting its first document:

```python
            def find_one(query, projection=None, sort=None):
                cursor = self.find(name, query)
                if sort is not None:
                    cursor.sort(sort)
                return next(iter(cursor), None)

            collection.find_one.side_effect = find_one
```

Each collection builds its own closure in `MemoryMongo.__getitem__`, so the captured `name` is stable. This fixture update models real sort semantics and must not emulate application outcomes.

**Numbering decision:** use maximum stored node-wide sequence + 1 for new revision attempts (do not count only this revision or this quiz). Concurrent writers may share a sequence under existing nontransactional semantics; P1's deterministic ID tie-breaker handles this. No counter collection, renumbering, transaction, or shared normal-course numbering refactor is authorized.

### Step 5 — Green

- [ ] Re-run Step 2 exactly, then `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo server.tests.test_migrate_to_mongo -v`; expect PASS. Confirm no original-session/node/quiz updates and no transaction calls.

### Step 6 — Atomic commit

- [ ] Mutex template; stage only `server/database/repositories/mongo_learning.py` and `server/tests/test_revision_mongo.py`. Message: **`fix(review-parity): save validated Mongo attempts with recoverable progress`**.

## Task 4: Explicit idempotent review and legacy absent/null safety

**Files:** `server/database/repositories/mongo_learning.py:create_revision_session,mark_revision_node_reviewed`; `server/tests/test_revision_mongo.py`; narrow creation fixture `server/tests/test_mongo_learning.py`.

### Step 1 — Add failing explicit review, compatibility, and failure tests

- [ ] Add these methods to `RevisionMongoTests`:

```python
    def test_full_review_is_explicit_idempotent_and_quiz_independent(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        before = copy.deepcopy([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ])
        self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertEqual(self.repo.get_revision_session('r1')
                         ['progress_percent'], 0)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=FIRST):
            reviewed = self.repo.mark_revision_node_reviewed('r1', 'n1')
        RevisionNodeProgressWithDetails.model_validate(reviewed)
        self.assertEqual(reviewed['status'], 'reviewed')
        self.assertEqual(reviewed['content_reviewed_at'],
                         '2026-10-05T10:00:00Z')
        self.assertEqual(reviewed['quiz_count'], 2)
        self.assertEqual(len(reviewed['quiz_results']), 1)
        self.assertNotIn('revision_session_id', reviewed)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=THIRD):
            again = self.repo.mark_revision_node_reviewed('r1', 'n1')
            wrong = self.repo.submit_revision_quiz('r1', 'n1', ['q1-1'], 1)
        self.assertEqual(again['content_reviewed_at'],
                         reviewed['content_reviewed_at'])
        self.assertEqual(wrong['revision_node_status'], 'reviewed')
        self.assertEqual(self.repo.get_revision_session('r1')['completed_at'],
                         '2026-10-05T10:00:00Z')
        self.assertEqual([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ], before)

    def test_legacy_review_inference_only_for_absent_reviewed_field(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        progress = self.db.rows['revision_node_progress'][0]
        progress.pop('content_reviewed_at')
        progress.update(status='reviewed', reviewed_at=FIRST)
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['notices'][0]['code'],
                         'legacy_review_inferred')
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=THIRD):
            reviewed = self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(reviewed['content_reviewed_at'],
                         '2026-10-05T10:00:00Z')
        self.assertEqual(progress['content_reviewed_at'],
                         '2026-10-05T10:00:00+00:00')
        self.assertEqual(self.repo.mark_revision_node_reviewed('r1', 'n1')
                         ['content_reviewed_at'], reviewed['content_reviewed_at'])
        self.db['revision_node_progress'].update_one.assert_any_call(
            {'_id': 'p1', 'content_reviewed_at': {'$exists': False}},
            {'$set': {'content_reviewed_at': FIRST}},
        )
        for status, reviewed_at, present, expected in (
            ('reviewed', None, False, '2026-10-05T09:00:00Z'),
            ('quiz_passed', FIRST, False, None),
            ('quiz_failed', FIRST, False, None),
            ('reviewed', FIRST, True, None),
        ):
            with self.subTest(status=status, present=present):
                progress.pop('content_reviewed_at', None)
                progress.update(status=status, reviewed_at=reviewed_at)
                if present:
                    progress['content_reviewed_at'] = None
                node = self.repo.get_revision_session('r1')['nodes'][0]
                self.assertEqual(node['content_reviewed_at'], expected)
                self.assertEqual(node['status'],
                                 'pending' if expected is None else 'reviewed')
        progress.update(status='quiz_passed', reviewed_at=FIRST)
        self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        restored = self.repo.get_revision_session('r1')
        self.assertIsNone(restored['nodes'][0]['content_reviewed_at'])
        self.assertIn('legacy_review_required', [
            notice['code'] for notice in restored['notices']
        ])

    def test_review_mode_membership_and_source_failure_write_nothing(
        self,
    ) -> None:
        before = copy.deepcopy(self.db.rows)
        with self.assertRaises(ValueError):
            self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(self.db.rows, before)
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        for revision, node in (('missing', 'n1'), ('r1', 'missing')):
            before = copy.deepcopy(self.db.rows)
            with self.assertRaises(LookupError):
                self.repo.mark_revision_node_reviewed(revision, node)
            self.assertEqual(self.db.rows, before)
        before = copy.deepcopy(self.db.rows)
        self.db['revision_node_progress'].update_one.side_effect = (
            AutoReconnect('simulated review failure')
        )
        with self.assertRaises(AutoReconnect):
            self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(self.db.rows, before)

    def test_committed_review_recovers_after_aggregate_interruption(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        self.db['revision_sessions'].update_one.side_effect = AutoReconnect(
            'simulated aggregate failure'
        )
        reviewed = self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(reviewed['status'], 'reviewed')
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['progress_percent'], 100)
        self.assertEqual(restored['nodes'][0], reviewed)
        self.assertEqual(self.repo.get_revision_summary('r1')
                         ['nodes_reviewed'], 1)

    def test_new_revision_starts_explicitly_unreviewed_unanswered(
        self,
    ) -> None:
        self.db.rows['quiz_attempts'] = [attempt('older')]
        created = self.repo.create_revision_session('s1', 'full_review')
        RevisionSessionWithProgress.model_validate(created)
        self.assertEqual(created['nodes'][0]['quiz_results'], [])
        self.assertIsNone(created['nodes'][0]['content_reviewed_at'])
        progress = self.db.rows['revision_node_progress'][-1]
        self.assertIn('content_reviewed_at', progress)
        self.assertIsNone(progress['content_reviewed_at'])
        self.assertEqual(created['notices'], [])
        self.assertEqual(created['progress_percent'], 0)
```

- [ ] In `server/tests/test_mongo_learning.py:test_create_revision_clones_all_node_progress`, add `learning_session_id='s1'` to both concept fixture documents. Add the following assertions **before red** (keep existing assertions):

```python
        for progress in inserts:
            self.assertIn('content_reviewed_at', progress)
            self.assertIsNone(progress['content_reviewed_at'])
        self.assertEqual(revision['nodes'][0]['quiz_count'], 0)
        self.assertEqual(revision['nodes'][0]['quiz_results'], [])
        self.assertEqual(revision['notices'], [])
```

### Step 2 — Red

- [ ] Run; expect FAIL on timestamp rewrite, absent node details, missing explicit field, or aggregate interruption:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo.RevisionMongoTests.test_full_review_is_explicit_idempotent_and_quiz_independent server.tests.test_revision_mongo.RevisionMongoTests.test_legacy_review_inference_only_for_absent_reviewed_field server.tests.test_revision_mongo.RevisionMongoTests.test_review_mode_membership_and_source_failure_write_nothing server.tests.test_revision_mongo.RevisionMongoTests.test_committed_review_recovers_after_aggregate_interruption server.tests.test_revision_mongo.RevisionMongoTests.test_new_revision_starts_explicitly_unreviewed_unanswered server.tests.test_mongo_learning.MongoLearningTests.test_create_revision_clones_all_node_progress -v
```

### Step 3 — Replace explicit review action

- [ ] Replace `mark_revision_node_reviewed`. Compatibility initialization only touches the absent target field. The subsequent conditional update preserves the winner's first timestamp even if two review calls race. Reload the batch after source update; never respond using an assumed timestamp/status. Post-commit aggregate failure is recoverable; source update failure propagates.

```python
    def mark_revision_node_reviewed(
        self, revision_id: str, node_id: str,
    ) -> dict[str, Any]:
        document, batch, target = self._revision_mutation_inputs(
            revision_id, node_id,
        )
        if document['mode'] != 'full_review':
            raise ValueError('mark-reviewed requires full_review')
        revision, nodes, attempts = self._prepare_revision_write(batch)
        details = next(node for node in batch[3].nodes
                       if node.node_id == node_id)
        if not target.explicit_review_present:
            self._revision_nodes.update_one({
                '_id': target.id,
                'content_reviewed_at': {'$exists': False},
            }, {'$set': {
                'content_reviewed_at': (
                    details.content_reviewed_at.isoformat()
                    if details.content_reviewed_at is not None else None
                ),
            }})
        now = utc_iso()
        self._revision_nodes.update_one({
            '_id': target.id, 'content_reviewed_at': None,
        }, {'$set': {
            'content_reviewed_at': now, 'status': 'reviewed',
            'reviewed_at': now,
        }})
        # Pre-write reconciliation may have cleared a disproven timestamp.
        current = dict(document)
        current['status'] = revision.stored_status
        current['completed_at'] = (
            revision.stored_completed_at.isoformat()
            if revision.stored_completed_at is not None else None
        )
        projection = self._load_revision_batch([current])[revision_id][3]
        try:
            self._persist_revision_projection(revision_id, projection)
        except PyMongoError as error:
            logger.warning(
                'Revision aggregate deferred revision_id=%s error_type=%s',
                revision_id, type(error).__name__,
            )
        updated = next(node for node in projection.nodes
                       if node.node_id == node_id)
        return updated.model_dump(mode='json')
```

### Step 4 — Update new revision creation and its narrow mock fixture

- [ ] In `create_revision_session`, add `'content_reviewed_at': None` to each `progress_docs` document, remove the unused `progress_rows` accumulator/building, and replace the final hand-built response with:

```python
        created = self.get_revision_session(revision_id)
        if created is None:
            raise RuntimeError('Created revision could not be loaded')
        return created
```

- [ ] Adapt **only** `test_create_revision_clones_all_node_progress` mocks so the newly inserted documents are readable. Before calling `create_revision_session`, add these side effects:

```python
        revisions = self.database['revision_sessions']
        progress_collection = self.database['revision_node_progress']
        revisions.insert_one.side_effect = (
            lambda document: setattr(
                revisions.find_one, 'return_value', dict(document),
            )
        )
        progress_collection.insert_many.side_effect = (
            lambda documents: setattr(
                progress_collection.find, 'return_value', documents,
            )
        )
        self.database['quiz_data'].find.return_value = []
        self.database['quiz_attempts'].find.return_value = []
```

These are narrow fixture changes for additional reads; do not modify unrelated custom-count tests.

### Step 5 — Green

- [ ] Re-run Step 2 exactly; expect PASS. Then `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo server.tests.test_migrate_to_mongo -v` must PASS.

### Step 6 — Atomic commit

- [ ] Mutex template; stage only `server/database/repositories/mongo_learning.py`, `server/tests/test_revision_mongo.py`, `server/tests/test_mongo_learning.py`. Message: **`fix(review-parity): preserve explicit Mongo review timestamps`**.

## Task 5: Original-only feedback/mastery and immutable course snapshots

**Files:** `server/database/repositories/mongo_learning.py:get_quiz_attempts,check_mastery,_check_multi_quiz_mastery`; `server/tests/test_revision_mongo.py`; `server/tests/test_mongo_learning.py`.

### Step 1 — Add failing scope tests

- [ ] Add to `RevisionMongoTests`:

```python
    def test_revision_attempts_never_count_as_original_mastery(self) -> None:
        self.db.rows['quiz_attempts'] = [
            attempt('revision-q0'),
            attempt('revision-q1', index=1, number=2),
            attempt('original-wrong', number=3, correct=False, revision=None),
        ]
        history = self.repo.get_quiz_attempts('n1')
        self.assertEqual(history['total_attempts'], 1)
        self.assertFalse(history['is_mastered'])
        self.assertEqual(history['best_score'], 0)
        self.assertEqual(history['attempts'][0]['id'], 'original-wrong')
        self.assertFalse(self.repo.check_mastery('n1'))
        self.db.rows['quiz_data'][0]['payload'] = QuizSet(
            quizzes=[make_quiz('q0')],
        ).model_dump(mode='json')
        self.assertFalse(self.repo.check_mastery('n1'))
        missing_scope = attempt('legacy-original', number=4)
        missing_scope.pop('revision_session_id')
        self.db.rows['quiz_attempts'].append(missing_scope)
        self.assertTrue(self.repo.check_mastery('n1'))
        self.assertEqual(self.repo.get_quiz_attempts('n1')
                         ['total_attempts'], 2)
```

- [ ] Add to `MongoLearningTests` in `server/tests/test_mongo_learning.py`:

```python
    def test_original_attempt_queries_exclude_revision_scope(self) -> None:
        attempts = self.database['quiz_attempts']
        attempts.find.return_value.sort.return_value = []
        quiz = self.database['quiz_data']
        quiz.find_one.return_value = {
            'node_id': 'n1', 'format_version': 1, 'current_index': 0,
            'payload': make_quiz_set().model_dump(mode='json'),
        }
        self.repository.get_quiz_attempts('n1')
        attempts.find.assert_called_once_with({
            'node_id': 'n1', 'revision_session_id': None,
        })
        attempts.find_one.return_value = None
        self.assertFalse(self.repository.check_mastery('n1'))
        attempts.find_one.assert_called_once_with({
            'node_id': 'n1', 'is_correct': True,
            'revision_session_id': None,
        })
        attempts.find.reset_mock()
        attempts.find.return_value = []
        self.assertFalse(self.repository._check_multi_quiz_mastery('n1', 2))
        attempts.find.assert_called_once_with({
            'node_id': 'n1', 'is_correct': True,
            'revision_session_id': None,
        })
```

### Step 2 — Red

- [ ] Run; expect FAIL from revisions appearing in original history/mastery:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo.RevisionMongoTests.test_revision_attempts_never_count_as_original_mastery server.tests.test_mongo_learning.MongoLearningTests.test_original_attempt_queries_exclude_revision_scope -v
```

### Step 3 — Narrowly scope three original queries

- [ ] Change only the query dictionaries below; preserve normal mastery/scoring, history format, and normal-course state transitions. Mongo `None` intentionally includes legacy attempts with absent `revision_session_id`.

```diff
@@ get_quiz_attempts
-        cursor = self._attempts.find({"node_id": node_id}).sort(
+        cursor = self._attempts.find({
+            'node_id': node_id, 'revision_session_id': None,
+        }).sort(
             "attempt_number",
             ASCENDING,
@@ check_mastery
-                    {"node_id": node_id, "is_correct": True}
+                    {
+                        'node_id': node_id, 'is_correct': True,
+                        'revision_session_id': None,
+                    }
@@ _check_multi_quiz_mastery
-                {"node_id": node_id, "is_correct": True}
+                {
+                    'node_id': node_id, 'is_correct': True,
+                    'revision_session_id': None,
+                }
```

Do not filter the node-wide sequence lookup in revision submission: its numbering has a different purpose. `_calculate_mastery_from_attempts` receives already-original-only history; no new scoring algorithm is needed. Revision submission does not call `create_quiz_attempt` or original mastery.

### Step 4 — Green

- [ ] Re-run Step 2, then `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo server.tests.test_migrate_to_mongo -v`; expect PASS. Also run existing `test_create_attempt_uses_next_attempt_number` alone to preserve its unmodified historical behavior:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_mongo_learning.MongoLearningTests.test_create_attempt_uses_next_attempt_number -v
```

### Step 5 — Atomic commit

- [ ] Mutex template; stage only `server/database/repositories/mongo_learning.py`, `server/tests/test_revision_mongo.py`, `server/tests/test_mongo_learning.py`. Message: **`fix(review-parity): exclude Mongo revisions from original mastery`**.

## Task 6: Legacy quiz codecs and incompatible attempt retention

**Files:** `server/database/repositories/mongo_learning.py:_revision_quizzes,_revision_attempt`; `server/tests/test_revision_mongo.py`. Do not change shared P1 projection or rewrite stored attempts/quizzes.

### Step 1 — Add failing legacy adapter tests

- [ ] Add these methods:

```python
    def test_legacy_single_quiz_and_scalar_attempt_restore_without_rewrite(
        self,
    ) -> None:
        quiz = make_quiz('q0').model_dump(mode='json')
        self.db.rows['quiz_data'][0].update(payload=quiz, format_version=1)
        # Stale format-version value must not turn a single card into a set.
        saved = attempt('scalar')
        saved.pop('quiz_index')
        saved['selected_option_id'] = 'q0-0'
        self.db.rows['quiz_attempts'] = [saved]
        before = copy.deepcopy(self.db.rows)
        restored = self.repo.get_revision_session('r1')
        node = restored['nodes'][0]
        self.assertEqual(node['quiz_count'], 1)
        self.assertEqual(node['quiz_results'][0]['quiz_index'], 0)
        self.assertEqual(node['quiz_results'][0]['selected_option_ids'],
                         ['q0-0'])
        self.assertEqual(restored['progress_percent'], 100)
        self.assertEqual(self.db.rows, before)
        submitted = self.repo.submit_revision_quiz('r1', 'n1', ['q0-1'])
        self.assertEqual(submitted['quiz_attempt_count'], 2)
        self.assertEqual(submitted['revision_node_status'], 'quiz_failed')

    def test_incompatible_attempts_are_retained_not_remapped(self) -> None:
        bad_index = attempt('bad-index', index=9)
        missing_index = attempt('missing-index')
        missing_index.pop('quiz_index')
        old_option = attempt('old-option')
        old_option['selected_option_id'] = ['removed-option']
        bad_time = attempt('bad-time')
        bad_time['created_at'] = 'unparseable'
        bad_sequence = attempt('bad-sequence')
        bad_sequence['attempt_number'] = 'unparseable'
        bad_score = attempt('bad-score')
        bad_score['score_percent'] = 0
        orphan = attempt('orphan')
        orphan['node_id'] = 'removed-node'
        self.db.rows['quiz_attempts'] = [
            bad_index, missing_index, old_option, bad_time,
            bad_sequence, bad_score, orphan, attempt('valid'),
        ]
        before = copy.deepcopy(self.db.rows)
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['nodes'][0]['status'], 'pending')
        self.assertEqual([row['id'] for row in restored['nodes'][0]
                          ['quiz_results']], ['valid'])
        self.assertEqual(restored['total_quiz_score_percent'], 100)
        notices = [notice for notice in restored['notices']
                   if notice['code'] == 'incompatible_attempts']
        self.assertEqual(sum(notice['attempt_count'] for notice in notices), 7)
        self.assertEqual(self.repo.get_revision_summary('r1')
                         ['quizzes_total'], 1)
        self.assertEqual(self.db.rows, before)

    def test_missing_quiz_payload_does_not_break_other_topics(self) -> None:
        self.db.rows['concept_nodes'].append({
            '_id': 'n2', 'learning_session_id': 's1', 'title': 'Unavailable',
            'sequence_index': 1, 'status': 'COMPLETED',
        })
        self.db.rows['revision_node_progress'].append({
            '_id': 'p2', 'revision_session_id': 'r1', 'node_id': 'n2',
            'status': 'quiz_passed', 'reviewed_at': FIRST,
        })
        self.db.rows['quiz_data'].append({
            '_id': 'broken', 'node_id': 'n2', 'payload': 'broken',
        })
        stale = attempt('stale')
        stale['node_id'] = 'n2'
        self.db.rows['quiz_attempts'] = [stale, attempt('valid')]
        before = copy.deepcopy(self.db.rows)
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['nodes'][1]['quiz_count'], 0)
        self.assertEqual(restored['nodes'][1]['quiz_results'], [])
        self.assertEqual(restored['nodes'][0]['quiz_results'][0]['id'], 'valid')
        summary = self.repo.get_revision_summary('r1')
        self.assertEqual(summary['nodes_total'], 1)
        self.assertEqual(summary['quizzes_total'], 1)
        self.assertEqual(self.db.rows, before)
```

### Step 2 — Red

- [ ] Run; expect FAIL from native-only `QuizSet` parsing and malformed sequence/timestamp conversion:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo.RevisionMongoTests.test_legacy_single_quiz_and_scalar_attempt_restore_without_rewrite server.tests.test_revision_mongo.RevisionMongoTests.test_incompatible_attempts_are_retained_not_remapped server.tests.test_revision_mongo.RevisionMongoTests.test_missing_quiz_payload_does_not_break_other_topics -v
```

### Step 3 — Replace only the two private input codecs

- [ ] Add `copy` stdlib import. Use `convert_legacy_quiz_card` already imported by this repository. Parse payload structure rather than trusting stale `format_version`; prefer modern `QuizCard` validation (preserves multi-choice semantics) before legacy conversion. Deep-copy before legacy conversion because its dictionary-options path mutates its input. Missing/malformed quiz data is unavailable, not a new synthetic quiz. Attempts for it stay saved and P1 emits incompatibility notices.

```python
def _revision_quizzes(
    document: Optional[dict[str, Any]],
) -> tuple[QuizCard, ...]:
    if document is None:
        return ()
    payload = document.get('payload')
    if not isinstance(payload, dict):
        return ()
    try:
        if 'quizzes' in payload:
            return tuple(QuizSet.model_validate(payload).quizzes)
        try:
            return (QuizCard.model_validate(payload),)
        except ValidationError:
            return (convert_legacy_quiz_card(copy.deepcopy(payload)),)
    except (ValidationError, TypeError, ValueError, AttributeError):
        logger.warning('Unavailable revision quiz node_id=%s',
                       document.get('node_id'))
        return ()


def _revision_attempt(
    document: dict[str, Any], started_at: datetime,
) -> RevisionAttemptInput:
    selected = normalize_selected_option_ids(
        document.get('selected_option_id')
    )
    try:
        number = int(document.get('attempt_number') or 0)
        score = int(document.get('score_percent') or 0)
        raw_index = document.get('quiz_index')
        index = int(raw_index) if raw_index is not None else None
        created = normalize_revision_timestamp(document['created_at'])
    except (KeyError, TypeError, ValueError, AttributeError):
        # Dataclass input can represent incompatible history; P1 omits it.
        # This timestamp never reaches a result because selection is invalid.
        number, score, index = 0, 0, None
        created, selected = started_at, None
    return RevisionAttemptInput(
        id=document.get('_id', ''),
        revision_session_id=document.get('revision_session_id'),
        node_id=document.get('node_id', ''), attempt_number=number,
        quiz_index=index, selected_option_ids=selected,
        is_correct=bool(document.get('is_correct')),
        score_percent=score, created_at=created,
    )
```

The empty strings above are rejection sentinels for corrupt **input** dataclasses, never fabricated result IDs. Valid saved IDs are never altered. No index default of zero for multi-quiz history; P1 resolves missing index only when a single quiz exists.

### Step 4 — Green and input-adapter diagnostics

- [ ] Re-run Step 2, then the focused suites:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo server.tests.test_migrate_to_mongo -v
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts -v
```

Expected: PASS. The snippets annotate new production helpers and public APIs with the actual P1 dataclasses and existing repository dictionary convention. Keep those annotations; do not add assertions/casts that weaken contract validation. Retain the existing mandatory source header. No API/model changes are needed.

### Step 5 — Atomic commit

- [ ] Mutex template; stage only `server/database/repositories/mongo_learning.py` and `server/tests/test_revision_mongo.py`. Message: **`fix(review-parity): restore compatible Mongo legacy revision data`**.

## Task 7: Verification, exit-gate accounting, and explicit downstream handoff

No production fixes or extra artifact files belong to this task. This task has no new TDD cycle/commit. The six implementation tasks have **35 numbered TDD steps** (7 + 6 + 6 + 6 + 5 + 5); this final task has **5 verification/handoff steps**, for **40 numbered steps total**. Preliminary baseline/index checkboxes are operational safeguards, not additional TDD tasks.

### Step 1 — Run all owned regression suites without suppressing baseline failures

- [ ] Run from repository root:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_mongo server.tests.test_mongo_learning server.tests.test_migrate_to_mongo -v
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts server.tests.test_repository_facades -v
```

Required exit: new behavior and migration tests pass, P1/facade regressions pass, and owned repository regressions pass. Known unrelated custom-count failures must be reported separately; **a known baseline does not turn the full command into PASS**. Do not remove/skip tests or repair unrelated course creation under this objective. If still failing, hand off verified P3 implementation with the full exit gate explicitly blocked to the orchestrator/P7.

### Step 2 — Syntax/import and whitespace diagnostics

- [ ] Run:

```powershell
server/.venv/Scripts/python.exe -m py_compile server/database/repositories/mongo_learning.py server/database/migrate_to_mongo.py server/tests/test_revision_mongo.py server/tests/test_mongo_learning.py server/tests/test_migrate_to_mongo.py
git diff --check
git status --short
```

`py_compile` is the server equivalent of a syntax build; no dependencies changed. Confirm no production DB/credential files or unassigned source files entered commits. Record command/exit/counts, not an inferred pass. P7 owns router serialization parity and client coverage/browser gates; P3 validates its real repository payloads against P1 models without editing routers.

### Step 3 — Acceptance self-check

- [ ] Check actual assertions against this coverage map:

| Criteria | P3 evidence |
| --- | --- |
| A1/A2/A4 | Immediate/restored required payloads, correct/wrong disclosure, multi-choice exact match and shuffled stable IDs |
| A6 | Scoped attempts, deterministic tie-breaker/counts, new revision unanswered, migrated attempts restore |
| A7 | Full Review quiz independent of explicit idempotent first reading timestamp |
| A8/A9 | Two-quiz coverage, wrong final answer finishes, retry score 66%, completion time unchanged |
| A14 | Invalid request no writes, insert/review source failures preserve prior data, post-commit aggregates recover |
| A15 | Legacy absent vs null, reviewed fallback to start, quiz-derived notices, incompatible/orphan attempts retained |
| A16 | Same projection GET/list/summary, batched history, quizless/empty denominators, null accuracy, timestamp reconciliation |
| A17 | Range/membership/course/option/cardinality validation, P1 model validation, exact immediate/restored field parity |
| A18 | Original collection snapshots unchanged and original history/mastery query scoping, comparison excludes other revisions |

UI colors, retry presentation, pending inputs, page notices, and live HTTP serialization are not proven by repository tests alone; P4/P6/P7 own those integration assertions.

### Step 4 — Record checkpoint non-destructively

- [ ] On the worker's last own commit, append a git note with commands/outcomes and the known baseline blocker. Use the common mutex around this git mutation as well. Do not overwrite notes or attach claims to another worker's commit. Send commit hashes/evidence to the orchestrator; do not edit `state.md` or `verification.md`.

### Step 5 — Explicit P6/P7 handoff (orchestrator will not read this plan)

- [ ] Report these decisions **in the final worker response**, together with hashes, tests, and blockers:

1. **P6:** Contract unchanged from P1. Immediate result includes independent `revision_node_status`; restored node has `content_reviewed_at`, `quiz_count`, sorted `quiz_results`; all nulls/notices are preserved. Topic status is not an individual quiz color. Summary `quizzes_*` fields count compatible attempts. Notices are recomputed, not new persisted UI flags.
2. **P6:** Committed attempt/explicit review + failed cached-aggregate update returns authoritative success when projection is available. A failed source write propagates; previous saved result remains. Do not manufacture client correctness from pending requests. GET/list/summary recalculate from saved sources even if aggregate cache stayed stale.
3. **P7:** Reuse `MemoryMongo`, `make_store`, `make_quiz`, `attempt`, and constants in `server/tests/test_revision_mongo.py` as deterministic inputs or mirror their fixtures. Do not use a live database. GET/list batch reads include one query per collection across the whole revision/page, summary adds only one original comparison query. Verify facades/router against these real repository methods.
4. **P7:** Missing explicit field permits reviewed-only legacy inference; present null forbids it. GET retains historical stored completion; validated progress write clears disproven completion before new source evidence and persists projected completion. Legacy quiz status is not rewritten by quiz submissions; this keeps `legacy_review_required` discoverable.
5. **P7:** New revision sequence uses max stored **node-wide** `attempt_number` + 1; counts remain compatible revision/node/quiz-local, latest ties break by ID. Original history/mastery matches null-or-absent revision scope, while revision restoration matches exact revision ID.
6. **P7:** Migration mapper needed no production change: `dict(row)` and `SELECT *` retain absent/null/explicit review fields and IDs/numbers/options; tests exercise real temporary SQL migration, repeat upserts, incompatible retention, and repository re-entry. No broader migration/checkpoint work was done.
7. **Blocker:** Existing Mongo `custom_topic_count` regression failures are outside P3 behavioral scope; report their exact command and seven errors. Request owner/orchestrator resolution before asserting the full P3 repository exit passed. If actual P2 API/error mapping or P1 projection conflicts emerge, pause and report; do not silently edit their files.

## Planner self-review

- All six code tasks contain actual failing test code, exact red commands, executable minimal implementation snippets, green commands, owned paths, and atomic commit messages.
- Migration characterization that already passes is explicitly distinguished from the failing migration-to-repository round-trip; no unnecessary migration production refactor is planned.
- Plan has clean Markdown Goal/Architecture/Tech Stack header. The only source banner is inside the required new Python test snippet.
- No researcher, reviewer, live storage, new dependency, storage-selection change, shared contract change, or P2/P4–P7 implementation is planned.
- Baseline blocker is documented, not suppressed. The orchestrator receives the handoff in the worker response rather than being required to read this plan.
