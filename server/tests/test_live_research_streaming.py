"""
============================================================================
FILE: test_live_research_streaming.py
LOCATION: server/tests/test_live_research_streaming.py
============================================================================
PURPOSE:
    Prove accepted unique-source counts, in-flight synthesis, corrections,
    persistence ordering, and cancellation/failure paths for live research.
ROLE IN PROJECT:
    Dedicated P2 runner tests. Existing research_runner tests remain
    read-only regression inputs and must keep search/budget contracts.
KEY COMPONENTS:
    - make_hit / make_fixture / read_until: shared doubles for later P2 tests
    - LiveResearchStreamingTests: source growth and uniqueness
DEPENDENCIES:
    - External: asyncio, json, unittest, unittest.mock
    - Internal: server.services.research_runner, session_event_stream
USAGE:
    python -m unittest server.tests.test_live_research_streaming -v
============================================================================
"""

from __future__ import annotations

import asyncio
import json
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from server.schemas.generation import GenerationStage
from server.schemas.llm import LLMContext
from server.schemas.progress import ProgressEventType
from server.schemas.research import (
    ResearchFinalization, ResearchIteration, ResearchPlan,
)
from server.search.types import (
    NormalizedSearchResult, SearchProviderId, SearchResponse,
)
from server.services.research_runner import ResearchRunner
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.utils.instructor_client import StructuredStreamUpdate


def make_hit(url, text="Evidence", provider=SearchProviderId.TAVILY):
    return NormalizedSearchResult(
        title="Source", url=url, canonical_url=url, content=text,
        retrieved_at=datetime.now(timezone.utc),
        provider_id=provider, provider_rank=1,
    )


def make_fixture(session="session-1", report="report-1"):
    stores = MagicMock()
    stores.research.create_report.return_value = SimpleNamespace(id=report)
    stores.research.get_report.return_value = None
    stores.research.upsert_source.side_effect = lambda **kw: kw["source"]
    stores.research.upsert_section.return_value = SimpleNamespace(id="section")
    stores.jobs.is_cancel_requested.return_value = False
    stores.jobs.get_job.return_value = None
    agent = MagicMock()
    agent.analyze_query = AsyncMock(return_value=ResearchPlan(
        audience="Learner", provisional_concept_count=3,
        initial_queries=["q"],
    ))
    agent.synthesize_iteration = AsyncMock(return_value=ResearchIteration(
        theme="fundamentals", section_markdown="Evidence.",
    ))
    agent.correct_source_ids = AsyncMock(return_value=ResearchIteration(
        theme="fundamentals", section_markdown="Corrected evidence.",
    ))
    agent.finalize_report = AsyncMock(return_value=ResearchFinalization(
        summary="Summary.", freshness_note="today",
    ))
    coordinator = MagicMock()
    coordinator.provider_order = (SearchProviderId.TAVILY,)
    coordinator.search = AsyncMock(return_value=SearchResponse(
        results=[make_hit("https://example.org/a")], response_bytes=10,
    ))
    runner = ResearchRunner(
        agent=agent, research_store=stores.research,
        job_store=stores.jobs, event_store=stores.events,
    )
    args = dict(
        job_id="job-" + session, session_id=session, query="q",
        resolved_mode="lite", coordinator=coordinator,
        llm_context=LLMContext(api_key="llm-secret", model="m"),
    )
    return runner, agent, stores, coordinator, args


async def read_until(subscription, event_type):
    while True:
        event = await asyncio.wait_for(subscription.queue.get(), 0.1)
        if event.event_type == event_type:
            return event


class LiveResearchStreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_sources_grow_before_synthesis_and_remain_unique(self):
        runner, agent, stores, coordinator, args = make_fixture()
        entered = asyncio.Event()
        release = asyncio.Event()
        plan = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q1", "q2"],
        )
        args["existing_plan"] = plan
        first = make_hit("https://example.org/a")
        second = make_hit("https://example.net/b", "Different evidence")
        coordinator.search.side_effect = [
            SearchResponse(results=[first, first], response_bytes=10),
            SearchResponse(results=[first, second], response_bytes=10),
        ]

        async def synthesize(**kwargs):
            entered.set()
            await release.wait()
            return ResearchIteration(theme="fundamentals",
                                     section_markdown="Evidence.")

        agent.synthesize_iteration.side_effect = synthesize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                task = asyncio.create_task(runner.run(**args))
                try:
                    await asyncio.wait_for(entered.wait(), 0.5)
                    one = await read_until(
                        sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                    )
                    two = await read_until(
                        sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                    )
                    self.assertFalse(task.done())
                    self.assertFalse(release.is_set())
                    self.assertEqual(one.payload.unique_source_count, 1)
                    self.assertEqual(two.payload.unique_source_count, 2)
                    self.assertEqual(two.payload.new_sources_count, 1)
                    self.assertEqual(two.payload.provider_id, "tavily")
                    self.assertEqual(json.loads(two.target),
                                     ["research", args["session_id"], None])
                    self.assertEqual(two.job_id, args["job_id"])
                    self.assertEqual(two.stage, GenerationStage.RESEARCHING)
                    stores.research.upsert_section.assert_not_called()
                    release.set()
                    await asyncio.wait_for(task, 0.5)
                finally:
                    release.set()
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_failed_or_unsafe_sources_never_inflate_count(self):
        runner, agent, stores, coordinator, args = make_fixture()
        coordinator.search.return_value = SearchResponse(results=[
            make_hit("https://example.org/a"),
            make_hit("https://example.net/b", "Unstored"),
            make_hit("http://127.0.0.1/private", "Unsafe"),
        ], response_bytes=10)

        def persist(**kwargs):
            if str(kwargs["source"].url).startswith("https://example.net"):
                raise RuntimeError("secret-in-provider-body")
            return kwargs["source"]

        stores.research.upsert_source.side_effect = persist
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                await runner.run(**args)
                event = await read_until(
                    sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                )
                self.assertEqual(event.payload.unique_source_count, 1)
                self.assertEqual(event.payload.new_sources_count, 1)
                self.assertNotIn("secret", event.model_dump_json())

    async def test_source_budget_never_counts_rejected_hits(self):
        from server.search.budget import (
            ResearchBudgetLedger, resolve_research_budget,
        )
        runner, agent, stores, coordinator, args = make_fixture()
        args["existing_plan"] = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q"],
        )
        ledger = ResearchBudgetLedger(resolve_research_budget("lite", 3))
        original_reserve = ledger.reserve_sources

        def reserve_one(count):
            if ledger.usage_snapshot().sources >= 1:
                from server.search.budget import ResearchBudgetExceeded
                raise ResearchBudgetExceeded("sources")
            original_reserve(count)

        args["ledger"] = ledger
        coordinator.search.return_value = SearchResponse(results=[
            make_hit("https://example.org/a", "First"),
            make_hit("https://example.net/b", "Second"),
        ], response_bytes=10)
        hub = SessionLiveStreamBroadcaster()
        with patch.object(ledger, "reserve_sources", side_effect=reserve_one), \
                patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                await runner.run(**args)
                event = await read_until(
                    sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                )
                self.assertEqual(event.payload.unique_source_count, 1)
                self.assertEqual(stores.research.upsert_source.call_count, 1)


if __name__ == "__main__":
    unittest.main()
