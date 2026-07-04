"""
============================================================================
FILE: test_generator_agent.py
LOCATION: server/tests/test_generator_agent.py
============================================================================
PURPOSE:
    Unit tests for the GeneratorAgent including Mermaid validation retry logic.
ROLE IN PROJECT:
    Ensures that GeneratorAgent correctly retries prompt generation when the LLM
    returns invalid Mermaid syntax.
KEY COMPONENTS:
    - TestGeneratorAgent: Test case class with mocked LLM content generation
DEPENDENCIES:
    - External: unittest, unittest.mock
    - Internal: server.agents.generator, server.schemas.learning
USAGE:
    python -m unittest server/tests/test_generator_agent.py
============================================================================
"""

import unittest
from unittest.mock import AsyncMock, patch

from server.agents.generator import GeneratorAgent, GeneratedContent
from server.schemas.learning import TopicNode
from server.schemas.llm import LLMContext, AIProviderEnum


class TestGeneratorAgent(unittest.IsolatedAsyncioTestCase):
    async def test_generate_explanation_retries_on_invalid_mermaid(self) -> None:
        agent = GeneratorAgent()

        # Mock the generate method
        mock_generate = AsyncMock()
        agent.generate = mock_generate

        # First return content has invalid Mermaid syntax (missing connector)
        invalid_content = GeneratedContent(
            content_markdown='Here is a diagram:\n```mermaid\nflowchart TD\n    A["First"] B["Second"]\n```' + ' ' * 300,
            key_takeaways=["Takeaway 1", "Takeaway 2", "Takeaway 3"]
        )

        # Second return content has valid Mermaid syntax
        valid_content = GeneratedContent(
            content_markdown='Here is a diagram:\n```mermaid\nflowchart TD\n    A["First"] --> B["Second"]\n```' + ' ' * 300,
            key_takeaways=["Takeaway 1", "Takeaway 2", "Takeaway 3"]
        )

        mock_generate.side_effect = [invalid_content, valid_content]

        topic = TopicNode(
            index=1,
            title="Introduction to LLMs",
            summary_for_context="Understanding how LLMs work",
            key_terms=["LLM", "Transformer"],
            complexity="Basic",
            quiz_count=3
        )

        llm_ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="fake-key",
            model="openai/gpt-4o-mini"
        )

        result = await agent.generate_explanation(
            topic=topic,
            prev_summary=None,
            next_summary=None,
            llm_context=llm_ctx
        )

        # Check that it returned the valid content
        self.assertEqual(result.content_markdown, valid_content.content_markdown)
        
        # Check that it called generate twice
        self.assertEqual(mock_generate.call_count, 2)

        # Verify that the second call's user_message contains the retry feedback
        second_call_args = mock_generate.call_args_list[1]
        user_message_arg = second_call_args.kwargs.get("user_message")
        self.assertIn("RETRY FEEDBACK", user_message_arg)
        self.assertIn("Mermaid Block #1 is invalid", user_message_arg)
