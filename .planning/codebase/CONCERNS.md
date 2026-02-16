# Codebase Concerns

**Analysis Date:** 2026-02-16

## Tech Debt

**Database Connection Management (learning_persistence.py):**
- Issue: No connection pooling - creates new SQLite connection per operation
- Files: `server/database/learning_persistence.py` (lines 99-103, repeated throughout)
- Impact: Connection overhead on every DB operation; unsuitable for high-concurrency
- Fix approach: Implement connection pooling with `sqlite3` or migrate to async driver like `aiosqlite`

**Schema Migration Strategy:**
- Issue: Schema migrations use runtime column existence checks (`_ensure_*_columns` methods)
- Files: `server/database/learning_persistence.py` (lines 2620-2693)
- Impact: Migration code scattered throughout persistence layer; no versioning; hard to track schema evolution
- Fix approach: Implement proper migration framework (Alembic for SQLAlchemy or manual migration scripts)

**Large File - CourseOrchestrator:**
- Issue: 606 lines with multiple responsibilities
- Files: `server/services/course_orchestrator.py`
- Impact: Hard to test individual components; violates single responsibility principle
- Fix approach: Extract `_generate_concept_unit`, `_process_gather_results`, `_create_skeleton_card` into separate modules

**Large File - LearningRouter:**
- Issue: 941 lines in single router file
- Files: `server/routers/learning.py`
- Impact: Cognitive load; hard to locate specific endpoints
- Fix approach: Split into sub-routers (sessions, nodes, revisions, quizzes)

**Legacy Quiz Format Handling:**
- Issue: Multiple code paths for legacy vs new quiz formats throughout codebase
- Files: `server/schemas/learning.py` (lines 816-864), `server/database/learning_persistence.py` (lines 1750-1800)
- Impact: Complexity debt; risk of format detection bugs
- Fix approach: Run data migration to convert all legacy formats, remove compatibility code

**Type Safety Gaps:**
- Issue: Some functions return `Dict[str, Any]` instead of typed Pydantic models
- Files: `server/database/learning_persistence.py` (methods like `create_learning_session`, `get_learning_session`)
- Impact: Reduced IDE support, runtime type errors possible
- Fix approach: Define response models and use them consistently

## Known Bugs

**None explicitly documented** - No TODO/FIXME comments found in source code. However, potential issues identified:

**Topic Index Mismatch Warning:**
- Issue: Code detects but doesn't prevent topic index mismatches
- Files: `server/services/course_orchestrator.py` (lines 170-179)
- Trigger: Planner agent returns non-contiguous topic indices
- Workaround: Logs warning but continues processing

**Regeneration Context Loss:**
- Issue: Node regeneration uses title fallback instead of stored summary_for_context
- Files: `server/services/course_orchestrator.py` (lines 559-563)
- Trigger: Regenerating a failed node
- Impact: Generated content may have reduced contextual coherence

## Security Considerations

**CORS Configuration:**
- Risk: Broad CORS settings in development
- Files: `server/main.py` (lines 117-128)
- Current mitigation: Restricted to localhost:5173 and 127.0.0.1:5173
- Recommendations: Use environment-specific CORS config; never use `"*"` in production

**Quiz Answer Security:**
- Risk: Answer correctness data could leak to client
- Files: `server/routers/learning.py` (lines 194-253)
- Current mitigation: Server-side visibility filtering with `QuizCardHidden`/`QuizSetHidden`
- Recommendations: Verify all quiz responses use hidden variants in IN_QUIZ state

**Shuffle Seed Predictability:**
- Risk: If seed generation is predictable, quiz order could be gamed
- Files: `server/services/quiz_randomization.py` (line 406)
- Current mitigation: Uses `secrets.token_hex(16)` (CSPRNG)
- Status: Secure implementation

**No Authentication:**
- Risk: API endpoints accept user_id but don't verify identity
- Files: All router files
- Current mitigation: None - single-user application
- Recommendations: Add JWT or session-based auth before multi-user deployment

**SQL Injection Risk - Low:**
- Risk: Dynamic SQL in `get_revisions_for_session` with f-string
- Files: `server/database/learning_persistence.py` (line 498)
- Current mitigation: `order_column` and `order_direction` come from hardcoded mappings
- Status: Acceptable risk due to whitelist validation

## Performance Bottlenecks

**Synchronous Database Operations:**
- Problem: All DB operations are blocking synchronous calls
- Files: `server/database/learning_persistence.py` (entire file)
- Cause: Using `sqlite3` directly instead of async alternative
- Improvement path: Migrate to `aiosqlite` or similar async SQLite driver

**Course Generation Latency:**
- Problem: Parallel generation still takes 30-60 seconds for full courses
- Files: `server/services/course_orchestrator.py` (lines 116-257)
- Cause: AI model inference time dominates
- Improvement path: Consider streaming partial results; cache common topics

**Client-Side Refetch Polling:**
- Problem: 2-second polling interval for progress updates
- Files: `client/src/features/learning/LearningPage.tsx` (line 80)
- Cause: No WebSocket or SSE for real-time updates
- Improvement path: Implement WebSocket or Server-Sent Events for progress updates

**No Request Caching:**
- Problem: Session data fetched repeatedly without HTTP caching
- Files: `client/src/lib/learningApi.ts`
- Cause: No cache headers or ETag implementation
- Improvement path: Add HTTP caching headers; implement stale-while-revalidate

**Large Response Payloads:**
- Problem: Full course content sent on every session fetch
- Files: `server/routers/learning.py` (line 460)
- Cause: No pagination for nodes; all content returned at once
- Improvement path: Implement node-level pagination or lazy loading

## Fragile Areas

**State Machine Consistency:**
- Files: `server/database/learning_persistence.py` (lines 1634-1677)
- Why fragile: State transitions are validated in code but not enforced at database level
- Safe modification: Always use `update_node_status()` method; never direct SQL
- Test coverage: Unit tests exist but concurrent access could race

**Quiz Format Version Detection:**
- Files: `server/database/learning_persistence.py` (lines 1749-1780, 1900-1923)
- Why fragile: Format detection relies on try/except with fallback; could mask data corruption
- Safe modification: Add explicit format_version column validation; avoid exception-based flow control
- Test coverage: Tests exist but edge cases (corrupted JSON) may not be covered

**Vertex AI Initialization Chain:**
- Files: `server/main.py` (lines 75-111), `server/utils/vertex_client.py`, `server/utils/instructor_client.py`
- Why fragile: Strict initialization order required (Vertex AI → InstructorClient); failures cascade
- Safe modification: Add health checks; graceful degradation mode
- Test coverage: Error paths tested but integration failure scenarios limited

**Context Injection in Regeneration:**
- Files: `server/services/course_orchestrator.py` (lines 540-564)
- Why fragile: Uses adjacent node titles instead of stored summaries; may produce inconsistent content
- Safe modification: Store summary_for_context in concept_nodes table
- Test coverage: Limited tests for regeneration edge cases

## Scaling Limits

**SQLite Concurrency:**
- Current capacity: Single-writer, multiple-readers
- Limit: Write contention under concurrent course generation
- Scaling path: Migrate to PostgreSQL or use SQLite in WAL mode with read replicas

**In-Memory Client Caching (React Query):**
- Current capacity: Unlimited client-side cache growth
- Limit: Browser memory pressure with many large courses
- Scaling path: Implement cache size limits; LRU eviction

**AI Rate Limits:**
- Current capacity: Dependent on Vertex AI quotas
- Limit: Google Cloud project quotas (typically 60-300 requests/minute)
- Scaling path: Implement request queueing; add rate limiting middleware

## Dependencies at Risk

**instructor library:**
- Risk: Relatively new library (v1.x); API may change
- Impact: Structured output generation depends on `instructor.Mode.GENAI_TOOLS`
- Files: `server/utils/instructor_client.py` (line 153)
- Migration plan: Monitor for breaking changes; pin version in requirements.txt

**React 19 (Beta/RC):**
- Risk: Using React 19.2.0 which may have breaking changes from stable
- Impact: Potential compatibility issues with ecosystem packages
- Files: `client/package.json` (line 20)
- Migration plan: Monitor for stable release; test with React 18 if issues arise

**Tailwind CSS 4.x:**
- Risk: Major version recently released; plugin ecosystem catching up
- Impact: Some plugins may not be compatible yet
- Files: `client/package.json` (line 47)
- Migration plan: Monitor plugin compatibility; consider Tailwind 3.x if issues

**google-cloud-aiplatform:**
- Risk: Google Cloud SDK updates can introduce breaking changes
- Impact: Vertex AI initialization and model calling
- Migration plan: Pin to tested version; test upgrades in staging

## Missing Critical Features

**User Authentication:**
- Problem: No authentication system; user_id is optional and unverified
- Blocks: Multi-user deployment, user data isolation, progress persistence across devices
- Priority: High before production

**API Rate Limiting:**
- Problem: No rate limiting on course generation or quiz endpoints
- Blocks: Protection against abuse, AI quota exhaustion
- Priority: High

**Data Backup/Export:**
- Problem: No mechanism to backup or export user learning data
- Blocks: Data portability, disaster recovery
- Priority: Medium

**Error Recovery UI:**
- Problem: Limited user-facing error recovery for failed node generation
- Blocks: Smooth UX when AI generation fails
- Priority: Medium

**Content Search:**
- Problem: No search across generated course content
- Blocks: Finding previously learned topics
- Priority: Low

## Test Coverage Gaps

**CourseOrchestrator Edge Cases:**
- What's not tested: Partial failure scenarios with multiple node failures
- Files: `server/tests/test_course_orchestrator.py`
- Risk: Graceful degradation may not work as expected under multiple failures
- Priority: Medium

**Concurrent State Transitions:**
- What's not tested: Race conditions in node status updates
- Files: `server/database/learning_persistence.py` (lines 1398-1477)
- Risk: Status update races could corrupt learning flow
- Priority: High

**Quiz Randomization Edge Cases:**
- What's not tested: Seed collision scenarios, entropy exhaustion
- Files: `server/services/quiz_randomization.py`
- Risk: Predictable shuffle patterns under specific conditions
- Priority: Low

**Frontend Error Boundaries:**
- What's not tested: Component error recovery, network failure handling
- Files: Most React components
- Risk: White screen of death on unhandled errors
- Priority: Medium

**End-to-End User Flows:**
- What's not tested: Complete learning flow from generation to completion
- Files: Limited E2E tests exist
- Risk: Integration issues between components
- Priority: High

---

*Concerns audit: 2026-02-16*
