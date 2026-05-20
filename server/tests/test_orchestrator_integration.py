"""
============================================================================
FILE: test_orchestrator_integration.py
LOCATION: server/tests/test_orchestrator_integration.py
============================================================================
PURPOSE:
    Integration tests for CourseOrchestrator with live dependencies.
    Provides end-to-end course generation test against real OpenRouter
    API and database.
ROLE IN PROJECT:
    Manual verification gate for production readiness of the orchestration
    pipeline with live OpenRouter credentials.
    - Skipped by default; enabled via RUN_INTEGRATION_TESTS=1
    - Requires OPENROUTER_API_KEY environment variable
    - Consumes real API quota; use sparingly
KEY COMPONENTS:
    - TestCourseOrchestratorIntegration: End-to-end generation test
DEPENDENCIES:
    - External: unittest, os
    - Internal: server.services.course_orchestrator
USAGE:
    ```bash
    RUN_INTEGRATION_TESTS=1 OPENROUTER_API_KEY=sk-... python -m unittest \
        server.tests.test_orchestrator_integration
    ```
============================================================================
"""

# test_orchestrator_integration.py
# Integration tests for CourseOrchestrator with live dependencies

# Longer description (2-4 lines):
# - Provides manual integration test instructions for orchestrator wiring.
# - Uses skipUnless to protect external dependency execution.
# - Serves as a template when RUN_INTEGRATION_TESTS is enabled.
# - Requires OPENROUTER_API_KEY for LLM access.

# @see: server/services/course_orchestrator.py - Orchestrator implementation
# @note: Requires live OpenRouter credentials and database access

import os
import unittest

from server.services.course_orchestrator import course_orchestrator


@unittest.skipUnless(
    os.getenv("RUN_INTEGRATION_TESTS"),
    "Integration tests require RUN_INTEGRATION_TESTS=1 and credentials",
)
class TestCourseOrchestratorIntegration(unittest.IsolatedAsyncioTestCase):
    """Integration tests for CourseOrchestrator."""

    async def test_generate_course_end_to_end(self) -> None:
        """Run an end-to-end course generation against live services."""
        # NOTE:
        # - Set RUN_INTEGRATION_TESTS=1
        # - Ensure OPENROUTER_API_KEY is configured
        # - Ensure database is reachable
        result = await course_orchestrator.generate_course(
            "Explain Newtonian mechanics with 3 topics",
            user_id="integration-test-user",
        )

        self.assertIn("session", result)
        self.assertIn("nodes", result)
        self.assertGreaterEqual(len(result["nodes"]), 1)


if __name__ == "__main__":
    unittest.main()
