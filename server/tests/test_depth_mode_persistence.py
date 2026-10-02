"""
============================================================================
FILE: test_depth_mode_persistence.py
LOCATION: server/tests/test_depth_mode_persistence.py
============================================================================
PURPOSE:
    Verifies learning_sessions.mode and resolved_mode round-trip.
USAGE:
    python -m unittest server.tests.test_depth_mode_persistence -v
============================================================================
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from server.database.learning_persistence import LearningManager


class DepthModePersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.manager = LearningManager(db_path=Path(self.tmp.name) / "t.db")
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_create_session_persists_mode_fields(self) -> None:
        session = self.manager.create_learning_session(
            query="Placebo Effect",
            course_title="Placebo",
            mode="auto",
            resolved_mode="lite",
        )
        self.assertEqual(session["mode"], "auto")
        self.assertEqual(session["resolved_mode"], "lite")
        loaded = self.manager.get_learning_session(session["id"])
        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertEqual(loaded["mode"], "auto")
        self.assertEqual(loaded["resolved_mode"], "lite")

    def test_create_session_defaults_mode_auto(self) -> None:
        session = self.manager.create_learning_session(
            query="q",
            course_title="c",
        )
        self.assertEqual(session["mode"], "auto")
        self.assertIsNone(session["resolved_mode"])

    def test_migration_adds_columns_on_existing_db(self) -> None:
        self.manager.init_learning_tables()
        session = self.manager.create_learning_session(
            query="q",
            course_title="c",
            mode="full",
            resolved_mode="full",
        )
        loaded = self.manager.get_learning_session(session["id"])
        assert loaded is not None
        self.assertEqual(loaded["mode"], "full")
        self.assertEqual(loaded["resolved_mode"], "full")

    def test_custom_session_round_trip_keeps_requested_count(self) -> None:
        repository = SqliteLearningRepository(self.manager)
        for count in (1, 2, 5, 30):
            with self.subTest(count=count):
                session = repository.create_learning_session(
                    query="CSS",
                    course_title="CSS",
                    mode="custom",
                    resolved_mode="custom",
                    custom_topic_count=count,
                )
                self.assertEqual(session["custom_topic_count"], count)
                loaded = repository.get_learning_session(session["id"])
                assert loaded is not None
                self.assertEqual(loaded["custom_topic_count"], count)
                self.assertEqual(loaded["total_nodes"], 0)
                self.assertEqual(loaded["resolved_mode"], "custom")
                self.manager.create_concept_node(
                    session_id=session["id"],
                    sequence_index=0,
                    title="First",
                    content_markdown="Explanation",
                    status=NodeStatus.VIEWING_EXPLANATION,
                )
                loaded = repository.get_learning_session(session["id"])
                assert loaded is not None
                self.assertEqual(loaded["total_nodes"], 1)
                self.assertEqual(loaded["custom_topic_count"], count)
                listed, _ = repository.get_sessions_list()
                listed_session = next(
                    item for item in listed if item["id"] == session["id"]
                )
                self.assertEqual(
                    listed_session["custom_topic_count"], count
                )

    def test_old_modes_default_to_null_requested_count(self) -> None:
        for mode in ("auto", "lite", "full"):
            with self.subTest(mode=mode):
                session = self.manager.create_learning_session(
                    query="CSS", course_title="CSS", mode=mode
                )
                self.assertIsNone(session["custom_topic_count"])
                loaded = self.manager.get_learning_session(session["id"])
                assert loaded is not None
                self.assertIsNone(loaded["custom_topic_count"])

    def test_fresh_initialization_is_idempotent_with_count(self) -> None:
        session = self.manager.create_learning_session(
            query="CSS",
            course_title="CSS",
            mode="custom",
            custom_topic_count=2,
        )
        self.manager.init_learning_tables()
        self.manager.init_learning_tables()
        with sqlite3.connect(self.manager.db_path) as conn:
            columns = conn.execute(
                "PRAGMA table_info(learning_sessions)"
            ).fetchall()
        conn.close()
        self.assertEqual(
            sum(column[1] == "custom_topic_count" for column in columns), 1
        )
        loaded = self.manager.get_learning_session(session["id"])
        assert loaded is not None
        self.assertEqual(loaded["custom_topic_count"], 2)

    def test_real_legacy_schema_migration_keeps_old_rows(self) -> None:
        legacy_path = Path(self.tmp.name) / "legacy.db"
        with sqlite3.connect(legacy_path) as conn:
            conn.execute(
                """
                CREATE TABLE learning_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    query TEXT NOT NULL,
                    course_title TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                "INSERT INTO learning_sessions (id, query, course_title)"
                " VALUES (?, ?, ?)",
                ("legacy", "Old query", "Old title"),
            )
            before = conn.execute(
                "PRAGMA table_info(learning_sessions)"
            ).fetchall()
        conn.close()
        self.assertNotIn("custom_topic_count", [row[1] for row in before])
        manager = LearningManager(db_path=legacy_path)
        manager.init_learning_tables()
        manager.init_learning_tables()
        with sqlite3.connect(legacy_path) as conn:
            after = conn.execute(
                "PRAGMA table_info(learning_sessions)"
            ).fetchall()
        conn.close()
        self.assertEqual(
            sum(row[1] == "custom_topic_count" for row in after), 1
        )
        loaded = manager.get_learning_session("legacy")
        assert loaded is not None
        self.assertEqual(loaded["query"], "Old query")
        self.assertEqual(loaded["course_title"], "Old title")
        self.assertEqual(loaded["mode"], "auto")
        self.assertIsNone(loaded["resolved_mode"])
        self.assertIsNone(loaded["custom_topic_count"])
        rows, total = manager.get_sessions_list()
        self.assertEqual(total, 1)
        self.assertIsNone(rows[0]["custom_topic_count"])

    def test_update_resolved_mode_accepts_custom(self) -> None:
        session = self.manager.create_learning_session(
            query="CSS", course_title="CSS", mode="custom",
            custom_topic_count=2,
        )
        self.manager.update_session_resolved_mode(session["id"], "custom")
        loaded = self.manager.get_learning_session(session["id"])
        assert loaded is not None
        self.assertEqual(loaded["resolved_mode"], "custom")
        self.assertEqual(loaded["custom_topic_count"], 2)
        with self.assertRaises(ValueError):
            self.manager.update_session_resolved_mode(session["id"], "turbo")


if __name__ == "__main__":
    unittest.main()
