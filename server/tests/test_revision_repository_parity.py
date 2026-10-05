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
