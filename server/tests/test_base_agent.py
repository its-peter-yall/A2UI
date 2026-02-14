"""
=============================================================================
FILE: test_base_agent.py
=============================================================================

PURPOSE:
Unit tests for BaseAgent retry behavior. Validates that BaseAgent retries
on Pydantic validation failures with proper delay handling.

KEY TESTS:
- test_generate_retries_on_validation_error: Validates retry on validation error

DEPENDENCIES:
- unittest: Python standard testing framework
- unittest.mock: AsyncMock for mocking instructor client and sleep
- pydantic: ValidationError for simulating validation failures
- server.agents.base: BaseAgent implementation under test

USAGE PATTERN:
```python
# Run base agent tests
python -m unittest server.tests.test_base_agent

# Run single test
python -m unittest server.tests.test_base_agent.TestBaseAgentRetry.test_generate_retries_on_validation_error
```

TEST SETUP:
- Creates dummy _DummyAgent and _DummyModel for testing
- Mocks instructor_client.create_structured to raise ValidationError then succeed
- Mocks asyncio.sleep to avoid test delays
- Verifies retry occurs exactly once on validation failure

RELATED FILES:
- server/agents/base.py - BaseAgent implementation with retry logic

NOTES:
- BaseAgent uses tenacity for retry logic
- Retry triggered on Pydantic ValidationError
- Sleep mocked to keep tests fast
=============================================================================
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
        result = asyncio.run(agent.generate(_DummyModel, user_message="Hello"))

        self.assertEqual(result.name, "ok")
        self.assertEqual(mock_create.call_count, 2)
        mock_sleep.assert_called_once()


if __name__ == "__main__":
    unittest.main()
