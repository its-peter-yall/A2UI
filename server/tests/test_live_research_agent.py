"""
============================================================================
FILE: test_live_research_agent.py
LOCATION: server/tests/test_live_research_agent.py
============================================================================
PURPOSE:
    Prove researcher synthesis, correction, and finalization forward live
    display callbacks through P1's unfinished structured stream path.
ROLE IN PROJECT:
    Task 1 dedicated tests for Plan P2. Existing researcher tests remain
    regression-only and must keep the no-callback generate() branch.
KEY COMPONENTS:
    - LiveResearchAgentTests: in-flight partials and callback forwarding
DEPENDENCIES:
    - External: asyncio, unittest, unittest.mock
    - Internal: server.agents.researcher, server.tests.realtime_foundation_helpers
USAGE:
    python -m unittest server.tests.test_live_research_agent -v
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server.agents.researcher import ResearcherAgent
from server.schemas.llm import AgentModelConfig, LLMContext
from server.schemas.research import (
    ResearchFinalization, ResearchIteration, ResearchPlan,
)
from server.tests.realtime_foundation_helpers import fake_instructor


class LiveResearchAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_partials_arrive_before_provider_finishes(self):
        entered = asyncio.Event()
        release = asyncio.Event()
        closed = asyncio.Event()
        updates = []
        plan = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q"],
        )

        async def chunks(**kwargs):
            try:
                yield ResearchIteration.model_construct(
                    theme=None, section_markdown="First ",
                )
                yield ResearchIteration.model_construct(
                    theme=None, section_markdown="First evidence. ",
                )
                entered.set()
                await release.wait()
                yield ResearchIteration(
                    theme="fundamentals",
                    section_markdown="First evidence. Final.",
                )
            finally:
                closed.set()

        async def collect(update):
            updates.append(update)

        context = LLMContext(
            api_key="llm-secret",
            agent_models={"researcher": AgentModelConfig(model="r/model")},
        )
        with fake_instructor(chunks) as (_, sdk, partial):
            task = asyncio.create_task(
                ResearcherAgent().synthesize_iteration(
                    query="q", plan=plan, coverage=[],
                    untrusted_source_context="SOURCES BEGIN\nSOURCES END",
                    target_theme="fundamentals", llm_context=context,
                    on_delta=collect, initial_attempt=2,
                )
            )
            try:
                await asyncio.wait_for(entered.wait(), 0.5)
                self.assertFalse(task.done())
                texts = [u.partial.section_markdown for u in updates
                         if u.kind == "partial"]
                self.assertEqual(texts, ["First ", "First evidence. "])
                self.assertEqual(updates[0].kind, "attempt_started")
                self.assertEqual(updates[0].attempt, 2)
                self.assertFalse(closed.is_set())
                release.set()
                result = await asyncio.wait_for(task, 0.5)
                self.assertEqual(result.theme, "fundamentals")
                partial.assert_called_once()
                sdk.close.assert_awaited_once()
            finally:
                release.set()
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def test_correction_and_summary_forward_callback_and_attempt(self):
        agent = ResearcherAgent()
        callback = AsyncMock()
        context = LLMContext(api_key="k", model="m")
        draft = ResearchIteration(theme="fundamentals", section_markdown="x")
        final = ResearchFinalization(summary="s", freshness_note="today")
        with patch.object(
            agent, "generate_streaming", new=AsyncMock(),
        ) as stream, patch.object(agent, "generate", new=AsyncMock()) as old:
            stream.return_value = draft
            self.assertEqual(await agent.correct_source_ids(
                draft, [], context, on_delta=callback, initial_attempt=3,
            ), draft)
            stream.return_value = final
            self.assertEqual(await agent.finalize_report(
                query="q", coverage=[], sections=[], conflicts=[],
                llm_context=context, on_delta=callback, initial_attempt=2,
            ), final)
            self.assertEqual([c.kwargs["initial_attempt"]
                              for c in stream.await_args_list], [3, 2])
            self.assertTrue(all(c.kwargs["on_delta"] is callback
                                for c in stream.await_args_list))
            old.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
