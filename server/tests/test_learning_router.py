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

from server.routers.learning import QuizSubmitRequest, submit_quiz


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

