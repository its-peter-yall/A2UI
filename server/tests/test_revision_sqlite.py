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


def main() -> None:
    unittest.main()


if __name__ == "__main__":
    main()
