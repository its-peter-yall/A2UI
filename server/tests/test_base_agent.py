"""
============================================================================
FILE: test_base_agent.py
LOCATION: server/tests/test_base_agent.py
============================================================================
PURPOSE:
    Unit tests for BaseAgent retry behavior. Validates that BaseAgent
    retries on Pydantic validation failures with proper delay handling.
ROLE IN PROJECT:
    Ensures the shared agent base class correctly retries on transient
    LLM validation errors before propagating failures.
    - Covers retry-on-validation-error path in BaseAgent.generate()
    - Verifies sleep is awaited to avoid tight retry loops
KEY COMPONENTS:
    - TestBaseAgentRetry: Tests retry logic on ValidationError
    - _DummyAgent / _DummyModel: Minimal fixtures for testing
DEPENDENCIES:
    - External: unittest, pydantic
    - Internal: server.agents.base
USAGE:
    ```python
    python -m unittest server.tests.test_base_agent
    ```
============================================================================
"""

# test_base_agent.py
# Unit tests for BaseAgent retry behavior

# Verifies BaseAgent retries on Pydantic validation failures.
# Uses a dummy agent and mocked instructor client responses.
# Ensures retry delay is awaited without slowing tests.

# @see: server/agents/base.py - BaseAgent implementation
# @note: Asyncio sleep is mocked to keep tests fast

import unittest
from unittest.mock import AsyncMock, patch

from pydantic import BaseModel, ValidationError

from server.agents.base import BaseAgent
from server.schemas.llm import LLMContext


class _DummyModel(BaseModel):
    name: str


class _DummyAgent(BaseAgent):
    @property
    def system_prompt(self) -> str:
        return "Dummy prompt"


def _make_validation_error() -> ValidationError:
    try:
        _DummyModel.model_validate({})
    except ValidationError as exc:
        return exc
    raise AssertionError("Expected ValidationError")


class TestBaseAgentRetry(unittest.TestCase):
    @patch("server.agents.base.asyncio.sleep", new_callable=AsyncMock)
    @patch(
        "server.agents.base.instructor_client.create_structured",
        new_callable=AsyncMock,
    )
    def test_generate_retries_on_validation_error(
        self, mock_create: AsyncMock, mock_sleep: AsyncMock
    ) -> None:
        import asyncio

        validation_error = _make_validation_error()
        mock_create.side_effect = [validation_error, _DummyModel(name="ok")]

        agent = _DummyAgent(role="dummy")
        result = asyncio.run(
            agent.generate(
                _DummyModel,
                user_message="Hello",
                llm_context=LLMContext(api_key="mock-key"),
            )
        )

        self.assertEqual(result.name, "ok")
        self.assertEqual(mock_create.call_count, 2)
        mock_sleep.assert_called_once()


if __name__ == "__main__":
    unittest.main()
