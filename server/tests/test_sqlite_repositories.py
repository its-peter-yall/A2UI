"""
============================================================================
FILE: test_sqlite_repositories.py
LOCATION: server/tests/test_sqlite_repositories.py
============================================================================
PURPOSE:
    Delegation tests for thin SQLite repository adapters and local app
    settings unavailability contract.
ROLE IN PROJECT:
    TDD guard for Phase 2A SQLite repository wrappers.
    - Ensures adapters forward public calls to wrapped stores
    - Ensures local app settings stay browser-owned on SQLite backend
DEPENDENCIES:
    - External: unittest, unittest.mock
    - Internal: server.database.repositories
USAGE:
    python -m unittest server.tests.test_sqlite_repositories -v
============================================================================
"""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from server.database.repositories.errors import (
    RepositoryUnavailableError,
)
from server.database.repositories.sqlite import (
    LocalAppSettingsRepository,
    SqliteGenerationArtifactRepository,
    SqliteGenerationJobRepository,
    SqliteLearningRepository,
    SqliteProgressEventRepository,
    SqliteResearchRepository,
)
from server.tests.test_revision_sqlite import RevisionSqliteFixture, make_quiz


class SqliteRepositoryTests(unittest.TestCase):
    def test_each_adapter_delegates_to_wrapped_store(self) -> None:
        cases = (
            (SqliteLearningRepository, "get_learning_session", ("s1",)),
            (SqliteGenerationJobRepository, "get_by_session", ("s1",)),
            (SqliteGenerationArtifactRepository, "get_brief", ("n1",)),
            (SqliteResearchRepository, "get_report", ("s1",)),
            (SqliteProgressEventRepository, "latest_id", ("s1",)),
        )
        for adapter_type, method_name, args in cases:
            store = MagicMock()
            getattr(store, method_name).return_value = "sentinel"
            adapter = adapter_type(store)
            with self.subTest(adapter=adapter_type.__name__):
                result = getattr(adapter, method_name)(*args)
                self.assertEqual(result, "sentinel")
                getattr(store, method_name).assert_called_once_with(*args)

    def test_local_app_settings_is_explicitly_unavailable(self) -> None:
        repository = LocalAppSettingsRepository()
        with self.assertRaises(RepositoryUnavailableError):
            repository.get_provider_settings()

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


if __name__ == "__main__":
    unittest.main()
