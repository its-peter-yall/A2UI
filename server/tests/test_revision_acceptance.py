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

from fastapi.testclient import TestClient

from server.schemas.learning import RevisionQuizSubmissionResult
from server.tests.revision_acceptance_helpers import (
    AcceptanceFixture, create_browser_app, route_client, wire_fixture,
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


    def test_browser_factory_uses_disposable_courses_and_no_provider(self) -> None:
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


def main() -> None:
    unittest.main()


if __name__ == "__main__":
    main()
