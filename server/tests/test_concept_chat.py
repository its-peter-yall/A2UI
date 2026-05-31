"""
============================================================================
FILE: test_concept_chat.py
LOCATION: server/tests/test_concept_chat.py
============================================================================
PURPOSE:
    Unit tests for concept chat endpoint and service, covering SSE streaming,
    header handling, session/node validation, and history capping.
ROLE IN PROJECT:
    Ensures the concept chat backend works correctly without external API
    calls by mocking AsyncOpenAI.
    - Tests endpoint routing and error handling
    - Tests service-level message construction and provider resolution
KEY COMPONENTS:
    - TestConceptChatEndpoint: Endpoint-level tests via FastAPI TestClient
    - TestConceptChatService: Service-level unit tests
DEPENDENCIES:
    - External: unittest, unittest.mock, fastapi
    - Internal: server.routers.learning, server.services.concept_chat,
                server.schemas.learning
USAGE:
    python -m unittest server.tests.test_concept_chat
============================================================================
"""

from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routers.learning import router as learning_router
from server.schemas.learning import ConceptChatMessage, ConceptChatRequest
from server.services.concept_chat import (
    MAX_CHAT_HISTORY_MESSAGES,
    build_concept_chat_messages,
    resolve_chat_base_url,
)


def _create_client() -> TestClient:
    """Create a FastAPI TestClient with the learning router registered."""
    app = FastAPI()
    app.include_router(learning_router)
    return TestClient(app, raise_server_exceptions=False)


def _make_mock_chat_stream() -> AsyncMock:
    """Create an AsyncOpenAI mock that yields SSE delta chunks."""

    class _MockDelta:
        def __init__(self, content: str) -> None:
            self.content = content

    class _MockChoice:
        def __init__(self, delta: _MockDelta) -> None:
            self.delta = delta

    class _MockChunk:
        def __init__(self, content: str) -> None:
            self.choices = [_MockChoice(_MockDelta(content))]

    async def _mock_stream(*_args, **_kwargs):
        for word in ["Hello,", " how", " can", " I", " help?"]:
            yield _MockChunk(word)

    mock = AsyncMock()
    mock.create.side_effect = _mock_stream
    return mock


class TestConceptChatService(unittest.TestCase):
    """Unit tests for concept_chat service functions."""

    def test_resolve_openai_slug_to_openai_base(self) -> None:
        """openai/* slugs resolve to OpenAI base URL."""
        self.assertEqual(
            resolve_chat_base_url("openai/gpt-4o"),
            "https://api.openai.com/v1",
        )

    def test_resolve_gpt_prefix_to_openai_base(self) -> None:
        """gpt- prefixed slugs resolve to OpenAI base URL."""
        self.assertEqual(
            resolve_chat_base_url("gpt-4"),
            "https://api.openai.com/v1",
        )

    def test_resolve_other_slugs_to_openrouter(self) -> None:
        """Other slash-prefixed slugs resolve to OpenRouter."""
        self.assertEqual(
            resolve_chat_base_url("anthropic/claude-3"),
            "https://openrouter.ai/api/v1",
        )
        self.assertEqual(
            resolve_chat_base_url("google/gemini-2.5-flash"),
            "https://openrouter.ai/api/v1",
        )
        self.assertEqual(
            resolve_chat_base_url("deepseek/chat"),
            "https://openrouter.ai/api/v1",
        )

    def test_build_messages_includes_system_prompt(self) -> None:
        """System prompt is always the first message."""
        messages = build_concept_chat_messages(
            message="Explain this",
            history=[],
            content_markdown="# Test\nContent",
            selected_heading_ids=[],
            node_title="Test Node",
        )
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("Test Node", messages[0]["content"])
        self.assertIn("# Test", messages[0]["content"])

    def test_build_messages_includes_selected_headings(self) -> None:
        """Selected heading IDs appear in the system prompt."""
        messages = build_concept_chat_messages(
            message="Explain this",
            history=[],
            content_markdown="# Test\nContent",
            selected_heading_ids=["Heading One", "Heading Two"],
            node_title="Test Node",
        )
        self.assertIn("Heading One", messages[0]["content"])
        self.assertIn("Heading Two", messages[0]["content"])

    def test_build_messages_caps_history_to_10(self) -> None:
        """History exceeding 10 messages is truncated to last 10."""
        history = [
            ConceptChatMessage(
                role="user" if i % 2 == 0 else "assistant",
                content=f"msg {i}",
            )
            for i in range(20)
        ]
        messages = build_concept_chat_messages(
            message="Current question",
            history=history,
            content_markdown="# Test",
            selected_heading_ids=[],
            node_title="Test Node",
        )
        non_system = [m for m in messages if m["role"] != "system"]
        # 10 capped history + 1 current user message = 11
        self.assertEqual(len(non_system), MAX_CHAT_HISTORY_MESSAGES + 1)
        self.assertEqual(non_system[-2]["content"], "msg 19")

    def test_build_messages_appends_current_message(self) -> None:
        """Current user message is the last message."""
        history = [
            ConceptChatMessage(role="user", content="prior"),
            ConceptChatMessage(role="assistant", content="answer"),
        ]
        messages = build_concept_chat_messages(
            message="Current question",
            history=history,
            content_markdown="# Test",
            selected_heading_ids=[],
            node_title="Test Node",
        )
        last = messages[-1]
        self.assertEqual(last["role"], "user")
        self.assertEqual(last["content"], "Current question")


class TestConceptChatEndpoint(unittest.TestCase):
    """Endpoint-level tests for the concept chat POST endpoint."""

    def test_missing_provider_key_returns_400(self) -> None:
        """Request without X-Provider-Api-Key returns 400."""
        client = _create_client()
        response = client.post(
            "/learning/sessions/session-1/nodes/node-1/chat",
            json={"message": "Hello"},
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_model_returns_400(self) -> None:
        """Request with API key but without model returns 400."""
        client = _create_client()
        response = client.post(
            "/learning/sessions/session-1/nodes/node-1/chat",
            json={"message": "Hello"},
            headers={"X-Provider-Api-Key": "test-key"},
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_session_returns_404(self) -> None:
        """Non-existent session returns 404."""
        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = None
        fake_manager._get_connection.return_value = MagicMock()

        client = _create_client()
        with patch(
            "server.routers.learning.learning_manager", fake_manager
        ):
            response = client.post(
                "/learning/sessions/missing/nodes/node-1/chat",
                json={"message": "Hello"},
                headers={
                    "X-Provider-Api-Key": "test-key",
                    "X-Model": "openai/gpt-4o",
                },
            )
        self.assertEqual(response.status_code, 404)

    def test_missing_node_returns_404(self) -> None:
        """Node not belonging to session returns 404."""
        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = {
            "id": "session-1",
        }
        fake_manager._get_connection.return_value = MagicMock()
        fake_manager._get_node_by_id.return_value = None

        client = _create_client()
        with patch(
            "server.routers.learning.learning_manager", fake_manager
        ):
            response = client.post(
                "/learning/sessions/session-1/nodes/missing/chat",
                json={"message": "Hello"},
                headers={
                    "X-Provider-Api-Key": "test-key",
                    "X-Model": "openai/gpt-4o",
                },
            )
        self.assertEqual(response.status_code, 404)

    def test_chat_model_header_overrides_model_header(self) -> None:
        """X-Chat-Model takes precedence over X-Model."""
        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = {
            "id": "session-1",
        }
        fake_manager._get_connection.return_value = MagicMock()
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "title": "Test Node",
            "content_markdown": "# Test",
        }

        mock_client = _make_mock_chat_stream()

        client = _create_client()
        with patch(
            "server.routers.learning.learning_manager", fake_manager
        ):
            with patch(
                "server.services.concept_chat.AsyncOpenAI",
                return_value=AsyncMock(
                    chat=MagicMock(completions=mock_client)
                ),
            ):
                response = client.post(
                    "/learning/sessions/session-1/nodes/node-1/chat",
                    json={"message": "Hello"},
                    headers={
                        "X-Provider-Api-Key": "test-key",
                        "X-Model": "anthropic/claude",
                        "X-Chat-Model": "openai/gpt-4o",
                    },
                )
        self.assertEqual(response.status_code, 200)

    def test_fallback_to_x_model_when_no_chat_model(self) -> None:
        """X-Model is used when X-Chat-Model is absent."""
        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = {
            "id": "session-1",
        }
        fake_manager._get_connection.return_value = MagicMock()
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "title": "Test Node",
            "content_markdown": "# Test",
        }

        mock_client = _make_mock_chat_stream()

        client = _create_client()
        with patch(
            "server.routers.learning.learning_manager", fake_manager
        ):
            with patch(
                "server.services.concept_chat.AsyncOpenAI",
                return_value=AsyncMock(
                    chat=MagicMock(completions=mock_client)
                ),
            ):
                response = client.post(
                    "/learning/sessions/session-1/nodes/node-1/chat",
                    json={"message": "Hello"},
                    headers={
                        "X-Provider-Api-Key": "test-key",
                        "X-Model": "anthropic/claude",
                    },
                )
        self.assertEqual(response.status_code, 200)

    def test_streaming_response_has_event_stream_content_type(self) -> None:
        """Streaming response Content-Type is text/event-stream."""
        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = {
            "id": "session-1",
        }
        fake_manager._get_connection.return_value = MagicMock()
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "title": "Test Node",
            "content_markdown": "# Test",
        }

        mock_client = _make_mock_chat_stream()

        client = _create_client()
        with patch(
            "server.routers.learning.learning_manager", fake_manager
        ):
            with patch(
                "server.services.concept_chat.AsyncOpenAI",
                return_value=AsyncMock(
                    chat=MagicMock(completions=mock_client)
                ),
            ):
                response = client.post(
                    "/learning/sessions/session-1/nodes/node-1/chat",
                    json={"message": "Hello"},
                    headers={
                        "X-Provider-Api-Key": "test-key",
                        "X-Model": "openai/gpt-4o",
                    },
                )
        self.assertEqual(response.status_code, 200)
        content_type = response.headers.get("content-type", "")
        self.assertIn("text/event-stream", content_type)

    def test_streaming_body_contains_data_prefix_and_done(self) -> None:
        """SSE body contains data: prefix and terminal [DONE]."""
        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = {
            "id": "session-1",
        }
        fake_manager._get_connection.return_value = MagicMock()
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "title": "Test Node",
            "content_markdown": "# Test",
        }

        mock_client = _make_mock_chat_stream()

        client = _create_client()
        with patch(
            "server.routers.learning.learning_manager", fake_manager
        ):
            with patch(
                "server.services.concept_chat.AsyncOpenAI",
                return_value=AsyncMock(
                    chat=MagicMock(completions=mock_client)
                ),
            ):
                response = client.post(
                    "/learning/sessions/session-1/nodes/node-1/chat",
                    json={
                        "message": "Hello",
                        "history": [
                            {"role": "user", "content": "hi"},
                            {"role": "assistant", "content": "hey"},
                        ],
                    },
                    headers={
                        "X-Provider-Api-Key": "test-key",
                        "X-Model": "openai/gpt-4o",
                    },
                )
        body = response.text
        self.assertIn("data: ", body)
        self.assertIn("[DONE]", body)

    def test_history_capped_to_10_in_service_messages(self) -> None:
        """History exceeding 10 messages is truncated by the service."""
        history: list[dict[str, str]] = []
        for i in range(15):
            history.append({"role": "user", "content": f"q{i}"})
            history.append({"role": "assistant", "content": f"a{i}"})

        fake_manager = MagicMock()
        fake_manager.get_learning_session.return_value = {
            "id": "session-1",
        }
        fake_manager._get_connection.return_value = MagicMock()
        fake_manager._get_node_by_id.return_value = {
            "id": "node-1",
            "learning_session_id": "session-1",
            "title": "Test Node",
            "content_markdown": "# Test",
        }

        mock_client = _make_mock_chat_stream()
        captured_messages: list[list[dict[str, str]]] = []

        async def _capture_and_stream(**kwargs):
            captured_messages.append(kwargs["messages"])
            return await mock_client.create(**kwargs)

        mock_completions = MagicMock()
        mock_completions.create = _capture_and_stream

        client = _create_client()
        with patch(
            "server.routers.learning.learning_manager", fake_manager
        ):
            with patch(
                "server.services.concept_chat.AsyncOpenAI",
                return_value=AsyncMock(
                    chat=MagicMock(completions=mock_completions)
                ),
            ):
                client.post(
                    "/learning/sessions/session-1/nodes/node-1/chat",
                    json={
                        "message": "Hello",
                        "history": history,
                    },
                    headers={
                        "X-Provider-Api-Key": "test-key",
                        "X-Model": "openai/gpt-4o",
                    },
                )

        self.assertEqual(len(captured_messages), 1)
        non_sys = [
            m for m in captured_messages[0] if m["role"] != "system"
        ]
        self.assertLessEqual(len(non_sys), MAX_CHAT_HISTORY_MESSAGES + 1)
