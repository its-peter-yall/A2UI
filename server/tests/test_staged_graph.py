"""
============================================================================
FILE: test_staged_graph.py
LOCATION: server/tests/test_staged_graph.py
============================================================================
PURPOSE:
    Tests optional research, TOC-first persistence, exact batches, and barriers.
ROLE IN PROJECT:
    Guards permanent staged LangGraph topology and preview priority.
KEY COMPONENTS:
    - StagedGraphTests: Web routing, batch order, fan-out barrier tests
DEPENDENCIES:
    - External: unittest, unittest.mock
    - Internal: server.graph build and nodes
USAGE:
    python -m unittest server.tests.test_staged_graph -v
============================================================================
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from server.database.generation_artifacts import GenerationArtifactStore
from server.database.generation_jobs import GenerationJobStore
from server.database.generation_migrations import initialize_generation_schema
from server.database.learning_persistence import LearningManager
from server.database.progress_events import ProgressEventStore
from server.graph import nodes
from server.graph.build import build_graph
from server.graph.nodes import fan_out_generators, select_topic_batch
from server.graph.runner import run_generation_job
from server.schemas.generation import GenerationStage, GenerationWarning
from server.schemas.learning import CourseOutline, TopicNode
from server.schemas.llm import LLMContext
from server.schemas.progress import ProgressEventType
from server.schemas.search import SearchContext


def _custom_outline(count: int) -> CourseOutline:
    return CourseOutline(
        course_title="Custom Course",
        topics=[
            TopicNode(
                index=index, title=f"Topic {index}",
                summary_for_context=f"Summary {index}",
                key_terms=["term-a", "term-b"],
                complexity="Basic", quiz_count=1,
            )
            for index in range(count)
        ],
    )


class StagedGraphTests(unittest.IsolatedAsyncioTestCase):
    """Tests staged graph route and batch orchestration."""

    @patch("server.graph.nodes.generation_job_store")
    def test_append_job_warning_uses_repository(self, jobs) -> None:
        warning = GenerationWarning(code="slow", message="Provider slow")
        nodes._append_job_warning("s1", warning)
        jobs.append_warning.assert_called_once_with("s1", warning)

    @patch("server.graph.nodes.generation_job_store")
    def test_bump_job_counts_uses_repository(self, jobs) -> None:
        nodes._bump_job_counts("s1", sources=2)
        jobs.bump_counts.assert_called_once_with("s1", sources=2)

    async def test_custom_initialize_skips_depth_resolver(self) -> None:
        jobs = MagicMock()
        jobs.is_cancel_requested.return_value = False
        with (
            patch("server.graph.nodes.generation_job_store", jobs),
            patch("server.graph.nodes.learning_manager") as learning,
            patch("server.graph.nodes.progress_event_store"),
            patch(
                "server.graph.nodes.resolve_depth_mode",
                new_callable=AsyncMock,
            ) as resolve,
        ):
            result = await nodes.initialize_generation_node(
                {
                    "session_id": "s1",
                    "query": "Topic",
                    "mode": "custom",
                    "custom_topic_count": 2,
                },
                runtime={
                    "llm_context": LLMContext(api_key="k", model="m"),
                    "search_context": SearchContext(),
                },
            )
        self.assertEqual(result["resolved_mode"], "custom")
        resolve.assert_not_called()
        learning.update_session_resolved_mode.assert_called_once_with(
            "s1", "custom"
        )

    async def test_outline_node_passes_custom_requested_count(self) -> None:
        jobs = MagicMock()
        jobs.is_cancel_requested.return_value = False
        jobs.get_by_session.return_value = None
        llm = LLMContext(api_key="k", model="m")
        with (
            patch("server.graph.nodes.generation_job_store", jobs),
            patch("server.graph.nodes.generation_artifact_store") as artifacts,
            patch("server.graph.nodes.progress_event_store"),
            patch("server.graph.nodes.planner_agent.plan",
                  new_callable=AsyncMock) as plan,
        ):
            expected = _custom_outline(2)
            plan.return_value = expected
            result = await nodes.outline_planner_node(
                {
                    "session_id": "s1", "query": "Topic",
                    "resolved_mode": "custom", "custom_topic_count": 2,
                }, runtime={"llm_context": llm},
            )
            self.assertEqual(plan.await_args.kwargs["custom_topic_count"], 2)
            self.assertEqual(plan.await_args.kwargs["mode"], "custom")
            self.assertEqual(result["topic_count"], 2)
            artifacts.persist_outline.assert_called_once_with("s1", expected)

    async def test_second_count_mismatch_is_durably_failed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "a2ui.db"
            learning = LearningManager(db_path)
            learning.init_learning_tables()
            initialize_generation_schema(db_path)
            jobs = GenerationJobStore(db_path)
            events = ProgressEventStore(db_path)
            artifacts = GenerationArtifactStore(db_path)
            session, _ = jobs.create_session_shell_and_job(
                query="Topic", user_id=None, mode="custom",
                custom_topic_count=7, web_search_requested=False,
            )
            graph = build_graph()
            with (
                patch("server.graph.runner.learning_manager", learning),
                patch("server.graph.nodes.learning_manager", learning),
                patch("server.graph.nodes.generation_job_store", jobs),
                patch(
                    "server.graph.nodes.generation_artifact_store", artifacts
                ),
                patch("server.graph.nodes.progress_event_store", events),
                patch.object(
                    nodes.planner_agent, "generate", new_callable=AsyncMock
                ) as generate,
                patch("server.graph.nodes.planner_agent.plan_briefs",
                      new_callable=AsyncMock) as briefs,
            ):
                generate.side_effect = [_custom_outline(6), _custom_outline(8)]
                await run_generation_job(
                    app_state=SimpleNamespace(course_graph=graph),
                    session_id=session["id"], job_store=jobs,
                    event_store=events,
                    llm_context=LLMContext(api_key="k", model="m"),
                    search_context=SearchContext(),
                )
            self.assertEqual(generate.await_count, 2)
            briefs.assert_not_called()
            stored = jobs.get_by_session(session["id"])
            self.assertEqual(stored.stage, GenerationStage.FAILED)
            self.assertIsNone(stored.lock_owner)
            self.assertEqual(artifacts.count_topics(session["id"]), 0)
            self.assertEqual(learning.get_session_nodes(session["id"]), [])
            emitted = events.list_after(session["id"], 0)
            self.assertTrue(any(
                event.event_type == ProgressEventType.STAGE_CHANGED
                and event.payload.model_dump(mode="json").get("stage")
                == GenerationStage.FAILED.value
                for event in emitted
            ))
            self.assertFalse(any(
                event.event_type == ProgressEventType.OUTLINE_READY
                for event in emitted
            ))

    async def test_custom_reuses_optional_research_stage(self) -> None:
        choices = ((False, None), (True, None), (True, "saved"))
        for enabled, report_id in choices:
            with self.subTest(enabled=enabled, report_id=report_id):
                calls = []
                jobs = MagicMock()
                jobs.is_cancel_requested.return_value = False
                jobs.get_by_session.return_value = None
                research_store = MagicMock()
                research_store.get_report_context.return_value = "Evidence"

                async def research(**kwargs):
                    calls.append("research")
                    return "new-report", False

                async def plan(**kwargs):
                    calls.append("outline")
                    self.assertEqual(kwargs["mode"], "custom")
                    self.assertEqual(kwargs["custom_topic_count"], 2)
                    return _custom_outline(2)

                graph = build_graph(node_overrides={
                    "plan_brief_batch_node": AsyncMock(return_value={
                        "active_batch_start": 0, "active_batch_size": 2,
                    }),
                    "generator_node": AsyncMock(return_value={}),
                    "prepare_quiz_batch_node": AsyncMock(return_value={}),
                    "quizzer_node": AsyncMock(return_value={}),
                    "advance_batch_node": AsyncMock(return_value={
                        "next_topic_index": 2,
                    }),
                    "finalize_generation_node": AsyncMock(return_value={}),
                })
                with (
                    patch("server.graph.nodes.generation_job_store", jobs),
                    patch("server.graph.nodes.learning_manager"),
                    patch("server.graph.nodes.generation_artifact_store"),
                    patch("server.graph.nodes.progress_event_store"),
                    patch("server.graph.nodes.research_store", research_store),
                    patch("server.graph.nodes.run_research",
                          new=AsyncMock(side_effect=research)) as run_research,
                    patch("server.graph.nodes.planner_agent.plan",
                          new=AsyncMock(side_effect=plan)) as planner,
                    patch("server.graph.nodes.resolve_depth_mode",
                          new_callable=AsyncMock) as resolve,
                ):
                    result = await graph.ainvoke({
                        "job_id": "j1", "session_id": "s1", "query": "Topic",
                        "user_id": None, "mode": "custom",
                        "custom_topic_count": 2, "web_search_enabled": enabled,
                        "research_report_id": report_id,
                        "next_topic_index": 0, "generator_results": [],
                        "topic_results": [], "degraded": False,
                    }, context={
                        "llm_context": LLMContext(api_key="k", model="m"),
                        "search_context": SearchContext(enabled=enabled),
                        "worker_id": "w1",
                    })
                resolve.assert_not_called()
                planner.assert_awaited_once()
                self.assertEqual(result["custom_topic_count"], 2)
                if enabled and report_id is None:
                    run_research.assert_awaited_once()
                    self.assertEqual(calls, ["research", "outline"])
                    self.assertEqual(result["research_report_id"], "new-report")
                else:
                    run_research.assert_not_called()
                    self.assertEqual(calls, ["outline"])
                expected_context = "Evidence" if enabled else None
                self.assertEqual(
                    planner.await_args.kwargs["research_context"],
                    expected_context,
                )

    async def test_web_off_skips_research_and_runs_three_then_ten(self) -> None:
        calls: list[str] = []
        jobs = MagicMock()
        jobs.is_cancel_requested.return_value = False
        artifacts = MagicMock()
        artifacts.count_topics.return_value = 13

        async def initialize(state, runtime):
            calls.append("initialize")
            return {"resolved_mode": "full", "web_search_enabled": False}

        async def outline(state, runtime):
            calls.append("outline")
            return {"topic_count": 13, "next_topic_index": 0}

        async def plan_batch(state, runtime):
            batch = select_topic_batch(state["next_topic_index"], 13)
            calls.append(f"plan:{batch.start}:{batch.size}")
            return {
                "active_batch_start": batch.start,
                "active_batch_size": batch.size,
            }

        async def generator(state, runtime):
            return {
                "generator_results": [
                    {
                        "batch_start": state["batch_start"],
                        "sequence_index": state["sequence_index"],
                        "content_ready": True,
                        "error_message": None,
                    }
                ]
            }

        async def quizzer(state, runtime):
            return {
                "topic_results": [
                    {
                        "batch_start": state["batch_start"],
                        "sequence_index": state["sequence_index"],
                        "terminal_status": "READY",
                        "error_message": None,
                    }
                ]
            }

        async def advance(state, runtime):
            start = state["active_batch_start"]
            size = state["active_batch_size"]
            calls.append(f"advance:{start}:{size}")
            return {"next_topic_index": start + size}

        graph = build_graph(
            node_overrides={
                "initialize_generation_node": initialize,
                "outline_planner_node": outline,
                "plan_brief_batch_node": plan_batch,
                "generator_node": generator,
                "quizzer_node": quizzer,
                "advance_batch_node": advance,
            }
        )
        with (
            patch("server.graph.nodes.generation_artifact_store", artifacts),
            patch("server.graph.nodes.generation_job_store", jobs),
            patch("server.graph.nodes.progress_event_store", MagicMock()),
        ):
            result = await graph.ainvoke(
                {
                    "job_id": "job-1",
                    "session_id": "session-1",
                    "query": "Topic",
                    "user_id": None,
                    "mode": "full",
                    "next_topic_index": 0,
                    "generator_results": [],
                    "topic_results": [],
                    "degraded": False,
                },
                config={"max_concurrency": 3},
                context={
                    "llm_context": LLMContext(
                        api_key="llm-key",
                        model="test/model",
                    ),
                    "search_context": SearchContext(),
                    "worker_id": "worker-1",
                },
            )
        self.assertEqual(result["next_topic_index"], 13)
        self.assertNotIn("research", calls)
        self.assertEqual(
            [call for call in calls if call.startswith("plan:")],
            ["plan:0:3", "plan:3:10"],
        )
        self.assertEqual(
            [call for call in calls if call.startswith("advance:")],
            ["advance:0:3", "advance:3:10"],
        )

    def test_generator_send_payload_contains_only_artifact_references(self) -> None:
        state = {
            "job_id": "job-1",
            "session_id": "session-1",
            "active_batch_start": 3,
            "active_batch_size": 2,
        }
        sends = fan_out_generators(state)
        self.assertEqual(len(sends), 2)
        self.assertEqual(
            set(sends[0].arg.keys()),
            {"job_id", "session_id", "batch_start", "sequence_index"},
        )
        self.assertNotIn("content_markdown", repr(sends))
        self.assertNotIn("source_excerpts", repr(sends))

    async def test_web_on_runs_research_before_outline(self) -> None:
        calls: list[str] = []

        async def fake_research(**kwargs: object) -> tuple[str, bool]:
            calls.append("research")
            return ("report-1", False)

        async def fake_plan(*args: object, **kwargs: object) -> CourseOutline:
            calls.append("outline")
            return CourseOutline(
                course_title="Test Course",
                topics=[
                    TopicNode(
                        index=0,
                        title="T0",
                        summary_for_context="S0",
                        key_terms=["t0a", "t0b"],
                    ),
                    TopicNode(
                        index=1,
                        title="T1",
                        summary_for_context="S1",
                        key_terms=["t1a", "t1b"],
                    ),
                    TopicNode(
                        index=2,
                        title="T2",
                        summary_for_context="S2",
                        key_terms=["t2a", "t2b"],
                    ),
                ],
            )

        graph = build_graph(
            node_overrides={
                "plan_brief_batch_node": AsyncMock(return_value={"active_batch_start": 0, "active_batch_size": 3}),
                "generator_node": AsyncMock(return_value={"generator_results": []}),
                "quizzer_node": AsyncMock(return_value={"topic_results": []}),
                "advance_batch_node": AsyncMock(return_value={"next_topic_index": 3}),
                "finalize_generation_node": AsyncMock(return_value={}),
            }
        )
        jobs = MagicMock()
        jobs.is_cancel_requested.return_value = False
        jobs.get_by_session.return_value = None
        artifacts = MagicMock()
        events = MagicMock()
        with (
            patch("server.graph.nodes.run_research", new=AsyncMock(side_effect=fake_research)),
            patch("server.graph.nodes.planner_agent.plan", new=AsyncMock(side_effect=fake_plan)),
            patch("server.graph.nodes.generation_job_store", jobs),
            patch("server.graph.nodes.generation_artifact_store", artifacts),
            patch("server.graph.nodes.progress_event_store", events),
            patch("server.graph.nodes.research_store", MagicMock()),
        ):
            await graph.ainvoke(
                {
                    "job_id": "job-1",
                    "session_id": "session-1",
                    "query": "Topic",
                    "user_id": None,
                    "mode": "lite",
                    "web_search_enabled": True,
                    "next_topic_index": 0,
                    "generator_results": [],
                    "topic_results": [],
                    "degraded": False,
                },
                context={
                    "llm_context": LLMContext(
                        api_key="llm-key",
                        model="test/model",
                    ),
                    "search_context": SearchContext(),
                    "worker_id": "worker-1",
                },
            )
        self.assertIn("research", calls)
        self.assertIn("outline", calls)
        self.assertLess(calls.index("research"), calls.index("outline"))


if __name__ == "__main__":
    unittest.main()
