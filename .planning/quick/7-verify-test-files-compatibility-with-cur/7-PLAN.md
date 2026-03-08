---
phase: quick
plan: 7
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements:
  - QUICK-07
must_haves:
  truths:
    - All client tests run without errors
    - All server tests run without errors
    - Test coverage meets >80% threshold
    - No test files reference outdated APIs or types
  artifacts:
    - path: "client test suite"
      provides: "Vitest test results"
    - path: "server test suite"
      provides: "unittest test results"
  key_links:
    - from: "test files"
      to: "source implementation"
      via: "import statements and API calls"
---

<objective>
Verify all test files are compatible with current project functionality by running the full test suites for both client and server.

Purpose: Ensure tests reflect actual implementation state and catch any drift between test expectations and current code behavior.
Output: Test execution report with pass/fail status and coverage metrics.
</objective>

<execution_context>
@C:/Users/Peter/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Peter/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

## Test File Inventory

### Client Tests (Vitest)
Located in `client/src/` co-located with source files:
- `features/learning/*.test.tsx` - Component tests (ConceptCard, QuizFeedback, LearningPage, etc.)
- `features/learning/__tests__/*.test.tsx` - E2E tests (e2e, dashboard-e2e, revision-e2e)
- `features/learning/animations/*.test.ts` - Animation utility tests
- `hooks/useTypewriter.test.ts` - Hook tests
- `providers/QueryProvider.test.tsx` - Provider tests

### Server Tests (unittest)
Located in `server/tests/`:
- `test_base_agent.py` - Base agent functionality
- `test_course_orchestrator.py` - Course orchestration logic
- `test_generator_agent.py` - Content generation
- `test_learning_persistence.py` - Database persistence
- `test_learning_router.py` - API route tests
- `test_learning_schemas.py` - Pydantic schema validation
- `test_orchestrator_integration.py` - Integration tests
- `test_planner_agent.py` - Learning path planning
- `test_quizzer_agent.py` - Quiz generation
- `test_quiz_randomization.py` - Quiz option shuffling
- `test_session_lifecycle.py` - Session management

## Test Commands

Client: `cd client && npm run test -- --run` (single run, no watch)
Server: `cd server && python -m unittest discover -s tests -v`
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run client test suite</name>
  <files>client test output</files>
  <action>
    Execute the full client test suite using Vitest in single-run mode (no watch).
    Command: `cd client && npm run test -- --run`

    Capture the output and identify:
    - Total test count
    - Pass/fail counts
    - Any TypeScript compilation errors
    - Any failing test assertions
    - Test files that fail to load

    If tests fail due to missing dependencies, note which ones.
    If tests fail due to API/type mismatches, document the specific failures.
  </action>
  <verify>
    <automated>cd client && npm run test -- --run 2>&1 | tee test-output.log</automated>
  </verify>
  <done>Client test suite completes with output logged; pass/fail status documented</done>
</task>

<task type="auto">
  <name>Task 2: Run server test suite</name>
  <files>server test output</files>
  <action>
    Execute the full server test suite using unittest with verbose output.
    Command: `cd server && python -m unittest discover -s tests -v`

    Ensure the virtual environment is activated first.
    Capture the output and identify:
    - Total test count
    - Pass/fail counts
    - Import errors (indicating moved/renamed modules)
    - Assertion failures
    - Database-related errors

    Note any tests that require environment variables or external services.
  </action>
  <verify>
    <automated>cd server && python -m unittest discover -s tests -v 2>&1 | tee test-output.log</automated>
  </verify>
  <done>Server test suite completes with output logged; pass/fail status documented</done>
</task>

<task type="auto">
  <name>Task 3: Analyze and report compatibility issues</name>
  <files>test-compatibility-report.md</files>
  <action>
    Analyze test results from both client and server and create a compatibility report.

    Report structure:
    1. Executive Summary
       - Client: X tests, Y passed, Z failed
       - Server: X tests, Y passed, Z failed
       - Overall compatibility status: COMPATIBLE / ISSUES FOUND

    2. Client Test Issues (if any)
       - List failing tests with error messages
       - Categorize: Type error, API mismatch, missing mock, other
       - Suggested fixes for each category

    3. Server Test Issues (if any)
       - List failing tests with error messages
       - Categorize: Import error, schema mismatch, logic error, other
       - Suggested fixes for each category

    4. Recommendations
       - Priority fixes (blocking)
       - Nice-to-have improvements
       - Tests needing updates vs. code needing fixes

    Write report to `.planning/quick/7-verify-test-files-compatibility-with-cur/test-compatibility-report.md`
  </action>
  <verify>
    <automated>cat .planning/quick/7-verify-test-files-compatibility-with-cur/test-compatibility-report.md | head -50</automated>
  </verify>
  <done>Compatibility report created with clear pass/fail status and actionable recommendations</done>
</task>

</tasks>

<verification>
- Both test suites executed successfully
- All output captured and analyzed
- Report documents current compatibility state
- Any failures categorized by root cause
</verification>

<success_criteria>
- Client tests run without fatal errors (some failures acceptable if documented)
- Server tests run without fatal errors (some failures acceptable if documented)
- Compatibility report created with clear findings
- Report includes actionable recommendations for any issues found
</success_criteria>

<output>
After completion, create `.planning/quick/7-verify-test-files-compatibility-with-cur/7-SUMMARY.md`
</output>
