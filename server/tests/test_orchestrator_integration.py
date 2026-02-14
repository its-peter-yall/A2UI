"""
=============================================================================
FILE: test_orchestrator_integration.py
=============================================================================

PURPOSE:
Integration tests for CourseOrchestrator with live dependencies. Provides
end-to-end course generation test against real Vertex AI and database.

KEY TESTS:
- test_generate_course_end_to_end: Full course generation with live services

DEPENDENCIES:
- unittest: Python standard testing framework
- server.services.course_orchestrator: CourseOrchestrator with live wiring

USAGE PATTERN:
```bash
# Run integration tests (requires credentials)
RUN_INTEGRATION_TESTS=1 python -m unittest server.tests.test_orchestrator_integration
```

TEST SETUP:
- Skipped by default via @unittest.skipUnless
- Requires RUN_INTEGRATION_TESTS=1 environment variable
- Requires live Vertex AI credentials configured
- Requires reachable SQLite database
- Tests against real LLM responses

RELATED FILES:
- server/services/course_orchestrator.py - CourseOrchestrator implementation
- server/agents/planner.py - PlannerAgent (live)
- server/agents/generator.py - GeneratorAgent (live)
- server/agents/quizzer.py - QuizzerAgent (live)

NOTES:
- SKIPPED by default - not run in CI/CD
- Manual verification test for production readiness
- Use sparingly - consumes API quota
- Verify credentials before running
=============================================================================
"""

# test_orchestrator_integration.py
# Integration tests for CourseOrchestrator with live dependencies

# Longer description (2-4 lines):
# - Provides manual integration test instructions for orchestrator wiring.
# - Uses skipUnless to protect external dependency execution.
# - Serves as a template when RUN_INTEGRATION_TESTS is enabled.

# @see: server/services/course_orchestrator.py - Orchestrator implementation
# @note: Requires live agent credentials and database access

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
        # - Ensure LLM credentials are configured
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
