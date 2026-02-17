"""
=============================================================================
FILE: test_course_orchestrator.py
=============================================================================

PURPOSE:
Async unit tests for CourseOrchestrator scatter-gather orchestration flow.
Validates generate_course orchestration, _generate_concept_unit parallel
generation, partial failure handling, and regenerate_node behavior.

KEY TESTS:
- test_generate_course_scatter_gather_success: Full orchestration flow
- test_generate_concept_unit_success: Individual node generation
- test_generate_concept_unit_failure_returns_skeleton: Error handling
- test_process_gather_results_handles_failures: Result aggregation
- test_regenerate_node_success: Node regeneration flow
- test_regenerate_node_returns_none_when_missing: Missing node handling

DEPENDENCIES:
- unittest: Python standard testing framework
- unittest.mock: AsyncMock for mocking agents and DB
- types: SimpleNamespace for mock objects
- importlib: Dynamic module reloading
- server.services.course_orchestrator: CourseOrchestrator under test
- server.schemas.learning: CourseOutline, NodeStatus, TopicNode schemas

USAGE PATTERN:
```python
# Run all orchestrator tests
python -m unittest server.tests.test_course_orchestrator

# Run specific test class
python -m unittest server.tests.test_course_orchestrator.TestCourseOrchestratorGenerateCourse

# Run single test
python -m unittest server.tests.test_course_orchestrator.TestCourseOrchestratorGenerateCourse.test_generate_course_scatter_gather_success
```

TEST SETUP:
- Uses IsolatedAsyncioTestCase for async test support
- Mocks planner_agent, generator_agent, quizzer_agent, and learning_manager
- Simulates scatter-gather pattern with parallel concept generation
- No actual LLM or database calls - fully mock-based

RELATED FILES:
- server/services/course_orchestrator.py - CourseOrchestrator implementation
- server/agents/planner.py - PlannerAgent
- server/agents/generator.py - GeneratorAgent
- server/agents/quizzer.py - QuizzerAgent

NOTES:
- Scatter-gather: Plan first, then generate all concepts in parallel
- Partial failure: Failed nodes get skeleton cards, success continues
- Metrics track cards_failed and generation_ms per node
=============================================================================
"""

# test_course_orchestrator.py
# Async unit tests for CourseOrchestrator behavior

# Validates scatter-gather orchestration flow with mocked agents and DB.
# Exercises partial failure handling and regeneration behavior.
# Uses IsolatedAsyncioTestCase and AsyncMock for awaited calls.

# @see: server/services/course_orchestrator.py - Orchestrator implementation
# @note: All tests are mock-based to avoid external dependencies

import importlib
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from server.database.learning_persistence import learning_manager
from server.routers.learning import QuizSubmitRequest, submit_quiz
from server.schemas.learning import (
    CourseOutline,
    NodeStatus,
    QuizCard,
    QuizOption,
    QuizSet,
    TopicNode,
)
from server.services.course_orchestrator import CourseOrchestrator

orchestrator_module = importlib.import_module("server.services.course_orchestrator")


class _StatusValue:
    def __init__(self, value: str) -> None:
        self.value = value


class _FakeNodeStatus:
    UNLOCKED = _StatusValue("UNLOCKED")
    LOCKED = _StatusValue("LOCKED")
    COMPLETED = _StatusValue("COMPLETED")
    ERROR = _StatusValue("ERROR")
    VIEWING_EXPLANATION = _StatusValue("VIEWING_EXPLANATION")


def _make_topics(count: int = 3) -> list[TopicNode]:
    return [
        TopicNode(
            index=i,
            title=f"Topic {i}",
            summary_for_context=f"Summary {i}",
            key_terms=[f"term-{i}a", f"term-{i}b"],
        )
        for i in range(count)
    ]


def _make_outline(count: int = 5) -> CourseOutline:
    return CourseOutline(course_title="Mock Course", topics=_make_topics(count))


def _make_quiz_set(quiz_count: int) -> QuizSet:
    if quiz_count == 1:
        difficulties = ["medium"]
    elif quiz_count == 2:
        difficulties = ["easy", "hard"]
    else:
        difficulties = ["easy", "medium", "hard"]

    quizzes = []
    labels = ["A", "B", "C", "D"]
    for index in range(quiz_count):
        options = []
        for option_index, label in enumerate(labels):
            options.append(
                QuizOption(
                    option_id=f"option-{index}-{label}",
                    display_label=label,
                    text=f"Option {label} for quiz {index + 1}",
                    is_correct=option_index == 0,
                    explanation=f"Explanation {label} for quiz {index + 1}",
                )
            )
        quizzes.append(
            QuizCard(
                question_text=f"Question {index + 1} of {quiz_count}",
                options=options,
                difficulty=difficulties[min(index, len(difficulties) - 1)],
            )
        )

    return QuizSet(quizzes=quizzes, current_index=0)


class TestCourseOrchestratorGenerateCourse(unittest.IsolatedAsyncioTestCase):
    """Tests for generate_course orchestration flow."""

    async def test_generate_course_scatter_gather_success(self) -> None:
        orchestrator = CourseOrchestrator()
        outline = _make_outline(5)
        session_payload = {
            "id": "session-1",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
        node_payloads = [
            {"id": "node-0", "status": NodeStatus.LOCKED.value},
            {"id": "node-1", "status": NodeStatus.LOCKED.value},
            {"id": "node-2", "status": NodeStatus.LOCKED.value},
            {"id": "node-3", "status": NodeStatus.LOCKED.value},
            {"id": "node-4", "status": NodeStatus.LOCKED.value},
        ]
        concept_results = [
            {
                "node": node_payloads[0],
                "generation_ms": 5.0,
                "error_message": None,
            },
            {
                "node": node_payloads[1],
                "generation_ms": 7.0,
                "error_message": None,
            },
            {
                "node": node_payloads[2],
                "generation_ms": 9.0,
                "error_message": None,
            },
            {
                "node": node_payloads[3],
                "generation_ms": 11.0,
                "error_message": None,
            },
            {
                "node": node_payloads[4],
                "generation_ms": 13.0,
                "error_message": None,
            },
        ]

        with (
            patch.object(
                orchestrator_module.planner_agent,
                "plan",
                new_callable=AsyncMock,
            ) as mock_plan,
            patch.object(
                orchestrator_module.learning_manager,
                "create_learning_session",
                return_value=session_payload,
            ) as mock_create_session,
            patch.object(
                CourseOrchestrator,
                "_generate_concept_unit",
                new_callable=AsyncMock,
            ) as mock_generate,
        ):
            mock_plan.return_value = outline
            mock_generate.side_effect = concept_results

            result = await orchestrator.generate_course("Test query", user_id="user-1")

        mock_plan.assert_awaited_once_with("Test query")
        mock_create_session.assert_called_once_with(
            query="Test query",
            course_title=outline.course_title,
            user_id="user-1",
        )
        self.assertEqual(mock_generate.await_count, 5)

        first_call = mock_generate.await_args_list[0].kwargs
        self.assertEqual(first_call["prev_summary"], "Start")
        self.assertEqual(
            first_call["next_summary"], outline.topics[1].summary_for_context
        )

        last_call = mock_generate.await_args_list[-1].kwargs
        self.assertEqual(
            last_call["prev_summary"], outline.topics[-2].summary_for_context
        )
        self.assertEqual(last_call["next_summary"], "End")

        self.assertEqual(result["session"]["id"], "session-1")
        self.assertEqual(len(result["nodes"]), 5)
        self.assertEqual(result["metrics"]["cards_failed"], 0)


class TestCourseOrchestratorGenerateConceptUnit(unittest.IsolatedAsyncioTestCase):
    """Tests for _generate_concept_unit behavior."""

    async def test_generate_concept_unit_success(self) -> None:
        orchestrator = CourseOrchestrator()
        topic = _make_topics(1)[0]
        content = SimpleNamespace(content_markdown="content")
        quiz_set = Mock(quizzes=[Mock()])
        node_payload = {"id": "node-1", "status": NodeStatus.LOCKED.value}

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ) as mock_generate,
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
            patch.object(
                orchestrator_module.learning_manager,
                "create_concept_node",
                return_value=node_payload,
            ) as mock_create,
        ):
            result = await orchestrator._generate_concept_unit(
                topic=topic,
                prev_summary="Start",
                next_summary="End",
                session_id="session-1",
                sequence_index=0,
            )

        mock_generate.assert_awaited_once_with(
            topic=topic,
            prev_summary=None,
            next_summary=None,
        )
        mock_quiz.assert_awaited_once_with(
            topic=topic,
            content="content",
            quiz_count=topic.quiz_count,
        )
        mock_create.assert_called_once()
        self.assertEqual(result["node"], node_payload)
        self.assertIsNone(result["error_message"])

    async def test_generate_concept_unit_failure_returns_skeleton(self) -> None:
        orchestrator = CourseOrchestrator()
        topic = _make_topics(1)[0]
        skeleton = {"status": NodeStatus.ERROR.value, "title": topic.title}

        with (
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                side_effect=RuntimeError("boom"),
            ),
            patch.object(
                CourseOrchestrator,
                "_create_skeleton_card",
                return_value=skeleton,
            ) as mock_skeleton,
        ):
            result = await orchestrator._generate_concept_unit(
                topic=topic,
                prev_summary="Start",
                next_summary="End",
                session_id="session-1",
                sequence_index=1,
            )

        mock_skeleton.assert_called_once()
        self.assertEqual(mock_skeleton.call_args.kwargs["complexity"], topic.complexity)
        self.assertEqual(result["node"], skeleton)
        self.assertEqual(result["error_message"], "boom")


class TestCourseOrchestratorGatherResults(unittest.TestCase):
    """Tests for _process_gather_results handling."""

    def test_process_gather_results_handles_failures(self) -> None:
        orchestrator = CourseOrchestrator()
        topics = _make_topics(3)
        skeleton = {"status": NodeStatus.ERROR.value, "title": "Fallback"}

        results = [
            RuntimeError("boom"),
            {
                "node": {
                    "status": NodeStatus.ERROR.value,
                    "sequence_index": 1,
                    "title": "Topic 1",
                    "error_message": "fail",
                },
                "generation_ms": 2.0,
            },
            {"node": {"status": NodeStatus.LOCKED.value}, "generation_ms": 4.0},
            "unexpected",
        ]

        with patch.object(
            CourseOrchestrator,
            "_create_skeleton_card",
            return_value=skeleton,
        ) as mock_skeleton:
            nodes, serial_ms = orchestrator._process_gather_results(
                results=results,
                topics=topics,
                session_id="session-1",
            )

        self.assertEqual(mock_skeleton.call_count, 2)
        self.assertEqual(
            mock_skeleton.call_args_list[0].kwargs["complexity"], topics[0].complexity
        )
        self.assertEqual(
            mock_skeleton.call_args_list[1].kwargs["complexity"], "Intermediate"
        )
        self.assertEqual(len(nodes), 4)
        self.assertEqual(nodes[0], skeleton)
        self.assertEqual(nodes[3], skeleton)
        self.assertEqual(serial_ms, 6.0)

    def test_create_skeleton_card_includes_complexity(self) -> None:
        orchestrator = CourseOrchestrator()
        node_payload = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 1,
            "title": "Topic 1",
            "content_markdown": (
                "Content generation failed. Retry is available."
            ),
            "status": NodeStatus.ERROR.value,
            "error_message": "boom",
            "retry_available": True,
            "complexity": "Advanced",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "quiz": None,
        }

        with patch.object(
            orchestrator_module.learning_manager,
            "create_concept_node",
            return_value=node_payload,
        ) as mock_create:
            skeleton = orchestrator._create_skeleton_card(
                error=RuntimeError("boom"),
                session_id="session-1",
                sequence_index=1,
                title="Topic 1",
                complexity="Advanced",
            )

        self.assertEqual(mock_create.call_args.kwargs["complexity"], "Advanced")
        self.assertEqual(skeleton["complexity"], "Advanced")


class TestCourseOrchestratorRegenerateNode(unittest.IsolatedAsyncioTestCase):
    """Tests for regenerate_node behavior."""

    async def test_regenerate_node_success(self) -> None:
        orchestrator = CourseOrchestrator()
        node = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 1,
            "title": "Topic 1",
            "status": NodeStatus.ERROR.value,
            "retry_available": True,
            "quiz": {"quizzes": [{"question": "Q1"}], "current_index": 0},
        }
        previous_node = {
            "sequence_index": 0,
            "title": "Topic 0",
            "status": NodeStatus.COMPLETED.value,
        }
        next_node = {
            "sequence_index": 2,
            "title": "Topic 2",
            "status": NodeStatus.LOCKED.value,
        }
        updated_node = {"id": "node-1", "status": NodeStatus.LOCKED.value}
        connection = Mock()
        content = SimpleNamespace(content_markdown="regenerated")
        quiz_set = Mock(quizzes=[Mock()])

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value=node,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "get_session_nodes",
                return_value=[previous_node, node, next_node],
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "update_node_content",
                return_value=updated_node,
            ) as mock_update,
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ) as mock_generate,
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
        ):
            result = await orchestrator.regenerate_node("node-1")

        connection.close.assert_called_once()
        mock_generate.assert_awaited_once()
        mock_quiz.assert_awaited_once()
        quiz_kwargs = mock_quiz.await_args.kwargs
        self.assertEqual(quiz_kwargs["quiz_count"], 1)
        self.assertEqual(quiz_kwargs["content"], "regenerated")
        update_kwargs = mock_update.call_args.kwargs
        self.assertEqual(update_kwargs["node_id"], "node-1")
        self.assertEqual(update_kwargs["content_markdown"], "regenerated")
        self.assertEqual(update_kwargs["status"].value, "VIEWING_EXPLANATION")
        self.assertEqual(update_kwargs["quiz_set"], quiz_set)
        self.assertIsNone(update_kwargs["error_message"])
        self.assertFalse(update_kwargs["retry_available"])
        self.assertEqual(result["id"], "node-1")
        self.assertTrue(result["regenerated"])


class TestMultiQuizMasteryIntegration(unittest.TestCase):
    """Integration tests for multi-quiz mastery and progression behavior."""

    def test_mastery_requires_all_quizzes_passed(self) -> None:
        quiz_set = _make_quiz_set(3)
        connection = Mock()
        cursor = Mock()
        connection.cursor.return_value = cursor
        cursor.fetchall.side_effect = [
            [{"quiz_index": 0}, {"quiz_index": 1}],
            [{"quiz_index": 0}, {"quiz_index": 1}, {"quiz_index": 2}],
        ]

        with (
            patch.object(
                learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                learning_manager,
                "get_quiz_set_for_node",
                return_value={"quiz_set": quiz_set},
            ),
        ):
            first_check = learning_manager.check_mastery("node-1")
            second_check = learning_manager.check_mastery("node-1")

        connection.close.assert_called()
        self.assertFalse(first_check)
        self.assertTrue(second_check)

    def test_sequential_enforcement_via_current_index(self) -> None:
        fake_conn = Mock()
        fake_manager = Mock()
        fake_manager._get_connection.return_value = fake_conn
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 0,
            "status": "IN_QUIZ",
        }
        fake_manager.create_quiz_attempt.side_effect = [
            {
                "id": "attempt-1",
                "node_id": "node-1",
                "attempt_number": 1,
                "quiz_index": 0,
                "selected_option_id": "option-a",
                "is_correct": True,
                "score_percent": 100,
                "correct_option_id": "option-a",
                "explanation": "Correct",
                "is_mastered": False,
                "created_at": "2026-02-15T00:00:00+00:00",
                "updated_at": "2026-02-15T00:00:00+00:00",
            },
            {
                "id": "attempt-2",
                "node_id": "node-1",
                "attempt_number": 2,
                "quiz_index": 1,
                "selected_option_id": "option-b",
                "is_correct": False,
                "score_percent": 0,
                "correct_option_id": "option-a",
                "explanation": "Incorrect",
                "is_mastered": False,
                "created_at": "2026-02-15T00:00:00+00:00",
                "updated_at": "2026-02-15T00:00:00+00:00",
            },
        ]
        quiz_set = Mock()
        quiz_set.quizzes = [object(), object(), object()]
        fake_manager.get_quiz_set_for_node.return_value = {"quiz_set": quiz_set}

        with patch("server.routers.learning.learning_manager", fake_manager):
            submit_quiz(
                "node-1",
                QuizSubmitRequest(selected_option_id="option-a", quiz_index=0),
            )
            submit_quiz(
                "node-1",
                QuizSubmitRequest(selected_option_id="option-b", quiz_index=1),
            )

        fake_manager.update_quiz_set_progress.assert_called_once_with(
            node_id="node-1", current_index=1
        )

    def test_retry_targets_only_failed_quiz(self) -> None:
        fake_conn = Mock()
        fake_manager = Mock()
        fake_manager._get_connection.return_value = fake_conn
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 0,
            "status": "IN_QUIZ",
        }
        fake_manager.create_quiz_attempt.side_effect = [
            {
                "id": "attempt-1",
                "node_id": "node-1",
                "attempt_number": 2,
                "quiz_index": 1,
                "selected_option_id": "option-wrong",
                "is_correct": False,
                "score_percent": 0,
                "correct_option_id": "option-a",
                "explanation": "Incorrect",
                "is_mastered": False,
                "created_at": "2026-02-15T00:00:00+00:00",
                "updated_at": "2026-02-15T00:00:00+00:00",
            },
            {
                "id": "attempt-2",
                "node_id": "node-1",
                "attempt_number": 3,
                "quiz_index": 1,
                "selected_option_id": "option-a",
                "is_correct": True,
                "score_percent": 100,
                "correct_option_id": "option-a",
                "explanation": "Correct",
                "is_mastered": False,
                "created_at": "2026-02-15T00:00:00+00:00",
                "updated_at": "2026-02-15T00:00:00+00:00",
            },
        ]
        quiz_set = Mock()
        quiz_set.quizzes = [object(), object(), object()]
        fake_manager.get_quiz_set_for_node.return_value = {"quiz_set": quiz_set}

        with patch("server.routers.learning.learning_manager", fake_manager):
            submit_quiz(
                "node-1",
                QuizSubmitRequest(selected_option_id="option-wrong", quiz_index=1),
            )
            submit_quiz(
                "node-1",
                QuizSubmitRequest(selected_option_id="option-a", quiz_index=1),
            )

        fake_manager.update_quiz_set_progress.assert_called_once_with(
            node_id="node-1", current_index=2
        )


class TestCourseOrchestratorQuizSetWiring(unittest.IsolatedAsyncioTestCase):
    """Tests for quiz set wiring and quiz_count passthrough."""

    async def test_generate_concept_unit_passes_quiz_count_from_topic(
        self,
    ) -> None:
        orchestrator = CourseOrchestrator()
        topic = TopicNode(
            index=0,
            title="Topic 0",
            summary_for_context="Summary 0",
            key_terms=["term-a", "term-b"],
            quiz_count=3,
        )
        content = SimpleNamespace(content_markdown="content")
        quiz_set = Mock(quizzes=[Mock(), Mock(), Mock()])
        node_payload = {"id": "node-1", "status": NodeStatus.LOCKED.value}

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ) as mock_generate,
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
            patch.object(
                orchestrator_module.learning_manager,
                "create_concept_node",
                return_value=node_payload,
            ) as mock_create,
        ):
            await orchestrator._generate_concept_unit(
                topic=topic,
                prev_summary="Start",
                next_summary="End",
                session_id="session-1",
                sequence_index=0,
            )

        mock_generate.assert_awaited_once()
        mock_quiz.assert_awaited_once_with(
            topic=topic,
            content="content",
            quiz_count=3,
        )
        create_kwargs = mock_create.call_args.kwargs
        self.assertEqual(create_kwargs["quiz_set"], quiz_set)

    async def test_regenerate_node_extracts_quiz_count_from_payload(
        self,
    ) -> None:
        orchestrator = CourseOrchestrator()
        node = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 1,
            "title": "Topic 1",
            "status": NodeStatus.ERROR.value,
            "retry_available": True,
            "quiz": {
                "quizzes": [{"q": 1}, {"q": 2}, {"q": 3}],
                "current_index": 0,
            },
        }
        previous_node = {
            "sequence_index": 0,
            "title": "Topic 0",
            "status": NodeStatus.COMPLETED.value,
        }
        next_node = {
            "sequence_index": 2,
            "title": "Topic 2",
            "status": NodeStatus.LOCKED.value,
        }
        updated_node = {"id": "node-1", "status": NodeStatus.LOCKED.value}
        connection = Mock()
        content = SimpleNamespace(content_markdown="regenerated")
        quiz_set = Mock(quizzes=[Mock(), Mock(), Mock()])

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value=node,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "get_session_nodes",
                return_value=[previous_node, node, next_node],
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "update_node_content",
                return_value=updated_node,
            ),
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ),
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
        ):
            await orchestrator.regenerate_node("node-1")

        mock_quiz.assert_awaited_once()
        quiz_kwargs = mock_quiz.await_args.kwargs
        self.assertEqual(quiz_kwargs["quiz_count"], 3)
        self.assertEqual(quiz_kwargs["content"], "regenerated")

    async def test_regenerate_node_defaults_quiz_count_for_legacy_node(
        self,
    ) -> None:
        orchestrator = CourseOrchestrator()
        node = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 1,
            "title": "Topic 1",
            "status": NodeStatus.ERROR.value,
            "retry_available": True,
            "quiz": {
                "question": "Q1",
                "options": ["A", "B", "C", "D"],
            },
        }
        previous_node = {
            "sequence_index": 0,
            "title": "Topic 0",
            "status": NodeStatus.COMPLETED.value,
        }
        next_node = {
            "sequence_index": 2,
            "title": "Topic 2",
            "status": NodeStatus.LOCKED.value,
        }
        updated_node = {"id": "node-1", "status": NodeStatus.LOCKED.value}
        connection = Mock()
        content = SimpleNamespace(content_markdown="regenerated")
        quiz_set = Mock(quizzes=[Mock()])

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value=node,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "get_session_nodes",
                return_value=[previous_node, node, next_node],
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "update_node_content",
                return_value=updated_node,
            ),
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ),
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
        ):
            await orchestrator.regenerate_node("node-1")

        mock_quiz.assert_awaited_once()
        quiz_kwargs = mock_quiz.await_args.kwargs
        self.assertEqual(quiz_kwargs["quiz_count"], 1)
        self.assertEqual(quiz_kwargs["content"], "regenerated")


class TestRegenerateWithQuizSet(unittest.IsolatedAsyncioTestCase):
    """Integration tests for regeneration quiz_count preservation."""

    async def test_regenerate_multi_quiz_node_preserves_quiz_count(self) -> None:
        orchestrator = CourseOrchestrator()
        node = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 1,
            "title": "Topic 1",
            "status": NodeStatus.ERROR.value,
            "retry_available": True,
            "quiz": {
                "quizzes": [
                    {"question": "Q1", "difficulty": "easy"},
                    {"question": "Q2", "difficulty": "medium"},
                    {"question": "Q3", "difficulty": "hard"},
                ],
                "current_index": 0,
            },
        }
        previous_node = {
            "sequence_index": 0,
            "title": "Topic 0",
            "status": NodeStatus.COMPLETED.value,
        }
        next_node = {
            "sequence_index": 2,
            "title": "Topic 2",
            "status": NodeStatus.LOCKED.value,
        }
        updated_node = {"id": "node-1", "status": NodeStatus.LOCKED.value}
        connection = Mock()
        content = SimpleNamespace(content_markdown="regenerated")
        quiz_set = Mock(quizzes=[Mock(), Mock(), Mock()])

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value=node,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "get_session_nodes",
                return_value=[previous_node, node, next_node],
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "update_node_content",
                return_value=updated_node,
            ) as mock_update,
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ),
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
        ):
            await orchestrator.regenerate_node("node-1")

        mock_quiz.assert_awaited_once()
        quiz_kwargs = mock_quiz.await_args.kwargs
        self.assertEqual(quiz_kwargs["quiz_count"], 3)
        update_kwargs = mock_update.call_args.kwargs
        self.assertEqual(update_kwargs["quiz_set"], quiz_set)
        self.assertNotIn("quiz", update_kwargs)

    async def test_regenerate_legacy_single_quiz_node_defaults_to_one(self) -> None:
        orchestrator = CourseOrchestrator()
        node = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 1,
            "title": "Topic 1",
            "status": NodeStatus.ERROR.value,
            "retry_available": True,
            "quiz": {
                "question": "Legacy Q",
                "options": ["A", "B", "C", "D"],
                "correct_option_id": "A",
            },
        }
        previous_node = {
            "sequence_index": 0,
            "title": "Topic 0",
            "status": NodeStatus.COMPLETED.value,
        }
        next_node = {
            "sequence_index": 2,
            "title": "Topic 2",
            "status": NodeStatus.LOCKED.value,
        }
        updated_node = {"id": "node-1", "status": NodeStatus.LOCKED.value}
        connection = Mock()
        content = SimpleNamespace(content_markdown="regenerated")
        quiz_set = Mock(quizzes=[Mock()])

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value=node,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "get_session_nodes",
                return_value=[previous_node, node, next_node],
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "update_node_content",
                return_value=updated_node,
            ) as mock_update,
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ),
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
        ):
            await orchestrator.regenerate_node("node-1")

        mock_quiz.assert_awaited_once()
        quiz_kwargs = mock_quiz.await_args.kwargs
        self.assertEqual(quiz_kwargs["quiz_count"], 1)
        update_kwargs = mock_update.call_args.kwargs
        self.assertEqual(update_kwargs["quiz_set"], quiz_set)

    async def test_regenerate_node_with_no_quiz_data_defaults_to_one(self) -> None:
        orchestrator = CourseOrchestrator()
        node = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "sequence_index": 1,
            "title": "Topic 1",
            "status": NodeStatus.ERROR.value,
            "retry_available": True,
            "quiz": None,
        }
        previous_node = {
            "sequence_index": 0,
            "title": "Topic 0",
            "status": NodeStatus.COMPLETED.value,
        }
        next_node = {
            "sequence_index": 2,
            "title": "Topic 2",
            "status": NodeStatus.LOCKED.value,
        }
        updated_node = {"id": "node-1", "status": NodeStatus.LOCKED.value}
        connection = Mock()
        content = SimpleNamespace(content_markdown="regenerated")
        quiz_set = Mock(quizzes=[Mock()])

        with (
            patch.object(
                orchestrator_module,
                "NodeStatus",
                _FakeNodeStatus,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value=node,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "get_session_nodes",
                return_value=[previous_node, node, next_node],
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "update_node_content",
                return_value=updated_node,
            ) as mock_update,
            patch.object(
                orchestrator_module.generator_agent,
                "generate_explanation",
                new_callable=AsyncMock,
                return_value=content,
            ),
            patch.object(
                orchestrator_module.quizzer_agent,
                "generate_quiz_set",
                new_callable=AsyncMock,
                return_value=quiz_set,
            ) as mock_quiz,
        ):
            await orchestrator.regenerate_node("node-1")

        mock_quiz.assert_awaited_once()
        quiz_kwargs = mock_quiz.await_args.kwargs
        self.assertEqual(quiz_kwargs["quiz_count"], 1)
        update_kwargs = mock_update.call_args.kwargs
        self.assertEqual(update_kwargs["quiz_set"], quiz_set)


class TestCourseOrchestratorValidation(unittest.IsolatedAsyncioTestCase):
    """Tests for complexity distribution validation wiring."""

    async def test_generate_course_calls_validate_complexity_distribution(
        self,
    ) -> None:
        orchestrator = CourseOrchestrator()
        outline = _make_outline(5)
        session_payload = {
            "id": "session-1",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
        node_payloads = [
            {"id": "node-0", "status": NodeStatus.LOCKED.value},
            {"id": "node-1", "status": NodeStatus.LOCKED.value},
            {"id": "node-2", "status": NodeStatus.LOCKED.value},
            {"id": "node-3", "status": NodeStatus.LOCKED.value},
            {"id": "node-4", "status": NodeStatus.LOCKED.value},
        ]
        concept_results = [
            {"node": node_payloads[0], "generation_ms": 5.0, "error_message": None},
            {"node": node_payloads[1], "generation_ms": 7.0, "error_message": None},
            {"node": node_payloads[2], "generation_ms": 9.0, "error_message": None},
            {"node": node_payloads[3], "generation_ms": 11.0, "error_message": None},
            {"node": node_payloads[4], "generation_ms": 13.0, "error_message": None},
        ]

        with (
            patch.object(
                orchestrator_module.planner_agent,
                "plan",
                new_callable=AsyncMock,
                return_value=outline,
            ) as mock_plan,
            patch.object(
                orchestrator_module,
                "validate_complexity_distribution",
                return_value={
                    "valid": True,
                    "warnings": [],
                    "errors": [],
                    "distribution": {},
                },
            ) as mock_validate,
            patch.object(
                orchestrator_module.learning_manager,
                "create_learning_session",
                return_value=session_payload,
            ),
            patch.object(
                CourseOrchestrator,
                "_generate_concept_unit",
                new_callable=AsyncMock,
                side_effect=concept_results,
            ),
        ):
            await orchestrator.generate_course("Test query", user_id="user-1")

        mock_plan.assert_awaited_once_with("Test query")
        mock_validate.assert_called_once_with(outline)

    async def test_regenerate_node_returns_none_when_missing(self) -> None:
        orchestrator = CourseOrchestrator()
        connection = Mock()

        with (
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value=None,
            ),
        ):
            result = await orchestrator.regenerate_node("missing")

        self.assertIsNone(result)

    async def test_regenerate_node_returns_none_when_not_retryable(self) -> None:
        orchestrator = CourseOrchestrator()
        connection = Mock()

        with (
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value={
                    "id": "node-1",
                    "status": NodeStatus.ERROR.value,
                    "retry_available": False,
                },
            ),
        ):
            result = await orchestrator.regenerate_node("node-1")

        self.assertIsNone(result)

    async def test_regenerate_node_returns_none_when_not_error_status(self) -> None:
        orchestrator = CourseOrchestrator()
        connection = Mock()

        with (
            patch.object(
                orchestrator_module.learning_manager,
                "_get_connection",
                return_value=connection,
            ),
            patch.object(
                orchestrator_module.learning_manager,
                "_get_node_by_id",
                return_value={
                    "id": "node-1",
                    "status": NodeStatus.LOCKED.value,
                    "retry_available": True,
                },
            ),
        ):
            result = await orchestrator.regenerate_node("node-1")

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
