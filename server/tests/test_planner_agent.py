# test_planner_agent.py
# Unit tests for PlannerAgent class and system prompt

# Longer description (2-4 lines):
# - Validates PlannerAgent initialization, role, and system prompt content.
# - Uses mocking to test the plan() method without actual LLM calls.
# - Verifies prompt engineering quality for KLI framework compliance.

# @see: server/agents/planner.py - PlannerAgent implementation under test
# @see: server/schemas/learning.py - CourseOutline and TopicNode schemas
# @note: All tests are mock-based to avoid Vertex AI dependencies

import unittest
from unittest.mock import AsyncMock, patch

from server.agents.planner import PLANNER_SYSTEM_PROMPT, PlannerAgent, planner_agent
from server.schemas.learning import CourseOutline, TopicNode


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

        # 5-7 topics requirement
        self.assertIn("5-7", prompt)
        self.assertIn("5", prompt)

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
        result = asyncio.run(agent.plan("Test query"))

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
        asyncio.run(agent.plan("Newtonian Laws", context=context))

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


if __name__ == "__main__":
    unittest.main()
