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
