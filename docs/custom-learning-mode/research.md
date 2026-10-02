# Technical Research: Custom Learning Mode

**Document:** `docs/custom-learning-mode/research.md`  
**Date:** 2026-10-02  
**Status:** Completed  
**Author:** Technical Researcher Subagent  

---

## Executive Summary

Custom Learning Mode introduces a fourth depth mode to A2UI alongside Auto, Lite, and Full. In Custom mode, the user specifies an exact whole number of concept cards (1 to 30) and an optional web-research toggle. The system bypasses semantic depth classification, instructs the planner agent with an exact target cardinality constraint, allows outlines as small as 1 or 2 topics, retries once on outline cardinality mismatch, and fails through the existing durable error workflow if a second mismatch occurs.

This document traces the exact concept count and research flag through every system boundary (client UI, API contracts, SQLite and MongoDB persistence, detached generation runtime, staged LangGraph execution, checkpointing, and resume), audits all outline sizing assumptions across the codebase, details strict validation rules, evaluates existing test fixtures and baseline risks, and confirms disjoint file ownership across plans P1 through P4.

---

## 1. End-to-End Pipeline & Contract Surface Trace

The following diagram illustrates the exact lifecycle of `custom_topic_count` and `webSearchEnabled` across all tiers:

```
[TopicInput.tsx]
  │ mode='custom', customTopicCount=N (1-30), webSearchEnabled (shared)
  ▼
[learningApi.ts]
  │ POST /learning/generate
  │ Body: { query, mode: "custom", custom_topic_count: N }
  │ Headers: X-Web-Search-Enabled: "true", X-Tavily-Key: "..." (scoped, not stored)
  ▼
[server/routers/learning.py]
  │ GenerateCourseRequest validates: mode="custom" -> N is int, 1 <= N <= 30.
  │ Calls GenerationRuntime.start(request_body, llm_context, search_context)
  ▼
[server/services/generation_runtime.py]
  │ Calls job_store.create_session_shell_and_job(..., mode="custom", custom_topic_count=N)
  │ Returns 202 JSONResponse with public session shell containing custom_topic_count
  │ Schedules detached runner task: run_generation_job(..., resume=False)
  ▼
[Persistence Layer]
  ├─ SQLite:
  │    server/database/generation_jobs.py -> INSERT INTO learning_sessions (... custom_topic_count)
  │    server/database/learning_persistence.py -> column migration & session CRUD
  └─ MongoDB:
       server/database/repositories/mongo_jobs.py -> session_document["custom_topic_count"] = N
       server/database/repositories/mongo_learning.py -> session CRUD
  ▼
[server/graph/runner.py]
  │ Loads session: mode="custom", resolved_mode="custom", custom_topic_count=N
  │ Builds initial CourseState: { ..., "custom_topic_count": N, "resolved_mode": "custom" }
  │ Invokes graph.ainvoke(input_data, config, context)
  ▼
[server/graph/nodes.py: initialize_generation_node]
  │ Bypasses depth_router (mode in ("lite", "full", "custom") -> resolved_mode="custom")
  │ Persists resolved_mode="custom"
  │ Evaluates search_context.enabled -> routes to researcher_node or outline_planner_node
  ▼
[server/graph/nodes.py: outline_planner_node]
  │ Invokes planner_agent.plan(..., mode="custom", custom_topic_count=N)
  │ Planner enforces exact count N; retries once on mismatch; fails durably if still invalid
  │ Saves CourseOutline (allows 1-30 topics) to generation_artifact_store
  ▼
[server/graph/nodes.py: Batch & Fan-Out]
  │ select_topic_batch(0, N): PREVIEW_BATCH_SIZE min(3, N) -> (start=0, size=min(3, N))
  │ Generator & Quizzer workers fan out for exact batch size
  │ advance_batch_node verifies all N topics terminal
  │ route_next_batch routes to "finalize" when next_topic_index >= N
  ▼
[LangGraph Checkpoint & Resume]
  │ CourseState checkpointed in checkpoints.db / Mongo collections without secrets
  │ On resume: input_data=None; state restored from checkpoint containing custom_topic_count
```

### Concrete Contract Surfaces & Files

| Layer | File | Concrete Contract Surface |
|---|---|---|
| **Client Types** | `client/src/types/learning.ts` | `LearningDepthMode = 'auto' \| 'lite' \| 'full' \| 'custom'`; `ResolvedDepthMode = 'lite' \| 'full' \| 'custom'`; `GenerateCourseRequest.custom_topic_count?: number`; `LearningSession.custom_topic_count?: number \| null` |
| **Client API** | `client/src/lib/learningApi.ts` | `generateCourse(data: GenerateCourseRequest, options: GenerateCourseOptions)` transmits `custom_topic_count` in POST body and builds scoped search headers |
| **Client UI** | `client/src/features/learning/TopicInput.tsx` | Mode dropdown listbox (`Custom` option), settings row with "Number of concepts" input (1-30) and "Research" switch; shared `webSearchEnabled` state with globe icon |
| **API Router** | `server/routers/learning.py` | `GenerateCourseRequest`: validates `mode`, `custom_topic_count` (strict integer, 1-30, required for custom, disallowed otherwise); passes request to `runtime.start` |
| **Backend Schemas** | `server/schemas/learning.py` | `LearningDepthMode`, `ResolvedDepthMode`; `CourseOutline.topics` (`min_length=1`); `CourseOutline.validate_topics` (allows `len >= 1`); `LearningSessionResponse.custom_topic_count`; `validate_topic_count_for_mode` |
| **Repository Protocols** | `server/database/repositories/protocols.py` | `LearningRepository.create_learning_session(..., custom_topic_count=None)`; `GenerationJobRepository.create_session_shell_and_job(..., custom_topic_count=None)` |
| **SQLite Jobs Store** | `server/database/generation_jobs.py` | `create_session_shell_and_job`: inserts `custom_topic_count` into `learning_sessions` table; returns `custom_topic_count` in session dict |
| **SQLite Learning Store** | `server/database/learning_persistence.py` | `init_learning_tables` & `_ensure_session_progress_columns`: adds `custom_topic_count INTEGER` column to `learning_sessions`; `create_learning_session`, `get_learning_session`, `get_sessions_list` include `custom_topic_count` |
| **Mongo Jobs Store** | `server/database/repositories/mongo_jobs.py` | `create_session_shell_and_job`: sets `session_document["custom_topic_count"] = custom_topic_count` |
| **Mongo Learning Store** | `server/database/repositories/mongo_learning.py` | `create_learning_session`: stores `custom_topic_count` in Mongo document; `get_learning_session` returns it |
| **Generation Runtime** | `server/services/generation_runtime.py` | `runtime.start`: extracts `custom_topic_count` from request, forwards to `job_store.create_session_shell_and_job`, and includes it in `_shell_session_payload` |
| **Graph Runner** | `server/graph/runner.py` | `run_generation_job`: reads `custom_topic_count` and `resolved_mode` from session, populates initial `CourseState`, protects `resolved_mode="custom"` from reset |
| **Graph State** | `server/graph/state.py` | `CourseState`: adds `custom_topic_count: NotRequired[Optional[int]]`; preserves secret-free invariant |
| **Graph Nodes** | `server/graph/nodes.py` | `initialize_generation_node`: bypasses `resolve_depth_mode` for `"custom"`; `outline_planner_node`: passes `custom_topic_count` to `planner_agent.plan`; `select_topic_batch`: supports batches of size 1 and 2 |
| **Depth Router** | `server/services/depth_router.py` | `resolve_depth_mode`: short-circuits `"custom"` -> `"custom"` without LLM call |
| **Planner Agent** | `server/agents/planner.py` | Injects custom exact-count prompt template; verifies exact count; performs single strict replan; raises `OutlineTopicCountError` on second mismatch; complexity check accommodates count < 3 |

---

## 2. Audit of Outline & Count Assumptions (1/2-Topic Courses)

The codebase currently contains several assumptions enforcing a minimum of 3 topics. Each must be addressed for 1-topic and 2-topic custom courses:

### 1. `CourseOutline` Schema Field Constraint
- **File:** `server/schemas/learning.py:648`
- **Current code:**
  ```python
  topics: List[TopicNode] = Field(
      ...,
      description=f"Ordered list of topic nodes (minimum 3, maximum {MAX_COURSE_TOPICS})",
      min_length=3,
      max_length=MAX_COURSE_TOPICS,
  )
  ```
- **Issue:** Pydantic v2 rejects any outline with fewer than 3 topics at schema instantiation time before custom validators run.
- **Remedy:** Change `min_length=3` to `min_length=1`. Retain `max_length=MAX_COURSE_TOPICS` (30).

### 2. `CourseOutline.validate_topics` Field Validator
- **File:** `server/schemas/learning.py:655`
- **Current code:**
  ```python
  if len(topics) < 3:
      raise ValueError("CourseOutline requires at least 3 topics")
  ```
- **Issue:** Explicitly raises `ValueError` when `len(topics) < 3`.
- **Remedy:** Change condition to `if len(topics) < 1: raise ValueError("CourseOutline requires at least 1 topic")`. Per-mode bounds enforcement is handled separately by `validate_topic_count_for_mode`.

### 3. `MODE_TOPIC_BOUNDS` and `validate_topic_count_for_mode`
- **File:** `server/schemas/learning.py:99-126`
- **Current code:**
  ```python
  MODE_TOPIC_BOUNDS: dict[str, tuple[int, int]] = {
      "lite": (3, 10),
      "full": (10, 30),
  }
  ```
- **Issue:** `"custom"` is absent from `MODE_TOPIC_BOUNDS`. `validate_topic_count_for_mode` returns `False` if `mode` is `"custom"` unless custom count is supplied.
- **Remedy:** Update `validate_topic_count_for_mode` signature to accept `custom_topic_count: Optional[int] = None`. When `mode == "custom"`, return `len(outline.topics) == custom_topic_count`. For `"lite"` and `"full"`, retain bounds from `MODE_TOPIC_BOUNDS`.

### 4. Complexity Distribution Validator
- **File:** `server/agents/planner.py:521-526`
- **Current code:**
  ```python
  unique_complexities = {t.complexity for t in outline.topics}
  if len(unique_complexities) == 1:
      only = next(iter(unique_complexities))
      errors.append(
          f"All {total} topics have complexity '{only}' — expected varied distribution"
      )
  ```
- **Issue:** If a course has 1 topic (`total == 1`), `len(unique_complexities)` is mathematically 1, guaranteeing a blocking error. For a 2-topic course, both topics may legitimately be "Basic" or "Intermediate".
- **Remedy:** Guard the uniform-complexity error check so it applies only when `total >= 3` (or `total > 2`):
  ```python
  if total >= 3 and len(unique_complexities) == 1:
      ...
  ```
  Single-topic and two-topic outlines are thus permitted to have uniform complexity ratings.

### 5. Depth Router Mode Pass-Through
- **File:** `server/services/depth_router.py:112`
- **Current code:**
  ```python
  if mode in ("lite", "full"):
      return mode
  if mode != "auto":
      logger.warning("Unknown depth mode %r; falling back to lite", mode)
      return "lite"
  ```
- **Issue:** If `mode == "custom"` reached `resolve_depth_mode`, it would log a warning and fall back to `"lite"`.
- **Remedy:** Update to `if mode in ("lite", "full", "custom"): return mode`. Furthermore, in `server/graph/nodes.py:initialize_generation_node`, ensure `elif user_mode in ("lite", "full", "custom"): resolved_mode = user_mode` so `resolve_depth_mode` is never invoked for Custom courses.

### 6. Brief Planning and Batch Execution Verification
- **File:** `server/graph/nodes.py:181-188` (`select_topic_batch`)
- **Analysis:**
  ```python
  def select_topic_batch(cursor: int, total_topics: int) -> BatchSpec:
      if cursor == 0:
          size = min(PREVIEW_BATCH_SIZE, total_topics)
      else:
          size = min(STANDARD_BATCH_SIZE, total_topics - cursor)
      return BatchSpec(start=cursor, size=size)
  ```
  - For `total_topics = 1`: `cursor = 0` yields `size = min(3, 1) = 1` -> `BatchSpec(start=0, size=1)`.
    `next_topic_index` advances from 0 to 1. `route_next_batch` tests `state["next_topic_index"] < state["topic_count"]` (`1 < 1` is False) -> routes directly to `finalize`.
  - For `total_topics = 2`: `cursor = 0` yields `size = min(3, 2) = 2` -> `BatchSpec(start=0, size=2)`.
    `next_topic_index` advances to 2 -> `route_next_batch` routes to `finalize`.
  - For `total_topics = 3`: `cursor = 0` yields `size = 3` -> `route_next_batch` routes to `finalize`.
  - For `total_topics > 3`: Preview batch is 3, subsequent batches are up to 10.
  - `planner_agent.plan_briefs` checks `1 <= batch_size <= 10` and `start_index + batch_size <= len(outline.topics)`, which holds for batch sizes 1 and 2.
  - **Conclusion:** Batch selection and graph routing already gracefully support counts 1 and 2 without graph topology modifications.

---

## 3. Strict Validation, Dynamic Planner Prompting & Durable Error Flow

### Strict Request Validation Rules

In `server/routers/learning.py`, `GenerateCourseRequest` must strictly enforce cardinality and type constraints:

1. **Allowed Modes:** `mode` must be an exact member of `Literal["auto", "lite", "full", "custom"]`.
2. **Custom Mode Requirement:** When `mode == "custom"`, `custom_topic_count` is **mandatory** (cannot be `None` or omitted).
3. **Other Modes Prohibition:** When `mode in ("auto", "lite", "full")`, `custom_topic_count` must be `None` (or omitted). Supplying any non-null value must raise validation error 422.
4. **Strict Integer & Range Validation:**
   - In Python, `isinstance(True, int)` evaluates to `True`. Standard Pydantic integer coercion without strict mode may coerce `True` to `1` or `2.5` to `2`.
   - `custom_topic_count` must use strict integer validation:
     ```python
     custom_topic_count: Optional[int] = Field(
         default=None,
         ge=1,
         le=30,
         strict=True,
         description="Exact topic count for custom mode (1-30). Must be null for other modes."
     )
     ```
   - Add a model validator (`@model_validator(mode="after")`) or pre-validator to reject:
     - `bool` values (`True`, `False`)
     - Floating point numbers (`2.5`, `3.0`)
     - Strings (`"5"`)
     - Values `< 1` or `> 30`
     - Missing count when `mode == "custom"`
     - Present count when `mode != "custom"`

### Dynamic Exact-Count Planner Constraints

Unlike Lite (3-10) and Full (10-30) which use static ranges, Custom requires an exact cardinality `N`.

1. **Prompt Template:**
   Create a dynamic prompt template function `build_custom_template(count: int) -> str`:
   ```python
   def build_custom_template(count: int) -> str:
       return (
           f"You are in CUSTOM mode.\n"
           f"- Produce EXACTLY {count} topics (no fewer, no more).\n"
           f"- Decompose the subject into precisely {count} atomic concept nodes.\n"
           f"- Map quiz_count to complexity according to the base guidelines.\n"
           f"- Goal: deliver a complete, coherent curriculum in exactly {count} topics."
       )
   ```
2. **Planner System Prompt Injection:**
   `build_planner_system_prompt(mode, custom_topic_count=None)` injects `build_custom_template(custom_topic_count)` when `mode == "custom"`.

### One-Retry-Then-Durable-Failure Flow

Course generation employs a two-tier retry strategy:
1. **Network / Transport / JSON Parse Layer:** Handled by `instructor_client.py` using `tenacity`:
   - `@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))`
   - Retries transient timeouts, rate limits, and unparseable JSON completions.
2. **Semantic Cardinality Layer:** Handled by `PlannerAgent.plan`:
   - **Attempt 1:** Planner generates `CourseOutline`.
   - **Check:** `len(outline.topics) == custom_topic_count`.
   - **On Mismatch (Attempt 1):**
     - Logs warning: `Outline topic count %s does not match custom requirement %s; replanning once.`
     - Constructs strict correction user message:
       ```python
       replan_message = (
           f"{user_message}\n\n"
           f"CRITICAL CARDINALITY ERROR: You generated {count} topics. "
           f"You MUST generate EXACTLY {custom_topic_count} topics. "
           f"No more, no fewer. Re-generate the table of contents now."
       )
       ```
     - **Attempt 2:** Calls `self.generate` with `replan_message`.
     - **Check 2:** If `len(outline.topics) == custom_topic_count`, log success and proceed.
     - **On Second Mismatch:**
       - Raise `OutlineTopicCountError(mode="custom", count=len(outline.topics), min_topics=custom_topic_count, max_topics=custom_topic_count)`.
       - **Do NOT truncate:** Never slice `topics[:N]` as that drops critical educational concepts.
       - **Do NOT pad:** Never fabricate dummy topics to meet the count.
3. **Durable Error Propagation:**
   - `OutlineTopicCountError` escapes `outline_planner_node` to `server/graph/runner.py`.
   - Caught by `except Exception as exc:` in `run_generation_job`:
     - Calls `generation_job_store.mark_failed(job.id, "Generation failed", session_id=session_id)`.
     - Job stage transitions durably to `GenerationStage.FAILED`.
     - Emits `ProgressEventType.STAGE_CHANGED` with `stage: GenerationStage.FAILED`.
     - Lock is released cleanly in `finally`.
     - Clients polling `/learning/sessions/{id}` or listening to SSE see terminal failure status.

---

## 4. Research Availability, Model Gates, UI State & Secret Safety

### Model Gates

In `client/src/features/learning/TopicInput.tsx`:
- Before course generation can start, two requirements must be met:
  1. `hasApiKey`: The active AI provider must have an API key configured.
  2. `agentsReady`: `areAgentModelsConfigured(settings)` must verify all four agent model roles (`researcher`, `planner`, `generator`, `quizzer`) have assigned models.
- If either check fails, the "Start Learning" button is disabled and an accessible alert guides the user to Settings.
- This gate applies equally across all modes (Auto, Lite, Full, Custom).

### UI State: Globe Icon & Custom Research Switch

The user specified that the globe icon and the Custom research switch represent a single unified setting, never two independent toggles:
- **Shared State:** `TopicInput.tsx` maintains a single boolean React state:
  ```tsx
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  ```
- **Globe Button:** Positioned inside the topic input bar.
- **Custom Research Switch:** Positioned in the Custom settings row below the topic input bar.
- Both controls read `webSearchEnabled` and update `setWebSearchEnabled((prev) => !prev)`.
- When switching modes (e.g. from Custom to Auto), `webSearchEnabled` remains unchanged.

### Search Capability & Guidance for Disabled State

- `hasWebSearchCapability()` from `client/src/lib/providerSettings.ts` returns `true` if any search provider (Tavily, Exa, Brave, SerpAPI) has an API key configured.
- When `hasWebSearchCapability() === false`:
  - **Globe Button:** Hidden from the input bar (existing behavior).
  - **Custom Research Switch:** Remains **visible** in the Custom settings row, but is **disabled** (`disabled={true}`), accompanied by helpful assistive text:
    > "Configure web search provider in Settings to enable research."
  - **Generation Usability:** The user can still proceed with Custom course generation with research turned off.

### Scoped Search Headers & Secret Safety Invariant

- Secret flow follows the established architecture in `client/src/lib/learningApi.ts`:
  - Client reads keys from browser `localStorage`.
  - `buildWebSearchHeaders(webSearchEnabled, getWebSearchSettings())` constructs request headers (`X-Web-Search-Enabled`, `X-Tavily-Key`, etc.).
  - Headers are sent exclusively on `POST /learning/generate` and `POST /learning/sessions/{id}/resume`.
  - The server extracts `search_context: SearchContext = Depends(get_search_context)` in request scope.
  - `SearchContext` is passed via `CourseGraphContext` (runtime context only).
  - `CourseState` (checkpointed state) and SQLite/Mongo databases store ONLY `web_search_enabled: bool` and `web_search_requested: bool`. **Zero credentials are persisted.**

### Graph Research Node Routing

In `server/graph/nodes.py:route_optional_research`:
```python
def route_optional_research(state: CourseState, runtime: Any = None) -> str:
    if state.get("web_search_enabled") and not state.get("research_report_id"):
        return "researcher_node"
    return "outline_planner_node"
```
- When `webSearchEnabled` is `False`: Bypasses `researcher_node` directly to `outline_planner_node`.
- When `webSearchEnabled` is `True`: Executes `researcher_node`, stores grounded report in `research_store`, and passes citations and excerpt context to `outline_planner_node`.
- This mechanism operates identically for Custom courses without modification.

### Resume Behavior

- In `GenerationRuntime.resume`:
  - When resuming a job that requested web search (`job.web_search_requested == True`) and whose research is still open (`PENDING` or `RESEARCHING`), fresh search credentials must be provided in request headers (`search_context.enabled == True`). If missing, raises HTTP 401.
  - If research was already completed before interruption, fresh search credentials are not required.
  - The checkpoint restores `CourseState` (including `custom_topic_count`, `mode="custom"`, `resolved_mode="custom"`).
  - Generation resumes at the recorded batch without re-running completed nodes.

---

## 5. Inspection of Existing Tests, Baseline Risks & Disjoint Plan Scopes

### Baseline Test Execution Results

All focused test suites were executed from the repository root:
1. **Backend Unit Tests:**
   Command: `server/.venv/Scripts/python.exe -m unittest server/tests/test_depth_mode_schema.py server/tests/test_depth_mode_persistence.py server/tests/test_generation_jobs.py server/tests/test_mongo_jobs.py server/tests/test_mongo_learning.py server/tests/test_planner_mode.py server/tests/test_depth_router.py server/tests/test_generation_runtime.py server/tests/test_staged_graph.py server/tests/test_graph.py`
   **Result:** Ran 53 tests in 4.111s — **OK (all passed)**.
2. **Client Unit Tests:**
   Command: `npm test -- src/features/learning/TopicInput.test.tsx src/lib/learningApi.test.ts src/types/learning.test.ts`
   **Result:** 3 test files, 19 tests — **passed**.

### Baseline Failure Risks

1. **`test_course_outline_rejects_2_topics` in `test_depth_mode_schema.py`:**
   - Lines 55-58 of `server/tests/test_depth_mode_schema.py` explicitly test that an outline with 2 topics raises `ValidationError`.
   - When P1 relaxes `CourseOutline` `min_length` from 3 to 1, this test will fail unless updated.
   - P1 must update this test to assert that 1 and 2 topics are accepted by `CourseOutline`, while adding tests that 0 topics is rejected.
2. **283 Pre-Existing Modified Files in Working Tree:**
   - The workspace contains 283 tracked files with modifications (primarily header updates).
   - **Crucial Rule:** Workers must never run `git add .` or stage broad directory trees. Every worker must use targeted path staging (`git add <specific_file>`).
3. **Pydantic v2 Int-Coercion Pitfall:**
   - Without `strict=True` or an explicit validator, Pydantic v2 coerces `True` -> `1`, `"5"` -> `5`, and `2.5` -> `2`.
   - `GenerateCourseRequest` must include strict validation to reject booleans, fractions, and strings for `custom_topic_count`.

---

## 6. Refined Plan Scopes, File Ownership & Completion Gates

File ownership across the four execution plans is verified to be 100% disjoint, allowing parallel and pipelined execution without file conflicts:

```
        ┌──────────────────────────────────────────────┐
        │       P1: Contracts and Persistence          │
        │  Types, schemas, request model, stores (SQL/Mongo) │
        └──────────────────────┬───────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
  ┌─────────────────────────────┐ ┌─────────────────────────────┐
  │  P2: Planner & Runtime      │ │  P3: Custom Settings UI     │
  │  Planner, depth router,     │ │  TopicInput, learningApi,   │
  │  nodes, runner, state       │ │  settings row, toggle       │
  └────────────┬────────────────┘ └─────────────┬───────────────┘
               │                                │
               └───────────────┬────────────────┘
                               ▼
        ┌──────────────────────────────────────────────┐
        │       P4: Integrated Acceptance              │
        │  Cross-layer integration tests & verification│
        └──────────────────────────────────────────────┘
```

### Plan P1: Contracts and Persistence
- **Deliverable:** `docs/custom-learning-mode/plan1.md` and implementation commit(s).
- **Owned Production Files:**
  - `client/src/types/learning.ts` (add `'custom'` to mode unions, `custom_topic_count` to request & session interfaces)
  - `server/schemas/learning.py` (add `'custom'` to mode literals, `CourseOutline.topics` `min_length=1`, `validate_topics` `>= 1`, `validate_topic_count_for_mode` custom logic, `LearningSessionResponse.custom_topic_count`)
  - `server/routers/learning.py` (`GenerateCourseRequest` model only: add `'custom'` mode, strict `custom_topic_count` field & validation)
  - `server/database/learning_persistence.py` (`_ensure_session_progress_columns` add `custom_topic_count`, `init_learning_tables`, session CRUD)
  - `server/database/generation_jobs.py` (`create_session_shell_and_job` insert & return `custom_topic_count`)
  - `server/database/repositories/protocols.py` (extend `LearningRepository` and `GenerationJobRepository` signatures)
  - `server/database/repositories/mongo_learning.py` (store and load `custom_topic_count`)
  - `server/database/repositories/mongo_jobs.py` (persist `custom_topic_count` in session document)
- **Owned Test Files:**
  - `client/src/types/learning.test.ts`
  - `server/tests/test_depth_mode_schema.py`
  - `server/tests/test_depth_mode_persistence.py`
  - `server/tests/test_generation_jobs.py`
  - `server/tests/test_mongo_jobs.py`
  - `server/tests/test_mongo_learning.py`
- **Exit Gate:**
  - `CourseOutline` allows 1, 2, and 30 topics; rejects 0 and 31.
  - `GenerateCourseRequest` rejects missing count when mode is custom, rejects non-integer/boolean/fraction/out-of-range counts, and rejects count when mode is not custom.
  - Shell creation and session retrieval round-trip `custom_topic_count` on both SQLite and MongoDB.
  - Backward compatibility: existing records without `custom_topic_count` load safely with `None`.

### Plan P2: Planner and Durable Runtime
- **Prerequisite:** P1 completed and committed.
- **Deliverable:** `docs/custom-learning-mode/plan2.md` and implementation commit(s).
- **Owned Production Files:**
  - `server/agents/planner.py` (dynamic `CUSTOM_TEMPLATE`, exact count enforcement, single replan on mismatch, `OutlineTopicCountError`, complexity check guard for count < 3)
  - `server/services/depth_router.py` (`resolve_depth_mode` short-circuits `'custom'`)
  - `server/services/generation_runtime.py` (`runtime.start` forwards `custom_topic_count` to job store and returns in `_shell_session_payload`)
  - `server/graph/state.py` (`CourseState` adds `custom_topic_count`)
  - `server/graph/nodes.py` (`initialize_generation_node` bypasses classifier for custom; `outline_planner_node` passes target count to planner)
  - `server/graph/runner.py` (preserves `resolved_mode="custom"`, injects `custom_topic_count` into initial `CourseState`)
- **Owned Test Files:**
  - `server/tests/test_planner_mode.py`
  - `server/tests/test_depth_router.py`
  - `server/tests/test_generation_runtime.py`
  - `server/tests/test_staged_graph.py`
  - `server/tests/test_graph.py`
- **Exit Gate:**
  - Planner produces exact counts 1, 2, intermediate, and 30.
  - Classification LLM call is bypassed for Custom mode.
  - One replan occurs on mismatch; second mismatch raises `OutlineTopicCountError` and enters durable `FAILED` stage.
  - Resuming a paused job restores `custom_topic_count` from checkpoint state without secrets.

### Plan P3: Custom Settings and API Payload
- **Prerequisite:** P1 completed and committed. Can run concurrently with P2.
- **Deliverable:** `docs/custom-learning-mode/plan3.md` and implementation commit(s).
- **Owned Production Files:**
  - `client/src/features/learning/TopicInput.tsx` (add 'Custom' to dropdown options, render settings row below input with concept count 1-30 and Research switch, sync with globe icon, handle disabled search guidance, retain entered count across mode switches, form submission validation)
  - `client/src/lib/learningApi.ts` (pass `custom_topic_count` in `GenerateCourseRequest` payload)
- **Owned Test Files:**
  - `client/src/features/learning/TopicInput.test.tsx`
  - `client/src/lib/learningApi.test.ts`
- **Exit Gate:**
  - Dropdown displays Auto, Lite, Full, Custom.
  - Settings row displays only when Custom is selected.
  - Count input validates 1-30, starts empty, prevents submit on invalid/empty count with accessible feedback.
  - Research switch and globe icon share state; disabled research switch displays Settings guidance when search unavailable.
  - Switching modes retains entered count in component state; submitted payload omits count for non-custom modes.
  - Narrow viewport layout is responsive and styled per conductor guidelines.

### Plan P4: Integrated Acceptance
- **Prerequisite:** P2 and P3 completed and committed.
- **Deliverable:** `docs/custom-learning-mode/plan4.md` and integration commit(s).
- **Owned New Test Files:**
  - `server/tests/test_custom_learning_mode_integration.py`
  - `client/src/features/learning/__tests__/customLearningMode.test.tsx`
- **Exit Gate:**
  - Cross-layer tests confirm count 1, 2, 5, 30 through request -> shell -> graph -> completion.
  - Web research toggle off/on correctly controls `researcher_node` execution for Custom courses.
  - Mismatched outline triggering durable `FAILED` stage is verified end-to-end.
  - Checkpoint resume on SQLite and MongoDB preserves custom count.
  - Full client and server regression suites pass cleanly with no linter or build errors.

---

## 7. Recommended Adjustments for Orchestrator `state.md`

1. **`server/database/generation_migrations.py` Ownership:**
   - Confirm exclusion from P1: `generation_migrations.py` manages versioned generation tables (`generation_jobs`, `research_reports`, etc.) while `LearningManager` in `learning_persistence.py` owns columns on `learning_sessions`. No changes to `generation_migrations.py` are needed.
2. **Complexity Distribution Guard in `planner.py`:**
   - Explicitly note in P2 scope that `validate_complexity_distribution` in `server/agents/planner.py` must guard its uniform-complexity error check (`if total >= 3 and len(unique_complexities) == 1`) so 1-topic and 2-topic courses do not trigger validation errors.
3. **Execution Concurrency:**
   - Confirm that P2 (backend execution) and P3 (frontend UI) have zero file overlap and can be planned and executed concurrently once P1 is committed.

---

## 8. References & Specifications

- `docs/custom-learning-mode/goal.md` — Approved feature design and concept range
- `docs/custom-learning-mode/state.md` — Workflow state machine, DAG, and preservation rules
- `docs/learning-depth-modes/goal.md` — Prior depth mode implementation (Auto/Lite/Full)
- `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/TESTING.md`, `docs/CONVENTIONS.md` — Core specifications
