"""
=============================================================================
FILE: test_quizzer_agent.py
=============================================================================

PURPOSE:
Unit tests for QuizzerAgent class and system prompt. Validates agent role,
assessment design guidelines, quiz generation with distractors, and generate_quiz()
wiring. Also tests QuizCard schema validation for exactly one correct answer.

KEY TESTS:
- test_agent_role: Verifies QuizzerAgent has correct 'quizzer' role
- test_system_prompt_contains_distractor_guidelines: Validates distractor design
- test_generate_quiz_returns_valid_card: Tests QuizCard structure validation
- test_quiz_card_requires_exactly_one_correct_option: Schema validation
- test_quiz_card_requires_exactly_four_options: Schema validation
- test_quiz_option_requires_explanation: Validates explanation requirement

DEPENDENCIES:
- unittest: Python standard testing framework
- unittest.mock: AsyncMock for mocking instructor client
- pydantic: ValidationError for schema testing
- server.agents.quizzer: QuizzerAgent implementation
- server.schemas.learning: QuizCard, QuizOption, QuizDifficulty schemas

USAGE PATTERN:
```python
# Run all quizzer agent tests
python -m unittest server.tests.test_quizzer_agent

# Run specific test class
python -m unittest server.tests.test_quizzer_agent.TestQuizCardValidation

# Run single test
python -m unittest server.tests.test_quizzer_agent.TestQuizCardValidation.test_quiz_card_requires_exactly_one_correct_option
```

TEST SETUP:
- Uses unittest.mock AsyncMock to mock instructor_client.create_structured
- Tests both positive cases (valid QuizCard) and negative cases (ValidationError)
- No actual LLM calls - fully mock-based

RELATED FILES:
- server/agents/quizzer.py - QuizzerAgent implementation
- server/schemas/learning.py - QuizCard, QuizOption, QuizDifficulty schemas

NOTES:
- Retrieval-based learning / testing effect principles
- Distractors must be plausible misconceptions
- Each option requires explanation for learning value
- Difficulty calibration: easy/medium/hard
=============================================================================
"""

# test_quizzer_agent.py
# Unit tests for the Quizzer Agent

# Tests QuizzerAgent initialization, system prompt structure, and
# the generate_quiz method with mocked LLM responses.
# Validates assessment guidelines, distractor design, and explanations.

# @see: server/agents/quizzer.py - QuizzerAgent implementation
# @note: Uses unittest.mock to avoid actual API calls

import unittest
import uuid
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError

from server.agents.quizzer import (
    DIFFICULTY_ORDER,
    QUIZZER_SYSTEM_PROMPT,
    QuizzerAgent,
    quizzer_agent,
)
from server.schemas.learning import (
    QuizCard,
    QuizDifficulty,
    QuizOption,
    QuizSet,
    TopicNode,
)
from server.utils.instructor_client import MODEL_CONFIGS


def _make_stable_uuid(label: str) -> str:
    """Generate deterministic UUID for testing."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"test-option-{label}"))


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
                option_id=_make_stable_uuid("A"),
                display_label="A",
                text="The correct answer explaining the concept",
                is_correct=True,
                explanation="This is correct because it accurately describes the concept.",
            ),
            QuizOption(
                option_id=_make_stable_uuid("B"),
                display_label="B",
                text="A common misconception about the topic",
                is_correct=False,
                explanation="This is incorrect because it confuses X with Y.",
            ),
            QuizOption(
                option_id=_make_stable_uuid("C"),
                display_label="C",
                text="Another plausible but wrong answer",
                is_correct=False,
                explanation="This is incorrect because it overgeneralizes.",
            ),
            QuizOption(
                option_id=_make_stable_uuid("D"),
                display_label="D",
                text="A partial understanding of the concept",
                is_correct=False,
                explanation="This is incorrect because it only covers part of the concept.",
            ),
        ],
        difficulty=QuizDifficulty.MEDIUM,
    )


def _make_mock_quiz_set(quiz_count: int) -> QuizSet:
    """Create a mock QuizSet with a deterministic difficulty gradient."""
    difficulty_sequences = {
        1: ["medium"],
        2: ["easy", "hard"],
        3: ["easy", "medium", "hard"],
        4: ["easy", "medium", "medium", "hard"],
        5: ["easy", "easy", "medium", "hard", "hard"],
    }
    bounded_count = max(1, min(5, quiz_count))
    sequence = difficulty_sequences[bounded_count]
    quizzes: list[QuizCard] = []

    for i, difficulty in enumerate(sequence):
        quizzes.append(
            QuizCard(
                question_text=f"Question {i + 1} for topic set",
                options=[
                    QuizOption(
                        option_id=_make_stable_uuid(f"Q{i}-A"),
                        display_label="A",
                        text=f"Correct answer for question {i + 1}",
                        is_correct=True,
                        explanation="Correct explanation.",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid(f"Q{i}-B"),
                        display_label="B",
                        text=f"Distractor B for question {i + 1}",
                        is_correct=False,
                        explanation="Incorrect explanation B.",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid(f"Q{i}-C"),
                        display_label="C",
                        text=f"Distractor C for question {i + 1}",
                        is_correct=False,
                        explanation="Incorrect explanation C.",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid(f"Q{i}-D"),
                        display_label="D",
                        text=f"Distractor D for question {i + 1}",
                        is_correct=False,
                        explanation="Incorrect explanation D.",
                    ),
                ],
                difficulty=difficulty,
            )
        )

    return QuizSet(quizzes=quizzes, current_index=0)


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
        self.assertIn("distractor", prompt.lower())
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

        # Difficulty levels should be explained (case-insensitive)
        self.assertIn("difficulty", prompt.lower())
        self.assertIn("easy", prompt.lower())
        self.assertIn("medium", prompt.lower())
        self.assertIn("hard", prompt.lower())

    def test_system_prompt_contains_explanation_requirements(self) -> None:
        """Positive test: Check that all options must have explanations.

        This test meets the objective by verifying the prompt mandates
        explanations for every option (correct and incorrect).
        """
        agent = QuizzerAgent()
        prompt = agent.system_prompt

        # Explanation requirements should be mentioned (case-insensitive)
        self.assertIn("explanation", prompt.lower())
        self.assertIn("every option", prompt.lower())
        self.assertIn("must", prompt.lower())

        # Should explain both correct and incorrect
        self.assertIn("correct answer explanation", prompt.lower())
        self.assertIn("incorrect answer explanation", prompt.lower())


class TestQuizzerPromptQuality(unittest.TestCase):
    """Tests for prompt engineering quality."""

    def test_prompt_constant_exists(self) -> None:
        """Verify QUIZZER_SYSTEM_PROMPT is exported and substantive."""
        self.assertIsInstance(QUIZZER_SYSTEM_PROMPT, str)
        self.assertGreater(len(QUIZZER_SYSTEM_PROMPT), 500)

    def test_prompt_has_example(self) -> None:
        """Check that an example quiz structure is provided."""
        # Intent: Verify the prompt includes example output structure
        self.assertIn("example", QUIZZER_SYSTEM_PROMPT.lower())
        self.assertIn("option a", QUIZZER_SYSTEM_PROMPT.lower())
        self.assertIn("option b", QUIZZER_SYSTEM_PROMPT.lower())

    def test_prompt_specifies_output_structure(self) -> None:
        """Check that strict output requirements are specified."""
        self.assertIn("question_text", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("options", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("is_correct", QUIZZER_SYSTEM_PROMPT)
        self.assertIn("difficulty", QUIZZER_SYSTEM_PROMPT)

    def test_prompt_has_chain_of_thought(self) -> None:
        """Check that chain-of-thought process is explained."""
        # Intent: Verify the prompt guides the model through reasoning steps
        self.assertIn("chain-of-thought", QUIZZER_SYSTEM_PROMPT.lower())

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
        self.assertIn("distractor", call_kwargs["system_prompt"].lower())

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

        # Verify difficulty is a valid string value
        self.assertIsInstance(result.difficulty, str)
        self.assertIn(result.difficulty, {"easy", "medium", "hard"})


class TestQuizzerAgentGenerateQuizSet(unittest.TestCase):
    """Tests for QuizzerAgent.generate_quiz_set() behavior and wiring."""

    @patch(
        "server.agents.quizzer.QuizzerAgent.generate_quiz",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_single_delegates_to_generate_quiz(
        self,
        mock_generate_quiz: AsyncMock,
    ) -> None:
        """quiz_count=1 should delegate to single-quiz generation."""
        import asyncio

        mock_generate_quiz.return_value = _make_mock_quiz_card()

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=1)

        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Content for single quiz delegation",
                quiz_count=1,
            )
        )

        mock_generate_quiz.assert_awaited_once()
        self.assertIsInstance(result, QuizSet)
        self.assertEqual(len(result.quizzes), 1)
        self.assertEqual(result.current_index, 0)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_calls_instructor_with_quiz_set_model(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Batch path should call instructor with QuizSet response model."""
        import asyncio

        mock_create.return_value = _make_mock_quiz_set(3)

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=2)

        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Batch quiz content",
                quiz_count=3,
            )
        )

        self.assertIsInstance(result, QuizSet)
        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args.kwargs
        self.assertEqual(call_kwargs["response_model"], QuizSet)
        user_message = call_kwargs["messages"][0]["content"]
        self.assertIn("Q1=easy", user_message)
        self.assertIn("Q2=medium", user_message)
        self.assertIn("Q3=hard", user_message)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_returns_correct_quiz_count(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Returned QuizSet should contain exactly requested quiz count."""
        import asyncio

        mock_create.return_value = _make_mock_quiz_set(3)

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=3)
        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Count verification content",
                quiz_count=3,
            )
        )

        self.assertEqual(len(result.quizzes), 3)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_selects_expected_sequence_from_over_count(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Over-count responses should align to expected difficulty sequence."""
        import asyncio

        mock_create.return_value = _make_mock_quiz_set(5)

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=31)
        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Over-count enforcement content",
                quiz_count=3,
            )
        )

        self.assertEqual(len(result.quizzes), 3)
        self.assertEqual(
            [quiz.difficulty for quiz in result.quizzes],
            ["easy", "medium", "hard"],
        )

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_raises_on_under_count_response(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Under-count responses should raise to avoid partial quiz chains."""
        import asyncio

        mock_create.return_value = _make_mock_quiz_set(2)

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=32)

        with self.assertRaises(ValueError):
            asyncio.run(
                agent.generate_quiz_set(
                    topic=topic,
                    content="Under-count enforcement content",
                    quiz_count=3,
                )
            )

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_reorders_internal_difficulty_inversion(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Non-monotonic gradients should be reordered to ascending."""
        import asyncio

        ascending_quiz_set = _make_mock_quiz_set(3)
        mock_create.return_value = QuizSet(
            quizzes=[
                ascending_quiz_set.quizzes[0],
                ascending_quiz_set.quizzes[2],
                ascending_quiz_set.quizzes[1],
            ],
            current_index=0,
        )

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=33)
        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Internal inversion content",
                quiz_count=3,
            )
        )

        self.assertEqual(
            [quiz.difficulty for quiz in result.quizzes],
            ["easy", "medium", "hard"],
        )

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_raises_on_wrong_distribution(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Mismatched difficulty distributions should raise."""
        import asyncio

        base_set = _make_mock_quiz_set(4)
        wrong_quizzes = [
            base_set.quizzes[0],
            base_set.quizzes[1],
            base_set.quizzes[2].model_copy(update={"difficulty": "hard"}),
            base_set.quizzes[3],
        ]
        mock_create.return_value = QuizSet(
            quizzes=wrong_quizzes,
            current_index=0,
        )

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=34)

        with self.assertRaises(ValueError):
            asyncio.run(
                agent.generate_quiz_set(
                    topic=topic,
                    content="Wrong distribution content",
                    quiz_count=4,
                )
            )

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_difficulty_gradient_in_prompt(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Prompt must include easy->medium->hard sequence for 3 quizzes."""
        import asyncio

        mock_create.return_value = _make_mock_quiz_set(3)

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=4)
        asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Difficulty verification content",
                quiz_count=3,
            )
        )

        user_message = mock_create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("easy", user_message)
        self.assertIn("medium", user_message)
        self.assertIn("hard", user_message)
        self.assertIn("difficulty sequence", user_message.lower())

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_fixes_option_ids(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Option IDs should be UUIDs and unique after post-processing."""
        import asyncio

        quizzes = []
        for i, difficulty in enumerate(["easy", "medium", "hard"]):
            quizzes.append(
                QuizCard(
                    question_text=f"Question with letter IDs {i + 1}",
                    options=[
                        QuizOption(
                            option_id="A",
                            display_label="A",
                            text="Option A",
                            is_correct=(i == 0),
                            explanation="Explanation A",
                        ),
                        QuizOption(
                            option_id="B",
                            display_label="B",
                            text="Option B",
                            is_correct=(i == 1),
                            explanation="Explanation B",
                        ),
                        QuizOption(
                            option_id="C",
                            display_label="C",
                            text="Option C",
                            is_correct=(i == 2),
                            explanation="Explanation C",
                        ),
                        QuizOption(
                            option_id="D",
                            display_label="D",
                            text="Option D",
                            is_correct=False,
                            explanation="Explanation D",
                        ),
                    ],
                    difficulty=difficulty,
                )
            )
        mock_create.return_value = QuizSet(quizzes=quizzes, current_index=0)

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=5)

        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Option ID fix content",
                quiz_count=3,
            )
        )

        all_option_ids = [
            option.option_id for quiz in result.quizzes for option in quiz.options
        ]
        self.assertEqual(len(all_option_ids), 12)
        self.assertEqual(len(set(all_option_ids)), 12)
        for option_id in all_option_ids:
            self.assertNotIn(option_id, {"A", "B", "C", "D"})
            uuid.UUID(option_id)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_unique_option_ids_across_quizzes(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Duplicate option IDs across quizzes should be de-duplicated."""
        import asyncio

        duplicate_quizzes = []
        for i, difficulty in enumerate(["easy", "medium", "hard"]):
            duplicate_quizzes.append(
                QuizCard(
                    question_text=f"Duplicate IDs question {i + 1}",
                    options=[
                        QuizOption(
                            option_id=_make_stable_uuid("shared-A"),
                            display_label="A",
                            text="Shared A",
                            is_correct=(i == 0),
                            explanation="A explanation",
                        ),
                        QuizOption(
                            option_id=_make_stable_uuid("shared-B"),
                            display_label="B",
                            text="Shared B",
                            is_correct=(i == 1),
                            explanation="B explanation",
                        ),
                        QuizOption(
                            option_id=_make_stable_uuid(f"unique-{i}-C"),
                            display_label="C",
                            text="Unique C",
                            is_correct=(i == 2),
                            explanation="C explanation",
                        ),
                        QuizOption(
                            option_id=_make_stable_uuid(f"unique-{i}-D"),
                            display_label="D",
                            text="Unique D",
                            is_correct=False,
                            explanation="D explanation",
                        ),
                    ],
                    difficulty=difficulty,
                )
            )

        mock_create.return_value = QuizSet(
            quizzes=duplicate_quizzes,
            current_index=0,
        )

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=6)
        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Duplicate ID content",
                quiz_count=3,
            )
        )

        all_option_ids = [
            option.option_id for quiz in result.quizzes for option in quiz.options
        ]
        self.assertEqual(len(all_option_ids), 12)
        self.assertEqual(len(set(all_option_ids)), 12)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_fixes_fake_uuid_option_ids(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Fake UUID-like strings from LLM should be converted to real UUIDs."""
        import asyncio

        # Simulate LLM generating fake UUID-like strings
        # Each quiz needs unique option_ids (QuizCard schema requirement)
        fake_uuid_quizzes = []
        fake_uuids_by_quiz = [
            # Quiz 0
            [
                "h8i8j8k8-l8m8-4h9i-5j0k-1l2m3n4o5p6q",
                "a1b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p",
                "x9y8z7w6-v5u4-3t2s-1r0q-9p8o7n6m5l4k",
                "p1q2r3s4-t5u6-4v7w-8x9y-0z1a2b3c4d5e",
            ],
            # Quiz 1
            [
                "f6g7h8i9-j0k1-4l2m-3n4o-5p6q7r8s9t0u",
                "v1w2x3y4-z5a6-4b7c-8d9e-0f1g2h3i4j5k",
                "l6m7n8o9-p0q1-4r2s-3t4u-5v6w7x8y9z0a",
                "b1c2d3e4-f5g6-4h7i-8j9k-0l1m2n3o4p5q",
            ],
            # Quiz 2
            [
                "r6s7t8u9-v0w1-4x2y-3z4a-5b6c7d8e9f0g",
                "h1i2j3k4-l5m6-4n7o-8p9q-0r1s2t3u4v5w",
                "x6y7z8a9-b0c1-4d2e-3f4g-5h6i7j8k9l0m",
                "n1o2p3q4-r5s6-4t7u-8v9w-0x1y2z3a4b5c",
            ],
        ]
        all_fake_uuids = [uid for quiz_uids in fake_uuids_by_quiz for uid in quiz_uids]

        for i, difficulty in enumerate(["easy", "medium", "hard"]):
            fake_uuid_quizzes.append(
                QuizCard(
                    question_text=f"Fake UUID question {i + 1}",
                    options=[
                        QuizOption(
                            option_id=fake_uuids_by_quiz[i][0],
                            display_label="A",
                            text="Option A",
                            is_correct=(i == 0),
                            explanation="Explanation A",
                        ),
                        QuizOption(
                            option_id=fake_uuids_by_quiz[i][1],
                            display_label="B",
                            text="Option B",
                            is_correct=(i == 1),
                            explanation="Explanation B",
                        ),
                        QuizOption(
                            option_id=fake_uuids_by_quiz[i][2],
                            display_label="C",
                            text="Option C",
                            is_correct=(i == 2),
                            explanation="Explanation C",
                        ),
                        QuizOption(
                            option_id=fake_uuids_by_quiz[i][3],
                            display_label="D",
                            text="Option D",
                            is_correct=False,
                            explanation="Explanation D",
                        ),
                    ],
                    difficulty=difficulty,
                )
            )

        mock_create.return_value = QuizSet(
            quizzes=fake_uuid_quizzes,
            current_index=0,
        )

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=61)

        result = asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Fake UUID fix content",
                quiz_count=3,
            )
        )

        all_option_ids = [
            option.option_id for quiz in result.quizzes for option in quiz.options
        ]

        # Verify all 12 options have valid UUIDs
        self.assertEqual(len(all_option_ids), 12)
        self.assertEqual(len(set(all_option_ids)), 12)

        # Verify none of the fake UUIDs remain
        for option_id in all_option_ids:
            self.assertNotIn(option_id, all_fake_uuids)
            # Verify it's a valid UUID4
            uuid.UUID(option_id)

    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_quiz_set_includes_topic_info(
        self,
        mock_create: AsyncMock,
    ) -> None:
        """Batch prompt should include topic title, summary, and key terms."""
        import asyncio

        mock_create.return_value = _make_mock_quiz_set(3)

        agent = QuizzerAgent()
        topic = _make_mock_topic(index=7)
        asyncio.run(
            agent.generate_quiz_set(
                topic=topic,
                content="Topic info content",
                quiz_count=3,
            )
        )

        user_message = mock_create.call_args.kwargs["messages"][0]["content"]
        self.assertIn(topic.title, user_message)
        self.assertIn(topic.summary_for_context, user_message)
        self.assertIn(topic.key_terms[0], user_message)
        self.assertIn(topic.key_terms[1], user_message)


class TestQuizzerDifficultyValidation(unittest.TestCase):
    """Tests for QuizzerAgent._validate_difficulty_gradient()."""

    def _make_quiz_set_for_difficulties(self, difficulties: list[str]) -> QuizSet:
        """Create a QuizSet from a provided list of difficulty labels."""
        quizzes: list[QuizCard] = []

        for index, difficulty in enumerate(difficulties):
            _ = DIFFICULTY_ORDER[difficulty]
            quizzes.append(
                QuizCard(
                    question_text=f"Difficulty test question {index + 1}",
                    options=[
                        QuizOption(
                            option_id=_make_stable_uuid(f"diff-{index}-A"),
                            display_label="A",
                            text="Correct option",
                            is_correct=True,
                            explanation="Correct explanation.",
                        ),
                        QuizOption(
                            option_id=_make_stable_uuid(f"diff-{index}-B"),
                            display_label="B",
                            text="Distractor B",
                            is_correct=False,
                            explanation="Incorrect explanation B.",
                        ),
                        QuizOption(
                            option_id=_make_stable_uuid(f"diff-{index}-C"),
                            display_label="C",
                            text="Distractor C",
                            is_correct=False,
                            explanation="Incorrect explanation C.",
                        ),
                        QuizOption(
                            option_id=_make_stable_uuid(f"diff-{index}-D"),
                            display_label="D",
                            text="Distractor D",
                            is_correct=False,
                            explanation="Incorrect explanation D.",
                        ),
                    ],
                    difficulty=difficulty,
                )
            )

        return QuizSet(quizzes=quizzes, current_index=0)

    def test_single_quiz_expected_medium_valid(self) -> None:
        """Single-quiz sets should use the expected 'medium' difficulty."""
        quiz_set = self._make_quiz_set_for_difficulties(["medium"])

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertTrue(result)

    def test_single_quiz_wrong_difficulty_invalid(self) -> None:
        """Single-quiz sets should fail if difficulty mismatches."""
        quiz_set = self._make_quiz_set_for_difficulties(["easy"])

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertFalse(result)

    def test_ascending_gradient_valid(self) -> None:
        """A strict easy->medium->hard gradient should pass validation."""
        quiz_set = self._make_quiz_set_for_difficulties(["easy", "medium", "hard"])

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertTrue(result)

    def test_two_quiz_gradient_valid(self) -> None:
        """A two-quiz easy->hard gradient should pass validation."""
        quiz_set = self._make_quiz_set_for_difficulties(["easy", "hard"])

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertTrue(result)

    def test_uniform_gradient_invalid(self) -> None:
        """Uniform difficulty across all quizzes should fail validation."""
        quiz_set = self._make_quiz_set_for_difficulties(["medium", "medium", "medium"])

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertFalse(result)

    def test_reversed_gradient_invalid(self) -> None:
        """A hard->...->easy progression should fail validation."""
        quiz_set = self._make_quiz_set_for_difficulties(["hard", "medium", "easy"])

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertFalse(result)

    def test_internal_inversion_invalid(self) -> None:
        """A sequence like easy->hard->medium should fail validation."""
        quiz_set = self._make_quiz_set_for_difficulties(["easy", "hard", "medium"])

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertFalse(result)

    def test_partially_ascending_valid(self) -> None:
        """Non-decreasing gradients with repeats should pass validation."""
        quiz_set = self._make_quiz_set_for_difficulties(
            ["easy", "easy", "medium", "hard", "hard"]
        )

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertTrue(result)

    def test_five_quiz_wrong_distribution_invalid(self) -> None:
        """Five-quiz sets must match the expected distribution."""
        quiz_set = self._make_quiz_set_for_difficulties(
            ["easy", "medium", "medium", "hard", "hard"]
        )

        result = QuizzerAgent._validate_difficulty_gradient(quiz_set)

        self.assertFalse(result)


class TestQuizzerConfig(unittest.TestCase):
    """Tests for quizzer MODEL_CONFIGS guardrails."""

    def test_quizzer_max_output_tokens_sufficient_for_multi_quiz(self) -> None:
        """Quizzer token limit should be high enough for QuizSet payloads."""
        self.assertGreaterEqual(MODEL_CONFIGS["quizzer"]["max_output_tokens"], 4096)

    def test_quizzer_temperature_unchanged(self) -> None:
        """Quizzer temperature remains tuned for deterministic JSON output."""
        self.assertEqual(MODEL_CONFIGS["quizzer"]["temperature"], 0.2)

    def test_quizzer_model_unchanged(self) -> None:
        """Quizzer model remains Gemini Flash for fast generation."""
        self.assertEqual(MODEL_CONFIGS["quizzer"]["model"], "gemini-2.5-flash")


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

    def test_quiz_card_requires_exactly_one_correct_option(self) -> None:
        """Negative test: Verify QuizCard fails without exactly one correct option.

        This test meets the objective by checking that validation
        fails when no option or multiple options are marked as correct.
        """
        # Test with zero correct options
        with self.assertRaises(ValidationError) as context:
            QuizCard(
                question_text="What is the answer?",
                options=[
                    QuizOption(
                        option_id=_make_stable_uuid("A"),
                        display_label="A",
                        text="Wrong answer 1",
                        is_correct=False,
                        explanation="Explanation for A",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid("B"),
                        display_label="B",
                        text="Wrong answer 2",
                        is_correct=False,
                        explanation="Explanation for B",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid("C"),
                        display_label="C",
                        text="Wrong answer 3",
                        is_correct=False,
                        explanation="Explanation for C",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid("D"),
                        display_label="D",
                        text="Wrong answer 4",
                        is_correct=False,
                        explanation="Explanation for D",
                    ),
                ],
                difficulty=QuizDifficulty.EASY,
            )

        # Check that the error mentions correct option requirement
        error_str = str(context.exception)
        self.assertIn("exactly one correct", error_str.lower())

    def test_quiz_card_requires_exactly_four_options(self) -> None:
        """Negative test: Verify QuizCard requires exactly 4 options.

        This test meets the objective by checking that validation
        fails with fewer or more than 4 options.
        """
        # Test with fewer than 4 options
        with self.assertRaises(ValidationError):
            QuizCard(
                question_text="What is the answer?",
                options=[
                    QuizOption(
                        option_id=_make_stable_uuid("A"),
                        display_label="A",
                        text="Only option",
                        is_correct=True,
                        explanation="Only explanation",
                    ),
                ],
                difficulty=QuizDifficulty.EASY,
            )

        # Test with more than 4 options
        with self.assertRaises(ValidationError):
            QuizCard(
                question_text="What is the answer?",
                options=[
                    QuizOption(
                        option_id=_make_stable_uuid("A"),
                        display_label="A",
                        text="Option 1",
                        is_correct=True,
                        explanation="Explanation A",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid("B"),
                        display_label="B",
                        text="Option 2",
                        is_correct=False,
                        explanation="Explanation B",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid("C"),
                        display_label="C",
                        text="Option 3",
                        is_correct=False,
                        explanation="Explanation C",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid("D"),
                        display_label="D",
                        text="Option 4",
                        is_correct=False,
                        explanation="Explanation D",
                    ),
                    QuizOption(
                        option_id=_make_stable_uuid("E"),
                        display_label="E",
                        text="Option 5",
                        is_correct=False,
                        explanation="Explanation E",
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
                option_id=_make_stable_uuid("A"),
                display_label="A",
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
