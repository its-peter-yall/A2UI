"""
============================================================================
FILE: test_live_outline_streaming.py
LOCATION: server/tests/test_live_outline_streaming.py
============================================================================
PURPOSE:
    Verify live curriculum generation and isolated outline attempts.
ROLE IN PROJECT:
    Exercise real streaming agents and graph integration with gated providers.
KEY COMPONENTS:
    - LiveHarness: Isolated repositories and real broadcaster.
    - LivePlannerAgentTests: In-flight planner and retry contract tests.
============================================================================
"""

from __future__ import annotations

import asyncio
import json
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import SecretStr

from server.agents.generator import GeneratedContent
from server.agents.planner import PlannerAgent
from server.graph import nodes
from server.schemas.generation import GenerationStage
from server.schemas.learning import CourseOutline, TopicNode
from server.schemas.llm import AgentModelConfig, LLMContext
from server.schemas.progress import ProgressEventType
from server.services.session_event_stream import (
    SessionLiveStreamBroadcaster,
)
from server.tests.realtime_foundation_helpers import fake_instructor


def topic(index=0):
    return TopicNode(
        index=index, title=f"Topic {index}",
        summary_for_context=f"Summary {index}",
        key_terms=["alpha", "beta"], complexity="Basic", quiz_count=1,
    )


def outline(count=1, title="Alpha course"):
    return CourseOutline(
        course_title=title, topics=[topic(i) for i in range(count)],
    )


def partial_content(**fields):
    fields.setdefault("key_takeaways", None)
    return GeneratedContent.model_construct(**fields)


def content(text="Alpha explanation. " * 20, **extra):
    return GeneratedContent(
        content_markdown=text, key_takeaways=["One", "Two", "Three"],
        **extra,
    )


async def dispose(task):
    if not task.done():
        task.cancel()
    await asyncio.gather(task, return_exceptions=True)


class OpenResponse:
    """Real async-generator fixture; never finishes before release."""

    def __init__(self, partials, final):
        self.partials = partials
        self.final = final
        self.release = asyncio.Event()
        self.open = asyncio.Event()
        self.closed = asyncio.Event()

    async def stream(self, **kwargs):
        try:
            for partial in self.partials:
                yield partial
            self.open.set()
            await self.release.wait()
            yield self.final
        finally:
            self.closed.set()


class RecordingHub(SessionLiveStreamBroadcaster):
    def __init__(self):
        super().__init__()
        self.events = []
        self.retired = []

    async def begin_target(self, **kwargs):
        await super().begin_target(**kwargs)
        self.events.append(("reset", dict(kwargs)))

    async def publish(self, **kwargs):
        await super().publish(**kwargs)
        self.events.append(("live", dict(kwargs)))

    async def retire_target(self, **kwargs):
        self.retired.append(dict(kwargs))
        await super().retire_target(**kwargs)


class LiveHarness:
    def __init__(self):
        self.hub = RecordingHub()
        self.jobs = MagicMock()
        self.jobs.is_cancel_requested.return_value = False
        self.jobs.get_by_session.return_value = None
        self.artifacts = MagicMock()
        self.artifacts.has_durable_content.return_value = False
        self.artifacts.node_id_for_topic.side_effect = (
            lambda session, index: f"n{index}"
        )
        self.artifacts.get_topic.side_effect = (
            lambda session, index: topic(index)
        )
        self.artifacts.get_brief.return_value = None
        self.artifacts.get_adjacent_summaries.return_value = (None, None)
        self.learning = MagicMock()
        self.saved = {}
        self.ready = set()
        self.trace = []
        self.events = MagicMock()
        self.events.append_once.side_effect = self.append
        self.artifacts.persist_content_with_citations.side_effect = (
            self.save_content
        )
        self.artifacts.persist_topic_success.side_effect = self.save_success
        self.learning.get_concept_node.side_effect = self.get_node
        self.learning.get_session_nodes.side_effect = (
            lambda session: [self.get_node(key) for key in self.saved]
        )
        self.llm = LLMContext(
            api_key=SecretStr("fixture-active-key"), model="fixture/model",
            generalcompute_api_key=SecretStr("fixture-secondary-key"),
            agent_models={role: AgentModelConfig(model="fixture/model")
                          for role in ("planner", "generator")},
        )
        self.runtime = {"llm_context": self.llm}
        self.stack = ExitStack()

    def save_content(self, *, node_id, content_markdown, citations):
        self.saved[node_id] = content_markdown
        self.trace.append(("content_saved", node_id))

    def save_success(self, *, node_id, quiz_set, citations):
        self.ready.add(node_id)
        self.trace.append(("quiz_saved", node_id))

    def get_node(self, node_id):
        if node_id not in self.saved:
            return None
        return {
            "id": node_id, "sequence_index": int(node_id[1:]),
            "status": "LOCKED", "content_markdown": self.saved[node_id],
            "generation_status": (
                "READY" if node_id in self.ready else "GENERATING"
            ),
        }

    def append(self, **kwargs):
        self.trace.append(("durable", kwargs["event_type"].value))
        return SimpleNamespace(**kwargs)

    def __enter__(self):
        for name, value in (
            ("generation_job_store", self.jobs),
            ("generation_artifact_store", self.artifacts),
            ("learning_manager", self.learning),
            ("progress_event_store", self.events),
            ("session_live_stream", self.hub),
        ):
            self.stack.enter_context(patch.object(
                nodes, name, value,
            ))
        return self

    def __exit__(self, *args):
        return self.stack.__exit__(*args)

    def outline_state(self, count=1):
        return {
            "job_id": "j", "session_id": "s", "query": "Alpha",
            "resolved_mode": "custom", "custom_topic_count": count,
        }

    def worker_state(self, index=0, batch_start=0):
        return {
            "job_id": "j", "session_id": "s",
            "batch_start": batch_start, "sequence_index": index,
        }


async def take_type(subscription, event_type):
    while True:
        event = await asyncio.wait_for(subscription.next_event(), 1)
        if event.event_type == event_type:
            return event


class LivePlannerAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_planner_partials_precede_response_completion(self):
        fake = OpenResponse([
            CourseOutline.model_construct(course_title="Al", topics=None),
            CourseOutline.model_construct(course_title="Alpha", topics=[]),
        ], outline())
        seen = []
        begins = []
        received = asyncio.Event()

        async def collect(update):
            if update.kind == "partial":
                seen.append(update.partial.course_title)
                if len(seen) == 2:
                    received.set()

        async def begin(attempt, reason):
            begins.append((attempt, reason))

        with fake_instructor(fake.stream) as (_, sdk, calls):
            task = asyncio.create_task(PlannerAgent().plan(
                "Alpha", mode="custom", custom_topic_count=1,
                llm_context=LLMContext(api_key="key", model="model",
                                       agent_models={"planner":
                                           AgentModelConfig(model="model")}),
                on_delta=collect, on_attempt_started=begin,
            ))
            try:
                await asyncio.wait_for(received.wait(), 1)
                self.assertEqual(seen, ["Al", "Alpha"])
                self.assertFalse(task.done())
                self.assertFalse(fake.closed.is_set())
                self.assertEqual(begins, [(1, "started")])
                fake.release.set()
                self.assertEqual((await task).course_title, "Alpha course")
                calls.assert_called_once()
                sdk.close.assert_awaited_once()
            finally:
                await dispose(task)

    async def test_count_replan_uses_next_actual_attempt(self):
        calls = 0
        begins = []

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            yield outline(2 if calls == 1 else 1)

        async def begin(attempt, reason):
            begins.append((attempt, reason))

        with fake_instructor(stream):
            result = await PlannerAgent().plan(
                "Alpha", mode="custom", custom_topic_count=1,
                llm_context=LLMContext(api_key="key", model="model",
                                       agent_models={"planner":
                                           AgentModelConfig(model="model")}),
                on_delta=AsyncMock(), on_attempt_started=begin,
                initial_attempt=3,
            )
        self.assertEqual(len(result.topics), 1)
        self.assertEqual(begins, [(3, "started"), (4, "replan")])
        self.assertEqual(calls, 2)


class LiveOutlineGraphTests(unittest.IsolatedAsyncioTestCase):
    async def test_toc_grows_before_provider_finishes(self):
        fake = OpenResponse([
            CourseOutline.model_construct(
                course_title="Al", topics=[TopicNode.model_construct(
                    index=None, title="To", summary_for_context=None, key_terms=None,
                )],
            ),
            CourseOutline.model_construct(
                course_title="Alpha", topics=[TopicNode.model_construct(
                    index=0, title="Topic", summary_for_context=None, key_terms=None,
                )],
            ),
        ], outline())
        with LiveHarness() as h, fake_instructor(fake.stream):
            async with h.hub.subscribe("s") as subscription:
                task = asyncio.create_task(nodes.outline_planner_node(
                    h.outline_state(), h.runtime,
                ))
                try:
                    titles = []
                    rows = []
                    while len(titles) < 2 or len(rows) < 2:
                        event = await take_type(
                            subscription, ProgressEventType.OUTLINE_TEXT_DELTA,
                        )
                        payload = event.payload
                        if payload.course_title_delta:
                            titles.append(payload.course_title_delta)
                        if payload.topic_title_delta:
                            rows.append(payload.topic_title_delta)
                    self.assertEqual("".join(titles), "Alpha")
                    self.assertEqual("".join(rows), "Topic")
                    self.assertFalse(task.done())
                    self.assertFalse(fake.closed.is_set())
                    h.artifacts.persist_outline.assert_not_called()
                    self.assertEqual(h.events.append_once.call_count, 0)
                    snap = (await h.hub.snapshots("s"))[0]
                    self.assertEqual(snap.target, '["outline","s",null]')
                    self.assertEqual(snap.snapshot.topics, {0: "Topic"})
                    fake.release.set()
                    await task
                    h.artifacts.persist_outline.assert_called_once()
                    self.assertEqual(await h.hub.snapshots("s"), [])
                finally:
                    await dispose(task)

    async def test_count_replan_replaces_all_old_rows(self):
        second = OpenResponse([], outline(1, "New"))
        calls = 0

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                yield outline(2, "Old")
            else:
                yield CourseOutline.model_construct(
                    course_title="New", topics=[topic(0)],
                )
                async for value in second.stream(**kwargs):
                    yield value

        with LiveHarness() as h, fake_instructor(stream):
            task = asyncio.create_task(nodes.outline_planner_node(
                h.outline_state(), h.runtime,
            ))
            try:
                await asyncio.wait_for(second.open.wait(), 1)
                snap = (await h.hub.snapshots("s"))[0]
                self.assertEqual(snap.attempt, 2)
                self.assertEqual(snap.snapshot.course_title, "New")
                self.assertEqual(set(snap.snapshot.topics), {0})
                resets = [args for kind, args in h.hub.events
                          if kind == "reset"]
                self.assertEqual(resets[-1]["reason"], "replan")
                self.assertFalse(task.done())
                h.artifacts.persist_outline.assert_not_called()
                second.release.set()
                await task
                self.assertEqual(calls, 2)
            finally:
                await dispose(task)

    async def test_nonprefix_title_closes_attempt_and_replans(self):
        calls = 0
        closed = asyncio.Event()

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                try:
                    yield CourseOutline.model_construct(
                        course_title="Wrong", topics=None,
                    )
                    yield CourseOutline.model_construct(
                        course_title="Changed", topics=None,
                    )
                    self.fail("Correction must close this attempt")
                finally:
                    closed.set()
            else:
                yield outline(1, "Correct")

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            self.assertTrue(closed.is_set())
            resets = [args for kind, args in h.hub.events if kind == "reset"]
            self.assertEqual([item["attempt"] for item in resets], [1, 2])
            self.assertEqual(resets[-1]["reason"], "replan")
            self.assertEqual(calls, 2)
            saved = h.artifacts.persist_outline.call_args.args[1]
            self.assertEqual(saved.course_title, "Correct")

    async def test_ignored_fields_repeats_and_title_cap(self):
        async def stream(**kwargs):
            yield CourseOutline.model_construct(course_title=None, topics=None)
            yield CourseOutline.model_construct(course_title="", topics=[])
            yield outline(1, "x" * 350)
            yield outline(1, "x" * 350)

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            payloads = [args["payload"] for kind, args in h.hub.events
                        if kind == "live"]
            self.assertEqual(sum(len(p.course_title_delta or "")
                                 for p in payloads), 300)
            self.assertEqual(sum(p.topic_title_delta is not None
                                 for p in payloads), 1)
            self.assertTrue(all(p.course_title_delta or p.topic_title_delta
                                for p in payloads))


if __name__ == "__main__":
    unittest.main()
