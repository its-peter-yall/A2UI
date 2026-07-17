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


if __name__ == "__main__":
    unittest.main()
