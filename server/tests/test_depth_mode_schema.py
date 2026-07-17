"""
============================================================================
FILE: test_depth_mode_schema.py
LOCATION: server/tests/test_depth_mode_schema.py
============================================================================
PURPOSE:
    Contract tests for depth mode types, CourseOutline min topics, and
    topic-count bounds helper.
ROLE IN PROJECT:
    TDD guard for auto/lite/full learning depth schema contracts.
    - CourseOutline min 3 / max 30
    - validate_topic_count_for_mode bounds
    - LearningSessionResponse mode fields
DEPENDENCIES:
    - External: unittest, pydantic
    - Internal: server.schemas.learning
USAGE:
    python -m unittest server.tests.test_depth_mode_schema -v
============================================================================
"""
from __future__ import annotations

import unittest

from pydantic import ValidationError

from server.schemas.learning import (
    CourseOutline,
    LearningSessionResponse,
    TopicNode,
    validate_topic_count_for_mode,
)


def _topic(index: int) -> TopicNode:
    return TopicNode(
        index=index,
        title=f"Topic {index}",
        summary_for_context=f"Summary {index}",
        key_terms=["term-a", "term-b"],
        complexity="Basic",
        quiz_count=1,
    )


def _outline(n: int) -> CourseOutline:
    return CourseOutline(
        course_title="Test",
        topics=[_topic(i) for i in range(n)],
    )


class DepthModeSchemaTests(unittest.TestCase):
    def test_course_outline_allows_3_topics(self) -> None:
        outline = _outline(3)
        self.assertEqual(len(outline.topics), 3)

    def test_course_outline_rejects_2_topics(self) -> None:
        with self.assertRaises(ValidationError):
            _outline(2)

    def test_validate_lite_accepts_3_and_10(self) -> None:
        self.assertTrue(validate_topic_count_for_mode(_outline(3), "lite"))
        self.assertTrue(validate_topic_count_for_mode(_outline(10), "lite"))

    def test_validate_full_accepts_10_and_30(self) -> None:
        self.assertTrue(validate_topic_count_for_mode(_outline(10), "full"))
        self.assertTrue(validate_topic_count_for_mode(_outline(30), "full"))

    def test_validate_lite_rejects_11(self) -> None:
        outline = CourseOutline.model_construct(
            course_title="Test",
            topics=[_topic(i) for i in range(11)],
        )
        self.assertFalse(validate_topic_count_for_mode(outline, "lite"))

    def test_validate_full_rejects_9_and_31(self) -> None:
        self.assertFalse(validate_topic_count_for_mode(_outline(9), "full"))
        outline_31 = CourseOutline.model_construct(
            course_title="Test",
            topics=[_topic(i) for i in range(31)],
        )
        self.assertFalse(validate_topic_count_for_mode(outline_31, "full"))

    def test_boundary_10_valid_both_modes(self) -> None:
        outline = _outline(10)
        self.assertTrue(validate_topic_count_for_mode(outline, "lite"))
        self.assertTrue(validate_topic_count_for_mode(outline, "full"))

    def test_session_response_accepts_mode_fields(self) -> None:
        session = LearningSessionResponse(
            id="s1",
            query="learn python",
            course_title="Python Basics",
            mode="auto",
            resolved_mode="lite",
        )
        self.assertEqual(session.mode, "auto")
        self.assertEqual(session.resolved_mode, "lite")


if __name__ == "__main__":
    unittest.main()
