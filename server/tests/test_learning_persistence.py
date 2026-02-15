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
import uuid
from pathlib import Path

from server.database.learning_persistence import LearningManager
from server.schemas.learning import NodeStatus, QuizCard, QuizDifficulty, QuizOption, QuizSet


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
        self.assertEqual(result["correct_option_id"], correct_option_id)
        self.assertFalse(result["is_mastered"])
        self.assertIn("does not equal 5", result["explanation"])

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
                        text=f"Answer {label} for Q{i+1}",
                        is_correct=(j == correct_idx),
                        explanation=f"Explanation for Q{i+1} option {label}",
                    )
                )
            quizzes.append(
                QuizCard(
                    question_text=f"Question {i+1}?",
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
