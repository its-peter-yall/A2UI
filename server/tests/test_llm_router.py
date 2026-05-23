"""
============================================================================
FILE: test_llm_router.py
LOCATION: server/tests/test_llm_router.py
============================================================================
PURPOSE:
    Unit tests for the LLM router (/llm/models) endpoint. Validates
    authentication requirements and response structure when proxying
    OpenRouter model queries.
ROLE IN PROJECT:
    Ensures the LLM router correctly enforces X-OpenRouter-Key
    authentication and returns properly structured model responses.
    - Tests 401 behavior when key is missing or empty
    - Tests successful model listing with mocked OpenRouter response
KEY COMPONENTS:
    - TestLLMRouterAuth: Authentication enforcement tests
    - TestLLMRouterModels: Model listing behavior tests
DEPENDENCIES:
    - External: unittest, unittest.mock, fastapi
    - Internal: server.routers.llm
USAGE:
    python -m unittest server.tests.test_llm_router
============================================================================
"""

import unittest
from unittest.mock import AsyncMock, patch, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routers.llm import router as llm_router


class TestLLMRouterAuth(unittest.TestCase):
    """Tests for /llm/models authentication enforcement."""

    def test_list_models_returns_401_without_key(self) -> None:
        """GET /llm/models without X-OpenRouter-Key header returns 401."""
        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        response = client.get("/llm/models")

        self.assertEqual(response.status_code, 401)
        detail = response.json().get("detail", "")
        self.assertIn("X-OpenRouter-Key", detail)

    def test_list_models_returns_401_with_empty_key(self) -> None:
        """GET /llm/models with empty X-OpenRouter-Key header returns 401."""
        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        response = client.get(
            "/llm/models",
            headers={"X-OpenRouter-Key": "   "},
        )

        self.assertEqual(response.status_code, 401)

    def test_list_models_returns_401_with_none_key(self) -> None:
        """GET /llm/models with None-equivalent key returns 401."""
        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        response = client.get(
            "/llm/models",
            headers={"X-OpenRouter-Key": ""},
        )

        self.assertEqual(response.status_code, 401)


class TestLLMRouterModels(unittest.TestCase):
    """Tests for /llm/models successful response behavior."""

    def test_list_models_returns_trimmed_model_list(self) -> None:
        """GET /llm/models returns trimmed model data from OpenRouter."""
        mock_data = [
            {
                "id": "google/gemini-2.5-pro",
                "name": "Gemini 2.5 Pro",
                "context_length": 1000000,
            },
            {
                "id": "google/gemini-2.5-flash",
                "name": "Gemini 2.5 Flash",
                "context_length": 1000000,
            },
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": mock_data}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        mock_client_ctx = AsyncMock()
        mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_ctx.__aexit__ = AsyncMock(return_value=False)

        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        with patch(
            "server.routers.llm.httpx.AsyncClient",
            return_value=mock_client_ctx,
        ):
            response = client.get(
                "/llm/models",
                headers={"X-OpenRouter-Key": "test-key"},
            )

        self.assertEqual(response.status_code, 200)
        models = response.json()
        self.assertEqual(len(models), 2)
        self.assertEqual(models[0]["id"], "google/gemini-2.5-pro")
        self.assertEqual(models[1]["id"], "google/gemini-2.5-flash")
        # Verify key fields are present (matches ModelResponse schema)
        for model in models:
            self.assertIn("id", model)
            self.assertIn("name", model)
            self.assertIn("context_length", model)

    def test_list_models_returns_502_on_upstream_error(self) -> None:
        """GET /llm/models returns 502 when OpenRouter returns non-200."""
        mock_response = MagicMock()
        mock_response.status_code = 502
        mock_response.text = "Bad Gateway"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        mock_client_ctx = AsyncMock()
        mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_ctx.__aexit__ = AsyncMock(return_value=False)

        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        with patch(
            "server.routers.llm.httpx.AsyncClient",
            return_value=mock_client_ctx,
        ):
            response = client.get(
                "/llm/models",
                headers={"X-OpenRouter-Key": "test-key"},
            )

        self.assertEqual(response.status_code, 502)

    def test_list_models_returns_401_on_upstream_auth_failure(self) -> None:
        """GET /llm/models returns 401 when OpenRouter rejects the key."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        mock_client_ctx = AsyncMock()
        mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_ctx.__aexit__ = AsyncMock(return_value=False)

        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        with patch(
            "server.routers.llm.httpx.AsyncClient",
            return_value=mock_client_ctx,
        ):
            response = client.get(
                "/llm/models",
                headers={"X-OpenRouter-Key": "bad-key"},
            )

        self.assertEqual(response.status_code, 401)


class TestLLMRouterGeneralCompute(unittest.TestCase):
    """Tests for /llm/models with General Compute provider."""

    def test_list_models_generalcompute_returns_models(self) -> None:
        """GET /llm/models with General Compute returns models."""
        mock_data = [
            {"id": "gc-model-1"},
            {"id": "gc-model-2"},
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": mock_data}

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_client_ctx = AsyncMock()
        mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_ctx.__aexit__ = AsyncMock(return_value=False)

        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        with patch(
            "server.routers.llm.httpx.AsyncClient",
            return_value=mock_client_ctx,
        ):
            response = client.get(
                "/llm/models",
                headers={
                    "X-AI-Provider": "generalcompute",
                    "X-GeneralCompute-Key": "gc-test-key",
                },
            )

        self.assertEqual(response.status_code, 200)
        models = response.json()
        self.assertEqual(len(models), 2)
        self.assertEqual(models[0]["id"], "gc-model-1")
        self.assertEqual(models[0]["name"], "gc-model-1")
        self.assertIsNone(models[0]["context_length"])

    def test_list_models_generalcompute_returns_401_without_key(self) -> None:
        """GET /llm/models with GC provider but missing GC key returns 401."""
        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        response = client.get(
            "/llm/models",
            headers={"X-AI-Provider": "generalcompute"},
        )

        self.assertEqual(response.status_code, 401)
        detail = response.json().get("detail", "")
        self.assertIn("X-GeneralCompute-Key", detail)

    def test_list_models_generalcompute_returns_502_on_upstream_error(self) -> None:
        """GET /llm/models returns 502 when GC returns non-200."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_client_ctx = AsyncMock()
        mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_ctx.__aexit__ = AsyncMock(return_value=False)

        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        with patch(
            "server.routers.llm.httpx.AsyncClient",
            return_value=mock_client_ctx,
        ):
            response = client.get(
                "/llm/models",
                headers={
                    "X-AI-Provider": "generalcompute",
                    "X-GeneralCompute-Key": "gc-test-key",
                },
            )

        self.assertEqual(response.status_code, 502)

    def test_list_models_without_provider_defaults_to_openrouter(self) -> None:
        """GET /llm/models without X-AI-Provider defaults to openrouter."""
        mock_data = [{"id": "google/gemini-2.5-flash"}]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": mock_data}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        mock_client_ctx = AsyncMock()
        mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_ctx.__aexit__ = MagicMock()

        app = FastAPI()
        app.include_router(llm_router)
        client = TestClient(app, raise_server_exceptions=False)

        with patch(
            "server.routers.llm.httpx.AsyncClient",
            return_value=mock_client_ctx,
        ):
            response = client.get(
                "/llm/models",
                headers={"X-OpenRouter-Key": "test-key"},
            )

        self.assertEqual(response.status_code, 200)
        models = response.json()
        self.assertEqual(models[0]["id"], "google/gemini-2.5-flash")
