"""
============================================================================
FILE: test_custom_learning_mode_integration.py
LOCATION: server/tests/test_custom_learning_mode_integration.py
============================================================================
PURPOSE:
    Verify Custom generation and persisted resume across layer boundaries.
ROLE IN PROJECT:
    Provides P4 acceptance with real HTTP, runtime, graph, and repositories.
    External providers and Mongo transport are deterministic doubles.
KEY COMPONENTS:
    - CustomLearningModeIntegrationTests: Composed acceptance contracts
USAGE:
    python -m unittest
    server.tests.test_custom_learning_mode_integration
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest
from contextlib import contextmanager
from copy import deepcopy
from types import SimpleNamespace
from typing import Any, Iterator, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from server.database.repositories.mongo_jobs import (
    MongoGenerationJobRepository,
)
from server.database.repositories.mongo_learning import (
    MongoLearningRepository,
)
from server.graph import nodes
from server.graph.build import build_graph
from server.graph.runner import ResumableGenerationError, run_generation_job
from server.routers.learning import router
from server.schemas.generation import GenerationStage
from server.schemas.learning import CourseOutline
from server.schemas.llm import get_llm_context
from server.services.generation_runtime import GenerationRuntime
from server.tests.generation_acceptance_harness import (
    AcceptanceScenario,
    GenerationAcceptanceHarness,
    make_outline,
)
from server.tests.llm_test_helpers import make_test_llm_context
from server.tests.test_mongo_jobs import make_job_document


def _headers(research: bool = False) -> dict[str, str]:
    """Return the search headers emitted by the real client transport."""
    if not research:
        return {"X-Web-Search": "false"}
    return {
        "X-Web-Search": "true",
        "X-Web-Search-Providers": "tavily",
        "X-Tavily-Key": "search-secret",
    }


async def _drain(runtime: GenerationRuntime) -> None:
    """Await detached work with a bounded timeout and propagate errors."""
    tasks = list(runtime.active_tasks)
    if tasks:
        await asyncio.wait_for(asyncio.gather(*tasks), timeout=30)


def _mongo_stores() -> tuple[Any, Any]:
    """Compose real repositories with deterministic collection transport."""
    database = MagicMock()
    collections: dict[str, MagicMock] = {}
    documents: dict[str, dict[str, Any]] = {}

    def collection(name: str) -> MagicMock:
        if name not in collections:
            collections[name] = MagicMock(name=name)
        return collections[name]

    database.__getitem__.side_effect = collection
    transaction = MagicMock()
    database.client.start_session.return_value.__enter__.return_value = (
        transaction
    )
    transaction.start_transaction.return_value.__enter__.return_value = (
        transaction
    )

    def matches(document: dict[str, Any], query: dict[str, Any]) -> bool:
        for key, expected in query.items():
            if key == "$or":
                if not any(matches(document, item) for item in expected):
                    return False
                continue
            actual = document.get(key)
            if isinstance(expected, dict):
                for operator, operand in expected.items():
                    if operator == "$in":
                        ok = actual in operand
                    elif operator == "$gt":
                        ok = actual is not None and actual > operand
                    elif operator == "$lte":
                        ok = actual is not None and actual <= operand
                    else:
                        raise AssertionError(
                            f"Unsupported predicate: {operator}"
                        )
                    if not ok:
                        return False
            elif actual != expected:
                return False
        return True

    def insert(name: str, document: dict[str, Any], **kwargs: Any) -> None:
        del kwargs
        stored = make_job_document() if name == "generation_jobs" else {}
        stored.update(deepcopy(document))
        documents[name] = stored

    def find(name: str, query: dict[str, Any]) -> Optional[dict[str, Any]]:
        document = documents.get(name)
        if document is None or not matches(document, query):
            return None
        return deepcopy(document)

    def update(
        name: str, query: dict[str, Any], change: dict[str, Any], **kwargs: Any
    ) -> Optional[dict[str, Any]]:
        del kwargs
        document = documents.get(name)
        if document is None or not matches(document, query):
            return None
        if set(change) - {"$set", "$inc"}:
            raise AssertionError(f"Unsupported update: {change.keys()}")
        document.update(deepcopy(change.get("$set", {})))
        for key, amount in change.get("$inc", {}).items():
            document[key] = document.get(key, 0) + amount
        return deepcopy(document)

    for name in ("learning_sessions", "generation_jobs"):
        target = collection(name)
        target.insert_one.side_effect = (
            lambda document, name=name, **kw: insert(name, document, **kw)
        )
        target.find_one.side_effect = lambda query, name=name: find(name, query)
        target.find_one_and_update.side_effect = (
            lambda query, change, name=name, **kw:
            update(name, query, change, **kw)
        )
        target.update_one.side_effect = (
            lambda query, change, name=name:
            SimpleNamespace(
                matched_count=int(update(name, query, change) is not None)
            )
        )
    collection("concept_nodes").count_documents.return_value = 0
    collection("concept_nodes").find.return_value.sort.return_value = []
    return (
        MongoLearningRepository(database),
        MongoGenerationJobRepository(database),
    )


class CustomLearningModeIntegrationTests(unittest.IsolatedAsyncioTestCase):
    """Prove composed behavior using isolated temporary persistence."""

    async def asyncSetUp(self) -> None:
        self.harness = await GenerationAcceptanceHarness.create()
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.state.generation_runtime = self.harness.runtime
        self.app.dependency_overrides[get_llm_context] = (
            lambda: make_test_llm_context(api_key="llm-secret", model="m")
        )
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app),
            base_url="http://testserver",
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.harness.close()

    @contextmanager
    def _externals(
        self,
        count: int,
        research: bool = False,
        outlines: Optional[list[CourseOutline]] = None,
    ) -> Iterator[tuple[AsyncMock, AsyncMock]]:
        """Keep real cardinality enforcement inside the existing harness."""
        real_plan = nodes.planner_agent.plan
        scenario = AcceptanceScenario(topic_count=count, web_search=research)
        with (
            self.harness._install_fakes(scenario),
            patch.object(nodes.planner_agent, "plan", new=real_plan),
            patch.object(
                nodes.planner_agent, "generate", new_callable=AsyncMock
            ) as generate,
        ):
            generate.side_effect = (
                outlines if outlines is not None else [make_outline(count)]
            )
            yield generate, nodes.run_research

    async def _start(
        self, count: int, research: bool = False
    ) -> str:
        """Submit the same JSON shape built by learningApi.generateCourse."""
        response = await self.client.post(
            "/learning/generate",
            json={
                "query": "Modern CSS",
                "mode": "custom",
                "custom_topic_count": count,
            },
            headers=_headers(research),
        )
        self.assertEqual(response.status_code, 202, response.text)
        accepted = response.json()
        self.assertEqual(accepted["session"]["custom_topic_count"], count)
        self.assertEqual(accepted["session"]["total_nodes"], 0)
        self.assertEqual(
            accepted["generation"]["web_search_requested"], research
        )
        self.assertNotIn("llm-secret", response.text)
        self.assertNotIn("search-secret", response.text)
        return accepted["session"]["id"]

    async def test_request_count_and_research_reach_completion(self) -> None:
        for count in (1, 2, 5, 30):
            for research in (False, True):
                with (
                    self.subTest(count=count, research=research),
                    self._externals(count, research) as (generate, search),
                    patch(
                        "server.graph.nodes.resolve_depth_mode",
                        new_callable=AsyncMock,
                    ) as resolve,
                ):
                    session_id = await self._start(count, research)
                    await _drain(self.harness.runtime)
                    response = await self.client.get(
                        f"/learning/sessions/{session_id}"
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    public = response.json()
                    self.assertEqual(public["mode"], "custom")
                    self.assertEqual(public["resolved_mode"], "custom")
                    self.assertEqual(public["custom_topic_count"], count)
                    self.assertEqual(public["total_nodes"], count)
                    self.assertEqual(len(public["nodes"]), count)
                    self.assertEqual(public["generation"]["stage"], "COMPLETE")
                    self.assertEqual(
                        public["generation"]["counts"]["topics_ready"], count
                    )
                    self.assertEqual(
                        public["generation"]["counts"]["topics_failed"], 0
                    )
                    resolve.assert_not_awaited()
                    generate.assert_awaited_once()
                    self.assertIn(
                        f"EXACTLY {count} topics",
                        generate.await_args.kwargs["system_prompt_override"],
                    )
                    self.assertEqual(search.await_count, int(research))
                    result = self.harness._build_result(session_id)
                    if research:
                        self.assertLess(
                            result.stage_events.index("RESEARCHING"),
                            result.stage_events.index("OUTLINING"),
                        )
                        self.assertEqual(result.grounding_status, "GROUNDED")
                    else:
                        self.assertNotIn("RESEARCHING", result.stage_events)
                        self.assertEqual(result.grounding_status, "DISABLED")
                    job = self.harness.jobs.get_by_session(session_id)
                    self.assertIsNotNone(job)
                    snapshot = await self.harness.graph.aget_state(
                        {"configurable": {"thread_id": job.thread_id}}
                    )
                    self.assertEqual(
                        snapshot.values["custom_topic_count"], count
                    )
                    self.assertEqual(snapshot.values["topic_count"], count)
                    self.assertEqual(
                        snapshot.values["web_search_enabled"], research
                    )
                    self.assertNotIn("llm-secret", repr(snapshot.values))
                    self.assertNotIn("search-secret", repr(snapshot.values))

    async def test_corrected_outline_completes_without_wrong_nodes(
        self,
    ) -> None:
        wrong, corrected = make_outline(2), make_outline(5)
        with self._externals(5, outlines=[wrong, corrected]) as (generate, _):
            session_id = await self._start(5)
            await _drain(self.harness.runtime)
            response = await self.client.get(f"/learning/sessions/{session_id}")
            self.assertEqual(response.status_code, 200, response.text)
            public = response.json()
            self.assertEqual(public["generation"]["stage"], "COMPLETE")
            self.assertEqual(len(public["nodes"]), 5)
            self.assertEqual(
                [node["sequence_index"] for node in public["nodes"]],
                list(range(5)),
            )
            self.assertEqual(generate.await_count, 2)
            self.assertEqual(len(wrong.topics), 2)
            self.assertIn(
                "EXACTLY 5 topics",
                generate.await_args_list[1].kwargs["user_message"],
            )

    async def test_second_mismatch_is_failed_in_public_read_and_events(
        self,
    ) -> None:
        wrong_first, wrong_second = make_outline(2), make_outline(4)
        with self._externals(
            5, outlines=[wrong_first, wrong_second]
        ) as (generate, _):
            session_id = await self._start(5)
            await _drain(self.harness.runtime)
            self.assertEqual(generate.await_count, 2)
            response = await self.client.get(f"/learning/sessions/{session_id}")
            self.assertEqual(response.status_code, 200, response.text)
            public = response.json()
            self.assertEqual(public["custom_topic_count"], 5)
            self.assertEqual(public["generation"]["stage"], "FAILED")
            self.assertEqual(public["nodes"], [])
            self.assertEqual(public["total_nodes"], 0)
            result = self.harness._build_result(session_id)
            self.assertIn("FAILED", result.stage_events)
            self.assertNotIn("outline_ready", result.event_types)
            self.assertNotIn("generation_complete", result.event_types)
            self.assertEqual(len(wrong_first.topics), 2)
            self.assertEqual(len(wrong_second.topics), 4)
            job = self.harness.jobs.get_by_session(session_id)
            self.assertIsNotNone(job)
            self.assertEqual(job.stage, GenerationStage.FAILED)
            self.assertIsNone(job.lock_owner)
            stream = await self.client.get(
                f"/learning/sessions/{session_id}/events?after=0"
            )
            self.assertEqual(stream.status_code, 200, stream.text)
            self.assertIn('"FAILED"', stream.text)
            self.assertNotIn("llm-secret", stream.text)
            self.assertNotIn("search-secret", stream.text)

    async def test_invalid_http_counts_never_create_or_schedule_jobs(
        self,
    ) -> None:
        payloads = [{"query": "Modern CSS", "mode": "custom"}]
        payloads.extend(
            {
                "query": "Modern CSS", "mode": "custom",
                "custom_topic_count": value,
            }
            for value in (None, True, False, 2.5, 3.0, "5", 0, -1, 31)
        )
        payloads.extend(
            {"query": "Modern CSS", "mode": mode, "custom_topic_count": 5}
            for mode in ("auto", "lite", "full")
        )
        with patch.object(
            self.harness.runtime, "start", wraps=self.harness.runtime.start
        ) as start:
            for payload in payloads:
                with self.subTest(payload=payload):
                    response = await self.client.post(
                        "/learning/generate", json=payload, headers=_headers()
                    )
                    self.assertEqual(response.status_code, 422, response.text)
            start.assert_not_called()
        sessions, total = self.harness.learning.get_sessions_list(user_id=None)
        self.assertEqual(sessions, [])
        self.assertEqual(total, 0)
        self.assertEqual(self.harness.runtime.active_session_ids, [])

    async def test_existing_modes_without_count_still_complete(self) -> None:
        for mode, resolved, count in (
            ("auto", "lite", 3), ("lite", "lite", 3), ("full", "full", 10)
        ):
            with (
                self.subTest(mode=mode),
                self._externals(count) as (generate, search),
                patch(
                    "server.graph.nodes.resolve_depth_mode",
                    new_callable=AsyncMock,
                    return_value="lite",
                ) as resolve,
            ):
                response = await self.client.post(
                    "/learning/generate",
                    json={"query": "Modern CSS", "mode": mode},
                    headers=_headers(),
                )
                self.assertEqual(response.status_code, 202, response.text)
                accepted = response.json()
                self.assertIsNone(accepted["session"]["custom_topic_count"])
                await _drain(self.harness.runtime)
                session_id = accepted["session"]["id"]
                response = await self.client.get(
                    f"/learning/sessions/{session_id}"
                )
                self.assertEqual(response.status_code, 200, response.text)
                public = response.json()
                self.assertEqual(public["mode"], mode)
                self.assertEqual(public["resolved_mode"], resolved)
                self.assertIsNone(public["custom_topic_count"])
                self.assertEqual(public["generation"]["stage"], "COMPLETE")
                self.assertEqual(len(public["nodes"]), count)
                self.assertEqual(resolve.await_count, int(mode == "auto"))
                search.assert_not_awaited()
                generate.assert_awaited_once()

    async def test_stored_count_survives_http_read_and_resume_on_both_stores(
        self,
    ) -> None:
        for backend in ("sqlite", "mongo"):
            for count in (1, 2, 5, 30):
                with self.subTest(backend=backend, count=count):
                    if backend == "sqlite":
                        learning = self.harness.learning
                        jobs = self.harness.jobs
                    else:
                        learning, jobs = _mongo_stores()
                    events = MagicMock()
                    events.latest_id.return_value = 0
                    app_state = SimpleNamespace()
                    seen: list[int] = []

                    async def pause_outline(state: Any, runtime: Any) -> dict:
                        del runtime
                        seen.append(state["custom_topic_count"])
                        raise ResumableGenerationError("pause before outline")

                    async def resume_outline(state: Any, runtime: Any) -> dict:
                        del runtime
                        seen.append(state["custom_topic_count"])
                        return {"topic_count": count, "next_topic_index": 0}

                    async def plan(state: Any, runtime: Any) -> dict:
                        del state, runtime
                        return {"active_batch_start": 0, "active_batch_size": 1}

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

                    async def runner_fn(**kwargs: Any) -> None:
                        await run_generation_job(
                            **kwargs, job_store=jobs, event_store=events
                        )

                    runtime = GenerationRuntime(
                        app_state=app_state, job_store=jobs,
                        event_store=events, research=self.harness.research,
                        runner=runner_fn,
                    )
                    self.app.state.generation_runtime = runtime
                    cp_path = self.harness.checkpoint_path.parent / (
                        f"{backend}-{count}.db"
                    )
                    with (
                        patch("server.graph.runner.learning_manager", learning),
                        patch("server.graph.nodes.learning_manager", learning),
                        patch("server.graph.nodes.generation_job_store", jobs),
                        patch(
                            "server.graph.nodes.progress_event_store", events
                        ),
                        patch(
                            "server.routers.learning.learning_manager", learning
                        ),
                        patch(
                            "server.routers.learning.generation_job_store", jobs
                        ),
                        patch(
                            "server.database.storage_registry."
                            "progress_event_repository", events,
                        ),
                    ):
                        try:
                            cm = AsyncSqliteSaver.from_conn_string(str(cp_path))
                            async with cm as saver:
                                app_state.course_graph = build_graph(
                                    saver, node_overrides=overrides
                                )
                                session_id = await self._start(count)
                                await _drain(runtime)
                                paused = await self.client.get(
                                    f"/learning/sessions/{session_id}"
                                )
                                self.assertEqual(
                                    paused.status_code, 200, paused.text
                                )
                                self.assertEqual(
                                    paused.json()["custom_topic_count"], count
                                )
                                self.assertEqual(
                                    paused.json()["generation"]["stage"],
                                    "PAUSED",
                                )
                                job = jobs.get_by_session(session_id)
                                self.assertIsNotNone(job)
                                thread_id = job.thread_id
                            # Rebuild runtime and graph after closing saver.
                            await runtime.shutdown()
                            runtime = GenerationRuntime(
                                app_state=app_state, job_store=jobs,
                                event_store=events,
                                research=self.harness.research,
                                runner=runner_fn,
                            )
                            self.app.state.generation_runtime = runtime
                            overrides["outline_planner_node"] = resume_outline
                            cm = AsyncSqliteSaver.from_conn_string(str(cp_path))
                            async with cm as saver:
                                graph = build_graph(
                                    saver, node_overrides=overrides
                                )
                                app_state.course_graph = graph
                                config = {
                                    "configurable": {"thread_id": thread_id}
                                }
                                before = await graph.aget_state(config)
                                self.assertEqual(
                                    before.values["custom_topic_count"], count
                                )
                                response = await self.client.post(
                                    f"/learning/sessions/{session_id}/resume",
                                    headers=_headers(),
                                )
                                self.assertEqual(
                                    response.status_code, 202, response.text
                                )
                                await _drain(runtime)
                                after = await graph.aget_state(config)
                                self.assertEqual(after.next, ())
                                self.assertEqual(
                                    after.values["custom_topic_count"], count
                                )
                                self.assertEqual(after.values["mode"], "custom")
                                self.assertEqual(
                                    after.values["resolved_mode"], "custom"
                                )
                                self.assertNotIn(
                                    "llm-secret", repr(after.values)
                                )
                                read = await self.client.get(
                                    f"/learning/sessions/{session_id}"
                                )
                                self.assertEqual(
                                    read.status_code, 200, read.text
                                )
                                self.assertEqual(
                                    read.json()["custom_topic_count"], count
                                )
                                self.assertEqual(
                                    jobs.get_by_session(session_id).thread_id,
                                    thread_id,
                                )
                                self.assertEqual(seen, [count, count])
                        finally:
                            await runtime.shutdown()
                            self.app.state.generation_runtime = (
                                self.harness.runtime
                            )


def main() -> None:
    """Run this acceptance module directly through Python's module runner."""
    unittest.main()


if __name__ == "__main__":
    main()