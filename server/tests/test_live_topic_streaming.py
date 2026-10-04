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


if __name__ == "__main__":
    unittest.main()
