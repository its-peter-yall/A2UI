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
from server.tests.revision_acceptance_helpers import (
    AcceptanceFixture, run_transcript,
)


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


def main() -> None:
    unittest.main()


if __name__ == "__main__":
    main()
