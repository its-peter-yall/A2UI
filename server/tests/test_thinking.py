"""
============================================================================
FILE: test_thinking.py
LOCATION: server/tests/test_thinking.py
============================================================================
PURPOSE:
    Unit tests for thinking/reasoning mode configuration in LLMContext.
ROLE IN PROJECT:
    Validates the thinking parameter handling, header extraction, and
    reasoning params generation for the OpenRouter thinking mode feature.
KEY COMPONENTS:
    - TestThinkingConfiguration: Tests for LLMContext thinking fields
    - TestReasoningParams: Tests for get_reasoning_params() method
    - TestThinkingHeaders: Tests for X-Thinking-Enabled/Effort header parsing
    - TestModelResponse: Tests for supports_thinking field
DEPENDENCIES:
    - External: unittest
    - Internal: server.schemas.llm
USAGE:
    python -m unittest server.tests.test_thinking -v
============================================================================
"""

import unittest

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from server.schemas.llm import (
    AIProviderEnum,
    LLMContext,
    ModelResponse,
    get_llm_context,
)


class TestThinkingConfiguration(unittest.TestCase):
    """Test LLMContext thinking parameter handling."""

    def test_thinking_disabled_by_default(self):
        """Thinking should be disabled when not specified."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
        )
        self.assertFalse(ctx.thinking_enabled)
        self.assertIsNone(ctx.thinking_effort)

    def test_thinking_enabled_with_effort(self):
        """Should store enabled and effort fields."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=True,
            thinking_effort="high",
        )
        self.assertTrue(ctx.thinking_enabled)
        self.assertEqual(ctx.thinking_effort, "high")

    def test_thinking_effort_validation(self):
        """Should reject invalid effort levels via pattern validation."""
        with self.assertRaises(Exception):
            LLMContext(
                provider=AIProviderEnum.OPENROUTER,
                api_key="test-key",
                thinking_enabled=True,
                thinking_effort="invalid",
            )

    def test_thinking_enabled_without_effort(self):
        """Should accept enabled without effort (effort defaults to high)."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=True,
        )
        self.assertTrue(ctx.thinking_enabled)
        self.assertIsNone(ctx.thinking_effort)


class TestReasoningParams(unittest.TestCase):
    """Test get_reasoning_params() method behavior."""

    def test_disabled_returns_none(self):
        """Should return None when thinking is disabled."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
        )
        self.assertIsNone(ctx.get_reasoning_params())

    def test_enabled_with_effort_returns_correct_dict(self):
        """Should return reasoning params when enabled with effort."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=True,
            thinking_effort="high",
        )
        params = ctx.get_reasoning_params()
        self.assertEqual(params, {"reasoning": {"effort": "high"}})

    def test_enabled_without_effort_defaults_to_high(self):
        """Should default to 'high' effort when enabled but no effort."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=True,
        )
        params = ctx.get_reasoning_params()
        self.assertEqual(params, {"reasoning": {"effort": "high"}})

    def test_disabled_ignores_effort(self):
        """Should return None when disabled even if effort is set."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=False,
            thinking_effort="high",
        )
        self.assertIsNone(ctx.get_reasoning_params())

    def test_all_effort_levels(self):
        """Should accept all valid effort levels."""
        for effort in ["minimal", "low", "medium", "high", "xhigh"]:
            ctx = LLMContext(
                provider=AIProviderEnum.OPENROUTER,
                api_key="test-key",
                thinking_enabled=True,
                thinking_effort=effort,
            )
            params = ctx.get_reasoning_params()
            self.assertEqual(params, {"reasoning": {"effort": effort}})


class TestThinkingHeaders(unittest.TestCase):
    """Test X-Thinking-Enabled and X-Thinking-Effort header parsing."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._app = FastAPI()

        @cls._app.get("/echo-thinking")
        def _echo(ctx: LLMContext = Depends(get_llm_context)):
            return {
                "thinking_enabled": ctx.thinking_enabled,
                "thinking_effort": ctx.thinking_effort,
            }

        cls._client = TestClient(cls._app, raise_server_exceptions=False)

    def test_thinking_enabled_true(self):
        """X-Thinking-Enabled: true should set thinking_enabled=True."""
        response = self._client.get(
            "/echo-thinking",
            headers={
                "X-OpenRouter-Key": "test-key",
                "X-Thinking-Enabled": "true",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["thinking_enabled"])
        self.assertEqual(data["thinking_effort"], "high")

    def test_thinking_enabled_false(self):
        """X-Thinking-Enabled: false should set thinking_enabled=False."""
        response = self._client.get(
            "/echo-thinking",
            headers={
                "X-OpenRouter-Key": "test-key",
                "X-Thinking-Enabled": "false",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["thinking_enabled"])
        self.assertIsNone(data["thinking_effort"])

    def test_thinking_disabled_by_default(self):
        """No X-Thinking-Enabled header defaults to disabled."""
        response = self._client.get(
            "/echo-thinking",
            headers={"X-OpenRouter-Key": "test-key"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["thinking_enabled"])
        self.assertIsNone(data["thinking_effort"])

    def test_thinking_effort_passed_through(self):
        """X-Thinking-Effort: low should be passed through when enabled."""
        response = self._client.get(
            "/echo-thinking",
            headers={
                "X-OpenRouter-Key": "test-key",
                "X-Thinking-Enabled": "true",
                "X-Thinking-Effort": "low",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["thinking_enabled"])
        self.assertEqual(data["thinking_effort"], "low")

    def test_thinking_effort_all_valid_levels(self):
        """All valid effort levels should be accepted."""
        for effort in ["minimal", "low", "medium", "high", "xhigh"]:
            response = self._client.get(
                "/echo-thinking",
                headers={
                    "X-OpenRouter-Key": "test-key",
                    "X-Thinking-Enabled": "true",
                    "X-Thinking-Effort": effort,
                },
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["thinking_effort"], effort)

    def test_invalid_effort_defaults_to_high(self):
        """Invalid effort level with thinking enabled defaults to high."""
        response = self._client.get(
            "/echo-thinking",
            headers={
                "X-OpenRouter-Key": "test-key",
                "X-Thinking-Enabled": "true",
                "X-Thinking-Effort": "invalid",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["thinking_enabled"])
        self.assertEqual(data["thinking_effort"], "high")


class TestModelResponse(unittest.TestCase):
    """Test ModelResponse schema with supports_thinking field."""

    def test_default_supports_thinking_false(self):
        """supports_thinking should default to False."""
        model = ModelResponse(id="test-model")
        self.assertFalse(model.supports_thinking)

    def test_supports_thinking_true(self):
        """Should accept and store supports_thinking=True."""
        model = ModelResponse(
            id="test-model",
            name="Test Model",
            context_length=4096,
            supports_thinking=True,
        )
        self.assertTrue(model.supports_thinking)
        self.assertEqual(model.id, "test-model")
        self.assertEqual(model.name, "Test Model")
        self.assertEqual(model.context_length, 4096)


if __name__ == "__main__":
    unittest.main()
