"""
=============================================================================
FILE: test_learning_persistence.py
=============================================================================

PURPOSE:
Unit tests for learning persistence layer (LearningManager). Validates
CRUD operations with SQLite, ordering, status transitions, quiz payload
retrieval, and foreign key cascade behavior.

KEY TESTS:
- test_create_learning_session: Session creation and defaults
- test_get_session_nodes: Node ordering by sequence_index
- test_update_node_status: Status transition persistence
- test_update_node_content: Content and quiz update with error handling
- test_get_quiz_for_node: Quiz retrieval and deserialization
- test_cascade_delete: Foreign key cascade behavior
- test_create_quiz_attempt_correct_answer: Mastery detection
- test_check_mastery_mastered: 100% score = mastered

DEPENDENCIES:
- unittest: Python standard testing framework
- tempfile: Temporary database file creation
- pathlib: Path manipulation
- server.database.learning_persistence: LearningManager under test
- server.schemas.learning: NodeStatus, QuizCard, QuizDifficulty schemas

USAGE PATTERN:
```python
# Run all persistence tests
python -m unittest server.tests.test_learning_persistence

# Run specific test class
python -m unittest server.tests.test_learning_persistence.TestLearningManager

# Run quiz attempts tests
python -m unittest server.tests.test_learning_persistence.TestQuizAttempts
```

TEST SETUP:
- Each test gets a dedicated temporary SQLite database file
- setUp creates tables, tearDown cleans up temp files
- Tests verify actual SQLite persistence and retrieval
- Quiz attempt tests validate mastery logic

RELATED FILES:
- server/database/learning_persistence.py - LearningManager implementation
- server/database/models.py - SQLAlchemy models (if used)

NOTES:
- SQLite with file-based storage for test isolation
- Nodes ordered by sequence_index ASC
- Cascade delete: session -> nodes -> quiz_attempts
- Mastery: first 100% score attempt = mastered
=============================================================================
"""

# test_learning_persistence.py
# Unit tests for learning persistence layer operations

# Longer description (2-4 lines):
# - Exercises LearningManager CRUD operations with a temporary SQLite database.
# - Verifies ordering, status transitions, and quiz payload retrieval.
# - Confirms foreign key cascade behavior for sessions and nodes.

# @see: server/database/learning_persistence.py - Persistence methods under test
# @note: Each test uses a dedicated temp database file

import tempfile
import unittest
from pathlib import Path

from server.database.learning_persistence import LearningManager
from server.schemas.learning import NodeStatus, QuizCard, QuizDifficulty, QuizOption


def _make_quiz_card() -> QuizCard:
    return QuizCard(
        question_text="What is 2 + 2?",
        options=[
            QuizOption(
                id="A",
                text="4",
                is_correct=True,
                explanation="2 + 2 equals 4",
            ),
            QuizOption(
                id="B",
                text="5",
                is_correct=False,
                explanation="2 + 2 does not equal 5",
            ),
            QuizOption(
                id="C",
                text="3",
                is_correct=False,
                explanation="2 + 2 does not equal 3",
            ),
            QuizOption(
                id="D",
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
        result = self.manager.create_quiz_attempt(node_id, "A")  # A is correct

        self.assertEqual(result["node_id"], node_id)
        self.assertEqual(result["attempt_number"], 1)
        self.assertEqual(result["selected_option_id"], "A")
        self.assertTrue(result["is_correct"])
        self.assertEqual(result["score_percent"], 100)
        self.assertEqual(result["correct_option_id"], "A")
        self.assertTrue(result["is_mastered"])
        self.assertIn("2 + 2 equals 4", result["explanation"])

    def test_create_quiz_attempt_incorrect_answer(self) -> None:
        """Recording an incorrect answer should return is_correct=False and is_mastered=False."""
        node_id = self._create_node_with_quiz()
        result = self.manager.create_quiz_attempt(node_id, "B")  # B is incorrect

        self.assertEqual(result["attempt_number"], 1)
        self.assertEqual(result["selected_option_id"], "B")
        self.assertFalse(result["is_correct"])
        self.assertEqual(result["score_percent"], 0)
        self.assertEqual(result["correct_option_id"], "A")
        self.assertFalse(result["is_mastered"])
        self.assertIn("does not equal 5", result["explanation"])

    def test_create_quiz_attempt_invalid_option(self) -> None:
        """Submitting an invalid option ID should raise ValueError."""
        node_id = self._create_node_with_quiz()
        with self.assertRaises(ValueError) as ctx:
            self.manager.create_quiz_attempt(node_id, "Z")
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
            self.manager.create_quiz_attempt(node["id"], "A")
        self.assertIn("No quiz found", str(ctx.exception))

    def test_create_multiple_attempts_increments_number(self) -> None:
        """Multiple attempts should have incrementing attempt numbers."""
        node_id = self._create_node_with_quiz()

        result1 = self.manager.create_quiz_attempt(node_id, "B")  # wrong
        result2 = self.manager.create_quiz_attempt(node_id, "C")  # wrong
        result3 = self.manager.create_quiz_attempt(node_id, "A")  # correct

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

        self.manager.create_quiz_attempt(node_id, "B")  # wrong - 0%
        self.manager.create_quiz_attempt(node_id, "C")  # wrong - 0%
        self.manager.create_quiz_attempt(node_id, "A")  # correct - 100%

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
        self.manager.create_quiz_attempt(node_id, "B")
        self.assertFalse(self.manager.check_mastery(node_id))

    def test_check_mastery_mastered(self) -> None:
        """check_mastery should return True after a correct attempt."""
        node_id = self._create_node_with_quiz()

        self.manager.create_quiz_attempt(node_id, "B")  # wrong
        self.assertFalse(self.manager.check_mastery(node_id))

        self.manager.create_quiz_attempt(node_id, "A")  # correct
        self.assertTrue(self.manager.check_mastery(node_id))

    def test_quiz_attempts_cascade_delete(self) -> None:
        """Quiz attempts should be deleted when the node is deleted."""
        node_id = self._create_node_with_quiz()
        self.manager.create_quiz_attempt(node_id, "A")
        self.manager.create_quiz_attempt(node_id, "B")

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
