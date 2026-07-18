"""
============================================================================
FILE: test_depth_router.py
LOCATION: server/tests/test_depth_router.py
============================================================================
PURPOSE:
    Unit tests for depth mode resolution and classify fallback.
USAGE:
    python -m unittest server.tests.test_depth_router -v
============================================================================
"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from server.schemas.llm import LLMContext
from server.services.depth_router import (
    DepthRouteResult,
    classify_depth,
    resolve_depth_mode,
)


class DepthRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.llm = LLMContext(api_key="k", model="test/model")

    async def test_explicit_lite_skips_classify(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            result = await resolve_depth_mode(
                query="Placebo Effect",
                mode="lite",
                llm_context=self.llm,
            )
            self.assertEqual(result, "lite")
            mock_classify.assert_not_awaited()

    async def test_explicit_full_skips_classify(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            result = await resolve_depth_mode(
                query="ML from scratch",
                mode="full",
                llm_context=self.llm,
            )
            self.assertEqual(result, "full")
            mock_classify.assert_not_awaited()

    async def test_auto_uses_classify(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = DepthRouteResult(
                mode="full",
                reason="multi-week domain",
            )
            result = await resolve_depth_mode(
                query="Machine learning from scratch",
                mode="auto",
                llm_context=self.llm,
            )
            self.assertEqual(result, "full")
            mock_classify.assert_awaited_once()

    async def test_auto_classify_failure_falls_back_lite(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.side_effect = RuntimeError("timeout")
            result = await resolve_depth_mode(
                query="anything",
                mode="auto",
                llm_context=self.llm,
            )
            self.assertEqual(result, "lite")

    async def test_classify_depth_returns_structured_mode(self) -> None:
        with patch(
            "server.services.depth_router.instructor_client.create_structured",
            new_callable=AsyncMock,
        ) as mock_create:
            mock_create.return_value = DepthRouteResult(
                mode="lite",
                reason="single concept",
            )
            result = await classify_depth(
                query="Placebo Effect",
                llm_context=self.llm,
            )
            self.assertEqual(result.mode, "lite")
            mock_create.assert_awaited_once()
            kwargs = mock_create.call_args.kwargs
            self.assertEqual(kwargs["role"], "depth_router")


if __name__ == "__main__":
    unittest.main()
