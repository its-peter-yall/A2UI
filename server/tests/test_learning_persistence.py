"""
============================================================================
FILE: test_learning_persistence.py
LOCATION: server/tests/test_learning_persistence.py
============================================================================
PURPOSE:
    Unit tests for learning persistence layer (LearningManager). Validates
    CRUD operations with SQLite, ordering, status transitions, quiz payload
    retrieval, and foreign key cascade behavior.
ROLE IN PROJECT:
    Ensures the data layer correctly persists and retrieves learning state,
    enforces status transitions, and handles quiz mastery tracking.
    - Covers session and node CRUD with a temporary SQLite database
    - Validates cascade delete and mastery detection logic
KEY COMPONENTS:
    - TestLearningManager: Core CRUD and status transition tests
    - TestQuizAttempts: Quiz attempt recording and mastery tests
DEPENDENCIES:
    - External: unittest, tempfile, pathlib, sqlite3
    - Internal: server.database.learning_persistence,
                server.schemas.learning
USAGE:
    ```python
    python -m unittest server.tests.test_learning_persistence
    ```
============================================================================
"""

# test_learning_persistence.py
# Unit tests for learning persistence layer operations

# Longer description (2-4 lines):
# - Exercises LearningManager CRUD operations with a temporary SQLite database.
# - Verifies ordering, status transitions, and quiz payload retrieval.
# - Confirms foreign key cascade behavior for sessions and nodes.

# @see: server/database/learning_persistence.py - Persistence methods under test
# @note: Each test uses a dedicated temp database file

import json
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path
from typing import Dict, List

from server.database.learning_persistence import LearningManager
from server.schemas.learning import (
    NodeStatus,
    QuizCard,
    QuizDifficulty,
    QuizOption,
    QuizSet,
)


def _make_stable_uuid(label: str) -> str:
    """Generate deterministic UUID for testing."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"test-option-{label}"))


def _make_quiz_card() -> QuizCard:
    return QuizCard(
        question_text="What is 2 + 2?",
        options=[
            QuizOption(
                option_id=_make_stable_uuid("A"),
                display_label="A",
                text="4",
                is_correct=True,
                explanation="2 + 2 equals 4",
            ),
            QuizOption(
                option_id=_make_stable_uuid("B"),
                display_label="B",
                text="5",
                is_correct=False,
                explanation="2 + 2 does not equal 5",
            ),
            QuizOption(
                option_id=_make_stable_uuid("C"),
                display_label="C",
                text="3",
                is_correct=False,
                explanation="2 + 2 does not equal 3",
            ),
            QuizOption(
                option_id=_make_stable_uuid("D"),
                display_label="D",
                text="6",
                is_correct=False,
                explanation="2 + 2 does not equal 6",
            ),
        ],
        difficulty=QuizDifficulty.EASY,
    )


class TestLearningManager(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_session(self) -> str:
        session = self.manager.create_learning_session(
            query="Learn testing", course_title="Testing 101", user_id="user-1"
        )
        return session["id"]

    def test_create_learning_session(self) -> None:
        session = self.manager.create_learning_session(
            query="Learn testing", course_title="Testing 101", user_id="user-1"
        )
        self.assertEqual(session["query"], "Learn testing")
        self.assertEqual(session["course_title"], "Testing 101")
        self.assertEqual(session["user_id"], "user-1")
        self.assertEqual(session["total_nodes"], 0)
        self.assertEqual(session["completed_nodes"], 0)

    def test_get_learning_session(self) -> None:
        session_id = self._create_session()
        session = self.manager.get_learning_session(session_id)
        self.assertIsNotNone(session)
        assert session is not None
        self.assertEqual(session["id"], session_id)
        self.assertEqual(session["total_nodes"], 0)
        self.assertEqual(session["completed_nodes"], 0)

    def test_get_nonexistent_session(self) -> None:
        session = self.manager.get_learning_session("missing")
        self.assertIsNone(session)

    def test_create_concept_node(self) -> None:
        session_id = self._create_session()
        node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Intro",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        self.assertEqual(node["learning_session_id"], session_id)
        self.assertEqual(node["sequence_index"], 0)
        self.assertEqual(node["status"], NodeStatus.LOCKED.value)

    def test_create_node_with_quiz(self) -> None:
        session_id = self._create_session()
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=1,
            title="Quiz",
            content_markdown="Content",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz=quiz,
        )
        self.assertIsNotNone(node["quiz"])
        self.assertEqual(node["quiz"]["question_text"], quiz.question_text)

    def test_get_session_nodes(self) -> None:
        session_id = self._create_session()
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="First",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=2,
            title="Third",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=1,
            title="Second",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        nodes = self.manager.get_session_nodes(session_id)
        sequence = [node["sequence_index"] for node in nodes]
        self.assertEqual(sequence, [0, 1, 2])

    def test_update_node_status(self) -> None:
        session_id = self._create_session()
        node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Intro",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        updated = self.manager.update_node_status(
            node["id"], NodeStatus.VIEWING_EXPLANATION
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated["status"], NodeStatus.VIEWING_EXPLANATION.value)

    def test_update_node_content(self) -> None:
        session_id = self._create_session()
        node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Intro",
            content_markdown="Content",
            status=NodeStatus.ERROR,
            error_message="Generation failed",
            retry_available=True,
        )
        quiz = _make_quiz_card()
        updated = self.manager.update_node_content(
            node_id=node["id"],
            content_markdown="Updated content",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz=quiz,
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated["content_markdown"], "Updated content")
        self.assertEqual(updated["status"], NodeStatus.VIEWING_EXPLANATION.value)
        self.assertEqual(updated["quiz"]["question_text"], quiz.question_text)
        self.assertIsNone(updated["error_message"])
        self.assertFalse(updated["retry_available"])

    def test_error_metadata_persisted(self) -> None:
        session_id = self._create_session()
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Failed",
            content_markdown="Placeholder",
            status=NodeStatus.ERROR,
            error_message="Test failure",
            retry_available=True,
        )
        nodes = self.manager.get_session_nodes(session_id)
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0]["error_message"], "Test failure")
        self.assertTrue(nodes[0]["retry_available"])

    def test_get_next_node(self) -> None:
        session_id = self._create_session()
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="First",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=1,
            title="Second",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        next_node = self.manager.get_next_node(session_id, 0)
        self.assertIsNotNone(next_node)
        assert next_node is not None
        self.assertEqual(next_node["sequence_index"], 1)

    def test_get_next_node_none(self) -> None:
        session_id = self._create_session()
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Only",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        next_node = self.manager.get_next_node(session_id, 0)
        self.assertIsNone(next_node)

    def test_get_quiz_for_node(self) -> None:
        session_id = self._create_session()
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Quiz",
            content_markdown="Content",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz=quiz,
        )
        stored_quiz = self.manager.get_quiz_for_node(node["id"])
        self.assertIsNotNone(stored_quiz)
        assert stored_quiz is not None
        self.assertEqual(stored_quiz.question_text, quiz.question_text)
        self.assertEqual(len(stored_quiz.options), 4)

    def test_cascade_delete(self) -> None:
        session_id = self._create_session()
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Quiz",
            content_markdown="Content",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz=quiz,
        )

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM learning_sessions WHERE id = ?",
                (session_id,),
            )
            conn.commit()

            cursor.execute(
                "SELECT COUNT(*) FROM concept_nodes WHERE learning_session_id = ?",
                (session_id,),
            )
            self.assertEqual(cursor.fetchone()[0], 0)
            cursor.execute(
                "SELECT COUNT(*) FROM quiz_data WHERE node_id = ?",
                (node["id"],),
            )
            self.assertEqual(cursor.fetchone()[0], 0)
        finally:
            conn.close()


class TestQuizAttempts(unittest.TestCase):
    """Tests for quiz attempt tracking and mastery functionality."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_node_with_quiz(self) -> str:
        """Helper to create a session with a node that has a quiz."""
        session = self.manager.create_learning_session(
            query="Test query", course_title="Test Course", user_id="user-1"
        )
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Test Node",
            content_markdown="Test content",
            status=NodeStatus.IN_QUIZ,
            quiz=quiz,
        )
        return node["id"]

    def test_create_quiz_attempt_correct_answer(self) -> None:
        """Recording a correct answer should return is_correct=True and is_mastered=True."""
        node_id = self._create_node_with_quiz()
        correct_option_id = _make_stable_uuid("A")  # A is correct
        result = self.manager.create_quiz_attempt(node_id, correct_option_id)

        self.assertEqual(result["node_id"], node_id)
        self.assertEqual(result["attempt_number"], 1)
        self.assertEqual(result["selected_option_id"], correct_option_id)
        self.assertTrue(result["is_correct"])
        self.assertEqual(result["score_percent"], 100)
        self.assertEqual(result["correct_option_id"], correct_option_id)
        self.assertTrue(result["is_mastered"])
        self.assertIn("2 + 2 equals 4", result["explanation"])

    def test_create_quiz_attempt_incorrect_answer(self) -> None:
        """Recording an incorrect answer should return is_correct=False and is_mastered=False."""
        node_id = self._create_node_with_quiz()
        incorrect_option_id = _make_stable_uuid("B")  # B is incorrect
        correct_option_id = _make_stable_uuid("A")  # A is correct
        result = self.manager.create_quiz_attempt(node_id, incorrect_option_id)

        self.assertEqual(result["attempt_number"], 1)
        self.assertEqual(result["selected_option_id"], incorrect_option_id)
        self.assertFalse(result["is_correct"])
        self.assertEqual(result["score_percent"], 0)
        self.assertIsNone(result["correct_option_id"])
        self.assertFalse(result["is_mastered"])
        self.assertIn("does not equal 5", result["selected_explanation"])

    def test_create_quiz_attempt_invalid_option(self) -> None:
        """Submitting an invalid option ID should raise ValueError."""
        node_id = self._create_node_with_quiz()
        with self.assertRaises(ValueError) as ctx:
            self.manager.create_quiz_attempt(node_id, "invalid-uuid")
        self.assertIn("Invalid option id", str(ctx.exception))

    def test_create_quiz_attempt_no_quiz(self) -> None:
        """Submitting to a node without a quiz should raise ValueError."""
        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="No Quiz Node",
            content_markdown="Content",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz=None,
        )
        with self.assertRaises(ValueError) as ctx:
            self.manager.create_quiz_attempt(node["id"], _make_stable_uuid("A"))
        self.assertIn("No quiz found", str(ctx.exception))

    def test_create_multiple_attempts_increments_number(self) -> None:
        """Multiple attempts should have incrementing attempt numbers."""
        node_id = self._create_node_with_quiz()

        result1 = self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("B")
        )  # wrong
        result2 = self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("C")
        )  # wrong
        result3 = self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("A")
        )  # correct

        self.assertEqual(result1["attempt_number"], 1)
        self.assertEqual(result2["attempt_number"], 2)
        self.assertEqual(result3["attempt_number"], 3)

    def test_get_quiz_attempts_empty(self) -> None:
        """Getting attempts for a node with no attempts should return empty list."""
        node_id = self._create_node_with_quiz()
        history = self.manager.get_quiz_attempts(node_id)

        self.assertEqual(history["node_id"], node_id)
        self.assertEqual(history["total_attempts"], 0)
        self.assertFalse(history["is_mastered"])
        self.assertEqual(history["best_score"], 0)
        self.assertEqual(history["attempts"], [])

    def test_get_quiz_attempts_multiple(self) -> None:
        """Getting attempts should return all attempts in order with correct stats."""
        node_id = self._create_node_with_quiz()

        self.manager.create_quiz_attempt(node_id, _make_stable_uuid("B"))  # wrong - 0%
        self.manager.create_quiz_attempt(node_id, _make_stable_uuid("C"))  # wrong - 0%
        self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("A")
        )  # correct - 100%

        history = self.manager.get_quiz_attempts(node_id)

        self.assertEqual(history["total_attempts"], 3)
        self.assertTrue(history["is_mastered"])
        self.assertEqual(history["best_score"], 100)
        self.assertEqual(len(history["attempts"]), 3)

        # Verify order
        self.assertEqual(history["attempts"][0]["attempt_number"], 1)
        self.assertEqual(history["attempts"][1]["attempt_number"], 2)
        self.assertEqual(history["attempts"][2]["attempt_number"], 3)

        # Verify correctness
        self.assertFalse(history["attempts"][0]["is_correct"])
        self.assertFalse(history["attempts"][1]["is_correct"])
        self.assertTrue(history["attempts"][2]["is_correct"])

    def test_check_mastery_not_mastered(self) -> None:
        """check_mastery should return False when no attempt scored 100%."""
        node_id = self._create_node_with_quiz()

        # No attempts yet
        self.assertFalse(self.manager.check_mastery(node_id))

        # Wrong attempt
        self.manager.create_quiz_attempt(node_id, _make_stable_uuid("B"))
        self.assertFalse(self.manager.check_mastery(node_id))

    def test_check_mastery_mastered(self) -> None:
        """check_mastery should return True after a correct attempt."""
        node_id = self._create_node_with_quiz()

        self.manager.create_quiz_attempt(node_id, _make_stable_uuid("B"))  # wrong
        self.assertFalse(self.manager.check_mastery(node_id))

        self.manager.create_quiz_attempt(node_id, _make_stable_uuid("A"))  # correct
        self.assertTrue(self.manager.check_mastery(node_id))

    def test_quiz_attempts_cascade_delete(self) -> None:
        """Quiz attempts should be deleted when the node is deleted."""
        node_id = self._create_node_with_quiz()
        self.manager.create_quiz_attempt(node_id, _make_stable_uuid("A"))
        self.manager.create_quiz_attempt(node_id, _make_stable_uuid("B"))

        # Verify attempts exist
        history = self.manager.get_quiz_attempts(node_id)
        self.assertEqual(history["total_attempts"], 2)

        # Delete the node via session deletion
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM concept_nodes WHERE id = ?", (node_id,))
            conn.commit()

            # Verify attempts are gone
            cursor.execute(
                "SELECT COUNT(*) FROM quiz_attempts WHERE node_id = ?",
                (node_id,),
            )
            self.assertEqual(cursor.fetchone()[0], 0)
        finally:
            conn.close()


class TestQuizSetPersistence(unittest.TestCase):
    """Tests for QuizSet (multi-quiz) persistence functionality."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_quiz_set(self, num_quizzes: int = 3):
        """Create a QuizSet with multiple quizzes for testing."""
        from server.schemas.learning import QuizSet

        quizzes = []
        for i in range(num_quizzes):
            correct_idx = i % 4  # Rotate correct answer
            options = []
            for j, label in enumerate(["A", "B", "C", "D"]):
                options.append(
                    QuizOption(
                        option_id=_make_stable_uuid(f"quiz{i}-{label}"),
                        display_label=label,
                        text=f"Answer {label} for Q{i + 1}",
                        is_correct=(j == correct_idx),
                        explanation=f"Explanation for Q{i + 1} option {label}",
                    )
                )
            quizzes.append(
                QuizCard(
                    question_text=f"Question {i + 1}?",
                    options=options,
                    difficulty=QuizDifficulty.EASY,
                )
            )

        return QuizSet(
            quizzes=quizzes,
            current_index=0,
            shuffle_seed="test-seed-123",
        )

    def _create_session_with_quiz_set(self, num_quizzes: int = 3):
        """Helper to create a session with a node that has a QuizSet."""
        session = self.manager.create_learning_session(
            query="Test query", course_title="Test Course", user_id="user-1"
        )
        quiz_set = self._make_quiz_set(num_quizzes)
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Test Node",
            content_markdown="Test content",
            status=NodeStatus.IN_QUIZ,
            quiz_set=quiz_set,
        )
        return session["id"], node["id"], quiz_set

    def test_create_concept_node_with_quiz_set(self) -> None:
        """Creating a node with quiz_set should store it correctly."""
        session_id, node_id, original_quiz_set = self._create_session_with_quiz_set(3)

        # Retrieve and verify
        quiz_set_data = self.manager.get_quiz_set_for_node(node_id)
        assert quiz_set_data is not None

        self.assertEqual(quiz_set_data["format_version"], 1)
        self.assertEqual(quiz_set_data["shuffle_seed"], "test-seed-123")
        self.assertEqual(quiz_set_data["current_index"], 0)
        self.assertEqual(len(quiz_set_data["quiz_set"].quizzes), 3)

    def test_create_quiz_set_directly(self) -> None:
        """Test creating a QuizSet directly using create_quiz_set."""
        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
        )

        quiz_set = self._make_quiz_set(2)
        result = self.manager.create_quiz_set(
            node_id=node["id"],
            quiz_set=quiz_set,
            shuffle_seed="custom-seed-456",
        )

        self.assertEqual(result["format_version"], 1)
        self.assertEqual(result["shuffle_seed"], "custom-seed-456")
        self.assertEqual(result["total_quizzes"], 2)
        self.assertEqual(result["current_index"], 0)

    def test_update_quiz_set_progress(self) -> None:
        """Test updating current quiz index."""
        _, node_id, _ = self._create_session_with_quiz_set(3)

        # Update to second quiz
        result = self.manager.update_quiz_set_progress(node_id, 1)
        assert result is not None
        self.assertEqual(result["current_index"], 1)

        # Update to third quiz
        result = self.manager.update_quiz_set_progress(node_id, 2)
        assert result is not None
        self.assertEqual(result["current_index"], 2)

    def test_update_quiz_set_progress_invalid_index(self) -> None:
        """Updating with invalid index should raise ValueError."""
        _, node_id, _ = self._create_session_with_quiz_set(2)

        with self.assertRaises(ValueError) as ctx:
            self.manager.update_quiz_set_progress(node_id, 5)
        self.assertIn("Invalid current_index", str(ctx.exception))

    def test_get_quiz_for_node_returns_current_quiz(self) -> None:
        """get_quiz_for_node should return the current quiz from QuizSet."""
        _, node_id, quiz_set = self._create_session_with_quiz_set(3)

        # Default current_index is 0
        quiz = self.manager.get_quiz_for_node(node_id)
        assert quiz is not None
        self.assertEqual(quiz.question_text, "Question 1?")

        # Update progress and check again
        self.manager.update_quiz_set_progress(node_id, 1)
        quiz = self.manager.get_quiz_for_node(node_id)
        assert quiz is not None
        self.assertEqual(quiz.question_text, "Question 2?")

    def test_create_quiz_attempt_with_quiz_index(self) -> None:
        """Quiz attempts should track quiz_index in multi-quiz scenario."""
        _, node_id, _ = self._create_session_with_quiz_set(3)

        # Answer first quiz correctly
        correct_option_id = _make_stable_uuid("quiz0-A")  # First quiz, A is correct
        result = self.manager.create_quiz_attempt(
            node_id, correct_option_id, quiz_index=0
        )

        self.assertEqual(result["quiz_index"], 0)
        self.assertTrue(result["is_correct"])
        self.assertFalse(result["is_mastered"])  # Not all quizzes answered yet

        # Check attempt history includes quiz_index
        history = self.manager.get_quiz_attempts(node_id)
        self.assertEqual(history["total_attempts"], 1)
        self.assertEqual(history["attempts"][0]["quiz_index"], 0)

    def test_multi_quiz_mastery_requires_all_correct(self) -> None:
        """Mastery requires all quizzes in the set to be answered correctly."""
        _, node_id, _ = self._create_session_with_quiz_set(3)

        # Answer first quiz correctly
        self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("quiz0-A"), quiz_index=0
        )
        self.assertFalse(self.manager.check_mastery(node_id))

        # Answer second quiz correctly
        self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("quiz1-B"), quiz_index=1
        )
        self.assertFalse(self.manager.check_mastery(node_id))

        # Answer third quiz correctly
        self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("quiz2-C"), quiz_index=2
        )
        self.assertTrue(self.manager.check_mastery(node_id))

    def test_single_quiz_mastery_any_correct(self) -> None:
        """Single quiz mastery requires only one correct answer."""
        _, node_id, _ = self._create_session_with_quiz_set(1)

        # Answer incorrectly first
        self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("quiz0-B"), quiz_index=0
        )
        self.assertFalse(self.manager.check_mastery(node_id))

        # Answer correctly
        self.manager.create_quiz_attempt(
            node_id, _make_stable_uuid("quiz0-A"), quiz_index=0
        )
        self.assertTrue(self.manager.check_mastery(node_id))


class TestLegacyQuizMigration(unittest.TestCase):
    """Tests for backward compatibility with legacy single-quiz format."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_legacy_quiz_stored_without_format_version(self) -> None:
        """Legacy single quiz should be stored without format_version."""
        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
            quiz=quiz,
        )

        # Verify stored without format_version (None/0)
        quiz_set_data = self.manager.get_quiz_set_for_node(node["id"])
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["format_version"], 0)
        self.assertEqual(len(quiz_set_data["quiz_set"].quizzes), 1)

    def test_legacy_quiz_retrieved_via_get_quiz_for_node(self) -> None:
        """Legacy quiz should be retrievable via get_quiz_for_node."""
        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
            quiz=quiz,
        )

        # Should return the single quiz
        retrieved_quiz = self.manager.get_quiz_for_node(node["id"])
        assert retrieved_quiz is not None
        self.assertEqual(retrieved_quiz.question_text, quiz.question_text)

    def test_legacy_quiz_attempt_still_works(self) -> None:
        """Quiz attempts should work with legacy quiz format."""
        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
            quiz=quiz,
        )

        # Should be able to submit answer
        correct_option_id = _make_stable_uuid("A")
        result = self.manager.create_quiz_attempt(node["id"], correct_option_id)

        self.assertTrue(result["is_correct"])
        self.assertTrue(result["is_mastered"])

    def test_legacy_quiz_reuses_persisted_shuffle_seed(self) -> None:
        """Legacy quiz rows should return stored shuffle_seed values."""
        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
            quiz=quiz,
        )

        self.manager.update_quiz_shuffle_seed(node["id"], "persisted-seed-1")

        quiz_set_data = self.manager.get_quiz_set_for_node(node["id"])
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["format_version"], 0)
        self.assertEqual(quiz_set_data["shuffle_seed"], "persisted-seed-1")

    def test_update_from_legacy_to_quiz_set(self) -> None:
        """Should be able to update a legacy quiz to QuizSet."""
        from server.schemas.learning import QuizSet

        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
            quiz=quiz,
        )

        # Update to QuizSet
        quiz_set = QuizSet(
            quizzes=[quiz, quiz],  # Two copies of same quiz
            current_index=0,
            shuffle_seed="updated-seed",
        )
        updated = self.manager.update_node_content(
            node_id=node["id"],
            content_markdown="Updated content",
            status=NodeStatus.IN_QUIZ,
            quiz_set=quiz_set,
        )

        assert updated is not None
        quiz_set_data = self.manager.get_quiz_set_for_node(node["id"])
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["format_version"], 1)
        self.assertEqual(len(quiz_set_data["quiz_set"].quizzes), 2)


class TestLegacySchemaMigration(unittest.TestCase):
    """Tests migration behavior for databases created before QuizSet schema."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "legacy_learning.db"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_legacy_database(self) -> str:
        """Create a pre-migration schema with a legacy single-quiz payload."""
        session_id = str(uuid.uuid4())
        node_id = str(uuid.uuid4())
        quiz_data_id = str(uuid.uuid4())
        quiz_payload = _make_quiz_card().model_dump()

        conn = sqlite3.connect(str(self.db_path))
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")

            cursor.execute(
                """
                CREATE TABLE learning_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    query TEXT NOT NULL,
                    course_title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE concept_nodes (
                    id TEXT PRIMARY KEY,
                    learning_session_id TEXT NOT NULL,
                    sequence_index INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (learning_session_id)
                        REFERENCES learning_sessions(id)
                        ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE quiz_data (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id)
                        REFERENCES concept_nodes(id)
                        ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE quiz_attempts (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    attempt_number INTEGER NOT NULL,
                    selected_option_id TEXT NOT NULL,
                    is_correct INTEGER NOT NULL,
                    score_percent INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id)
                        REFERENCES concept_nodes(id)
                        ON DELETE CASCADE
                )
                """
            )

            cursor.execute(
                """
                INSERT INTO learning_sessions (id, user_id, query, course_title)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, "user-1", "Legacy topic", "Legacy course"),
            )
            cursor.execute(
                """
                INSERT INTO concept_nodes (
                    id, learning_session_id, sequence_index, title,
                    content_markdown, status
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    node_id,
                    session_id,
                    0,
                    "Legacy node",
                    "Legacy content",
                    NodeStatus.IN_QUIZ.value,
                ),
            )
            cursor.execute(
                """
                INSERT INTO quiz_data (id, node_id, payload)
                VALUES (?, ?, ?)
                """,
                (quiz_data_id, node_id, json.dumps(quiz_payload)),
            )
            conn.commit()
        finally:
            conn.close()

        return node_id

    def test_migration_keeps_legacy_quiz_rows_readable(self) -> None:
        """Migration should preserve legacy marker for existing single quiz rows."""
        node_id = self._create_legacy_database()
        manager = LearningManager(self.db_path)

        manager.init_learning_tables()

        quiz = manager.get_quiz_for_node(node_id)
        assert quiz is not None
        self.assertEqual(quiz.question_text, "What is 2 + 2?")

        quiz_set_data = manager.get_quiz_set_for_node(node_id)
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["format_version"], 0)

    def test_migration_adds_progress_and_timestamp_columns(self) -> None:
        """Migration should add all Phase 09-01 schema columns."""
        self._create_legacy_database()
        manager = LearningManager(self.db_path)

        manager.init_learning_tables()
        manager.init_learning_tables()

        conn = manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(learning_sessions)")
            learning_columns = {row["name"] for row in cursor.fetchall()}
            self.assertIn("status", learning_columns)
            self.assertIn("progress_percent", learning_columns)
            self.assertIn("completed_at", learning_columns)
            self.assertIn("last_active_node_id", learning_columns)

            cursor.execute("PRAGMA table_info(concept_nodes)")
            node_columns = {row["name"] for row in cursor.fetchall()}
            self.assertIn("started_at", node_columns)
            self.assertIn("completed_at", node_columns)
        finally:
            conn.close()

    def test_migration_sets_defaults_and_nullable_values(self) -> None:
        """Migration should apply defaults and preserve nullable timestamps."""
        self._create_legacy_database()
        manager = LearningManager(self.db_path)
        manager.init_learning_tables()

        conn = manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT status, progress_percent, completed_at, last_active_node_id
                FROM learning_sessions
                LIMIT 1
                """
            )
            session_row = cursor.fetchone()
            assert session_row is not None
            self.assertEqual(session_row["status"], "in_progress")
            self.assertEqual(session_row["progress_percent"], 0)
            self.assertIsNone(session_row["completed_at"])
            self.assertIsNone(session_row["last_active_node_id"])

            cursor.execute(
                """
                SELECT started_at, completed_at
                FROM concept_nodes
                LIMIT 1
                """
            )
            node_row = cursor.fetchone()
            assert node_row is not None
            self.assertIsNone(node_row["started_at"])
            self.assertIsNone(node_row["completed_at"])
        finally:
            conn.close()


class TestSessionProgressHelpers(unittest.TestCase):
    """Tests progress helper behavior introduced in Phase 09-01."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_session_with_nodes(self, total_nodes: int) -> tuple[str, list[str]]:
        session = self.manager.create_learning_session(
            query="Progress test",
            course_title="Progress 101",
            user_id="user-1",
        )
        node_ids = []
        for index in range(total_nodes):
            node = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=index,
                title=f"Node {index}",
                content_markdown="Content",
                status=NodeStatus.LOCKED,
            )
            node_ids.append(node["id"])
        return session["id"], node_ids

    def test_calculate_progress_percent(self) -> None:
        self.assertEqual(self.manager._calculate_progress_percent(0, 5), 0)
        self.assertEqual(self.manager._calculate_progress_percent(3, 5), 60)
        self.assertEqual(self.manager._calculate_progress_percent(5, 5), 100)
        self.assertEqual(self.manager._calculate_progress_percent(7, 5), 100)

    def test_update_session_progress_zero_percent(self) -> None:
        session_id, _ = self._create_session_with_nodes(total_nodes=5)

        conn = self.manager._get_connection()
        try:
            progress = self.manager._update_session_progress(session_id, conn)
            conn.commit()
            self.assertEqual(progress, 0)

            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT status, progress_percent, completed_at
                FROM learning_sessions
                WHERE id = ?
                """,
                (session_id,),
            )
            row = cursor.fetchone()
            assert row is not None
            self.assertEqual(row["status"], "in_progress")
            self.assertEqual(row["progress_percent"], 0)
            self.assertIsNone(row["completed_at"])
        finally:
            conn.close()

    def test_update_session_progress_tracks_completion_and_last_active(self) -> None:
        session_id, node_ids = self._create_session_with_nodes(total_nodes=5)

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE concept_nodes
                SET status = ?
                WHERE id IN (?, ?, ?)
                """,
                (
                    NodeStatus.COMPLETED.value,
                    node_ids[0],
                    node_ids[1],
                    node_ids[2],
                ),
            )
            self.manager._update_session_progress(
                session_id=session_id,
                conn=conn,
                last_active_node_id=node_ids[2],
            )
            conn.commit()

            cursor.execute(
                """
                SELECT status, progress_percent, completed_at, last_active_node_id
                FROM learning_sessions
                WHERE id = ?
                """,
                (session_id,),
            )
            partial_row = cursor.fetchone()
            assert partial_row is not None
            self.assertEqual(partial_row["status"], "in_progress")
            self.assertEqual(partial_row["progress_percent"], 60)
            self.assertIsNone(partial_row["completed_at"])
            self.assertEqual(partial_row["last_active_node_id"], node_ids[2])

            cursor.execute(
                """
                UPDATE concept_nodes
                SET status = ?
                WHERE learning_session_id = ?
                """,
                (NodeStatus.COMPLETED.value, session_id),
            )
            self.manager._update_session_progress(
                session_id=session_id,
                conn=conn,
                last_active_node_id=node_ids[4],
            )
            conn.commit()

            cursor.execute(
                """
                SELECT status, progress_percent, completed_at, last_active_node_id
                FROM learning_sessions
                WHERE id = ?
                """,
                (session_id,),
            )
            complete_row = cursor.fetchone()
            assert complete_row is not None
            self.assertEqual(complete_row["status"], "completed")
            self.assertEqual(complete_row["progress_percent"], 100)
            self.assertIsNotNone(complete_row["completed_at"])
            self.assertEqual(complete_row["last_active_node_id"], node_ids[4])
        finally:
            conn.close()

    def test_node_timestamps_are_set_on_transitions(self) -> None:
        session_id, node_ids = self._create_session_with_nodes(total_nodes=1)
        node_id = node_ids[0]

        first_transition = self.manager.update_node_status(
            node_id, NodeStatus.VIEWING_EXPLANATION
        )
        self.assertIsNotNone(first_transition)

        self.manager.update_node_status(node_id, NodeStatus.IN_QUIZ)
        self.manager.update_node_status(node_id, NodeStatus.SHOWING_FEEDBACK)
        completed_node = self.manager.update_node_status(node_id, NodeStatus.COMPLETED)
        self.assertIsNotNone(completed_node)

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT started_at, completed_at
                FROM concept_nodes
                WHERE id = ?
                """,
                (node_id,),
            )
            node_row = cursor.fetchone()
            assert node_row is not None
            self.assertIsNotNone(node_row["started_at"])
            self.assertIsNotNone(node_row["completed_at"])

            cursor.execute(
                """
                SELECT status, progress_percent, completed_at, last_active_node_id
                FROM learning_sessions
                WHERE id = ?
                """,
                (session_id,),
            )
            session_row = cursor.fetchone()
            assert session_row is not None
            self.assertEqual(session_row["status"], "completed")
            self.assertEqual(session_row["progress_percent"], 100)
            self.assertIsNotNone(session_row["completed_at"])
            self.assertEqual(session_row["last_active_node_id"], node_id)
        finally:
            conn.close()

    def test_started_at_not_overwritten_on_subsequent_views(self) -> None:
        _, node_ids = self._create_session_with_nodes(total_nodes=1)
        node_id = node_ids[0]

        self.manager.update_node_status(node_id, NodeStatus.VIEWING_EXPLANATION)

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT started_at FROM concept_nodes WHERE id = ?",
                (node_id,),
            )
            first_started_at = cursor.fetchone()["started_at"]
            self.assertIsNotNone(first_started_at)

            cursor.execute(
                "UPDATE concept_nodes SET status = ? WHERE id = ?",
                (NodeStatus.LOCKED.value, node_id),
            )
            conn.commit()
        finally:
            conn.close()

        self.manager.update_node_status(node_id, NodeStatus.VIEWING_EXPLANATION)

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT started_at FROM concept_nodes WHERE id = ?",
                (node_id,),
            )
            second_started_at = cursor.fetchone()["started_at"]
            self.assertEqual(second_started_at, first_started_at)
        finally:
            conn.close()

    def test_last_active_updates_on_quiz_submission(self) -> None:
        session = self.manager.create_learning_session(
            query="Quiz tracking",
            course_title="Quiz Tracking 101",
            user_id="user-1",
        )
        session_id = session["id"]
        quiz_node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Quiz Node",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
            quiz=_make_quiz_card(),
        )
        other_node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=1,
            title="Other Node",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )

        self.manager.update_node_status(quiz_node["id"], NodeStatus.VIEWING_EXPLANATION)
        self.manager.update_node_status(quiz_node["id"], NodeStatus.IN_QUIZ)
        self.manager.update_node_status(
            other_node["id"], NodeStatus.VIEWING_EXPLANATION
        )

        self.manager.create_quiz_attempt(
            node_id=quiz_node["id"],
            selected_option_id=_make_stable_uuid("A"),
            quiz_index=0,
        )

        progress = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(progress)
        if progress is None:
            self.fail("Expected session progress to exist")

        self.assertEqual(progress["last_active_node_id"], quiz_node["id"])

    def test_get_session_progress_returns_progress_summary(self) -> None:
        session_id, node_ids = self._create_session_with_nodes(total_nodes=5)

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE concept_nodes
                SET status = ?
                WHERE id IN (?, ?, ?)
                """,
                (
                    NodeStatus.COMPLETED.value,
                    node_ids[0],
                    node_ids[1],
                    node_ids[2],
                ),
            )
            self.manager._update_session_progress(
                session_id=session_id,
                conn=conn,
                last_active_node_id=node_ids[2],
            )
            conn.commit()
        finally:
            conn.close()

        summary = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(summary)
        if summary is None:
            self.fail("Expected session progress summary")

        self.assertEqual(summary["progress_percent"], 60)
        self.assertEqual(summary["status"], "in_progress")
        self.assertEqual(summary["completed_nodes"], 3)
        self.assertEqual(summary["total_nodes"], 5)
        self.assertEqual(summary["last_active_node_id"], node_ids[2])
        self.assertEqual(summary["last_active_node_title"], "Node 2")


class TestSessionListingPersistence(unittest.TestCase):
    """Tests for session listing persistence query behavior."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "session_listing.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_session_with_progress(
        self,
        query: str,
        course_title: str,
        total_nodes: int,
        completed_nodes: int,
        user_id: str = "user-1",
    ) -> tuple[str, list[str]]:
        session = self.manager.create_learning_session(
            query=query,
            course_title=course_title,
            user_id=user_id,
        )
        node_ids: list[str] = []
        for index in range(total_nodes):
            node = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=index,
                title=f"{course_title} Node {index}",
                content_markdown="Content",
                status=NodeStatus.LOCKED,
            )
            node_ids.append(node["id"])

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            if completed_nodes > 0:
                placeholders = ",".join("?" for _ in range(completed_nodes))
                cursor.execute(
                    f"""
                    UPDATE concept_nodes
                    SET status = ?
                    WHERE id IN ({placeholders})
                    """,
                    (NodeStatus.COMPLETED.value, *node_ids[:completed_nodes]),
                )
            last_active_node_id = None
            if node_ids and completed_nodes > 0:
                last_active_node_id = node_ids[min(completed_nodes, total_nodes) - 1]
            self.manager._update_session_progress(
                session_id=session["id"],
                conn=conn,
                last_active_node_id=last_active_node_id,
            )
            conn.commit()
        finally:
            conn.close()
        return session["id"], node_ids

    def _set_session_timestamps(
        self, session_id: str, created_at: str, updated_at: str
    ) -> None:
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE learning_sessions
                SET created_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (created_at, updated_at, session_id),
            )
            conn.commit()
        finally:
            conn.close()

    def _insert_revision(self, session_id: str, revision_number: int) -> None:
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO revision_sessions (
                    id, original_session_id, revision_number, mode, status,
                    progress_percent, started_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    session_id,
                    revision_number,
                    "full_review",
                    "completed",
                    100,
                    "2026-02-16T00:00:00+00:00",
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def test_get_sessions_list_empty_returns_no_rows(self) -> None:
        sessions, total_count = self.manager.get_sessions_list()
        self.assertEqual(sessions, [])
        self.assertEqual(total_count, 0)

    def test_get_sessions_list_returns_progress_and_counts(self) -> None:
        self._create_session_with_progress(
            query="Topic A",
            course_title="Course A",
            total_nodes=2,
            completed_nodes=0,
        )
        self._create_session_with_progress(
            query="Topic B",
            course_title="Course B",
            total_nodes=2,
            completed_nodes=1,
        )
        self._create_session_with_progress(
            query="Topic C",
            course_title="Course C",
            total_nodes=2,
            completed_nodes=2,
        )

        sessions, total_count = self.manager.get_sessions_list(
            sort_by="progress_percent",
            sort_order="asc",
        )

        self.assertEqual(total_count, 3)
        self.assertEqual(len(sessions), 3)
        self.assertEqual([row["progress_percent"] for row in sessions], [0, 50, 100])
        self.assertEqual([row["completed_nodes"] for row in sessions], [0, 1, 2])
        self.assertEqual([row["total_nodes"] for row in sessions], [2, 2, 2])

    def test_get_sessions_list_filters_by_status(self) -> None:
        self._create_session_with_progress(
            query="Topic A",
            course_title="Course A",
            total_nodes=2,
            completed_nodes=0,
        )
        self._create_session_with_progress(
            query="Topic B",
            course_title="Course B",
            total_nodes=2,
            completed_nodes=2,
        )

        in_progress_sessions, in_progress_total = self.manager.get_sessions_list(
            status="in_progress"
        )
        completed_sessions, completed_total = self.manager.get_sessions_list(
            status="completed"
        )

        self.assertEqual(in_progress_total, 1)
        self.assertEqual(completed_total, 1)
        self.assertEqual(len(in_progress_sessions), 1)
        self.assertEqual(len(completed_sessions), 1)
        self.assertEqual(in_progress_sessions[0]["status"], "in_progress")
        self.assertEqual(completed_sessions[0]["status"], "completed")

    def test_get_sessions_list_filters_by_computed_status_not_stored(self) -> None:
        """Filter should use computed status from nodes, not stored ls.status.

        Regression test: Ensures that when ls.status is out of sync with
        actual node completion, filtering still works correctly.
        """
        # Create a session with all nodes completed
        session_id, node_ids = self._create_session_with_progress(
            query="Completed Topic",
            course_title="Completed Course",
            total_nodes=2,
            completed_nodes=2,
        )

        # Manually set the stored status to 'in_progress' (simulating a bug
        # where _update_session_progress wasn't called)
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE learning_sessions SET status = 'in_progress' WHERE id = ?",
                (session_id,),
            )
            conn.commit()
        finally:
            conn.close()

        # Verify the stored status is 'in_progress'
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT status FROM learning_sessions WHERE id = ?",
                (session_id,),
            )
            stored_status = cursor.fetchone()["status"]
            self.assertEqual(stored_status, "in_progress")
        finally:
            conn.close()

        # Query by 'in_progress' - should NOT return the session
        # because computed status from nodes is 'completed'
        in_progress_sessions, in_progress_total = self.manager.get_sessions_list(
            status="in_progress"
        )
        self.assertEqual(in_progress_total, 0)
        self.assertEqual(len(in_progress_sessions), 0)

        # Query by 'completed' - SHOULD return the session
        completed_sessions, completed_total = self.manager.get_sessions_list(
            status="completed"
        )
        self.assertEqual(completed_total, 1)
        self.assertEqual(len(completed_sessions), 1)
        self.assertEqual(completed_sessions[0]["id"], session_id)
        self.assertEqual(completed_sessions[0]["status"], "completed")
        self.assertEqual(completed_sessions[0]["progress_percent"], 100)

    def test_get_sessions_list_sorts_by_progress_percent_ascending(self) -> None:
        self._create_session_with_progress(
            query="Topic A",
            course_title="Course A",
            total_nodes=2,
            completed_nodes=2,
        )
        self._create_session_with_progress(
            query="Topic B",
            course_title="Course B",
            total_nodes=2,
            completed_nodes=0,
        )
        self._create_session_with_progress(
            query="Topic C",
            course_title="Course C",
            total_nodes=2,
            completed_nodes=1,
        )

        sessions, _ = self.manager.get_sessions_list(
            sort_by="progress_percent",
            sort_order="asc",
        )

        self.assertEqual([row["progress_percent"] for row in sessions], [0, 50, 100])

    def test_get_sessions_list_supports_pagination(self) -> None:
        session_a, _ = self._create_session_with_progress(
            query="Topic A",
            course_title="Course A",
            total_nodes=1,
            completed_nodes=0,
        )
        session_b, _ = self._create_session_with_progress(
            query="Topic B",
            course_title="Course B",
            total_nodes=1,
            completed_nodes=0,
        )
        session_c, _ = self._create_session_with_progress(
            query="Topic C",
            course_title="Course C",
            total_nodes=1,
            completed_nodes=0,
        )
        self._set_session_timestamps(
            session_a, "2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"
        )
        self._set_session_timestamps(
            session_b, "2026-01-02T00:00:00+00:00", "2026-01-02T00:00:00+00:00"
        )
        self._set_session_timestamps(
            session_c, "2026-01-03T00:00:00+00:00", "2026-01-03T00:00:00+00:00"
        )

        first_page, total_count = self.manager.get_sessions_list(
            sort_by="created_at",
            sort_order="asc",
            limit=2,
            offset=0,
        )
        second_page, second_total = self.manager.get_sessions_list(
            sort_by="created_at",
            sort_order="asc",
            limit=2,
            offset=2,
        )

        self.assertEqual(total_count, 3)
        self.assertEqual(second_total, 3)
        self.assertEqual([row["id"] for row in first_page], [session_a, session_b])
        self.assertEqual([row["id"] for row in second_page], [session_c])

    def test_get_sessions_list_includes_revision_count(self) -> None:
        session_a, _ = self._create_session_with_progress(
            query="Topic A",
            course_title="Course A",
            total_nodes=1,
            completed_nodes=1,
        )
        session_b, _ = self._create_session_with_progress(
            query="Topic B",
            course_title="Course B",
            total_nodes=1,
            completed_nodes=1,
        )
        session_c, _ = self._create_session_with_progress(
            query="Topic C",
            course_title="Course C",
            total_nodes=1,
            completed_nodes=1,
        )
        self._insert_revision(session_b, 1)
        self._insert_revision(session_c, 1)
        self._insert_revision(session_c, 2)

        sessions, total_count = self.manager.get_sessions_list()

        self.assertEqual(total_count, 3)
        revision_counts = {row["id"]: row["revision_count"] for row in sessions}
        self.assertEqual(revision_counts[session_a], 0)
        self.assertEqual(revision_counts[session_b], 1)
        self.assertEqual(revision_counts[session_c], 2)


class TestRevisionPersistenceSchema(unittest.TestCase):
    """Tests revision persistence tables and related constraints."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "revision_learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_session_and_node(self) -> tuple[str, str]:
        session = self.manager.create_learning_session(
            query="Revision topic",
            course_title="Revision course",
            user_id="user-1",
        )
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node 0",
            content_markdown="Content",
            status=NodeStatus.LOCKED,
        )
        return session["id"], node["id"]

    def test_revision_tables_and_indexes_created(self) -> None:
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(revision_sessions)")
            revision_columns = {row["name"] for row in cursor.fetchall()}
            self.assertEqual(
                revision_columns,
                {
                    "id",
                    "original_session_id",
                    "revision_number",
                    "mode",
                    "status",
                    "progress_percent",
                    "total_quiz_score_percent",
                    "started_at",
                    "completed_at",
                },
            )

            cursor.execute("PRAGMA index_list(revision_sessions)")
            revision_indexes = {row["name"] for row in cursor.fetchall()}
            self.assertIn("idx_revision_original_session_id", revision_indexes)

            cursor.execute("PRAGMA table_info(revision_node_progress)")
            node_progress_columns = {row["name"] for row in cursor.fetchall()}
            self.assertEqual(
                node_progress_columns,
                {
                    "id",
                    "revision_session_id",
                    "node_id",
                    "status",
                    "reviewed_at",
                },
            )

            cursor.execute("PRAGMA index_list(revision_node_progress)")
            node_progress_indexes = {row["name"] for row in cursor.fetchall()}
            self.assertIn(
                "idx_revision_node_progress_session_id", node_progress_indexes
            )
        finally:
            conn.close()

    def test_revision_node_progress_cascades_on_revision_delete(self) -> None:
        session_id, node_id = self._create_session_and_node()

        revision_session_id = str(uuid.uuid4())
        revision_node_progress_id = str(uuid.uuid4())
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO revision_sessions (
                    id, original_session_id, revision_number, mode, status, progress_percent
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    revision_session_id,
                    session_id,
                    1,
                    "full_review",
                    "in_progress",
                    0,
                ),
            )
            cursor.execute(
                """
                INSERT INTO revision_node_progress (
                    id, revision_session_id, node_id, status
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    revision_node_progress_id,
                    revision_session_id,
                    node_id,
                    "pending",
                ),
            )
            conn.commit()

            cursor.execute(
                "DELETE FROM revision_sessions WHERE id = ?",
                (revision_session_id,),
            )
            conn.commit()

            cursor.execute(
                "SELECT COUNT(*) FROM revision_node_progress WHERE id = ?",
                (revision_node_progress_id,),
            )
            self.assertEqual(cursor.fetchone()[0], 0)
        finally:
            conn.close()

    def test_revision_foreign_keys_enforced(self) -> None:
        _, node_id = self._create_session_and_node()
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            with self.assertRaises(sqlite3.IntegrityError):
                cursor.execute(
                    """
                    INSERT INTO revision_sessions (
                        id, original_session_id, revision_number, mode, status, progress_percent
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        "missing-session-id",
                        1,
                        "full_review",
                        "in_progress",
                        0,
                    ),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                cursor.execute(
                    """
                    INSERT INTO revision_node_progress (
                        id, revision_session_id, node_id, status
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        "missing-revision-session",
                        node_id,
                        "pending",
                    ),
                )
        finally:
            conn.close()

    def test_quiz_attempts_revision_session_id_accepts_null(self) -> None:
        _, node_id = self._create_session_and_node()
        attempt_id = str(uuid.uuid4())

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(quiz_attempts)")
            columns = {row["name"] for row in cursor.fetchall()}
            self.assertIn("revision_session_id", columns)

            cursor.execute(
                """
                INSERT INTO quiz_attempts (
                    id, node_id, attempt_number, quiz_index, revision_session_id,
                    selected_option_id, is_correct, score_percent
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    attempt_id,
                    node_id,
                    1,
                    0,
                    None,
                    "option-a",
                    0,
                    0,
                ),
            )
            conn.commit()

            cursor.execute(
                "SELECT revision_session_id FROM quiz_attempts WHERE id = ?",
                (attempt_id,),
            )
            row = cursor.fetchone()
            assert row is not None
            self.assertIsNone(row["revision_session_id"])
        finally:
            conn.close()

    def test_get_next_revision_number_counts_per_session(self) -> None:
        first_session_id, _ = self._create_session_and_node()
        second_session_id, _ = self._create_session_and_node()

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO revision_sessions (
                    id, original_session_id, revision_number, mode, status, progress_percent
                )
                VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    first_session_id,
                    1,
                    "full_review",
                    "completed",
                    100,
                    str(uuid.uuid4()),
                    first_session_id,
                    2,
                    "quiz_only",
                    "completed",
                    100,
                    str(uuid.uuid4()),
                    second_session_id,
                    1,
                    "full_review",
                    "in_progress",
                    0,
                ),
            )
            conn.commit()

            first_next = self.manager._get_next_revision_number(first_session_id, conn)
            second_next = self.manager._get_next_revision_number(
                second_session_id, conn
            )
            self.assertEqual(first_next, 3)
            self.assertEqual(second_next, 2)
        finally:
            conn.close()


class TestRevisionSessionPersistence(unittest.TestCase):
    """Tests CRUD operations for revision sessions and node progress."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "revision_crud_learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_learning_session(
        self, status: str = "completed", node_count: int = 3
    ) -> str:
        session = self.manager.create_learning_session(
            query="Revision CRUD topic",
            course_title="Revision CRUD course",
            user_id="user-1",
        )
        for index in range(node_count):
            self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=index,
                title=f"Node {index}",
                content_markdown=f"Content {index}",
                status=NodeStatus.COMPLETED,
            )

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE learning_sessions
                SET status = ?, progress_percent = ?,
                    completed_at = CASE
                        WHEN ? = 'completed' THEN '2026-02-16T00:00:00+00:00'
                        ELSE NULL
                    END
                WHERE id = ?
                """,
                (
                    status,
                    100 if status == "completed" else 0,
                    status,
                    session["id"],
                ),
            )
            conn.commit()
        finally:
            conn.close()

        return session["id"]

    def test_create_revision_for_completed_session_creates_pending_nodes(
        self,
    ) -> None:
        session_id = self._create_learning_session(status="completed", node_count=3)

        revision = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )

        self.assertEqual(revision["original_session_id"], session_id)
        self.assertEqual(revision["revision_number"], 1)
        self.assertEqual(revision["mode"], "full_review")
        self.assertEqual(revision["status"], "in_progress")
        self.assertEqual(len(revision["nodes"]), 3)
        self.assertTrue(all(node["status"] == "pending" for node in revision["nodes"]))

    def test_create_revision_for_in_progress_session_raises_value_error(self) -> None:
        # Create a session with incomplete nodes (not all COMPLETED)
        # so the derived status is actually "in_progress"
        session = self.manager.create_learning_session(
            query="In-progress topic",
            course_title="In-progress course",
            user_id="user-1",
        )
        session_id = session["id"]
        # Create 3 nodes: 2 completed, 1 still viewing (so session is in_progress)
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Node 0",
            content_markdown="Content 0",
            status=NodeStatus.COMPLETED,
        )
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=1,
            title="Node 1",
            content_markdown="Content 1",
            status=NodeStatus.COMPLETED,
        )
        self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=2,
            title="Node 2",
            content_markdown="Content 2",
            status=NodeStatus.VIEWING_EXPLANATION,  # Not completed!
        )

        with self.assertRaises(ValueError):
            self.manager.create_revision_session(session_id, mode="full_review")

    def test_create_revision_for_missing_session_raises_lookup_error(self) -> None:
        with self.assertRaises(LookupError):
            self.manager.create_revision_session("missing-session-id", mode="quiz_only")

    def test_revision_number_increments_for_same_original_session(self) -> None:
        session_id = self._create_learning_session(status="completed")

        first = self.manager.create_revision_session(session_id, mode="full_review")
        second = self.manager.create_revision_session(session_id, mode="quiz_only")
        third = self.manager.create_revision_session(session_id, mode="full_review")

        self.assertEqual(first["revision_number"], 1)
        self.assertEqual(second["revision_number"], 2)
        self.assertEqual(third["revision_number"], 3)
        self.assertEqual(second["mode"], "quiz_only")

    def test_get_revisions_for_session_returns_started_at_desc_order(self) -> None:
        session_id = self._create_learning_session(status="completed")
        first = self.manager.create_revision_session(session_id, mode="full_review")
        second = self.manager.create_revision_session(session_id, mode="quiz_only")

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE revision_sessions
                SET started_at = ?
                WHERE id = ?
                """,
                ("2026-02-15T00:00:00+00:00", first["id"]),
            )
            cursor.execute(
                """
                UPDATE revision_sessions
                SET started_at = ?
                WHERE id = ?
                """,
                ("2026-02-16T00:00:00+00:00", second["id"]),
            )
            conn.commit()
        finally:
            conn.close()

        revisions, total_count = self.manager.get_revisions_for_session(session_id)

        self.assertEqual(total_count, 2)
        self.assertEqual(
            [item["id"] for item in revisions], [second["id"], first["id"]]
        )

    def test_get_revision_session_returns_nodes_with_titles_and_sequence(self) -> None:
        session_id = self._create_learning_session(status="completed", node_count=2)
        created = self.manager.create_revision_session(session_id, mode="full_review")

        revision = self.manager.get_revision_session(created["id"])

        self.assertIsNotNone(revision)
        assert revision is not None
        self.assertEqual(revision["id"], created["id"])
        self.assertEqual(len(revision["nodes"]), 2)
        self.assertEqual(revision["nodes"][0]["node_title"], "Node 0")
        self.assertEqual(revision["nodes"][0]["sequence_index"], 0)

    def test_delete_revision_session_cascades_to_node_progress(self) -> None:
        session_id = self._create_learning_session(status="completed")
        created = self.manager.create_revision_session(session_id, mode="full_review")

        deleted = self.manager.delete_revision_session(created["id"])
        deleted_again = self.manager.delete_revision_session(created["id"])

        self.assertTrue(deleted)
        self.assertFalse(deleted_again)

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM revision_node_progress
                WHERE revision_session_id = ?
                """,
                (created["id"],),
            )
            row = cursor.fetchone()
            assert row is not None
            self.assertEqual(row["count"], 0)
        finally:
            conn.close()


class TestRevisionProgressAndSummary(unittest.TestCase):
    """Tests revision progress tracking and summary metrics."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "revision_progress_learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _make_node_quiz(self, prefix: str, correct_label: str = "A") -> QuizCard:
        options = []
        for label in ("A", "B", "C", "D"):
            options.append(
                QuizOption(
                    option_id=_make_stable_uuid(f"{prefix}-{label}"),
                    display_label=label,
                    text=f"{prefix} option {label}",
                    is_correct=label == correct_label,
                    explanation=f"{prefix} explanation {label}",
                )
            )
        return QuizCard(
            question_text=f"Question for {prefix}",
            options=options,
            difficulty=QuizDifficulty.MEDIUM,
        )

    def _create_completed_session_with_quizzes(
        self,
        node_count: int = 2,
    ) -> tuple[str, List[Dict[str, str]]]:
        session = self.manager.create_learning_session(
            query="Revision progress topic",
            course_title="Revision progress course",
            user_id="user-1",
        )
        node_infos: List[Dict[str, str]] = []
        for index in range(node_count):
            quiz = self._make_node_quiz(f"node-{index}", correct_label="A")
            created = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=index,
                title=f"Node {index}",
                content_markdown=f"Content {index}",
                status=NodeStatus.COMPLETED,
                quiz=quiz,
            )
            correct_option_id = next(
                option.option_id for option in quiz.options if option.is_correct
            )
            incorrect_option_id = next(
                option.option_id for option in quiz.options if not option.is_correct
            )
            node_infos.append(
                {
                    "id": created["id"],
                    "correct_option_id": correct_option_id,
                    "incorrect_option_id": incorrect_option_id,
                }
            )

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE learning_sessions
                SET status = 'completed',
                    progress_percent = 100,
                    completed_at = '2026-02-16T00:00:00+00:00'
                WHERE id = ?
                """,
                (session["id"],),
            )
            conn.commit()
        finally:
            conn.close()
        return session["id"], node_infos

    def test_mark_reviewed_updates_progress_and_auto_completes(self) -> None:
        session_id, node_infos = self._create_completed_session_with_quizzes(2)
        revision = self.manager.create_revision_session(session_id, mode="full_review")

        first = self.manager.mark_revision_node_reviewed(
            revision_id=revision["id"],
            node_id=node_infos[0]["id"],
        )
        self.assertEqual(first["status"], "reviewed")
        self.assertIsNotNone(first["reviewed_at"])

        mid = self.manager.get_revision_session(revision["id"])
        self.assertIsNotNone(mid)
        assert mid is not None
        self.assertEqual(mid["progress_percent"], 50)
        self.assertEqual(mid["status"], "in_progress")

        second = self.manager.mark_revision_node_reviewed(
            revision_id=revision["id"],
            node_id=node_infos[1]["id"],
        )
        self.assertEqual(second["status"], "reviewed")

        done = self.manager.get_revision_session(revision["id"])
        self.assertIsNotNone(done)
        assert done is not None
        self.assertEqual(done["progress_percent"], 100)
        self.assertEqual(done["status"], "completed")
        self.assertIsNotNone(done["completed_at"])

    def test_mark_reviewed_rejected_for_quiz_only_mode(self) -> None:
        session_id, node_infos = self._create_completed_session_with_quizzes(1)
        revision = self.manager.create_revision_session(session_id, mode="quiz_only")

        with self.assertRaises(ValueError):
            self.manager.mark_revision_node_reviewed(
                revision_id=revision["id"],
                node_id=node_infos[0]["id"],
            )

    def test_submit_revision_quiz_tracks_attempts_and_retry_status(self) -> None:
        session_id, node_infos = self._create_completed_session_with_quizzes(1)
        revision = self.manager.create_revision_session(session_id, mode="full_review")
        node_info = node_infos[0]

        failed = self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["incorrect_option_id"],
        )
        self.assertFalse(failed["is_correct"])
        self.assertEqual(failed["revision_node_status"], "quiz_failed")

        failed_retry = self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["incorrect_option_id"],
        )
        self.assertEqual(failed_retry["revision_node_status"], "quiz_failed")

        passed = self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )
        self.assertTrue(passed["is_correct"])
        self.assertEqual(passed["revision_node_status"], "quiz_passed")

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT revision_session_id, is_correct
                FROM quiz_attempts
                WHERE node_id = ?
                ORDER BY attempt_number ASC
                """,
                (node_info["id"],),
            )
            rows = cursor.fetchall()
            self.assertEqual(len(rows), 3)
            self.assertTrue(
                all(row["revision_session_id"] == revision["id"] for row in rows)
            )
            self.assertEqual([row["is_correct"] for row in rows], [0, 0, 1])
        finally:
            conn.close()

        updated_revision = self.manager.get_revision_session(revision["id"])
        self.assertIsNotNone(updated_revision)
        assert updated_revision is not None
        self.assertEqual(updated_revision["progress_percent"], 100)
        self.assertEqual(updated_revision["status"], "completed")

    def test_submit_revision_quiz_does_not_update_original_session(
        self,
    ) -> None:
        """Revision quiz submissions must not update the original
        session's last_active_node_id or updated_at timestamp."""
        session_id, node_infos = self._create_completed_session_with_quizzes(2)
        node_info = node_infos[0]

        # Snapshot original session metadata before revision
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT last_active_node_id, updated_at
                FROM learning_sessions
                WHERE id = ?
                """,
                (session_id,),
            )
            before = cursor.fetchone()
        finally:
            conn.close()

        revision = self.manager.create_revision_session(session_id, mode="full_review")
        self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )

        # Verify original session metadata is unchanged
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT last_active_node_id, updated_at
                FROM learning_sessions
                WHERE id = ?
                """,
                (session_id,),
            )
            after = cursor.fetchone()
        finally:
            conn.close()

        self.assertEqual(
            before["last_active_node_id"],
            after["last_active_node_id"],
            "Revision quiz must not change original session last_active_node_id",
        )
        self.assertEqual(
            before["updated_at"],
            after["updated_at"],
            "Revision quiz must not change original session updated_at",
        )

    def test_get_revision_summary_positive_improvement_with_time_spent(self) -> None:
        session_id, node_infos = self._create_completed_session_with_quizzes(1)
        node_info = node_infos[0]

        self.manager.create_quiz_attempt(
            node_id=node_info["id"],
            selected_option_id=node_info["incorrect_option_id"],
        )
        self.manager.create_quiz_attempt(
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )

        revision = self.manager.create_revision_session(session_id, mode="full_review")
        self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )

        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE revision_sessions
                SET started_at = ?, completed_at = ?, status = 'completed'
                WHERE id = ?
                """,
                (
                    "2026-02-16T00:00:00+00:00",
                    "2026-02-16T00:01:30+00:00",
                    revision["id"],
                ),
            )
            conn.commit()
        finally:
            conn.close()

        summary = self.manager.get_revision_summary(revision["id"])
        self.assertEqual(summary["progress_percent"], 100)
        self.assertEqual(summary["nodes_reviewed"], 1)
        self.assertEqual(summary["nodes_total"], 1)
        self.assertEqual(summary["quizzes_total"], 1)
        self.assertEqual(summary["quizzes_passed"], 1)
        self.assertEqual(summary["quizzes_failed"], 0)
        self.assertEqual(summary["total_quiz_score_percent"], 100)
        self.assertEqual(summary["time_spent_seconds"], 90)
        self.assertIsNotNone(summary["comparison"])
        assert summary["comparison"] is not None
        self.assertEqual(summary["comparison"]["original_quiz_score_percent"], 50)
        self.assertEqual(summary["comparison"]["improvement_percent"], 50)

    def test_get_revision_summary_negative_improvement(self) -> None:
        session_id, node_infos = self._create_completed_session_with_quizzes(1)
        node_info = node_infos[0]

        self.manager.create_quiz_attempt(
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )
        revision = self.manager.create_revision_session(session_id, mode="full_review")
        self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["incorrect_option_id"],
        )

        summary = self.manager.get_revision_summary(revision["id"])
        self.assertEqual(summary["total_quiz_score_percent"], 0)
        self.assertIsNotNone(summary["comparison"])
        assert summary["comparison"] is not None
        self.assertEqual(summary["comparison"]["original_quiz_score_percent"], 100)
        self.assertEqual(summary["comparison"]["improvement_percent"], -100)

    def test_get_revision_summary_zero_improvement(self) -> None:
        session_id, node_infos = self._create_completed_session_with_quizzes(1)
        node_info = node_infos[0]

        self.manager.create_quiz_attempt(
            node_id=node_info["id"],
            selected_option_id=node_info["incorrect_option_id"],
        )
        self.manager.create_quiz_attempt(
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )
        revision = self.manager.create_revision_session(session_id, mode="full_review")
        self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["incorrect_option_id"],
        )
        self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )

        summary = self.manager.get_revision_summary(revision["id"])
        self.assertEqual(summary["total_quiz_score_percent"], 50)
        self.assertEqual(summary["quizzes_total"], 2)
        self.assertEqual(summary["quizzes_passed"], 1)
        self.assertEqual(summary["quizzes_failed"], 1)
        self.assertIsNotNone(summary["comparison"])
        assert summary["comparison"] is not None
        self.assertEqual(summary["comparison"]["original_quiz_score_percent"], 50)
        self.assertEqual(summary["comparison"]["improvement_percent"], 0)


class TestRevisionQuizAttemptsMigration(unittest.TestCase):
    """Tests migration behavior for quiz_attempts.revision_session_id."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "legacy_revision_learning.db"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_legacy_database_with_attempt(self) -> tuple[str, str]:
        session_id = str(uuid.uuid4())
        node_id = str(uuid.uuid4())
        attempt_id = str(uuid.uuid4())

        conn = sqlite3.connect(str(self.db_path))
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute(
                """
                CREATE TABLE learning_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    query TEXT NOT NULL,
                    course_title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE concept_nodes (
                    id TEXT PRIMARY KEY,
                    learning_session_id TEXT NOT NULL,
                    sequence_index INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (learning_session_id)
                        REFERENCES learning_sessions(id)
                        ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE quiz_data (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id)
                        REFERENCES concept_nodes(id)
                        ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE quiz_attempts (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    attempt_number INTEGER NOT NULL,
                    selected_option_id TEXT NOT NULL,
                    is_correct INTEGER NOT NULL,
                    score_percent INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id)
                        REFERENCES concept_nodes(id)
                        ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                """
                INSERT INTO learning_sessions (id, user_id, query, course_title)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, "user-1", "Legacy topic", "Legacy course"),
            )
            cursor.execute(
                """
                INSERT INTO concept_nodes (
                    id, learning_session_id, sequence_index, title, content_markdown, status
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    node_id,
                    session_id,
                    0,
                    "Legacy node",
                    "Legacy content",
                    NodeStatus.IN_QUIZ.value,
                ),
            )
            cursor.execute(
                """
                INSERT INTO quiz_attempts (
                    id, node_id, attempt_number, selected_option_id, is_correct, score_percent
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    attempt_id,
                    node_id,
                    1,
                    "legacy-option",
                    0,
                    0,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        return node_id, attempt_id

    def test_migration_adds_revision_session_id_and_preserves_rows(self) -> None:
        node_id, attempt_id = self._create_legacy_database_with_attempt()
        manager = LearningManager(self.db_path)
        manager.init_learning_tables()

        conn = manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(quiz_attempts)")
            columns = {row["name"] for row in cursor.fetchall()}
            self.assertIn("revision_session_id", columns)

            cursor.execute(
                """
                SELECT node_id, revision_session_id
                FROM quiz_attempts
                WHERE id = ?
                """,
                (attempt_id,),
            )
            row = cursor.fetchone()
            assert row is not None
            self.assertEqual(row["node_id"], node_id)
            self.assertIsNone(row["revision_session_id"])
        finally:
            conn.close()


class TestQuizSetNavigation(unittest.TestCase):
    """Tests for navigating within a QuizSet."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "navigation_learning.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_node_with_quiz_set(self, num_quizzes: int = 3):
        session = self.manager.create_learning_session(
            query="Nav test", course_title="Nav Course", user_id="user-1"
        )

        quizzes = []
        for i in range(num_quizzes):
            options = [
                QuizOption(
                    option_id=_make_stable_uuid(f"q{i}-{l}"),
                    display_label=l,
                    text=f"Opt {l}",
                    is_correct=(l == "A"),
                    explanation="Exp",
                )
                for l in ["A", "B", "C", "D"]
            ]
            quizzes.append(
                QuizCard(
                    question_text=f"Q{i+1}",
                    options=options,
                    difficulty=QuizDifficulty.EASY,
                )
            )

        quiz_set = QuizSet(quizzes=quizzes, current_index=0)
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
            quiz_set=quiz_set,
        )
        return node["id"]

    def test_decrement_quiz_set_progress(self) -> None:
        """Test decrementing the current quiz index."""
        node_id = self._create_node_with_quiz_set(3)

        # Advance to index 2
        self.manager.update_quiz_set_progress(node_id, 2)
        quiz_set_data = self.manager.get_quiz_set_for_node(node_id)
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["current_index"], 2)

        # Decrement to index 1
        updated_node = self.manager.decrement_quiz_set_progress(node_id)
        self.assertIsNotNone(updated_node)
        quiz_set_data = self.manager.get_quiz_set_for_node(node_id)
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["current_index"], 1)

        # Decrement to index 0
        self.manager.decrement_quiz_set_progress(node_id)
        quiz_set_data = self.manager.get_quiz_set_for_node(node_id)
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["current_index"], 0)

        # Decrement at 0 should stay at 0
        self.manager.decrement_quiz_set_progress(node_id)
        quiz_set_data = self.manager.get_quiz_set_for_node(node_id)
        assert quiz_set_data is not None
        self.assertEqual(quiz_set_data["current_index"], 0)

    def test_decrement_non_quiz_set_returns_none(self) -> None:
        """Decrementing a node with a single legacy quiz should return None."""
        session = self.manager.create_learning_session(
            query="Test", course_title="Test", user_id="user-1"
        )
        quiz = _make_quiz_card()
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Node",
            content_markdown="Content",
            status=NodeStatus.IN_QUIZ,
            quiz=quiz,
        )

        result = self.manager.decrement_quiz_set_progress(node["id"])
        self.assertIsNone(result)

