"""
============================================================================
FILE: test_failed_step_persistence.py
LOCATION: server/tests/test_failed_step_persistence.py
============================================================================
PURPOSE:
    Verifies concept_nodes.failed_step column round-trips through
    create_concept_node, update_node_content, get_session_nodes, and
    _get_node_by_id.
USAGE:
    python -m unittest server.tests.test_failed_step_persistence -v
============================================================================
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from server.database.learning_persistence import LearningManager
from server.schemas.learning import (
    FailedStep,
    NodeStatus,
    QuizCard,
    QuizOption,
    QuizSet,
)


def _qs() -> QuizSet:
    return QuizSet(
        quizzes=[
            QuizCard(
                question_text="q",
                options=[
                    QuizOption(option_id="a", display_label="A", text="t", is_correct=True, explanation="e"),
                    QuizOption(option_id="b", display_label="B", text="t", is_correct=False, explanation="e"),
                    QuizOption(option_id="c", display_label="C", text="t", is_correct=False, explanation="e"),
                    QuizOption(option_id="d", display_label="D", text="t", is_correct=False, explanation="e"),
                ],
            )
        ]
    )


class FailedStepPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.manager = LearningManager(db_path=Path(self.tmp.name) / "t.db")
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_create_node_persists_failed_step(self) -> None:
        session = self.manager.create_learning_session(query="q", course_title="c")
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="t",
            content_markdown="c",
            status=NodeStatus.ERROR,
            error_message="quiz fail",
            retry_available=True,
            failed_step=FailedStep.QUIZZER,
        )
        self.assertEqual(node["failed_step"], FailedStep.QUIZZER.value)

    def test_create_node_default_failed_step_none(self) -> None:
        session = self.manager.create_learning_session(query="q", course_title="c")
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="t",
            content_markdown="c",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz_set=_qs(),
        )
        self.assertIsNone(node["failed_step"])

    def test_get_session_nodes_returns_failed_step(self) -> None:
        session = self.manager.create_learning_session(query="q", course_title="c")
        self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="t",
            content_markdown="c",
            status=NodeStatus.ERROR,
            error_message="x",
            retry_available=True,
            failed_step=FailedStep.GENERATOR,
        )
        nodes = self.manager.get_session_nodes(session["id"])
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0]["failed_step"], FailedStep.GENERATOR.value)

    def test_update_node_content_clears_failed_step(self) -> None:
        session = self.manager.create_learning_session(query="q", course_title="c")
        created = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="t",
            content_markdown="placeholder",
            status=NodeStatus.ERROR,
            error_message="gen fail",
            retry_available=True,
            failed_step=FailedStep.GENERATOR,
        )
        updated = self.manager.update_node_content(
            node_id=created["id"],
            content_markdown="real content",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz_set=_qs(),
            error_message=None,
            retry_available=False,
            failed_step=None,
        )
        self.assertIsNotNone(updated)
        self.assertIsNone(updated["failed_step"])


if __name__ == "__main__":
    unittest.main()
