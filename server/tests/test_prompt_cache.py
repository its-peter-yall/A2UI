"""
============================================================================
FILE: test_prompt_cache.py
LOCATION: server/tests/test_prompt_cache.py
============================================================================
PURPOSE:
    Unit tests for OpenRouter prompt caching helper utilities.
ROLE IN PROJECT:
    Guards that explicit cache_control breakpoints are attached only for
    OpenRouter + cacheable model families, and left untouched otherwise.
KEY COMPONENTS:
    - TestModelNeedsExplicitCache: Prefix allowlist behavior
    - TestApplyOpenrouterCacheControl: System-message breakpoint wrapping
DEPENDENCIES:
    - External: unittest
    - Internal: server.utils.prompt_cache
USAGE:
    python -m unittest server.tests.test_prompt_cache
============================================================================
"""

import unittest

from server.utils.prompt_cache import (
    apply_openrouter_cache_control,
    model_needs_explicit_cache,
)


class TestModelNeedsExplicitCache(unittest.TestCase):
    def test_anthropic_requires_cache(self) -> None:
        self.assertTrue(model_needs_explicit_cache("anthropic/claude-sonnet-4"))

    def test_google_requires_cache(self) -> None:
        self.assertTrue(model_needs_explicit_cache("google/gemini-2.5-pro"))

    def test_qwen_requires_cache(self) -> None:
        self.assertTrue(model_needs_explicit_cache("qwen/qwen3-coder-plus"))

    def test_openai_does_not_require_cache(self) -> None:
        self.assertFalse(model_needs_explicit_cache("openai/gpt-4o-mini"))

    def test_deepseek_does_not_require_cache(self) -> None:
        self.assertFalse(model_needs_explicit_cache("deepseek/deepseek-chat"))

    def test_empty_slug(self) -> None:
        self.assertFalse(model_needs_explicit_cache(""))


class TestApplyOpenrouterCacheControl(unittest.TestCase):
    def _messages(self) -> list[dict]:
        return [
            {"role": "system", "content": "STABLE SYSTEM PREFIX"},
            {"role": "user", "content": "hello"},
        ]

    def test_anthropic_wraps_system_with_breakpoint(self) -> None:
        out = apply_openrouter_cache_control(
            self._messages(), "openrouter", "anthropic/claude-sonnet-4"
        )
        sys_msg = out[0]
        self.assertIsInstance(sys_msg["content"], list)
        self.assertEqual(len(sys_msg["content"]), 1)
        part = sys_msg["content"][0]
        self.assertEqual(part["type"], "text")
        self.assertEqual(part["text"], "STABLE SYSTEM PREFIX")
        self.assertEqual(part["cache_control"], {"type": "ephemeral"})

    def test_openai_unchanged(self) -> None:
        original = self._messages()
        out = apply_openrouter_cache_control(
            original, "openrouter", "openai/gpt-4o-mini"
        )
        self.assertEqual(out, original)
        self.assertIsInstance(out[0]["content"], str)

    def test_generalcompute_unchanged(self) -> None:
        original = self._messages()
        out = apply_openrouter_cache_control(
            original, "generalcompute", "anthropic/claude-sonnet-4"
        )
        self.assertEqual(out, original)

    def test_existing_list_content_gets_tail_breakpoint(self) -> None:
        messages = [
            {
                "role": "system",
                "content": [
                    {"type": "text", "text": "A"},
                    {"type": "text", "text": "B"},
                ],
            }
        ]
        out = apply_openrouter_cache_control(
            messages, "openrouter", "anthropic/claude-sonnet-4"
        )
        content = out[0]["content"]
        self.assertEqual(len(content), 2)
        self.assertNotIn("cache_control", content[0])
        self.assertEqual(content[1]["cache_control"], {"type": "ephemeral"})

    def test_no_system_message_unchanged(self) -> None:
        messages = [{"role": "user", "content": "hi"}]
        out = apply_openrouter_cache_control(
            messages, "openrouter", "anthropic/claude-sonnet-4"
        )
        self.assertEqual(out, messages)


if __name__ == "__main__":
    unittest.main()
