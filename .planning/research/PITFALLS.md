# Domain Pitfalls: Dynamic Multi-Quiz Generation

**Domain:** Adding dynamic quiz generation (variable quiz counts, complexity levels) to an existing adaptive learning system
**Researched:** 2026-02-17
**Milestone context:** Subsequent milestone — extending a working single-quiz-per-topic system to multi-quiz with complexity

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

---

### Pitfall 1: LLM Prompt Drift When Adding Complexity/Quiz-Count Fields to Planner

**What goes wrong:** The PlannerAgent currently generates `CourseOutline` with 5-7 `TopicNode`s that have no `complexity` or `quiz_count` fields. Adding these fields to the prompt causes the LLM to "over-think" the new dimensions — producing inconsistent complexity gradients (e.g., all topics rated "medium"), ignoring quiz_count constraints, or hallucinating field values outside allowed ranges. The existing KLI framework prompt is already long and structured; bolting on new output requirements destabilizes it.

**Why it happens:** LLMs treat prompt additions as suggestions, not constraints. The more structured output fields you add, the more likely the model is to produce valid JSON structure but with semantically meaningless values. Instructor/Pydantic validates structure but cannot validate pedagogical quality of complexity assignments.

**Consequences:**
- All topics get identical complexity ratings, defeating the purpose of adaptive difficulty
- Quiz counts don't correlate with topic importance or complexity
- Difficulty gradient across the course is random rather than progressive
- Regression in existing planning quality (topic titles, summaries) as the model splits attention

**Prevention:**
1. Add `complexity` and `quiz_count` as **Pydantic `Field` with `ge`/`le` constraints** on TopicNode — Pydantic will reject out-of-range values and Instructor will retry
2. Use **few-shot examples** in the planner prompt showing correct complexity assignment patterns (progressive, not uniform)
3. Add a **post-generation validation pass** that checks complexity distribution: if >60% of topics share the same complexity, re-prompt with explicit correction
4. Consider a **two-pass approach**: first generate topics (existing prompt), then assign complexity/quiz_count in a separate, focused LLM call. This isolates the new logic from the proven topic generation
5. Keep quiz_count range tight (1-3 initially, not 1-5) to reduce LLM decision space

**Detection:**
- Log complexity distribution per generated course — alert on uniform distributions
- Unit test that Pydantic rejects out-of-range complexity values
- Integration test: generate 10 courses, assert complexity variance > threshold

**Phase to address:** Schema changes + Planner prompt update phase

---

### Pitfall 2: Scatter-Gather Explosion — Multiplied LLM Calls in Orchestrator

**What goes wrong:** The `CourseOrchestrator._generate_concept_unit()` currently generates ONE quiz per topic using scatter-gather parallelism (all topics processed concurrently). If topics now request 1-3 quizzes each, a 7-topic course goes from 7 quiz LLM calls to potentially 21. With Vertex AI rate limits and the existing `tenacity` retry logic, this causes cascading timeouts, rate limit errors, and partial course generation failures.

**Why it happens:** The scatter-gather pattern in `course_orchestrator.py` was designed for 1:1 topic-to-quiz mapping. Multiplying calls without adjusting concurrency limits, timeout budgets, or error handling creates a fundamentally different load profile. The orchestrator's `asyncio.gather()` launches all calls simultaneously.

**Consequences:**
- Vertex AI 429 (rate limit) errors cascade, triggering retries that make it worse
- Course generation time increases 2-3x, degrading UX (users already wait for generation)
- Partial failures: some topics get quizzes, others don't, leaving course in inconsistent state
- `tenacity` retry storms if multiple quiz generations fail simultaneously

**Prevention:**
1. **Semaphore-based concurrency control**: Wrap quiz generation in `asyncio.Semaphore(max_concurrent)` — start with 3-5 concurrent LLM calls max
2. **Batch quiz generation**: Change QuizzerAgent to generate N quizzes per topic in a single LLM call (returns `list[QuizCard]`) rather than calling it N times. This is the single biggest optimization
3. **Progressive timeout budgets**: Set per-topic timeout based on quiz_count (e.g., base + N * per_quiz_timeout)
4. **Graceful degradation**: If quiz generation partially fails, store what succeeded and allow retry for remaining quizzes later. Don't fail the entire course
5. **Pre-flight rate limit check**: Before starting generation, estimate total LLM calls and warn/throttle if it exceeds safe thresholds

**Detection:**
- Monitor total LLM calls per course generation
- Alert on generation times > 2x baseline
- Track partial failure rates (courses with missing quizzes)

**Phase to address:** QuizzerAgent + Orchestrator changes phase

---

### Pitfall 3: Untested Multi-Quiz Frontend Path Goes Live

**What goes wrong:** The frontend (`ConceptCard.tsx`, `QuizFeedback.tsx`) already has multi-quiz rendering code — `QuizSetHidden` type guards, "Quiz X of Y" progress display, "Next Quiz" button. But the codebase explicitly notes this is **"untested with actual multi-quiz data."** When the backend starts sending real multi-quiz QuizSets, these code paths activate for the first time and break in unexpected ways: wrong quiz displayed after advancing, progress counter off-by-one, state not resetting between quizzes, answer submission targeting wrong quiz_index.

**Why it happens:** The frontend code was written speculatively for multi-quiz support but has only ever received single-quiz QuizSets (quiz_count=1). State management assumptions (which quiz is active, what happens on advance, when to show completion) were never validated against real multi-quiz data.

**Consequences:**
- Users see wrong quiz after clicking "Next Quiz"
- Quiz progress shows "Quiz 1 of 1" even with multiple quizzes (or wrong count)
- Answer submission sends wrong `quizIndex`, causing backend rejection or storing answer against wrong quiz
- State machine gets stuck — user can't complete the quiz set
- Visual glitches: previous quiz's feedback bleeds into next quiz display

**Prevention:**
1. **Test the frontend paths FIRST** with mock multi-quiz data before changing the backend. Create a test fixture with 3-quiz QuizSets and verify all UI transitions
2. **Add integration tests** for the full submit → advance → next quiz → submit cycle
3. **Verify `useLearningMutations.submitAnswer`** correctly passes `quizIndex` from the UI's current quiz position
4. **Test edge cases**: first quiz, last quiz, only quiz (backward compat), quiz after retry
5. **Add Storybook/visual test** for ConceptCard with 1-quiz, 2-quiz, 3-quiz QuizSets

**Detection:**
- Manual QA: generate a multi-quiz course and complete it end-to-end
- E2E test covering the full quiz set progression
- Console errors during quiz advancement

**Phase to address:** Frontend validation phase (should precede or coincide with backend multi-quiz activation)

---

### Pitfall 4: State Machine Assumptions Break with Multi-Quiz Progression

**What goes wrong:** The current state machine (`LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED`) handles one quiz cycle. With multiple quizzes, the state must loop: `IN_QUIZ → SHOWING_FEEDBACK → IN_QUIZ (next) → SHOWING_FEEDBACK → ... → COMPLETED`. The `submit_quiz` endpoint (learning.py L851-862) already advances `current_index` after a correct answer, but the interaction between state transitions, quiz advancement, retry loops, and mastery checking creates edge cases: What state is the node in between quizzes? What happens if the user retries quiz 1 after seeing quiz 2? What if the user refreshes mid-set?

**Why it happens:** The state machine was designed for a single quiz cycle with one clear progression path. Multi-quiz introduces a sub-state (which quiz within IN_QUIZ) that the state machine doesn't formally model. The `current_index` on QuizSet acts as informal sub-state, but it's managed separately from the node state, creating potential desynchronization.

**Consequences:**
- Node shows `COMPLETED` after first quiz instead of advancing to next
- User refreshes and loses position — starts from quiz 1 again (or worse, sees a quiz they already answered without their answer)
- Retry on quiz 1 advances to quiz 2 unexpectedly
- `_check_multi_quiz_mastery` requires ALL quizzes correct, but user can only access quizzes sequentially — no way to go back and retry an earlier failed quiz
- `SHOWING_FEEDBACK` state doesn't distinguish "between quizzes" from "after final quiz"

**Prevention:**
1. **Formalize the sub-state**: Make `current_index` a first-class part of the state model, not a side-channel. Document the valid (state, current_index) combinations
2. **Define retry semantics clearly**: Can users retry individual quizzes? Only the current one? All of them? Decide upfront and implement consistently
3. **Persist current_index to database on every advancement** — it's already in `quiz_data` table, verify it's updated atomically with quiz attempt records
4. **Add a `BETWEEN_QUIZZES` state** or explicitly define that `SHOWING_FEEDBACK` + `current_index < total - 1` means "not done yet". The frontend needs to know whether to show "Next Quiz" or "Complete"
5. **State recovery on refresh**: `get_quiz_set_for_node()` should reconstruct the correct current_index from persisted quiz attempts, not just trust the stored value
6. **Write a state transition table** covering all (state, event, quiz_index) combinations before implementing

**Detection:**
- State machine diagram review before implementation
- Integration tests: complete multi-quiz set, refresh at each step, verify state recovery
- Test: retry quiz 1 after completing quiz 2 — what happens?

**Phase to address:** Multi-quiz progression logic phase

---

## Moderate Pitfalls

---

### Pitfall 5: Difficulty Gradient Inconsistency Across Quizzes in a Set

**What goes wrong:** When generating multiple quizzes per topic, the quizzes should have meaningful difficulty variation (e.g., recall → application → analysis). But the QuizzerAgent generates quizzes independently — either in one batch call or N separate calls — with no explicit difficulty progression. The result is N quizzes at roughly the same difficulty level, providing no pedagogical value over a single quiz.

**Prevention:**
1. Include explicit difficulty level in each quiz generation prompt: "Generate quiz 1 of 3: recall level", "Generate quiz 2 of 3: application level"
2. If batch-generating, include the difficulty sequence in the prompt and add a `difficulty` field to QuizCard for validation
3. Post-generation validation: reject quiz sets where all quizzes test the same cognitive level
4. Start simple: if complexity-based difficulty is too hard to get right, use quiz_count without difficulty variation initially — more quizzes still helps retention

**Detection:**
- Review generated quiz sets manually for difficulty variation
- Add `difficulty` metadata to QuizCard for future analytics

**Phase to address:** QuizzerAgent prompt update phase

---

### Pitfall 6: Backward Compatibility Regression with Existing Courses

**What goes wrong:** The system already has backward compatibility infrastructure: `convert_legacy_quiz_card()`, `convert_legacy_to_quiz_set()`, `get_quiz_set_for_node()` auto-wrapping, `format_version` in the database. But changing TopicNode schema (adding `complexity`, `quiz_count`) affects ALL code that creates or reads TopicNodes — not just new courses. Existing courses in the database have TopicNodes without these fields. If the new fields aren't `Optional` with sensible defaults, existing course retrieval breaks.

**Prevention:**
1. Make `complexity` and `quiz_count` **Optional with defaults** on TopicNode: `complexity: int | None = None`, `quiz_count: int = 1`
2. **Do NOT increment format_version** unless the storage format actually changes — TopicNode changes are schema changes, not storage format changes
3. Test retrieval of existing courses after schema changes — the database stores JSON that must still deserialize
4. Add migration test: create a course with the old schema, apply changes, verify it still loads and functions
5. Ensure `get_quiz_set_for_node()` still correctly wraps legacy single-quiz data even after QuizSet schema evolves

**Detection:**
- Automated test: serialize old TopicNode JSON → deserialize with new schema → verify no errors
- Manual test: load an existing course after deployment

**Phase to address:** Schema changes phase (very first phase)

---

### Pitfall 7: Quiz Security Across Unreached Quizzes

**What goes wrong:** `hide_quiz_set()` currently hides ALL quizzes' answers at once when the node enters `IN_QUIZ` state. This is correct for security (don't leak future answers), but creates a UX question: should the user see the questions of future quizzes before reaching them? Currently `QuizSetHidden` hides answers but exposes question text and options (minus `is_correct`). With multi-quiz, a savvy user could read ahead to see what quiz 3 asks while on quiz 1, potentially preparing answers.

**Prevention:**
1. **Accept this as low-risk initially** — knowing future questions doesn't help much if options are shuffled and `is_correct` is hidden
2. If it becomes a concern, hide question text for quizzes beyond `current_index + 1` (show only the current quiz fully)
3. Add a `visible_through_index` field to the hide function to control which quizzes are fully visible
4. Don't over-engineer quiz security for a learning app — this isn't a proctored exam

**Detection:**
- Security review of API response payloads for IN_QUIZ state
- Verify `is_correct` and `explanation` are never exposed for any quiz in the set

**Phase to address:** Security review during multi-quiz activation phase

---

### Pitfall 8: QuizzerAgent `_fix_option_ids()` Breaks with Batch Generation

**What goes wrong:** The QuizzerAgent has `_fix_option_ids()` that fixes a known LLM issue: the model outputs `"A"`, `"B"`, `"C"`, `"D"` as option IDs instead of UUIDs. This works for a single QuizCard. If the QuizzerAgent is changed to generate multiple QuizCards in one call (batch generation), `_fix_option_ids()` must handle a list, and the LLM is more likely to reuse option IDs across quizzes (e.g., all quizzes get the same UUIDs because the model copies the pattern).

**Prevention:**
1. If batch-generating, apply `_fix_option_ids()` to EACH quiz independently
2. Add a post-fix validation: all option_ids across all quizzes in a set must be globally unique (not just unique within one quiz)
3. Validate `correct_option_id` references a valid option in its own quiz, not another quiz's option
4. Consider generating quizzes individually (N calls) if batch generation introduces too many ID collisions — the orchestrator pitfall (#2) can be mitigated with semaphores

**Detection:**
- Unit test: generate 3 quizzes in batch, verify all option_ids are unique across the entire set
- Integration test: submit answers for each quiz in a set, verify correct answer is correctly identified

**Phase to address:** QuizzerAgent batch generation phase

---

### Pitfall 9: Performance Regression on Course Generation Time

**What goes wrong:** Users already wait for course generation. Adding complexity assignment (planner) and multiple quizzes per topic (quizzer) increases wall-clock time significantly. A 7-topic course with 2 quizzes each means 14 quiz generations instead of 7. Even with batching, LLM response time scales with output token count. Users may abandon the page or retry, creating duplicate generation requests.

**Prevention:**
1. **Progress streaming**: Add SSE/WebSocket updates during generation so users see "Generating quiz 2 of 3 for Topic 4..." instead of a spinner
2. **Batch quiz generation** (as in Pitfall #2) to reduce wall-clock time
3. **Idempotency guard**: Prevent duplicate generation if user retries while first request is still processing
4. **Set expectations in UX**: Show estimated time based on quiz_count before starting
5. **Consider progressive loading**: Generate and display topics first, then generate quizzes in the background

**Detection:**
- Measure p50/p95 generation times before and after changes
- Track user abandonment rate during generation
- A/B test with progress indicators

**Phase to address:** Orchestrator changes + UX phase

---

## Minor Pitfalls

---

### Pitfall 10: Quiz Shuffle Seed Semantics with Multiple Quizzes

**What goes wrong:** The current `shuffle_seed` on QuizSet is used to shuffle option order for ALL quizzes in the set using `shuffle_quiz_set_with_seed()`. With multiple quizzes, a single seed produces the same shuffle pattern across quizzes (option A always moves to position 3). This is technically secure but could feel repetitive to users, and a sufficiently motivated user could deduce the shuffle pattern.

**Prevention:**
1. Use `seed + quiz_index` as the effective seed for each quiz's shuffle — already partially implemented in `shuffle_quiz_set_with_seed()` which uses per-quiz seeding
2. Verify the existing implementation actually varies shuffle per quiz, not just per set
3. This is low priority — the security model doesn't depend on shuffle unpredictability, just on `is_correct` being hidden

**Phase to address:** Verification during quiz security review

---

### Pitfall 11: TopicNode Schema Validation Gaps

**What goes wrong:** Adding `quiz_count: int` to TopicNode without tight validation allows the LLM to output `quiz_count: 0` (no quiz) or `quiz_count: 10` (too many). Pydantic catches type errors but not semantic errors unless `Field` constraints are used.

**Prevention:**
1. Use `quiz_count: int = Field(default=1, ge=1, le=3)` — tight bounds
2. Use `complexity: int = Field(default=1, ge=1, le=5)` — standard 1-5 scale
3. Instructor will retry on validation failure, but add max_retries to prevent infinite loops
4. Log validation retry counts to detect if the LLM consistently struggles with these constraints

**Phase to address:** Schema changes phase

---

### Pitfall 12: Test Coverage Gaps in Multi-Quiz Mastery Logic

**What goes wrong:** `_check_multi_quiz_mastery()` already exists and checks that all quiz indices have at least one correct attempt. But it was written before real multi-quiz data existed. Edge cases: what if quiz_count changes after some attempts are recorded? What if attempts exist for quiz_index values beyond the current quiz_count? What about the interaction between mastery checking and quiz advancement?

**Prevention:**
1. Write comprehensive unit tests for `_check_multi_quiz_mastery()` with various attempt patterns BEFORE changing the orchestrator to produce multi-quiz data
2. Test edge case: 3 quizzes, user passes quiz 1 and 3 but not 2 — mastery should be false
3. Test edge case: quiz_count reduced from 3 to 2 after attempts recorded for quiz 3
4. Verify mastery check uses the QuizSet's actual quiz count, not a hardcoded value

**Phase to address:** Testing phase (before orchestrator changes go live)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Schema changes (TopicNode) | Backward compat regression (#6), weak validation (#11) | Optional fields with defaults, tight Field constraints |
| Planner prompt update | LLM prompt drift (#1), uniform complexity | Two-pass approach, distribution validation |
| QuizzerAgent changes | Scatter-gather explosion (#2), option ID collisions (#8), difficulty inconsistency (#5) | Batch generation with semaphore, per-quiz ID fix, difficulty prompts |
| Multi-quiz progression | State machine breakage (#4), mastery logic gaps (#12) | Formal state transition table, comprehensive tests first |
| Frontend activation | Untested paths (#3), progress/index mismatches | Test with mock data before backend changes |
| Security review | Quiz answer leakage (#7), shuffle predictability (#10) | Verify hide_quiz_set covers all quizzes, per-quiz seed variation |
| Performance/UX | Generation time regression (#9) | Progress streaming, batch generation, idempotency |

## Implementation Order Recommendation

Based on pitfall dependencies, the safest implementation order:

1. **Schema changes** — Add fields with backward-compatible defaults (blocks everything else)
2. **Frontend validation** — Test existing multi-quiz UI paths with mock data (independent, catches issues early)
3. **QuizzerAgent batch generation** — Change to produce N quizzes per call (reduces orchestrator blast radius)
4. **Planner prompt update** — Add complexity/quiz_count to planning (feeds into quizzer)
5. **Orchestrator integration** — Wire new planner + quizzer together (depends on 3 & 4)
6. **Multi-quiz progression testing** — Verify state machine with real data end-to-end (depends on 5)
7. **Security + performance review** — Final validation pass

**Rationale:** Schema first (everything depends on it), frontend second (cheap to test, catches assumptions early), then backend changes in dependency order, integration last.

## Sources

- Codebase analysis: `server/schemas/learning.py`, `server/agents/planner.py`, `server/agents/quizzer.py`, `server/services/course_orchestrator.py`, `server/database/learning_persistence.py`, `server/routers/learning.py`, `client/src/features/learning/ConceptCard.tsx`, `client/src/features/learning/QuizFeedback.tsx`
- Architectural patterns: existing state machine, scatter-gather, security model observations from code review
- Confidence: HIGH (based on direct codebase analysis, not external sources)
