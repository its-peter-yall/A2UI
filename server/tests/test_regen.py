"""
============================================================================
FILE: test_regen.py
LOCATION: server/tests/test_regen.py
============================================================================
PURPOSE:
    Tests for the regenerate_failed_node standalone function.
ROLE IN PROJECT:
    Validates single-node regeneration logic with mocked LLM agents
    and real SQLite persistence on a temporary database.
    - Success path: ERROR node -> VIEWING_EXPLANATION with new content
    - Error paths: 404, 400 (not eligible), exception propagation
KEY COMPONENTS:
    - RegenFunctionTests: Unit tests for regenerate_failed_node
DEPENDENCIES:
    - External: asyncio, pathlib, tempfile, unittest
    - Internal: server.graph.regen, server.database, server.agents
USAGE:
    python -m unittest server.tests.test_regen -v
============================================================================
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from pydantic import BaseModel

from server.agents.generator import GeneratedContent
from server.database.learning_persistence import LearningManager
from server.graph.regen import regenerate_failed_node
from server.schemas.learning import (
    NodeStatus,
    QuizCard,
    QuizOption,
    QuizSet,
)


def _quiz_option(label: str, correct: bool) -> QuizOption:
    return QuizOption(
        option_id=f"opt-{label}",
        display_label=label,
        text=f"Option {label}",
        is_correct=correct,
        explanation=f"Explanation {label}",
    )


def _quiz_set() -> QuizSet:
    card = QuizCard(
        question_text="Test question?",
        options=[
            _quiz_option("A", True),
            _quiz_option("B", False),
            _quiz_option("C", False),
            _quiz_option("D", False),
        ],
        difficulty="medium",
    )
    return QuizSet(quizzes=[card], current_index=0)


def _content() -> GeneratedContent:
    return GeneratedContent(
        content_markdown="# Regenerated\n" + ("x " * 200),
        key_takeaways=["a", "b", "c"],
    )


class RegenFunctionTests(unittest.IsolatedAsyncioTestCase):
    """Tests for regenerate_failed_node."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        db_path = Path(self.tmp.name) / "test.db"
        self.manager = LearningManager(db_path=db_path)
        self.manager.init_learning_tables()
        self.patcher = patch(
            "server.graph.regen.learning_manager",
            self.manager,
        )
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.tmp.cleanup()

    def _create_error_node(
        self,
        sequence_index: int = 0,
        prev_status: str = "COMPLETED",
        summary_for_context: str = "Specific Context Summary",
        key_terms: list[str] = None,
    ) -> str:
        if key_terms is None:
            key_terms = ["specific", "terms"]
        session = self.manager.create_learning_session(
            query="test",
            course_title="Test Course",
        )
        if sequence_index > 0:
            self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=0,
                title="Prev Topic",
                content_markdown="prev content " * 50,
                status=NodeStatus(prev_status),
                quiz_set=_quiz_set(),
                summary_for_context="prev summary",
                key_terms=["prev", "terms"],
            )
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=sequence_index,
            title="Failed Topic",
            content_markdown="Content generation failed.",
            status=NodeStatus.ERROR,
            error_message="LLM timeout",
            retry_available=True,
            quiz_set=_quiz_set(),
            summary_for_context=summary_for_context,
            key_terms=key_terms,
        )
        return node["id"]

    @patch(
        "server.graph.regen.quizzer_agent.generate_quiz_set",
        new_callable=AsyncMock,
    )
    @patch(
        "server.graph.regen.generator_agent.generate_explanation",
        new_callable=AsyncMock,
    )
    async def test_regen_success_first_node(
        self,
        mock_gen: AsyncMock,
        mock_quiz: AsyncMock,
    ) -> None:
        mock_gen.return_value = _content()
        mock_quiz.return_value = _quiz_set()
        node_id = self._create_error_node(sequence_index=0)

        result = await regenerate_failed_node(node_id)

        self.assertIsNotNone(result)
        self.assertEqual(
            result["status"],
            NodeStatus.VIEWING_EXPLANATION.value,
        )
        self.assertFalse(result["retry_available"])
        self.assertIsNone(result["error_message"])
        mock_gen.assert_awaited_once()
        mock_quiz.assert_awaited_once()

        topic_passed = mock_gen.call_args[1]["topic"]
        self.assertEqual(topic_passed.summary_for_context, "Specific Context Summary")
        self.assertEqual(topic_passed.key_terms, ["specific", "terms"])

    @patch(
        "server.graph.regen.quizzer_agent.generate_quiz_set",
        new_callable=AsyncMock,
    )
    @patch(
        "server.graph.regen.generator_agent.generate_explanation",
        new_callable=AsyncMock,
    )
    async def test_regen_success_non_first_node_completed(
        self,
        mock_gen: AsyncMock,
        mock_quiz: AsyncMock,
    ) -> None:
        mock_gen.return_value = _content()
        mock_quiz.return_value = _quiz_set()
        node_id = self._create_error_node(sequence_index=1, prev_status="COMPLETED")

        result = await regenerate_failed_node(node_id)

        self.assertIsNotNone(result)
        self.assertEqual(
            result["status"],
            NodeStatus.VIEWING_EXPLANATION.value,
        )
        self.assertFalse(result["retry_available"])

    @patch(
        "server.graph.regen.quizzer_agent.generate_quiz_set",
        new_callable=AsyncMock,
    )
    @patch(
        "server.graph.regen.generator_agent.generate_explanation",
        new_callable=AsyncMock,
    )
    async def test_regen_success_non_first_node_locked(
        self,
        mock_gen: AsyncMock,
        mock_quiz: AsyncMock,
    ) -> None:
        mock_gen.return_value = _content()
        mock_quiz.return_value = _quiz_set()
        node_id = self._create_error_node(sequence_index=1, prev_status="LOCKED")

        result = await regenerate_failed_node(node_id)

        self.assertIsNotNone(result)
        self.assertEqual(
            result["status"],
            NodeStatus.LOCKED.value,
        )
        self.assertFalse(result["retry_available"])


    async def test_regen_404_node_not_found(self) -> None:
        with self.assertRaises(LookupError):
            await regenerate_failed_node("nonexistent-id")

    async def test_regen_400_not_error_status(self) -> None:
        session = self.manager.create_learning_session(
            query="test",
            course_title="Test",
        )
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Good Topic",
            content_markdown="good content " * 50,
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz_set=_quiz_set(),
        )
        with self.assertRaises(ValueError):
            await regenerate_failed_node(node["id"])

    async def test_regen_400_retry_not_available(self) -> None:
        session = self.manager.create_learning_session(
            query="test",
            course_title="Test",
        )
        node = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Error Topic",
            content_markdown="failed",
            status=NodeStatus.ERROR,
            error_message="timeout",
            retry_available=False,
        )
        with self.assertRaises(ValueError):
            await regenerate_failed_node(node["id"])

    @patch(
        "server.graph.regen.generator_agent.generate_explanation",
        new_callable=AsyncMock,
    )
    async def test_regen_exception_propagates(
        self,
        mock_gen: AsyncMock,
    ) -> None:
        mock_gen.side_effect = RuntimeError("LLM unavailable")
        node_id = self._create_error_node(sequence_index=0)

        with self.assertRaises(RuntimeError):
            await regenerate_failed_node(node_id)


if __name__ == "__main__":
    unittest.main()
