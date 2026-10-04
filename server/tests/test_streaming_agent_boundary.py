"""
============================================================================
FILE: test_streaming_agent_boundary.py
LOCATION: server/tests/test_streaming_agent_boundary.py
============================================================================
PURPOSE:
    Verifies BaseAgent streaming resolution, retries, and cancellation.
ROLE IN PROJECT:
    Locks the shared generate_streaming boundary used by P2/P3 producers.
    - Forwards role/provider/callback arguments
    - Ensures transport retry and callback failures stay charge-safe
KEY COMPONENTS:
    - StreamingAgentBoundaryTests: Retry, cancel, and resolution tests
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from pydantic import SecretStr
from tenacity import wait_none

from server.agents.base import BaseAgent
from server.schemas.llm import AIProviderEnum, AgentModelConfig, LLMContext
from server.tests.realtime_foundation_helpers import (
    StreamOutput, fake_instructor,
)
from server.utils.instructor_client import InstructorClient, StreamCallbackError


class FixtureAgent(BaseAgent):
    @property
    def system_prompt(self):
        return "default prompt"


class StreamingAgentBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_base_agent_resolves_role_and_forwards_callback(self):
        callback = AsyncMock()
        ctx = LLMContext(
            api_key=SecretStr("or-secret"), model="main",
            openrouter_api_key=SecretStr("or-secret"),
            generalcompute_api_key=SecretStr("gc-secret"),
            max_completion_tokens=123,
            agent_models={"planner": AgentModelConfig(
                model="planner/model", provider=AIProviderEnum.GENERALCOMPUTE,
                thinking_enabled=True, thinking_effort="low",
            )},
        )
        with patch(
            "server.agents.base.instructor_client.create_partial_structured",
            new_callable=AsyncMock,
        ) as create:
            create.return_value = StreamOutput(text="done")
            result = await FixtureAgent("planner").generate_streaming(
                StreamOutput, "topic", context={"scope": "Basics"},
                llm_context=ctx, system_prompt_override="override",
                on_delta=callback, initial_attempt=2,
            )
            self.assertEqual(result.text, "done")
            args = create.await_args.kwargs
            self.assertEqual(args["api_key"], "gc-secret")
            self.assertEqual(args["model_override"], "planner/model")
            self.assertEqual(args["provider"], AIProviderEnum.GENERALCOMPUTE)
            self.assertEqual(args["reasoning_params"],
                             {"reasoning": {"effort": "low"}})
            self.assertIn("override", args["system_prompt"])
            self.assertIn("Basics", args["system_prompt"])
            self.assertIs(args["on_delta"], callback)
            self.assertEqual(args["initial_attempt"], 2)
            self.assertEqual(args["max_completion_tokens"], 123)

    async def test_transport_retry_starts_new_attempt_before_new_text(self):
        calls = 0
        updates = []
        async def chunks(**kwargs):
            nonlocal calls
            calls += 1
            yield StreamOutput(text="first" if calls == 1 else "second")
            if calls == 1:
                raise OSError("provider disconnected")
        async def collect(update):
            updates.append((update.kind, update.attempt))
        with fake_instructor(chunks), patch(
            "server.utils.instructor_client.wait_exponential",
            return_value=wait_none(),
        ):
            result = await InstructorClient().create_partial_structured(
                role="generator", response_model=StreamOutput,
                messages=[], api_key="secret", model_override="model",
                on_delta=collect,
            )
        self.assertEqual(result.text, "second")
        self.assertEqual(updates, [("attempt_started", 1), ("partial", 1),
                                   ("attempt_started", 2), ("partial", 2)])
        self.assertEqual(calls, 2)

    async def test_cancellation_closes_stream_without_retry(self):
        entered = asyncio.Event()
        closed = asyncio.Event()
        async def chunks(**kwargs):
            try:
                yield StreamOutput(text="draft")
                entered.set()
                await asyncio.Event().wait()
            finally:
                closed.set()
        with fake_instructor(chunks) as (_, sdk, partial):
            task = asyncio.create_task(
                InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                )
            )
            await asyncio.wait_for(entered.wait(), 0.25)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(closed.is_set())
            partial.assert_called_once()
            sdk.close.assert_awaited_once()

    async def test_callback_failure_never_makes_another_chargeable_call(self):
        async def chunks(**kwargs):
            yield StreamOutput(text="draft")
        callback = AsyncMock(side_effect=RuntimeError("display failure"))
        with fake_instructor(chunks) as (_, _, partial):
            with self.assertRaises(StreamCallbackError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                    on_delta=callback,
                )
            self.assertEqual(partial.call_count, 0)

    async def test_retry_budget_cannot_exceed_attempt_five(self):
        starts = []
        async def chunks(**kwargs):
            raise OSError("transport failure")
            yield StreamOutput(text="unreachable")
        async def collect(update):
            if update.kind == "attempt_started":
                starts.append(update.attempt)
        with fake_instructor(chunks) as (_, _, partial), patch(
            "server.utils.instructor_client.wait_exponential",
            return_value=wait_none(),
        ):
            with self.assertRaises(OSError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                    initial_attempt=4, on_delta=collect,
                )
            self.assertEqual(partial.call_count, 2)
            self.assertEqual(starts, [4, 5])


if __name__ == "__main__":
    unittest.main()
