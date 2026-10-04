"""
============================================================================
FILE: test_live_research_integration.py
LOCATION: server/tests/test_live_research_integration.py
============================================================================
PURPOSE:
    Prove reserved summary streaming, concurrent session isolation, and
    production job identity with search-key redaction.
ROLE IN PROJECT:
    Dedicated P2 integration tests. Production composition uses real
    stores/adapters; only HTTP and LLM are faked.
KEY COMPONENTS:
    - ResearchIntegrationTests: summary growth and session isolation
    - ProductionIdentityTests: real job id and credential redaction
DEPENDENCIES:
    - External: asyncio, unittest, unittest.mock, httpx
    - Internal: server.services.research_runner, session_event_stream
USAGE:
    python -m unittest server.tests.test_live_research_integration -v
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server.schemas.progress import ProgressEventType
from server.schemas.research import ResearchFinalization, ResearchIteration
from server.services.research_runner import run_research
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.tests.test_live_research_streaming import make_fixture, read_until
from server.tests.test_run_research_production import ProductionRunResearchTests
from server.utils.instructor_client import StructuredStreamUpdate


class ResearchIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_summary_grows_during_reserved_finalization_turn(self):
        runner, agent, stores, coordinator, args = make_fixture()
        entered, release = asyncio.Event(), asyncio.Event()

        async def chunks():
            yield ResearchFinalization.model_construct(summary="Summary ")
            yield ResearchFinalization.model_construct(summary="Summary evidence. ")
            entered.set()
            await release.wait()
            yield ResearchFinalization(summary="Summary evidence. Final.",
                                       freshness_note="today")

        async def finalize(**kwargs):
            cb, attempt = kwargs["on_delta"], kwargs["initial_attempt"]
            await cb(StructuredStreamUpdate("attempt_started", attempt))
            async for model in chunks():
                await cb(StructuredStreamUpdate("partial", attempt, model))
                last = model
            return ResearchFinalization.model_validate(last.model_dump())

        agent.finalize_report.side_effect = finalize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                task = asyncio.create_task(runner.run(**args))
                try:
                    await asyncio.wait_for(entered.wait(), 0.5)
                    first = await read_until(sub,
                                            ProgressEventType.RESEARCH_TEXT_DELTA)
                    second = await read_until(sub,
                                             ProgressEventType.RESEARCH_TEXT_DELTA)
                    self.assertEqual(first.payload.theme, "summary")
                    self.assertEqual(first.payload.sequence_index, 1)
                    self.assertEqual(first.payload.text_delta, "Summary ")
                    self.assertEqual(second.payload.text_delta, "evidence. ")
                    self.assertFalse(task.done())
                    stores.research.finalize_report.assert_not_called()
                    release.set()
                    await asyncio.wait_for(task, 0.5)
                    stores.research.upsert_section.assert_called_once()
                    agent.finalize_report.assert_awaited_once()
                    saved = stores.research.finalize_report.call_args.kwargs
                    self.assertEqual(saved["summary"],
                                     "Summary evidence. Final.")
                finally:
                    release.set()
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_interleaved_sessions_have_separate_text_and_counts(self):
        fixtures = [make_fixture("s1", "r1"), make_fixture("s2", "r2")]
        gates = [asyncio.Event(), asyncio.Event()]
        release = asyncio.Event()
        hub = SessionLiveStreamBroadcaster()

        def stream_for(index):
            async def synthesize(**kwargs):
                cb = kwargs["on_delta"]
                await cb(StructuredStreamUpdate("attempt_started", 1))
                await cb(StructuredStreamUpdate("partial", 1,
                    ResearchIteration.model_construct(
                        section_markdown=f"Session {index} first ")))
                gates[index].set()
                await release.wait()
                final = ResearchIteration(theme="fundamentals",
                    section_markdown=f"Session {index} first final.")
                await cb(StructuredStreamUpdate("partial", 1, final))
                return final
            return synthesize

        with patch("server.services.research_runner.session_live_stream", hub):
            tasks = []
            try:
                for index, (runner, agent, stores, coordinator, args) \
                        in enumerate(fixtures):
                    agent.synthesize_iteration.side_effect = stream_for(index)
                    tasks.append(asyncio.create_task(runner.run(**args)))
                await asyncio.wait_for(asyncio.gather(
                    *(gate.wait() for gate in gates)), 0.5)
                self.assertTrue(all(not task.done() for task in tasks))
                for index, session in enumerate(("s1", "s2")):
                    events = await hub.snapshots(session)
                    texts = [e for e in events if e.snapshot.text]
                    self.assertEqual(len(texts), 1)
                    self.assertEqual(texts[0].snapshot.text,
                                     f"Session {index} first ")
                    self.assertEqual(texts[0].job_id, "job-" + session)
                    counts = [e.snapshot.unique_source_count for e in events
                              if e.snapshot.unique_source_count is not None]
                    self.assertEqual(counts, [1])
                release.set()
                await asyncio.wait_for(asyncio.gather(*tasks), 0.5)
            finally:
                release.set()
                for task in tasks:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)


class ProductionIdentityTests(ProductionRunResearchTests):
    async def test_production_publishes_real_job_id_and_redacts_search_key(self):
        import httpx
        from server.schemas.llm import LLMContext
        from server.schemas.research import ResearchPlan
        from server.schemas.search import SearchContext
        from server.search.types import SearchProviderId
        from server.tests.test_live_research_streaming import make_fixture

        _, agent, _, _, _ = make_fixture()
        agent.analyze_query.return_value = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q"],
        )

        async def synthesize(**kwargs):
            cb = kwargs["on_delta"]
            await cb(StructuredStreamUpdate("attempt_started", 1))
            for text in ("Evidence tvly-pr", "Evidence tvly-private-key safe "):
                await cb(StructuredStreamUpdate("partial", 1,
                    ResearchIteration.model_construct(section_markdown=text)))
            return ResearchIteration(
                theme="fundamentals",
                section_markdown="Evidence tvly-private-key safe ",
            )

        agent.synthesize_iteration.side_effect = synthesize

        def handler(request):
            return httpx.Response(200, request=request, json={"results": [{
                "title": "Source", "url": "https://example.org/a",
                "content": "Evidence",
            }]})

        search = SearchContext.from_plaintext_credentials(
            enabled=True, provider_ids=[SearchProviderId.TAVILY],
            credentials={SearchProviderId.TAVILY: "tvly-private-key"},
        )
        hub = SessionLiveStreamBroadcaster()
        job = self.jobs.get_by_session(self.session_id)
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as client:
            with patch(
                "server.database.storage_registry.generation_job_repository",
                self.jobs,
            ), patch(
                "server.database.storage_registry.progress_event_repository",
                self.events,
            ), patch(
                "server.database.storage_registry.research_repository",
                self.research,
            ), patch(
                "server.agents.researcher.researcher_agent", agent,
            ), patch(
                "server.services.research_runner.session_live_stream", hub,
            ):
                async with hub.subscribe(self.session_id) as sub:
                    await run_research(
                        session_id=self.session_id, topic_query="q",
                        llm_context=LLMContext(api_key="llm-key", model="m"),
                        search_context=search, resolved_mode="full",
                        http_client=client,
                    )
                    events = []
                    while not sub.queue.empty():
                        events.append(sub.queue.get_nowait())
        self.assertTrue(events)
        self.assertTrue(all(e.job_id == job.id for e in events))
        # P1 types LiveDraftEvent.payload as BaseModel, so envelope
        # model_dump_json() emits payload:{}. Include the runtime payload
        # JSON so credential redaction remains observable.
        wire = " ".join(
            e.model_dump_json() + e.payload.model_dump_json()
            for e in events
        )
        self.assertNotIn("tvly-pr", wire)
        self.assertNotIn("llm-key", wire)
        self.assertNotIn("Authorization", wire)
        self.assertIn("[redacted]", wire)
        saved = self.research.get_report(self.session_id).model_dump_json()
        self.assertNotIn("tvly-private-key", saved)
        self.assertNotIn("llm-key", saved)


if __name__ == "__main__":
    unittest.main()
