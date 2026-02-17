# Project Research Summary

**Project:** AgUI v1.2 — Complexity-Aware Dynamic Quiz Generation
**Domain:** Adaptive Learning — Multi-Quiz Assessment with Difficulty Gradients
**Researched:** 2026-02-17
**Confidence:** HIGH

## Executive Summary

This is a **feature extension milestone**, not a greenfield build. The existing AgUI adaptive learning system already has the foundational infrastructure for multi-quiz assessment — `QuizSet` schemas, multi-quiz mastery logic, quiz progression tracking, and frontend rendering — all built speculatively in v1.0/v1.1 but never activated with real multi-quiz data. The v1.2 milestone's job is to wire up the Planner (complexity classification + quiz_count assignment), modify the Quizzer (batch generation with difficulty gradients), and update the Orchestrator (pass quiz_count, store QuizSet). **No new dependencies are needed.** The entire stack (Pydantic v2, Instructor, Gemini Flash, SQLite, React 19) already supports every required capability.

The recommended approach is a **4-file backend modification** (TopicNode schema, Planner prompt, Quizzer agent, Orchestrator wiring) followed by frontend verification. The architecture change is minimal: the Quizzer's return type shifts from `QuizCard` to `QuizSet`, and the Orchestrator reads `topic.quiz_count` to parameterize generation. All changes are backward-compatible through optional fields with defaults. The pedagogical model is well-established — Bloom's taxonomy progression (Recall → Application → Synthesis) maps directly to the difficulty gradient, and mastery learning (all quizzes must pass) is already implemented.

The primary risks are: (1) **LLM prompt drift** when adding complexity/quiz_count fields to the Planner — the model may produce uniform or meaningless values; (2) **untested frontend paths** — multi-quiz UI code exists but has never been exercised with real data; (3) **state machine edge cases** — the IN_QUIZ → SHOWING_FEEDBACK → IN_QUIZ loop for multi-quiz progression has subtle desynchronization risks between node state and `current_index`. All three are mitigable through careful prompt engineering, mock-data testing before backend activation, and formal state transition documentation.

## Key Findings

### Recommended Stack

**No new dependencies.** This is the cleanest possible outcome — zero additions to `requirements.txt` or `package.json`. Every capability is already installed and verified.

**Core technologies (unchanged):**
- **Pydantic v2**: Schema evolution with `Literal` types, `Field` constraints, nested model validation — already used for `QuizSet`, `RevisionMode`, etc.
- **Instructor + Vertex AI**: Structured LLM output — confirmed via Context7 that `QuizSet` as `response_model` works with Vertex AI provider
- **Gemini 2.5 Flash**: Quiz generation — only config change needed is `max_output_tokens` 1024 → 4096 to accommodate 5-quiz sets (~$0.0001 additional cost per topic)
- **SQLite**: Quiz storage — `quiz_data` table already stores QuizSet JSON with `format_version`, `current_index`, and per-quiz-index attempts

**Single configuration change:** `InstructorClient` MODEL_CONFIGS quizzer `max_output_tokens`: 1024 → 4096.

See [STACK.md](STACK.md) for full analysis and alternatives considered.

### Expected Features

**Must have (table stakes — blocks progression):**
1. **Planner assigns complexity per topic** — Basic/Intermediate/Advanced classification drives quiz_count
2. **Planner assigns quiz_count (1-5) per topic** — the core value proposition of "dynamic" quiz generation
3. **Quizzer generates N quizzes per topic** — returns QuizSet instead of single QuizCard
4. **Difficulty gradient across quiz chain** — Bloom's taxonomy: Recall → Application → Synthesis
5. **Orchestrator passes quiz_count to Quizzer** — reads from TopicNode, passes to generation
6. **All quizzes must pass for mastery** — existing `_check_multi_quiz_mastery()` logic, needs verification
7. **Sequential quiz progression** — must complete quiz N before seeing quiz N+1
8. **Frontend renders quiz chain with progress** — existing "Quiz X of Y" code, needs verification

**Should have (differentiators):**
- Complexity-aware difficulty calibration (planner context enriches quizzer output)
- Difficulty label visible to learner (Easy/Medium/Hard badges)
- Complexity badge on topic cards (Basic/Intermediate/Advanced)
- Quiz chain retry granularity (retry failed quiz only, not entire chain)

**Defer to v2+:**
- Inter-quiz context injection (quiz 2 references quiz 1)
- Adaptive quiz_count override (adjust based on learner performance)
- Analytics dashboard for quiz performance
- Dynamic question banks, timed quizzes, partial credit, question type variety

See [FEATURES.md](FEATURES.md) for full feature landscape, dependency graph, and pedagogical research.

### Architecture Approach

The architecture change is **surgical**: 4 backend files modified, no new files created, no persistence changes, no frontend changes (only verification). The existing scatter-gather pattern (Planner → parallel Generator+Quizzer per topic → persist) is preserved. The single most important integration change is the Quizzer's return type shifting from `QuizCard` to `QuizSet`, which ripples to the Orchestrator's `_generate_concept_unit()` method. All data flows downstream through existing channels.

**Modified components (4 files):**
1. **TopicNode schema** (`learning.py`) — add `complexity` and `quiz_count` fields with defaults
2. **PlannerAgent** (`planner.py`) — prompt update to assign complexity/quiz_count per topic
3. **QuizzerAgent** (`quizzer.py`) — new `generate_quiz_set()` method with difficulty gradient
4. **CourseOrchestrator** (`course_orchestrator.py`) — wiring: read quiz_count, call new method, store QuizSet

**Unchanged components (verified):**
- Persistence layer — already handles QuizSet storage, multi-quiz mastery, quiz progression
- Frontend — already renders QuizSet with "Quiz X of Y", state machine supports multi-quiz
- API layer — no new endpoints needed

See [ARCHITECTURE.md](ARCHITECTURE.md) for system diagrams, data flow, patterns, and anti-patterns.

### Critical Pitfalls

1. **LLM Prompt Drift (#1)** — Adding complexity/quiz_count to Planner prompt causes uniform or meaningless values. **Avoid:** Use Pydantic `Field` constraints (Instructor retries on validation failure), few-shot examples, post-generation distribution validation. Consider two-pass approach (topics first, then complexity assignment).

2. **Untested Frontend Paths (#3)** — Multi-quiz UI code has never been exercised with real data. `onNextQuiz` handler in ConceptCard is currently a no-op. **Avoid:** Test with mock multi-quiz data BEFORE backend changes. Integration test the full submit → advance → next quiz cycle.

3. **State Machine Desynchronization (#4)** — Multi-quiz adds a sub-state (which quiz within IN_QUIZ) managed separately from node state via `current_index`. Edge cases around refresh, retry, and between-quiz states. **Avoid:** Formalize sub-state, define retry semantics upfront, write state transition table, persist current_index atomically.

4. **Scatter-Gather Explosion (#2)** — Multiple quizzes per topic could multiply LLM calls from 7 to 21. **Avoid:** Batch generation (single LLM call returns entire QuizSet) — already the recommended approach from STACK research.

5. **Backward Compatibility (#6)** — New TopicNode fields must be optional with defaults or existing courses break. **Avoid:** `complexity="Intermediate"`, `quiz_count=1` defaults. Test old data deserialization.

See [PITFALLS.md](PITFALLS.md) for all 12 pitfalls with prevention and detection strategies.

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Schema Foundation + Backward Compatibility
**Rationale:** Everything depends on TopicNode having `complexity` and `quiz_count`. This is the atomic foundation that unlocks all downstream work.
**Delivers:** Updated `TopicNode` schema with optional fields and defaults. Backward compatibility tests confirming existing courses still load.
**Addresses:** Table stake #1-2 (complexity + quiz_count fields), Feature dependency root node
**Avoids:** Pitfall #6 (backward compat regression), Pitfall #11 (validation gaps)
**Effort:** Small — 2 fields with defaults, `Field` constraints, serialization tests

### Phase 2: Quizzer Multi-Quiz Generation
**Rationale:** The Quizzer is the core logic change — it must produce QuizSets with difficulty gradients before the Orchestrator can wire it up. Building this independently lets it be tested in isolation.
**Delivers:** `generate_quiz_set()` method, difficulty gradient computation, `max_output_tokens` config bump, `_fix_option_ids()` updated for batch output
**Addresses:** Table stake #3-4 (N quizzes + difficulty gradient), Should-have (difficulty calibration)
**Avoids:** Pitfall #2 (scatter-gather explosion via batch generation), Pitfall #5 (difficulty inconsistency), Pitfall #8 (option ID collisions)
**Effort:** Medium — new method, prompt engineering, gradient logic, unit tests

### Phase 3: Planner Complexity Assignment
**Rationale:** Can be developed in parallel with Phase 2 (no dependency), but placing it after schema changes. The Planner prompt is the highest-risk prompt engineering task — needs iteration.
**Delivers:** Updated `PLANNER_SYSTEM_PROMPT` with complexity assessment instructions, few-shot examples, distribution validation
**Addresses:** Table stake #1-2 (planner assigns complexity/quiz_count), Differentiator (complexity-aware calibration)
**Avoids:** Pitfall #1 (LLM prompt drift — uniform complexity)
**Effort:** Medium — prompt engineering with iteration, validation logic

### Phase 4: Orchestrator Integration + Backend Verification
**Rationale:** Pure wiring phase — reads new fields from Phase 1/3, calls new method from Phase 2, stores result using existing persistence. Also verifies multi-quiz mastery logic with real data.
**Delivers:** Updated `_generate_concept_unit()`, end-to-end backend integration, multi-quiz mastery verification
**Addresses:** Table stake #5 (orchestrator wiring), #6 (mastery verification), #7 (sequential progression)
**Avoids:** Pitfall #4 (state machine assumptions — verify with real data), Pitfall #12 (mastery logic test gaps)
**Effort:** Small-Medium — wiring + verification testing

### Phase 5: Frontend Verification + Polish
**Rationale:** Comes last because minimal frontend code changes are expected — primarily verification that existing multi-quiz UI works with real data. The `onNextQuiz` no-op handler needs implementation, and optional complexity badges can be added.
**Delivers:** Verified multi-quiz UX (progression, retry, completion), `onNextQuiz` handler implementation (currently no-op), optional complexity badges
**Addresses:** Table stake #8 (frontend renders quiz chain), Should-haves (complexity badges, difficulty labels)
**Avoids:** Pitfall #3 (untested frontend paths), Pitfall #7 (quiz security across unreached quizzes)
**Effort:** Small-Medium — verification-driven, bug fixes as needed

### Phase Ordering Rationale

- **Schema first** because every other phase reads from TopicNode — it's the dependency root
- **Quizzer before Orchestrator** because the Orchestrator calls the Quizzer — the callee must exist before the caller is wired
- **Planner parallel-capable with Quizzer** but ordered after schema for clean dependency chain
- **Orchestrator last among backend phases** because it integrates Planner output + Quizzer method + Persistence — all must be ready
- **Frontend last** because minimal changes are expected — only verification plus the `onNextQuiz` handler fix. Testing early (with mocks) is good practice but the "phase" is really about confirming everything works end-to-end
- **This ordering avoids Pitfall #2** (scatter-gather explosion) by ensuring batch generation exists before orchestrator integration
- **This ordering catches Pitfall #3** (untested frontend) at the integration boundary where real data first flows through

### Research Flags

Phases likely needing iteration during planning:
- **Phase 2 (Quizzer):** Prompt engineering for difficulty gradients is non-deterministic — expect 2-3 iterations on prompt quality. Test with diverse topics (not just CS). May need post-generation validation.
- **Phase 3 (Planner):** Highest prompt engineering risk. The Planner prompt is already long and structured. Adding complexity assignment may cause regression in topic quality. Consider two-pass approach if single-pass fails.

Phases with standard patterns (skip deep research):
- **Phase 1 (Schema):** Pure Pydantic schema extension — well-documented, established pattern. Already done elsewhere in codebase.
- **Phase 4 (Orchestrator):** Pure wiring — reading fields, calling methods, passing results. No novel patterns.
- **Phase 5 (Frontend):** Verification-only plus one handler fix. The components exist. Test them.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Zero new dependencies. All capabilities verified via codebase analysis and Context7. Config-only change (max_output_tokens). |
| Features | **HIGH** | Feature landscape grounded in codebase inventory (every component inspected) + established pedagogical frameworks (Bloom's, mastery learning). |
| Architecture | **HIGH** | All 4 modified files identified with specific line numbers. Data flow traced end-to-end. Existing infrastructure verified to handle QuizSet storage/rendering. |
| Pitfalls | **HIGH** | Based on direct codebase analysis, not external analogies. Pitfalls reference specific methods, line numbers, and code paths. State machine risks well-characterized. |

**Overall confidence: HIGH**

All research is grounded in direct codebase analysis with specific file references and line numbers. Stack research verified via Context7 (Instructor + Pydantic). Feature research cross-referenced with established pedagogical literature. Architecture research traces actual data flow through existing code. Pitfalls identify real code paths (e.g., `onNextQuiz` is confirmed no-op, `_check_multi_quiz_mastery` is confirmed untested with real data).

### Gaps to Address

- **Planner prompt quality:** Cannot predict LLM behavior for complexity assignment until tested. Research recommends few-shot examples and distribution validation, but the specific prompt text needs iteration. Flag for Phase 3.
- **`onNextQuiz` handler implementation:** Confirmed as no-op empty function in ConceptCard. Needs actual implementation — not just verification. This is a bug fix / missing implementation, not a "verification" task. Adjust Phase 5 scope.
- **State recovery on page refresh mid-quiz-set:** Research identifies the risk but the exact behavior hasn't been tested. Need to verify `get_quiz_set_for_node()` correctly reconstructs position from persisted attempts.
- **Regeneration with QuizSet:** `regenerate_node()` currently creates single QuizCard. Needs update to generate QuizSet when original node had quiz_count > 1. Not covered in any phase — add to Phase 4 or create separate task.
- **Quiz count range:** STACK recommends 1-5, PITFALLS recommends starting with 1-3. **Recommendation: start with 1-3** (tight range reduces LLM decision space) and expand to 1-5 after validation.
- **Revision session interaction:** How do multi-quiz nodes interact with existing revision sessions? May need updates. Flag for post-Phase 5 investigation.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** — Direct inspection of `server/schemas/learning.py`, `server/agents/quizzer.py`, `server/agents/planner.py`, `server/services/course_orchestrator.py`, `server/database/learning_persistence.py`, `server/services/quiz_randomization.py`, `client/src/features/learning/ConceptCard.tsx`, `client/src/features/learning/QuizFeedback.tsx`, `client/src/types/learning.ts`, `client/src/features/learning/useNodeState.ts`
- **Context7 — Instructor/Vertex AI** (`/instructor-ai/instructor`) — Confirmed structured output with nested Pydantic models, `create_iterable` vs direct response_model patterns
- **Context7 — Pydantic v2** (`/pydantic/pydantic`) — Confirmed `Literal` types, `Field` constraints, nested validation
- **Feature spec** — `.planning/codebase/features/dynamic-quiz-generation.md`

### Secondary (MEDIUM confidence)
- **Bloom's Revised Taxonomy** — Anderson & Krathwohl (2001) — difficulty gradient framework
- **Testing Effect** — Roediger & Karpicke (2006) — retrieval practice research supporting multi-quiz approach
- **Mastery Learning** — Bloom (1968) — all-quizzes-must-pass gate model

### Tertiary (needs validation)
- **Planner complexity heuristics** — Recommended quiz_count-to-topic-type mappings are inference-based, not empirically tested. Validate during Phase 3 prompt iteration.
- **LLM difficulty gradient coherence** — Assumption that single-call batch generation maintains coherent difficulty progression needs empirical testing during Phase 2.

---
*Research completed: 2026-02-17*
*Ready for roadmap: yes*
