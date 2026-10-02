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
    validate_complexity_distribution,
)
from server.schemas.generation import (
    GenerationBrief,
    GenerationBriefBatch,
    GroundingStatus,
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


def _custom_brief(index: int) -> GenerationBrief:
    return GenerationBrief(
        topic_index=index,
        topic_scope=f"Scope {index}",
        learning_objectives=[f"Explain topic {index}"],
        prerequisites=[],
        assumed_knowledge=[],
        current_facts=[],
        methodologies=[],
        conventions=[],
        deprecated_approaches=[],
        migration_notes=[],
        caveats=[],
        source_excerpts=None,
        required_examples=["Example"],
        common_misconceptions=["Misconception"],
        failure_modes=["Failure"],
        pedagogical_guidance="Explain clearly.",
        expected_depth="full",
        boundaries_with_adjacent_topics="Keep topic atomic.",
        quiz_learning_targets=["Recall"],
        expected_learner_evidence=["Explanation"],
        grounding_status=GroundingStatus.DISABLED,
    )


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

    def test_custom_prompt_uses_exact_requested_count(self) -> None:
        for count in (1, 2, 7, 30):
            with self.subTest(count=count):
                prompt = build_planner_system_prompt("custom", count)
                self.assertIn("CUSTOM mode", prompt)
                self.assertIn(f"EXACTLY {count} topics", prompt)
                self.assertNotIn("LITE mode", prompt)
                self.assertNotIn("FULL mode", prompt)
                self.assertNotIn("{mode_template}", prompt)

    def test_custom_prompt_rejects_invalid_target(self) -> None:
        for count in (None, True, 0, 31, 2.5, "2"):
            with self.subTest(count=count):
                with self.assertRaises(ValueError):
                    build_planner_system_prompt("custom", count)

    def test_uniform_small_outline_is_valid(self) -> None:
        for count in (1, 2):
            with self.subTest(count=count):
                result = validate_complexity_distribution(_outline(count))
                self.assertTrue(result["valid"])
                self.assertEqual(result["errors"], [])

    def test_uniform_three_topics_still_invalid(self) -> None:
        result = validate_complexity_distribution(_outline(3))
        self.assertFalse(result["valid"])
        self.assertTrue(result["errors"])

    def test_small_outline_still_validates_quiz_count(self) -> None:
        outline = _outline(1)
        outline.topics[0].quiz_count = 2
        result = validate_complexity_distribution(outline)
        self.assertFalse(result["valid"])
        self.assertIn("expected 1", result["errors"][0])

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

    async def test_custom_accepts_exact_boundaries_and_middle(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        for count in (1, 2, 7, 30):
            with self.subTest(count=count):
                expected = _outline(count)
                with patch.object(
                    agent, "generate", new_callable=AsyncMock
                ) as generate:
                    generate.return_value = expected
                    actual = await agent.plan(
                        "Topic", mode="custom",
                        custom_topic_count=count, llm_context=llm,
                    )
                    self.assertIs(actual, expected)
                    self.assertEqual(len(actual.topics), count)
                    generate.assert_awaited_once()
                    prompt = generate.await_args.kwargs[
                        "system_prompt_override"
                    ]
                    self.assertIn(f"EXACTLY {count} topics", prompt)

    async def test_custom_retries_once_without_changing_outline(self) -> None:
        agent = PlannerAgent()
        for wrong in (1, 30):
            with self.subTest(wrong=wrong):
                invalid, expected = _outline(wrong), _outline(7)
                with patch.object(
                    agent, "generate", new_callable=AsyncMock
                ) as generate:
                    generate.side_effect = [invalid, expected]
                    result = await agent.plan(
                        "Topic", mode="custom", custom_topic_count=7,
                        llm_context=LLMContext(api_key="k", model="m"),
                    )
                    self.assertIs(result, expected)
                    self.assertEqual(len(invalid.topics), wrong)
                    self.assertEqual(generate.await_count, 2)
                    first, second = generate.await_args_list
                    correction = second.kwargs["user_message"]
                    self.assertIn(f"previously produced {wrong}", correction)
                    self.assertIn("EXACTLY 7 topics", correction)
                    self.assertIn("STRICT MODE CONSTRAINTS", correction)
                    self.assertEqual(
                        first.kwargs["system_prompt_override"],
                        second.kwargs["system_prompt_override"],
                    )

    async def test_custom_second_mismatch_raises_count_error(self) -> None:
        agent = PlannerAgent()
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as generate:
            generate.side_effect = [_outline(6), _outline(8)]
            with self.assertRaises(OutlineTopicCountError) as caught:
                await agent.plan(
                    "Topic", mode="custom", custom_topic_count=7,
                    llm_context=LLMContext(api_key="k", model="m"),
                )
            self.assertEqual(generate.await_count, 2)
        error = caught.exception
        self.assertEqual(
            (error.mode, error.count, error.min_topics, error.max_topics),
            ("custom", 8, 7, 7),
        )

    async def test_invalid_custom_target_never_calls_generate(self) -> None:
        agent = PlannerAgent()
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as generate:
            with self.assertRaises(ValueError):
                await agent.plan("Topic", mode="custom")
            with self.assertRaises(ValueError):
                await agent.plan(
                    "Topic", mode="lite", custom_topic_count=7
                )
            generate.assert_not_called()

    async def test_custom_briefs_use_course_count_and_exact_indices(
        self,
    ) -> None:
        agent = PlannerAgent()
        cases = ((1, 0, 1), (2, 0, 2), (7, 3, 4), (30, 23, 7))
        for count, start, size in cases:
            with self.subTest(count=count, start=start):
                expected = GenerationBriefBatch(
                    start_index=start,
                    briefs=[
                        _custom_brief(i) for i in range(start, start + size)
                    ],
                )
                with patch.object(
                    agent, "generate", new_callable=AsyncMock
                ) as generate:
                    generate.return_value = expected
                    actual = await agent.plan_briefs(
                        outline=_outline(count), start_index=start,
                        batch_size=size, mode="custom",
                        llm_context=LLMContext(api_key="k", model="m"),
                    )
                    self.assertIs(actual, expected)
                    generate.assert_awaited_once()
                    prompt = generate.await_args.kwargs[
                        "system_prompt_override"
                    ]
                    self.assertIn(f"EXACTLY {count} topics", prompt)
                    self.assertIn("expected_depth: full", prompt)
                    self.assertEqual(
                        [brief.topic_index for brief in actual.briefs],
                        list(range(start, start + size)),
                    )
                    self.assertTrue(all(
                        brief.source_excerpts is None
                        and brief.research_report_id is None
                        for brief in actual.briefs
                    ))


if __name__ == "__main__":
    unittest.main()
