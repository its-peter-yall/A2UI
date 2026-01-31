# test_learning_schemas.py
# Unit tests for learning schema validation

# Longer description (2-4 lines):
# - Validates enum values and Pydantic model constraints.
# - Exercises quiz, planner, session, and submission payload schemas.
# - Confirms minimum list requirements and default values.

# @see: server/schemas/learning.py - Schema definitions under test
# @note: Invalid payloads should raise Pydantic ValidationError

import unittest

from pydantic import ValidationError

from server.schemas.learning import (
    ConceptNodeCreate,
    CourseOutline,
    LearningSessionCreate,
    NodeStatus,
    QuizCard,
    QuizDifficulty,
    QuizOption,
    QuizSubmission,
    TopicNode,
)


def _make_quiz_option(option_id: str, is_correct: bool) -> QuizOption:
    return QuizOption(
        id=option_id,
        text=f"Option {option_id}",
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
        expected_values = {"LOCKED", "UNLOCKED", "COMPLETED"}
        actual_values = {status.value for status in NodeStatus}
        self.assertEqual(expected_values, actual_values)


class TestQuizSchemas(unittest.TestCase):
    def test_quiz_option_valid(self) -> None:
        option = _make_quiz_option("opt-1", True)
        self.assertEqual(option.id, "opt-1")
        self.assertTrue(option.is_correct)

    def test_quiz_card_valid(self) -> None:
        options = [_make_quiz_option("opt-1", True), _make_quiz_option("opt-2", False)]
        card = QuizCard(
            question_text="What is the answer?",
            options=options,
            difficulty=QuizDifficulty.MEDIUM,
        )
        self.assertEqual(card.question_text, "What is the answer?")
        self.assertEqual(len(card.options), 2)
        self.assertEqual(card.difficulty, QuizDifficulty.MEDIUM)

    def test_quiz_card_requires_min_options(self) -> None:
        options = [_make_quiz_option("opt-1", True)]
        with self.assertRaises(ValidationError):
            QuizCard(question_text="Too few", options=options)


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


class TestQuizSubmission(unittest.TestCase):
    def test_submission_valid(self) -> None:
        submission = QuizSubmission(node_id="node-1", selected_option_id="opt-1")
        self.assertEqual(submission.node_id, "node-1")
        self.assertEqual(submission.selected_option_id, "opt-1")
