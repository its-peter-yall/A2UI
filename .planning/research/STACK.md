# Technology Stack: Dynamic Quiz Generation

**Project:** AgUI v1.2 — Complexity-Aware Dynamic Quiz Generation
**Researched:** 2026-02-17
**Scope:** Stack additions/changes ONLY for multi-quiz chain generation

## Executive Verdict

**No new dependencies required.** The existing stack (Pydantic v2, Instructor, Gemini Flash, SQLite, React 19) already supports every capability needed for dynamic quiz generation. This is a feature that layers on existing infrastructure through schema extensions, prompt engineering, and orchestration logic changes.

## Recommended Stack Changes

### Backend Changes (Python)

| Component | Current | Change | Rationale |
|-----------|---------|--------|-----------|
| `TopicNode` schema | No complexity/quiz_count | Add `complexity: Literal["Basic", "Intermediate", "Advanced"]`, `quiz_count: int` (1-5) | Planner needs to signal assessment depth per topic. Pydantic v2 `Literal` type is already used elsewhere in the codebase (`RevisionMode = Literal[...]`). No new dependency. |
| Quizzer `max_output_tokens` | 1024 | Increase to 4096 | Currently generates 1 QuizCard (~200 tokens). Generating 5 QuizCards needs ~1000 tokens. 1024 is too tight for 4-5 quiz chains with full explanations. 4096 provides comfortable headroom. |
| Quizzer `response_model` | `QuizCard` (single) | `QuizSet` (container of 1-5 `QuizCard`s) | The `QuizSet` schema already exists and is validated. Instructor can validate nested Pydantic models with lists. Confirmed via Context7: Instructor supports list/iterable structured outputs with Vertex AI. |
| Orchestrator | Passes single `QuizCard` | Passes `quiz_count` to Quizzer, receives `QuizSet` | `CourseOrchestrator._generate_concept_unit()` currently calls `quizzer_agent.generate_quiz()` returning `QuizCard`. Updated to return `QuizSet`. The `create_concept_node()` already accepts `QuizSet`. |
| Persistence | `quiz_data.current_index` exists | No schema change needed | `quiz_data` table already has `current_index INTEGER DEFAULT 0`. The `submit_quiz_answer` logic needs behavioral update (not schema). |
| `InstructorClient` | Role configs static dict | No structural change needed | `MODEL_CONFIGS["quizzer"]["max_output_tokens"]` just needs value bump. |

### Frontend Changes (TypeScript/React)

| Component | Current | Change | Rationale |
|-----------|---------|--------|-----------|
| `ConceptCard.tsx` | Renders `QuizSetHidden` with "Quiz X of Y" | Verify multi-quiz progression UX | Already has `isQuizSetHidden` type guard and `currentQuizIndex` logic. Only needs behavioral verification, not new rendering code. |
| `QuizFeedback.tsx` | Has `QuizSet` support with "Next Quiz" button | Verify smooth chain transitions | Already handles `isQuizSet`, `hasMoreQuizzes`, `onNextQuiz` callback. |
| `learning.ts` types | `QuizSet`, `QuizSetHidden` interfaces exist | No type changes needed | Interfaces already support 1-5 quizzes with `current_index` and `total_quizzes`. |
| `TopicNode` type | No complexity/quiz_count | Not needed on frontend | Frontend doesn't need to know about complexity classification — it only renders whatever quiz data the backend sends. |

### No New Libraries Required

| Capability Needed | Provided By | Already Installed | Evidence |
|-------------------|-------------|-------------------|----------|
| Complexity classification (`Literal` type) | Pydantic v2 | Yes | `RevisionMode = Literal["full_review", "quiz_only"]` already in `learning.py` line 554 |
| Multi-quiz structured output | Instructor + Pydantic | Yes | `QuizSet` schema (lines 264-307) validated with `field_validator`. Context7 confirms `create_iterable` and list models work with Vertex AI provider |
| Difficulty gradient enforcement | Prompt engineering | Yes (Gemini Flash) | Existing `QUIZZER_SYSTEM_PROMPT` already defines easy/medium/hard calibration. Extend with positional difficulty instructions |
| Quiz chain progression tracking | SQLite `quiz_data` table | Yes | `current_index INTEGER DEFAULT 0` column exists (line 152 of persistence). `quiz_attempts` table tracks per-quiz-index attempts |
| Multi-quiz frontend rendering | React + existing components | Yes | `ConceptCard.tsx` has `QuizSetHidden` support, `QuizFeedback.tsx` has `QuizSet` navigation |
| Async parallel generation | `asyncio.gather` | Yes (stdlib) | `CourseOrchestrator` already uses scatter-gather pattern |

## Configuration Changes Only

### `InstructorClient` MODEL_CONFIGS Update

**File:** `server/utils/instructor_client.py`

```python
# BEFORE:
"quizzer": {
    "model": "gemini-2.5-flash",
    "temperature": 0.2,
    "max_output_tokens": 1024,  # Too small for 5-quiz chains
}

# AFTER:
"quizzer": {
    "model": "gemini-2.5-flash",
    "temperature": 0.2,
    "max_output_tokens": 4096,  # Supports up to 5 quizzes with full explanations
}
```

**Why 4096?**
- Single `QuizCard` with 4 options + explanations: ~200-300 tokens
- `QuizSet` with 5 quizzes: ~1000-1500 tokens
- JSON structure overhead + Pydantic validation: ~200 tokens
- Safety margin for verbose explanations: ~500 tokens
- Total realistic max: ~2200 tokens. 4096 provides comfortable 2x headroom.
- Matches planner's `max_output_tokens` (4096), which generates similarly complex structured JSON.

**Cost impact:** Negligible. Output tokens for Gemini Flash are cheap (~$0.10/1M tokens). Generating 5 quizzes vs 1 quiz adds ~$0.0001 per topic.

## Alternatives Considered

| Decision | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Multi-quiz generation | Single LLM call → `QuizSet` | N separate LLM calls (1 per quiz) | Latency: 1 call with 5 quizzes (~1s) vs 5 serial calls (~5s). Single call also maintains difficulty gradient coherence since the model sees all quizzes together. |
| Difficulty gradient | Prompt-engineered in Quizzer | Separate difficulty-specific agents | Over-engineering. The existing Quizzer prompt already defines easy/medium/hard calibration. Adding positional instructions ("Quiz 1 = easy, Quiz N = hard") is sufficient. |
| Complexity classification | Planner prompt instructions | Separate classification agent | Over-engineering. The Planner already reasons about topic structure. Adding complexity/quiz_count to its output is natural — it already decides topic ordering and scope. |
| Response model for quizzer | Return `QuizSet` directly | Return `list[QuizCard]` then wrap | `QuizSet` already has validation (`min_length=1, max_length=5`, `current_index` bounds checking). Using it directly ensures consistency and avoids manual wrapping. |
| Token limit increase | 1024 → 4096 | Dynamic per-request based on quiz_count | Unnecessary complexity. Flash model is fast regardless. Fixed 4096 is simple and covers all cases. Dynamic sizing adds branching logic for marginal savings. |
| `create_iterable` vs direct model | Direct `QuizSet` response model | `create_iterable` streaming individual QuizCards | `create_iterable` is for extracting *unbounded* lists from text. We have a *bounded* structured container (`QuizSet` with max 5). Direct response model is simpler and validates the complete set atomically. |

## Integration Points

### 1. Planner → Orchestrator (New Data Flow)

```
PlannerAgent.plan(query)
  → CourseOutline with TopicNode[].complexity + TopicNode[].quiz_count
    → CourseOrchestrator reads topic.quiz_count
      → Passes to QuizzerAgent.generate_quiz(topic, content, quiz_count)
```

**Key:** `TopicNode` schema change is backward-compatible. `complexity` and `quiz_count` have defaults (`"Intermediate"` and `1`), so existing courses without these fields still work.

### 2. Quizzer → Persistence (Modified Data Flow)

```
QuizzerAgent.generate_quiz(topic, content, quiz_count=N)
  → Returns QuizSet (1-N QuizCards with difficulty gradient)
    → learning_manager.create_concept_node(quiz=None, quiz_set=QuizSet)
```

**Key:** `create_concept_node` already accepts both `quiz: QuizCard` and `quiz_set: QuizSet`. The `ConceptNodeCreate` schema has both fields (lines 401-412 of `learning.py`).

### 3. Quiz Submission → Progression (Behavioral Change)

```
submit_quiz_answer(node_id, selected_option_id, quiz_index=N)
  → If quiz_index < total_quizzes - 1 AND correct:
      → Increment current_index (not mastered yet)
      → Return is_mastered=False, next_quiz_ready=True
  → If quiz_index == total_quizzes - 1 AND correct:
      → Mark mastered, unlock next node
      → Return is_mastered=True
```

**Key:** `quiz_index` already exists in `QuizSubmission` schema (line 723) and `quiz_attempts` table (line 213). The behavioral logic in persistence layer needs updating, but the data structures are ready.

## What NOT to Add

| Don't Add | Why Not |
|-----------|---------|
| New database tables | Existing `quiz_data` + `quiz_attempts` tables handle multi-quiz storage and per-quiz-index attempts already |
| New Python packages | All capabilities (Literal types, nested validation, structured LLM output, retry logic) are covered by existing Pydantic v2 + Instructor + Tenacity |
| New npm packages | Frontend already renders `QuizSet` with navigation. No new UI primitives needed |
| Separate complexity classifier service | Planner agent is the natural place for complexity assessment — it already reasons about topic depth |
| Graph database for quiz dependencies | Quiz chains are linear (easy → hard) within a single topic. A simple `current_index` integer is sufficient. Graph DB is for cross-topic dependencies, which aren't in scope |
| WebSocket for quiz progression | Quiz submission is request-response. No real-time streaming needed. REST endpoints with React Query cache invalidation work fine |
| Redis/caching layer | Quiz data is already stored in SQLite. Quiz chain state (`current_index`) is persisted server-side. No session-based caching needed |
| A/B testing framework | Premature. Build the feature first, measure learning outcomes later |
| Analytics/telemetry packages | Existing `logging` module with structured extras (`session_id`, `timing`) is sufficient for v1.2. Add telemetry when there are users |

## Version Verification

All versions verified against existing `package.json` and `requirements.txt`:

| Technology | Verified Version | Source | Supports Feature? |
|------------|-----------------|--------|-------------------|
| Pydantic | v2 (latest) | `requirements.txt` | YES — `Literal`, `field_validator`, nested model validation |
| Instructor | latest | `requirements.txt` | YES — Context7 confirms `QuizSet` as response_model works with Vertex AI |
| Gemini 2.5 Flash | Current | `instructor_client.py` MODEL_CONFIGS | YES — Handles structured JSON up to 4096 tokens easily |
| Gemini 2.5 Pro | Current | `instructor_client.py` MODEL_CONFIGS (planner) | YES — Complexity reasoning within planner's existing capability |
| SQLite | stdlib | `learning_persistence.py` | YES — `quiz_data.current_index`, `quiz_attempts.quiz_index` exist |
| React | 19.2.0 | `package.json` | YES — No version-specific features needed |
| TanStack Query | 5.90.20 | `package.json` | YES — Cache invalidation for quiz progression already works |
| Framer Motion | 12.29.2 | `package.json` | YES — Quiz transition animations already exist |

## Confidence Assessment

| Decision | Confidence | Basis |
|----------|-----------|-------|
| No new Python packages | HIGH | All schemas (`QuizSet`, `TopicNode`) exist. Instructor + Pydantic proven for nested structured output. Verified via Context7. |
| No new npm packages | HIGH | `ConceptCard.tsx` and `QuizFeedback.tsx` already render multi-quiz sets. Verified by reading source code. |
| `max_output_tokens` increase to 4096 | HIGH | Mathematical: 5 quizzes * ~300 tokens/quiz = ~1500 tokens. Current 1024 too small. 4096 has 2x margin. |
| Single-call vs multi-call for quiz generation | HIGH | Single call preserves difficulty gradient coherence. Instructor validates `QuizSet` atomically. Latency 5x better. |
| Planner handles complexity classification | MEDIUM | Architecturally sound (Planner is the curriculum architect). Prompt engineering quality untested — may need iteration on classification accuracy. |
| No new database tables | HIGH | `quiz_data.current_index` and `quiz_attempts.quiz_index` already exist in the schema. Verified in `init_learning_tables()`. |

## Sources

- **Context7 — Instructor/Vertex AI integration:** Confirmed `create_iterable` and structured `response_model` work with `vertexai/` provider pattern. Direct `QuizSet` as response model is the correct approach for bounded collections.
- **Context7 — Pydantic v2 validation:** Confirmed nested model validators, `Literal` types, and list validation patterns are production-ready.
- **Codebase analysis:** `server/schemas/learning.py`, `server/agents/quizzer.py`, `server/services/course_orchestrator.py`, `server/utils/instructor_client.py`, `server/database/learning_persistence.py`, `client/src/types/learning.ts`, `client/src/features/learning/ConceptCard.tsx`, `client/src/features/learning/QuizFeedback.tsx`
- **Feature spec:** `.planning/codebase/features/dynamic-quiz-generation.md`

---

*Stack research: 2026-02-17*
