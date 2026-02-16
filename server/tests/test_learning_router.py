"""
=============================================================================
FILE: test_learning_router.py
=============================================================================

PURPOSE:
Unit tests for learning router behavior that coordinates persistence updates
after quiz submissions. Focuses on server-side multi-quiz progression logic.

KEY TESTS:
- test_submit_quiz_advances_quiz_set_after_correct_non_mastered: Ensures
  correct answers in multi-quiz flow advance current quiz index.

DEPENDENCIES:
- unittest: Python standard testing framework
- unittest.mock: Patching module-level learning_manager dependency
- server.routers.learning: submit_quiz endpoint function under test

RELATED FILES:
- server/routers/learning.py: Quiz submission route implementation
- server/database/learning_persistence.py: Quiz set progress persistence

NOTES:
- Tests call router function directly with patched dependencies.
- No network or FastAPI test client required for these regressions.
=============================================================================
"""

import unittest
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routers.learning import (
    QuizSubmitRequest,
    TransitionRequest,
    get_learning_session,
    router as learning_router,
    retry_quiz,
    submit_quiz,
    transition_node,
)
from server.schemas.learning import QuizCard, QuizOption, QuizSet


class TestLearningRouterQuizProgression(unittest.TestCase):
    """Regression tests for submit_quiz multi-quiz progression handling."""

    def test_submit_quiz_advances_quiz_set_after_correct_non_mastered(self) -> None:
        """Correct non-mastered attempts should advance quiz_set current_index."""
        request = QuizSubmitRequest(selected_option_id="option-1", quiz_index=0)

        fake_conn = MagicMock()
        fake_manager = MagicMock()
        fake_manager._get_connection.return_value = fake_conn
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 0,
            "status": "IN_QUIZ",
        }
        fake_manager.create_quiz_attempt.return_value = {
            "id": "attempt-1",
            "node_id": "node-1",
            "attempt_number": 1,
            "quiz_index": 0,
            "selected_option_id": "option-1",
            "is_correct": True,
            "score_percent": 100,
            "correct_option_id": "option-1",
            "explanation": "Correct",
            "is_mastered": False,
            "created_at": "2026-02-15T00:00:00+00:00",
            "updated_at": "2026-02-15T00:00:00+00:00",
        }
        quiz_set = MagicMock()
        quiz_set.quizzes = [object(), object(), object()]
        fake_manager.get_quiz_set_for_node.return_value = {"quiz_set": quiz_set}

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = submit_quiz("node-1", request)

        fake_manager.update_quiz_set_progress.assert_called_once_with(
            node_id="node-1", current_index=1
        )
        fake_manager.update_node_status.assert_not_called()
        self.assertFalse(response.is_mastered)
        self.assertFalse(response.next_node_unlocked)


def _make_quiz_card() -> QuizCard:
    """Create a single-quiz payload for router tests."""
    return QuizCard(
        question_text="What is 2 + 2?",
        options=[
            QuizOption(
                option_id="opt-a",
                display_label="A",
                text="4",
                is_correct=True,
                explanation="Correct.",
            ),
            QuizOption(
                option_id="opt-b",
                display_label="B",
                text="3",
                is_correct=False,
                explanation="Incorrect.",
            ),
            QuizOption(
                option_id="opt-c",
                display_label="C",
                text="5",
                is_correct=False,
                explanation="Incorrect.",
            ),
            QuizOption(
                option_id="opt-d",
                display_label="D",
                text="6",
                is_correct=False,
                explanation="Incorrect.",
            ),
        ],
        difficulty="easy",
    )


class TestLearningRouterSessionVisibility(unittest.TestCase):
    """Tests for session-level quiz visibility and randomization."""

    def test_get_learning_session_hides_in_quiz_answers(self) -> None:
        """IN_QUIZ nodes must return hidden shuffled quiz payloads."""
        quiz = _make_quiz_card()
        quiz_set = QuizSet(quizzes=[quiz], current_index=0)

        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = {
            "id": "session-1",
            "user_id": None,
            "query": "math",
            "course_title": "Math Basics",
            "created_at": "2026-02-15T00:00:00+00:00",
            "updated_at": "2026-02-15T00:00:00+00:00",
            "total_nodes": 1,
            "completed_nodes": 0,
        }
        fake_manager.get_session_nodes.return_value = [
            {
                "id": "node-1",
                "learning_session_id": "session-1",
                "sequence_index": 0,
                "title": "Addition",
                "content_markdown": "hidden in quiz mode",
                "status": "IN_QUIZ",
                "error_message": None,
                "retry_available": False,
                "created_at": "2026-02-15T00:00:00+00:00",
                "updated_at": "2026-02-15T00:00:00+00:00",
                "quiz": quiz.model_dump(),
            }
        ]
        fake_manager.get_quiz_set_for_node.return_value = {
            "quiz_set": quiz_set,
            "shuffle_seed": None,
            "current_index": 0,
        }

        with patch("server.routers.learning.learning_manager", fake_manager):
            with patch(
                "server.routers.learning.get_or_create_shuffle_order",
                return_value=(quiz, "seed-123"),
            ) as mock_shuffle:
                response = get_learning_session("session-1")

        node = response.nodes[0]
        self.assertEqual(node.status, "IN_QUIZ")
        self.assertIsNone(node.quiz)
        self.assertIsNotNone(node.quiz_hidden)
        if node.quiz_hidden is None:
            self.fail("Expected quiz_hidden payload for IN_QUIZ node")

        self.assertEqual(node.quiz_hidden.question_text, quiz.question_text)
        hidden_option_ids = {opt.option_id for opt in node.quiz_hidden.options}
        self.assertEqual(hidden_option_ids, {"opt-a", "opt-b", "opt-c", "opt-d"})
        mock_shuffle.assert_called_once()
        fake_manager.update_quiz_shuffle_seed.assert_called_once_with(
            "node-1", "seed-123"
        )


def _make_node_response(status: str) -> dict:
    """Create a minimal concept node response payload for router tests."""
    return {
        "id": "node-1",
        "learning_session_id": "session-1",
        "sequence_index": 0,
        "title": "Node",
        "content_markdown": "Content",
        "status": status,
        "error_message": None,
        "retry_available": False,
        "created_at": "2026-02-15T00:00:00+00:00",
        "updated_at": "2026-02-15T00:00:00+00:00",
        "quiz": None,
        "quiz_set": None,
        "quiz_hidden": None,
        "quiz_set_hidden": None,
    }


class TestLearningRouterShuffleSeedEvents(unittest.TestCase):
    """Tests event-triggered shuffle seed creation behavior."""

    def test_transition_to_in_quiz_creates_shuffle_seed(self) -> None:
        """Entering IN_QUIZ should create and persist a shuffle seed."""
        quiz = _make_quiz_card()
        quiz_set = QuizSet(quizzes=[quiz], current_index=0)
        fake_manager = MagicMock()
        fake_manager.update_node_status.return_value = _make_node_response("IN_QUIZ")
        fake_manager.get_quiz_set_for_node.return_value = {
            "quiz_set": quiz_set,
            "shuffle_seed": None,
            "current_index": 0,
        }

        with patch("server.routers.learning.learning_manager", fake_manager):
            with patch(
                "server.routers.learning.get_or_create_shuffle_order",
                return_value=(quiz, "event-seed"),
            ) as mock_shuffle:
                response = transition_node(
                    "node-1", TransitionRequest(target_status="IN_QUIZ")
                )

        self.assertEqual(response.status, "IN_QUIZ")
        mock_shuffle.assert_called_once()
        fake_manager.update_quiz_shuffle_seed.assert_called_once_with(
            "node-1", "event-seed"
        )

    def test_transition_to_non_quiz_does_not_create_seed(self) -> None:
        """Non-IN_QUIZ transitions should not trigger seed generation."""
        fake_manager = MagicMock()
        fake_manager.update_node_status.return_value = _make_node_response(
            "VIEWING_EXPLANATION"
        )

        with patch("server.routers.learning.learning_manager", fake_manager):
            transition_node(
                "node-1",
                TransitionRequest(target_status="VIEWING_EXPLANATION"),
            )

        fake_manager.get_quiz_set_for_node.assert_not_called()
        fake_manager.update_quiz_shuffle_seed.assert_not_called()

    def test_retry_quiz_creates_shuffle_seed(self) -> None:
        """Retrying into IN_QUIZ should create/persist a shuffle seed."""
        quiz = _make_quiz_card()
        quiz_set = QuizSet(quizzes=[quiz], current_index=0)
        fake_manager = MagicMock()
        fake_manager.update_node_status.return_value = _make_node_response("IN_QUIZ")
        fake_manager.get_quiz_set_for_node.return_value = {
            "quiz_set": quiz_set,
            "shuffle_seed": None,
            "current_index": 0,
        }

        with patch("server.routers.learning.learning_manager", fake_manager):
            with patch(
                "server.routers.learning.get_or_create_shuffle_order",
                return_value=(quiz, "retry-seed"),
            ) as mock_shuffle:
                response = retry_quiz("node-1")

        self.assertEqual(response.status, "IN_QUIZ")
        mock_shuffle.assert_called_once()
        fake_manager.update_quiz_shuffle_seed.assert_called_once_with(
            "node-1", "retry-seed"
        )


def _create_client() -> TestClient:
    app = FastAPI()
    app.include_router(learning_router)
    return TestClient(app)


class TestLearningRouterSessionListing(unittest.TestCase):
    """Tests for GET /learning/sessions listing endpoint."""

    def _make_summary(self, session_id: str) -> dict:
        return {
            "id": session_id,
            "query": "Learn SQL",
            "course_title": "SQL Basics",
            "status": "in_progress",
            "progress_percent": 40,
            "total_nodes": 5,
            "completed_nodes": 2,
            "last_active_node_title": "Indexes",
            "created_at": "2026-02-16T00:00:00+00:00",
            "updated_at": "2026-02-16T00:30:00+00:00",
            "completed_at": None,
            "revision_count": 0,
        }

    def test_get_learning_sessions_returns_200_with_response_payload(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_sessions_list.return_value = ([self._make_summary("s-1")], 1)
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get("/learning/sessions")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total_count"], 1)
        self.assertFalse(payload["has_more"])
        self.assertEqual(len(payload["sessions"]), 1)
        self.assertEqual(payload["sessions"][0]["id"], "s-1")

    def test_get_learning_sessions_passes_filters_to_persistence(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_sessions_list.return_value = ([self._make_summary("s-1")], 41)
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get(
                "/learning/sessions",
                params={
                    "user_id": "user-1",
                    "status": "completed",
                    "sort_by": "progress_percent",
                    "sort_order": "asc",
                    "limit": 20,
                    "offset": 20,
                },
            )

        self.assertEqual(response.status_code, 200)
        fake_manager.get_sessions_list.assert_called_once_with(
            user_id="user-1",
            status="completed",
            sort_by="progress_percent",
            sort_order="asc",
            limit=20,
            offset=20,
        )
        self.assertTrue(response.json()["has_more"])

    def test_get_learning_sessions_invalid_sort_by_returns_422(self) -> None:
        fake_manager = MagicMock()
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get(
                "/learning/sessions",
                params={"sort_by": "invalid_field"},
            )

        self.assertEqual(response.status_code, 422)
        fake_manager.get_sessions_list.assert_not_called()

    def test_get_learning_sessions_caps_limit_to_100(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_sessions_list.return_value = ([], 0)
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get(
                "/learning/sessions",
                params={"limit": 500},
            )

        self.assertEqual(response.status_code, 200)
        fake_manager.get_sessions_list.assert_called_once_with(
            user_id=None,
            status="all",
            sort_by="updated_at",
            sort_order="desc",
            limit=100,
            offset=0,
        )


class TestLearningRouterSessionProgress(unittest.TestCase):
    """Tests for GET /learning/sessions/{id}/progress endpoint."""

    def test_get_learning_session_progress_returns_payload(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_session_progress.return_value = {
            "progress_percent": 60,
            "status": "in_progress",
            "completed_nodes": 3,
            "total_nodes": 5,
            "last_active_node_id": "node-3",
            "last_active_node_title": "Node 3",
        }
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get("/learning/sessions/session-1/progress")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["progress_percent"], 60)
        self.assertEqual(payload["completed_nodes"], 3)
        self.assertEqual(payload["total_nodes"], 5)
        self.assertEqual(payload["last_active_node_id"], "node-3")

    def test_get_learning_session_progress_returns_404_for_missing_session(
        self,
    ) -> None:
        fake_manager = MagicMock()
        fake_manager.get_session_progress.return_value = None
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get("/learning/sessions/missing/progress")

        self.assertEqual(response.status_code, 404)


class TestLearningRouterRevisions(unittest.TestCase):
    """Tests for revision session CRUD router endpoints."""

    def _make_revision(
        self,
        revision_id: str = "revision-1",
        mode: str = "full_review",
        revision_number: int = 1,
    ) -> dict:
        return {
            "id": revision_id,
            "original_session_id": "session-1",
            "revision_number": revision_number,
            "mode": mode,
            "status": "in_progress",
            "progress_percent": 0,
            "total_quiz_score_percent": None,
            "started_at": "2026-02-16T00:00:00+00:00",
            "completed_at": None,
        }

    def test_create_revision_returns_201_with_payload(self) -> None:
        fake_manager = MagicMock()
        fake_manager.create_revision_session.return_value = self._make_revision()
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.post(
                "/learning/sessions/session-1/revisions",
                json={"mode": "full_review"},
            )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["id"], "revision-1")
        self.assertEqual(payload["mode"], "full_review")
        fake_manager.create_revision_session.assert_called_once_with(
            "session-1",
            "full_review",
        )

    def test_create_revision_returns_400_for_incomplete_session(self) -> None:
        fake_manager = MagicMock()
        fake_manager.create_revision_session.side_effect = ValueError(
            "Revision sessions can only be created for completed sessions"
        )
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.post(
                "/learning/sessions/session-1/revisions",
                json={"mode": "full_review"},
            )

        self.assertEqual(response.status_code, 400)

    def test_create_revision_returns_404_for_missing_session(self) -> None:
        fake_manager = MagicMock()
        fake_manager.create_revision_session.side_effect = LookupError(
            "Learning session not found"
        )
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.post(
                "/learning/sessions/missing/revisions",
                json={"mode": "quiz_only"},
            )

        self.assertEqual(response.status_code, 404)

    def test_get_revisions_returns_paginated_payload(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_revisions_for_session.return_value = (
            [self._make_revision("revision-2", "quiz_only", 2)],
            2,
        )
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get(
                "/learning/sessions/session-1/revisions",
                params={"limit": 1, "offset": 0},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total_count"], 2)
        self.assertEqual(len(payload["revisions"]), 1)
        self.assertEqual(payload["revisions"][0]["id"], "revision-2")
        fake_manager.get_revisions_for_session.assert_called_once_with(
            session_id="session-1",
            limit=1,
            offset=0,
        )

    def test_get_revision_returns_full_details(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_revision_session.return_value = {
            **self._make_revision(),
            "nodes": [
                {
                    "id": "progress-1",
                    "node_id": "node-1",
                    "node_title": "Node 1",
                    "sequence_index": 0,
                    "status": "pending",
                    "reviewed_at": None,
                }
            ],
        }
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get("/learning/revisions/revision-1")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["id"], "revision-1")
        self.assertEqual(payload["nodes"][0]["node_title"], "Node 1")

    def test_delete_revision_returns_success_then_404(self) -> None:
        fake_manager = MagicMock()
        fake_manager.delete_revision_session.side_effect = [True, False]
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            first = client.delete("/learning/revisions/revision-1")
            second = client.delete("/learning/revisions/revision-1")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json(), {"deleted": True})
        self.assertEqual(second.status_code, 404)

    def test_mark_revision_node_reviewed_returns_200_with_payload(self) -> None:
        fake_manager = MagicMock()
        fake_manager.mark_revision_node_reviewed.return_value = {
            "id": "progress-1",
            "revision_session_id": "revision-1",
            "node_id": "node-1",
            "status": "reviewed",
            "reviewed_at": "2026-02-16T00:00:00+00:00",
        }
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.post(
                "/learning/revisions/revision-1/nodes/node-1/mark-reviewed"
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "reviewed")
        fake_manager.mark_revision_node_reviewed.assert_called_once_with(
            revision_id="revision-1",
            node_id="node-1",
        )

    def test_mark_revision_node_reviewed_returns_400_for_quiz_only(self) -> None:
        fake_manager = MagicMock()
        fake_manager.mark_revision_node_reviewed.side_effect = ValueError(
            "mark-reviewed is only allowed for full_review revisions"
        )
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.post(
                "/learning/revisions/revision-1/nodes/node-1/mark-reviewed"
            )

        self.assertEqual(response.status_code, 400)

    def test_submit_revision_quiz_returns_quiz_result(self) -> None:
        fake_manager = MagicMock()
        fake_manager.submit_revision_quiz.return_value = {
            "is_correct": True,
            "correct_option_id": "opt-a",
            "explanation": "Correct.",
            "revision_node_status": "quiz_passed",
        }
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.post(
                "/learning/revisions/revision-1/nodes/node-1/submit-quiz",
                json={"selected_option_id": "opt-a", "quiz_index": 0},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["is_correct"])
        self.assertEqual(payload["revision_node_status"], "quiz_passed")
        fake_manager.submit_revision_quiz.assert_called_once_with(
            revision_id="revision-1",
            node_id="node-1",
            selected_option_id="opt-a",
            quiz_index=0,
        )

    def test_submit_revision_quiz_returns_404_for_missing_revision(self) -> None:
        fake_manager = MagicMock()
        fake_manager.submit_revision_quiz.side_effect = LookupError(
            "Revision session not found"
        )
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.post(
                "/learning/revisions/missing/nodes/node-1/submit-quiz",
                json={"selected_option_id": "opt-a"},
            )

        self.assertEqual(response.status_code, 404)

    def test_get_revision_summary_returns_complete_metrics(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_revision_summary.return_value = {
            "revision_id": "revision-1",
            "mode": "full_review",
            "progress_percent": 100,
            "total_quiz_score_percent": 75,
            "nodes_reviewed": 4,
            "nodes_total": 4,
            "quizzes_passed": 3,
            "quizzes_failed": 1,
            "quizzes_total": 4,
            "time_spent_seconds": 120,
            "comparison": {
                "original_quiz_score_percent": 50,
                "improvement_percent": 25,
            },
        }
        client = _create_client()

        with patch("server.routers.learning.learning_manager", fake_manager):
            response = client.get("/learning/revisions/revision-1/summary")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["progress_percent"], 100)
        self.assertEqual(payload["comparison"]["improvement_percent"], 25)
