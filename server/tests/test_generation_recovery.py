"""
============================================================================
FILE: test_generation_recovery.py
LOCATION: server/tests/test_generation_recovery.py
============================================================================
PURPOSE:
    Tests stable threads, execution locks, cancellation, pause, and resume.
ROLE IN PROJECT:
    Protects durable generation against duplicate workers and lost credentials.
KEY COMPONENTS:
    - GenerationRunnerTests: New/resume invoke and secret-boundary tests
DEPENDENCIES:
    - External: unittest, unittest.mock
    - Internal: server.graph.runner and runtime schemas
USAGE:
    python -m unittest server.tests.test_generation_recovery -v
============================================================================
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from server.database.checkpoint_migration import copy_checkpoints
from server.database.generation_jobs import GenerationJobStore
from server.database.generation_migrations import initialize_generation_schema
from server.database.learning_persistence import LearningManager
from server.graph.build import build_graph
from server.graph.runner import (
    GenerationAlreadyRunning,
    GenerationCancelled,
    ResumableGenerationError,
    run_generation_job,
)
from server.schemas.generation import GenerationStage
from server.schemas.llm import LLMContext
from server.schemas.search import SearchContext
from server.search.types import SearchProviderId


class GenerationRunnerTests(unittest.IsolatedAsyncioTestCase):
    """Tests graph runner lock and resume behavior."""

    async def test_resume_uses_none_input_same_thread_and_fresh_context(self) -> None:
        graph = AsyncMock()
        graph.ainvoke.return_value = {"session_id": "session-1"}
        jobs = MagicMock()
        jobs.get_by_session.return_value = SimpleNamespace(
            id="job-1",
            session_id="session-1",
            thread_id="gen-session-1",
            stage=GenerationStage.PAUSED,
            query="test query",
            user_id=None,
            mode="full",
            resolved_mode="full",
            research_report_id=None,
        )
        jobs.try_acquire_lock.return_value = SimpleNamespace(
            owner="worker-1",
            version=2,
        )
        jobs.renew_lock.return_value = jobs.try_acquire_lock.return_value
        llm = LLMContext(api_key="llm-secret", model="test/model")
        search = SearchContext.from_plaintext_credentials(
            enabled=True,
            provider_ids=[SearchProviderId.TAVILY],
            credentials={SearchProviderId.TAVILY: "search-secret"},
        )
        await run_generation_job(
            app_state=SimpleNamespace(course_graph=graph),
            session_id="session-1",
            llm_context=llm,
            search_context=search,
            resume=True,
            worker_id="worker-1",
            job_store=jobs,
            event_store=MagicMock(),
        )
        call = graph.ainvoke.await_args
        self.assertIsNone(call.args[0])
        self.assertEqual(
            call.kwargs["config"]["configurable"]["thread_id"],
            "gen-session-1",
        )
        self.assertEqual(call.kwargs["context"]["llm_context"], llm)
        self.assertEqual(call.kwargs["context"]["search_context"], search)
        persisted_calls = repr(jobs.method_calls)
        self.assertNotIn("llm-secret", persisted_calls)
        self.assertNotIn("search-secret", persisted_calls)

    async def test_start_restores_custom_count_from_session(self) -> None:
        for count in (1, 2, 7, 30):
            with self.subTest(count=count):
                graph, jobs = AsyncMock(), MagicMock()
                jobs.get_by_session.return_value = SimpleNamespace(
                    id="j1", thread_id="gen-s1"
                )
                jobs.try_acquire_lock.return_value = SimpleNamespace(
                    owner="w1", version=1
                )
                session = {
                    "id": "s1", "query": "Topic", "mode": "custom",
                    "resolved_mode": "custom", "custom_topic_count": count,
                    "total_nodes": 0,
                }
                with patch(
                    "server.graph.runner.learning_manager."
                    "get_learning_session", return_value=session,
                ):
                    await run_generation_job(
                        app_state=SimpleNamespace(course_graph=graph),
                        session_id="s1", worker_id="w1",
                        llm_context=LLMContext(api_key="k", model="m"),
                        search_context=SearchContext(), job_store=jobs,
                        event_store=MagicMock(),
                    )
                state = graph.ainvoke.await_args.args[0]
                self.assertEqual(state["custom_topic_count"], count)
                self.assertEqual(state["resolved_mode"], "custom")
                self.assertEqual(state["mode"], "custom")
                self.assertEqual(state["topic_count"], 0)
                self.assertNotIn("llm_context", state)
                self.assertNotIn("search_context", state)

    async def test_custom_count_survives_reopened_checkpoint_resume(
        self,
    ) -> None:
        for count in (1, 2, 7, 30):
            with (
                self.subTest(count=count),
                tempfile.TemporaryDirectory() as tmp,
            ):
                db_path = Path(tmp) / "a2ui.db"
                cp_path = str(Path(tmp) / "checkpoints.db")
                learning = LearningManager(db_path)
                learning.init_learning_tables()
                initialize_generation_schema(db_path)
                jobs = GenerationJobStore(db_path)
                session, job = jobs.create_session_shell_and_job(
                    query="Topic", user_id=None, mode="custom",
                    custom_topic_count=count, web_search_requested=False,
                )
                seen = []

                async def pause_outline(state, runtime):
                    seen.append(state["custom_topic_count"])
                    raise ResumableGenerationError("pause before outline")

                async def resume_outline(state, runtime):
                    seen.append(state["custom_topic_count"])
                    return {"topic_count": count, "next_topic_index": 0}

                async def plan(state, runtime):
                    return {
                        "active_batch_start": 0,
                        "active_batch_size": 1,
                    }

                overrides = {
                    "outline_planner_node": pause_outline,
                    "plan_brief_batch_node": plan,
                    "generator_node": AsyncMock(return_value={}),
                    "prepare_quiz_batch_node": AsyncMock(return_value={}),
                    "quizzer_node": AsyncMock(return_value={}),
                    "advance_batch_node": AsyncMock(
                        return_value={"next_topic_index": count}
                    ),
                    "finalize_generation_node": AsyncMock(return_value={}),
                }
                events = MagicMock()
                with (
                    patch("server.graph.runner.learning_manager", learning),
                    patch("server.graph.nodes.learning_manager", learning),
                    patch("server.graph.nodes.generation_job_store", jobs),
                    patch("server.graph.nodes.progress_event_store", events),
                    patch("server.graph.nodes.resolve_depth_mode",
                          new_callable=AsyncMock) as resolve,
                ):
                    saver_cm = AsyncSqliteSaver.from_conn_string(cp_path)
                    async with saver_cm as saver:
                        graph = build_graph(saver, node_overrides=overrides)
                        await run_generation_job(
                            app_state=SimpleNamespace(course_graph=graph),
                            session_id=session["id"], job_store=jobs,
                            event_store=events,
                            llm_context=LLMContext(api_key="k", model="m"),
                            search_context=SearchContext(),
                        )
                        self.assertEqual(
                            jobs.get_by_session(session["id"]).stage,
                            GenerationStage.PAUSED,
                        )
                    # Close/reopen saver and rebuild graph against same file.
                    overrides["outline_planner_node"] = resume_outline
                    jobs.prepare_resume(session["id"])
                    saver_cm = AsyncSqliteSaver.from_conn_string(cp_path)
                    async with saver_cm as saver:
                        graph = build_graph(saver, node_overrides=overrides)
                        config = {"configurable": {"thread_id": job.thread_id}}
                        before = await graph.aget_state(config)
                        self.assertEqual(
                            before.values["custom_topic_count"], count
                        )
                        with patch(
                            "server.graph.runner.learning_manager."
                            "get_learning_session"
                        ) as read_session:
                            await run_generation_job(
                                app_state=SimpleNamespace(course_graph=graph),
                                session_id=session["id"], resume=True,
                                job_store=jobs, event_store=events,
                                llm_context=LLMContext(
                                    api_key="fresh-key", model="m"
                                ),
                                search_context=SearchContext(),
                            )
                            read_session.assert_not_called()
                        after = await graph.aget_state(config)
                        self.assertEqual(
                            after.values["custom_topic_count"], count
                        )
                        self.assertEqual(after.values["mode"], "custom")
                        self.assertEqual(
                            after.values["resolved_mode"], "custom"
                        )
                        self.assertEqual(after.next, ())
                        self.assertNotIn("fresh-key", repr(after.values))
                    resolve.assert_not_called()
                self.assertEqual(seen, [count, count])
                self.assertEqual(
                    learning.get_learning_session(session["id"])[
                        "custom_topic_count"
                    ], count,
                )

    async def test_second_worker_is_rejected(self) -> None:
        jobs = MagicMock()
        jobs.get_by_session.return_value = SimpleNamespace(
            id="job-1",
            session_id="session-1",
            thread_id="gen-session-1",
            stage=GenerationStage.OUTLINING,
        )
        jobs.try_acquire_lock.return_value = None
        with self.assertRaises(GenerationAlreadyRunning):
            await run_generation_job(
                app_state=SimpleNamespace(course_graph=AsyncMock()),
                session_id="session-1",
                llm_context=LLMContext(
                    api_key="llm-key",
                    model="test/model",
                ),
                search_context=SearchContext(),
                resume=False,
                worker_id="worker-2",
                job_store=jobs,
                event_store=MagicMock(),
            )

    async def test_cancel_marks_retained_cancelled_state(self) -> None:
        graph = AsyncMock()
        graph.ainvoke.side_effect = GenerationCancelled("session-1")
        jobs = MagicMock()
        jobs.get_by_session.return_value = SimpleNamespace(
            id="job-1",
            session_id="session-1",
            thread_id="gen-session-1",
            stage=GenerationStage.GENERATING_PREVIEW,
            query="test query",
            user_id=None,
            mode="full",
            resolved_mode="full",
            research_report_id=None,
        )
        lock = SimpleNamespace(owner="worker-1", version=1)
        jobs.try_acquire_lock.return_value = lock
        jobs.renew_lock.return_value = lock
        events = MagicMock()
        await run_generation_job(
            app_state=SimpleNamespace(course_graph=graph),
            session_id="session-1",
            llm_context=LLMContext(api_key="llm-key", model="test/model"),
            search_context=SearchContext(),
            resume=False,
            worker_id="worker-1",
            job_store=jobs,
            event_store=events,
        )
        jobs.mark_cancelled.assert_called_once()
        events.append_once.assert_called_once()
        jobs.release_lock.assert_called_once()

    async def test_resumable_error_marks_paused_not_failed(self) -> None:
        graph = AsyncMock()
        graph.ainvoke.side_effect = ResumableGenerationError(
            "Planner brief validation failed"
        )
        jobs = MagicMock()
        jobs.get_by_session.return_value = SimpleNamespace(
            id="job-1",
            session_id="session-1",
            thread_id="gen-session-1",
            stage=GenerationStage.PLANNING_BATCH,
            query="test query",
            user_id=None,
            mode="full",
            resolved_mode="full",
            research_report_id=None,
        )
        lock = SimpleNamespace(owner="worker-1", version=1)
        jobs.try_acquire_lock.return_value = lock
        jobs.renew_lock.return_value = lock
        await run_generation_job(
            app_state=SimpleNamespace(course_graph=graph),
            session_id="session-1",
            llm_context=LLMContext(api_key="llm-key", model="test/model"),
            search_context=SearchContext(),
            resume=False,
            worker_id="worker-1",
            job_store=jobs,
            event_store=MagicMock(),
        )
        jobs.mark_paused.assert_called_once()
        jobs.mark_failed.assert_not_called()

    async def test_resume_after_checkpoint_copy_uses_same_thread(self) -> None:
        item = SimpleNamespace(
            config={
                "configurable": {
                    "thread_id": "gen-session-1",
                    "checkpoint_ns": "",
                    "checkpoint_id": "cp2",
                }
            },
            checkpoint={"id": "cp2", "v": 1},
            metadata={"step": 2},
            parent_config={
                "configurable": {
                    "thread_id": "gen-session-1",
                    "checkpoint_ns": "",
                    "checkpoint_id": "cp1",
                }
            },
            pending_writes=[],
        )

        class Source:
            async def alist(self, config):
                yield item

        target = SimpleNamespace(
            aput=AsyncMock(),
            aput_writes=AsyncMock(),
            latest=None,
        )

        async def aput(config, checkpoint, metadata, new_versions):
            target.latest = SimpleNamespace(
                config={
                    "configurable": {
                        "thread_id": config["configurable"]["thread_id"],
                        "checkpoint_ns": config["configurable"].get(
                            "checkpoint_ns",
                            "",
                        ),
                        "checkpoint_id": checkpoint["id"],
                    }
                },
                checkpoint=checkpoint,
            )

        target.aput = AsyncMock(side_effect=aput)
        await copy_checkpoints(Source(), target)
        self.assertIsNotNone(target.latest)
        self.assertEqual(
            target.latest.config["configurable"]["thread_id"],
            "gen-session-1",
        )

        graph = AsyncMock()
        graph.ainvoke.return_value = {"session_id": "session-1"}
        jobs = MagicMock()
        jobs.get_by_session.return_value = SimpleNamespace(
            id="job-1",
            session_id="session-1",
            thread_id="gen-session-1",
            stage=GenerationStage.PAUSED,
            query="test query",
            user_id=None,
            mode="full",
            resolved_mode="full",
            research_report_id=None,
        )
        jobs.try_acquire_lock.return_value = SimpleNamespace(
            owner="worker-1",
            version=2,
        )
        jobs.renew_lock.return_value = jobs.try_acquire_lock.return_value
        await run_generation_job(
            app_state=SimpleNamespace(course_graph=graph),
            session_id="session-1",
            llm_context=LLMContext(api_key="llm-key", model="test/model"),
            search_context=SearchContext(),
            resume=True,
            worker_id="worker-1",
            job_store=jobs,
            event_store=MagicMock(),
        )
        call = graph.ainvoke.await_args
        self.assertIsNone(call.args[0])
        self.assertEqual(
            call.kwargs["config"]["configurable"]["thread_id"],
            "gen-session-1",
        )


if __name__ == "__main__":
    unittest.main()
