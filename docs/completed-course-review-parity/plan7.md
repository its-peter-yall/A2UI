# P7 — Integrated Acceptance and Verification Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Load `test-driven-development` too. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demonstrate completed-course review parity with genuine A1–A20 assertions, equivalent SQLite/Mongo contracts, a separate >80% new-client-unit coverage gate, and disposable desktop/mobile browser evidence.

**Architecture:** Run after P2, P3, and **P6 are completed, verified, committed, and handed off**. Compose the actual repositories, repository facade, FastAPI router serialization, and actual revision components/hooks with a real QueryClient and router; fake only external transport and Mongo collections. P7 creates tests, test infrastructure, and evidence, never production fixes.

**Tech Stack:** Python stdlib unittest/sqlite3/tempfile, existing FastAPI TestClient/Pydantic v2, the existing query-aware `MemoryMongo`, React 19, React Router, TanStack Query, Testing Library, Vitest 3.2.4/V8, and OpenChamber browser tools.

---

## Preconditions, ownership, and truthful TDD

Read `AGENTS.md`, all seven `docs/{ARCHITECTURE,STACK,TESTING,CONVENTIONS,STRUCTURE,INTEGRATIONS,CONCERNS}.md`, `goal.md` **in full**, and `state.md` (P7, acceptance table, handoffs, baseline, verification table). These specifications govern this plan. No dependencies, authentication changes, live Atlas, or provider calls are needed.

Only create/change these six files:

| Path | Responsibility |
| --- | --- |
| `server/tests/revision_acceptance_helpers.py` | Disposable, deterministic data; SQLite-to-Mongo mirroring; actual serialized wire fixtures; disposable browser app |
| `server/tests/test_revision_repository_parity.py` | Same action transcripts and preservation assertions against both real adapters |
| `server/tests/test_revision_acceptance.py` | Actual HTTP validation, response contracts, no-write failures, preservation |
| `client/src/features/learning/__tests__/completedCourseReviewParity.test.tsx` | Real page/card/feedback/chat/history integration; transport doubles only |
| `client/vitest.revision.config.ts` | Separate per-file 81% V8 coverage gate |
| `docs/completed-course-review-parity/verification.md` | Actual commands/results, acceptance map, browser observations, defects |

Screenshot captures are evidence explicitly requested by the goal: save them directly in `docs/completed-course-review-parity/`, with the four filenames in Task 8. Do not add an evidence subdirectory, generated fixture files, DB files, or extra source modules. Keep stdout fixtures in memory. Never modify `client/package.json`, `client/vite.config.ts`, an existing generation coverage config, producer tests, `state.md`, or `final_report.md`.

### Start/defect gate

* P6 is still being planned when this plan is authored. Read its **completed handoff** and final public markup/API calls before executing, not its in-progress working diff. The tests below use the stable P1 contract and P4/P5 accessible labels. If P6 uses different legitimate progress wording, change only a test selector to match its actual accessible label; do not weaken an assertion or invent a production prop.
* Run `git status --short`, `git diff --name-only`, and `git diff --cached --name-only` before editing. Preserve foreign changes. No reset/checkout/stash/drop/broad deletion.
* Newly supplied infrastructure must have a real RED first: tests import/call an absent **test helper**, then that helper is implemented. This is test-infrastructure TDD, **not** a claim that already-completed P1–P6 production code failed. Record that distinction. Already-supported behavioral tests can pass on their first run: record first-run GREEN honestly, not a manufactured RED. No `expect(false).toBe(true)`, deliberate production sabotage, skip, xfail, or mock asserting its own fake rendering.
* If a behavioral assertion fails after infrastructure exists: retain the failing regression in P7, report criterion, command, actual/expected output, adapter/route and fixture to the orchestrator. Request the owning worker to load `systematic-debugging` and `test-driven-development`, reproduce/fix/commit in **its** owned paths, report the hash, then rerun this test and affected/full gates. P1 owns schemas/projection; P2 SQLite/router; P3 Mongo/migration; P4 card/feedback/quiz; P5 chat/layout/lifecycle; P6 page/cache/summary/history/API client. **P7 never fixes production.** A shared-contract change blocks downstream execution pending coordinated ownership/handoff.
* Existing `TableOfContentsModal.tsx` is not owned by P7 (or P6's listed files). A16 requires actual revision completion labels, not `Mastered`. If P6 cannot achieve this with its owned composition, flag an ownership amendment to the orchestrator; do not edit that file here or omit the assertion.
* Vitest/Vite's ESM config loader requires a default config export. Official Vitest 3.2.4 examples and the existing generation config use that form, whereas `AGENTS.md` says no default exports. **Obtain an explicit config-only exception before Task 7**. The default export below is not an unannounced convention change; if declined, report Task 7 blocked rather than circumvent the loader or weaken the gate. All feature/test functions remain named/local.

### Commit procedure (every task)

Execute from `D:/Peter/Personal Stuffs/A2UI`. Set `$paths` to exactly the task's listed commit paths and `$message` to its exact message. Use this block for each commit (no blanket staging):

```powershell
$mutex = [System.Threading.Mutex]::new(
  $false, 'Local\A2UI_completed_course_review_parity_git'
)
$held = $false
try {
  try { $held = $mutex.WaitOne() }
  catch [System.Threading.AbandonedMutexException] { $held = $true }
  if (@(git diff --cached --name-only).Count -ne 0) {
    throw 'Foreign staged changes: STOP and coordinate; do not unstage them.'
  }
  git add -- $paths
  if ($LASTEXITCODE -ne 0) { throw 'Path-scoped staging failed' }
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace check failed' }
  git diff --cached --stat
  git diff --cached -- $paths
  git commit -m $message
  if ($LASTEXITCODE -ne 0) { throw 'Commit failed; inspect without resetting' }
} finally {
  if ($held) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
```

Do not hold the mutex while running tests/browser actions. Report checkpoint summaries and hashes to the orchestrator; it adds non-overwriting git notes/bookkeeping, avoiding concurrent notes updates.

## Task 1: Deterministic disposable adapters and fixture self-test

**Files:** Create `server/tests/test_revision_repository_parity.py`; create `server/tests/revision_acceptance_helpers.py`.

- [ ] **Step 1 — Write this exact fixture consumer before creating the helper.**

```python
"""
============================================================================
FILE: test_revision_repository_parity.py
LOCATION: server/tests/test_revision_repository_parity.py
============================================================================
PURPOSE:
    Compare revision behavior on disposable SQLite and deterministic Mongo.
ROLE IN PROJECT:
    P7 cross-adapter acceptance; no live storage or provider dependencies.
    - Exercise real repositories with identical seeded rows
    - Preserve original course records and append-only attempts
KEY COMPONENTS:
    - RevisionRepositoryParityTests: Shared behavioral contracts
============================================================================
"""
from __future__ import annotations

import unittest

from server.schemas.learning import RevisionSessionWithProgress
from server.tests.revision_acceptance_helpers import AcceptanceFixture


class RevisionRepositoryParityTests(unittest.TestCase):
    def test_fixture_adapters_start_with_equivalent_contracts(self) -> None:
        with AcceptanceFixture("quiz_only") as fixture:
            responses = [
                RevisionSessionWithProgress.model_validate(
                    repo.get_revision_session(fixture.revision_id)
                ).model_dump(mode="json")
                for repo in fixture.repositories.values()
            ]
            self.assertEqual(responses[0], responses[1])
            self.assertEqual(responses[0]["nodes"][0]["quiz_count"], 2)
            self.assertEqual(responses[0]["nodes"][0]["quiz_results"], [])
            self.assertEqual(responses[0]["progress_percent"], 0)
            self.assertIsNone(responses[0]["total_quiz_score_percent"])
            self.assertNotEqual(fixture.db_path.name, "a2ui.db")


def main() -> None:
    unittest.main()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2 — RED (root).**

`server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_repository_parity -v`

Expected nonzero: `ModuleNotFoundError` for the new fixture module. Record this as infrastructure RED, not a behavioral failure.

- [ ] **Step 3 — Implement only the helper below.** Reuse upstream **fixtures**, not upstream TestCase subclasses/test methods. The Mongo double evaluates queries and updates actual in-memory records; it never returns canned revision results. Every SQLite connection closes. Dates/UUIDs are fixed inside scoped patches; no patch survives fixture teardown.

```python
"""
============================================================================
FILE: revision_acceptance_helpers.py
LOCATION: server/tests/revision_acceptance_helpers.py
============================================================================
PURPOSE:
    Build deterministic disposable acceptance data and serialized fixtures.
ROLE IN PROJECT:
    P7 test-only bridge between repository, route, client, and browser gates.
    - Never opens the user's database or calls a provider
    - Reuse query-aware Mongo collections from P3
KEY COMPONENTS:
    - AcceptanceFixture: Isolated SQLite and mirrored Mongo repositories
    - frozen_writes: Deterministic timestamps and attempt identifiers
============================================================================
"""
from __future__ import annotations

import copy
import itertools
import json
import sqlite3
from contextlib import ExitStack, closing, contextmanager
from datetime import datetime
from typing import Iterator
from unittest.mock import patch
from uuid import UUID

from server.database.repositories.mongo_learning import (
    MongoLearningRepository,
)
from server.database.repositories.sqlite import SqliteLearningRepository
from server.tests.test_revision_mongo import MemoryMongo
from server.tests.test_revision_sqlite import (
    FIRST, SECOND, START, THIRD, RevisionSqliteFixture, make_quiz,
)


@contextmanager
def frozen_writes(timestamp: str, first_id: int = 100) -> Iterator[None]:
    """Freeze local write clocks and UUIDs; restore them on exit."""
    instant = datetime.fromisoformat(timestamp)

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return instant if tz is None else instant.astimezone(tz)

    counter = itertools.count(first_id)
    with ExitStack() as stack:
        stack.enter_context(patch(
            "server.database.learning_persistence.datetime", FixedDatetime
        ))
        stack.enter_context(patch(
            "server.database.repositories.mongo_learning.utc_iso",
            return_value=timestamp,
        ))
        stack.enter_context(patch(
            "uuid.uuid4", side_effect=lambda: UUID(int=next(counter))
        ))
        yield


class AcceptanceFixture(RevisionSqliteFixture):
    """Identical seed data behind actual adapters; temp database only."""

    def __init__(self, mode: str = "quiz_only") -> None:
        self.mode = mode

    def __enter__(self):
        with frozen_writes(START, 1):
            self.open_fixture()
            self.execute(
                "UPDATE concept_nodes SET title = ?, content_markdown = ? "
                "WHERE id = ?",
                ("Topic A", "# Foundations\n\nOriginal paragraph.\n\n"
                 "## Curiosity Spark\n- Why study A?", self.node),
            )
            self.manager.create_quiz_attempt(self.node, ["q0-1"], 0)
            self.revision_id = self.revision(self.mode)
        self.refresh_mongo()
        self.repositories = {
            "sqlite": SqliteLearningRepository(self.manager),
            "mongo": self.mongo_repo,
        }
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self.close_fixture()

    def refresh_mongo(self) -> None:
        """Mirror all raw columns, not projected/canned response objects."""
        self.mongo = MemoryMongo()
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.row_factory = sqlite3.Row
            for table in (
                "learning_sessions", "concept_nodes", "quiz_data",
                "revision_sessions", "revision_node_progress", "quiz_attempts",
            ):
                for row in connection.execute(f"SELECT * FROM {table}"):
                    document = dict(row)
                    document["_id"] = document.pop("id")
                    for key in ("payload", "key_terms", "selected_option_id"):
                        value = document.get(key)
                        if isinstance(value, str):
                            try:
                                document[key] = json.loads(value)
                            except json.JSONDecodeError:
                                document[key] = value
                    self.mongo.rows[table].append(document)
        self.mongo_repo = MongoLearningRepository(self.mongo)
        if hasattr(self, "repositories"):
            self.repositories["mongo"] = self.mongo_repo

    def raw_snapshot(self, backend: str, original: bool = False) -> dict:
        """Read all raw records, including original timestamps and quiz seed."""
        if backend == "sqlite":
            return self.snapshot(original_only=original)
        names = ("learning_sessions", "concept_nodes", "quiz_data")
        if not original:
            names += (
                "revision_sessions", "revision_node_progress", "quiz_attempts",
            )
        return {name: copy.deepcopy(self.mongo.rows[name]) for name in names}
```

- [ ] **Step 4 — GREEN (root).** Repeat the Step 2 command; expect one genuine fixture-contract test, exit 0. If mirroring reveals backend drift, report to P2/P3 rather than normalize substantive differences out of the assertion.
- [ ] **Step 5 — Commit.** Paths: both Task 1 files. Message: `test(review-parity): add deterministic disposable adapter fixtures`.

## Task 2: Shared transcripts, legacy parity, invalid writes, original isolation

**Files:** Modify the two Task 1 files only.

- [ ] **Step 1 — Append these exact tests and add `run_transcript` to the helper import.** Place methods inside `RevisionRepositoryParityTests`, before `main()`. The new helper is absent initially.

```python
    def test_both_modes_share_transcripts_and_preserve_originals(self) -> None:
        for mode in ("full_review", "quiz_only"):
            transcripts = []
            for backend in ("sqlite", "mongo"):
                with self.subTest(mode=mode, backend=backend):
                    with AcceptanceFixture(mode) as fixture:
                        repo = fixture.repositories[backend]
                        original = fixture.raw_snapshot(backend, True)
                        history = repo.get_quiz_attempts(fixture.node)
                        mastered = repo.check_mastery(fixture.node)
                        result = run_transcript(fixture, backend)
                        transcripts.append(result)
                        self.assertEqual(result["partial"]["progress_percent"], 0)
                        self.assertEqual(result["partial"]["nodes"][0]
                                         ["status"], "pending")
                        complete = result["complete"]
                        self.assertEqual(complete["progress_percent"], 100)
                        self.assertEqual(complete["total_quiz_score_percent"], 50)
                        self.assertEqual([a["is_correct"] for a in
                                          complete["nodes"][0]["quiz_results"]],
                                         [True, False])
                        wrong = complete["nodes"][0]["quiz_results"][1]
                        self.assertEqual(wrong["correct_option_ids"], [])
                        self.assertEqual(wrong["explanation"], "")
                        self.assertEqual(wrong["selected_option_ids"], ["q1-1"])
                        self.assertEqual(result["retry"]["progress_percent"], 100)
                        self.assertEqual(result["retry"]
                                         ["total_quiz_score_percent"], 66)
                        self.assertEqual(result["retry"]["completed_at"],
                                         complete["completed_at"])
                        self.assertEqual(result["retry"]["nodes"][0]
                                         ["quiz_results"][1]
                                         ["quiz_attempt_count"], 2)
                        summary = result["summary"]
                        self.assertEqual((summary["quizzes_passed"],
                                          summary["quizzes_failed"],
                                          summary["quizzes_total"]), (2, 1, 3))
                        self.assertEqual(summary["comparison"], {
                            "original_quiz_score_percent": 0,
                            "improvement_percent": 66,
                        })
                        for payload in (summary, result["listed"]):
                            self.assertEqual(payload["progress_percent"], 100)
                            self.assertEqual(payload
                                             ["total_quiz_score_percent"], 66)
                        if mode == "full_review":
                            self.assertEqual(result["first_review"],
                                             result["second_review"])
                            self.assertEqual(complete["nodes"][0]["status"],
                                             "reviewed")
                            self.assertEqual(result["retry"]["nodes"][0]
                                             ["content_reviewed_at"],
                                             result["first_review"]
                                             ["content_reviewed_at"])
                        else:
                            self.assertEqual(complete["nodes"][0]["status"],
                                             "quiz_failed")
                            self.assertIsNone(complete["nodes"][0]
                                              ["content_reviewed_at"])
                        self.assertEqual(fixture.raw_snapshot(backend, True),
                                         original)
                        self.assertEqual(repo.get_quiz_attempts(fixture.node),
                                         history)
                        self.assertEqual(repo.check_mastery(fixture.node),
                                         mastered)
                        fresh = repo.create_revision_session(
                            fixture.session, mode
                        )
                        self.assertEqual(fresh["nodes"][0]["quiz_results"], [])
                        if backend == "mongo":
                            fixture.mongo.client.start_session.assert_not_called()
            self.assertEqual(transcripts[0], transcripts[1])

    def test_invalid_repository_actions_have_no_writes(self) -> None:
        for backend in ("sqlite", "mongo"):
            with AcceptanceFixture() as fixture:
                repo = fixture.repositories[backend]
                for rid, node, ids, index in (
                    ("missing", fixture.node, ["q0-0"], 0),
                    (fixture.revision_id, "foreign", ["q0-0"], 0),
                    (fixture.revision_id, fixture.node, ["q0-0"], -1),
                    (fixture.revision_id, fixture.node, ["q0-0"], 2),
                    (fixture.revision_id, fixture.node, ["A"], 0),
                    (fixture.revision_id, fixture.node, ["q1-0"], 0),
                    (fixture.revision_id, fixture.node, [], 0),
                    (fixture.revision_id, fixture.node, ["q0-0", "q0-0"], 0),
                ):
                    with self.subTest(backend=backend, ids=ids, index=index):
                        before = fixture.raw_snapshot(backend)
                        with self.assertRaises((LookupError, ValueError)):
                            repo.submit_revision_quiz(rid, node, ids, index)
                        self.assertEqual(fixture.raw_snapshot(backend), before)
                before = fixture.raw_snapshot(backend)
                with self.assertRaises(ValueError):
                    repo.mark_revision_node_reviewed(
                        fixture.revision_id, fixture.node
                    )
                self.assertEqual(fixture.raw_snapshot(backend), before)

    def test_legacy_partial_and_incompatible_attempts_are_not_rewritten(
        self,
    ) -> None:
        for backend in ("sqlite", "mongo"):
            with AcceptanceFixture() as fixture:
                fixture.seed_attempt(fixture.revision_id, 4, 0, "q0-0", True)
                fixture.seed_attempt(fixture.revision_id, 9, 9, "q0-0", True)
                fixture.seed_attempt(fixture.revision_id, 10, 1, "gone", False)
                fixture.execute(
                    "UPDATE revision_sessions SET status = 'completed', "
                    "progress_percent = 100, completed_at = ? WHERE id = ?",
                    ("2099-01-01T00:00:00Z", fixture.revision_id),
                )
                fixture.execute(
                    "UPDATE revision_node_progress SET status = 'quiz_passed', "
                    "reviewed_at = ? WHERE revision_session_id = ?",
                    ("2026-10-05T10:00:00Z", fixture.revision_id),
                )
                fixture.refresh_mongo()
                repo = fixture.repositories[backend]
                before = fixture.raw_snapshot(backend)
                restored = repo.get_revision_session(fixture.revision_id)
                self.assertEqual(restored["status"], "in_progress")
                self.assertIsNone(restored["completed_at"])
                self.assertEqual(restored["progress_percent"], 0)
                self.assertEqual(restored["total_quiz_score_percent"], 100)
                self.assertEqual([r["quiz_index"] for r in restored["nodes"][0]
                                  ["quiz_results"]], [0])
                self.assertIn("completion_recalculated", [
                    notice["code"] for notice in restored["notices"]
                ])
                self.assertEqual(sum(n["attempt_count"] for n in
                                     restored["notices"] if n["code"] ==
                                     "incompatible_attempts"), 2)
                self.assertEqual(fixture.raw_snapshot(backend), before)

    def test_zero_quiz_and_empty_revisions_never_auto_complete(self) -> None:
        for backend in ("sqlite", "mongo"):
            for mode in ("full_review", "quiz_only"):
                with AcceptanceFixture(mode) as fixture:
                    fixture.execute("DELETE FROM quiz_data")
                    fixture.refresh_mongo()
                    repo = fixture.repositories[backend]
                    revision = repo.get_revision_session(fixture.revision_id)
                    summary = repo.get_revision_summary(fixture.revision_id)
                    self.assertEqual(revision["nodes"][0]["quiz_count"], 0)
                    self.assertEqual(revision["status"], "in_progress")
                    self.assertEqual(summary["progress_percent"], 0)
                    self.assertIsNone(summary["total_quiz_score_percent"])
                    self.assertEqual(summary["nodes_total"],
                                     1 if mode == "full_review" else 0)
                    if mode == "full_review":
                        repo.mark_revision_node_reviewed(
                            fixture.revision_id, fixture.node
                        )
                        self.assertEqual(repo.get_revision_session(
                            fixture.revision_id
                        )["status"], "completed")
                with AcceptanceFixture(mode) as fixture:
                    fixture.execute("DELETE FROM revision_node_progress")
                    fixture.refresh_mongo()
                    repo = fixture.repositories[backend]
                    revision = repo.get_revision_session(fixture.revision_id)
                    self.assertEqual(revision["nodes"], [])
                    self.assertEqual(revision["status"], "in_progress")
                    self.assertIsNone(revision["completed_at"])

    def test_multi_select_evaluation_is_exact_with_stable_ids(self) -> None:
        from server.schemas.learning import QuizSet
        from server.tests.test_revision_sqlite import make_quiz

        for backend in ("sqlite", "mongo"):
            with AcceptanceFixture() as fixture:
                fixture.execute(
                    "UPDATE quiz_data SET payload = ?",
                    (QuizSet(quizzes=[make_quiz("q0", True)])
                     .model_dump_json(),),
                )
                fixture.refresh_mongo()
                repo = fixture.repositories[backend]
                wrong = repo.submit_revision_quiz(
                    fixture.revision_id, fixture.node, ["q0-0"], 0
                )
                self.assertFalse(wrong["is_correct"])
                self.assertEqual(wrong["correct_option_ids"], [])
                correct = repo.submit_revision_quiz(
                    fixture.revision_id, fixture.node, ["q0-2", "q0-0"], 0
                )
                self.assertTrue(correct["is_correct"])
                self.assertEqual(correct["selected_option_ids"],
                                 ["q0-2", "q0-0"])
                self.assertEqual(correct["correct_option_ids"],
                                 ["q0-0", "q0-2"])
```

- [ ] **Step 2 — RED (root).** `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_repository_parity -v`; expect import failure for `run_transcript` (infrastructure RED).
- [ ] **Step 3 — Append this minimal transcript helper and imports.** No production changes. Preserve dynamic identifiers/timestamps by fixing writes, not by deleting fields from parity comparisons.

```python
from server.schemas.learning import (
    RevisionSessionResponse, RevisionSessionWithProgress, RevisionSummary,
)


def run_transcript(fixture: AcceptanceFixture, backend: str) -> dict:
    """Execute the identical revision action sequence against one adapter."""
    repo = fixture.repositories[backend]
    rid, node = fixture.revision_id, fixture.node
    result = {}

    def restore() -> dict:
        return RevisionSessionWithProgress.model_validate(
            repo.get_revision_session(rid)
        ).model_dump(mode="json")

    with frozen_writes(FIRST, 100):
        repo.submit_revision_quiz(rid, node, ["q0-0"], 0)
        result["partial"] = restore()
        if fixture.mode == "full_review":
            result["first_review"] = repo.mark_revision_node_reviewed(rid, node)
            result["second_review"] = repo.mark_revision_node_reviewed(rid, node)
    with frozen_writes(SECOND, 200):
        repo.submit_revision_quiz(rid, node, ["q1-1"], 1)
        result["complete"] = restore()
    with frozen_writes(THIRD, 300):
        repo.submit_revision_quiz(rid, node, ["q1-0"], 1)
        result["retry"] = restore()
    result["summary"] = RevisionSummary.model_validate(
        repo.get_revision_summary(rid)
    ).model_dump(mode="json")
    result["listed"] = RevisionSessionResponse.model_validate(
        repo.get_revisions_for_session(fixture.session)[0][0]
    ).model_dump(mode="json")
    return result
```

- [ ] **Step 4 — GREEN (root).** Repeat Step 2; expect six tests total and exit 0. Also run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite server.tests.test_revision_mongo server.tests.test_migrate_to_mongo -v`. Preserve these upstream assertions as genuine evidence for legacy one-time SQLite migration, Mongo absent-vs-null review inference, stable latest tie-break, legacy scalar/single-quiz restoration, and interrupted aggregate recovery; cite exact test names in Task 9, not just their suite count.
- [ ] **Step 5 — Commit.** Paths: both Task 1 files. Message: `test(review-parity): prove equivalent revision adapter transcripts`.

## Task 3: Actual serialized HTTP acceptance and an in-memory wire bridge

**Files:** Create `server/tests/test_revision_acceptance.py`; modify `server/tests/revision_acceptance_helpers.py`.

- [ ] **Step 1 — Write the following test file before implementing `route_client`/`wire_fixture`.**

```python
"""
============================================================================
FILE: test_revision_acceptance.py
LOCATION: server/tests/test_revision_acceptance.py
============================================================================
PURPOSE:
    Assert real serialized revision routes against both storage adapters.
ROLE IN PROJECT:
    P7 cross-layer acceptance with disposable data and credential-free writes.
    - Validate HTTP errors and every attempt field
    - Provide actual route payloads for client rendering tests
KEY COMPONENTS:
    - RevisionAcceptanceTests: Serialized contracts and preservation
============================================================================
"""
from __future__ import annotations

import unittest

from server.schemas.learning import RevisionQuizSubmissionResult
from server.tests.revision_acceptance_helpers import (
    AcceptanceFixture, route_client, wire_fixture,
)


ATTEMPT_KEYS = {
    "id", "revision_session_id", "node_id", "quiz_index", "attempt_number",
    "quiz_attempt_count", "selected_option_ids", "is_correct", "score_percent",
    "correct_option_ids", "explanation", "selected_explanation", "created_at",
    "revision_node_status",
}


class RevisionAcceptanceTests(unittest.TestCase):
    def test_serialized_contracts_and_wire_fixture(self) -> None:
        for backend in ("sqlite", "mongo"):
            for mode in ("full_review", "quiz_only"):
                wire = wire_fixture(backend, mode)
                for attempt in wire["submissions"]:
                    self.assertEqual(set(attempt), ATTEMPT_KEYS)
                    RevisionQuizSubmissionResult.model_validate(attempt)
                    self.assertEqual(attempt["revision_session_id"],
                                     wire["initial"]["id"])
                    self.assertEqual(attempt["node_id"],
                                     wire["original"]["nodes"][0]["id"])
                self.assertEqual(wire["mixed"]["nodes"][0]["quiz_results"], [
                    {k: v for k, v in attempt.items()
                     if k != "revision_node_status"}
                    for attempt in wire["submissions"][:2]
                ])
                self.assertEqual(wire["retry"]["total_quiz_score_percent"], 66)
                self.assertEqual(wire["summary_retry"]["quizzes_total"], 3)
                self.assertEqual(wire["fresh"]["nodes"][0]["quiz_results"], [])
                self.assertEqual(wire["original_before"], wire["original_after"])

    def test_http_errors_write_nothing_on_both_adapters(self) -> None:
        for backend in ("sqlite", "mongo"):
            with AcceptanceFixture() as fixture:
                with route_client(fixture, backend) as client:
                    base = (f"/learning/revisions/{fixture.revision_id}/nodes/"
                            f"{fixture.node}/submit-quiz")
                    for url, body, status in (
                        (base, {}, 422),
                        (base, {"selected_option_ids": []}, 422),
                        (base, {"selected_option_ids": ["q0-0"],
                                "quiz_index": -1}, 422),
                        (base, {"selected_option_ids": ["q0-0"],
                                "quiz_index": 2}, 400),
                        (base, {"selected_option_ids": ["A"]}, 400),
                        (base, {"selected_option_ids": ["q0-0", "q0-0"]}, 400),
                        (base.replace(fixture.node, "foreign"),
                         {"selected_option_ids": ["q0-0"]}, 404),
                        (base.replace(fixture.revision_id, "missing"),
                         {"selected_option_ids": ["q0-0"]}, 404),
                    ):
                        with self.subTest(backend=backend, body=body):
                            before = fixture.raw_snapshot(backend)
                            response = client.post(url, json=body)
                            self.assertEqual(response.status_code, status,
                                             response.text)
                            self.assertEqual(fixture.raw_snapshot(backend), before)
                    self.assertEqual(client.get(
                        "/learning/revisions/missing"
                    ).status_code, 404)

    def test_real_foreign_course_membership_cannot_authorize_a_write(
        self,
    ) -> None:
        from server.schemas.learning import NodeStatus
        from server.tests.test_revision_sqlite import make_quiz

        for backend in ("sqlite", "mongo"):
            with AcceptanceFixture() as fixture:
                session = fixture.manager.create_learning_session("Other", "Other")
                foreign = fixture.manager.create_concept_node(
                    session["id"], 0, "Foreign", "Unchanged", NodeStatus.COMPLETED,
                    quiz=make_quiz("foreign"),
                )["id"]
                fixture.execute(
                    "INSERT INTO revision_node_progress "
                    "(id, revision_session_id, node_id, status) "
                    "VALUES (?, ?, ?, ?)",
                    ("foreign-progress", fixture.revision_id, foreign, "pending"),
                )
                fixture.refresh_mongo()
                with route_client(fixture, backend) as client:
                    before = fixture.raw_snapshot(backend)
                    response = client.post(
                        f"/learning/revisions/{fixture.revision_id}/nodes/"
                        f"{foreign}/submit-quiz",
                        json={"selected_option_ids": ["foreign-0"],
                              "quiz_index": 0},
                    )
                    self.assertIn(response.status_code, (400, 404), response.text)
                    self.assertEqual(fixture.raw_snapshot(backend), before)


def main() -> None:
    unittest.main()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2 — RED (root).** `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_acceptance -v`; expect missing helper import (infrastructure RED).
- [ ] **Step 3 — Add these helper imports/functions.** The wire exporter uses actual TestClient JSON responses, not model dumps substituted for HTTP. The original course has one quiz topic plus a quizless Topic B (for carousel/fallback/denominator checks). Both modes retain identical course content. Full Review must explicitly review **both** topics; Practice excludes B. CLI output contains fictional fixture records only.

```python
import argparse
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.database.repositories.facade import RepositoryFacade
from server.routers.learning import router
from server.schemas.learning import NodeStatus


@contextmanager
def route_client(fixture: AcceptanceFixture, backend: str):
    """Actual router and late-bound facade; isolated external read ports."""
    app = FastAPI()
    app.include_router(router)
    facade = RepositoryFacade(lambda: fixture.repositories[backend])
    with ExitStack() as stack:
        stack.enter_context(patch(
            "server.routers.learning.learning_manager", facade
        ))
        stack.enter_context(patch(
            "server.routers.learning.generation_job_store",
            SimpleNamespace(to_public_by_session=lambda _: None),
        ))
        stack.enter_context(patch(
            "server.routers.learning.research_store",
            SimpleNamespace(get_citations_by_session=lambda _: {}),
        ))
        yield stack.enter_context(TestClient(app, raise_server_exceptions=False))


def wire_fixture(backend: str, mode: str) -> dict:
    """Capture real response bodies for page acceptance; no files written."""
    with AcceptanceFixture(mode) as fixture:
        with frozen_writes(START, 20):
            second = fixture.manager.create_concept_node(
                fixture.session, 1, "Topic B", "# Plain heading\n\n"
                "Fallback paragraph without curiosity.", NodeStatus.COMPLETED,
            )["id"]
            fixture.execute(
                "INSERT INTO revision_node_progress "
                "(id, revision_session_id, node_id, status) "
                "VALUES (?, ?, ?, 'pending')",
                ("reading-progress", fixture.revision_id, second),
            )
        fixture.refresh_mongo()
        with route_client(fixture, backend) as client:
            rid = fixture.revision_id
            base = f"/learning/revisions/{rid}"

            def get(url: str) -> dict:
                response = client.get(url)
                if response.status_code != 200:
                    raise AssertionError(response.text)
                return response.json()

            def submit(index: int, option: str, timestamp: str, number: int):
                with frozen_writes(timestamp, number):
                    response = client.post(
                        f"{base}/nodes/{fixture.node}/submit-quiz",
                        json={"selected_option_ids": [option],
                              "quiz_index": index},
                    )
                if response.status_code != 200:
                    raise AssertionError(response.text)
                return response.json()

            result = {
                "original": get(f"/learning/sessions/{fixture.session}"),
                "initial": get(base),
                "original_before": fixture.raw_snapshot(backend, True),
            }
            first = submit(0, "q0-0", FIRST, 100)
            result["partial"] = get(base)
            second_attempt = submit(1, "q1-1", SECOND, 200)
            result["before_review"] = get(base)
            result["reviews"] = []
            if mode == "full_review":
                for node in (fixture.node, second):
                    with frozen_writes(SECOND, 250):
                        response = client.post(f"{base}/nodes/{node}/mark-reviewed")
                    if response.status_code != 200:
                        raise AssertionError(response.text)
                    result["reviews"].append(response.json())
            result["mixed"] = get(base)
            result["summary_mixed"] = get(f"{base}/summary")
            retry = submit(1, "q1-0", THIRD, 300)
            result["retry"] = get(base)
            result["summary_retry"] = get(f"{base}/summary")
            result["listed"] = get(
                f"/learning/sessions/{fixture.session}/revisions"
            )
            with frozen_writes(THIRD, 400):
                response = client.post(
                    f"/learning/sessions/{fixture.session}/revisions",
                    json={"mode": mode},
                )
            if response.status_code != 201:
                raise AssertionError(response.text)
            result["fresh"] = get(f"/learning/revisions/{response.json()['id']}")
            result["submissions"] = [first, second_attempt, retry]
            result["original_after"] = fixture.raw_snapshot(backend, True)
            return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wire", action="store_true")
    args = parser.parse_args()
    if not args.wire:
        parser.error("Choose --wire; browser serving uses the ASGI factory")
    print(json.dumps({mode: wire_fixture("sqlite", mode)
                      for mode in ("full_review", "quiz_only")}))


if __name__ == "__main__":
    main()
```

Consolidate imports at the top in repository order; retain one `main()` at the end as later tasks extend this module. Use `Optional`/typed public signatures when expanding helpers; do not introduce unrelated linter fixes.

- [ ] **Step 4 — GREEN (root).** Repeat Step 2 and run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_repository_parity server.tests.test_revision_acceptance -v`; expect nine tests, exit 0. Also run `server/.venv/Scripts/python.exe -m server.tests.revision_acceptance_helpers --wire`; stdout must be one valid JSON object and no secrets. Logging may appear on stderr. Verify each wire result has actual node/revision identity and score/timestamps.
- [ ] **Step 5 — Commit.** Paths: `server/tests/test_revision_acceptance.py`, `server/tests/revision_acceptance_helpers.py`. Message: `test(review-parity): verify real serialized routes on both adapters`.

## Task 4: Real component/query/router acceptance, immediate disclosure in both modes

**File:** Create `client/src/features/learning/__tests__/completedCourseReviewParity.test.tsx`.

- [ ] **Step 1 — Write the header/imports and these tests before adding `mountRevision`.** The source-level banner belongs **inside this source file**, not at the start of this Markdown plan.

```tsx
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
```

- [ ] **Step 2 — RED (`client/`).** `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx -t 'A1/A2/A3'`; expect `mountRevision is not defined` (infrastructure RED). Do not build until Step 3 adds the typed helper.
- [ ] **Step 3 — Add the typed wire decoder, transport boundary, and mounting helper below the imports, before tests.** Keep `RevisionPage`, its hooks, cards, quiz section, feedback, curiosity, Markdown, summary, history, ChatPanel, layout, and chat hooks **REAL**. Do not mock the router or QueryClient. The transport invokes only actual serialized fixtures captured in Task 3. Mutation promises/refetches can be held separately so immediate-feedback assertions are meaningful.

```tsx
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
```

No casts, implicit fixture type assertions, non-null assertions, or suppressed type errors. The guard validates **required response shape** and nullability; the server tests enforce exact response keys. This connects serialized route bodies to frontend interfaces and then real rendering. Keep real motion unless jsdom proves a limitation; use `waitFor` for exits/transitions rather than mocking UI semantics.

- [ ] **Step 4 — GREEN (`client/`).** Repeat Step 2; expect both mode cases pass. Run `npm run build` to validate the new test's strict typing. On a contract/selector mismatch inspect actual P6 markup/transport; only adjust selectors for equivalent accessible semantics, never required outcomes.
- [ ] **Step 5 — Commit.** Path: the new acceptance test. Message: `test(review-parity): render serialized quiz feedback in both modes`.

## Task 5: Navigation, restoration, completion, summary and route-race acceptance

**File:** Modify only `client/src/features/learning/__tests__/completedCourseReviewParity.test.tsx`.

- [ ] **Step 1 — Append the exact tests below.** They call absent `completeReading`/`navigateTo` helpers. Tests that do not call them may already pass; do not call that a RED production result.

```tsx
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
    fireEvent.click(screen.getByRole('button', { name: /^Next\s*→$/ }));
    await screen.findByRole('heading', { name: 'Topic B' });
    fireEvent.click(screen.getByRole('button', { name: /^←\s*Previous$/ }));
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
    expect(within(firstSummary).getByText(/correct attempts/i)).toBeInTheDocument();
    expect(within(firstSummary).getByText(/incorrect attempts/i)).toBeInTheDocument();
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
    expect(aRow).toHaveTextContent(mode === 'full_review' ? /Reviewed/ : /Finished|Attempted/);
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
    expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Summary' })).not.toBeInTheDocument();
    expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reading pending');
  });
});
```

- [ ] **Step 2 — RED (`client/`).** `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx -t 'A5/A6|A7/A8/A9/A10/A16|A19'`; missing navigation/reading helpers must fail. Record any genuine producer failures separately.
- [ ] **Step 3 — Add these minimal test actions.** Do not change real components/hooks.

```tsx
async function navigateTo(h: ReturnType<typeof mountRevision>, id: string) {
  await act(async () => { await h.router.navigate(h.route(id)); });
}
async function completeReading() {
  fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
  await waitFor(() => expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reviewed'));
  fireEvent.click(screen.getByRole('button', { name: /^Next\s*→$/ }));
  await screen.findByRole('heading', { name: 'Topic B' });
  fireEvent.click(screen.getByRole('button', { name: 'Mark as Reviewed' }));
  await waitFor(() => expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reviewed'));
  fireEvent.click(screen.getByRole('button', { name: /^←\s*Previous$/ }));
  await screen.findByRole('heading', { name: 'Topic A' });
}
```

First-run GREEN tests remain valuable regression evidence. Do not pretend timestamp fixture equality proves a live client clock: timestamp stability is genuinely asserted on persisted adapter transcripts in Task 2; the client assertion checks the corresponding display contract.

- [ ] **Step 4 — GREEN (`client/`).** `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx`; run all acceptance tests. Read actual header text and add the following concrete assertion within completion testing **using P6's final label**: header shows `2 / 2` reviewed in Full Review or `1 / 1` finished in Practice, never `2 / 2` in Practice with quizless B. Use `screen.getByText(/2\s*\/\s*2.*reviewed/i)` or `screen.getByText(/1\s*\/\s*1.*finished/i)`. If P6 intentionally uses “attempted” instead of “finished”, select that equivalent label; do not drop the denominator/completion assertion. A wrong retry after reading review is covered by Task 2 and the upstream P2/P3 explicitly-independent-reading tests.
- [ ] **Step 5 — Commit.** Path: the acceptance test. Message: `test(review-parity): cover restored navigation completion and route races`.

## Task 6: Real chat lifecycle, stable-ID multi-select, legacy and empty UI

**File:** Modify only `client/src/features/learning/__tests__/completedCourseReviewParity.test.tsx`.

- [ ] **Step 1 — Append these tests before implementing `chatStream` and `seedChat`.** These exercise the real Markdown heading controls, CuriositySpark, ChatPanel, useConceptChat, page controller, and layout. Keep deferred streams abortable and release them in teardown rather than leaving an immortal promise.

```tsx
describe('chat ownership and lifecycle', () => {
  it('A11/A12/A20: repeated prefill never sends; headings and explicit retarget own the conversation', async () => {
    const h = mountRevision('full_review');
    const stream = chatStream();
    seedChat(h.wire.original.id, h.wire.original.nodes[1].id, 'Preserved B history');
    await screen.findByRole('heading', { name: 'Topic A' });
    const question = screen.getByRole('button', { name: 'Why study A?' });
    fireEvent.click(question);
    const composer = await screen.findByRole('textbox', { name: 'Ask a question about this concept' });
    expect(composer).toHaveValue('Why study A?');
    await waitFor(() => expect(composer).toHaveFocus());
    expect(screen.getAllByText('Why study A?')).toHaveLength(1);
    expect(transport.stream).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: 'Different draft' } });
    fireEvent.click(question);
    expect(composer).toHaveValue('Why study A?');
    fireEvent.click(screen.getByRole('button', { name: 'Chat about "Foundations"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(stream.calls).toHaveLength(1));
    expect(stream.calls[0].nodeId).toBe(h.wire.original.nodes[0].id);
    const heading = screen.getByRole('button', { name: 'Chat about "Foundations"' }).closest('[data-heading-id]');
    const headingId = heading?.getAttribute('data-heading-id');
    if (!headingId) throw new Error('Real Markdown heading ID missing');
    expect(stream.calls[0].selectedHeadingIds).toEqual([headingId]);
    fireEvent.click(question);
    expect(composer).toHaveValue('Why study A?');
    expect(transport.stream).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Stop streaming' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Next\s*→$/ }));
    await screen.findByRole('heading', { name: 'Topic B' });
    expect(screen.getByRole('dialog', { name: 'Chat: Topic A' })).toBeInTheDocument();
    expect(stream.calls[0].signal?.aborted).toBe(false);
    expect(screen.getByText('Fallback paragraph without curiosity.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Why study A?' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chat about "Plain heading"' }));
    await screen.findByRole('dialog', { name: 'Chat: Topic B' });
    expect(stream.calls[0].signal?.aborted).toBe(true);
    expect(screen.getByText('Preserved B history')).toBeInTheDocument();
    act(() => { stream.calls[0].onDelta('Forbidden late A delta'); });
    expect(screen.queryByText('Forbidden late A delta')).not.toBeInTheDocument();
    const bComposer = screen.getByRole('textbox');
    fireEvent.change(bComposer, { target: { value: 'B question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(stream.calls).toHaveLength(2));
    expect(stream.calls[1].nodeId).toBe(h.wire.original.nodes[1].id);
    expect(stream.calls[1].selectedHeadingIds).not.toContain(headingId);
    await act(async () => { stream.finish(1, 'B answer'); });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chat: Topic B' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open concept chat' }));
    await screen.findByText('B answer');
    expect(localStorage.getItem(`concept_chat_${h.wire.original.id}_${h.wire.original.nodes[1].id}`)).toContain('B answer');
  });

  it.each<RevisionMode>(['full_review', 'quiz_only'])('A20: %s completion/re-entry preserve chat and expiry still applies', async (mode) => {
    const original = wires[mode].original;
    const key = `concept_chat_${original.id}_${original.nodes[0].id}`;
    seedChat(original.id, original.nodes[0].id, 'Saved through completion');
    const h = mountRevision(mode, wires[mode].mixed);
    await screen.findByRole('button', { name: 'Open concept chat' });
    const opener = screen.getByRole('button', { name: 'Open concept chat' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByText('Saved through completion');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open concept chat' })).toHaveFocus());
    expect(localStorage.getItem(key)).toContain('Saved through completion');
    h.view.unmount();
    seedChat(original.id, original.nodes[0].id, 'Expired fixture history', Date.now() - 3_600_001);
    mountRevision(mode, wires[mode].mixed);
    fireEvent.click(await screen.findByRole('button', { name: 'Open concept chat' }));
    await screen.findByRole('textbox');
    expect(screen.queryByText('Expired fixture history')).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).not.toContain('Expired fixture history');
  });

  it('A13: desktop separator clamps to 25–38 and mobile uses a bounded overlay', async () => {
    const h = mountRevision('quiz_only');
    fireEvent.click(await screen.findByRole('button', { name: 'Open concept chat' }));
    const separator = await screen.findByRole('separator', { name: 'Resize chat panel' });
    expect(separator).toHaveAttribute('aria-valuenow', '25');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '38');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator).toHaveAttribute('aria-valuenow', '38');
    fireEvent.keyDown(separator, { key: 'Home' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '25');
    h.view.unmount();
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      media: query, matches: false, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => true,
    }));
    mountRevision('quiz_only');
    fireEvent.click(await screen.findByRole('button', { name: 'Open concept chat' }));
    expect(await screen.findByTestId('concept-chat-overlay')).toHaveClass('absolute', 'inset-0');
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close concept chat' }));
    await waitFor(() => expect(screen.queryByTestId('concept-chat-overlay')).not.toBeInTheDocument());
  });
});

describe('edge-case rendered contracts', () => {
  it('A4: shuffled multiple-choice disclosure explains each correct option separately', async () => {
    const h = mountRevision('quiz_only');
    const card = h.wire.original.nodes[0].quiz_set?.quizzes[0];
    if (!card) throw new Error('Expected quiz-set fixture');
    const multi = { ...card, question_type: 'multiple_choice', options: card.options.map((option, index) => ({
      ...option, is_correct: index === 0 || index === 2,
    })) } satisfies NonNullable<ConceptNode['quiz']>;
    h.view.unmount();
    const source: LearningSessionWithNodes = { ...h.wire.original,
      nodes: h.wire.original.nodes.map((node, index) => index === 0
        ? { ...node, quiz_set: { quizzes: [multi], current_index: 0, shuffle_seed: null } } : node) };
    const real = mountRevision('quiz_only', undefined, source);
    real.holdRefetch();
    await screen.findByRole('checkbox', { name: /Option 0/ });
    transport.submit.mockResolvedValueOnce({ ...real.wire.submissions[1], quiz_index: 0,
      selected_option_ids: ['q0-0'], selected_explanation: 'Explanation q0-0' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Option 0/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByText('Incorrect');
    expect(screen.getByText('Your selection is incorrect.')).toBeInTheDocument();
    expect(screen.getByText('Explanation q0-0')).toBeInTheDocument();
    expect(screen.queryByText('Explanation q0-2')).not.toBeInTheDocument();
    expect(screen.queryByText(/Option 0.*wrong/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Option 2/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Option 0/ }));
    transport.submit.mockResolvedValueOnce({ ...real.wire.submissions[0], quiz_attempt_count: 2,
      selected_option_ids: ['q0-2', 'q0-0'], correct_option_ids: ['q0-0', 'q0-2'] });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    await screen.findByText('Correct!');
    expect(screen.getByText('Explanation q0-0')).toBeInTheDocument();
    expect(screen.getByText('Explanation q0-2')).toBeInTheDocument();
    expect(screen.getByText('Explanation q0-1')).toBeInTheDocument();
    expect(transport.submit.mock.calls.at(-1)?.[2]).toEqual(['q0-2', 'q0-0']);
    await real.releaseRefetch();
  });

  it.each<RevisionMode>(['full_review', 'quiz_only'])('A15/A16: %s notices and quizless states are visible without false completion', async (mode) => {
    const base = wires[mode].initial;
    const quizless: RevisionSessionWithProgress = { ...base, nodes: base.nodes.map((node) => ({
      ...node, quiz_count: 0, quiz_results: [],
    })), notices: [{ code: 'incompatible_attempts', node_id: base.nodes[0].node_id, attempt_count: 2 },
      { code: 'legacy_review_required', node_id: base.nodes[0].node_id, attempt_count: 0 }] };
    const source: LearningSessionWithNodes = { ...wires[mode].original,
      nodes: wires[mode].original.nodes.map((node) => ({
      ...node, quiz: null, quiz_set: null,
    })) };
    const h = mountRevision(mode, quizless, source);
    await screen.findByText('No quiz available for this topic.');
    expect(screen.queryByRole('button', { name: 'View Summary' })).not.toBeInTheDocument();
    expect(screen.getByText(/incompatible|could not.*restor|unavailable.*attempt/i)).toBeInTheDocument();
    if (mode === 'quiz_only') {
      expect(screen.getByText(/No practice quizzes available/i)).toBeInTheDocument();
      expect(screen.queryByTestId('revision-full-review-content')).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('button', { name: 'Mark as Reviewed' })).toBeEnabled();
      expect(screen.getByText(/review.*again|Mark as Reviewed.*again|explicit.*review/i)).toBeInTheDocument();
    }
    h.view.unmount();
    mountRevision(mode, { ...base, nodes: [] }, {
      ...source, nodes: [], total_nodes: 0, completed_nodes: 0,
    });
    await screen.findByRole('heading', { name: source.course_title });
    expect(screen.queryByRole('button', { name: 'View Summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit Answer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Revision Summary' })).not.toBeInTheDocument();
  });
});
```

The multi-select rendering test deliberately has typed synthetic transport data to exercise option-specific presentation; **exact-match evaluation is genuinely asserted against both real adapters** in Task 2. Do not mislabel this mock as server evaluation. For legacy UI notices the server compatibility evidence is the real adapter tests; this test demonstrates actual notice rendering and zero-denominator UX.

- [ ] **Step 2 — RED (`client/`).** `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx -t 'A11/A12/A20|A20:|A13:'`; expect missing chat helpers. Any independent responsive assertion failure is a producer defect, not something to mask by mocking the layout.
- [ ] **Step 3 — Add these helpers and stream cleanup.** Infer stream types from the real transport signature, not a hand-invented partial signature. Record requests/abort signals; do not auto-send on prefill.

```tsx
type StreamParams = Parameters<typeof import('@/lib/chatApi').streamConceptChat>[0];
const streams: Array<ReturnType<typeof deferred<void>>> = [];
function chatStream() {
  const calls: StreamParams[] = [];
  const gates: Array<ReturnType<typeof deferred<void>>> = [];
  transport.stream.mockImplementation((params: StreamParams) => {
    calls.push(params);
    const gate = deferred<void>();
    gates.push(gate); streams.push(gate);
    params.signal?.addEventListener('abort', () => gate.resolve(undefined), { once: true });
    return gate.promise;
  });
  return { calls, finish: (index: number, text: string) => {
    const call = calls[index]; const gate = gates[index];
    if (!call || !gate) throw new Error('Missing deterministic stream');
    call.onDelta(text); gate.resolve(undefined);
  } };
}
function seedChat(sessionId: string, nodeId: string, content: string, timestamp = Date.now()) {
  localStorage.setItem(`concept_chat_${sessionId}_${nodeId}`, JSON.stringify({
    messages: [{ role: 'assistant', content }], lastPromptTimestamp: timestamp, webSearchEnabled: false,
  }));
}
afterEach(async () => {
  await act(async () => { for (const stream of streams.splice(0)) stream.resolve(undefined); });
});
```

Ensure stream teardown runs **before** normal cleanup/client-clear in the same existing `afterEach` callback (move the shown release body to its beginning, make that callback `async`; do not leave two unordered teardown callbacks). At P6 handoff verify prefill during streaming can populate/focus the composer, sending remains disabled/stopped-only, and it does not abort the active response. If textarea is intentionally non-editable while streaming, assert its value/prefill without typing into a disabled field. A failed behavior goes to P5/P6.

- [ ] **Step 4 — GREEN (`client/`).** `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx`; then `npm run build`. Run upstream `npx vitest run src/features/learning/ChatPanel.test.tsx src/features/learning/useConceptChat.test.ts src/features/learning/useConceptChatPanel.test.ts src/features/learning/ConceptChatLayout.test.tsx` for genuine search-header/history-cap/error controls, mouse resizing, focus trap and 768px-boundary cases. A13's actual geometry/independent scrolling is **not proved by jsdom**; Task 8 is mandatory.
- [ ] **Step 5 — Commit.** Path: acceptance test. Message: `test(review-parity): verify integrated chat lifecycle and edge states`.

## Task 7: Separate strict new-unit revision coverage gate

**File:** Create `client/vitest.revision.config.ts`. Prerequisite: explicit config-only default-export exception recorded by orchestrator.

- [ ] **Step 1 — Establish the missing gate with this exact command (`client/`).**

`npx vitest run --config vitest.revision.config.ts --coverage`

Expected nonzero: config does not exist. This is a configuration RED, **not** a measured low-coverage claim.
- [ ] **Step 2 — Confirm the RED and existing gate preservation.** Record exit code and missing-config diagnostic. Run `git diff -- client/vitest.generation.config.ts client/vite.config.ts client/package.json`; expect no P7 changes. Read installed Vitest/V8 docs if configuration APIs differ; versioned official docs already checked during planning: `https://github.com/vitest-dev/vitest/blob/v3.2.4/docs/guide/coverage.md` and `docs/config/index.md`.
- [ ] **Step 3 — Create this complete config, retaining all existing generation thresholds.** Include **every new production client unit** added by P4/P5: five files below. P6's hooks/page are existing units and still run in focused/full regressions; don't expand the denominator to unrelated large modules. If the P6 handoff explicitly reports another new production unit, stop and coordinate its inclusion instead of silently excluding it.

```ts
/**
 * ============================================================================
 * FILE: vitest.revision.config.ts
 * LOCATION: client/vitest.revision.config.ts
 * ============================================================================
 * PURPOSE:
 *    Enforce a separate strict per-file coverage gate for new revision units.
 * ROLE IN PROJECT:
 *    Complements, never replaces or weakens, the generation coverage gate.
 *    Includes real integration and producer unit tests with V8 instrumentation.
 * KEY COMPONENTS:
 *    - revisionConfig: Per-file 81% branches/functions/lines/statements
 * ============================================================================
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vite.config';

export const revisionConfig = mergeConfig(baseConfig, defineConfig({
  test: {
    include: [
      'src/features/learning/QuizResultDetails.test.tsx',
      'src/features/learning/QuizFeedback.test.tsx',
      'src/features/learning/RevisionQuizSection.test.tsx',
      'src/features/learning/revisionQuizState.test.ts',
      'src/features/learning/RevisionConceptCard.test.tsx',
      'src/features/learning/RevisionPage.test.tsx',
      'src/features/learning/useRevisionSession.test.ts',
      'src/features/learning/useRevisionMutations.test.tsx',
      'src/features/learning/RevisionSummaryModal.test.tsx',
      'src/features/learning/RevisionHistoryList.test.tsx',
      'src/features/learning/ConceptChatLayout.test.tsx',
      'src/features/learning/useConceptChatPanel.test.ts',
      'src/features/learning/ChatPanel.test.tsx',
      'src/features/learning/useConceptChat.test.ts',
      'src/features/learning/LearningPathContainer.test.tsx',
      'src/features/learning/curiosityParser.test.ts',
      'src/features/learning/CuriositySpark.test.tsx',
      'src/features/learning/__tests__/completedCourseReviewParity.test.tsx',
      'src/lib/learningApi.test.ts',
    ],
    coverage: {
      provider: 'v8',
      all: true,
      include: [
        'src/features/learning/QuizResultDetails.tsx',
        'src/features/learning/RevisionQuizSection.tsx',
        'src/features/learning/revisionQuizState.ts',
        'src/features/learning/ConceptChatLayout.tsx',
        'src/features/learning/useConceptChatPanel.ts',
      ],
      reportsDirectory: 'coverage/revision',
      reporter: ['text', 'json-summary', 'html'],
      reportOnFailure: true,
      thresholds: { perFile: true, branches: 81, functions: 81, lines: 81, statements: 81 },
    },
  },
}));

// Config-loader exception must be approved; feature exports remain named.
export default revisionConfig;
```

- [ ] **Step 4 — GREEN (`client/`).** Repeat Step 1. Each of the five files must show **at least 81% in all four metrics**, not merely >80% combined lines. Read `client/coverage/revision/coverage-summary.json`; record raw numerator/denominator and percentages for all files. If low, inspect uncovered branches and add a focused integrated scenario **only to P7's owned acceptance test** or route missing unit tests to P4/P5. Never lower thresholds, remove an include, add ignore comments, replace real components with mocks, or refactor unrelated modules for the score. Run `npm run test:generation:coverage` separately, and record its independent outcome.
- [ ] **Step 5 — Commit.** Paths: config and, only if actually extended/tested, the owned acceptance test. Message: `test(review-parity): enforce independent per-file revision coverage`.

## Task 8: Disposable browser app and four actual desktop/mobile evidence captures

**Files:** Modify `server/tests/revision_acceptance_helpers.py` and `server/tests/test_revision_acceptance.py`. Evidence captures: the four explicitly allowed objective PNGs below. No user DB or production source changes.

- [ ] **Step 1 — Add this factory guard test and import `create_browser_app`.**

```python
    def test_browser_factory_uses_disposable_courses_and_no_provider(self) -> None:
        from fastapi.testclient import TestClient

        app = create_browser_app()
        with TestClient(app) as client:
            data = client.get("/fixture").json()
            self.assertEqual(set(data["routes"]), {"full_review", "quiz_only"})
            self.assertEqual(data["title"], "P7 DISPOSABLE — Review parity")
            self.assertNotIn("api_key", str(data))
            self.assertNotIn("a2ui.db", str(data))
            session = data["session_id"]
            response = client.post(
                f"/learning/sessions/{session}/nodes/{data['node_id']}/chat",
                json={"message": "Fixture prompt", "history": [],
                      "selected_heading_ids": []},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn('"delta"', response.text)
            self.assertIn("[DONE]", response.text)
```

- [ ] **Step 2 — RED (root).** `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_acceptance.RevisionAcceptanceTests.test_browser_factory_uses_disposable_courses_and_no_provider -v`; expect missing factory helper import.
- [ ] **Step 3 — Append the disposable factory below, with necessary top-level imports.** This is **test infrastructure**, not an alternative production route. It mounts the real learning router with the fixture repository facade and supplies only deterministic external chat. The factory must never boot `server.main`, storage settings, generation, or cloud connections. App lifetime owns the TemporaryDirectory/patches and closes them even on failure.

```python
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse


def create_browser_app() -> FastAPI:
    """Return a disposable local browser target with deterministic chat."""
    resources = ExitStack()
    fixture = resources.enter_context(AcceptanceFixture("full_review"))
    fixture.execute(
        "UPDATE learning_sessions SET course_title = ?",
        ("P7 DISPOSABLE — Review parity",),
    )
    with frozen_writes(START, 20):
        fixture.manager.create_concept_node(
            fixture.session, 1, "Topic B", "# Plain heading\n\n"
            "Fallback paragraph without curiosity.\n\n" +
            "\n\n".join(f"Paragraph {i}: disposable scrolling content."
                          for i in range(35)), NodeStatus.COMPLETED,
        )
        review = fixture.manager.create_revision_session(
            fixture.session, "full_review"
        )
        practice = fixture.manager.create_revision_session(
            fixture.session, "quiz_only"
        )
    paragraphs = "\n\n".join(f"Scroll paragraph {i}." for i in range(35))
    fixture.execute(
        "UPDATE concept_nodes SET content_markdown = ? WHERE id = ?",
        ("# Foundations\n\nOriginal paragraph.\n\n" + paragraphs +
         "\n\n## Curiosity Spark\n- Why study A?", fixture.node),
    )
    route = lambda rid: f"/learn/{fixture.session}/revise/{rid}"
    routes = {"full_review": route(review["id"]),
              "quiz_only": route(practice["id"])}

    @contextmanager
    def bind_ports():
        with ExitStack() as stack:
            stack.enter_context(patch(
                "server.routers.learning.learning_manager",
                RepositoryFacade(lambda: fixture.repositories["sqlite"]),
            ))
            stack.enter_context(patch(
                "server.routers.learning.generation_job_store",
                SimpleNamespace(to_public_by_session=lambda _: None),
            ))
            stack.enter_context(patch(
                "server.routers.learning.research_store",
                SimpleNamespace(get_citations_by_session=lambda _: {}),
            ))
            yield

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            with bind_ports():
                yield
        finally:
            resources.close()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=["http://localhost:5178",
                                      "http://127.0.0.1:5178"],
        allow_methods=["*"], allow_headers=["*"],
    )

    @app.get("/fixture")
    def fixture_info() -> dict:
        return {"title": "P7 DISPOSABLE — Review parity", "routes": routes,
                "session_id": fixture.session, "node_id": fixture.node}

    @app.post("/learning/sessions/{session_id}/nodes/{node_id}/chat")
    async def fixture_chat(session_id: str, node_id: str):
        async def frames():
            for index in range(40):
                text = f"Deterministic {node_id} response {index}.\n\n"
                yield f"data: {json.dumps({'delta': text})}\n\n"
                await asyncio.sleep(0.15)
            yield "data: [DONE]\n\n"
        return StreamingResponse(frames(), media_type="text/event-stream")

    # First-match test-only chat route precedes the production router.
    app.include_router(router)
    return app
```

The factory keeps recognized curiosity questions at the **end** of Topic A; scrolling paragraphs precede the marker so the parser preserves the scrolling body. This is valid fixture presentation, not a parser production change.

Run the factory guard GREEN with Step 2's command, then run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_repository_parity server.tests.test_revision_acceptance -v`; expect ten tests and exit 0.

Start these **separate** background processes; record their process IDs/output and stop only the processes you launched, never kill an existing user's dev server:

| Working directory | Command |
| --- | --- |
| Repository root | `server/.venv/Scripts/python.exe -m uvicorn server.tests.revision_acceptance_helpers:create_browser_app --factory --host 127.0.0.1 --port 8018` |
| `client/` | `$env:VITE_API_URL='http://127.0.0.1:8018'` then `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort` (same dedicated process; restore previous environment in finally) |

`Invoke-RestMethod http://127.0.0.1:8018/fixture` provides the two exact fixture URLs. Do not navigate to the user's existing :5173 course/revision IDs. No real API key is entered: if client settings demand a key for transport construction, use a **fictional sentinel only on this isolated origin**, e.g. `p7-fixture-not-a-real-key`, and remove only that fixture-origin entry afterward. Never copy user's storage or settings. Browser API has no provider/network dependency.

- [ ] **Step 4 — Perform and capture all four actual browser checks.** Use OpenChamber's browser panel (not a hypothetical screenshot). Tool sequence:

1. `browser.open` URL `http://127.0.0.1:5178` plus the Full Review route from `/fixture`, `viewport: 'desktop'`; retain returned tab ID. `browser.snapshot` reads actual selectors/errors.
2. Verify title contains `P7 DISPOSABLE`, then select q0 Option 0/submit and q1 Option 1/submit. Assert green/red accessible indicators and readable final wrong feedback, neutral outer border, no forced summary; mark both topics reviewed. Refresh by `browser.open` on the **same tab ID** and URL; verify restored quiz indicators/feedback/reading count.
3. Click the curiosity **button** via snapshot selector; read composer text/focus and verify no message sent. Change its draft with `browser.type`, click same question again; close/reopen and repeat. Open Topic B fallback heading-chat; verify explicit title/ownership. While streaming, navigate carousel and then explicitly retarget: no silent title switch on carousel; explicit switch stops A's stream and loads B's history. Check errors from each snapshot.
4. `browser.inspect` the actual bounded layout, content scroll wrapper, chat dialog/log, and separator selectors obtained from snapshots. Record flex direction, constrained height, content/chat `overflow-y`, pane width/bounds and DOM position. Content/chat must occupy the same vertical band; chat is to the right and above the footer, not below quizzes. `browser.scroll` supports document scrolling/bringing a selector into view, **not guaranteed nested-pane wheel events**: use the real browser pointer/manual wheel over each pane or an already-available driver to confirm one area's scroll changes while the other's position remains fixed. Record observations, not merely CSS class names. Keyboard resize/focus bounds have executable RTL assertions; also manually focus separator and press Home/End/Arrow keys in the real panel when supported, plus drag with the actual pointer. If tools cannot generate these events, request the user's/manual browser interaction or an available browser driver; record unavailable evidence as a blocker, never claim it ran. Do not add a browser dependency or write an unowned driver to bypass this limitation.
5. `browser.capture` label `p7-full-review-desktop`; copy the tool-returned exact image path to `docs/completed-course-review-parity/p7-full-review-desktop.png`. Do not assume capture supports a target-directory parameter. Use path-scoped `Copy-Item -LiteralPath <actual-returned-path> -Destination <exact-owned-evidence-path>`; do not delete the original capture.
6. `browser.resize` same tab with `viewport: 'mobile'`; snapshot must explicitly report width **below 768px** (record actual dimensions). Open chat via snapshot selector, verify full-width overlay **within bounded content**, close control, no desktop separator, composer visible, no below-topic placement, Escape/focus restoration and topic scroll restoration. Snapshot before/after closing; inspect actual width/height. Capture/copy `p7-full-review-mobile.png`.
7. Repeat desktop then mobile on the **quiz_only** route from `/fixture`; quiz-only content must not reveal explanations, curiosity controls or review action. Make the same two fixture-only quiz submissions; inspect readable feedback, explicit summary, refreshed state, chat right-pane/overlay, close/reopen history. Capture/copy `p7-practice-desktop.png` and `p7-practice-mobile.png`.
8. Check 768px threshold, both themes, reduced-motion preference and keyboard controls where actual browser supports them. Do not equate the browser tool's generic “mobile” label to a measured sub-768px width. If exact 768px sizing/keyboard emulation is unavailable, link the genuine `ConceptChatLayout.test.tsx` boundary assertions and state which part is automated versus manually observed. Record console errors and defects, not only screenshots.

If screenshot output falls outside objective ownership, **copy only the requested four evidence images**; do not stage unrelated capture directories. No screenshots of settings/secrets or user data. Screenshots alone do not prove route races, expiry, exact-match evaluation, or original-data preservation: those require the tests above. Browser A20 focus/stream observations supplement rather than replace deterministic assertions.

- [ ] **Step 5 — Commit.** Paths: the two Task 8 source files and the four verified PNG paths only (omit missing images; missing required browser evidence blocks exit). Message: `test(review-parity): add disposable desktop and mobile acceptance evidence`.

## Task 9: Final gates and an honest complete evidence ledger

**File:** Create `docs/completed-course-review-parity/verification.md`. Test/config files may only be amended within prior tasks and reverified; production issues return to owners.

- [ ] **Step 1 — Write the evidence requirements before claiming verification.** The final ledger must have these sections and exact acceptance mapping, with actual test names/path anchors/results. Use this table as the initial Markdown body; populate measured fields after runs, never invented counts.

```markdown
# Completed-Course Review Parity — Verification

## Scope and provenance
P7 verifies P1–P6; it does not implement production fixes.
Record tested HEAD, P6 handoff commit, date, Node/Python versions, and fixture origin.

## Baseline versus current results
The orchestrator measured 614 passing server tests and 262 passing learning-feature
client tests across 32 files before P6/P7. The latter is NOT the full client suite.
P3 resolved seven pre-existing custom_topic_count errors, originally reproduced at
3c8681c. Keep that historical failure and its fix references; do not list it as a
remaining failure if the current rerun passes. Initial lint had zero errors and
three generated-coverage warnings. Record new warnings/failures separately.

## Commands and outcomes
| Time / HEAD | Working directory | Exact command | Exit code | Files/tests/counts or diagnostics | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |

## Infrastructure RED and behavioral regressions
Distinguish absent helper/config failures from objective regressions and genuine
first-run GREEN acceptance tests. Preserve command/output for each actual RED.

## Per-file revision coverage
| New production unit | Statements | Branches | Functions | Lines | Covered/total | Verdict |
| --- | --- | --- | --- | --- | --- | --- |

## Acceptance evidence
| Criterion | Genuine assertion/evidence | Actual result |
| --- | --- | --- |
| A1 | P7 A1/A2/A3, both modes: every q0 explanation, green q0 only, held refetch | |
| A2 | P7 A1/A2/A3, both modes: only q1 selected explanation, red and Try Again | |
| A3 | P7 A1/A2/A3 and A5/A6: independent restored colors/feedback, border-border | |
| A4 | P7 real adapter multi_select test + edge UI A4: exact IDs, selected-only wrong, separate correct reasons | |
| A5 | P7 A5/A6: Previous/Next/Skip/topic draft retention and zero transport submissions | |
| A6 | P7 A5/A6 remount/new route + adapter fresh revision + P2/P3 deterministic latest restoration | |
| A7 | P7 both-mode transcripts + P2/P3 explicit idempotent reading: wrong does not undo review | |
| A8 | P7 transcripts and A7/A8/A9/A10/A16: one of two pending, second wrong finished | |
| A9 | P7 transcripts: 2/3=66, completion clock unchanged; UI retry updates its result/current summary | |
| A10 | P7 final feedback/no auto modal + explicit current summary and completed re-entry | |
| A11 | P7 A11/A12/A20: real curiosity/composer repeated prefill, zero sends, fallback Markdown | |
| A12 | P7 A11/A12/A20: actual heading ID in request, carousel ownership, explicit destination history | |
| A13 | P7 A13 + producer layout assertions + four measured browser pane/overlay/scroll captures | |
| A14 | P7 failed retry/review UI + P2 rollback/P3 insert-failure regressions | |
| A15 | P7 legacy partial/incompatible test + P2 one-time migration/P3 absent-null inference + notice UI | |
| A16 | P7 transcript summary/list/get equality, live header/TOC/history/summary, quizless/empty states | |
| A17 | P7 actual HTTP no-write errors/foreign course + exact keys + typed wire decoder and client build | |
| A18 | P7 raw original snapshots/history/mastery before/after on both adapters and wire original equality | |
| A19 | P7 late resolve/reject after real router switch: no results/drafts/errors/loading/summary leak | |
| A20 | P7 stream abort/late delta, repeat prefill, completed chat/re-entry/expiry/Escape/focus + browser notes | |

## Browser measurements and screenshots
For each of four views: disposable route, actual dimensions, observed interactions,
computed layout/scroll values, screenshot path, console errors, and result.
Distinguish direct browser observations from RTL-only keyboard/expiry evidence.

## Defects and reruns
Criterion, reproduction, actual/expected, owner, failing command, fix commit,
affected reruns. Unresolved defects block completion; never patch producers here.

## Unrun or blocked gates
“Not run”, “blocked”, warnings, and failures are not passes. A required unrun gate
prevents P7 exit. No skipped standalone research/review verdict is manufactured.

## Exit decision
Only PASS after all A1–A20 assertions/evidence exist, both adapters pass, all five
new units exceed 80% in every metric, both coverage gates and all required commands
are recorded, and desktop/mobile evidence exists for both modes without user writes.
```

- [ ] **Step 2 — RED evidence check (root), before writing the final ledger.**

```powershell
if (!(Test-Path 'docs/completed-course-review-parity/verification.md')) {
  throw 'Required verification ledger does not exist: evidence gate RED'
}
```

Record missing-ledger RED as documentation infrastructure only. If a ledger already exists from an interrupted P7 run, do not overwrite it to manufacture RED; inspect and append current measurements. Task 9 documents acceptance work, not source TDD.

- [ ] **Step 3 — Run all final gates and populate the Markdown body with actual results.** Run each command independently; immediately record `$LASTEXITCODE`, counts, stdout/stderr summary and tested HEAD. Full logs may be retained by tool-managed storage and linked in the ledger. Do not create unowned log files. No pre-P6 result is a substitute for these runs.

| Working directory | Exact command |
| --- | --- |
| Repository root | `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts -v` |
| Repository root | `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite server.tests.test_revision_api server.tests.test_revision_mongo server.tests.test_migrate_to_mongo server.tests.test_mongo_learning server.tests.test_revision_repository_parity server.tests.test_revision_acceptance -v` |
| Repository root | `server/.venv/Scripts/python.exe -m unittest discover -s server/tests -t .` |
| `client/` | `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx` |
| `client/` | `npx vitest run --config vitest.revision.config.ts --coverage` |
| `client/` | `npm run test -- --run` |
| `client/` | `npm run build` |
| `client/` | `npm run lint` |
| `client/` | `npm run test:generation:coverage` |
| Repository root | `git diff --check` |

The full server discovery covers relevant learning/persistence/repository regressions as well as revision suites. The full client command must be **full repository**, not only `src/features/learning`. Coverage reports stay generated/untracked; record the JSON-summary numbers in `verification.md`, do not stage reports. If generation coverage changes the coverage output tree, preserve the revision measurement in the ledger first. A gate exit 0 with warnings is recorded “PASS with warnings” and lists them; a gate failure is FAILURE, even if pre-existing. Diagnose baseline at the recorded pre-change commit only in a separately authorized safe disposable checkout, not by resetting this checkout.

Link exact upstream assertions supporting A15/A14/A6, including:

* `server/tests/test_revision_sqlite.py::RevisionSqliteTests.test_review_migration_is_one_time_and_preserves_rows`
* `server/tests/test_revision_sqlite.py::RevisionSqliteTests.test_legacy_single_quiz_null_index_and_quizless_nodes`
* `server/tests/test_revision_sqlite.py::RevisionSqliteTests.test_restore_latest_results_and_list_use_own_attempts`
* `server/tests/test_revision_sqlite.py::RevisionSqliteTests.test_full_review_is_explicit_idempotent_and_independent`
* `server/tests/test_revision_sqlite.py::RevisionSqliteTests.test_failed_aggregate_update_rolls_back_attempt_and_metadata`
* `server/tests/test_revision_mongo.py::RevisionMongoTests.test_legacy_review_inference_only_for_absent_reviewed_field`
* `server/tests/test_revision_mongo.py::RevisionMongoTests.test_legacy_single_quiz_and_scalar_attempt_restore_without_rewrite`
* `server/tests/test_revision_mongo.py::RevisionMongoTests.test_committed_attempt_survives_aggregate_failure`
* `server/tests/test_revision_mongo.py::RevisionMongoTests.test_attempt_insert_failure_keeps_saved_result`
* `server/tests/test_revision_mongo.py::RevisionMongoTests.test_full_review_is_explicit_idempotent_and_quiz_independent`

These are genuine existing assertions executed now, not a claim that P7 created or owns their tests. Retain backend limits honestly: deterministic Mongo repository parity does **not** establish live Atlas deployment/transaction behavior, which is outside this objective.

- [ ] **Step 4 — GREEN evidence check (root).** Inspect the completed ledger: every command has real working directory/exit/count/evidence; all A1–A20 rows refer to assertions actually run; all five new files have coverage values >80%; four screenshots show fictional fixture data. Run this structural check, then manually inspect semantic claims (the script alone cannot prove a pass):

```powershell
$path = 'docs/completed-course-review-parity/verification.md'
$text = Get-Content -Raw $path
foreach ($id in 1..20) {
  if ($text -notmatch "\| A$id \|") { throw "Missing acceptance row A$id" }
}
foreach ($name in @('p7-full-review-desktop', 'p7-full-review-mobile',
                    'p7-practice-desktop', 'p7-practice-mobile')) {
  if (!(Test-Path "docs/completed-course-review-parity/$name.png")) {
    throw "Missing actual browser evidence $name"
  }
}
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace gate failed' }
```

Never transform “Not run” into PASS based on a summary or successful structural script. An unresolved required failure/missing browser interaction/config convention exception blocks exit; report the exact blocker with the evidence captured so far.
- [ ] **Step 5 — Commit and hand off.** Path: `docs/completed-course-review-parity/verification.md` only. Message: `docs(review-parity): record integrated acceptance and verification evidence`. Report tested HEAD, actual focused/full counts, coverage per-file minima, screenshot paths, A1–A20 coverage, defect fix hashes, baseline failures/warnings, and any unrun gates. Orchestrator alone updates `state.md`/`final_report.md` and makes the final completion decision.

## Self-review / exit checklist

* Nine tasks, **45 checkbox steps**; infrastructure RED expectations are expressly distinguished from behavioral failures. Production changes are prohibited throughout.
* Every new source/config file has its mandatory 76-`=` banner in its code snippet. This Markdown document starts with the writing-plans header and has **no plan-level file banner**.
* Exact paths and root/client working directories are supplied; only six assigned files and four requested screenshots are staged by worker commits.
* Actual route JSON bridges to strict TS types without casts; real revision components, QueryClient, router, Markdown heading controls and chat hooks are used. Every criterion has genuine observable assertions/evidence rather than a mocked component promise.
* Both modes, both repositories, original snapshots/mastery scope, legacy and malformed cases, empty/quizless denominators, deferred route results, and abortable chat streams are included.
* P6 completion, config-only export exception, and any TOC ownership amendment are explicit dependencies/blockers, not silent scope expansion.
* New per-file coverage requires 81% across branches/functions/lines/statements; generation gate untouched and run separately. Browser checks prove actual geometry at desktop/sub-768px sizes with disposable data.
* Final evidence records actual command/working directory/exit/counts/artifact and separates historical resolved baseline failures, remaining warnings, new failures, and unrun gates.
