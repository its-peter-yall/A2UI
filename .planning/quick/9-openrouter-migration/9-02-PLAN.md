---
phase: 9-openrouter-migration
plan: 02
type: execute
wave: 1
depends_on:
  - 9-01-PLAN.md
files_modified:
  - server/tests/test_course_orchestrator.py
  - server/tests/test_orchestrator_integration.py
  - server/tests/test_learning_router.py
  - server/tests/test_quizzer_agent.py
  - server/tests/(new) test_llm_router.py
  - server/utils/instructor_client.py (minor, if needed for testability)
autonomous: true
must_haves:
  truths:
    - `python -m unittest` passes after backend migration
    - Model config tests updated for OpenRouter slugs
    - New tests cover /llm/models key-required behavior
---

<objective>
Update the server test suite to match the OpenRouter architecture.

Key focus:
- Keep tests deterministic (no real API calls in unit tests).
- Integration test remains optional via env flag.
</objective>

<context>
@.planning/codebase/TESTING.md
@server/tests
@server/routers/learning.py
@server/routers/llm.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update model config assertions for OpenRouter slugs</name>
  <files>server/tests/test_quizzer_agent.py</files>
  <action>
    1. Update any assertions that hardcode Gemini model names.
       Example:
       - "gemini-2.5-flash" → "google/gemini-2.5-flash"
    2. Keep temperature/max token expectations unchanged unless code changed.
  </action>
  <verify>
    - `cd server && python -m unittest server.tests.test_quizzer_agent -v`
  </verify>
  <done>Quizzer model config tests match OpenRouter defaults.</done>
</task>

<task type="auto">
  <name>Task 2: Update CourseOrchestrator tests to pass LLM request context</name>
  <files>server/tests/test_course_orchestrator.py</files>
  <action>
    1. Identify new required parameters for orchestrator methods
       (e.g., llm_context, api_key, or headers).
    2. Update test helper setup to create a fake LLM context with:
       - api_key="test-key"
       - model=None
       - referer/title=None

    3. Ensure mocks still patch the agent methods in the right module paths.

    4. Verify tests do NOT assert on secret values.
  </action>
  <verify>
    - `cd server && python -m unittest server.tests.test_course_orchestrator -v`
  </verify>
  <done>Orchestrator tests pass with the new signature and context plumbing.</done>
</task>

<task type="auto">
  <name>Task 3: Update Learning router tests for 401 behavior when key missing</name>
  <files>server/tests/test_learning_router.py</files>
  <action>
    1. Locate tests that call POST /learning/generate (or any LLM endpoint).
    2. Add headers in TestClient requests:
       - X-OpenRouter-Key: "test-key"
       - Optional: X-OpenRouter-Model, HTTP-Referer, X-OpenRouter-Title

    3. Add at least one new test:
       - Calling /learning/generate without X-OpenRouter-Key returns 401.
  </action>
  <verify>
    - `cd server && python -m unittest server.tests.test_learning_router -v`
  </verify>
  <done>Router behavior is correct and tests cover missing-key behavior.</done>
</task>

<task type="auto">
  <name>Task 4: Add tests for /llm/models endpoint (mock OpenRouter call)</name>
  <files>server/tests/test_llm_router.py (new)</files>
  <action>
    1. Create a new unittest module using FastAPI TestClient.
    2. Patch the outbound HTTP call used by GET /llm/models.
       - If using httpx.AsyncClient: patch the method that performs the request.
       - If using openai client: patch the relevant call.

    3. Test cases:
       - Missing X-OpenRouter-Key → 401
       - Invalid key propagated from OpenRouter (401/403) → 401
       - Success → returns list with expected shape (id/name at minimum)
  </action>
  <verify>
    - `cd server && python -m unittest server.tests.test_llm_router -v`
  </verify>
  <done>/llm/models is covered by unit tests and requires no network.</done>
</task>

<task type="auto">
  <name>Task 5: Update optional integration test messaging for OpenRouter</name>
  <files>server/tests/test_orchestrator_integration.py</files>
  <action>
    1. Update docstring/comments to say "OpenRouter" instead of "Vertex".
    2. Update the skipUnless env var name if desired (optional), e.g.:
       - RUN_INTEGRATION_TESTS=1 still fine.
    3. Ensure integration test calls orchestrator with a real key.
       - Recommended: read from OPENROUTER_API_KEY env var for manual runs.
       - Even though the app is "user key only", integration tests are server-side,
         so using env var is acceptable for *manual* test runs.
  </action>
  <verify>
    - With RUN_INTEGRATION_TESTS unset, test stays skipped.
  </verify>
  <done>Integration test docs match OpenRouter and remain opt-in.</done>
</task>

</tasks>

<verification>
- `cd server && python -m unittest` passes.
- No test performs real network calls unless RUN_INTEGRATION_TESTS=1.
</verification>

<success_criteria>
- All server unit tests pass.
- Tests cover the new auth requirements and model string changes.
</success_criteria>
