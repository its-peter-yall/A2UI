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
            status=NodeStatus.UNLOCKED,
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
        updated = self.manager.update_node_status(node["id"], NodeStatus.UNLOCKED)
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated["status"], NodeStatus.UNLOCKED.value)

    def test_update_node_content(self) -> None:
        session_id = self._create_session()
        node = self.manager.create_concept_node(
            session_id=session_id,
            sequence_index=0,
            title="Intro",
            content_markdown="Content",
            status=NodeStatus.ERROR,
        )
        quiz = _make_quiz_card()
        updated = self.manager.update_node_content(
            node_id=node["id"],
            content_markdown="Updated content",
            status=NodeStatus.UNLOCKED,
            quiz=quiz,
        )
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated["content_markdown"], "Updated content")
        self.assertEqual(updated["status"], NodeStatus.UNLOCKED.value)
        self.assertEqual(updated["quiz"]["question_text"], quiz.question_text)

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
            status=NodeStatus.UNLOCKED,
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
            status=NodeStatus.UNLOCKED,
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
