"""
============================================================================
FILE: test_planner_mode.py
LOCATION: server/tests/test_planner_mode.py
============================================================================
PURPOSE:
    Tests planner mode template injection, bounds validation, and replan.
USAGE:
    python -m unittest server.tests.test_planner_mode -v
============================================================================
"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from server.agents.planner import (
    FULL_TEMPLATE,
    LITE_TEMPLATE,
    OutlineTopicCountError,
    PlannerAgent,
    build_planner_system_prompt,
)
from server.schemas.learning import CourseOutline, TopicNode
from server.schemas.llm import LLMContext


def _topics(n: int) -> list[TopicNode]:
    return [
        TopicNode(
            index=i,
            title=f"Topic {i}",
            summary_for_context=f"Sum {i}",
            key_terms=["a", "b"],
            complexity="Basic",
            quiz_count=1,
        )
        for i in range(n)
    ]


def _outline(n: int) -> CourseOutline:
    return CourseOutline(course_title="C", topics=_topics(n))


class PlannerModeTests(unittest.IsolatedAsyncioTestCase):
    def test_build_prompt_injects_lite_template(self) -> None:
        prompt = build_planner_system_prompt("lite")
        self.assertIn("LITE mode", prompt)
        self.assertIn("3 and 10", prompt)
        self.assertNotIn("FULL mode", prompt)

    def test_build_prompt_injects_full_template(self) -> None:
        prompt = build_planner_system_prompt("full")
        self.assertIn("FULL mode", prompt)
        self.assertIn("10 and 30", prompt)
        self.assertNotIn("LITE mode", prompt)

    def test_templates_are_non_empty(self) -> None:
        self.assertTrue(LITE_TEMPLATE.strip())
        self.assertTrue(FULL_TEMPLATE.strip())

    async def test_plan_accepts_valid_lite_outline(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = _outline(5)
            result = await agent.plan("Placebo", mode="lite", llm_context=llm)
            self.assertEqual(len(result.topics), 5)
            mock_gen.assert_awaited_once()

    async def test_plan_replans_once_then_succeeds(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = [_outline(15), _outline(6)]
            result = await agent.plan("x", mode="lite", llm_context=llm)
            self.assertEqual(len(result.topics), 6)
            self.assertEqual(mock_gen.await_count, 2)

    async def test_plan_raises_after_two_invalid(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = [_outline(15), _outline(12)]
            with self.assertRaises(OutlineTopicCountError):
                await agent.plan("x", mode="lite", llm_context=llm)
            self.assertEqual(mock_gen.await_count, 2)

    async def test_plan_full_rejects_too_few(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = [_outline(5), _outline(5)]
            with self.assertRaises(OutlineTopicCountError):
                await agent.plan("x", mode="full", llm_context=llm)


if __name__ == "__main__":
    unittest.main()
