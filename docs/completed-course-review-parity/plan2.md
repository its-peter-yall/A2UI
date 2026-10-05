# P2 — SQLite Implementation and Revision HTTP Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this harness load `executing-plans` and `test-driven-development`; do not dispatch research or review agents.

**Goal:** Make SQLite revision writes and serialized revision HTTP responses satisfy the fixed P1 contract without modifying original-course data or normal-learning mastery policy.

**Architecture:** Keep `LearningManager` as the SQLite adapter and the router on the existing repository facade. Batch-load progress, quiz payloads, and attempts into the P1 pure projection; use that projection for GET/list/summary and transaction-local reconciliation. Migrate explicit reading metadata once, append attempts without rewriting history, and validate requests before the first write.

**Tech Stack:** Python in `server/.venv`, stdlib `sqlite3` and `unittest`, FastAPI, Pydantic v2, existing repository adapters/facades, and `server/services/revision_progress.py`.

---

## Inputs, boundaries, and fixed decisions

Read fully before execution: `docs/completed-course-review-parity/goal.md`, `docs/completed-course-review-parity/state.md`, `AGENTS.md`, and `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/TESTING.md`, `docs/CONVENTIONS.md`, `docs/STRUCTURE.md`, `docs/INTEGRATIONS.md`, `docs/CONCERNS.md`. Consume the actual P1 code in `server/schemas/learning.py`, `server/database/repositories/protocols.py`, `server/services/revision_progress.py`, and `client/src/types/learning.ts`. Do not change any of those files.

All commands below run in **`D:/Peter/Personal Stuffs/A2UI`** unless explicitly stated otherwise. Use forward slashes in paths. New test headers have exactly 76 `=` characters. This Markdown plan itself has no source-file banner.

### File map

| File | Change / responsibility |
| --- | --- |
| `server/database/learning_persistence.py` | Additive explicit-review migration; revision-only batched read/projection helpers; transactional review/attempt writes; authoritative summaries; narrow original-attempt query predicates |
| `server/routers/learning.py` | Revision response serialization and error validation only; retain facade import and routes |
| `server/tests/test_revision_sqlite.py` | New real temporary-file SQLite fixture and behavior tests; no production DB |
| `server/tests/test_revision_api.py` | New minimal FastAPI app + actual JSON responses, backed by temporary SQLite through a facade |
| `server/tests/test_sqlite_repositories.py` | Narrow real-adapter original history/mastery regression |

Do not create helpers in other files, edit Mongo/migration files, alter P1 types, change original mastery algorithms, run the real application lifespan, or initialize `server/data/a2ui.db`. Do not use `server.main.app` in tests. Importing the store/facade creates objects but does not initialize their production tables; every tested operation must target the temporary manager.

### Adapter decisions downstream consumers must know

1. `mark-reviewed` returns **`RevisionNodeProgressWithDetails`**, exactly the node shape from revision GET, not `RevisionNodeProgress`. P1's protocol already returns `RevisionNodePayload`; no contract change is necessary.
2. Stored `attempt_number` remains node-wide across original/revision attempts. `quiz_attempt_count` counts **compatible** attempts for revision/node/index, as P1 defines; invalid historical rows remain saved but are excluded.
3. All timestamps in adapter payloads are ISO UTC strings. Compare timestamps by parsed instant in tests; FastAPI/Pydantic may serialize UTC as `Z`.
4. Add `content_reviewed_at` only if absent. During that single migration, backfill only Full Review rows with legacy status `reviewed`, using `reviewed_at` or revision `started_at`. Once the column exists, null means intentionally unreviewed and is never backfilled. No extra legacy-marker field is needed: `legacy_review_inferred` is an inference notice, not a permanent audit requirement; after persisted inference, that notice need not remain. Other P1 notices are returned verbatim from the projection.
5. GET/list/summary are read-only; hide a disproven historical completion time in their projected responses but retain the stored value until a **valid successful** progress write. Before that write, clear the disproven completion value inside the transaction if the pre-write projection is incomplete; then reconcile from post-write evidence. Rollback restores everything if any later operation fails. This avoids accepting a stale/future completion timestamp when the new write completes the revision directly.
6. `reviewed_at` remains deprecated compatibility data. Quiz writes never set/clear it or `content_reviewed_at`. Explicit review writes set both to the first explicit-review time; a prior quiz-derived `reviewed_at` is not reused as the new explicit-review time.
7. Preserve original comparison scoring: original, non-revision attempts on participating revision nodes, with the existing attempt-based original scoring policy. Do not regrade/filter historical original rows through revision compatibility rules. Revision accuracy uses only compatible P1 attempts.
8. Missing revision/member/foreign-course member -> `LookupError` -> HTTP 404. Invalid quiz index, selection, quizless submission, or review in Practice -> `ValueError` -> HTTP 400. Request-model negative indices/empty selections -> HTTP 422. Backend payload validation and unexpected errors -> generic HTTP 500, never a response containing exception text.
9. Batch queries must not grow with node/quiz count. A paginated revision list may batch all selected revision IDs; never call `get_revision_session` once per listed revision. No new dependencies or SQLite connection-policy changes.

Inline official-document check performed while planning: FastAPI [response models](https://fastapi.tiangolo.com/tutorial/response-model/) and [direct responses](https://fastapi.tiangolo.com/advanced/response-directly/) confirm that direct `JSONResponse` bypasses response-model validation. Return validated Pydantic models, not `JSONResponse`. Installed versions inspected locally: FastAPI **0.139.2**, Pydantic **2.13.4**, httpx **0.28.1**, SQLite **3.50.4**. No research artifact is authorized.

SQLite fixture connections must close explicitly: the [stdlib connection context manager](https://docs.python.org/3/library/sqlite3.html#how-to-use-the-connection-context-manager) commits/rolls back but does not close the connection. Use `contextlib.closing` around every test connection to prevent Windows `WinError 32` at temporary-directory cleanup; never work around this by suppressing cleanup errors.

## Preflight — 3 steps, no source changes

- [ ] **Step P1:** Run `git status --short` and `git diff -- server/database/learning_persistence.py server/routers/learning.py server/tests/test_sqlite_repositories.py`. Preserve foreign changes; stop if owned files have unexplained edits. Notify the orchestrator rather than changing `state.md` yourself.
- [ ] **Step P2:** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts server.tests.test_sqlite_repositories -v`. Record exit code/test count and distinguish baseline failures. These use temporary/mocked storage, not production initialization.
- [ ] **Step P3:** Load execution/TDD skills and read the fixed decisions above. Seven TDD tasks follow, five steps each. Some new cases already pass; the named red command must have at least one feature assertion fail, not an import/syntax/environment error. Do not weaken a test to manufacture red.

## Atomic commit procedure (apply at every task's Step 5)

Use the exact owned paths and message specified by each task. This reusable PowerShell function is entered in the shell, not added to any source file:

```powershell
function Commit-ReviewParity {
    param([string[]]$Paths, [string]$Message)
    $mutex = [System.Threading.Mutex]::new(
        $false, 'Local\A2UI_completed_course_review_parity_git'
    )
    $held = $false
    try {
        try { $held = $mutex.WaitOne() }
        catch [System.Threading.AbandonedMutexException] {
            $held = $true
            git status --short
        }
        $staged = @(git diff --cached --name-only)
        if ($LASTEXITCODE -ne 0 -or $staged.Count -gt 0) {
            throw 'Existing staged changes: stop and coordinate.'
        }
        git add -- $Paths
        if ($LASTEXITCODE -ne 0) { throw 'Staging failed.' }
        git diff --cached --check
        if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace failed.' }
        git diff --cached --stat
        git diff --cached -- $Paths
        $unexpected = @(git diff --cached --name-only) |
            Where-Object { $_ -notin $Paths }
        if ($unexpected) { throw 'Foreign staged paths: stop.' }
        git commit -m $Message
        if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }
        git rev-parse HEAD
    } finally {
        if ($held) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
```

No broad staging, resets, checkouts, index-lock deletion, or unstaging another agent's work. If anything remains staged after a failed commit, stop and report; do not silently bundle it later.

### Task 1: One-time explicit-review migration and temporary SQLite fixture

**Files:** Create `server/tests/test_revision_sqlite.py`; modify `server/database/learning_persistence.py:init_learning_tables` and add `_ensure_revision_review_column` beside existing `_ensure_*` helpers.

- [ ] **Step 1: Write this new test module and failing migration test.** Later SQLite tests are added to `RevisionSqliteTests`; do not duplicate the fixture.

```python
"""
============================================================================
FILE: test_revision_sqlite.py
LOCATION: server/tests/test_revision_sqlite.py
============================================================================
PURPOSE:
    Verify revision contracts against disposable real SQLite databases.
ROLE IN PROJECT:
    Persistence-level P2 regressions for the fixed P1 revision projection.
    - Never initializes or writes a production database
    - Supplies isolated course, quiz, attempt, and legacy-row fixtures
KEY COMPONENTS:
    - RevisionSqliteFixture: Temporary database and deterministic payloads
    - RevisionSqliteTests: Migration, reads, writes, and preservation tests
USAGE:
    server/.venv/Scripts/python.exe -m unittest
    server.tests.test_revision_sqlite -v
============================================================================
"""

from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from server.database.learning_persistence import LearningManager
from server.schemas.learning import NodeStatus, QuizCard, QuizSet
from server.services.revision_progress import normalize_revision_timestamp


START = "2026-10-05T09:00:00+00:00"
FIRST = "2026-10-05T10:00:00+00:00"
SECOND = "2026-10-05T11:00:00+00:00"
THIRD = "2026-10-05T12:00:00+00:00"


def make_quiz(prefix: str, multiple: bool = False) -> QuizCard:
    """Build stable-ID questions with deliberately shuffled labels."""
    return QuizCard.model_validate({
        "question_text": f"Question {prefix}",
        "question_type": (
            "multiple_choice" if multiple else "single_choice"
        ),
        "options": [
            {
                "option_id": f"{prefix}-{index}",
                "display_label": label,
                "text": f"Option {index}",
                "is_correct": index == 0 or (multiple and index == 2),
                "explanation": f"Explanation {prefix}-{index}",
            }
            for index, label in enumerate(("D", "B", "A", "C"))
        ],
    })


class RevisionSqliteFixture:
    """Reusable setup, not a TestCase; API tests reuse only the fixture."""

    def open_fixture(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "revision.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()
        self.session = self.manager.create_learning_session(
            "Revision fixture", "Revision fixture"
        )["id"]
        self.node = self.manager.create_concept_node(
            self.session, 0, "Two quizzes", "# Original content",
            NodeStatus.COMPLETED,
            quiz_set=QuizSet(quizzes=[make_quiz("q0"), make_quiz("q1")]),
        )["id"]

    def close_fixture(self) -> None:
        self.temp_dir.cleanup()

    def execute(self, sql: str, args: tuple = ()) -> None:
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute(sql, args)

    def rows(self, table: str) -> list[tuple]:
        allowed = {
            "learning_sessions", "concept_nodes", "quiz_data",
            "revision_sessions", "revision_node_progress", "quiz_attempts",
        }
        if table not in allowed:
            raise ValueError("Unknown fixture table")
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(
                f"SELECT * FROM {table} ORDER BY id"
            ).fetchall()

    def snapshot(self, original_only: bool = False) -> dict:
        tables = ["learning_sessions", "concept_nodes", "quiz_data"]
        if not original_only:
            tables += [
                "revision_sessions", "revision_node_progress", "quiz_attempts"
            ]
        return {table: self.rows(table) for table in tables}

    def revision(self, mode: str = "quiz_only") -> str:
        result = self.manager.create_revision_session(self.session, mode)
        self.execute(
            "UPDATE revision_sessions SET started_at = ? WHERE id = ?",
            (START, result["id"]),
        )
        return result["id"]

    def seed_attempt(
        self, revision_id: str, number: int, index: int | None,
        selected: str, correct: bool, timestamp: str = FIRST,
        identifier: str | None = None,
    ) -> str:
        attempt_id = identifier or f"{revision_id}-attempt-{number}"
        self.execute(
            "INSERT INTO quiz_attempts "
            "(id, node_id, attempt_number, quiz_index, revision_session_id, "
            "selected_option_id, is_correct, score_percent, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (attempt_id, self.node, number, index, revision_id, selected,
             int(correct), 100 if correct else 0, timestamp),
        )
        return attempt_id


class RevisionSqliteTests(RevisionSqliteFixture, unittest.TestCase):
    def setUp(self) -> None:
        self.open_fixture()

    def tearDown(self) -> None:
        self.close_fixture()

    def test_review_migration_is_one_time_and_preserves_rows(self) -> None:
        reviewed = self.revision("full_review")
        missing_time = self.revision("full_review")
        quiz_derived = self.revision("full_review")
        practice = self.revision("quiz_only")
        for revision_id, status, time in (
            (reviewed, "reviewed", FIRST),
            (missing_time, "reviewed", None),
            (quiz_derived, "quiz_passed", SECOND),
            (practice, "reviewed", FIRST),
        ):
            self.execute(
                "UPDATE revision_node_progress "
                "SET status = ?, reviewed_at = ? "
                "WHERE revision_session_id = ?",
                (status, time, revision_id),
            )
        self.seed_attempt(quiz_derived, 1, 0, "q0-0", True)
        before_attempts = self.rows("quiz_attempts")
        before_original = self.snapshot(original_only=True)
        # Rebuild just this disposable table into its pre-feature shape.
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute("ALTER TABLE revision_node_progress RENAME TO old_rnp")
            conn.execute(
                "CREATE TABLE revision_node_progress (id TEXT PRIMARY KEY, "
                "revision_session_id TEXT NOT NULL, node_id TEXT NOT NULL, "
                "status TEXT NOT NULL, reviewed_at TIMESTAMP)"
            )
            conn.execute(
                "INSERT INTO revision_node_progress "
                "SELECT id, revision_session_id, node_id, status, reviewed_at "
                "FROM old_rnp"
            )
            conn.execute("DROP TABLE old_rnp")
        self.manager.init_learning_tables()
        with closing(sqlite3.connect(self.db_path)) as conn:
            actual = dict(conn.execute(
                "SELECT revision_session_id, content_reviewed_at "
                "FROM revision_node_progress"
            ).fetchall())
        self.assertEqual(actual[reviewed], FIRST)
        self.assertEqual(actual[missing_time], START)
        self.assertIsNone(actual[quiz_derived])
        self.assertIsNone(actual[practice])
        self.execute(
            "UPDATE revision_node_progress SET content_reviewed_at = NULL "
            "WHERE revision_session_id = ?", (reviewed,),
        )
        once = self.rows("revision_node_progress")
        self.manager.init_learning_tables()
        self.manager.init_learning_tables()
        self.assertEqual(self.rows("revision_node_progress"), once)
        self.assertEqual(self.rows("quiz_attempts"), before_attempts)
        self.assertEqual(self.snapshot(original_only=True), before_original)


def main() -> None:
    unittest.main()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: RED.** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite.RevisionSqliteTests.test_review_migration_is_one_time_and_preserves_rows -v`. Expected feature failure: SQLite cannot find `content_reviewed_at` after initialization.

- [ ] **Step 3: Minimal migration.** In `server/database/learning_persistence.py`, add `self._ensure_revision_review_column(conn)` after `_ensure_quiz_attempts_revision_column(conn)` in initialization. Do **not** add the column directly to CREATE TABLE: both new and old databases must pass through the same one-time absent-column branch. Add this method:

```python
    def _ensure_revision_review_column(
        self, conn: sqlite3.Connection,
    ) -> None:
        """Add explicit reading metadata once, preserving intentional nulls."""
        columns = {
            row["name"]
            for row in conn.execute(
                "PRAGMA table_info(revision_node_progress)"
            ).fetchall()
        }
        if "content_reviewed_at" in columns:
            return
        conn.execute(
            "ALTER TABLE revision_node_progress "
            "ADD COLUMN content_reviewed_at TIMESTAMP"
        )
        conn.execute(
            """
            UPDATE revision_node_progress
            SET content_reviewed_at = COALESCE(
                reviewed_at,
                (SELECT started_at FROM revision_sessions
                 WHERE id = revision_node_progress.revision_session_id)
            )
            WHERE status = 'reviewed'
              AND revision_session_id IN (
                  SELECT id FROM revision_sessions WHERE mode = 'full_review'
              )
            """
        )
```

- [ ] **Step 4: GREEN.** Repeat the exact Step 2 command; expect one passing test. Also run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite -v`.
- [ ] **Step 5: Commit.** `Commit-ReviewParity -Paths @('server/database/learning_persistence.py', 'server/tests/test_revision_sqlite.py') -Message 'feat(review-parity): migrate explicit SQLite review metadata once'`.

### Task 2: Batched, read-only restoration and revision listing

**Files:** Modify `server/database/learning_persistence.py:create_revision_session`, `get_revision_session`, `get_revisions_for_session`; add private projection helpers. Extend `server/tests/test_revision_sqlite.py:RevisionSqliteTests`.

- [ ] **Step 1: Add these failing tests.**

```python
    def test_restore_latest_results_and_list_use_own_attempts(self) -> None:
        revision_id = self.revision()
        other = self.revision()
        self.seed_attempt(revision_id, 4, 1, "q1-1", False, SECOND)
        self.seed_attempt(revision_id, 2, 0, "q0-0", True)
        self.seed_attempt(revision_id, 5, 1, "q1-0", True, THIRD, "tie-a")
        self.seed_attempt(revision_id, 5, 1, "q1-1", False, THIRD, "tie-z")
        self.seed_attempt(other, 20, 0, "q0-1", False)
        self.seed_attempt(revision_id, 100, 7, "q0-0", True)
        self.seed_attempt(revision_id, 101, 0, "deleted-id", False)
        self.seed_attempt(revision_id, 102, None, "q0-0", True)
        before = self.snapshot()
        restored = self.manager.get_revision_session(revision_id)
        node = restored["nodes"][0]
        self.assertEqual(node["quiz_count"], 2)
        self.assertIsNone(node["content_reviewed_at"])
        results = node["quiz_results"]
        self.assertEqual([r["quiz_index"] for r in results], [0, 1])
        self.assertEqual([r["is_correct"] for r in results], [True, False])
        self.assertEqual([r["quiz_attempt_count"] for r in results], [1, 3])
        self.assertEqual(results[1]["id"], "tie-z")
        self.assertEqual(results[1]["selected_option_ids"], ["q1-1"])
        self.assertEqual(results[1]["correct_option_ids"], [])
        self.assertEqual(results[1]["explanation"], "")
        self.assertEqual(results[1]["selected_explanation"], "Explanation q1-1")
        self.assertEqual(node["status"], "quiz_failed")
        self.assertEqual(restored["progress_percent"], 100)
        self.assertEqual(restored["total_quiz_score_percent"], 50)
        excluded = [n for n in restored["notices"]
                    if n["code"] == "incompatible_attempts"]
        self.assertEqual(excluded[0]["attempt_count"], 3)
        listings, count = self.manager.get_revisions_for_session(self.session)
        listed = next(r for r in listings if r["id"] == revision_id)
        self.assertEqual(count, 2)
        for key in ("status", "progress_percent", "total_quiz_score_percent",
                    "completed_at", "notices"):
            self.assertEqual(listed[key], restored[key])
        fresh = self.manager.get_revision_session(self.revision())
        self.assertEqual(fresh["nodes"][0]["quiz_results"], [])
        # Check the previous reads before accounting for the new revision.
        self.assertEqual(self.rows("quiz_attempts"), before["quiz_attempts"])
        self.assertEqual(self.snapshot(original_only=True), {
            key: before[key]
            for key in ("learning_sessions", "concept_nodes", "quiz_data")
        })

    def test_legacy_single_quiz_null_index_and_quizless_nodes(self) -> None:
        revision_id = self.revision("full_review")
        self.execute(
            "UPDATE quiz_data SET payload = ?, format_version = 0 "
            "WHERE node_id = ?",
            (make_quiz("legacy").model_dump_json(), self.node),
        )
        self.seed_attempt(revision_id, 1, None, "legacy-0", True)
        restored = self.manager.get_revision_session(revision_id)
        self.assertEqual(restored["nodes"][0]["quiz_count"], 1)
        self.assertEqual(
            restored["nodes"][0]["quiz_results"][0]["quiz_index"], 0
        )
        self.assertEqual(restored["nodes"][0]["status"], "pending")
        self.execute("DELETE FROM quiz_data WHERE node_id = ?", (self.node,))
        practice = self.manager.get_revision_session(self.revision())
        self.assertEqual(practice["progress_percent"], 0)
        self.assertEqual(practice["status"], "in_progress")
        self.assertIsNone(practice["total_quiz_score_percent"])
        self.assertEqual(practice["nodes"][0]["quiz_count"], 0)
        self.assertEqual(practice["nodes"][0]["quiz_results"], [])

    def test_reads_are_read_only_and_batched_for_large_revision_lists(
        self,
    ) -> None:
        for sequence in range(1, 13):
            self.manager.create_concept_node(
                self.session, sequence, f"Topic {sequence}", "# Original",
                NodeStatus.COMPLETED,
                quiz_set=QuizSet(quizzes=[make_quiz(f"extra-{sequence}")]),
            )
        revision_id = self.revision()
        for _ in range(7):
            self.revision()
        before = self.snapshot()
        statements = []
        real_connect = self.manager._get_connection

        def traced_connect() -> sqlite3.Connection:
            connection = real_connect()
            connection.set_trace_callback(statements.append)
            return connection

        with patch.object(self.manager, "_get_connection", traced_connect):
            self.manager.get_revision_session(revision_id)
            gets = [s for s in statements
                    if s.lstrip().upper().startswith("SELECT")]
            self.assertLessEqual(len(gets), 4)
            statements.clear()
            self.manager.get_revisions_for_session(self.session)
            lists = [s for s in statements
                     if s.lstrip().upper().startswith("SELECT")]
            self.assertLessEqual(len(lists), 5)
        self.assertEqual(self.snapshot(), before)
```

- [ ] **Step 2: RED.** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite.RevisionSqliteTests.test_restore_latest_results_and_list_use_own_attempts server.tests.test_revision_sqlite.RevisionSqliteTests.test_legacy_single_quiz_null_index_and_quizless_nodes server.tests.test_revision_sqlite.RevisionSqliteTests.test_reads_are_read_only_and_batched_for_large_revision_lists -v`. Expect missing `quiz_count`/`quiz_results` and incorrect stored aggregates, not syntax errors.

- [ ] **Step 3: Add these complete helpers and read integrations.** Import the following in `server/database/learning_persistence.py` (retain existing imports):

```python
from server.schemas.learning import (
    RevisionSessionResponse,
    RevisionSessionWithProgress,
    RevisionSummary,
)
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
```

Add these private methods inside `LearningManager`. Do not call normal-learning getters here; those open another connection and often query per node.

```python
    def _revision_quizzes(self, raw: Optional[str]) -> tuple[QuizCard, ...]:
        """Decode available quizzes without changing persisted quiz data."""
        if raw is None:
            return ()
        try:
            payload = json.loads(raw)
            if isinstance(payload, dict) and "quizzes" in payload:
                return tuple(QuizSet.model_validate(payload).quizzes)
            try:
                return (QuizCard.model_validate(payload),)
            except ValidationError:
                # Existing deterministic legacy-ID conversion; no label-based
                # remapping of stored selections is ever performed.
                return tuple(convert_legacy_to_quiz_set(payload).quizzes)
        except (ValueError, TypeError, AttributeError):
            logger.warning("Ignoring incompatible revision quiz payload")
            return ()

    def _load_revision_batch(
        self, conn: sqlite3.Connection, revisions: list[sqlite3.Row],
    ) -> dict[str, tuple[RevisionProjectionInput,
                         list[RevisionNodeInput], list[RevisionAttemptInput]]]:
        """Load a page's progress, quiz data, and attempts in two queries."""
        if not revisions:
            return {}
        by_id = {row["id"]: row for row in revisions}
        placeholders = ",".join("?" for _ in revisions)
        ids = tuple(by_id)
        progress = conn.execute(
            f"""
            SELECT p.*, n.title AS node_title, n.sequence_index,
                   n.learning_session_id, q.payload
            FROM revision_node_progress p
            JOIN concept_nodes n ON n.id = p.node_id
            LEFT JOIN quiz_data q ON q.node_id = n.id
            WHERE p.revision_session_id IN ({placeholders})
            ORDER BY n.sequence_index, n.id
            """, ids,
        ).fetchall()
        nodes: dict[str, list[RevisionNodeInput]] = {i: [] for i in ids}
        for row in progress:
            revision_id = row["revision_session_id"]
            if row["learning_session_id"] != by_id[revision_id][
                "original_session_id"
            ]:
                raise LookupError("Revision node does not belong to its course")
            nodes[revision_id].append(RevisionNodeInput(
                id=row["id"], revision_session_id=revision_id,
                node_id=row["node_id"], node_title=row["node_title"],
                sequence_index=int(row["sequence_index"]),
                quizzes=self._revision_quizzes(row["payload"]),
                stored_status=row["status"],
                reviewed_at=(normalize_revision_timestamp(row["reviewed_at"])
                             if row["reviewed_at"] is not None else None),
                explicit_review_present=True,
                content_reviewed_at=(normalize_revision_timestamp(
                    row["content_reviewed_at"]
                ) if row["content_reviewed_at"] is not None else None),
            ))
        attempt_rows = conn.execute(
            "SELECT * FROM quiz_attempts "
            f"WHERE revision_session_id IN ({placeholders})", ids,
        ).fetchall()
        attempts: dict[str, list[RevisionAttemptInput]] = {i: [] for i in ids}
        for row in attempt_rows:
            attempts[row["revision_session_id"]].append(RevisionAttemptInput(
                id=row["id"], revision_session_id=row["revision_session_id"],
                node_id=row["node_id"], attempt_number=row["attempt_number"],
                quiz_index=row["quiz_index"],
                selected_option_ids=normalize_selected_option_ids(
                    row["selected_option_id"]
                ),
                is_correct=bool(row["is_correct"]),
                score_percent=row["score_percent"],
                created_at=normalize_revision_timestamp(row["created_at"]),
            ))
        return {
            row["id"]: (
                RevisionProjectionInput(
                    id=row["id"], mode=row["mode"],
                    started_at=normalize_revision_timestamp(row["started_at"]),
                    stored_status=row["status"],
                    stored_completed_at=(normalize_revision_timestamp(
                        row["completed_at"]
                    ) if row["completed_at"] is not None else None),
                ), nodes[row["id"]], attempts[row["id"]],
            )
            for row in revisions
        }

    def _project_revision_row(
        self, conn: sqlite3.Connection, row: sqlite3.Row,
    ) -> tuple[RevisionProjection, list[RevisionNodeInput]]:
        """Project one revision from connection-local batched inputs."""
        revision, nodes, attempts = self._load_revision_batch(conn, [row])[
            row["id"]
        ]
        return project_revision(
            revision=revision, nodes=nodes, attempts=attempts
        ), nodes

    def _revision_payload(
        self, row: sqlite3.Row, projection: RevisionProjection,
        with_nodes: bool = True,
    ) -> Dict[str, Any]:
        """Serialize P1 fields identically for create, GET, and list."""
        payload = {
            "id": row["id"],
            "original_session_id": row["original_session_id"],
            "revision_number": row["revision_number"],
            "mode": row["mode"], "status": projection.status,
            "progress_percent": projection.progress_percent,
            "total_quiz_score_percent": projection.total_quiz_score_percent,
            "started_at": normalize_revision_timestamp(row["started_at"]),
            "completed_at": projection.completed_at,
            "notices": [n.model_dump(mode="json") for n in projection.notices],
        }
        if with_nodes:
            payload["nodes"] = [
                n.model_dump(mode="json") for n in projection.nodes
            ]
            return RevisionSessionWithProgress.model_validate(
                payload
            ).model_dump(mode="json")
        return RevisionSessionResponse.model_validate(
            payload
        ).model_dump(mode="json")

    def get_revision_session(
        self, revision_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Read authoritative revision details without writing caches."""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM revision_sessions WHERE id = ?",
                (revision_id,),
            ).fetchone()
            if row is None:
                return None
            projection, _ = self._project_revision_row(conn, row)
            return self._revision_payload(row, projection)
        finally:
            conn.close()

    def get_revisions_for_session(
        self, session_id: str, limit: int = 20, offset: int = 0,
    ) -> tuple[List[Dict[str, Any]], int]:
        """Batch-project a paginated revision history without writes."""
        conn = self._get_connection()
        try:
            total = conn.execute(
                "SELECT COUNT(*) FROM revision_sessions "
                "WHERE original_session_id = ?", (session_id,),
            ).fetchone()[0]
            rows = conn.execute(
                "SELECT * FROM revision_sessions WHERE original_session_id = ? "
                "ORDER BY started_at DESC, revision_number DESC, id DESC "
                "LIMIT ? OFFSET ?",
                (session_id, max(limit, 0), max(offset, 0)),
            ).fetchall()
            batch = self._load_revision_batch(conn, rows)
            payloads = []
            for row in rows:
                revision, nodes, attempts = batch[row["id"]]
                projection = project_revision(
                    revision=revision, nodes=nodes, attempts=attempts
                )
                payloads.append(self._revision_payload(
                    row, projection, with_nodes=False
                ))
            return payloads, total
        finally:
            conn.close()
```

At the end of `create_revision_session`, replace its hand-built return dictionary and move `conn.commit()` **after** assembling the response using the same connection (do not change the existing completed-course eligibility query or IDs):

```python
            row = conn.execute(
                "SELECT * FROM revision_sessions WHERE id = ?",
                (revision_id,),
            ).fetchone()
            projection, _ = self._project_revision_row(conn, row)
            payload = self._revision_payload(row, projection)
            conn.commit()
            return payload
```

Remove the now-unused `progress_rows` list/append block from this method only; retain its INSERT loop and existing transaction ownership. New rows get null explicit-review metadata through the column default. No original node/session update is added.

- [ ] **Step 4: GREEN.** Repeat the exact Step 2 command; expect three passing tests. Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite server.tests.test_revision_progress -v`.
- [ ] **Step 5: Commit.** `Commit-ReviewParity -Paths @('server/database/learning_persistence.py', 'server/tests/test_revision_sqlite.py') -Message 'feat(review-parity): batch-project SQLite revision restoration and history'`.

### Task 3: Validated append-only quiz writes and atomic reconciliation

**Files:** Modify `server/database/learning_persistence.py:submit_revision_quiz`, `_update_revision_progress`; add revision-only validation/write-preparation helpers. Extend `server/tests/test_revision_sqlite.py:RevisionSqliteTests`.

- [ ] **Step 1: Add these exact tests.**

```python
    def test_submit_restores_complete_identity_and_practice_coverage(
        self,
    ) -> None:
        revision_id = self.revision()
        original = self.snapshot(original_only=True)
        correct = self.manager.submit_revision_quiz(
            revision_id, self.node, ["q0-0"], 0
        )
        self.assertEqual(correct["revision_session_id"], revision_id)
        self.assertEqual(correct["node_id"], self.node)
        self.assertEqual(correct["quiz_index"], 0)
        self.assertEqual(correct["attempt_number"], 1)
        self.assertEqual(correct["quiz_attempt_count"], 1)
        self.assertEqual(correct["score_percent"], 100)
        self.assertEqual(correct["correct_option_ids"], ["q0-0"])
        self.assertIsNone(correct["selected_explanation"])
        self.assertEqual(correct["revision_node_status"], "pending")
        partial = self.manager.get_revision_session(revision_id)
        self.assertEqual(partial["progress_percent"], 0)
        wrong = self.manager.submit_revision_quiz(
            revision_id, self.node, ["q1-1"], 1
        )
        self.assertEqual(wrong["revision_node_status"], "quiz_failed")
        self.assertEqual(wrong["correct_option_ids"], [])
        self.assertEqual(wrong["explanation"], "")
        self.assertEqual(wrong["selected_explanation"], "Explanation q1-1")
        complete = self.manager.get_revision_session(revision_id)
        self.assertEqual(complete["status"], "completed")
        self.assertEqual(complete["progress_percent"], 100)
        self.assertEqual(complete["total_quiz_score_percent"], 50)
        self.assertEqual(complete["nodes"][0]["quiz_results"], [
            {k: v for k, v in correct.items()
             if k != "revision_node_status"},
            {k: v for k, v in wrong.items()
             if k != "revision_node_status"},
        ])
        saved = self.rows("quiz_attempts")
        retry = self.manager.submit_revision_quiz(
            revision_id, self.node, ["q1-0"], 1
        )
        after = self.manager.get_revision_session(revision_id)
        self.assertEqual(retry["attempt_number"], 3)
        self.assertEqual(retry["quiz_attempt_count"], 2)
        self.assertEqual(retry["revision_node_status"], "quiz_passed")
        self.assertEqual(after["completed_at"], complete["completed_at"])
        self.assertEqual(after["total_quiz_score_percent"], 66)
        by_id = {r[0]: r for r in self.rows("quiz_attempts")}
        self.assertTrue(all(by_id[row[0]] == row for row in saved))
        self.assertEqual(len(by_id), 3)
        self.assertEqual(self.snapshot(original_only=True), original)

    def test_multiple_choice_is_exact_match_and_preserves_ids(self) -> None:
        self.execute(
            "UPDATE quiz_data SET payload = ? WHERE node_id = ?",
            (QuizSet(quizzes=[make_quiz("multi", True)]).model_dump_json(),
             self.node),
        )
        revision_id = self.revision()
        partial = self.manager.submit_revision_quiz(
            revision_id, self.node, ["multi-0"], 0
        )
        self.assertFalse(partial["is_correct"])
        self.assertEqual(partial["correct_option_ids"], [])
        result = self.manager.submit_revision_quiz(
            revision_id, self.node, ["multi-2", "multi-0"], 0
        )
        self.assertTrue(result["is_correct"])
        self.assertEqual(result["selected_option_ids"], ["multi-2", "multi-0"])
        self.assertEqual(result["correct_option_ids"], ["multi-0", "multi-2"])
        self.assertEqual(result["quiz_attempt_count"], 2)
        self.assertEqual(self.manager.get_revision_session(revision_id)[
            "nodes"
        ][0]["quiz_results"][0]["id"], result["id"])

    def test_invalid_submissions_write_nothing(self) -> None:
        revision_id = self.revision()
        self.manager.submit_revision_quiz(revision_id, self.node, ["q0-1"], 0)
        cases = (
            ("missing", self.node, ["q0-0"], 0, LookupError),
            (revision_id, "missing", ["q0-0"], 0, LookupError),
            (revision_id, self.node, ["q0-0"], -1, ValueError),
            (revision_id, self.node, ["q0-0"], 2, ValueError),
            (revision_id, self.node, ["A"], 0, ValueError),
            (revision_id, self.node, [], 0, ValueError),
            (revision_id, self.node, ["q0-0", "q0-0"], 0, ValueError),
            (revision_id, self.node, ["q0-0", "q0-1"], 0, ValueError),
            (revision_id, self.node, ["q1-0"], 0, ValueError),
        )
        for rid, node, ids, index, error in cases:
            with self.subTest(index=index, ids=ids, node=node, rid=rid):
                before = self.snapshot()
                with self.assertRaises(error):
                    self.manager.submit_revision_quiz(rid, node, ids, index)
                self.assertEqual(self.snapshot(), before)
        # Missing membership even when the node belongs to the course.
        extra = self.manager.create_concept_node(
            self.session, 1, "Not participating", "# Original",
            NodeStatus.COMPLETED, quiz=make_quiz("extra"),
        )["id"]
        before = self.snapshot()
        with self.assertRaises(LookupError):
            self.manager.submit_revision_quiz(
                revision_id, extra, ["extra-0"], 0
            )
        self.assertEqual(self.snapshot(), before)
        # Corrupt membership cannot authorize a different original course.
        other_session = self.manager.create_learning_session("Other", "Other")[
            "id"
        ]
        foreign = self.manager.create_concept_node(
            other_session, 0, "Foreign", "# Original", NodeStatus.COMPLETED,
            quiz=make_quiz("foreign"),
        )["id"]
        self.execute(
            "INSERT INTO revision_node_progress "
            "(id, revision_session_id, node_id, status) VALUES (?, ?, ?, ?)",
            ("foreign-progress", revision_id, foreign, "pending"),
        )
        before = self.snapshot()
        with self.assertRaises(LookupError):
            self.manager.submit_revision_quiz(
                revision_id, foreign, ["foreign-0"], 0
            )
        self.assertEqual(self.snapshot(), before)

    def test_failed_aggregate_update_rolls_back_attempt_and_metadata(
        self,
    ) -> None:
        revision_id = self.revision()
        self.seed_attempt(revision_id, 1, 0, "q0-1", False)
        self.execute(
            "UPDATE revision_sessions SET status = 'completed', "
            "progress_percent = 100, completed_at = ? WHERE id = ?",
            (THIRD, revision_id),
        )
        before = self.snapshot()
        with patch.object(
            self.manager, "_update_revision_progress",
            side_effect=sqlite3.OperationalError("injected write failure"),
        ):
            with self.assertRaises(sqlite3.OperationalError):
                self.manager.submit_revision_quiz(
                    revision_id, self.node, ["q1-0"], 1
                )
        self.assertEqual(self.snapshot(), before)
```

- [ ] **Step 2: RED.** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite.RevisionSqliteTests.test_submit_restores_complete_identity_and_practice_coverage server.tests.test_revision_sqlite.RevisionSqliteTests.test_multiple_choice_is_exact_match_and_preserves_ids server.tests.test_revision_sqlite.RevisionSqliteTests.test_invalid_submissions_write_nothing server.tests.test_revision_sqlite.RevisionSqliteTests.test_failed_aggregate_update_rolls_back_attempt_and_metadata -v`. Expected: missing attempt identity, sticky pass/incomplete coverage, duplicate/cardinality requests recorded instead of rejected. The rollback case may already pass; retain it as a guard.

- [ ] **Step 3: Replace revision submit/reconciliation with the following.** Add the three private helpers and replace the two existing methods. This deliberately does not call `create_quiz_attempt`: that function couples normal mastery and opens per-node quiz reads. It remains unchanged for normal learning except the narrow query fixes in Task 6.

```python
    def _require_revision_row(
        self, conn: sqlite3.Connection, revision_id: str,
    ) -> sqlite3.Row:
        """Require an existing revision on the caller's connection."""
        row = conn.execute(
            "SELECT * FROM revision_sessions WHERE id = ?", (revision_id,),
        ).fetchone()
        if row is None:
            raise LookupError("Revision session not found")
        return row

    def _require_revision_member(
        self, nodes: list[RevisionNodeInput], node_id: str,
    ) -> RevisionNodeInput:
        """Require a participating node, not merely a course node."""
        node = next((n for n in nodes if n.node_id == node_id), None)
        if node is None:
            raise LookupError("Revision node not found")
        return node

    def _prepare_revision_write(
        self, conn: sqlite3.Connection, revision_id: str,
        before: RevisionProjection,
    ) -> None:
        """Invalidate disproven completion only within a valid transaction."""
        if before.status != "completed":
            conn.execute(
                "UPDATE revision_sessions SET completed_at = NULL "
                "WHERE id = ?", (revision_id,),
            )

    def submit_revision_quiz(
        self, revision_id: str, node_id: str,
        selected_option_ids: List[str], quiz_index: int = 0,
    ) -> Dict[str, Any]:
        """Validate then append one attempt and reconcile atomically.

        Args:
            revision_id: Owning revision identifier.
            node_id: Participating concept node identifier.
            selected_option_ids: Nonempty stable option IDs.
            quiz_index: Zero-based index of an available quiz.
        Returns:
            Complete immediate P1 attempt payload with aggregate topic status.
        Raises:
            LookupError: Revision or course-owned membership is missing.
            ValueError: Quiz index or selection is invalid.
            sqlite3.Error: The transaction fails; no partial write is saved.
        """
        conn = self._get_connection()
        try:
            row = self._require_revision_row(conn, revision_id)
            before, nodes = self._project_revision_row(conn, row)
            node = self._require_revision_member(nodes, node_id)
            if quiz_index < 0 or quiz_index >= len(node.quizzes):
                raise ValueError("Quiz index is outside available quizzes")
            correct = evaluate_revision_selection(
                node.quizzes[quiz_index], selected_option_ids
            )
            # No write occurs before every membership/range/ID check above.
            self._prepare_revision_write(conn, revision_id, before)
            number = conn.execute(
                "SELECT COALESCE(MAX(attempt_number), 0) + 1 "
                "FROM quiz_attempts WHERE node_id = ?", (node_id,),
            ).fetchone()[0]
            attempt_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            stored_ids = (selected_option_ids[0]
                          if len(selected_option_ids) == 1
                          else json.dumps(selected_option_ids))
            conn.execute(
                "INSERT INTO quiz_attempts "
                "(id, node_id, attempt_number, quiz_index, "
                "revision_session_id, "
                "selected_option_id, is_correct, score_percent, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (attempt_id, node_id, number, quiz_index, revision_id,
                 stored_ids, int(correct), 100 if correct else 0, now),
            )
            projection = self._update_revision_progress(revision_id, conn)
            projected_node = next(
                n for n in projection.nodes if n.node_id == node_id
            )
            result = next(
                r for r in projected_node.quiz_results if r.id == attempt_id
            ).model_dump(mode="json")
            result["revision_node_status"] = projected_node.status
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _update_revision_progress(
        self, revision_id: str,
        conn: Optional[sqlite3.Connection] = None,
    ) -> RevisionProjection:
        """Persist projection caches, sharing the attempt/review transaction."""
        owns_connection = conn is None
        active_conn = conn or self._get_connection()
        try:
            row = self._require_revision_row(active_conn, revision_id)
            projection, _ = self._project_revision_row(active_conn, row)
            for node in projection.nodes:
                active_conn.execute(
                    "UPDATE revision_node_progress SET status = ? "
                    "WHERE id = ? AND revision_session_id = ?",
                    (node.status, node.id, revision_id),
                )
            active_conn.execute(
                "UPDATE revision_sessions SET status = ?, "
                "progress_percent = ?, total_quiz_score_percent = ?, "
                "completed_at = ? WHERE id = ?",
                (projection.status, projection.progress_percent,
                 projection.total_quiz_score_percent,
                 projection.completed_at.isoformat()
                 if projection.completed_at is not None else None,
                 revision_id),
            )
            if owns_connection:
                active_conn.commit()
            return projection
        except Exception:
            if owns_connection:
                active_conn.rollback()
            raise
        finally:
            if owns_connection:
                active_conn.close()
```

Retain existing connection policy and commit ownership; do not add a nested connection or a new transaction framework. An attempt and all cache updates share one `conn`, one commit, and rollback. No original timestamps, content, statuses, shuffle seeds, or quiz cursors are written.

- [ ] **Step 4: GREEN.** Repeat the exact Step 2 command; expect four passing tests. Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite -v`.
- [ ] **Step 5: Commit.** `Commit-ReviewParity -Paths @('server/database/learning_persistence.py', 'server/tests/test_revision_sqlite.py') -Message 'feat(review-parity): append validated SQLite revision attempts atomically'`.

### Task 4: First-timestamp review, independent reading, and full node return

**Files:** Modify `server/database/learning_persistence.py:mark_revision_node_reviewed`; extend `server/tests/test_revision_sqlite.py:RevisionSqliteTests`.

- [ ] **Step 1: Add these failing tests.**

```python
    def test_full_review_is_explicit_idempotent_and_independent(self) -> None:
        revision_id = self.revision("full_review")
        original = self.snapshot(original_only=True)
        correct = self.manager.submit_revision_quiz(
            revision_id, self.node, ["q0-0"], 0
        )
        self.assertEqual(correct["revision_node_status"], "pending")
        self.assertEqual(self.manager.get_revision_session(revision_id)[
            "progress_percent"
        ], 0)
        first = self.manager.mark_revision_node_reviewed(revision_id, self.node)
        self.assertEqual(first["status"], "reviewed")
        self.assertIsNotNone(first["content_reviewed_at"])
        self.assertEqual(first["quiz_count"], 2)
        self.assertEqual(first, self.manager.get_revision_session(revision_id)[
            "nodes"
        ][0])
        completed = self.manager.get_revision_session(revision_id)[
            "completed_at"
        ]
        second = self.manager.mark_revision_node_reviewed(
            revision_id, self.node
        )
        self.assertEqual(second, first)
        wrong = self.manager.submit_revision_quiz(
            revision_id, self.node, ["q1-1"], 1
        )
        self.assertEqual(wrong["revision_node_status"], "reviewed")
        after = self.manager.get_revision_session(revision_id)
        self.assertEqual(after["nodes"][0]["content_reviewed_at"],
                         first["content_reviewed_at"])
        self.assertEqual(after["completed_at"], completed)
        self.assertEqual(after["progress_percent"], 100)
        self.assertEqual(self.snapshot(original_only=True), original)

    def test_review_failure_and_practice_rejection_write_nothing(self) -> None:
        practice = self.revision()
        review = self.revision("full_review")
        for revision_id, node, error in (
            (practice, self.node, ValueError),
            ("missing", self.node, LookupError),
            (review, "missing", LookupError),
        ):
            before = self.snapshot()
            with self.assertRaises(error):
                self.manager.mark_revision_node_reviewed(revision_id, node)
            self.assertEqual(self.snapshot(), before)
        before = self.snapshot()
        with patch.object(
            self.manager, "_update_revision_progress",
            side_effect=sqlite3.OperationalError("injected review failure"),
        ):
            with self.assertRaises(sqlite3.OperationalError):
                self.manager.mark_revision_node_reviewed(review, self.node)
        self.assertEqual(self.snapshot(), before)

    def test_quizless_full_review_can_complete_but_practice_cannot(
        self,
    ) -> None:
        self.execute("DELETE FROM quiz_data WHERE node_id = ?", (self.node,))
        review = self.revision("full_review")
        node = self.manager.mark_revision_node_reviewed(review, self.node)
        self.assertEqual(node["quiz_count"], 0)
        self.assertEqual(node["quiz_results"], [])
        self.assertEqual(self.manager.get_revision_session(review)["status"],
                         "completed")
        practice = self.revision()
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.manager.submit_revision_quiz(practice, self.node, ["q0-0"], 0)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.manager.get_revision_session(practice)["status"],
                         "in_progress")
```

- [ ] **Step 2: RED.** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite.RevisionSqliteTests.test_full_review_is_explicit_idempotent_and_independent server.tests.test_revision_sqlite.RevisionSqliteTests.test_review_failure_and_practice_rejection_write_nothing server.tests.test_revision_sqlite.RevisionSqliteTests.test_quizless_full_review_can_complete_but_practice_cannot -v`. Expect missing explicit-review fields and legacy review writes that do not complete P1 reading; no type/import failure.

- [ ] **Step 3: Replace `mark_revision_node_reviewed` with this implementation.**

```python
    def mark_revision_node_reviewed(
        self, revision_id: str, node_id: str,
    ) -> Dict[str, Any]:
        """Mark explicit reading once and return the complete restored node.

        Args:
            revision_id: Owning Full Review revision.
            node_id: Participating concept node identifier.
        Returns:
            The same node-details shape as revision GET.
        Raises:
            LookupError: Revision or course-owned membership is missing.
            ValueError: Practice mode does not allow explicit review.
            sqlite3.Error: The write fails without committing partial data.
        """
        conn = self._get_connection()
        try:
            row = self._require_revision_row(conn, revision_id)
            before, nodes = self._project_revision_row(conn, row)
            node = self._require_revision_member(nodes, node_id)
            if row["mode"] != "full_review":
                raise ValueError(
                    "mark-reviewed is only allowed for full_review revisions"
                )
            self._prepare_revision_write(conn, revision_id, before)
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "UPDATE revision_node_progress "
                "SET content_reviewed_at = COALESCE(content_reviewed_at, ?), "
                "reviewed_at = COALESCE(content_reviewed_at, ?) "
                "WHERE id = ? AND revision_session_id = ?",
                (now, now, node.id, revision_id),
            )
            projection = self._update_revision_progress(revision_id, conn)
            result = next(
                n for n in projection.nodes if n.node_id == node_id
            ).model_dump(mode="json")
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
```

- [ ] **Step 4: GREEN.** Repeat the exact Step 2 command; expect three passing tests. Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite -v`.
- [ ] **Step 5: Commit.** `Commit-ReviewParity -Paths @('server/database/learning_persistence.py', 'server/tests/test_revision_sqlite.py') -Message 'feat(review-parity): preserve first explicit SQLite review timestamp'`.

### Task 5: Consistent summaries, zero denominators, and legacy completion recovery

**Files:** Modify `server/database/learning_persistence.py:get_revision_summary`; extend `server/tests/test_revision_sqlite.py:RevisionSqliteTests`.

- [ ] **Step 1: Add these failing tests.**

```python
    def test_summary_history_and_get_share_accuracy_and_completion_clock(
        self,
    ) -> None:
        revision_id = self.revision()
        self.seed_attempt(revision_id, 1, 0, "q0-0", True, FIRST)
        self.seed_attempt(revision_id, 2, 1, "q1-1", False, SECOND)
        self.seed_attempt(revision_id, 3, 1, "q1-0", True, THIRD)
        self.seed_attempt(revision_id, 4, 9, "q0-0", True, THIRD)
        self.manager.create_quiz_attempt(self.node, ["q0-1"], 0)
        other = self.revision()
        self.seed_attempt(other, 8, 0, "q0-0", True, FIRST)
        self.execute(
            "UPDATE revision_sessions SET progress_percent = 3, "
            "total_quiz_score_percent = 99 WHERE id = ?", (revision_id,),
        )
        before = self.snapshot()
        restored = self.manager.get_revision_session(revision_id)
        summary = self.manager.get_revision_summary(revision_id)
        listed = next(r for r in self.manager.get_revisions_for_session(
            self.session
        )[0] if r["id"] == revision_id)
        self.assertEqual(summary["quizzes_passed"], 2)
        self.assertEqual(summary["quizzes_failed"], 1)
        self.assertEqual(summary["quizzes_total"], 3)
        self.assertEqual(summary["nodes_reviewed"], 1)
        self.assertEqual(summary["nodes_total"], 1)
        self.assertEqual(summary["time_spent_seconds"], 7200)
        self.assertEqual(summary["comparison"], {
            "original_quiz_score_percent": 0, "improvement_percent": 66,
        })
        for key in ("progress_percent", "total_quiz_score_percent", "notices"):
            self.assertEqual(summary[key], restored[key])
            self.assertEqual(listed[key], restored[key])
        self.assertEqual(restored["total_quiz_score_percent"], 66)
        self.assertEqual(normalize_revision_timestamp(restored["completed_at"]),
                         normalize_revision_timestamp(SECOND))
        self.assertEqual(self.snapshot(), before)

    def test_legacy_completion_is_hidden_then_reconciled_on_valid_write(
        self,
    ) -> None:
        revision_id = self.revision()
        self.seed_attempt(revision_id, 1, 0, "q0-0", True, FIRST)
        future = "2099-01-01T00:00:00+00:00"
        self.execute(
            "UPDATE revision_sessions SET status = 'completed', "
            "progress_percent = 100, completed_at = ? WHERE id = ?",
            (future, revision_id),
        )
        self.execute(
            "UPDATE revision_node_progress SET status = 'quiz_passed', "
            "reviewed_at = ? WHERE revision_session_id = ?",
            (FIRST, revision_id),
        )
        before = self.snapshot()
        restored = self.manager.get_revision_session(revision_id)
        summary = self.manager.get_revision_summary(revision_id)
        self.assertEqual(restored["status"], "in_progress")
        self.assertIsNone(restored["completed_at"])
        self.assertEqual(summary["progress_percent"], 0)
        self.assertIsNone(summary["time_spent_seconds"])
        self.assertIn("completion_recalculated", [
            n["code"] for n in restored["notices"]
        ])
        self.assertEqual(self.snapshot(), before)
        with self.assertRaises(ValueError):
            self.manager.submit_revision_quiz(revision_id, self.node, ["A"], 1)
        self.assertEqual(self.snapshot(), before)
        self.manager.submit_revision_quiz(revision_id, self.node, ["q1-1"], 1)
        completed = self.manager.get_revision_session(revision_id)
        self.assertEqual(completed["status"], "completed")
        self.assertNotEqual(
            normalize_revision_timestamp(completed["completed_at"]),
            normalize_revision_timestamp(future),
        )
        self.manager.submit_revision_quiz(revision_id, self.node, ["q1-0"], 1)
        self.assertEqual(self.manager.get_revision_session(revision_id)[
            "completed_at"
        ], completed["completed_at"])

    def test_legacy_quiz_timestamp_does_not_infer_explicit_review(self) -> None:
        revision_id = self.revision("full_review")
        self.execute(
            "UPDATE revision_node_progress SET status = 'quiz_passed', "
            "reviewed_at = ? WHERE revision_session_id = ?",
            (FIRST, revision_id),
        )
        restored = self.manager.get_revision_session(revision_id)
        self.assertEqual(restored["nodes"][0]["status"], "pending")
        self.assertIsNone(restored["nodes"][0]["content_reviewed_at"])
        self.assertIn("legacy_review_required", [
            n["code"] for n in restored["notices"]
        ])
        reviewed = self.manager.mark_revision_node_reviewed(
            revision_id, self.node
        )
        self.assertNotEqual(normalize_revision_timestamp(
            reviewed["content_reviewed_at"]
        ), normalize_revision_timestamp(FIRST))

    def test_empty_and_quizless_summary_denominators(self) -> None:
        quizless_node = self.manager.create_concept_node(
            self.session, 1, "Reading only", "# No quiz", NodeStatus.COMPLETED,
        )["id"]
        practice = self.revision()
        self.seed_attempt(practice, 1, 0, "q0-1", False)
        self.seed_attempt(practice, 2, 1, "q1-1", False, SECOND)
        summary = self.manager.get_revision_summary(practice)
        self.assertEqual(summary["nodes_total"], 1)
        self.assertEqual(summary["nodes_reviewed"], 1)
        self.assertEqual(summary["total_quiz_score_percent"], 0)
        self.assertEqual(len(self.manager.get_revision_session(practice)[
            "nodes"
        ]), 2)
        review = self.revision("full_review")
        self.manager.mark_revision_node_reviewed(review, quizless_node)
        self.assertEqual(
            self.manager.get_revision_summary(review)["nodes_total"], 2
        )
        self.execute("DELETE FROM quiz_data WHERE node_id = ?", (self.node,))
        no_quizzes = self.revision()
        no_quiz_summary = self.manager.get_revision_summary(no_quizzes)
        self.assertEqual(no_quiz_summary["nodes_total"], 0)
        self.assertEqual(no_quiz_summary["progress_percent"], 0)
        self.assertIsNone(no_quiz_summary["total_quiz_score_percent"])
        empty = self.revision("full_review")
        self.execute(
            "DELETE FROM revision_node_progress WHERE revision_session_id = ?",
            (empty,),
        )
        empty_summary = self.manager.get_revision_summary(empty)
        self.assertEqual(empty_summary["nodes_total"], 0)
        self.assertEqual(empty_summary["progress_percent"], 0)
        self.assertIsNone(empty_summary["time_spent_seconds"])
        self.assertIsNone(empty_summary["total_quiz_score_percent"])
        self.assertEqual(self.manager.get_revision_session(empty)["status"],
                         "in_progress")
```

- [ ] **Step 2: RED.** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite.RevisionSqliteTests.test_summary_history_and_get_share_accuracy_and_completion_clock server.tests.test_revision_sqlite.RevisionSqliteTests.test_legacy_completion_is_hidden_then_reconciled_on_valid_write server.tests.test_revision_sqlite.RevisionSqliteTests.test_legacy_quiz_timestamp_does_not_infer_explicit_review server.tests.test_revision_sqlite.RevisionSqliteTests.test_empty_and_quizless_summary_denominators -v`. Expect old summary to include incompatible attempts, cached completion/counts, missing notices, or quizless denominator errors; legacy explicit-review guard may already pass.

- [ ] **Step 3: Replace the entire old summary method with this minimal projection-based implementation.**

```python
    def get_revision_summary(self, revision_id: str) -> Dict[str, Any]:
        """Return authoritative attempt accuracy and completion metrics.

        Args:
            revision_id: Revision identifier.
        Returns:
            Summary using compatible revision attempts and original-only scores.
        Raises:
            LookupError: Revision is missing.
            sqlite3.Error: Reads fail.
        """
        conn = self._get_connection()
        try:
            row = self._require_revision_row(conn, revision_id)
            projection, nodes = self._project_revision_row(conn, row)
            comparison = None
            node_ids = [n.node_id for n in nodes]
            if node_ids and projection.total_quiz_score_percent is not None:
                placeholders = ",".join("?" for _ in node_ids)
                original = conn.execute(
                    "SELECT COUNT(*) AS total, "
                    "COALESCE(SUM(is_correct), 0) AS correct "
                    "FROM quiz_attempts WHERE revision_session_id IS NULL "
                    f"AND node_id IN ({placeholders})", tuple(node_ids),
                ).fetchone()
                if original["total"]:
                    original_score = (
                        original["correct"] * 100 // original["total"]
                    )
                    comparison = {
                        "original_quiz_score_percent": original_score,
                        "improvement_percent": (
                            projection.total_quiz_score_percent - original_score
                        ),
                    }
            return RevisionSummary.model_validate({
                "revision_id": revision_id, "mode": row["mode"],
                "progress_percent": projection.progress_percent,
                "total_quiz_score_percent": projection.total_quiz_score_percent,
                "nodes_reviewed": projection.nodes_completed,
                "nodes_total": projection.nodes_total,
                "quizzes_passed": projection.correct_attempts,
                "quizzes_failed": projection.incorrect_attempts,
                "quizzes_total": projection.total_attempts,
                "time_spent_seconds": projection.time_spent_seconds,
                "comparison": comparison,
                "notices": [n.model_dump(mode="json")
                            for n in projection.notices],
            }).model_dump(mode="json")
        finally:
            conn.close()
```

- [ ] **Step 4: GREEN.** Repeat the exact Step 2 command; expect four passing tests. Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite server.tests.test_revision_progress server.tests.test_revision_contracts -v`.
- [ ] **Step 5: Commit.** `Commit-ReviewParity -Paths @('server/database/learning_persistence.py', 'server/tests/test_revision_sqlite.py') -Message 'fix(review-parity): unify SQLite revision summary accuracy and clocks'`.

### Task 6: Isolate original feedback/mastery, preserve its existing policy

**Files:** Modify `server/database/learning_persistence.py:get_quiz_attempts`, `_check_multi_quiz_mastery`, `check_mastery` only. Extend `server/tests/test_sqlite_repositories.py` narrowly.

- [ ] **Step 1: Add these imports and this standalone test to `SqliteRepositoryTests`.** Keep existing delegation/settings tests. Reuse the fixture class (not a TestCase) from the owned SQLite test module; no new helper file.

```python
from server.tests.test_revision_sqlite import RevisionSqliteFixture, make_quiz
```

```python
    def test_revision_attempts_do_not_enter_original_feedback_or_mastery(
        self,
    ) -> None:
        fixture = RevisionSqliteFixture()
        fixture.open_fixture()
        try:
            store = fixture.manager
            repository = SqliteLearningRepository(store)
            revision_id = fixture.revision()
            original = fixture.snapshot(original_only=True)
            repository.submit_revision_quiz(
                revision_id, fixture.node, ["q0-0"], 0
            )
            repository.submit_revision_quiz(
                revision_id, fixture.node, ["q1-0"], 1
            )
            self.assertEqual(repository.get_quiz_attempts(fixture.node)[
                "total_attempts"
            ], 0)
            self.assertFalse(repository.check_mastery(fixture.node))
            self.assertEqual(fixture.snapshot(original_only=True), original)
            first = repository.create_quiz_attempt(fixture.node, ["q0-0"], 0)
            self.assertFalse(first["is_mastered"])
            self.assertFalse(repository.check_mastery(fixture.node))
            second = repository.create_quiz_attempt(fixture.node, ["q1-0"], 1)
            self.assertTrue(second["is_mastered"])
            history = repository.get_quiz_attempts(fixture.node)
            self.assertEqual(history["total_attempts"], 2)
            self.assertEqual([a["id"] for a in history["attempts"]],
                             [first["id"], second["id"]])
            self.assertEqual([a["attempt_number"] for a in history["attempts"]],
                             [3, 4])
            repository.create_quiz_attempt(fixture.node, ["q1-1"], 1)
            self.assertTrue(repository.check_mastery(fixture.node))
            # Single-quiz original policy is still any earlier correct attempt.
            fixture.execute(
                "UPDATE quiz_data SET payload = ?, format_version = 0 "
                "WHERE node_id = ?",
                (make_quiz("q0").model_dump_json(), fixture.node),
            )
            self.assertTrue(repository.check_mastery(fixture.node))
            only_revision = fixture.revision()
            fixture.execute(
                "DELETE FROM quiz_attempts WHERE revision_session_id IS NULL"
            )
            repository.submit_revision_quiz(
                only_revision, fixture.node, ["q0-0"], 0
            )
            self.assertFalse(repository.check_mastery(fixture.node))
            self.assertEqual(repository.get_quiz_attempts(fixture.node)[
                "attempts"
            ], [])
        finally:
            fixture.close_fixture()
```

- [ ] **Step 2: RED.** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_sqlite_repositories.SqliteRepositoryTests.test_revision_attempts_do_not_enter_original_feedback_or_mastery -v`. Expected: history contains two revision attempts or mastery is manufactured by them.

- [ ] **Step 3: Minimal query-only fix.** In `get_quiz_attempts`, change its attempt-history WHERE to:

```sql
WHERE node_id = ? AND revision_session_id IS NULL
ORDER BY attempt_number ASC
```

In `_check_multi_quiz_mastery`, and **both** SELECT branches of `check_mastery`, change the WHERE to:

```sql
WHERE node_id = ? AND is_correct = 1
  AND revision_session_id IS NULL
```

Do not change `_calculate_mastery_from_attempts`, scoring, attempt numbering, unlock transitions, original feedback fields, or original timestamp updates. Leave `MAX(attempt_number)` unfiltered: it is the historical node-wide sequence, not an original-only or per-quiz counter. Existing original mastery remains any previous correct attempt per required quiz, not latest-only.

- [ ] **Step 4: GREEN.** Repeat the exact Step 2 command. Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_sqlite_repositories server.tests.test_revision_sqlite server.tests.test_repository_contracts -v`.
- [ ] **Step 5: Commit.** `Commit-ReviewParity -Paths @('server/database/learning_persistence.py', 'server/tests/test_sqlite_repositories.py') -Message 'fix(review-parity): exclude revisions from original SQLite attempt queries'`.

### Task 7: Real serialized HTTP contract and facade-portable error mapping

**Files:** Create `server/tests/test_revision_api.py`; modify `server/routers/learning.py` revision-handler imports, mark-review response model, and revision exception branches only.

- [ ] **Step 1: Create this complete failing API test module.** All requests execute the router and Pydantic serializer; no test calls a route function directly. The facade resolver is mutable to prove routing remains backend-agnostic; the stand-in backend only tests the fixed port, not Mongo implementation.

```python
"""
============================================================================
FILE: test_revision_api.py
LOCATION: server/tests/test_revision_api.py
============================================================================
PURPOSE:
    Verify actual revision HTTP JSON and generic errors on temporary storage.
ROLE IN PROJECT:
    P2 serialized-contract gate through the existing repository facade.
    - Minimal FastAPI app, no real application lifespan or credentials
    - Temp SQLite integration plus deterministic facade-port failure tests
KEY COMPONENTS:
    - RevisionApiTests: Serialized responses, errors, and no-write guarantees
USAGE:
    server/.venv/Scripts/python.exe -m unittest
    server.tests.test_revision_api -v
============================================================================
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.database.repositories.facade import RepositoryFacade
from server.database.repositories.sqlite import SqliteLearningRepository
from server.routers.learning import router
from server.schemas.learning import (
    RevisionNodeProgressWithDetails,
    RevisionQuizSubmissionResult,
    RevisionSessionListResponse,
    RevisionSessionResponse,
    RevisionSessionWithProgress,
    RevisionSummary,
)
from server.tests.test_revision_sqlite import (
    RevisionSqliteFixture,
    normalize_revision_timestamp,
)


ATTEMPT_KEYS = {
    "id", "revision_session_id", "node_id", "quiz_index", "attempt_number",
    "quiz_attempt_count", "selected_option_ids", "is_correct", "score_percent",
    "correct_option_ids", "explanation", "selected_explanation", "created_at",
}
NODE_KEYS = {
    "id", "node_id", "node_title", "sequence_index", "status", "reviewed_at",
    "content_reviewed_at", "quiz_count", "quiz_results",
}


class RevisionApiTests(RevisionSqliteFixture, unittest.TestCase):
    def setUp(self) -> None:
        self.open_fixture()
        self.holder = SimpleNamespace(current=SqliteLearningRepository(
            self.manager
        ))
        self.facade = RepositoryFacade(lambda: self.holder.current)
        self.patcher = patch(
            "server.routers.learning.learning_manager", self.facade
        )
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def tearDown(self) -> None:
        self.close_fixture()

    def test_serialized_create_submit_get_list_and_summary_contract(
        self,
    ) -> None:
        created = self.client.post(
            f"/learning/sessions/{self.session}/revisions",
            json={"mode": "quiz_only"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        RevisionSessionResponse.model_validate(created.json())
        self.assertEqual(created.json()["notices"], [])
        revision_id = created.json()["id"]
        original = self.snapshot(original_only=True)
        responses = []
        for index, selected in ((0, "q0-0"), (1, "q1-1")):
            response = self.client.post(
                f"/learning/revisions/{revision_id}/nodes/"
                f"{self.node}/submit-quiz",
                json={"selected_option_ids": [selected], "quiz_index": index},
            )
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            RevisionQuizSubmissionResult.model_validate(body)
            self.assertEqual(set(body), ATTEMPT_KEYS | {"revision_node_status"})
            self.assertEqual(body["revision_session_id"], revision_id)
            self.assertEqual(body["node_id"], self.node)
            self.assertEqual(body["quiz_index"], index)
            self.assertEqual(body["selected_option_ids"], [selected])
            self.assertIsInstance(body["created_at"], str)
            normalize_revision_timestamp(body["created_at"])
            responses.append(body)
        self.assertEqual(responses[0]["revision_node_status"], "pending")
        self.assertEqual(responses[1]["revision_node_status"], "quiz_failed")
        self.assertEqual(responses[1]["correct_option_ids"], [])
        self.assertEqual(responses[1]["explanation"], "")
        restored = self.client.get(f"/learning/revisions/{revision_id}")
        self.assertEqual(restored.status_code, 200, restored.text)
        body = restored.json()
        RevisionSessionWithProgress.model_validate(body)
        self.assertEqual(set(body["nodes"][0]), NODE_KEYS)
        self.assertEqual(body["nodes"][0]["quiz_results"], [
            {k: v for k, v in result.items() if k != "revision_node_status"}
            for result in responses
        ])
        self.assertEqual(body["nodes"][0]["content_reviewed_at"], None)
        listing = self.client.get(
            f"/learning/sessions/{self.session}/revisions?limit=1&offset=0"
        )
        self.assertEqual(listing.status_code, 200, listing.text)
        RevisionSessionListResponse.model_validate(listing.json())
        summary = self.client.get(f"/learning/revisions/{revision_id}/summary")
        self.assertEqual(summary.status_code, 200, summary.text)
        RevisionSummary.model_validate(summary.json())
        self.assertEqual(summary.json()["quizzes_total"], 2)
        for key in ("progress_percent", "total_quiz_score_percent", "notices"):
            self.assertEqual(summary.json()[key], body[key])
            self.assertEqual(listing.json()["revisions"][0][key], body[key])
        self.assertEqual(self.snapshot(original_only=True), original)

    def test_mark_review_returns_exact_get_node_shape_and_first_timestamp(
        self,
    ) -> None:
        revision_id = self.revision("full_review")
        url = (
            f"/learning/revisions/{revision_id}/nodes/{self.node}/mark-reviewed"
        )
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(set(body), NODE_KEYS)
        RevisionNodeProgressWithDetails.model_validate(body)
        self.assertEqual(body["status"], "reviewed")
        self.assertEqual(self.client.post(url).json(), body)
        restored = self.client.get(f"/learning/revisions/{revision_id}")
        self.assertEqual(body, restored.json()["nodes"][0])

    def test_http_invalid_requests_preserve_all_rows(self) -> None:
        revision_id = self.revision()
        base = f"/learning/revisions/{revision_id}/nodes/{self.node}"
        cases = (
            (f"{base}/submit-quiz",
             {"selected_option_ids": [], "quiz_index": 0}, 422),
            (f"{base}/submit-quiz", {"selected_option_ids": ["q0-0"],
                                   "quiz_index": -1}, 422),
            (f"{base}/submit-quiz", {"selected_option_ids": ["q0-0"],
                                   "quiz_index": 2}, 400),
            (f"{base}/submit-quiz", {"selected_option_ids": ["A"]}, 400),
            (f"{base}/submit-quiz", {"selected_option_ids": ["q0-0", "q0-0"]},
             400),
            (f"{base}/mark-reviewed", {}, 400),
            (f"/learning/revisions/missing/nodes/{self.node}/submit-quiz",
             {"selected_option_ids": ["q0-0"]}, 404),
            (f"/learning/revisions/{revision_id}/nodes/missing/submit-quiz",
             {"selected_option_ids": ["q0-0"]}, 404),
        )
        for url, payload, expected in cases:
            with self.subTest(url=url, payload=payload):
                before = self.snapshot()
                response = self.client.post(url, json=payload)
                self.assertEqual(response.status_code, expected, response.text)
                self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.client.get(
            "/learning/revisions/missing"
        ).status_code, 404)
        self.assertEqual(self.client.get(
            "/learning/revisions/missing/summary"
        ).status_code, 404)

    def test_facade_swap_keeps_revision_node_response_backend_agnostic(
        self,
    ) -> None:
        revision_id = self.revision("full_review")
        expected = self.manager.mark_revision_node_reviewed(
            revision_id, self.node
        )
        calls = []

        def mark_reviewed(*, revision_id: str, node_id: str) -> dict:
            calls.append((revision_id, node_id))
            return expected

        self.holder.current = SimpleNamespace(
            mark_revision_node_reviewed=mark_reviewed
        )
        response = self.client.post(
            f"/learning/revisions/{revision_id}/nodes/{self.node}/mark-reviewed"
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), expected)
        self.assertEqual(calls, [(revision_id, self.node)])

    def test_malformed_backend_result_and_unexpected_errors_are_generic_500(
        self,
    ) -> None:
        revision_id = self.revision("full_review")
        base = f"/learning/revisions/{revision_id}/nodes/{self.node}"

        def broken_result(**kwargs: object) -> dict:
            return {"id": "not-a-contract", "explanation": "private-value"}

        def unexpected(**kwargs: object) -> dict:
            raise RuntimeError("private-value")

        for method in (broken_result, unexpected):
            self.holder.current = SimpleNamespace(
                submit_revision_quiz=method,
                mark_revision_node_reviewed=method,
            )
            for url, payload in (
                (f"{base}/submit-quiz", {"selected_option_ids": ["q0-0"]}),
                (f"{base}/mark-reviewed", {}),
            ):
                with self.subTest(method=method.__name__, url=url):
                    before = self.snapshot()
                    response = self.client.post(url, json=payload)
                    self.assertEqual(response.status_code, 500, response.text)
                    self.assertEqual(response.json(), {
                        "detail": "Internal server error"
                    })
                    self.assertNotIn("private-value", response.text)
                    self.assertEqual(self.snapshot(), before)


def main() -> None:
    unittest.main()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: RED.** Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_api -v`. Expected: mark-reviewed returns 400/validation failure because the old router still demands `revision_session_id` instead of details; malformed backend payload validation is misreported as HTTP 400 (Pydantic `ValidationError` subclasses `ValueError`). Other integration cases can already pass.

- [ ] **Step 3: Minimal router serialization/error changes.** In `server/routers/learning.py`, import `ValidationError` from Pydantic and replace the unused revision `RevisionNodeProgress` import with `RevisionNodeProgressWithDetails`. Change only the mark-review decorator/type/return:

```python
@router.post(
    "/revisions/{revision_id}/nodes/{node_id}/mark-reviewed",
    response_model=RevisionNodeProgressWithDetails,
    summary="Mark revision node reviewed",
    description="Mark a revision node as reviewed in full_review mode.",
)
def mark_revision_node_reviewed(
    revision_id: str, node_id: str,
) -> RevisionNodeProgressWithDetails:
    """Mark a revision node as reviewed and return restored node details."""
    try:
        progress = learning_manager.mark_revision_node_reviewed(
            revision_id=revision_id, node_id=node_id,
        )
        return RevisionNodeProgressWithDetails.model_validate(progress)
    except HTTPException:
        raise
    except ValidationError as exc:
        logger.error("Invalid revision review response: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Revision review failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from exc
```

Replace only the submit revision handler body, retaining its existing decorator and request model:

```python
    try:
        result = learning_manager.submit_revision_quiz(
            revision_id=revision_id, node_id=node_id,
            selected_option_ids=request.selected_option_ids,
            quiz_index=request.quiz_index,
        )
        return RevisionQuizSubmissionResult.model_validate(result)
    except HTTPException:
        raise
    except ValidationError as exc:
        logger.error("Invalid revision quiz response: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Revision quiz failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from exc
```

`create_revision` also catches `ValueError` and constructs a response model. Insert this exact branch **before** its `except ValueError`:

```python
    except ValidationError as exc:
        logger.error("Invalid revision create response: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from exc
```

Keep the original `learning_manager` facade import, endpoint paths, request field constraints, and HTTP 201 create response. GET/list/summary already validate P1 models and map unexpected failures to generic 500; do not replace them with manual JSON dictionaries. Within revision handlers only, replace exception-message logging with safe type-only logging. For the existing generic branches of create/list/get/delete/summary use this exact statement inside `except Exception as e:`:

```python
        logger.error("Revision operation failed: %s", type(e).__name__)
```

Add `except HTTPException: raise` immediately before the revision create handler's new `ValidationError` branch if it does not already have one. Existing revision GET/delete already re-raise HTTP errors; list/summary perform no inline HTTP raise. Do not change any non-revision handler, provider dependencies, normal quiz behavior, or query semantics in the router.

- [ ] **Step 4: GREEN.** Repeat `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_api -v`; expect five passing tests. Run `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite server.tests.test_revision_api server.tests.test_sqlite_repositories server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts server.tests.test_repository_facades -v`.
- [ ] **Step 5: Commit.** `Commit-ReviewParity -Paths @('server/routers/learning.py', 'server/tests/test_revision_api.py') -Message 'fix(review-parity): serialize complete facade-based revision HTTP contracts'`.

## Exit gate and explicit downstream handoff — 3 steps

- [ ] **Step H1: Diagnostics and focused regressions.** From `D:/Peter/Personal Stuffs/A2UI`, run these exact commands, record exit code and test counts, and fix only owned files with a failing regression before recommitting:

```powershell
server/.venv/Scripts/python.exe -m py_compile server/database/learning_persistence.py server/routers/learning.py server/tests/test_revision_sqlite.py server/tests/test_revision_api.py server/tests/test_sqlite_repositories.py
```

```powershell
server/.venv/Scripts/python.exe -c "import server.database.learning_persistence; import server.routers.learning; import server.services.revision_progress; print('revision imports OK')"
```

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite server.tests.test_revision_api server.tests.test_sqlite_repositories server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts server.tests.test_repository_facades server.tests.test_learning_graph_router server.tests.test_custom_learning_mode_integration server.tests.test_depth_mode_persistence server.tests.test_generation_persistence_integration -v
```

```powershell
git diff --check
```

Do not run uninspected full discovery if an existing suite writes a production DB. Full cross-layer/Mongo/client/coverage/browser gates belong to P7/orchestrator. This step establishes syntax/import and focused regression evidence, not a claim that all acceptance/UI checks passed. If focused legacy tests assert obsolete revision behavior in an unowned file, report the exact failure and ownership conflict; do not change it silently.

- [ ] **Step H2: Self-check completeness and checkpoint.** Confirm all seven task commits are path-scoped and every new test uses a temporary path. No original session/node/quiz snapshot changes after revision actions, migration/review are idempotent, history/summary/GET agree, no-write failures include invalid range/IDs/membership and interrupted writes, and immediate/restored identity/disclosure is complete. Read `git notes show HEAD`; under the same commit mutex append a note with `git notes append -m "P2 complete: temp SQLite and serialized revision HTTP verified; P1 projection integrated; original-only query scope preserved" HEAD` without overwriting previous notes. Do not stage or edit orchestrator-owned state/evidence files.

- [ ] **Step H3: Report to the orchestrator, which will not read this plan.** Send owned files, all commit hashes, exact red/green/diagnostic commands and outcomes, and these precise downstream decisions:
  - **P3:** Return `RevisionNodePayload` details on mark-review; router response model is now `RevisionNodeProgressWithDetails` and requires no Mongo-specific changes. Keep node-wide numbering, compatible per-quiz counts, batched projection, intentionally null explicit reviews, first review timestamps, original-only attempt queries, and the pre-write stale-completion invalidation rule. SQLite migrates missing explicit-review metadata once; Mongo must use its absent-vs-null equivalent without requiring transactions.
  - **P6:** Restore `quiz_results` by revision/node/index, never by topic status or original history. Wrong feedback has empty correct IDs/explanation; `selected_explanation` is nullable. Node review response has exactly GET's details shape; `content_reviewed_at` is authoritative. `nodes_reviewed` is mode-specific completion; `quizzes_passed/failed/total` are compatible **attempt** counts. List/session/summary accuracy agrees; UTC timestamp representations can vary without changing instants. Surface P1 notices; no permanent inferred-review notice is promised after migration persists it. Completion GET can hide obsolete historical timestamps and remain incomplete.
  - **P7:** Reuse the scenarios/assertions, not production fixtures: temp DB only, correct/wrong multi-quiz + exact multi-select, latest tie-break, scalar/JSON selections, null legacy index only when one quiz, stale/incompatible attempts retained, quizless and empty denominators, first explicit/first completion timestamps, no writes on invalid/failed requests, and identical original snapshots. Original history/mastery are original-only; their any-earlier-correct policy is unchanged. Serialized API gates cover actual Pydantic/FastAPI output and backend-agnostic facade response shape.
  - Report any blocker, changed P1 contract need, or foreign staged/owned-file conflict immediately. Never imply P3/P6/P7 is implemented by P2.

## Acceptance coverage and command inventory

| Criterion | P2 assertion location |
| --- | --- |
| A1/A2 | Tasks 2/3/7: correct and wrong immediate/restored disclosure, selected IDs and explanations |
| A4 | Task 3: stable-ID shuffled-label exact multi-selection; own explanations remain in unchanged quiz payload |
| A6 | Tasks 2/7: scoped latest results, per-quiz count, empty new revision, deterministic tie-break |
| A7 | Task 4: explicit review only, idempotence, subsequent wrong quiz preserves reading |
| A8 | Task 3: first quiz pending, second wrong finishes coverage without pass |
| A9 | Tasks 3/5: retry updates latest and attempt accuracy, preserves completion time |
| A14 | Tasks 3/4/7: rollback, generic errors, saved rows/results not lost |
| A15 | Tasks 1/2/5: reviewed-only backfill, intentionally null, quiz-derived time, incompatible attempts, stale completion |
| A16 | Tasks 2/5/7: list/GET/summary agreement, null accuracy/zero denominator |
| A17 | Tasks 3/4/7: membership/course ownership/range/selection before writes; serialized fields match TS |
| A18 | Tasks 1/3/4/6/7: unchanged original snapshots; original-only feedback/mastery/comparison |

**Count:** 7 TDD tasks × 5 steps = **35 TDD steps**, plus 3 preflight and 3 verification/handoff steps = **41 tracked steps**. Expected new tests: 15 in `server/tests/test_revision_sqlite.py`, 5 in `server/tests/test_revision_api.py`, 1 narrow addition in `server/tests/test_sqlite_repositories.py`. Existing tests are retained.

**Per-owned-test-file red/green commands:** Run the individual task red commands above before the corresponding code edit. The exact whole-file commands are identical in red and green (their expected result changes):

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite -v
server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_api -v
server/.venv/Scripts/python.exe -m unittest server.tests.test_sqlite_repositories -v
```

Self-review before plan delivery: all goal sections 7/8 requirements map to tasks; fixed field names/nullability are unchanged; no research/review phase or unowned implementation is introduced; code steps include executable content; no placeholder implementation steps; Markdown starts with Goal/Architecture/Tech Stack and has no plan-level source banner.

Planning validation: all Python snippets were syntax-checked in memory. An in-memory assembly of the proposed snippets exercised 21 planned tests against disposable SQLite and actual FastAPI serialization (21 passed, 4.317s); no production/test source file was created or modified and no production database was used. That dry-run found and corrected the test-fixture connection-closing issue above. This is plan-quality evidence only: workers must still perform the task-by-task red/green runs and real committed-source exit gates. The installed TestClient emitted a pre-existing httpx deprecation warning; no dependency change is authorized in P2.
