"""Phase 3 cutover smoke test runner."""
from __future__ import annotations

import json
import sys
import unittest
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routers.learning import router
from server.schemas.llm import LLMContext, get_llm_context


def _result() -> dict:
    session = {
        "id": "session-smoke-1",
        "user_id": None,
        "query": "Photosynthesis basics",
        "course_title": "Photosynthesis Fundamentals",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
        "total_nodes": 3,
        "completed_nodes": 0,
    }
    nodes = [
        {
            "id": f"node-{i}",
            "learning_session_id": "session-smoke-1",
            "sequence_index": i,
            "title": f"Topic {i}",
            "content_markdown": f"Content for topic {i}",
            "status": (
                "VIEWING_EXPLANATION" if i == 0 else "LOCKED"
            ),
            "error_message": None,
            "retry_available": False,
            "complexity": (
                "Basic" if i == 0 else "Intermediate"
            ),
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
            "quiz": None,
        }
        for i in range(3)
    ]
    metrics = {
        "planner_ms": 10.5,
        "parallel_ms": 50.2,
        "serial_estimate_ms": 120.0,
        "latency_savings_ms": 69.8,
        "total_ms": 80.7,
        "cards_success": 3,
        "cards_failed": 0,
    }
    return {"session": session, "nodes": nodes, "metrics": metrics}


class Phase3SmokeTests(unittest.TestCase):
    """E2E smoke tests for Phase 3 cutover via HTTP."""

    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_llm_context] = (
            lambda: LLMContext(
                api_key="test-key", model="test/model",
            )
        )
        self.graph = AsyncMock()
        self.graph.ainvoke.return_value = _result()
        self.app.state.course_graph = self.graph
        self.client = TestClient(self.app)

    def test_generate_returns_201_with_correct_shape(self) -> None:
        response = self.client.post(
            "/learning/generate",
            json={"query": "Photosynthesis basics"},
        )
        body = response.json()

        self.assertEqual(response.status_code, 201)
        self.assertIn("id", body)
        self.assertIn("nodes", body)
        self.assertIn("query", body)
        self.assertIn("course_title", body)
        self.graph.ainvoke.assert_awaited_once()

    def test_first_node_has_viewing_explanation_status(self) -> None:
        response = self.client.post(
            "/learning/generate",
            json={"query": "Photosynthesis basics"},
        )
        body = response.json()
        nodes = body["nodes"]

        self.assertIsInstance(nodes, list)
        self.assertGreater(len(nodes), 0)
        self.assertEqual(
            nodes[0]["status"], "VIEWING_EXPLANATION",
        )

    def test_node_has_required_fields(self) -> None:
        response = self.client.post(
            "/learning/generate",
            json={"query": "Photosynthesis basics"},
        )
        body = response.json()
        first = body["nodes"][0]

        for key in ("id", "title", "status", "sequence_index"):
            self.assertIn(key, first)

    def test_graph_ainvoke_called(self) -> None:
        response = self.client.post(
            "/learning/generate",
            json={"query": "Photosynthesis basics"},
        )

        self.assertEqual(response.status_code, 201)
        self.graph.ainvoke.assert_awaited_once()



if __name__ == "__main__":
    unittest.main()
