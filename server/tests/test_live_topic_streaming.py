"""
============================================================================
FILE: test_live_topic_streaming.py
LOCATION: server/tests/test_live_topic_streaming.py
============================================================================
PURPOSE:
    Verify in-flight topic explanations and independent worker streams.
ROLE IN PROJECT:
    Tests real P1 iteration through the generator and graph boundaries.
KEY COMPONENTS:
    - LiveGeneratorAgentTests: Streaming and correction attempt tests.
============================================================================
"""

from __future__ import annotations

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from tenacity import wait_none

from server.agents.generator import GeneratedContent, GeneratorAgent
from server.graph import nodes
from server.schemas.progress import ProgressEventType
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_live_outline_streaming import (
    LiveHarness, OpenResponse, content, dispose, partial_content,
    take_type, topic,
)


class LiveGeneratorAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_explanation_grows_while_response_is_open(self):
        fake = OpenResponse([
            partial_content(content_markdown="Al"),
            partial_content(content_markdown="Alpha"),
        ], content())
        seen = []
        received = asyncio.Event()

        async def collect(update):
            if update.kind == "partial":
                seen.append(update.partial.content_markdown)
                if len(seen) == 2:
                    received.set()

        with LiveHarness() as h, fake_instructor(fake.stream) as (_, _, calls):
            task = asyncio.create_task(GeneratorAgent().generate_explanation(
                topic(), llm_context=h.llm, on_delta=collect,
                on_attempt_started=AsyncMock(),
            ))
            try:
                await asyncio.wait_for(received.wait(), 1)
                self.assertEqual(seen, ["Al", "Alpha"])
                self.assertFalse(task.done())
                self.assertFalse(fake.closed.is_set())
                fake.release.set()
                self.assertEqual((await task).content_markdown,
                                 content().content_markdown)
                calls.assert_called_once()
            finally:
                await dispose(task)

    async def test_transport_retry_then_mermaid_correction_attempts(self):
        calls = 0
        begins = []

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                yield partial_content(content_markdown="Old")
                raise OSError("disconnect")
            if calls == 2:
                yield content("```mermaid\nbad diagram\n```\n" + "a" * 320)
            else:
                yield content()

        async def begin(attempt, reason):
            begins.append((attempt, reason))

        with LiveHarness() as h, fake_instructor(stream), patch(
            "server.utils.instructor_client.wait_exponential",
            return_value=wait_none(),
        ), patch("server.agents.generator.validate_mermaid_code",
                 return_value="invalid"):
            result = await GeneratorAgent().generate_explanation(
                topic(), llm_context=h.llm, on_delta=AsyncMock(),
                on_attempt_started=begin,
            )
        self.assertEqual(begins, [
            (1, "started"), (2, "retry"), (3, "correction"),
        ])
        self.assertEqual(calls, 3)
        self.assertEqual(result.content_markdown, content().content_markdown)


class LiveTopicGraphTests(unittest.IsolatedAsyncioTestCase):
    async def test_topic_grows_before_content_commit(self):
        fake = OpenResponse([
            partial_content(content_markdown="Al"),
            partial_content(content_markdown="Alpha"),
        ], content())
        with LiveHarness() as h, fake_instructor(fake.stream):
            async with h.hub.subscribe("s") as subscription:
                task = asyncio.create_task(nodes.generator_node(
                    h.worker_state(), h.runtime,
                ))
                try:
                    first = await take_type(
                        subscription, ProgressEventType.TOPIC_CONTENT_DELTA,
                    )
                    second = await take_type(
                        subscription, ProgressEventType.TOPIC_CONTENT_DELTA,
                    )
                    self.assertEqual(first.payload.text_delta, "Al")
                    self.assertEqual(second.payload.text_delta, "pha")
                    self.assertEqual(second.payload.node_id, "n0")
                    self.assertEqual(second.payload.sequence_index, 0)
                    self.assertFalse(task.done())
                    self.assertFalse(fake.closed.is_set())
                    self.assertEqual(h.saved, {})
                    h.events.append_once.assert_not_called()
                    fake.release.set()
                    result = await task
                    self.assertTrue(result["generator_results"][0]
                                    ["content_ready"])
                finally:
                    await dispose(task)

    async def test_interleaved_workers_keep_drafts_isolated(self):
        a_first = asyncio.Event()
        b_first = asyncio.Event()
        a_second = asyncio.Event()
        both_open = asyncio.Event()
        release = asyncio.Event()

        async def stream(**kwargs):
            request = str(kwargs["messages"])
            if "Topic 0" in request:
                yield partial_content(content_markdown="Alpha")
                a_first.set()
                await b_first.wait()
                yield partial_content(
                    content_markdown="Alpha grows",
                )
                a_second.set()
                await release.wait()
                yield content("Alpha grows. " * 30)
            else:
                await a_first.wait()
                yield partial_content(content_markdown="Beta")
                b_first.set()
                await a_second.wait()
                yield partial_content(
                    content_markdown="Beta grows",
                )
                both_open.set()
                await release.wait()
                yield content("Beta grows. " * 30)

        with LiveHarness() as h, fake_instructor(stream):
            tasks = [asyncio.create_task(nodes.generator_node(
                h.worker_state(index), h.runtime,
            )) for index in (0, 1)]
            try:
                await asyncio.wait_for(both_open.wait(), 1)
                snaps = await h.hub.snapshots("s")
                by_node = {json.loads(s.target)[1]: s for s in snaps}
                self.assertEqual(by_node["n0"].snapshot.text, "Alpha grows")
                self.assertEqual(by_node["n1"].snapshot.text, "Beta grows")
                self.assertTrue(all(not task.done() for task in tasks))
                self.assertEqual(h.saved, {})
                release.set()
                await asyncio.gather(*tasks)
                self.assertTrue(h.saved["n0"].startswith("Alpha grows"))
                self.assertTrue(h.saved["n1"].startswith("Beta grows"))
            finally:
                for task in tasks:
                    await dispose(task)

    async def test_correction_resets_only_its_topic(self):
        from server.schemas.generation import GenerationStage
        from server.schemas.progress import TopicContentDeltaPayload

        calls = 0
        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                yield partial_content(content_markdown="Old")
                yield partial_content(content_markdown="Changed")
                self.fail("Non-prefix replacement must close old stream")
            else:
                yield content("Correct explanation. " * 20)

        with LiveHarness() as h, fake_instructor(stream):
            await h.hub.begin_target(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                target_type="topic", target_id="n1",
                sequence_index=1, attempt=1,
            )
            await h.hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n1", sequence_index=1, text_delta="Sibling",
                ),
            )
            await nodes.generator_node(h.worker_state(), h.runtime)
            snaps = await h.hub.snapshots("s")
            by_node = {json.loads(s.target)[1]: s for s in snaps}
            self.assertEqual(by_node["n0"].attempt, 2)
            self.assertTrue(by_node["n0"].snapshot.text.startswith("Correct"))
            self.assertEqual(by_node["n1"].attempt, 1)
            self.assertEqual(by_node["n1"].snapshot.text, "Sibling")
            resets = [args for kind, args in h.hub.events
                      if kind == "reset" and args["target_id"] == "n0"]
            self.assertEqual(resets[-1]["reason"], "correction")
            self.assertEqual(calls, 2)

    async def test_large_suffix_is_split_at_payload_limit(self):
        async def stream(**kwargs):
            yield content("a" * 9001)

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(4, 3), h.runtime)
            deltas = [args["payload"] for kind, args in h.hub.events
                      if kind == "live" and args["event_type"] ==
                      ProgressEventType.TOPIC_CONTENT_DELTA]
            self.assertEqual([len(p.text_delta) for p in deltas],
                             [4000, 4000, 1001])
            self.assertTrue(all(p.node_id == "n4" and p.sequence_index == 4
                                for p in deltas))
            self.assertEqual("".join(p.text_delta for p in deltas), "a" * 9001)


class LiveTopicLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancellation_closes_provider_without_ready_or_retry(self):
        fake = OpenResponse([
            partial_content(content_markdown="Live preview"),
        ], content())
        with (
            LiveHarness() as h,
            fake_instructor(fake.stream) as (_, sdk, calls),
        ):
            task = asyncio.create_task(nodes.generator_node(
                h.worker_state(), h.runtime,
            ))
            await asyncio.wait_for(fake.open.wait(), 1)
            self.assertEqual(len(await h.hub.snapshots("s")), 1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(fake.closed.is_set())
            calls.assert_called_once()
            sdk.close.assert_awaited_once()
            h.artifacts.persist_content_with_citations.assert_not_called()
            h.artifacts.persist_topic_error.assert_not_called()
            self.assertEqual(h.hub.retired, [])
            self.assertEqual(h.events.append_once.call_count, 0)

    async def test_job_cancel_between_chunks_is_not_wrapped_as_failure(self):
        from server.graph.runner import GenerationCancelled

        closed = asyncio.Event()
        async def stream(**kwargs):
            try:
                yield partial_content(content_markdown="Live")
                h.jobs.is_cancel_requested.return_value = True
                yield partial_content(content_markdown="Live next")
            finally:
                closed.set()

        with LiveHarness() as h, fake_instructor(stream) as (_, _, calls):
            with self.assertRaises(GenerationCancelled):
                await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertTrue(closed.is_set())
            calls.assert_called_once()
            h.artifacts.persist_topic_error.assert_not_called()
            self.assertEqual(h.saved, {})

    async def test_resume_replaces_retained_attempt_without_concatenation(self):
        from server.schemas.generation import GenerationStage
        from server.schemas.progress import TopicContentDeltaPayload

        fake = OpenResponse([
            partial_content(content_markdown="Fresh"),
        ], content("Fresh explanation. " * 20))
        with LiveHarness() as h, fake_instructor(fake.stream):
            await h.hub.begin_target(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                target_type="topic", target_id="n0", sequence_index=0,
                attempt=2,
            )
            await h.hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n0", sequence_index=0, attempt=2,
                    text_delta="Interrupted",
                ),
            )
            task = asyncio.create_task(nodes.generator_node(
                h.worker_state(), h.runtime,
            ))
            try:
                await asyncio.wait_for(fake.open.wait(), 1)
                snap = (await h.hub.snapshots("s"))[0]
                self.assertEqual(snap.attempt, 3)
                self.assertEqual(snap.snapshot.text, "Fresh")
                resets = [args for kind, args in h.hub.events
                          if kind == "reset"]
                self.assertEqual(resets[-1]["reason"], "resumed")
            finally:
                await dispose(task)

    async def test_durable_content_skip_makes_no_stream_call(self):
        with LiveHarness() as h, patch.object(
            nodes.generator_agent, "generate_streaming", new_callable=AsyncMock,
        ) as generate:
            h.artifacts.has_durable_content.return_value = True
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertTrue(result["generator_results"][0]["content_ready"])
            generate.assert_not_called()
            self.assertEqual(h.hub.events, [])

    async def test_arbitrary_display_failure_never_retries_provider(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream) as (_, _, calls):
            h.hub.publish = AsyncMock(
                side_effect=RuntimeError("display failed"),
            )
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            calls.assert_called_once()
            self.assertFalse(result["generator_results"][0]["content_ready"])
            self.assertEqual(h.saved, {})


class LiveTopicBudgetGuards(unittest.IsolatedAsyncioTestCase):
    async def test_corrections_cannot_buy_attempt_six(self):
        async def stream(**kwargs):
            yield partial_content(content_markdown="Old")
            yield partial_content(content_markdown="Changed")

        async def changed(update):
            if update.kind == "partial":
                raise nodes.TopicDraftCorrection("changed")

        with LiveHarness() as h, fake_instructor(stream) as (_, _, calls):
            with self.assertRaisesRegex(ValueError, "budget exhausted"):
                await GeneratorAgent().generate_explanation(
                    topic(), llm_context=h.llm, initial_attempt=5,
                    on_delta=changed,
                )
            calls.assert_called_once()


class LegacyGeneratorBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_legacy_schema_failure_keeps_single_generate_call(self):
        from pydantic import ValidationError

        try:
            GeneratedContent.model_validate({})
        except ValidationError as exc:
            error = exc
        with patch.object(
            GeneratorAgent, "generate", new_callable=AsyncMock,
        ) as call:
            call.side_effect = error
            with self.assertRaises(ValidationError):
                await GeneratorAgent().generate_explanation(topic())
            call.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
