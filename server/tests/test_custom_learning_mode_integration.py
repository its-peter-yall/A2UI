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


def main() -> None:
    """Run this acceptance module directly through Python's module runner."""
    unittest.main()


if __name__ == "__main__":
    main()