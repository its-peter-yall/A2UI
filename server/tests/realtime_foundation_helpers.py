"""
============================================================================
FILE: realtime_foundation_helpers.py
LOCATION: server/tests/realtime_foundation_helpers.py
============================================================================
PURPOSE:
    Shared doubles for structured partial-stream unit tests.
ROLE IN PROJECT:
    Isolates Instructor/OpenAI SDK construction so P1 streaming tests can
    observe in-flight partials without paid provider calls.
    - Supplies a tiny validated stream model
    - Patches AsyncOpenAI and instructor.from_openai
KEY COMPONENTS:
    - StreamOutput: Minimal Pydantic stream payload
    - fake_instructor: Context manager yielding constructor/sdk/partial mocks
============================================================================
"""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import BaseModel, Field


class StreamOutput(BaseModel):
    text: str = Field(min_length=3)


@contextmanager
def fake_instructor(stream_factory):
    sdk = MagicMock()
    sdk.close = AsyncMock()
    partial = MagicMock(side_effect=stream_factory)
    wrapped = SimpleNamespace(chat=SimpleNamespace(
        completions=SimpleNamespace(create_partial=partial),
    ))
    with patch(
        "server.utils.instructor_client.AsyncOpenAI", return_value=sdk,
    ) as constructor, patch(
        "server.utils.instructor_client.instructor.from_openai",
        return_value=wrapped,
    ):
        yield constructor, sdk, partial
