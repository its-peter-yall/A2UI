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

from server.routers.learning import (
    QuizSubmitRequest,
    TransitionRequest,
    get_learning_session,
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
