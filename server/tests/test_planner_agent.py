"""
============================================================================
FILE: test_planner_agent.py
LOCATION: server/tests/test_planner_agent.py
============================================================================
PURPOSE:
    Unit tests for PlannerAgent class and system prompt. Validates agent
    role, initialization, KLI framework prompt engineering, and plan()
    method wiring to the instructor client for structured output generation.
ROLE IN PROJECT:
    Ensures the PlannerAgent correctly initializes and integrates with the
    instructor client for structured learning plan generation.
    - Validates KLI framework prompt engineering
    - Verifies instructor client wiring for CourseOutline output
KEY COMPONENTS:
    - TestPlannerAgent: Test class covering role, prompt, and wiring tests
    - test_agent_role: Verifies PlannerAgent has correct 'planner' role
    - test_system_prompt_contains_kli: Validates KLI framework in prompt
    - test_plan_calls_instructor_client: Tests generate() wiring
    - test_prompt_has_example: Validates example decomposition in prompt
DEPENDENCIES:
    - External: unittest, unittest.mock
    - Internal: server.agents.planner, server.schemas.learning
USAGE:
    python -m unittest server.tests.test_planner_agent
============================================================================
"""


import unittest
from unittest.mock import AsyncMock, patch

from server.agents.planner import (
    PLANNER_SYSTEM_PROMPT,
    PlannerAgent,
    planner_agent,
    validate_complexity_distribution,
)
from server.schemas.learning import CourseOutline, TopicNode
from server.schemas.llm import LLMContext


def _make_mock_outline() -> CourseOutline:
    """Create a mock CourseOutline for testing."""
    topics = [
        TopicNode(
            index=i,
            title=f"Topic {i}",
            summary_for_context=f"Summary for topic {i}",
            key_terms=[f"term-{i}a", f"term-{i}b"],
        )
        for i in range(5)
    ]
    return CourseOutline(course_title="Mock Course", topics=topics)


class TestPlannerAgent(unittest.TestCase):
    """Tests for PlannerAgent class behavior."""

    def test_agent_role(self) -> None:
        """Verify the agent role is 'planner'."""
        agent = PlannerAgent()
        self.assertEqual(agent.role, "planner")

    def test_singleton_role(self) -> None:
        """Verify the singleton instance has the correct role."""
        self.assertEqual(planner_agent.role, "planner")

    def test_system_prompt_contains_kli(self) -> None:
        """Check that KLI framework is explained in the system prompt."""
        agent = PlannerAgent()
        prompt = agent.system_prompt

        # KLI framework should be mentioned
        self.assertIn("KLI", prompt)
        self.assertIn("Knowledge-Learning-Instruction", prompt)

        # KLI components should be present
        self.assertIn("Knowledge Components", prompt)
        self.assertIn("Learning Events", prompt)
        self.assertIn("Assessment", prompt)

    def test_system_prompt_contains_guidelines(self) -> None:
        """Check that key decomposition guidelines are in the prompt."""
        agent = PlannerAgent()
        prompt = agent.system_prompt

        # Hierarchical decomposition
        self.assertIn("Hierarchical Decomposition", prompt)

        # Prerequisite ordering
        self.assertIn("Prerequisite Ordering", prompt)

        # Minimum 5 topics requirement (no upper limit)
        self.assertIn("at least 5", prompt)
        self.assertIn("Upper Limit", prompt)

        # Context injection explanation
        self.assertIn("summary_for_context", prompt)
        self.assertIn("Context", prompt)

    def test_topic_node_validation(self) -> None:
        """Verify TopicNode schema validation works correctly."""
        topic = TopicNode(
            index=0,
            title="Test Topic",
            summary_for_context="A test summary",
            key_terms=["term1", "term2"],
        )
        self.assertEqual(topic.index, 0)
        self.assertEqual(topic.title, "Test Topic")
        self.assertEqual(len(topic.key_terms), 2)

    def test_topic_node_with_complexity_and_quiz_count(self) -> None:
        """Verify TopicNode accepts complexity and quiz_count values."""
        topic = TopicNode(
            index=0,
            title="Advanced Topic",
            summary_for_context="A complex synthesis topic",
            key_terms=["synthesis", "integration"],
            complexity="Advanced",
            quiz_count=4,
        )
        self.assertEqual(topic.complexity, "Advanced")
        self.assertEqual(topic.quiz_count, 4)

    def test_course_outline_validation(self) -> None:
        """Verify CourseOutline schema validation works correctly."""
        outline = _make_mock_outline()
        self.assertEqual(outline.course_title, "Mock Course")
        self.assertEqual(len(outline.topics), 5)
        self.assertEqual(outline.topics[0].index, 0)
        self.assertEqual(outline.topics[4].index, 4)


class TestPlannerAgentPlan(unittest.TestCase):
    """Tests for PlannerAgent.plan() wiring to instructor_client."""

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_plan_calls_instructor_client(self, mock_create: AsyncMock) -> None:
        """Verify plan() -> generate() -> instructor_client.create_structured wiring."""
        import asyncio

        mock_outline = _make_mock_outline()
        mock_create.return_value = mock_outline

        agent = PlannerAgent()
        result = asyncio.run(
            agent.plan("Test query", llm_context=LLMContext(api_key="mock"))
        )

        # Verify instructor_client.create_structured was called
        mock_create.assert_called_once()

        # Verify the call arguments include role and response_model
        call_kwargs = mock_create.call_args.kwargs
        self.assertEqual(call_kwargs["role"], "planner")
        self.assertEqual(call_kwargs["response_model"], CourseOutline)

        # Verify messages contain the query
        messages = call_kwargs["messages"]
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["role"], "user")
        self.assertIn("Test query", messages[0]["content"])

        # Verify system prompt was passed
        self.assertIn("system_prompt", call_kwargs)
        self.assertIn("KLI", call_kwargs["system_prompt"])

        # Verify result
        self.assertEqual(result.course_title, "Mock Course")
        self.assertEqual(len(result.topics), 5)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_plan_includes_context_in_system_prompt(
        self, mock_create: AsyncMock
    ) -> None:
        """Verify context is injected into system prompt via _build_system_prompt."""
        import asyncio

        mock_outline = _make_mock_outline()
        mock_create.return_value = mock_outline

        agent = PlannerAgent()
        context = {"prior_knowledge": "physics basics"}
        asyncio.run(
            agent.plan(
                "Newtonian Laws",
                context=context,
                llm_context=LLMContext(api_key="mock"),
            )
        )

        # Verify system prompt includes context
        call_kwargs = mock_create.call_args.kwargs
        system_prompt = call_kwargs["system_prompt"]
        self.assertIn("physics basics", system_prompt)
        self.assertIn("Prior Knowledge", system_prompt)  # Title-cased context key


class TestPlannerPromptQuality(unittest.TestCase):
    """Tests for prompt engineering quality."""

    def test_prompt_defines_role(self) -> None:
        """Check that the prompt defines the agent's role clearly."""
        self.assertIn("instructional designer", PLANNER_SYSTEM_PROMPT)
        self.assertIn("curriculum", PLANNER_SYSTEM_PROMPT)

    def test_prompt_has_output_requirements(self) -> None:
        """Check that output requirements section exists."""
        self.assertIn("Output Requirements", PLANNER_SYSTEM_PROMPT)
        self.assertIn("CourseOutline", PLANNER_SYSTEM_PROMPT)
        self.assertIn("TopicNode", PLANNER_SYSTEM_PROMPT)

    def test_prompt_has_example(self) -> None:
        """Check that an example decomposition is provided."""
        self.assertIn("Example Decomposition", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Newtonian Laws", PLANNER_SYSTEM_PROMPT)

        # Example should include specific topics
        self.assertIn("Inertia", PLANNER_SYSTEM_PROMPT)
        self.assertIn("F=ma", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Action-Reaction", PLANNER_SYSTEM_PROMPT)

    def test_prompt_explains_context_injection(self) -> None:
        """Check that context injection purpose is documented."""
        self.assertIn("summary_for_context", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Generator Agent", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Quizzer Agent", PLANNER_SYSTEM_PROMPT)

    def test_prompt_has_atomic_focus_guideline(self) -> None:
        """Check that atomic focus principle is mentioned."""
        self.assertIn("Atomic Focus", PLANNER_SYSTEM_PROMPT)
        self.assertIn("ONE key idea", PLANNER_SYSTEM_PROMPT)

    def test_prompt_has_key_terms_section(self) -> None:
        """Check that key terms are part of the output specification."""
        self.assertIn("key_terms", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Key Terms", PLANNER_SYSTEM_PROMPT)

    def test_prompt_contains_complexity_assessment(self) -> None:
        """Check that complexity assessment section with all levels exists."""
        self.assertIn("Complexity Assessment", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Basic", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Intermediate", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Advanced", PLANNER_SYSTEM_PROMPT)

    def test_prompt_contains_quiz_count_mapping(self) -> None:
        """Check that quiz count mapping section with rules exists."""
        self.assertIn("Quiz Count Mapping", PLANNER_SYSTEM_PROMPT)
        self.assertIn("quiz_count: 1", PLANNER_SYSTEM_PROMPT)
        self.assertIn("quiz_count", PLANNER_SYSTEM_PROMPT)
        self.assertIn("Bloom", PLANNER_SYSTEM_PROMPT)

    def test_prompt_example_includes_complexity_values(self) -> None:
        """Check that example decomposition includes complexity values."""
        # Find the example section
        example_start = PLANNER_SYSTEM_PROMPT.index("Example Decomposition")
        example_section = PLANNER_SYSTEM_PROMPT[example_start:]

        # Verify varied complexity in example
        self.assertIn('"Basic"', example_section)
        self.assertIn('"Intermediate"', example_section)
        self.assertIn('"Advanced"', example_section)

    def test_prompt_output_requirements_include_complexity_fields(
        self,
    ) -> None:
        """Check that output requirements mention complexity and quiz_count."""
        # Find the output requirements section
        output_start = PLANNER_SYSTEM_PROMPT.index("Output Requirements")
        output_section = PLANNER_SYSTEM_PROMPT[output_start:]

        self.assertIn("complexity", output_section)
        self.assertIn("quiz_count", output_section)

    def test_prompt_emphasizes_variety(self) -> None:
        """Check that prompt discourages uniform complexity."""
        prompt_upper = PLANNER_SYSTEM_PROMPT.upper()
        has_varied = "VARIED" in prompt_upper or "VARIETY" in prompt_upper
        self.assertTrue(
            has_varied,
            "Prompt should emphasize varied complexity distribution",
        )


class TestPlannerAgentImport(unittest.TestCase):
    """Tests for module-level imports and exports."""

    def test_planner_agent_singleton_exists(self) -> None:
        """Verify the singleton instance is created."""
        self.assertIsNotNone(planner_agent)
        self.assertIsInstance(planner_agent, PlannerAgent)

    def test_prompt_constant_exists(self) -> None:
        """Verify PLANNER_SYSTEM_PROMPT is exported."""
        self.assertIsInstance(PLANNER_SYSTEM_PROMPT, str)
        self.assertGreater(len(PLANNER_SYSTEM_PROMPT), 100)


def _make_outline_with_complexity(
    specs: list,
) -> CourseOutline:
    """Build a CourseOutline with specific complexity/quiz_count values.

    Args:
        specs: List of (complexity, quiz_count) tuples. Padded to
            minimum 5 topics with ("Intermediate", 2) defaults.

    Returns:
        CourseOutline with the requested topic configurations.
    """
    # Pad to minimum 5 topics
    while len(specs) < 5:
        specs.append(("Intermediate", 2))

    topics = [
        TopicNode(
            index=i,
            title=f"Topic {i}: {complexity}",
            summary_for_context=f"Summary for {complexity} topic {i}",
            key_terms=[f"term-{i}a", f"term-{i}b"],
            complexity=complexity,
            quiz_count=quiz_count,
        )
        for i, (complexity, quiz_count) in enumerate(specs)
    ]
    return CourseOutline(
        course_title="Test Course",
        topics=topics,
    )


class TestComplexityDistribution(unittest.TestCase):
    """Tests for validate_complexity_distribution() function."""

    def test_valid_varied_distribution(self) -> None:
        """A well-distributed outline passes validation."""
        outline = _make_outline_with_complexity(
            [
                ("Basic", 1),
                ("Basic", 1),
                ("Intermediate", 2),
                ("Intermediate", 3),
                ("Advanced", 4),
                ("Advanced", 3),
            ]
        )
        result = validate_complexity_distribution(outline)

        self.assertTrue(result["valid"])
        self.assertEqual(len(result["errors"]), 0)
        self.assertIn("Basic", result["distribution"])
        self.assertIn("Intermediate", result["distribution"])
        self.assertIn("Advanced", result["distribution"])

    def test_uniform_complexity_detected(self) -> None:
        """All topics with same complexity fails validation."""
        outline = _make_outline_with_complexity([("Intermediate", 2)] * 5)
        result = validate_complexity_distribution(outline)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any(
                "All 5 topics have complexity 'Intermediate'" in e
                for e in result["errors"]
            )
        )

    def test_all_basic_detected(self) -> None:
        """All Basic topics also fails validation."""
        outline = _make_outline_with_complexity([("Basic", 1)] * 5)
        result = validate_complexity_distribution(outline)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any("All 5 topics have complexity 'Basic'" in e for e in result["errors"])
        )

    def test_basic_with_high_quiz_count_error(self) -> None:
        """Basic topic with quiz_count > 1 triggers error."""
        outline = _make_outline_with_complexity(
            [
                ("Basic", 3),
                ("Intermediate", 2),
                ("Advanced", 4),
                ("Intermediate", 2),
                ("Basic", 1),
            ]
        )
        result = validate_complexity_distribution(outline)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any("Basic" in e and "quiz_count=3" in e for e in result["errors"])
        )

    def test_advanced_with_low_quiz_count_error(self) -> None:
        """Advanced topic with quiz_count < 3 triggers error."""
        outline = _make_outline_with_complexity(
            [
                ("Basic", 1),
                ("Intermediate", 2),
                ("Advanced", 1),
                ("Intermediate", 3),
                ("Advanced", 4),
            ]
        )
        result = validate_complexity_distribution(outline)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any("Advanced" in e and "quiz_count=1" in e for e in result["errors"])
        )

    def test_skewed_distribution_warning(self) -> None:
        """More than 80% same complexity warns but passes."""
        outline = _make_outline_with_complexity(
            [
                ("Intermediate", 2),
                ("Intermediate", 2),
                ("Intermediate", 3),
                ("Intermediate", 2),
                ("Basic", 1),
            ]
        )
        result = validate_complexity_distribution(outline)

        # Not all same so no error, but >80% Intermediate
        self.assertTrue(result["valid"])
        self.assertTrue(
            any("% of topics are 'Intermediate'" in w for w in result["warnings"])
        )

    def test_intermediate_with_quiz_count_one_error(self) -> None:
        """Intermediate topic with quiz_count=1 triggers error."""
        outline = _make_outline_with_complexity(
            [
                ("Basic", 1),
                ("Intermediate", 1),
                ("Intermediate", 2),
                ("Advanced", 4),
                ("Advanced", 3),
            ]
        )
        result = validate_complexity_distribution(outline)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any("Intermediate" in e and "quiz_count=1" in e for e in result["errors"])
        )

    def test_intermediate_with_high_quiz_count_error(self) -> None:
        """Intermediate topic with quiz_count=4 triggers error."""
        outline = _make_outline_with_complexity(
            [
                ("Basic", 1),
                ("Intermediate", 4),
                ("Intermediate", 3),
                ("Advanced", 4),
                ("Advanced", 3),
            ]
        )
        result = validate_complexity_distribution(outline)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any("Intermediate" in e and "quiz_count=4" in e for e in result["errors"])
        )

    def test_distribution_counts_correct(self) -> None:
        """Verify distribution dict accuracy."""
        outline = _make_outline_with_complexity(
            [
                ("Basic", 1),
                ("Basic", 1),
                ("Intermediate", 2),
                ("Advanced", 4),
                ("Advanced", 3),
            ]
        )
        result = validate_complexity_distribution(outline)

        self.assertEqual(
            result["distribution"],
            {"Basic": 2, "Intermediate": 1, "Advanced": 2},
        )


if __name__ == "__main__":
    unittest.main()
