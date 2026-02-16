"""
=============================================================================
FILE: test_learning_schemas.py
=============================================================================

PURPOSE:
Unit tests for learning schema validation. Validates Pydantic model
constraints, enum values, minimum list requirements, and default values
for all learning-related schemas.

KEY TESTS:
- test_status_values: Validates NodeStatus enum values
- test_quiz_option_valid: Valid QuizOption creation (stable option_id + display_label)
- test_quiz_card_requires_min_options: Four options required
- test_topic_node_valid: Valid TopicNode creation
- test_course_outline_min_topics: Minimum 3 topics required
- test_learning_session_valid: Valid LearningSessionCreate
- test_concept_node_create: Default NodeStatus.LOCKED validation
- test_quiz_set_valid: Multi-quiz set with single quiz
- test_quiz_set_multiple_quizzes: Multiple quizzes per node
- test_convert_legacy_quiz_option: Backward compatibility for legacy format
- test_quiz_option_hidden_no_correctness: Hidden options don't expose answers
- test_quiz_card_hidden_validation: Hidden quiz cards don't leak correctness
- test_quiz_set_hidden_structure: QuizSetHidden has total_quizzes field
- test_quiz_submission_with_quiz_index: Multi-quiz submission support
- test_quiz_option_id_rules: Stable IDs must be unique and non-empty

DEPENDENCIES:
- unittest: Python standard testing framework
- pydantic: ValidationError for schema validation tests
- server.schemas.learning: All learning-related schemas

USAGE PATTERN:
```python
# Run all learning schema tests
python -m unittest server.tests.test_learning_schemas

# Run specific test class
python -m unittest server.tests.test_learning_schemas.TestQuizSchemas

# Run single test
python -m unittest server.tests.test_learning_schemas.TestQuizSchemas.test_quiz_card_requires_min_options
```

TEST SETUP:
- Creates mock QuizOption, TopicNode, and other schema objects
- Tests both positive (valid) and negative (ValidationError) cases
- No external dependencies - pure schema validation

RELATED FILES:
- server/schemas/learning.py - All learning schemas under test

NOTES:
- QuizCard requires exactly 4 options
- QuizOption requires explanation field
- CourseOutline requires 3-5 topics
- NodeStatus enum: LOCKED, VIEWING_EXPLANATION, IN_QUIZ, SHOWING_FEEDBACK, COMPLETED, ERROR
- Phase 1: Secure option identity with stable option_id (UUID) separate from display_label
=============================================================================
"""

# test_learning_schemas.py
# Unit tests for learning schema validation

# Longer description (2-4 lines):
# - Validates enum values and Pydantic model constraints.
# - Exercises quiz, planner, session, and submission payload schemas.
# - Confirms minimum list requirements and default values.

# @see: server/schemas/learning.py - Schema definitions under test
# @note: Invalid payloads should raise Pydantic ValidationError

from datetime import datetime, timezone
import unittest
import uuid

from pydantic import ValidationError

from server.schemas.learning import (
    ConceptNodeCreate,
    CourseOutline,
    LearningSessionCreate,
    NodeStatus,
    QuizCard,
    QuizCardHidden,
    QuizDifficulty,
    QuizOption,
    QuizOptionHidden,
    QuizSubmission,
    QuizSet,
    QuizSetHidden,
    RevisionCreateRequest,
    RevisionNodeProgress,
    RevisionNodeProgressWithDetails,
    RevisionSessionResponse,
    RevisionSessionWithProgress,
    TopicNode,
    convert_legacy_quiz_option,
)


def _make_quiz_option(display_label: str, is_correct: bool) -> QuizOption:
    """Create a QuizOption with stable option_id (UUID) and display_label."""
    # Generate stable UUID based on display_label for testing
    option_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"test-option-{display_label}"))
    return QuizOption(
        option_id=option_id,
        display_label=display_label,
        text=f"Option {display_label}",
        is_correct=is_correct,
        explanation="Explanation",
    )


def _make_topic(index: int) -> TopicNode:
    return TopicNode(
        index=index,
        title=f"Topic {index}",
        summary_for_context=f"Summary {index}",
        key_terms=[f"term-{index}a", f"term-{index}b"],
    )


class TestNodeStatus(unittest.TestCase):
    def test_status_values(self) -> None:
        expected_values = {
            "LOCKED",
            "VIEWING_EXPLANATION",
            "IN_QUIZ",
            "SHOWING_FEEDBACK",
            "COMPLETED",
            "ERROR",
        }
        actual_values = {status.value for status in NodeStatus}
        self.assertEqual(expected_values, actual_values)


class TestQuizSchemas(unittest.TestCase):
    def test_quiz_option_valid(self) -> None:
        option = _make_quiz_option("A", True)
        self.assertEqual(option.display_label, "A")
        self.assertTrue(option.is_correct)
        # Verify option_id is a valid UUID
        self.assertIsInstance(option.option_id, str)
        self.assertEqual(len(option.option_id), 36)  # UUID length

    def test_quiz_option_id_rules(self) -> None:
        """Stable option_id must be unique and persist across shuffles."""
        # Test unique option_ids in a quiz
        opt_a = _make_quiz_option("A", True)
        opt_b = _make_quiz_option("B", False)
        opt_c = _make_quiz_option("C", False)
        # Duplicate option_id should fail validation
        with self.assertRaises(ValidationError) as ctx:
            QuizCard(
                question_text="Test question",
                options=[
                    opt_a,
                    QuizOption(
                        option_id=opt_a.option_id,  # Duplicate!
                        display_label="B",
                        text="Option B",
                        is_correct=False,
                        explanation="Explanation B",
                    ),
                    opt_c,
                    _make_quiz_option("D", False),
                ],
            )
        self.assertIn("unique", str(ctx.exception).lower())

    def test_quiz_card_valid(self) -> None:
        options = [
            _make_quiz_option("A", True),
            _make_quiz_option("B", False),
            _make_quiz_option("C", False),
            _make_quiz_option("D", False),
        ]
        card = QuizCard(
            question_text="What is the answer?",
            options=options,
            difficulty=QuizDifficulty.MEDIUM,
        )
        self.assertEqual(card.question_text, "What is the answer?")
        self.assertEqual(len(card.options), 4)
        self.assertEqual(card.difficulty, QuizDifficulty.MEDIUM)

    def test_quiz_card_requires_min_options(self) -> None:
        options = [
            _make_quiz_option("A", True),
            _make_quiz_option("B", False),
            _make_quiz_option("C", False),
        ]
        with self.assertRaises(ValidationError):
            QuizCard(question_text="Too few", options=options)

    def test_quiz_card_exactly_one_correct(self) -> None:
        """QuizCard must have exactly one correct option."""
        # Zero correct options should fail
        with self.assertRaises(ValidationError):
            QuizCard(
                question_text="No correct answer",
                options=[
                    _make_quiz_option("A", False),
                    _make_quiz_option("B", False),
                    _make_quiz_option("C", False),
                    _make_quiz_option("D", False),
                ],
            )

        # Two correct options should fail
        with self.assertRaises(ValidationError):
            QuizCard(
                question_text="Two correct answers",
                options=[
                    _make_quiz_option("A", True),
                    _make_quiz_option("B", True),
                    _make_quiz_option("C", False),
                    _make_quiz_option("D", False),
                ],
            )


class TestHiddenQuizSchemas(unittest.TestCase):
    """Tests for hidden quiz schemas (IN_QUIZ state - no answer leakage)."""

    def test_quiz_option_hidden_no_correctness(self) -> None:
        """QuizOptionHidden must not have is_correct or explanation fields."""
        hidden = QuizOptionHidden(
            option_id=str(uuid.uuid4()),
            display_label="A",
            text="Option text",
        )
        self.assertEqual(hidden.display_label, "A")
        self.assertEqual(hidden.text, "Option text")
        # Verify these fields don't exist
        with self.assertRaises(AttributeError):
            _ = hidden.is_correct
        with self.assertRaises(AttributeError):
            _ = hidden.explanation

    def test_quiz_card_hidden_validation(self) -> None:
        """QuizCardHidden must hide correctness and explanations."""
        options = [
            QuizOptionHidden(
                option_id=str(uuid.uuid4()),
                display_label=label,
                text=f"Option {label}",
            )
            for label in ["A", "B", "C", "D"]
        ]
        hidden_card = QuizCardHidden(
            question_text="Hidden question",
            options=options,
            difficulty=QuizDifficulty.EASY,
        )
        self.assertEqual(len(hidden_card.options), 4)
        # Verify no correctness data is present
        for opt in hidden_card.options:
            with self.assertRaises(AttributeError):
                _ = opt.is_correct

    def test_quiz_set_hidden_structure(self) -> None:
        """QuizSetHidden must include total_quizzes for UI progress."""
        options = [
            QuizOptionHidden(
                option_id=str(uuid.uuid4()),
                display_label=label,
                text=f"Option {label}",
            )
            for label in ["A", "B", "C", "D"]
        ]
        quiz_hidden = QuizCardHidden(
            question_text="Q1",
            options=options,
            difficulty=QuizDifficulty.MEDIUM,
        )
        quiz_set_hidden = QuizSetHidden(
            quizzes=[quiz_hidden],
            current_index=0,
            total_quizzes=3,
        )
        self.assertEqual(quiz_set_hidden.total_quizzes, 3)
        self.assertEqual(quiz_set_hidden.current_index, 0)


class TestPlannerSchemas(unittest.TestCase):
    def test_topic_node_valid(self) -> None:
        topic = _make_topic(0)
        self.assertEqual(topic.index, 0)
        self.assertEqual(topic.title, "Topic 0")

    def test_course_outline_valid(self) -> None:
        topics = [_make_topic(index) for index in range(5)]
        outline = CourseOutline(course_title="Course", topics=topics)
        self.assertEqual(outline.course_title, "Course")
        self.assertEqual(len(outline.topics), 5)

    def test_course_outline_min_topics(self) -> None:
        topics = [_make_topic(index) for index in range(2)]
        with self.assertRaises(ValidationError):
            CourseOutline(course_title="Too short", topics=topics)


class TestSessionSchemas(unittest.TestCase):
    def test_learning_session_create(self) -> None:
        session = LearningSessionCreate(
            user_id="user-1",
            query="Learn testing",
            course_title="Testing 101",
        )
        self.assertEqual(session.user_id, "user-1")
        self.assertEqual(session.query, "Learn testing")
        self.assertEqual(session.course_title, "Testing 101")

    def test_concept_node_create(self) -> None:
        node = ConceptNodeCreate(
            learning_session_id="session-1",
            sequence_index=0,
            title="Intro",
            content_markdown="Content",
        )
        self.assertEqual(node.learning_session_id, "session-1")
        self.assertEqual(node.status, NodeStatus.LOCKED)


class TestRevisionSchemas(unittest.TestCase):
    """Tests revision-related schema validation."""

    def test_revision_create_request_mode_values(self) -> None:
        full_review = RevisionCreateRequest(mode="full_review")
        quiz_only = RevisionCreateRequest(mode="quiz_only")

        self.assertEqual(full_review.mode, "full_review")
        self.assertEqual(quiz_only.mode, "quiz_only")

        with self.assertRaises(ValidationError):
            RevisionCreateRequest(mode="invalid")

    def test_revision_session_response_validates_fields(self) -> None:
        started_at = datetime.now(timezone.utc)
        completed_at = datetime.now(timezone.utc)
        revision = RevisionSessionResponse(
            id="revision-1",
            original_session_id="session-1",
            revision_number=2,
            mode="quiz_only",
            status="completed",
            progress_percent=100,
            total_quiz_score_percent=92,
            started_at=started_at,
            completed_at=completed_at,
        )
        self.assertEqual(revision.id, "revision-1")
        self.assertEqual(revision.revision_number, 2)
        self.assertEqual(revision.mode, "quiz_only")
        self.assertEqual(revision.status, "completed")
        self.assertEqual(revision.progress_percent, 100)
        self.assertEqual(revision.total_quiz_score_percent, 92)
        self.assertEqual(revision.started_at, started_at)
        self.assertEqual(revision.completed_at, completed_at)

    def test_revision_node_progress_status_values(self) -> None:
        progress = RevisionNodeProgress(
            id="progress-1",
            revision_session_id="revision-1",
            node_id="node-1",
            status="quiz_passed",
            reviewed_at=None,
        )
        self.assertEqual(progress.status, "quiz_passed")

        with self.assertRaises(ValidationError):
            RevisionNodeProgress(
                id="progress-2",
                revision_session_id="revision-1",
                node_id="node-1",
                status="invalid_status",
                reviewed_at=None,
            )

    def test_revision_session_with_progress_nodes(self) -> None:
        revision_with_progress = RevisionSessionWithProgress(
            id="revision-1",
            original_session_id="session-1",
            revision_number=1,
            mode="full_review",
            status="in_progress",
            progress_percent=50,
            total_quiz_score_percent=None,
            started_at=datetime.now(timezone.utc),
            completed_at=None,
            nodes=[
                RevisionNodeProgressWithDetails(
                    id="progress-1",
                    node_id="node-1",
                    node_title="Node 1",
                    sequence_index=0,
                    status="reviewed",
                    reviewed_at=datetime.now(timezone.utc),
                )
            ],
        )
        self.assertEqual(len(revision_with_progress.nodes), 1)
        self.assertEqual(revision_with_progress.nodes[0].status, "reviewed")


class TestQuizSubmission(unittest.TestCase):
    def test_submission_valid(self) -> None:
        """QuizSubmission uses stable option_id (UUID), not display_label."""
        # Create an option to get its stable option_id
        option = _make_quiz_option("A", True)
        submission = QuizSubmission(
            node_id="node-1", selected_option_id=option.option_id, quiz_index=0
        )
        self.assertEqual(submission.node_id, "node-1")
        self.assertEqual(submission.selected_option_id, option.option_id)
        self.assertEqual(submission.quiz_index, 0)

    def test_quiz_submission_default_index(self) -> None:
        """QuizSubmission defaults to quiz_index=0 for backward compatibility."""
        submission = QuizSubmission(
            node_id="node-1",
            selected_option_id=str(uuid.uuid4()),
        )
        self.assertEqual(submission.quiz_index, 0)

    def test_quiz_submission_with_quiz_index(self) -> None:
        """QuizSubmission supports multi-quiz with quiz_index parameter."""
        submission = QuizSubmission(
            node_id="node-1",
            selected_option_id=str(uuid.uuid4()),
            quiz_index=2,
        )
        self.assertEqual(submission.quiz_index, 2)

    def test_quiz_submission_negative_index_raises(self) -> None:
        """QuizSubmission with negative quiz_index should raise ValidationError."""
        with self.assertRaises(ValidationError):
            QuizSubmission(
                node_id="node-1",
                selected_option_id=str(uuid.uuid4()),
                quiz_index=-1,
            )


class TestQuizSet(unittest.TestCase):
    """Tests for QuizSet schema supporting multiple quizzes per node."""

    def test_quiz_set_valid(self) -> None:
        """QuizSet with single quiz should be valid."""
        quiz = QuizCard(
            question_text="Q1",
            options=[
                _make_quiz_option("A", True),
                _make_quiz_option("B", False),
                _make_quiz_option("C", False),
                _make_quiz_option("D", False),
            ],
            difficulty=QuizDifficulty.MEDIUM,
        )
        quiz_set = QuizSet(quizzes=[quiz], current_index=0)
        self.assertEqual(len(quiz_set.quizzes), 1)
        self.assertEqual(quiz_set.current_index, 0)

    def test_quiz_set_multiple_quizzes(self) -> None:
        """QuizSet with multiple quizzes should be valid."""
        quizzes = [
            QuizCard(
                question_text=f"Q{i}",
                options=[
                    _make_quiz_option("A", i == 0),
                    _make_quiz_option("B", i == 1),
                    _make_quiz_option("C", i == 2),
                    _make_quiz_option("D", i == 3),
                ],
                difficulty=QuizDifficulty.MEDIUM,
            )
            for i in range(3)
        ]
        quiz_set = QuizSet(quizzes=quizzes, current_index=1)
        self.assertEqual(len(quiz_set.quizzes), 3)
        self.assertEqual(quiz_set.current_index, 1)

    def test_quiz_set_empty_raises_error(self) -> None:
        """QuizSet with no quizzes should raise ValidationError."""
        with self.assertRaises(ValidationError):
            QuizSet(quizzes=[], current_index=0)

    def test_quiz_set_too_many_raises_error(self) -> None:
        """QuizSet with more than 5 quizzes should raise ValidationError."""
        quizzes = [
            QuizCard(
                question_text=f"Q{i}",
                options=[
                    _make_quiz_option("A", True),
                    _make_quiz_option("B", False),
                    _make_quiz_option("C", False),
                    _make_quiz_option("D", False),
                ],
                difficulty=QuizDifficulty.MEDIUM,
            )
            for i in range(6)
        ]
        with self.assertRaises(ValidationError):
            QuizSet(quizzes=quizzes, current_index=0)

    def test_quiz_set_current_index_out_of_range(self) -> None:
        """QuizSet with current_index >= len(quizzes) should raise error."""
        quiz = QuizCard(
            question_text="Q1",
            options=[
                _make_quiz_option("A", True),
                _make_quiz_option("B", False),
                _make_quiz_option("C", False),
                _make_quiz_option("D", False),
            ],
            difficulty=QuizDifficulty.MEDIUM,
        )
        with self.assertRaises(ValidationError):
            QuizSet(quizzes=[quiz], current_index=5)

    def test_quiz_set_shuffle_seed_optional(self) -> None:
        """QuizSet shuffle_seed should be optional for deterministic shuffling."""
        quiz = QuizCard(
            question_text="Q1",
            options=[
                _make_quiz_option("A", True),
                _make_quiz_option("B", False),
                _make_quiz_option("C", False),
                _make_quiz_option("D", False),
            ],
            difficulty=QuizDifficulty.MEDIUM,
        )
        # Without shuffle_seed
        quiz_set_no_seed = QuizSet(quizzes=[quiz], current_index=0)
        self.assertIsNone(quiz_set_no_seed.shuffle_seed)

        # With shuffle_seed
        quiz_set_with_seed = QuizSet(
            quizzes=[quiz], current_index=0, shuffle_seed="seed-123"
        )
        self.assertEqual(quiz_set_with_seed.shuffle_seed, "seed-123")


class TestBackwardCompatibility(unittest.TestCase):
    """Tests for backward compatibility with legacy quiz formats."""

    def test_convert_legacy_quiz_option(self) -> None:
        """Legacy option with 'id' should convert to new format."""
        legacy = {
            "id": "B",
            "text": "Legacy Option B",
            "is_correct": True,
            "explanation": "This is correct",
        }
        converted = convert_legacy_quiz_option(legacy)
        self.assertEqual(converted.display_label, "B")
        self.assertEqual(converted.text, "Legacy Option B")
        self.assertTrue(converted.is_correct)
        self.assertEqual(converted.explanation, "This is correct")
        # option_id should be a UUID derived from legacy id
        self.assertIsInstance(converted.option_id, str)
        self.assertEqual(len(converted.option_id), 36)

    def test_convert_legacy_quiz_option_deterministic(self) -> None:
        """Same legacy option should produce same option_id."""
        legacy = {
            "id": "A",
            "text": "Option A",
            "is_correct": False,
            "explanation": "Test",
        }
        converted1 = convert_legacy_quiz_option(legacy)
        converted2 = convert_legacy_quiz_option(legacy)
        self.assertEqual(converted1.option_id, converted2.option_id)

    def test_convert_legacy_quiz_card(self) -> None:
        """Legacy QuizCard should convert to new format."""
        legacy_quiz = {
            "question_text": "Legacy Question",
            "difficulty": "hard",
            "options": [
                {
                    "id": "A",
                    "text": "Option A",
                    "is_correct": True,
                    "explanation": "Correct",
                },
                {
                    "id": "B",
                    "text": "Option B",
                    "is_correct": False,
                    "explanation": "Wrong",
                },
                {
                    "id": "C",
                    "text": "Option C",
                    "is_correct": False,
                    "explanation": "Wrong",
                },
                {
                    "id": "D",
                    "text": "Option D",
                    "is_correct": False,
                    "explanation": "Wrong",
                },
            ],
        }
        from server.schemas.learning import convert_legacy_quiz_card

        converted = convert_legacy_quiz_card(legacy_quiz)
        self.assertEqual(converted.question_text, "Legacy Question")
        self.assertEqual(converted.difficulty, "hard")
        self.assertEqual(len(converted.options), 4)
        # All options should have display_labels A, B, C, D
        labels = {opt.display_label for opt in converted.options}
        self.assertEqual(labels, {"A", "B", "C", "D"})
        # Exactly one correct option
        correct_count = sum(1 for opt in converted.options if opt.is_correct)
        self.assertEqual(correct_count, 1)


class TestContractValidation(unittest.TestCase):
    """Phase 1: Contract validation tests for secure quiz randomization."""

    def test_option_identity_contract(self) -> None:
        """Verify stable option_id vs display_label contract.

        - option_id: Stable UUID used for submissions (persists across shuffles)
        - display_label: User-facing A-D label (position may change after shuffle)
        """
        opt_a = _make_quiz_option("A", True)
        opt_b = _make_quiz_option("B", False)

        # option_id must be UUID format
        self.assertEqual(len(opt_a.option_id), 36)
        self.assertEqual(len(opt_b.option_id), 36)

        # display_label must be A-D
        self.assertIn(opt_a.display_label, {"A", "B", "C", "D"})
        self.assertIn(opt_b.display_label, {"A", "B", "C", "D"})

        # option_ids must be different for different options
        self.assertNotEqual(opt_a.option_id, opt_b.option_id)

    def test_new_and_legacy_payload_compatibility(self) -> None:
        """Schemas must validate both old (single quiz) and new (quiz set) payloads."""
        # New format: QuizSet with multiple quizzes
        quiz1 = QuizCard(
            question_text="Q1",
            options=[
                _make_quiz_option("A", True),
                _make_quiz_option("B", False),
                _make_quiz_option("C", False),
                _make_quiz_option("D", False),
            ],
            difficulty=QuizDifficulty.MEDIUM,
        )
        quiz2 = QuizCard(
            question_text="Q2",
            options=[
                _make_quiz_option("A", False),
                _make_quiz_option("B", True),
                _make_quiz_option("C", False),
                _make_quiz_option("D", False),
            ],
            difficulty=QuizDifficulty.MEDIUM,
        )
        quiz_set = QuizSet(quizzes=[quiz1, quiz2], current_index=0)
        self.assertEqual(len(quiz_set.quizzes), 2)

        # Legacy format: Single quiz (backward compatible via ConceptNodeResponse)
        single_quiz = QuizCard(
            question_text="Single",
            options=[
                _make_quiz_option("A", True),
                _make_quiz_option("B", False),
                _make_quiz_option("C", False),
                _make_quiz_option("D", False),
            ],
            difficulty=QuizDifficulty.EASY,
        )
        self.assertEqual(len(single_quiz.options), 4)


if __name__ == "__main__":
    unittest.main()
