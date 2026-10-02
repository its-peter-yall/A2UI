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

import json
import unittest

from pydantic import TypeAdapter, ValidationError

from server.routers.learning import GenerateCourseRequest
from server.schemas.learning import (
    CourseOutline,
    LearningDepthMode,
    LearningSessionResponse,
    ResolvedDepthMode,
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

    def test_course_outline_allows_1_2_and_30_topics(self) -> None:
        for count in (1, 2, 30):
            with self.subTest(count=count):
                self.assertEqual(len(_outline(count).topics), count)

    def test_course_outline_rejects_0_and_31_topics(self) -> None:
        for count in (0, 31):
            with self.subTest(count=count):
                with self.assertRaises(ValidationError):
                    _outline(count)

    def test_explicit_topics_validator_accepts_1_and_2(self) -> None:
        for count in (1, 2):
            topics = [_topic(i) for i in range(count)]
            with self.subTest(count=count):
                self.assertEqual(
                    CourseOutline.validate_topics(topics), topics
                )

    def test_short_outline_still_requires_contiguous_indices(self) -> None:
        with self.assertRaises(ValidationError):
            CourseOutline(course_title="Test", topics=[_topic(1)])

    def test_validate_custom_requires_exact_requested_count(self) -> None:
        for count in (1, 2, 5, 30):
            outline = CourseOutline.model_construct(
                course_title="Test",
                topics=[_topic(i) for i in range(count)],
            )
            with self.subTest(count=count):
                self.assertTrue(
                    validate_topic_count_for_mode(
                        outline, "custom", custom_topic_count=count
                    )
                )
                different = 2 if count == 1 else 1
                self.assertFalse(
                    validate_topic_count_for_mode(
                        outline, "custom", custom_topic_count=different
                    )
                )

    def test_custom_count_helper_rejects_invalid_targets(self) -> None:
        outline = CourseOutline.model_construct(
            course_title="Test", topics=[_topic(0)]
        )
        for value in (None, True, False, 1.0, 2.5, "1", 0, -1, 31):
            with self.subTest(value=value):
                self.assertFalse(
                    validate_topic_count_for_mode(
                        outline, "custom", custom_topic_count=value
                    )
                )

    def test_lite_and_full_still_reject_short_outlines(self) -> None:
        for count in (1, 2):
            outline = CourseOutline.model_construct(
                course_title="Test",
                topics=[_topic(i) for i in range(count)],
            )
            for mode in ("lite", "full"):
                with self.subTest(count=count, mode=mode):
                    self.assertFalse(
                        validate_topic_count_for_mode(outline, mode)
                    )

    def test_non_custom_helper_rejects_custom_target(self) -> None:
        self.assertFalse(
            validate_topic_count_for_mode(
                _outline(3), "lite", custom_topic_count=3
            )
        )

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


class CustomDepthContractTests(unittest.TestCase):
    def test_depth_aliases_accept_custom(self) -> None:
        self.assertEqual(
            TypeAdapter(LearningDepthMode).validate_python("custom"),
            "custom",
        )
        self.assertEqual(
            TypeAdapter(ResolvedDepthMode).validate_python("custom"),
            "custom",
        )
        with self.assertRaises(ValidationError):
            TypeAdapter(ResolvedDepthMode).validate_python("auto")

    def test_requests_accept_exact_integer_boundaries(self) -> None:
        for count in (1, 2, 5, 30):
            data = {
                "query": "CSS",
                "mode": "custom",
                "custom_topic_count": count,
            }
            with self.subTest(count=count):
                request = GenerateCourseRequest.model_validate(data)
                from_json = GenerateCourseRequest.model_validate_json(
                    json.dumps(data)
                )
                self.assertEqual(request.mode, "custom")
                self.assertEqual(request.custom_topic_count, count)
                self.assertEqual(from_json.custom_topic_count, count)

    def test_custom_request_rejects_missing_count(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateCourseRequest.model_validate(
                {"query": "CSS", "mode": "custom"}
            )

    def test_custom_request_rejects_invalid_count_values(self) -> None:
        for value in (None, True, False, 2.5, 5.0, "5", 0, -1, 31):
            data = {
                "query": "CSS",
                "mode": "custom",
                "custom_topic_count": value,
            }
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    GenerateCourseRequest.model_validate(data)
                with self.assertRaises(ValidationError):
                    GenerateCourseRequest.model_validate_json(
                        json.dumps(data)
                    )

    def test_existing_requests_allow_missing_or_null_count(self) -> None:
        for mode in ("auto", "lite", "full"):
            for supplied in ({}, {"custom_topic_count": None}):
                with self.subTest(mode=mode, supplied=supplied):
                    request = GenerateCourseRequest.model_validate(
                        {"query": "CSS", "mode": mode, **supplied}
                    )
                    self.assertEqual(request.mode, mode)
                    self.assertIsNone(request.custom_topic_count)
        default = GenerateCourseRequest(query="CSS")
        self.assertEqual(default.mode, "auto")
        self.assertIsNone(default.custom_topic_count)

    def test_other_request_modes_reject_non_null_count(self) -> None:
        for mode in (None, "auto", "lite", "full"):
            data = {"query": "CSS", "custom_topic_count": 5}
            if mode is not None:
                data["mode"] = mode
            with self.subTest(mode=mode):
                with self.assertRaises(ValidationError):
                    GenerateCourseRequest.model_validate(data)

    def test_unknown_request_mode_remains_invalid(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateCourseRequest(query="CSS", mode="turbo")

    def test_custom_session_response_retains_requested_count(self) -> None:
        for count in (1, 2, 30):
            with self.subTest(count=count):
                response = LearningSessionResponse(
                    id="s1",
                    query="CSS",
                    course_title="CSS",
                    mode="custom",
                    resolved_mode="custom",
                    custom_topic_count=count,
                    total_nodes=0,
                )
                payload = response.model_dump(mode="json")
                self.assertEqual(payload["custom_topic_count"], count)
                self.assertEqual(payload["total_nodes"], 0)

    def test_custom_response_rejects_missing_or_invalid_count(self) -> None:
        base = {
            "id": "s1",
            "query": "CSS",
            "course_title": "CSS",
            "mode": "custom",
        }
        with self.assertRaises(ValidationError):
            LearningSessionResponse.model_validate(base)
        for value in (None, True, False, 2.5, 5.0, "5", 0, -1, 31):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    LearningSessionResponse.model_validate(
                        {**base, "custom_topic_count": value}
                    )

    def test_legacy_responses_allow_missing_or_null_count(self) -> None:
        for mode in (None, "auto", "lite", "full"):
            for supplied in ({}, {"custom_topic_count": None}):
                with self.subTest(mode=mode, supplied=supplied):
                    response = LearningSessionResponse(
                        id="old",
                        query="CSS",
                        course_title="CSS",
                        mode=mode,
                        **supplied,
                    )
                    self.assertIsNone(response.custom_topic_count)

    def test_non_custom_responses_reject_non_null_count(self) -> None:
        for mode in (None, "auto", "lite", "full"):
            with self.subTest(mode=mode):
                with self.assertRaises(ValidationError):
                    LearningSessionResponse(
                        id="s1",
                        query="CSS",
                        course_title="CSS",
                        mode=mode,
                        custom_topic_count=5,
                    )


if __name__ == "__main__":
    unittest.main()
