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
