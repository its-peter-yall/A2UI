# Technical Research: Real-Time Course Generation Pipeline

This document provides verified technical facts, API analysis, architectural trade-offs, and concrete specifications for the interactive, real-time course-generation pipeline defined in [goal.md](file:///D:/Peter/A2UI/docs/realtime-course-generation/goal.md).

---

## 1. Executive Summary & Recommended Architecture

### The Core Problem
In the current implementation, all three generative stages (Researcher, Planner, and Generator) execute via `BaseAgent.generate()`, which invokes `instructor_client.create_structured()` and blocks until the entire LLM response is returned and parsed. The UI shows static placeholders or animated skeletons until an entire section, curriculum outline, or topic module is saved to SQLite/MongoDB.

The goal explicitly mandates **actual response streaming**: users must see research synthesis, outline table-of-contents entries, and topic explanations while the underlying model API responses are still in flight, without making duplicate LLM calls or using fake timer playback.

### Recommended Architecture: Hybrid In-Process Streaming + Dual-Cursor Replay

```text
       ┌────────────────────────────────────────────────────────┐
       │             LangGraph Detached Course Job              │
       │                   (graph.ainvoke)                      │
       └───────────────────────────┬────────────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │ Node execution (Planner/Gen/Res)   │
                 │   create_partial (Instructor/JSON)│
                 └─────────────────┬─────────────────┘
                                   │
              Yields field deltas  │ Validates complete model
              (tokens / strings)   │ on final chunk
                                   │
                 ┌─────────────────┴─────────────────┐
                 │    Streaming Dispatch Boundary    │
                 │   (SessionLiveStreamBroadcaster)  │
                 └─────────┬───────────────────┬─────┘
                           │                   │
         Immediate push    │                   │ Persist authoritative
        (<10ms latency)    │                   │ milestones + jobs
                           ▼                   ▼
                 ┌─────────────────┐   ┌───────────────────────────┐
                 │ Active SSE      │   │ ProgressEventStore / DB   │
                 │ Connections     │   │ (OUTLINE_READY,           │
                 │ (In-flight UI)  │   │  MODULE_READY, etc.)      │
                 └─────────────────┘   └─────────────┬─────────────┘
                                                     │
                                                     ▼ Replay on reconnect
                                       ┌───────────────────────────┐
                                       │ SessionEventStream        │
                                       │ (Replay past milestones   │
                                       │  then tail live stream)   │
                                       └───────────────────────────┘
```

1. **Agent Level (`create_partial`)**: Use `instructor.from_openai(..., mode=instructor.Mode.JSON).chat.completions.create_partial(response_model=Model, messages=...)`.
   - Instructor 1.15.4 internally uses `jiter` to parse token streams into partial Pydantic models.
   - For string fields (like `GeneratedContent.content_markdown` or `TopicNode.title`), partial models yield growing strings across stream chunks.
   - The final stream chunk validates the complete Pydantic model with strict constraints (`min_length`, custom validators).
   - Exactly **one** LLM call is issued; no duplicate calls.
2. **LangGraph Level (`graph.ainvoke` preserved)**: Keep `runner.py` invoking `graph.ainvoke`.
   - Nodes run asynchronously within LangGraph's superstep execution.
   - Streaming takes place inside the node async functions (`outline_planner_node`, `generator_node`, `researcher_node`) and dispatches typed progress/draft events.
   - Checkpointing, worker lock heartbeats, `Send` fan-out, and batch barriers remain intact with zero regression risk.
3. **Event & Transport Level (Live Push + Replay)**:
   - Introduce an in-process `SessionLiveStreamBroadcaster` attached to the generation runtime.
   - Active SSE connections receive coalesced draft deltas pushed directly in memory (<10ms latency).
   - Milestone events (`STAGE_CHANGED`, `OUTLINE_READY`, `MODULE_READY`, etc.) continue to be persisted durably to `progress_events` in SQLite and MongoDB Atlas.
   - `stream_session_events` replays persisted milestones after the client's `?after=` cursor, and then seamlessly subscribes to the live broadcaster for in-flight deltas.
   - **Dual cursors**: The client maintains separate tracking for durable milestone event IDs (`generation.last_event_id`) and live draft sequence numbers (`draft_sequence` per target), preventing job poll watermarks from discarding live stream chunks.
4. **Client Presentation (Isolated Draft Store)**:
   - High-frequency draft deltas are stored in a dedicated local state hook (`useGenerationDrafts`), completely separated from the TanStack Query session cache.
   - TanStack Query is only invalidated/updated on durable milestone events (`OUTLINE_READY`, `MODULE_READY`, `RESEARCH_SECTION_READY`).
   - A safe partial markdown renderer (`DraftMarkdownPreview`) displays text smoothly without eager evaluation of incomplete code fences or Mermaid diagrams.

### Alternatives Evaluated & Trade-Offs

| Approach | Latency | Write Amplification | Checkpointer / Graph Risk | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **A. Pure DB-persisted draft tokens** (write every delta to `progress_events`) | 500ms (bound by SSE poll) | Extreme (2,000–5,000 DB writes/job; SQLite lock contention; Mongo counter burn) | Low | **Rejected**: Violates latency budget; destroys database performance. |
| **B. LangGraph `graph.astream` rewrite** | <50ms | Low | High (rewriting `runner.py` loop around `Send` fan-out risks broken checkpoints and lost lock heartbeats) | **Rejected**: High regression risk for zero functional gain over in-node streaming. |
| **C. Raw token stream (`AsyncOpenAI(stream=True)`) + secondary validation** | <20ms | Low | Medium (exposes raw JSON syntax, quotes, and unparsed fields; duplicates validation) | **Rejected**: Violates requirement to present extracted display fields rather than raw JSON syntax. |
| **D. Recommended Hybrid** (In-node `create_partial` + in-process SSE push + durable milestone persistence) | **<15ms** | **Zero** additional DB writes for transient tokens | **Zero** (preserves `graph.ainvoke` and existing store contracts) | **Selected** |

---

## 2. Verified API Facts with Source Versions

All observations below have been verified directly against the installed runtime packages in `server/.venv`:
- `instructor == 1.15.4`
- `openai == 2.52.0`
- `langgraph == 1.2.4`
- `jiter == 0.14.0`
- `pydantic == 2.13.0`

### Instructor 1.15.4 Capabilities & Method Signatures

Instructor 1.15.4 wraps the OpenAI async client via `instructor.from_openai(base_client, mode=instructor.Mode.JSON)`.
The wrapped `client.chat.completions` object exposes:
- `create(response_model, messages, max_retries=3, ...)` -> `T`
- `create_partial(response_model, messages, max_retries=3, ...)` -> `AsyncGenerator[T, None]`
- `create_iterable(messages, response_model, max_retries=3, ...)` -> `AsyncGenerator[T, None]`
- `create_with_completion(messages, response_model, ...)` -> `tuple[T, Any]`

#### Signature: `create_partial`
```python
async def create_partial(
    self,
    response_model: type[T],
    messages: list[ChatCompletionMessageParam],
    max_retries: int | AsyncRetrying = 3,
    context: dict[str, Any] | None = None,
    strict: bool = True,
    hooks: Hooks | None = None,
    **kwargs: Any,
) -> AsyncGenerator[T, None]:
```

#### Behavior with `Mode.JSON`
1. When `create_partial` is called, it injects `kwargs["stream"] = True` and wraps `response_model` with `instructor.v2.dsl.partial.Partial[response_model]`.
2. As chunks arrive from `AsyncOpenAI.chat.completions.create(stream=True)`, Instructor passes the incomplete buffer to `jiter.from_json(partial=True)`.
3. Incomplete fields are populated as `None` or partial strings/lists. Validation rules (such as `min_length`) are relaxed during streaming.
4. Intermediate yields produce instances of `Partial[Model]`:
   - At chunk 1: `CourseOutline(course_title="Python", topics=None)`
   - At chunk 2: `CourseOutline(course_title="Python Mastery", topics=[])`
   - At chunk 3: `CourseOutline(course_title="Python Mastery", topics=[{'title': 'Intro'}])`
   - At chunk 4: `CourseOutline(course_title="Python Mastery", topics=[TopicOutline(title="Introduction", ...)])`
5. On the final chunk (when the JSON stream ends), Instructor validates the accumulated data against the **original, full Pydantic model** with all field constraints enabled (`min_length`, regex, custom validators).
6. If the final object passes validation, the generator yields the final validated model instance. If validation fails, `pydantic_core.ValidationError` is raised.

#### Critical Finding on Retries in `create_partial`
- **Verified Fact**: In `instructor 1.15.4`, `max_retries` in `create_partial` **does not retry once yielding has begun**. Because an `AsyncGenerator` cannot un-yield data to a consumer, any validation failure at stream termination immediately raises `ValidationError`.
- **Architectural Implication**: Retries must be managed by the caller (e.g. in `GeneratorAgent` or `PlannerAgent`). When a validation failure occurs, the caller catches the exception, emits an attempt-reset event (`target_draft_reset`), and issues a new call with an incremented `attempt` index.

### Token & Character Chunk Semantics
- **Provider Chunks are Variable**: LLM providers (via OpenRouter or OpenAI) emit chunks ranging from 1 character to dozens of tokens per network packet.
- **Definition of "Live"**: Emitting updates within **50ms–100ms** of receipt from the provider.
- **Bounded Coalescing**:
  - Transport coalescing: Buffering deltas for 40ms–60ms or until at least 15–30 characters accumulate prevents packet flood over SSE without introducing human-perceptible delay (human visual reaction threshold is ~100ms).
  - Single-character updates are coalesced; complete words/tokens are emitted promptly.

---

## 3. LangGraph Execution & Concurrency Integration

### Analysis: `graph.ainvoke` vs `graph.astream`

In `server/graph/runner.py`, generation runs via:
```python
graph_task = asyncio.create_task(
    graph.ainvoke(input_data, config=config, context=context)
)
await graph_task
```

#### Why `graph.ainvoke` is the Lowest-Risk, Optimal Choice:
1. **Node Independence**: LangGraph nodes are ordinary `async def` functions. Any node can execute an async generator (`create_partial`) and emit progress callbacks or put items into an async queue.
2. **LangGraph Stream Limitations**: `graph.astream(stream_mode="updates")` only emits chunks at superstep boundaries when an entire node completes. It does not natively stream internal token deltas from inside custom structured-output calls unless complex `StreamWriter` bindings are injected into every agent.
3. **`Send` Fan-Out & Checkpointing**: `ainvoke` handles concurrent `Send("generator_node", ...)` and `Send("quizzer_node", ...)` with atomic checkpointer commits at step barriers. Modifying `runner.py` to use `astream` introduces significant risks:
   - Cancellation handling: If `astream` is interrupted during concurrent `Send` fan-outs, intermediate task cleanup can hang.
   - Checkpointer state: `MongoDBSaver` and SQLite saver behavior with interrupted `astream` can lead to orphaned channel writes.
4. **Conclusion**: Keep `graph.ainvoke` completely untouched in `server/graph/runner.py`. Streaming is performed inside the node functions via the agent streaming callback boundary.

### Concurrency Isolation for Fan-Out Topics
When `fan_out_generators` sends up to 3 concurrent `generator_node` tasks:
- Each worker state contains `{"job_id": ..., "session_id": ..., "sequence_index": index}`.
- Every streamed event payload carries `node_id`, `sequence_index`, and `attempt`.
- The live stream broadcaster and client reducers partition incoming deltas strictly by `node_id` / `sequence_index`. Text from concurrent workers is never interleaved into the same accumulator.

### Cancellation & Lock Heartbeats
- The existing heartbeat loop in `runner.py` runs every 15 seconds independently of node execution.
- If task cancellation is requested, `raise_if_cancel_requested(session_id)` raises `GenerationCancelled`.
- During an active `create_partial` loop, checking `raise_if_cancel_requested()` between chunks or handling `asyncio.CancelledError` ensures instant termination of both the HTTP stream and the underlying generator task.

---

## 4. Event + SSE Contract Design

### Proposed Extensions to `server/schemas/progress.py`

All new payload classes inherit from `BaseModel` with `ConfigDict(extra="forbid", from_attributes=True)`. Secrets, credentials, raw HTTP bodies, and hidden quiz questions/answers are strictly excluded.

#### New `ProgressEventType` Enum Values
```python
class ProgressEventType(str, Enum):
    # Existing milestone events
    STAGE_CHANGED = "stage_changed"
    RESEARCH_SECTION_READY = "research_section_ready"
    RESEARCH_DEGRADED = "research_degraded"
    OUTLINE_READY = "outline_ready"
    MODULE_READY = "module_ready"
    MODULE_FAILED = "module_failed"
    GENERATION_PAUSED = "generation_paused"
    GENERATION_CANCELLED = "generation_cancelled"
    GENERATION_COMPLETE = "generation_complete"

    # New real-time streaming events
    RESEARCH_SOURCES_UPDATED = "research_sources_updated"
    RESEARCH_TEXT_DELTA = "research_text_delta"
    OUTLINE_TEXT_DELTA = "outline_text_delta"
    TOPIC_CONTENT_DELTA = "topic_content_delta"
    TOPIC_EXPLANATION_READY = "topic_explanation_ready"
    TARGET_DRAFT_RESET = "target_draft_reset"
```

#### New Payload Schemas
```python
class ResearchSourcesUpdatedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    unique_source_count: int = Field(ge=0, le=50)
    new_sources_count: int = Field(ge=0, le=50)
    provider_id: Optional[str] = Field(default=None, max_length=50)


class ResearchTextDeltaPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    report_id: str = Field(min_length=1, max_length=100)
    theme: str = Field(min_length=1, max_length=100)
    sequence_index: int = Field(ge=0, le=20)
    text_delta: str = Field(min_length=1, max_length=4000)
    attempt: int = Field(default=1, ge=1, le=5)


class OutlineTextDeltaPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    course_title_delta: Optional[str] = Field(default=None, max_length=300)
    topic_index: Optional[int] = Field(default=None, ge=0, le=30)
    topic_title_delta: Optional[str] = Field(default=None, max_length=300)
    attempt: int = Field(default=1, ge=1, le=5)


class TopicContentDeltaPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    node_id: str = Field(min_length=1, max_length=100)
    sequence_index: int = Field(ge=0, le=30)
    text_delta: str = Field(min_length=1, max_length=4000)
    attempt: int = Field(default=1, ge=1, le=5)


class TopicExplanationReadyPayload(BaseModel):
    """Emitted when explanation streaming completes, before quizzes begin."""
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    node_id: str = Field(min_length=1, max_length=100)
    sequence_index: int = Field(ge=0, le=30)
    attempt: int = Field(default=1, ge=1, le=5)


class TargetDraftResetPayload(BaseModel):
    """Emitted when a retry or replan invalidates a provisional draft."""
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    target_type: Literal["research", "outline", "topic"]
    target_id: str = Field(min_length=1, max_length=100)
    sequence_index: Optional[int] = Field(default=None, ge=0, le=30)
    attempt: int = Field(ge=1, le=5)
    reason: str = Field(min_length=1, max_length=200)
```

### Event Contract Specification Table

| Event Name | Stage Attribution | Target Attribution | Reset / Finalize Trigger | Payload Key Fields |
| :--- | :--- | :--- | :--- | :--- |
| `research_sources_updated` | `RESEARCHING` | Research session | N/A | `unique_source_count`, `new_sources_count` |
| `research_text_delta` | `RESEARCHING` | `theme`, `sequence_index` | `target_draft_reset` / `research_section_ready` | `theme`, `sequence_index`, `text_delta`, `attempt` |
| `outline_text_delta` | `OUTLINING` | Outline / `topic_index` | `target_draft_reset` / `outline_ready` | `course_title_delta`, `topic_index`, `topic_title_delta`, `attempt` |
| `topic_content_delta` | `GENERATING_PREVIEW` / `GENERATING_BATCH` | `node_id`, `sequence_index` | `target_draft_reset` / `topic_explanation_ready` | `node_id`, `sequence_index`, `text_delta`, `attempt` |
| `topic_explanation_ready`| `GENERATING_PREVIEW` / `GENERATING_BATCH` | `node_id`, `sequence_index` | Reconciles explanation; waits for quizzer | `node_id`, `sequence_index`, `attempt` |
| `target_draft_reset` | Any | `target_type`, `target_id` | Clears target accumulator on client | `target_type`, `target_id`, `attempt`, `reason` |

### Dual-Cursor Architecture: Snapshot Watermark vs Draft Stream Cursor

**Current Risk**:
In `server/services/session_event_stream.py`, each SSE frame wraps the event in an envelope containing `generation: GenerationJobPublic`. The public job snapshot contains `last_event_id: int`. In the client (`generationEvents.ts`), `applyGenerationEvent` drops any event where `event.id <= currentId`.
If background polling or replayed events advance `session.generation.last_event_id` to milestone ID 5, and in-flight draft deltas arrive with ephemeral IDs or are evaluated against `last_event_id`, draft deltas could be discarded as stale.

**The Solution**:
1. **Durable Milestones (Numbered Sequentially via DB)**:
   - Milestone events (`STAGE_CHANGED`, `OUTLINE_READY`, `MODULE_READY`, etc.) obtain durable integer IDs from the database (`id: 1, 2, 3...`).
   - `session.generation.last_event_id` reflects only the highest durable milestone event ID.
2. **Draft Deltas (Target-Scoped Sequence Numbers)**:
   - Live draft events carry `id: 0` or negative IDs so they never advance or conflict with the durable milestone watermark.
   - Each draft event includes an internal monotonic sequence counter scoped to `(target_id, attempt)`.
   - The client tracks `draftSequences[targetId] = lastSeenSeq`. A newer snapshot watermark (`last_event_id`) never suppresses or resets draft sequences.

---

## 5. Bounded Low-Latency Replay Storage & Latency Budget

### Replay & Durability Evaluation

We evaluated four strategies for managing transient draft data:

1. **Synchronous DB row per delta (Rejected)**:
   - 20 topics × 150 chunks = 3,000 writes to SQLite/Mongo.
   - Severe write amplification and table contention.
   - Fails the 0.5s poll barrier without in-process signaling.
2. **Dedicated DB draft table with auto-compaction (Rejected)**:
   - Eliminates `progress_events` clutter, but still induces excessive disk I/O on Windows SQLite and burns Mongo collection counters.
3. **In-Process Stream Hub with Durable Snapshot on Finalize (Recommended)**:
   - **Live Path**: Chunks emitted by `create_partial` are forwarded directly to an in-memory `SessionLiveStreamBroadcaster` (pub-sub) in `server/services/session_event_stream.py`.
   - **Zero DB I/O for Tokens**: Not a single token chunk is written to disk.
   - **Milestone Persistence**: When a section, outline, or module finishes, its validated complete artifact is written to SQLite/Mongo and a durable milestone event is recorded.
   - **Reconnect / Refresh Handling**:
     - If a user refreshes mid-stream, `stream_session_events` replays past milestones from `progress_events`, fetches the active in-memory draft accumulator (if a job is actively running in this process), and then continues streaming live chunks.
     - If the process restarted, the job is paused or resumed from the LangGraph checkpoint; in-progress unvalidated drafts from the dead process are discarded cleanly.

### Concrete Latency Budget

| Metric | Target Budget | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Provider chunk to in-memory dispatch** | < 10 ms | Direct `asyncio` callback in agent streaming wrapper |
| **Coalescing window** | 40 ms – 60 ms (or 25 chars) | Micro-buffer in agent stream emitter |
| **First visible text on client** | < 100 ms | Direct SSE delivery without DB poll round-trip |
| **Max draft rows in memory** | < 100 KB per active job | Ring buffer holding only the current in-flight text per target |
| **SSE Replay batching** | 100 rows per DB fetch | `list_after(session_id, cursor, limit=100)` |

---

## 6. Client Component, Hook & State Machine Design

### Client Architecture Overview

```text
[SSE Stream: /learning/sessions/:id/events]
                       │
                       ▼
              useSessionEvents.ts
         (EventSource Event Listener)
           │                        │
           ├─ Milestone Events      └─ Draft Delta Events
           │  (stage_changed,          (outline_text_delta,
           │   outline_ready,           topic_content_delta,
           │   module_ready)            research_text_delta)
           ▼                            ▼
     Query Client Cache            useGenerationDrafts Hook
     (['learningSession', id])     (Lightweight Local Store)
           │                            │
           ▼                            ▼
     LearningPage                 Draft Accumulators
     (Overall Layout,             (TOC entries,
      Overlay Controller)          Topic skeletons,
           │                       Research panel)
           ▼                            │
     LearningPathContainer ─────────────┘
     (renders DraftMarkdownPreview inside active SkeletonCard)
```

### 1. State Management: Avoiding Render Storms
- **Problem**: Writing high-frequency text deltas into TanStack Query (`queryClient.setQueryData`) triggers tree-wide re-renders of `LearningPage`, `LearningPathContainer`, navigation bars, and modals 20–50 times per second.
- **Solution**:
  - Keep draft text in a dedicated `useGenerationDrafts` hook.
  - Internally, this hook manages an accumulator object:
    ```typescript
    interface GenerationDraftState {
      research: { theme: string; text: string; attempt: number } | null;
      outline: { courseTitle: string; topics: Map<number, string>; attempt: number };
      topics: Map<string, { text: string; attempt: number; isStreaming: boolean }>;
    }
    ```
  - Use `requestAnimationFrame` or a 50ms throttle to batch state updates to the UI components.
  - TanStack Query cache is updated **only** on milestone events (`OUTLINE_READY`, `MODULE_READY`, `RESEARCH_SECTION_READY`).

### 2. Auto-Open / Auto-Close Overlay State Machine
The UI manages automatic modal transitions with strict rules:
- **`RESEARCHING` Stage**:
  - If `web_search_requested` is true: automatically set `sourcesOpen = true`.
  - Display retrieved source counter as batches arrive.
  - Stream research synthesis text into `CourseSourcesPanel`.
- **`OUTLINING` Stage Transition**:
  - Automatically set `sourcesOpen = false` (close Sources panel without requiring user click).
  - Automatically set `isTOCOpen = true` (open Table of Contents modal).
  - Stream `course_title` and ordered topic titles into the modal.
- **`OUTLINE_READY` / `GENERATING_PREVIEW` Stage Transition**:
  - Automatically set `isTOCOpen = false` (dismiss TOC modal).
  - Main canvas renders the ordered topic skeletons.
- **User Dismissal Override**:
  - If the user explicitly closes a modal (Escape key or Close button), set `manualDismiss = true` for that stage and attempt.
  - The controller will NOT re-open the modal automatically during that attempt.

### 3. Focus & Accessibility (a11y)
- **Overlay Focus**:
  - On auto-open: Move focus to the dialog container or close button.
  - On auto-close: Restore focus to the main container or active topic card.
- **Screen Readers**:
  - Do NOT put `aria-live` on the streaming text container (preventing a barrage of single-token speech utterances).
  - Use `aria-live="polite"` on a hidden announcer element for stage and milestone updates:
    - *"Researching topic with live web sources"*
    - *"5 sources found"*
    - *"Curriculum outlined: 6 topics planned"*
    - *"Generating explanation for Topic 1: Introduction"*
    - *"Topic 1 content ready. Generating diagnostic quiz."*

### 4. Safe Partial Markdown Rendering (`DraftMarkdownPreview`)
- Incomplete markdown can contain half-formed links (`[text](ht...`), unterminated code blocks (` ```python\n... `), or incomplete HTML tags.
- Direct rendering via `MarkdownRenderer` would cause KaTeX or Mermaid parser crashes on every token.
- **Implementation**:
  - Create `DraftMarkdownPreview.tsx`:
    - Suppresses Mermaid diagram rendering until the closing ` ``` ` delimiter is present and syntax is validated.
    - Strips or escapes raw HTML tags.
    - Uses basic typography styles matching the app theme (Lexend font override).

---

## 7. Exact File Impact Map

The implementation decomposes into the 5 planned MAW packages:

### P1: Streaming Contracts & Shared Foundation
- `server/schemas/progress.py`: Add new `ProgressEventType` values and Pydantic payload models (`extra="forbid"`).
- `server/utils/instructor_client.py`: Add `create_partial_structured()` supporting async generator streaming with `create_partial`.
- `server/agents/base.py`: Add `generate_stream()` method yielding typed partial objects or deltas.
- `server/services/session_event_stream.py`: Add `SessionLiveStreamBroadcaster` for in-memory SSE push; integrate with existing `stream_session_events`.
- `server/tests/test_streaming_foundation.py` (New): Unittest coverage for streaming methods, chunk coalescing, and cancellation.

### P2: Live Research Producer
- `server/services/research_runner.py`:
  - Emit `RESEARCH_SOURCES_UPDATED` as search batches arrive from providers.
  - Stream synthesis text deltas using `synthesize_iteration_stream()`.
  - Handle attempt resets if source-ID correction occurs.
- `server/agents/researcher.py`: Add streaming synthesis method.
- `server/tests/test_live_research_streaming.py` (New): Verify source count updates and text streaming before research completion.

### P3: Live Curriculum & Topic Generators
- `server/agents/planner.py`: Add streaming outline generator yielding title and topic deltas.
- `server/agents/generator.py`: Add streaming explanation generator emitting content deltas with Mermaid/link retry resets.
- `server/graph/nodes.py`:
  - `outline_planner_node`: Stream outline deltas during planning.
  - `generator_node`: Stream topic content deltas, emit `TOPIC_EXPLANATION_READY` before quizzer fan-out.
- `server/tests/test_live_outline_and_topic_streaming.py` (New): Test in-flight outline and topic streaming, retry resets, and concurrent topic stream isolation.

### P4: Client Presentation & Overlay Automation
- `client/src/types/generation.ts`: Add TypeScript types for new SSE events.
- `client/src/features/learning/generationEvents.ts`: Add dual-cursor logic preventing snapshot watermark collisions.
- `client/src/features/learning/useSessionEvents.ts`: Subscribe to new SSE event types.
- `client/src/features/learning/useGenerationDrafts.ts` (New): Store and manage streaming draft deltas per target.
- `client/src/features/learning/useGenerationOverlays.ts` (New): Finite state machine managing zero-click auto-open/auto-close for Sources panel and TOC modal.
- `client/src/features/learning/DraftMarkdownPreview.tsx` (New): Safe preview rendering for streaming markdown.
- `client/src/features/learning/LearningPage.tsx`: Integrate overlay state machine and accessibility announcements.
- `client/src/features/learning/LearningPathContainer.tsx`: Render streaming topic drafts inside active skeletons.
- `client/src/features/learning/CourseSourcesPanel.tsx`: Support live research draft streaming and dynamic source counter.
- `client/src/features/learning/TableOfContentsModal.tsx`: Render growing topic titles during outlining.
- Colocated Vitest tests for all modified and new client components.

### P5: Integrated Verification
- `server/tests/test_realtime_generation_acceptance.py` (New): End-to-end server verification using controllable fake provider streams.
- `client/src/features/learning/__tests__/realtimeCourseGeneration.test.tsx` (New): Full client verification of the zero-click lifecycle.
- `client/vitest.generation.config.ts`: Update test inclusions to enforce >80% coverage on new code.
- `docs/realtime-course-generation/verification.md`: Final verification log.

---

## 8. Risks, Open Questions & Dependency Flags

### Dependency Flag: NO New Dependencies Required
- **Python Backend**: All necessary capabilities (`instructor.create_partial`, `openai` async streaming, `jiter` partial JSON parser, `langgraph` async nodes, `fastapi.responses.StreamingResponse`) are **already installed and verified**.
- **Frontend Client**: React 19, `@tanstack/react-query`, `framer-motion`, and native `EventSource` are sufficient.
- **Conclusion**: **Zero new packages** are required. Satisfies `docs/STACK.md` with no deviations.

### Identified Risks & Mitigations

1. **Risk: Provider Transport Latency & Rate Limits**
   - *Detail*: OpenRouter streaming may experience variable network latency or token batching depending on upstream providers.
   - *Mitigation*: The backend coalescing buffer ensures events are packaged efficiently, while provider failover and budget rules remain strictly enforced.
2. **Risk: Intermediate JSON Validation Failures on Malformed Streams**
   - *Detail*: If an upstream provider truncates JSON or emits invalid escape sequences mid-stream.
   - *Mitigation*: `create_partial` handles partial JSON via `jiter`. If the stream ends abruptly, Pydantic raises a ValidationError, triggering the existing attempt-retry mechanism.
3. **Risk: React 19 StrictMode Duplicate SSE Connections**
   - *Detail*: React StrictMode mounts and unmounts components in development, which could open dual `EventSource` connections.
   - *Mitigation*: Clean `source.close()` cleanup in `useSessionEvents` cleanup effect; server handles concurrent SSE reads gracefully via in-memory broadcast.

---

## 9. Testing Strategy & Verification Plan

Strict TDD is mandatory across all packages:

### Controllable Async Generator Fake
To prove that output appears **BEFORE** response completion (Acceptance Criteria A3, A5, A6), tests must use an async generator fake that pauses mid-stream:

```python
async def controllable_streaming_llm(chunks, pause_event, release_event):
    for chunk in chunks:
        yield chunk
        if pause_event:
            pause_event.set()
            await release_event.wait()
```
The test verifies that:
1. `pause_event.is_set()` is True (the first chunk was emitted).
2. The SSE stream or event consumer has already received the first delta.
3. The LLM has **not** completed yet (`release_event` is still pending).
4. `release_event.set()` is called, allowing the generator to finish and validate the final model.

### Concurrency Isolation Test
- Two workers (`seq_idx=0` and `seq_idx=1`) run concurrently via `asyncio.gather`.
- Stream yields interleaved chunks: `[Topic0-chunk1, Topic1-chunk1, Topic0-chunk2, Topic1-chunk2]`.
- Verify that Topic 0's accumulator contains only Topic 0 text, and Topic 1's contains only Topic 1 text.

### Exact Verification Commands
- **Server unittest**:
  `& server/.venv/Scripts/python.exe -m unittest discover -s server/tests`
- **Focused server acceptance**:
  `& server/.venv/Scripts/python.exe -m unittest server/tests/test_realtime_generation_acceptance.py`
- **Client unit tests**:
  `npm run test -- --run`
- **Client generation coverage**:
  `npm run test:generation:coverage`
- **Client lint**:
  `npm run lint`
- **Client build**:
  `npm run build`
