# Codebase Concerns

**Analysis Date:** 2026-05-27

## Tech Debt

**LearningManager God Class (2984 lines):**
- Issue: `server/database/learning_persistence.py` is a monolithic 2984-line class handling all database operations for learning sessions, concept nodes, quizzes, revisions, progress tracking. `LearningManager` has 40+ methods violating Single Responsibility.
- Files: `server/database/learning_persistence.py`
- Impact: Hard to navigate, test in isolation, modify without breaking others. High cognitive load for new developers.
- Fix: Split into focused modules: `session_repository.py`, `node_repository.py`, `quiz_repository.py`, `revision_repository.py`, `progress_tracker.py`. Keep `learning_manager` as thin facade.

**Manual Connection Management:**
- Issue: Every database method opens connection with `_get_connection()` and closes in `finally: conn.close()`. 70+ explicit `conn.close()` calls across codebase. No connection pooling.
- Files: `server/database/learning_persistence.py` (all methods), `server/routers/learning.py` (lines 722, 826, 953)
- Impact: Error-prone resource management. Forgotten `finally: conn.close()` leaks connections. No reuse means per-request overhead.
- Fix: Implement connection context manager (`with self._connection() as conn:`) or connection pool. Replace all manual open/close patterns.

**Private Method Access from Routers:**
- Issue: Router code directly calls `learning_manager._get_connection()` and `learning_manager._get_node_by_id()` (private methods) to bypass public API.
- Files: `server/routers/learning.py` (lines 817-826, 942-953), `server/services/course_orchestrator.py` (lines 521-525)
- Impact: Violates encapsulation, tight coupling between layers. Changes to private internals break router code.
- Fix: Expose public `get_node_by_id(node_id)` method on `LearningManager`. Eliminate direct connection access from routers.

**Learning Router Size (1033 lines):**
- Issue: `server/routers/learning.py` contains 20+ endpoints with repetitive try/except boilerplate. Each endpoint has same error handling pattern.
- Files: `server/routers/learning.py`
- Impact: High duplication. ~40% of endpoint code is error handling boilerplate.
- Fix: Extract decorator or dependency for consistent error handling. Split into sub-routers by domain (sessions, nodes, quizzes, revisions).

**Legacy Quiz Format Handling:**
- Issue: Multiple code paths check `format_version` and branch between legacy (single QuizCard) and new (QuizSet) formats. Migration logic scattered across 5+ methods.
- Files: `server/database/learning_persistence.py` (lines 1877-1901, 2026-2044, 2474-2490)
- Impact: Each new quiz feature must handle both formats. Risk of inconsistent behavior.
- Fix: Run one-time migration to convert all legacy rows to QuizSet format. Remove legacy branching code.

**Manual Database Migrations:**
- Issue: Schema migrations via `_ensure_*_columns()` methods running `ALTER TABLE ADD COLUMN` at startup. Six separate migration methods run on every app start.
- Files: `server/database/learning_persistence.py` (lines 2816-2964)
- Impact: No versioning, rollback, or migration history. Risk of partial migrations if startup fails mid-way.
- Fix: Adopt Alembic (already in requirements) for proper migration management. Convert existing `_ensure_*` methods to initial Alembic migrations.

**App.tsx Default Export:**
- Issue: `App.tsx` uses `export default App` violating project convention of named exports only.
- Files: `client/src/App.tsx` (line 63)
- Impact: Inconsistent with codebase conventions documented in `AGENTS.md`.
- Fix: Change to `export function App()` or `export { App }`.

## Known Bugs

**CourseOrchestrator Placeholder Key Terms:**
- Symptoms: Regenerated nodes always have generic key_terms `["concept", "topic"]` instead of actual terms from original topic.
- Files: `server/services/course_orchestrator.py` (line 585)
- Trigger: Any node regeneration via `/nodes/{node_id}/regenerate` endpoint.
- Workaround: None. Key_terms not stored in database, cannot be recovered.

**SQLite FK Constraint Ignored on ALTER TABLE:**
- Symptoms: `revision_session_id` column added via `ALTER TABLE` does not enforce foreign key constraints. Deleting revision session does not cascade-delete quiz attempts.
- Files: `server/database/learning_persistence.py` (lines 2946-2964, comment on line 2949)
- Trigger: Deleting a revision session that has quiz attempts.
- Workaround: Application-level cleanup required (not implemented).

## Security Considerations

**CORS Hardcoded to Localhost:**
- Risk: CORS origins hardcoded to `http://localhost:5173` and `http://127.0.0.1:5173`. Cannot change without code modification.
- Files: `server/main.py` (lines 79-82)
- Current mitigation: Works for development only.
- Recommendation: Move CORS origins to environment variable. Support multiple origins via comma-separated config.

**Error Detail Exposure:**
- Risk: Internal error messages exposed to clients via `detail=f"Failed to ...: {str(e)}"`. Can leak stack traces, database paths, internal implementation details.
- Files: `server/routers/learning.py` (lines 304, 367, 396, 454, 490, 517, 543, 569, 604, 639, 677, 701, 734, 777, 796, 882, 921, 965, 1028), `server/routers/llm.py` (lines 89, 132, 162)
- Current mitigation: Logger captures full errors server-side.
- Recommendation: Return generic error messages to clients. Log detailed errors server-side only. Use error codes for client-side handling.

**No Rate Limiting:**
- Risk: No rate limiting on any endpoint. `POST /learning/generate` triggers multiple LLM API calls, expensive.
- Files: `server/main.py`, `server/routers/learning.py`
- Current mitigation: None.
- Recommendation: Add rate limiting middleware. At minimum, rate-limit `/learning/generate` endpoint.

**API Key in Request Headers:**
- Risk: API keys passed via HTTP headers (`X-OpenRouter-Key`, `X-GeneralCompute-Key`) on every request. Keys logged if request logging enabled.
- Files: `server/schemas/llm.py` (lines 126-200)
- Current mitigation: Keys not stored server-side (client-side only via localStorage).
- Recommendation: Ensure access logs redact these header values. Consider server-side key store for production.

**No Input Sanitization on Query Field:**
- Risk: `query` field in `GenerateCourseRequest` passed directly to LLM prompts without sanitization. Potential prompt injection vector.
- Files: `server/routers/learning.py` (line 86), `server/agents/planner.py`
- Current mitigation: Pydantic `min_length=1` validation only.
- Recommendation: Add max length validation. Consider input sanitization for prompt injection prevention.

## Performance Bottlenecks

**No Database Connection Pooling:**
- Problem: Every database operation creates new `sqlite3.connect()` call. 20+ concurrent requests creates significant overhead.
- Files: `server/database/learning_persistence.py` (line 72)
- Cause: SQLite connections opened and closed per method call with no reuse.
- Fix: Implement connection pooling or use single connection per request lifecycle.

**Sequential Planner Execution:**
- Problem: Course generation runs planner agent serially before parallel content generation. Planner can take 5-15 seconds.
- Files: `server/services/course_orchestrator.py` (lines 107-135)
- Cause: Planner output (topic list) required before generator/quizzer can start.
- Fix: Show "planning" progress state to user. Consider streaming planner output.

**Synchronous Database in Async Context:**
- Problem: Database operations use synchronous `sqlite3` in async FastAPI endpoints. Blocks event loop during DB operations.
- Files: `server/routers/learning.py` (all sync endpoints), `server/database/learning_persistence.py`
- Cause: SQLite's Python driver is synchronous.
- Fix: Use `asyncio.to_thread()` for DB calls in async endpoints, or switch to `aiosqlite`.

**Large Payload in Quiz Responses:**
- Problem: Quiz responses include full `content_markdown` (2000+ chars) even when user is in `IN_QUIZ` state where content is hidden.
- Files: `server/routers/learning.py` (lines 153-221)
- Cause: Full node data always returned; visibility flags applied after.
- Fix: Exclude `content_markdown` from responses when `content_visible=False`.

## Fragile Areas

**Node State Machine Validation:**
- Files: `server/database/learning_persistence.py` (lines 1770-1800)
- Why fragile: State transition validation is static dict. Adding new state requires updating allowed transitions dict AND all consuming code. No compile-time or test-time enforcement that all states covered.
- Safe modification: Always update `_validate_transition()` AND `NodeStatus` enum together. Add test validating all enum values have transition rules.
- Test coverage: `server/tests/test_session_lifecycle.py` covers transitions but doesn't validate completeness.

**Shuffle Seed Lifecycle:**
- Files: `server/routers/learning.py` (lines 224-249), `server/services/quiz_randomization.py`
- Why fragile: Shuffle seeds created lazily on first access, updated on retry, must persist correctly across session reloads. Multiple code paths create/update seeds.
- Safe modification: Always test shuffle seed persistence across page reload and quiz retry flows.
- Test coverage: `server/tests/test_quiz_randomization.py` covers shuffle logic but not full seed lifecycle.

**CourseOrchestrator Error Recovery:**
- Files: `server/services/course_orchestrator.py` (lines 182-250)
- Why fragile: If `asyncio.gather` partially fails — some tasks succeed, others fail — orchestrator creates SkeletonCards for failures but leaves successful nodes in database. If client retries generation, duplicate nodes created.
- Safe modification: Always verify orphan cleanup logic when modifying gather results handling.
- Test coverage: `server/tests/test_course_orchestrator.py` covers happy path and some error scenarios.

**Client State Synchronization:**
- Files: `client/src/features/learning/LearningPathContainer.tsx` (lines 88-146)
- Why fragile: Multiple `Record<string, ...>` state maps (quizResultsBySession, celebrationBySession, carouselStateBySession) track per-session state. State keys use `activeSessionKey` which can be session ID or `'new'`. Switching sessions can leave stale state.
- Safe modification: Always clear per-session state maps when session changes. Test session switching thoroughly.
- Test coverage: `client/src/features/learning/LearningPathContainer.test.tsx` exists but complex state interactions hard to test.

## Scaling Limits

**SQLite Single-Writer:**
- Current capacity: Handles single-user development workloads fine.
- Limit: SQLite uses single writer lock. Concurrent writes from multiple users serialize and block.
- Scaling path: Migrate to PostgreSQL or MySQL for multi-user production. SQL in `learning_persistence.py` is standard SQL with minimal SQLite-specific syntax.

**In-Memory Session State:**
- Current capacity: Works for single-server deployment.
- Limit: All state (shuffle seeds, session progress) lives in SQLite on local disk. No horizontal scaling possible.
- Scaling path: Move to proper database server. Add Redis for caching if needed.

## Dependencies at Risk

**`instructor` Library:**
- Risk: Relatively new library (v1.x) for structured LLM output. API surface may change.
- Impact: Core dependency for all AI agent functionality. Breaking changes affect all agents.
- Migration plan: Pin version in requirements.txt. Monitor changelog.

**`sqlite3` (stdlib):**
- Risk: Not version risk, capability risk. SQLite lacks concurrent write support, full-text search, advanced indexing.
- Impact: Limits production scalability.
- Migration path: SQLAlchemy already in requirements but unused. Could migrate to SQLAlchemy ORM with PostgreSQL backend.

**Manual Debug Scripts in Server Root:**
- Risk: `test_shuffle_debug.py` and `test_shuffle_manual.py` are standalone scripts in `server/` outside `tests/`. They use `sys.path.insert(0, ...)` hacks.
- Files: `server/test_shuffle_debug.py`, `server/test_shuffle_manual.py`
- Impact: Confusing for new developers. Not run by CI. May drift from actual implementation.
- Migration plan: Convert to proper unittest tests in `server/tests/` or delete if covered by existing tests.

## Missing Critical Features

**Database Migration System:**
- Problem: No proper migration framework. Schema changes applied via startup-time `ALTER TABLE` checks.
- Blocks: Safe schema evolution in production. Cannot rollback bad migrations.

**Structured Logging:**
- Problem: Logging uses basic `logging.basicConfig(level=logging.INFO)` with f-string interpolation. No structured JSON logging, no correlation IDs.
- Blocks: Production observability, log aggregation, request tracing.

**Health Check Depth:**
- Problem: `/health` endpoint returns static `{"status": "ok"}` without checking database connectivity or LLM availability.
- Blocks: Load balancer health checks, dependency monitoring.

## Test Coverage Gaps

**Integration Tests Disabled by Default:**
- What's not tested: End-to-end course generation flow with real LLM calls.
- Files: `server/tests/test_orchestrator_integration.py`
- Risk: Integration issues between planner, generator, quizzer, database layers go undetected in CI.
- Priority: Medium (manual testing covers this currently).

**Client Error Boundary Coverage:**
- What's not tested: Error boundary behavior when child components throw during render.
- Files: `client/src/features/learning/LearningErrorBoundary.tsx`
- Risk: Unhandled render errors crash entire learning feature.
- Priority: Low (error boundaries catch by definition).

**Database Migration Testing:**
- What's not tested: `_ensure_*_columns()` migration methods have no dedicated tests verifying correct handling of existing databases with partial schemas.
- Files: `server/database/learning_persistence.py` (lines 2816-2964)
- Risk: Migration failures on startup could corrupt schema or fail silently.
- Priority: High.

**Edge Cases in `@ts-ignore` Usage:**
- What's not tested: One test file uses `@typescript-eslint/no-explicit-any` suppression and `as any` cast.
- Files: `client/src/features/learning/LearningPage.test.tsx` (lines 266-267)
- Risk: Type safety gap in test assertions.
- Priority: Low.

---

*Concerns audit: 2026-05-27*
