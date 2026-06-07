# Split topic_worker into generator_node + quizzer_node

**Date:** 2026-06-07
**Status:** Draft
**Scope:** Server graph refactoring — replace monolithic `topic_worker` with two isolated LangGraph nodes

---

## Problem

`topic_worker` runs generator + quizzer sequentially in one node. This forces retry
handling into `BaseAgent.generate()` (manual loop) because LangGraph's `RetryPolicy`
would retry the entire node — wasting tokens when only quizzer fails.

Current retry layers:
- **tenacity** — HTTP transient (429/503/timeout) — stays
- **instructor** — schema enforcement (JSON → Pydantic) — stays
- **BaseAgent loop** — ValidationError retry — redundant if nodes are isolated

## Goal

1. Split `topic_worker` into `generator_node` and `quizzer_node`
2. Use LangGraph `retry_policy` for node-level ValidationError retry
3. Remove `BaseAgent.generate()` retry loop
4. Keep tenacity + instructor untouched

## Architecture

### Current Graph

```
START → planner_node → fan_out_topics → [topic_worker × N] → build_response_node → END
```

### New Graph

```
START
  → planner_node
  → fan_out_generators (conditional edge)
  → [generator_node × N] (parallel via Send)
  → fan_out_quizzers (conditional edge)
  → [quizzer_node × N] (parallel via Send)
  → build_response_node
  → END
```

**No barrier node needed.** LangGraph's `add_conditional_edges("generator_node", fan_out_quizzers)`
fires once after ALL parallel `generator_node` instances complete. This is native fan-in behavior —
the conditional edge from a Send target acts as a synchronization point.

Verified via LangGraph test pattern:
```python
builder.add_conditional_edges("1", send_for_fun)   # Send to "2" × 2
builder.add_conditional_edges("2", route_to_three)  # Fires once after both "2"s complete
```

### State Changes

Add to `CourseState`:

```python
class GeneratorResult(TypedDict):
    topic_data: dict[str, Any]
    content_markdown: str
    generation_ms: float
    error_message: Optional[str]
    sequence_index: int
    session_id: str

class CourseState(TypedDict):
    # ... existing fields ...
    generator_results: Annotated[list[GeneratorResult], operator.add]
    topic_results: Annotated[list[TopicResult], operator.add]  # quizzer results only
```

`generator_results` accumulates content from parallel generators.
`fan_out_quizzers` reads `generator_results` and creates `Send` payloads for quizzer.

### Node Definitions

#### generator_node

```python
async def generator_node(state, runtime) -> dict:
    # Calls generator_agent.generate_explanation()
    # Returns {"generator_results": [GeneratorResult]}
    # On error: returns error_message, placeholder content_markdown
    # No DB writes — pure generation
```

#### quizzer_node

```python
async def quizzer_node(state, runtime) -> dict:
    # Receives: topic_data, content_markdown, sequence_index, session_id, error_message
    # If error_message present (generator failed):
    #   - Create ERROR node in DB (failed_step=GENERATOR)
    #   - Skip quizzer call
    # Else:
    #   - Call quizzer_agent.generate_quiz_set()
    #   - On success: create success node in DB
    #   - On error: create ERROR node (failed_step=QUIZZER), preserve content
    # Returns {"topic_results": [TopicResult]}
```

DB writes centralized in `quizzer_node`. `generator_node` is pure/side-effect-free.

### Fan-Out Functions

#### fan_out_generators

```python
def fan_out_generators(state: CourseState) -> list[Send]:
    outline = CourseOutline(**state["outline"])
    sends = []
    for index, topic in enumerate(outline.topics):
        sends.append(Send("generator_node", {
            "topic_data": topic.model_dump(),
            "prev_summary": ...,
            "next_summary": ...,
            "session_id": state["session"]["id"],
            "sequence_index": index,
        }))
    return sends
```

#### fan_out_quizzers

```python
def fan_out_quizzers(state: CourseState) -> list[Send]:
    generator_results = state.get("generator_results", [])
    sends = []
    for result in generator_results:
        sends.append(Send("quizzer_node", {
            "topic_data": result["topic_data"],
            "content_markdown": result["content_markdown"],
            "sequence_index": result["sequence_index"],
            "session_id": result["session_id"],
            "error_message": result.get("error_message"),
        }))
    return sends
```

### RetryPolicy + error_handler

```python
from langgraph.pregel import RetryPolicy

workflow.add_node("generator_node", generator_node,
    retry_policy=RetryPolicy(max_attempts=2, retry_on=ValidationError),
    error_handler=generator_error_handler)
workflow.add_node("quizzer_node", quizzer_node,
    retry_policy=RetryPolicy(max_attempts=2, retry_on=ValidationError),
    error_handler=quizzer_error_handler)
```

Replaces `BaseAgent.generate()` loop (lines 129-170 in `base.py`).

**Retry flow per exception type:**

| Exception | Who retries | What happens after exhaustion |
|-----------|-------------|-------------------------------|
| `ValidationError` | LangGraph `retry_policy` (2x) | `error_handler` catches, returns error result |
| HTTP error (429/503/timeout) | tenacity (3x) inside `instructor_client` | `error_handler` catches, returns error result |
| `CancelledError` | No retry | Propagates (graph cancellation) |
| Other unexpected | No retry | `error_handler` catches, returns error result |

**Why error_handler is required:** Without it, unhandled exceptions kill the entire
graph — one topic failure cancels all parallel branches. `error_handler` catches
post-retry exceptions and returns error results to state, preserving graceful degradation.

```python
async def generator_error_handler(state, runtime, error: Exception) -> dict:
    """Catch generator failure after retries exhausted."""
    topic = TopicNode(**state["topic_data"])
    return {"generator_results": [{
        "topic_data": state["topic_data"],
        "content_markdown": "Content generation failed. Retry is available.",
        "generation_ms": 0.0,
        "error_message": str(error),
        "sequence_index": state["sequence_index"],
        "session_id": state["session_id"],
    }]}

async def quizzer_error_handler(state, runtime, error: Exception) -> dict:
    """Catch quizzer failure after retries exhausted."""
    # Persist ERROR node to DB (generator succeeded, content available)
    learning_manager.create_concept_node(
        session_id=state["session_id"],
        sequence_index=state["sequence_index"],
        title=state["topic_data"]["title"],
        content_markdown=state["content_markdown"],
        status=NodeStatus.ERROR,
        error_message=str(error),
        retry_available=True,
        failed_step=FailedStep.QUIZZER,
    )
    return {"topic_results": [{
        "node": {...},  # ERROR node
        "generation_ms": 0.0,
        "error_message": str(error),
    }]}
```

Note: parameter is `retry_policy`, not `retry`.

### Graph Build (build.py)

```python
def build_graph(checkpointer=None):
    workflow = StateGraph(CourseState, context_schema=CourseGraphContext)

    workflow.add_node("planner_node", planner_node)
    workflow.add_node("generator_node", generator_node,
        retry_policy=RetryPolicy(max_attempts=2, retry_on=ValidationError),
        error_handler=generator_error_handler)
    workflow.add_node("quizzer_node", quizzer_node,
        retry_policy=RetryPolicy(max_attempts=2, retry_on=ValidationError),
        error_handler=quizzer_error_handler)
    workflow.add_node("build_response_node", _build_response_node)

    workflow.add_edge(START, "planner_node")
    workflow.add_conditional_edges("planner_node", fan_out_generators)
    workflow.add_conditional_edges("generator_node", fan_out_quizzers)
    workflow.add_edge("quizzer_node", "build_response_node")
    workflow.add_edge("build_response_node", END)

    return workflow.compile(checkpointer=checkpointer)
```

## Files Changed

| File | Change |
|------|--------|
| `server/graph/nodes.py` | Remove `topic_worker`, `_persist_partial_failure`. Add `generator_node`, `quizzer_node`, `fan_out_generators`, `fan_out_quizzers`, `generator_error_handler`, `quizzer_error_handler` |
| `server/graph/state.py` | Add `GeneratorResult`, `generator_results` to `CourseState` |
| `server/graph/build.py` | New graph wiring with `retry_policy` + `error_handler` |
| `server/agents/base.py` | Remove retry loop in `generate()` (lines 129-170) |
| `server/graph/regen.py` | No change — already calls agents directly |
| `server/routers/learning.py` | No change — interface unchanged |
| `server/tests/test_graph.py` | Update tests for new node structure |

## Error Handling Matrix

| Failure | Retries | Exhausted handler | DB result |
|---------|---------|-------------------|-----------|
| Generator HTTP error | tenacity 3x | `generator_error_handler` | `failed_step=GENERATOR` |
| Generator ValidationError | LangGraph 2x | `generator_error_handler` | `failed_step=GENERATOR` |
| Generator other exception | none | `generator_error_handler` | `failed_step=GENERATOR` |
| Quizzer HTTP error | tenacity 3x | `quizzer_error_handler` | `failed_step=QUIZZER`, content preserved |
| Quizzer ValidationError | LangGraph 2x | `quizzer_error_handler` | `failed_step=QUIZZER`, content preserved |
| Quizzer other exception | none | `quizzer_error_handler` | `failed_step=QUIZZER`, content preserved |

All paths lead to graceful degradation — one topic failure doesn't kill the course.

## What Stays Unchanged

- **tenacity** — HTTP-level retry inside `instructor_client.create_structured()`
- **instructor** — JSON → Pydantic schema enforcement
- **regen.py** — calls agents directly, no graph involvement
- **build_response_node** — pure aggregation, reads `topic_results`
- **API contract** — `LearningSessionWithNodes` response shape identical

## What's Removed

- `topic_worker` function
- `_persist_partial_failure` function
- `BaseAgent.generate()` retry loop (lines 129-170)
- `FailedStep.BOTH` value (no longer needed — each node handles its own failure)

## What's Added

- `generator_node` — pure generation, no DB writes
- `quizzer_node` — quiz generation + DB persistence
- `fan_out_generators` — Send generator_node × N
- `fan_out_quizzers` — Send quizzer_node × N
- `generator_error_handler` — catches generator failures after retries
- `quizzer_error_handler` — catches quizzer failures after retries, persists ERROR node
- `GeneratorResult` TypedDict + `generator_results` state field

## Trade-offs

**Pros:**
- Surgical retry — only failed step retries, not entire topic
- Cleaner separation — generator is pure, quizzer handles persistence
- LangGraph `retry_policy` replaces manual retry loop
- Token savings — quizzer failure doesn't re-run generator
- No barrier node — LangGraph's native fan-in handles sync
- `error_handler` ensures graceful degradation — no single failure kills the course

**Cons:**
- More nodes = more graph complexity
- Two fan-out functions instead of one
- Generator results must pass through state (serialization cost)
- Error handler logic duplicates some `_persist_partial_failure` behavior

## Open Questions

1. ~~Should `generator_barrier` be a real node or is there a LangGraph-native sync pattern?~~
   **Resolved:** No barrier needed. `add_conditional_edges("generator_node", fan_out_quizzers)` fires once after all parallel instances complete.
2. Should `FailedStep.BOTH` be kept for backward compatibility with existing DB rows?
3. Should `generator_node` persist partial content to DB for crash recovery, or is state-only acceptable?
