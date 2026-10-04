"""
============================================================================
FILE: test_instructor_partial_stream.py
LOCATION: server/tests/test_instructor_partial_stream.py
============================================================================
PURPOSE:
    Verifies genuine in-flight Instructor partials and final validation.
ROLE IN PROJECT:
    Proves create_partial_structured yields cumulative snapshots while the
    provider stream is still open, then validates the completed model.
KEY COMPONENTS:
    - InstructorPartialStreamTests: Partial delivery and validation tests
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest

from pydantic import ValidationError

from server.tests.realtime_foundation_helpers import (
    StreamOutput, fake_instructor,
)
from server.utils.instructor_client import InstructorClient


class InstructorPartialStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_updates_arrive_before_provider_finishes(self):
        second = asyncio.Event()
        release = asyncio.Event()
        finished = asyncio.Event()
        updates = []

        async def chunks(**kwargs):
            yield StreamOutput.model_construct(text="a")
            yield StreamOutput.model_construct(text="ab")
            await release.wait()
            yield StreamOutput(text="abc")
            finished.set()

        async def collect(update):
            if update.kind == "partial":
                updates.append(update.partial.text)
                if len(updates) == 2:
                    second.set()

        with fake_instructor(chunks) as (_, sdk, partial):
            task = asyncio.create_task(
                InstructorClient().create_partial_structured(
                    role="researcher", response_model=StreamOutput,
                    messages=[{"role": "user", "content": "topic"}],
                    api_key="fixture-secret", model_override="model",
                    on_delta=collect,
                )
            )
            try:
                await asyncio.wait_for(second.wait(), 0.25)
                self.assertEqual(updates, ["a", "ab"])
                self.assertFalse(task.done())
                self.assertFalse(finished.is_set())
                self.assertFalse(release.is_set())
                release.set()
                self.assertEqual((await task).text, "abc")
                partial.assert_called_once()
                self.assertEqual(
                    partial.call_args.kwargs["max_retries"].stop.max_attempt_number,
                    1,
                )
                sdk.close.assert_awaited_once()
            finally:
                release.set()
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_final_chunk_is_validated_against_full_model(self):
        async def invalid(**kwargs):
            yield StreamOutput.model_construct(text="a")

        with fake_instructor(invalid) as (_, sdk, partial):
            with self.assertRaises(ValidationError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                )
            partial.assert_called_once()
            sdk.close.assert_awaited_once()

    async def test_role_cache_reasoning_and_token_clamp_are_preserved(self):
        async def valid(**kwargs):
            yield StreamOutput(text="complete")

        with fake_instructor(valid) as (constructor, _, partial):
            await InstructorClient().create_partial_structured(
                role="generator", response_model=StreamOutput,
                messages=[{"role": "user", "content": "topic"}],
                api_key="secret", model_override=" anthropic/model ",
                system_prompt="stable prefix",
                attribution_headers={"HTTP-Referer": "https://a2ui.test"},
                reasoning_params={"reasoning": {"effort": "low"}},
                max_completion_tokens=321,
            )
            args = partial.call_args.kwargs
            self.assertEqual(args["model"], "anthropic/model")
            self.assertEqual(args["max_tokens"], 321)
            self.assertEqual(args["temperature"], 0.7)
            self.assertEqual(args["extra_body"],
                             {"reasoning": {"effort": "low"}})
            self.assertEqual(args["messages"][0]["content"][0]
                             ["cache_control"], {"type": "ephemeral"})
            self.assertEqual(constructor.call_args.kwargs["max_retries"], 0)


if __name__ == "__main__":
    unittest.main()
