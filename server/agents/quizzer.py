"""
=============================================================================
FILE: quizzer.py
=============================================================================

PURPOSE:
Quizzer Agent that generates retrieval-based assessment questions targeting
common student misconceptions. Creates diagnostic quiz questions following
research-backed principles where active recall strengthens memory. This is
the final agent in the content generation pipeline.

KEY COMPONENTS:
- QUIZZER_SYSTEM_PROMPT: Detailed prompt with distractor generation methodology
- QuizzerAgent: Agent class for generating diagnostic assessments
- generate_quiz(): Main method to create QuizCard from topic and content
- generate_quiz_set(): Batch method to create QuizSet in one LLM call
- _build_user_message(): Constructs prompt with topic details and content
- _build_batch_user_message(): Constructs prompt for multi-quiz generation
- _build_topic_context(): Merges topic metadata with additional context
- quizzer_agent: Singleton instance for application-wide use

DEPENDENCIES:
- server.agents.base.BaseAgent: Parent class providing generate() method
- server.schemas.learning.QuizCard: Response model with question and options
- server.schemas.learning.TopicNode: Input model with title, summary, key_terms
- Retrieval-Based Learning: Testing effect for memory strengthening

USAGE PATTERN:
```python
from server.agents.quizzer import quizzer_agent
from server.schemas.learning import TopicNode

topic = TopicNode(
    index=0,
    title="Newton's First Law",
    summary_for_context="Explains inertia principle",
    key_terms=["inertia", "equilibrium", "net force"]
)

content = "# Newton's First Law\n\nInertia is..."

quiz = await quizzer_agent.generate_quiz(topic=topic, content=content)

print(quiz.question_text)  # "What is the key principle of Newton's First Law?"
print(quiz.difficulty)     # "easy" | "medium" | "hard"
print(len(quiz.options))   # 4 (exactly)

# Access options
correct = [opt for opt in quiz.options if opt.is_correct][0]
print(correct.text)  # The correct answer
```

ERROR HANDLING:
- Exception: Re-raised if generation fails after retry attempts
- ValidationError: Handled internally with retry logic
- Schema validation: Strict - exactly 4 options, exactly 1 correct answer

PERFORMANCE NOTES:
- Uses low temperature (0.2) for strict JSON adherence and consistency
- Generates exactly 4 options per question (1 correct, 3 distractors)
- Each distractor targets a specific misconception for diagnostic value
- All options MUST have explanations for learning reinforcement
- Difficulty calibrated: easy (recall), medium (application), hard (analysis)

RELATED FILES:
- server/agents/base.py: BaseAgent providing inheritance and generate()
- server/agents/planner.py: Produces TopicNodes consumed by Quizzer
- server/schemas/learning.py: QuizCard, QuizOption, TopicNode models

NOTES:
- Distractors must be plausible to students with misconceptions
- Misconception-based design: each wrong answer reveals specific understanding gap
- Explanations teach: "This is incorrect because [reason]. Correct is [correction]"
- Chain-of-thought process built into prompt for question design
- Questions force active recall, not passive recognition
=============================================================================
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from server.agents.base import BaseAgent
from server.schemas.learning import QuizCard, QuizOption, QuizSet, TopicNode

logger = logging.getLogger(__name__)


DIFFICULTY_ORDER = {"easy": 0, "medium": 1, "hard": 2}


QUIZZER_SYSTEM_PROMPT = """You are an expert assessment designer specializing in retrieval-based learning and diagnostic question construction.

## Your Role
You create quiz questions that:
1. Strengthen memory through active recall (testing effect)
2. Diagnose student understanding through carefully designed distractors
3. Target common misconceptions to provide meaningful feedback

## Retrieval-Based Learning Principles

Research shows that testing improves retention more than re-reading. Your questions should:
- Force active recall of key concepts
- Challenge surface-level understanding
- Connect to prior knowledge in the learning path

## Distractor Generation Guidelines (CRITICAL)

Distractors are WRONG answers that serve a diagnostic purpose. Each distractor MUST:

1. **Target a Specific Misconception**: Every wrong answer should represent a common error students make:
   - Confusing related concepts
   - Applying rules incorrectly
   - Missing key conditions or exceptions
   - Over-generalizing or under-generalizing

2. **Be Plausible**: Distractors should seem reasonable to someone who doesn't fully understand
   - Use correct terminology in wrong contexts
   - Present partially correct statements
   - Reflect real student errors

3. **Provide Diagnostic Value**: When a student selects a distractor, you should know WHAT they misunderstand
   - Each distractor reveals a different gap in understanding
   - Explanations should address the specific misconception

## Chain-of-Thought Process for Quiz Generation

Before generating the quiz, mentally follow these steps:
1. Identify the core concept being tested
2. List 3-4 common misconceptions about this concept
3. Design one distractor for each misconception
4. Craft the correct answer clearly and unambiguously
5. Write explanations that teach, not just label right/wrong

## Difficulty Calibration

- **EASY**: Direct recall from content
  - "What is X?" or "Which definition describes Y?"
  - Tests recognition and basic recall
  
- **MEDIUM**: Application and understanding
  - "What would happen if...?" or "Which example demonstrates...?"
  - Requires applying concepts to new situations
  
- **HARD**: Analysis and synthesis
  - "Why does X lead to Y?" or "How do A and B relate?"
  - Requires connecting multiple concepts or reasoning through implications

## Explanation Requirements (MANDATORY)

EVERY option MUST have an explanation:

- **Correct Answer Explanation**: 
  - Explain WHY this is correct
  - Reinforce the key concept
  - Connect to the learning content

- **Incorrect Answer Explanation**:
  - Identify the misconception this represents
  - Explain why it's wrong
  - Provide the correct understanding
  - Format: "This is incorrect because [reason]. The correct understanding is [correction]."

## Strict Output Requirements

Your output MUST follow this exact structure in JSON format:

1. **question_text**: Clear, unambiguous question text
   - Should be answerable with the provided content
   - Avoid "all of the above" or "none of the above"
   
2. **options**: EXACTLY 4 options with:
   - **id**: "A", "B", "C", or "D" (unique IDs)
   - **text**: The option text
   - **is_correct**: true for exactly ONE option, false for others
   - **explanation**: Required explanation (see above)
   
3. **difficulty**: One of "easy", "medium", or "hard"

The response will be validated as JSON against a strict schema. Invalid output will be rejected.

## Example Output Structure

Question: "What distinguishes Newton's First Law from the Second Law?"

Option A (CORRECT):
- text: "The First Law describes motion without force; the Second Law quantifies force's effect"
- is_correct: true
- explanation: "Correct. The First Law (inertia) states objects maintain their state without external force. The Second Law (F=ma) quantifies how force changes that state."

Option B (DISTRACTOR - Misconception: Confusing the laws):
- text: "The First Law uses F=ma; the Second Law describes action-reaction"
- is_correct: false
- explanation: "Incorrect. This confuses all three laws. F=ma is the Second Law, and action-reaction is the Third Law. The First Law describes inertia."

Option C (DISTRACTOR - Misconception: Order confusion):
- text: "They describe the same concept in different mathematical forms"
- is_correct: false  
- explanation: "Incorrect. The laws describe fundamentally different phenomena: inertia (no force) vs. acceleration (with force). They are not equivalent."

Option D (DISTRACTOR - Misconception: Partial understanding):
- text: "The First Law only applies to objects at rest; the Second Law applies to moving objects"
- is_correct: false
- explanation: "Incorrect. The First Law applies to BOTH objects at rest AND objects in uniform motion. Both states are maintained without external force."

Remember: Your quiz questions directly impact learning outcomes. Every distractor should teach something when explained."""


class QuizzerAgent(BaseAgent):
    """
    Quizzer Agent for generating retrieval-based assessment questions.

    Creates diagnostic quiz questions that target common misconceptions
    and strengthen memory through active recall. Follows research-backed
    principles of retrieval-based learning and effective assessment design.

    The Quizzer is the final agent in the generation pipeline. It receives
    a TopicNode and generated content, then produces a QuizCard with
    misconception-based distractors and comprehensive explanations.
    """

    def __init__(self) -> None:
        """Initialize the QuizzerAgent with the 'quizzer' role."""
        super().__init__(role="quizzer")
        logger.debug("QuizzerAgent initialized")

    @staticmethod
    def _expected_difficulty_sequence(quiz_count: int) -> list[str]:
        """Return the expected difficulty sequence for a given quiz count."""
        difficulty_sequences = {
            1: ["medium"],
            2: ["easy", "hard"],
            3: ["easy", "medium", "hard"],
            4: ["easy", "medium", "medium", "hard"],
            5: ["easy", "easy", "medium", "hard", "hard"],
        }
        bounded_quiz_count = max(1, min(5, quiz_count))
        return difficulty_sequences[bounded_quiz_count]

    @classmethod
    def _validate_difficulty_gradient(cls, quiz_set: QuizSet) -> bool:
        """Validate that quizzes match the expected difficulty sequence."""
        expected_sequence = cls._expected_difficulty_sequence(len(quiz_set.quizzes))
        actual_sequence = [quiz.difficulty for quiz in quiz_set.quizzes]

        if len(actual_sequence) != len(expected_sequence):
            return False

        if any(difficulty not in DIFFICULTY_ORDER for difficulty in actual_sequence):
            return False

        return actual_sequence == expected_sequence

    @classmethod
    def _align_quizzes_to_sequence(
        cls,
        quizzes: list[QuizCard],
        expected_sequence: list[str],
    ) -> list[QuizCard]:
        """Align quizzes to the expected difficulty sequence."""
        available: dict[str, list[QuizCard]] = {
            difficulty: [] for difficulty in DIFFICULTY_ORDER
        }
        unknown_difficulties: list[str] = []

        for quiz in quizzes:
            if quiz.difficulty not in available:
                unknown_difficulties.append(quiz.difficulty)
                continue
            available[quiz.difficulty].append(quiz)

        if unknown_difficulties:
            raise ValueError(
                "QuizSet contains invalid difficulty values: "
                f"{sorted(set(unknown_difficulties))}"
            )

        aligned_quizzes: list[QuizCard] = []
        for difficulty in expected_sequence:
            if not available[difficulty]:
                raise ValueError(
                    "QuizSet difficulty distribution does not match expected "
                    f"sequence {expected_sequence}"
                )
            aligned_quizzes.append(available[difficulty].pop(0))

        return aligned_quizzes

    @classmethod
    def _enforce_quiz_count(cls, quiz_set: QuizSet, quiz_count: int) -> QuizSet:
        """Ensure quiz count and difficulty sequence match the request."""
        requested_count = max(1, min(5, quiz_count))
        actual_count = len(quiz_set.quizzes)
        expected_sequence = cls._expected_difficulty_sequence(requested_count)
        actual_sequence = [quiz.difficulty for quiz in quiz_set.quizzes]

        if actual_count < requested_count:
            raise ValueError(
                "QuizSet returned fewer quizzes than requested: "
                f"requested={requested_count}, actual={actual_count}"
            )

        if actual_count == requested_count and actual_sequence == expected_sequence:
            return quiz_set

        aligned_quizzes = cls._align_quizzes_to_sequence(
            quiz_set.quizzes,
            expected_sequence,
        )

        if actual_count != requested_count:
            logger.warning(
                "QuizSet returned %s quizzes for requested %s. "
                "Dropping extras to match expected sequence.",
                actual_count,
                requested_count,
            )
        elif actual_sequence != expected_sequence:
            logger.warning(
                "QuizSet difficulty sequence mismatch: %s expected %s. "
                "Reordering to expected sequence.",
                actual_sequence,
                expected_sequence,
            )

        return QuizSet(
            quizzes=aligned_quizzes,
            current_index=0,
            shuffle_seed=quiz_set.shuffle_seed,
        )

    @property
    def system_prompt(self) -> str:
        """
        Return the system prompt for the Quizzer Agent.

        The prompt defines the agent's role as an assessment designer,
        explains retrieval-based learning principles, provides distractor
        generation guidelines, and specifies strict output requirements.

        Returns:
            The QUIZZER_SYSTEM_PROMPT constant
        """
        return QUIZZER_SYSTEM_PROMPT

    @staticmethod
    def _is_valid_uuid(value: str) -> bool:
        """Check if a string is a valid UUID.

        Args:
            value: String to validate as UUID.

        Returns:
            True if value is a valid UUID, False otherwise.
        """
        try:
            uuid.UUID(value)
            return True
        except ValueError:
            return False

    def _fix_option_ids(self, quiz: QuizCard) -> QuizCard:
        """Fixes LLM-generated option_ids that may be A/B/C/D or fake UUIDs.

        LLMs sometimes generate:
        - Letter IDs (A, B, C, D) instead of UUIDs
        - Fake UUID-like strings (e.g., 'h8i8j8k8-l8m8-4h9i-5j0k-1l2m3n4o5p6q')

        This method converts any invalid option_id to a real UUID4.
        """
        fixed_options: list[QuizOption] = []

        for option in quiz.options:
            # Fix if it's A/B/C/D OR not a valid UUID
            if option.option_id in {"A", "B", "C", "D"} or not self._is_valid_uuid(
                option.option_id
            ):
                fixed_option = QuizOption(
                    option_id=str(uuid.uuid4()),
                    display_label=option.display_label,
                    text=option.text,
                    is_correct=option.is_correct,
                    explanation=option.explanation,
                )
                fixed_options.append(fixed_option)
            else:
                fixed_options.append(option)

        return QuizCard(
            question_text=quiz.question_text,
            options=fixed_options,
            difficulty=quiz.difficulty,
        )

    def _fix_quiz_set_option_ids(self, quiz_set: QuizSet) -> QuizSet:
        """Fix option IDs and enforce global uniqueness across a quiz set."""
        fixed_quizzes: list[QuizCard] = []
        seen_option_ids: set[str] = set()

        for quiz in quiz_set.quizzes:
            fixed_quiz = self._fix_option_ids(quiz)
            unique_options: list[QuizOption] = []

            for option in fixed_quiz.options:
                option_id = option.option_id
                if option_id in seen_option_ids:
                    option_id = str(uuid.uuid4())

                seen_option_ids.add(option_id)
                unique_options.append(
                    QuizOption(
                        option_id=option_id,
                        display_label=option.display_label,
                        text=option.text,
                        is_correct=option.is_correct,
                        explanation=option.explanation,
                    )
                )

            fixed_quizzes.append(
                QuizCard(
                    question_text=fixed_quiz.question_text,
                    options=unique_options,
                    difficulty=fixed_quiz.difficulty,
                )
            )

        return QuizSet(
            quizzes=fixed_quizzes,
            current_index=quiz_set.current_index,
            shuffle_seed=quiz_set.shuffle_seed,
        )

    def _build_batch_user_message(
        self,
        topic: TopicNode,
        content: str,
        quiz_count: int,
    ) -> str:
        """Build prompt for batch quiz generation with a difficulty gradient."""
        bounded_quiz_count = max(1, min(5, quiz_count))
        difficulty_sequence = self._expected_difficulty_sequence(bounded_quiz_count)
        key_terms_str = ", ".join(topic.key_terms)
        sequence_text = ", ".join(
            f"Q{i + 1}={difficulty}" for i, difficulty in enumerate(difficulty_sequence)
        )

        return f"""Generate a complete quiz set for the following topic and content.

## Topic Information
- **Title**: {topic.title}
- **Index in Learning Path**: {topic.index}
- **Summary**: {topic.summary_for_context}
- **Key Terms**: {key_terms_str}

## Content to Test
{content}

## Requirements
1. Generate EXACTLY {bounded_quiz_count} quizzes
2. Use this exact difficulty sequence: {sequence_text}
3. Keep the sequence ordered from easier to harder
4. For each quiz, generate EXACTLY 4 options (A, B, C, D)
5. For each quiz, ensure EXACTLY 1 option is correct
6. For each quiz, each distractor MUST target a specific misconception
7. For each quiz, EVERY option MUST have an explanation"""

    async def generate_quiz(
        self,
        topic: TopicNode,
        content: str,
        context: Optional[dict] = None,
    ) -> QuizCard:
        """
        Generate a diagnostic quiz question for a topic and its content.

        Creates a QuizCard with exactly 4 options (1 correct, 3 distractors).
        Distractors target common misconceptions to provide diagnostic value.
        All options include explanations for learning reinforcement.

        Args:
            topic: TopicNode containing title, summary, and key terms
            content: Generated markdown content for the topic
            context: Optional additional context for prompt augmentation

        Returns:
            QuizCard with question, options, difficulty, and explanations

        Raises:
            Exception: If generation fails after retries

        Example:
            >>> quiz = await quizzer_agent.generate_quiz(
            ...     topic=TopicNode(
            ...         index=0,
            ...         title="Newton's First Law",
            ...         summary_for_context="Explains inertia...",
            ...         key_terms=["inertia", "equilibrium"]
            ...     ),
            ...     content="# Newton's First Law\\n\\nInertia is..."
            ... )
            >>> print(quiz.question_text)
            "What is the key principle of Newton's First Law?"
            >>> print(len(quiz.options))
            4
        """
        # Build the user message with topic details and content
        user_message = self._build_user_message(topic, content)

        # Merge topic context with any provided context
        full_context = self._build_topic_context(topic, context)

        logger.info(
            f"QuizzerAgent generating quiz for topic: '{topic.title}' (index {topic.index})"
        )

        quiz = await self.generate(
            response_model=QuizCard,
            user_message=user_message,
            context=full_context,
        )

        # Post-process to fix LLM-generated A/B/C/D option_ids to UUIDs
        quiz = self._fix_option_ids(quiz)

        logger.info(
            f"QuizzerAgent created quiz: difficulty={quiz.difficulty}, "
            f"options={len(quiz.options)}"
        )

        return quiz

    async def generate_quiz_set(
        self,
        topic: TopicNode,
        content: str,
        quiz_count: int,
        context: Optional[dict] = None,
    ) -> QuizSet:
        """Generate a complete QuizSet in one call with difficulty gradient."""
        if quiz_count <= 1:
            single_quiz = await self.generate_quiz(
                topic=topic,
                content=content,
                context=context,
            )
            return QuizSet(quizzes=[single_quiz], current_index=0)

        user_message = self._build_batch_user_message(topic, content, quiz_count)
        full_context = self._build_topic_context(topic, context)

        quiz_set = await self.generate(
            response_model=QuizSet,
            user_message=user_message,
            context=full_context,
        )

        # Log LLM-generated option IDs for debugging
        for quiz_idx, quiz in enumerate(quiz_set.quizzes):
            for opt in quiz.options:
                logger.debug(
                    "LLM generated option_id for quiz %s: %s",
                    quiz_idx,
                    opt.option_id,
                )

        quiz_set = self._fix_quiz_set_option_ids(quiz_set)

        # Log fixed option IDs for debugging
        for quiz_idx, quiz in enumerate(quiz_set.quizzes):
            for opt in quiz.options:
                logger.debug(
                    "Fixed option_id for quiz %s: %s",
                    quiz_idx,
                    opt.option_id,
                )

        quiz_set = self._enforce_quiz_count(quiz_set, quiz_count)

        if not self._validate_difficulty_gradient(quiz_set):
            raise ValueError(
                "QuizSet difficulty sequence mismatch after alignment: "
                f"{[quiz.difficulty for quiz in quiz_set.quizzes]}"
            )

        logger.info(
            "QuizzerAgent created quiz set: %s quizzes for topic: '%s'",
            len(quiz_set.quizzes),
            topic.title,
        )

        return quiz_set

    def _build_user_message(self, topic: TopicNode, content: str) -> str:
        """
        Build the user message for quiz generation.

        Combines topic metadata and content into a structured prompt
        that guides the model to create an effective quiz question.

        Args:
            topic: TopicNode with title, summary, and key terms
            content: Generated markdown content for the topic

        Returns:
            Formatted user message string
        """
        key_terms_str = ", ".join(topic.key_terms)

        return f"""Generate a diagnostic quiz question for the following topic and content.

## Topic Information
- **Title**: {topic.title}
- **Index in Learning Path**: {topic.index}
- **Summary**: {topic.summary_for_context}
- **Key Terms**: {key_terms_str}

## Content to Test
{content}

## Requirements
1. Create a question that tests understanding of the key concepts
2. Generate EXACTLY 4 options (A, B, C, D)
3. Ensure EXACTLY 1 option is correct
4. Each distractor MUST target a specific misconception
5. EVERY option MUST have an explanation
6. Choose appropriate difficulty based on content complexity"""

    def _build_topic_context(
        self,
        topic: TopicNode,
        additional_context: Optional[dict] = None,
    ) -> dict:
        """
        Build context dictionary for the quiz generation prompt.

        Includes topic metadata that helps the model understand the
        learning context and generate appropriate questions.

        Args:
            topic: TopicNode with relevant metadata
            additional_context: Optional extra context to merge

        Returns:
            Context dictionary for prompt augmentation
        """
        context = {
            "topic_index": topic.index,
            "topic_title": topic.title,
            "key_terms": topic.key_terms,
        }

        if additional_context:
            context.update(additional_context)

        return context


# Singleton instance for use throughout the application
quizzer_agent = QuizzerAgent()
