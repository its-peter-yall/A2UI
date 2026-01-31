# test_quizzer_agent.py
# Unit tests for the Quizzer Agent

# Tests QuizzerAgent initialization, system prompt structure, and
# the generate_quiz method with mocked LLM responses.
# Validates assessment guidelines, distractor design, and explanations.

# @see: server/agents/quizzer.py - QuizzerAgent implementation
# @note: Uses unittest.mock to avoid actual API calls

import unittest
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

from server.agents.quizzer import (
    QUIZZER_SYSTEM_PROMPT,
    QuizzerAgent,
    quizzer_agent,
)
from server.schemas.learning import (
    QuizCard,
    QuizDifficulty,
    QuizOption,
    TopicNode,
)


def _make_mock_topic(index: int = 0) -> TopicNode:
    """Create a mock TopicNode for testing."""
    return TopicNode(
        index=index,
        title=f"Test Topic {index}",
        summary_for_context=f"Summary for test topic {index}",
        key_terms=[f"term-{index}a", f"term-{index}b"],
    )


def _make_mock_quiz_card() -> QuizCard:
    """Create a mock QuizCard for testing."""
    return QuizCard(
        question_text="What is the main concept of Test Topic 0?",
        options=[
            QuizOption(
                id="A",
                text="The correct answer explaining the concept",
                is_correct=True,
                explanation="This is correct because it accurately describes the concept.",
            ),
            QuizOption(
                id="B",
                text="A common misconception about the topic",
                is_correct=False,
                explanation="This is incorrect because it confuses X with Y.",
            ),
            QuizOption(
                id="C",
                text="Another plausible but wrong answer",
                is_correct=False,
                explanation="This is incorrect because it overgeneralizes.",
            ),
            QuizOption(
                id="D",
                text="A partial understanding of the concept",
                is_correct=False,
                explanation="This is incorrect because it only covers part of the concept.",
            ),
        ],
        difficulty=QuizDifficulty.MEDIUM,
    )


class TestQuizzerAgentRole(unittest.TestCase):
    """Tests for QuizzerAgent role verification.

    Objective: Verify the agent role is correctly set to "quizzer"
    and not confused with other agent roles.
    """

    def test_agent_role(self) -> None:
        """Positive test: Verify the agent role is 'quizzer'.

        This test meets the objective by ensuring the QuizzerAgent
        is correctly identified by its role for model config lookup.
        """
        agent = QuizzerAgent()
        self.assertEqual(agent.role, "quizzer")

    def test_singleton_role(self) -> None:
        """Positive test: Verify the singleton instance has correct role.

        This test meets the objective by validating the module-level
        singleton is properly initialized with the 'quizzer' role.
        """
        self.assertEqual(quizzer_agent.role, "quizzer")

    def test_agent_role_is_not_planner(self) -> None:
        """Negative test: Verify role is NOT 'planner'.

        This test meets the objective by ensuring the QuizzerAgent
        is not misconfigured with another agent's role.
        """
        agent = QuizzerAgent()
        self.assertNotEqual(agent.role, "planner")

    def test_agent_role_is_not_generator(self) -> None:
        """Negative test: Verify role is NOT 'generator'.

        This test meets the objective by ensuring the QuizzerAgent
        is not misconfigured with another agent's role.
        """
        agent = QuizzerAgent()
        self.assertNotEqual(agent.role, "generator")


class TestQuizzerSystemPrompt(unittest.TestCase):
    """Tests for QuizzerAgent system prompt structure.

    Objective: Verify the system prompt contains all required
    guidelines for assessment design.
    """

    def test_system_prompt_contains_role_definition(self) -> None:
        """Positive test: Check assessment designer role in prompt.

        This test meets the objective by verifying the prompt defines
        the agent's role as an assessment designer.
        """
        agent = QuizzerAgent()
        prompt = agent.system_prompt

        # Role definition should be present
        self.assertIn("assessment designer", prompt.lower())

    def test_system_prompt_contains_retrieval_learning(self) -> None:
        """Positive test: Check retrieval-based learning principles in prompt.

        This test meets the objective by verifying the prompt explains
        retrieval-based learning and the testing effect.
        """
        agent = QuizzerAgent()
        prompt = agent.system_prompt

        # Retrieval-based learning principles
        self.assertIn("retrieval", prompt.lower())
        self.assertIn("testing effect", prompt.lower())

        # Active recall should be mentioned
        self.assertIn("active recall", prompt.lower())

    def test_system_prompt_contains_distractor_guidelines(self) -> None:
        """Positive test: Check distractor generation guidelines in prompt.

        This test meets the objective by verifying the prompt includes
        instructions for creating misconception-targeted distractors.
        """
        agent = QuizzerAgent()
        prompt = agent.system_prompt

        # Distractor guidelines should be prominent
        self.assertIn("Distractor", prompt)
        self.assertIn("misconception", prompt.lower())

        # Plausibility requirement
        self.assertIn("plausible", prompt.lower())

    def test_system_prompt_contains_difficulty_calibration(self) -> None:
        """Positive test: Check difficulty calibration guidelines in prompt.

        This test meets the objective by verifying the prompt explains
        how to calibrate question difficulty.
        """
        agent = QuizzerAgent()
        prompt = agent.system_prompt

        # Difficulty levels should be explained
        self.assertIn("Difficulty", prompt)
        self.assertIn("EASY", prompt)
        self.assertIn("MEDIUM", prompt)
        self.assertIn("HARD", prompt)

    def test_system_prompt_contains_explanation_requirements(self) -> None:
        """Positive test: Check that all options must have explanations.

        This test meets the objective by verifying the prompt mandates
        explanations for every option (correct and incorrect).
        """
        agent = QuizzerAgent()
        prompt = agent.system_prompt

        # Explanation requirements should be mentioned
        self.assertIn("Explanation", prompt)
        self.assertIn("EVERY option", prompt)
        self.assertIn("MUST", prompt)

        # Should explain both correct and incorrect
        self.assertIn("Correct Answer Explanation", prompt)
        self.assertIn("Incorrect Answer Explanation", prompt)


class TestQuizzerPromptQuality(unittest.TestCase):
    """Tests for prompt engineering quality."""

    def test_prompt_constant_exists(self) -> None:
        """Verify QUIZZER_SYSTEM_PROMPT is exported and substantive."""
        self.assertIsInstance(QUIZZER_SYSTEM_PROMPT, str)
        self.assertGreater(len(QUIZZER_SYSTEM_PROMPT), 500)

    def test_prompt_has_example(self) -> None:
        """Check that an example quiz structure is provided."""
        self.assertIn("Example", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("Option A", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("Option B", QUIZZER_SYSTEM_PROMPT)

    def test_prompt_specifies_output_structure(self) -> None:
        """Check that strict output requirements are specified."""
        self.assertIn("question_text", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("options", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("is_correct", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("difficulty", QUIZZER_SYSTEM_PROMPT)

    def test_prompt_has_chain_of_thought(self) -> None:
        """Check that chain-of-thought process is explained."""
        self.assertIn("Chain-of-Thought", QUIZZER_SYSTEM_PROMPT)

    def test_prompt_mentions_diagnostic_value(self) -> None:
        """Check that diagnostic value of distractors is explained."""
        self.assertIn("diagnostic", QUIZZER_SYSTEM_PROMPT.lower())


class TestQuizzerAgentGenerate(unittest.TestCase):
    """Tests for QuizzerAgent.generate_quiz() wiring.

    Objective: Verify generate_quiz() correctly calls the
    underlying instructor client with proper arguments.
    """

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_calls_instructor_client(
        self, mock_create: AsyncMock
    ) -> None:
        """Positive test: Verify generate_quiz() -> instructor_client wiring.

        This test meets the objective by mocking the instructor client
        and verifying it receives the correct arguments.
        """
        import asyncio

        mock_quiz = _make_mock_quiz_card()
        mock_create.return_value = mock_quiz

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=0)
        content = "# Test Topic 0\n\nThis is the generated content about the topic."

        result = asyncio.run(
            agent.generate_quiz(
                topic=topic,
                content=content,
            )
        )

        # Verify instructor_client.create_structured was called
        mock_create.assert_called_once()

        # Verify the call arguments include role and response_model
        call_kwargs = mock_create.call_args.kwargs
        self.assertEqual(call_kwargs["role"], "quizzer")
        self.assertEqual(call_kwargs["response_model"], QuizCard)

        # Verify messages contain topic and content information
        messages = call_kwargs["messages"]
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["role"], "user")
        self.assertIn("Test Topic 0", messages[0]["content"])
        self.assertIn(content, messages[0]["content"])

        # Verify system prompt was passed
        self.assertIn("system_prompt", call_kwargs)
        self.assertIn("Distractor", call_kwargs["system_prompt"])

        # Verify result
        self.assertEqual(result.question_text, mock_quiz.question_text)
        self.assertEqual(len(result.options), 4)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_includes_key_terms(self, mock_create: AsyncMock) -> None:
        """Positive test: Verify key terms are included in user message.

        This test meets the objective by checking that topic key terms
        are passed to guide quiz generation.
        """
        import asyncio

        mock_quiz = _make_mock_quiz_card()
        mock_create.return_value = mock_quiz

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=0)

        asyncio.run(
            agent.generate_quiz(
                topic=topic,
                content="Content about the topic",
            )
        )

        # Verify key terms appear in the user message
        call_kwargs = mock_create.call_args.kwargs
        user_message = call_kwargs["messages"][0]["content"]
        self.assertIn("term-0a", user_message)
        self.assertIn("term-0b", user_message)
        self.assertIn("Key Terms", user_message)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_returns_valid_card(self, mock_create: AsyncMock) -> None:
        """Positive test: Verify generate_quiz returns valid QuizCard structure.

        This test meets the objective by checking that the returned
        QuizCard has all required fields properly populated.
        """
        import asyncio

        mock_quiz = _make_mock_quiz_card()
        mock_create.return_value = mock_quiz

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=0)

        result = asyncio.run(
            agent.generate_quiz(
                topic=topic,
                content="Content about the topic",
            )
        )

        # Verify QuizCard structure
        self.assertIsInstance(result, QuizCard)
        self.assertIsInstance(result.question_text, str)
        self.assertGreater(len(result.question_text), 0)

        # Verify options count
        self.assertEqual(len(result.options), 4)

        # Verify exactly one correct option
        correct_count = sum(1 for opt in result.options if opt.is_correct)
        self.assertEqual(correct_count, 1)

        # Verify difficulty
        self.assertIsInstance(result.difficulty, QuizDifficulty)


class TestQuizCardValidation(unittest.TestCase):
    """Tests for QuizCard schema validation.

    Objective: Verify QuizCard enforces all options have explanations
    and exactly one correct option.
    """

    def test_quiz_card_has_explanations_for_all_options(self) -> None:
        """Positive test: Verify all options must have explanations.

        This test meets the objective by checking that a valid QuizCard
        has explanations for every option.
        """
        quiz = _make_mock_quiz_card()

        # All options should have explanations
        for option in quiz.options:
            self.assertIsNotNone(option.explanation)
            self.assertIsInstance(option.explanation, str)
            self.assertGreater(len(option.explanation), 0)

    def test_quiz_card_requires_at_least_one_correct_option(self) -> None:
        """Negative test: Verify QuizCard fails without a correct option.

        This test meets the objective by checking that validation
        fails when no option is marked as correct.
        """
        with self.assertRaises(ValidationError) as context:
            QuizCard(
                question_text="What is the answer?",
                options=[
                    QuizOption(
                        id="A",
                        text="Wrong answer 1",
                        is_correct=False,
                        explanation="Explanation for A",
                    ),
                    QuizOption(
                        id="B",
                        text="Wrong answer 2",
                        is_correct=False,
                        explanation="Explanation for B",
                    ),
                ],
                difficulty=QuizDifficulty.EASY,
            )

        # Check that the error mentions correct option requirement
        error_str = str(context.exception)
        self.assertIn("correct", error_str.lower())

    def test_quiz_card_requires_minimum_options(self) -> None:
        """Negative test: Verify QuizCard requires at least 2 options.

        This test meets the objective by checking that validation
        fails with insufficient options.
        """
        with self.assertRaises(ValidationError):
            QuizCard(
                question_text="What is the answer?",
                options=[
                    QuizOption(
                        id="A",
                        text="Only option",
                        is_correct=True,
                        explanation="Only explanation",
                    ),
                ],
                difficulty=QuizDifficulty.EASY,
            )

    def test_quiz_option_requires_explanation(self) -> None:
        """Negative test: Verify QuizOption requires explanation field.

        This test meets the objective by checking that validation
        fails when explanation is missing.
        """
        with self.assertRaises(ValidationError):
            QuizOption(
                id="A",
                text="Answer text",
                is_correct=True,
                # Missing explanation - should fail
            )


class TestQuizzerAgentImport(unittest.TestCase):
    """Tests for module-level imports and exports."""

    def test_quizzer_agent_singleton_exists(self) -> None:
        """Verify the singleton instance is created."""
        self.assertIsNotNone(quizzer_agent)
        self.assertIsInstance(quizzer_agent, QuizzerAgent)

    def test_prompt_constant_exists(self) -> None:
        """Verify QUIZZER_SYSTEM_PROMPT is exported."""
        self.assertIsInstance(QUIZZER_SYSTEM_PROMPT, str)
        self.assertGreater(len(QUIZZER_SYSTEM_PROMPT), 100)


if __name__ == "__main__":
    unittest.main()
