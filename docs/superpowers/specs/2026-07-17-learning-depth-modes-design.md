# Design: Learning Depth Modes (auto / lite / full)

**Date:** 2026-07-17  
**Status:** Approved (user)  
**Approach:** A — Prompt templates + graph mode state  
**Goal doc:** `docs/learning-depth-modes/goal.md`

## 1. Problem

Course generation always uses the same soft planner scaling (bias toward more topics, schema min 5). Trivial queries over-expand; complex queries need explicit full-depth ranges. Users need explicit control plus an automatic depth router.

## 2. Goals

- Add modes: `auto` | `lite` | `full` on learning input.
- Lite: 3–10 concept topics for trivial subjects.
- Full: 10–30 concept topics for complex subjects.
- Auto: cheap semantic classify → resolve to lite or full before planning.
- One base planner system prompt + two injectable templates.
- Hard schema bounds by resolved mode.
- Persist user mode and resolved mode on session.

## 3. Non-goals

- Redesign generator/quizzer content style beyond count/depth guidance in planner.
- Course-card UI badges for mode (persist only for now).
- Separate full planner agent classes (Approach C rejected).

## 4. Architecture

```
TopicInput [dropdown: auto|lite|full, default auto]
    │
    ▼
POST /learning/generate
  { query, user_id?, mode? }   # mode default "auto"
    │
    ▼
resolve_depth_mode(query, mode, llm_context)
  - if mode in {lite, full}: resolved = mode
  - if mode == auto: DepthRouterAgent.classify(query) → lite|full
  - on router failure: resolved = lite (token-saving fallback), log warning
    │
    ▼
LangGraph CourseState
  query, user_id, mode, resolved_mode
    │
    ▼
planner_node
  planner.plan(query, mode=resolved_mode, llm_context=...)
  system = BASE_PROMPT + MODE_TEMPLATE[resolved_mode]
  validate topic count in [min,max] for mode
  if invalid: one replan with stricter MODE CONSTRAINTS
  if still invalid: fail → HTTP 422
    │
    ▼
persist learning_sessions.mode, learning_sessions.resolved_mode
continue existing fan-out / background generation
```

No change to graph topology (planner → fan-out → workers).

## 5. Mode bounds

| Resolved mode | min topics | max topics |
|---------------|------------|------------|
| lite | 3 | 10 |
| full | 10 | 30 |

Exactly 10 topics is valid for both modes.

## 6. Components

### 6.1 Client

**`TopicInput.tsx`**
- State: `mode: 'auto' | 'lite' | 'full'` default `'auto'`.
- Dropdown left of Learn button (or adjacent inside form) with options Auto / Lite / Full.
- Submit payload: `{ query, user_id, mode }`.
- Disabled with input while loading / no API key (same as today).

**`types/learning.ts`**
```ts
export type LearningDepthMode = 'auto' | 'lite' | 'full';
export type ResolvedDepthMode = 'lite' | 'full';

export interface GenerateCourseRequest {
  query: string;
  user_id?: string;
  mode?: LearningDepthMode; // default auto server-side
}

// Session response gains:
// mode?: LearningDepthMode
// resolved_mode?: ResolvedDepthMode
```

**`learningApi.ts`**
- Pass through `mode` on generate.

### 6.2 API

**`GenerateCourseRequest` (server)**
```python
class GenerateCourseRequest(BaseModel):
    query: str = Field(..., min_length=1)
    user_id: Optional[str] = None
    mode: Literal["auto", "lite", "full"] = "auto"
```

**Session response fields**
- `mode`: user-selected (`auto|lite|full`)
- `resolved_mode`: effective (`lite|full`)

Invalid `mode` → FastAPI 422 validation.

### 6.3 Depth router

New module: `server/services/depth_router.py` (or `server/agents/depth_router.py` if using BaseAgent).

- Input: query string + LLMContext
- Output model:
  ```python
  class DepthRouteResult(BaseModel):
      mode: Literal["lite", "full"]
      reason: str
  ```
- Short system prompt: classify subject depth for curriculum length only.
  - lite cues: single concept, trivia, short explainer, named effect/method
  - full cues: multi-system domain, “from scratch”, architecture, multi-week study
- Prefer cheapest/fast model from existing instructor client config when available.
- Failure (timeout, parse error, empty): return `lite`, log warning.

### 6.4 Planner prompt structure

Keep single base `PLANNER_SYSTEM_PROMPT`.

Extract/replace the “Adaptive Topic Scaling” section with injection point:

```python
PLANNER_SYSTEM_PROMPT = """... shared KLI, decomposition, complexity, quiz mapping ...

## Mode Constraints
{mode_template}

## Output Requirements
...
"""

LITE_TEMPLATE = """
You are in LITE mode.
- Produce between 3 and 10 topics (inclusive).
- Prefer 3–7 for very small concepts; use up to 10 only if needed for clarity.
- Favor Basic/Intermediate complexity; Advanced only if essential.
- Prefer quiz_count 1–2.
- Goal: complete coverage of a narrow subject without over-expansion.
"""

FULL_TEMPLATE = """
You are in FULL mode.
- Produce between 10 and 30 topics (inclusive).
- Prefer atomic, granular topics for complete mastery.
- Use varied complexity (Basic → Intermediate → Advanced).
- Map quiz_count to complexity as in base rules.
- Goal: thorough near-expert path with no foundational gaps.
"""
```

`PlannerAgent.plan(..., mode: Literal["lite","full"])`:
1. Format system prompt with template for `mode`.
2. Generate `CourseOutline`.
3. Validate `len(topics)` against bounds.
4. If fail: one retry with appended stricter constraint string listing exact min/max and previous count.
5. Still fail: raise domain error for router to map to 422.

### 6.5 Schema validation

Current `CourseOutline.topics` min_length=5 / validator “at least 5 topics” must become **mode-aware**.

Options (prefer first):
1. **Validate in planner service** after generation (mode bounds) + keep schema min at 3 globally so lite is representable.
2. Optional dynamic model factory for response_model if instructor needs tighter schema per call.

Recommended:
- Change global `CourseOutline` minimum topics to **3** (supports lite).
- Add `MAX_TOPICS = 30` global safety.
- Add `validate_topic_count_for_mode(outline, mode)` in planner (or schemas helper):
  - lite: 3 ≤ n ≤ 10
  - full: 10 ≤ n ≤ 30

### 6.6 Graph & persistence

**`CourseState`**
```python
mode: NotRequired[str]           # auto|lite|full
resolved_mode: NotRequired[str]  # lite|full
```

**`planner_node`**
- Read `resolved_mode` from state; pass to `planner_agent.plan`.
- Write outline as today.

**`learning_sessions` columns** (migrate via PRAGMA like existing progress columns):
- `mode TEXT NOT NULL DEFAULT 'auto'`
- `resolved_mode TEXT` (nullable for legacy rows)

**`create_session` / generate path**
- Persist both fields when creating session after plan (or when session row is first written — match existing write site in graph/router).

## 7. Error handling

| Case | Behavior |
|------|----------|
| Invalid mode string | FastAPI 422 |
| Auto router fails | `resolved_mode=lite`, log warning, continue |
| Outline out of bounds | One replan; still bad → 422 with clear message |
| Existing LLM/provider errors | Unchanged |

## 8. Data flow example

**Lite explicit**
```
mode=lite → resolved=lite → template LITE → 5 topics → session.mode=lite, resolved_mode=lite
```

**Auto → full**
```
mode=auto → classify("ML from scratch")→full → template FULL → 18 topics → mode=auto, resolved_mode=full
```

## 9. Testing

### Server
- `test_depth_router.py`: classify lite/full with mocked LLM; failure → lite.
- `test_planner_mode.py`: prompt contains correct template; bounds validation; replan once.
- `test_learning_graph_router.py` / generate tests: default mode auto; pass mode lite/full; response includes fields.
- Schema helper: boundary 10 valid for both; 2 invalid lite; 31 invalid full.

### Client
- TopicInput: default mode auto; changing dropdown updates payload; generate called with mode.

### Manual
- Lite query “Placebo Effect” with mode lite → ≤10 cards.
- Full query “Machine learning from scratch” with mode full → ≥10 cards.
- Auto trivial vs complex routing sanity check.

## 10. Implementation phases

1. **Contracts & DB** — types, request/response fields, migrations, CourseState.
2. **Depth router** — service + unit tests (TDD).
3. **Planner mode templates** — inject + bounds + replan (TDD).
4. **Wire generate** — router resolve → graph state → persist → API response.
5. **Client dropdown** — TopicInput + types + API.
6. **Verification** — full test suite, lint, client build.

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Lite min 3 vs old min 5 breaks tests | Update fixtures to ≥3; full-mode tests still use ≥10 |
| Router model cost/latency | Short prompt, cheap model, fail → lite |
| LLM ignores bounds | Hard validate + one replan |
| Legacy sessions without columns | Migration defaults; null-safe reads |

## 12. Open items resolved

- UI: dropdown, default auto
- Auto: separate cheap LLM classify
- Bounds: hard schema/service validation
- Boundary 10: allowed both modes
- Persist: mode + resolved_mode
- Router fail: fallback **lite**
