**Plan P1: Streaming contracts and replay foundation**

**Goal:** Provide genuine in-flight structured output, safe typed live events, and race-free snapshot/reconnect delivery for P2/P3/P4 without changing course scheduling or persistence.

**Architecture:** Research, outline, and topic producers call one shared `BaseAgent.generate_streaming` method. Instructor partial models reach an awaited callback while the provider response is open; only a fully validated final model returns to the producer. A process-local broadcaster retains current target drafts and pushes them to the existing SSE endpoint alongside durable repository milestones, using independent cursors.

**Tech Stack:** Python 3.10+, asyncio, installed Instructor 1.15.4 / OpenAI 2.52.0 / Pydantic 2.13.0, tenacity, FastAPI SSE, stdlib unittest, existing SQLite and Mongo repository facades. No dependencies or schema migrations.

Use the executing-plans and test-driven-development skills to execute the checkboxes. This is a plan-only deliverable; none of the implementation below has been applied or tested yet.

## Authority, ownership, and constraints

- Authoritative: `docs/realtime-course-generation/goal.md`, `research.md`, and `state.md`; project rules: `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, `docs/TESTING.md`, `docs/STRUCTURE.md`.
- Modify only `server/schemas/progress.py`, `server/utils/instructor_client.py`, `server/agents/base.py`, and `server/services/session_event_stream.py`, plus the explicitly owned enum expectation in `server/tests/test_research_progress_contracts.py`.
- Create only the dedicated tests and helper listed in the tasks. Existing tests are regression inputs except `test_event_type_set_matches_locked_contract`, whose exact fifteen-value expectation P1 owns. No client, producer, graph, router, repository, dependency, or checkpoint changes.
- Preserve `graph.ainvoke`, locks, 15-second graph heartbeats, concurrency 3, `Send` fan-out, preview/batch barriers, depth/count contracts, quiz visibility, and background task lifetime.
- All commands run from `D:/Peter/A2UI` in PowerShell unless stated otherwise. Prefix Python with `& server/.venv/Scripts/python.exe -m`.
- Prepend the mandatory 76-character separator module docstring to each new Python file before its first write; fill FILE/LOCATION/PURPOSE/ROLE/KEY COMPONENTS with that file's actual information. Add `from __future__ import annotations` immediately after the header. Test blocks below follow that prefix. End test modules with `if __name__ == "__main__": unittest.main()`.
- Stage only a task's paths. Serialize commits with the orchestrator; never stage another worker's changes.

## Public contract frozen for downstream plans

Execution order: first create the helper from Task 2 and all dedicated failing test modules from Tasks 1–8, with their required headers, and run the eight-module focused unittest command in the final regression list. Record the expected missing-contract failures. Then execute Tasks 1–8 in numeric order, rerunning each task's red command immediately before its implementation and green command afterward. The integrated Task 8 assertions are intentionally introduced before their production dependencies; its final step is their green verification. Stage each test file only at its owning task's commit. This makes the integration test-first order explicit without reverting passing code.

### Agent callback and final-return boundary (P2/P3)

In `server/utils/instructor_client.py`:

```python
@dataclass(frozen=True)
class StructuredStreamUpdate:
    kind: Literal["attempt_started", "partial"]
    attempt: int
    partial: Optional[BaseModel] = None

StreamDeltaCallback = Callable[
    [StructuredStreamUpdate], Awaitable[None]
]

async def InstructorClient.create_partial_structured(
    self,
    role: str,
    response_model: Type[T],
    messages: list[dict[str, str]],
    api_key: str,
    model_override: Optional[str] = None,
    attribution_headers: Optional[dict[str, str]] = None,
    system_prompt: Optional[str] = None,
    provider: AIProviderEnum = AIProviderEnum.OPENROUTER,
    reasoning_params: Optional[dict[str, Any]] = None,
    max_completion_tokens: Optional[int] = None,
    *,
    on_delta: Optional[StreamDeltaCallback] = None,
    initial_attempt: int = 1,
    **kwargs: Any,
) -> T: ...
```

In `server/agents/base.py`:

```python
async def BaseAgent.generate_streaming(
    self,
    response_model: Type[T],
    user_message: str,
    context: Optional[dict[str, Any]] = None,
    llm_context: Optional[LLMContext] = None,
    system_prompt_override: Optional[str] = None,
    *,
    on_delta: Optional[StreamDeltaCallback] = None,
    initial_attempt: int = 1,
    **kwargs: Any,
) -> T: ...
```

- `on_delta` is async and awaited immediately. A `partial` update contains a **cumulative partial Pydantic snapshot**, not a suffix and not provider JSON. Fields can be `None`; producers select only their approved display fields. Do not serialize `update.partial` directly into events.
- Producers compute suffixes only from strings that extend the previous partial. Ignore `None` and empty deltas. Split text suffixes into chunks of at most 4,000 characters before publishing; outline title suffixes are at most 300. Non-prefix field replacement is a correction: reject/replan through the existing producer domain loop with a higher attempt and reset, rather than concatenating incompatible drafts. P1 centralizes provider configuration, streaming iteration, retries, validation, cancellation, and credential-safe callbacks; P2/P3 own only their model-specific field extraction and existing domain validation.
- `attempt_started` occurs before every chargeable call, including call 1. It has `partial=None`. Producers begin/reset the affected broadcaster target before publishing new text. Each transport retry increments `attempt`. Callers retain the latest attempt from this callback and pass `initial_attempt=latest_attempt + 1` for their existing validation/replan loop.
- One `create_partial` call per attempt, SDK retries disabled, Instructor `max_retries=AsyncRetrying(stop=stop_after_attempt(1), reraise=True)` (an explicit one-attempt policy avoids integer retry-count semantics). Shared outer tenacity policy: at most 3 attempts, exponential waits 2–10 seconds, no retries for `ValueError`, `TypeError`, cancellation, or callback failures. Attempt values are 1–5; remaining budget is `min(3, 6 - initial_attempt)`.
- Explicit `response_model.model_validate(last.model_dump())` at end is mandatory even if Instructor appears to validate the final chunk. Missing/invalid final data raises; partials never become ready artifacts. Validation failures are `ValueError` subclasses and are handled by P2/P3's existing domain retry/replan logic, with a new target attempt, not silently retried here.
- No `create_structured` fallback or duplicate display call. Unsupported streaming raises through existing producer warning/failure paths. P2/P3 must publish a fixed safe warning code/message; no exception text.
- Callbacks select research synthesis text, outline title/topic titles, or topic explanation only. Quiz/answer/reasoning fields are never streamed. API credentials are redacted from callback copies without altering final validated artifacts.

Instructor describes partial outputs as incremental model snapshots and documents limited validator support; explicit final validation protects this boundary. See [Instructor partial-output documentation](https://python.useinstructor.com/concepts/partial/). Installed implementation in `server/.venv/Lib/site-packages/instructor/v2/core/client.py` confirms the async-generator API. Its retry implementation accepts explicit `AsyncRetrying`, which guarantees one SDK request per attempt without depending on integer retry-count interpretations.

### Broadcaster methods (P2/P3)

All definitions below are in `server/services/session_event_stream.py`:

```python
class SessionLiveStreamBroadcaster:
    def __init__(
        self, *, max_draft_bytes: int = 96_000,
        subscriber_limit: int = 64,
    ) -> None: ...

    async def begin_target(
        self, *, session_id: str, job_id: str,
        stage: GenerationStage,
        target_type: Literal["research", "outline", "topic"],
        target_id: str, attempt: int,
        sequence_index: Optional[int] = None,
        reason: Literal[
            "started", "retry", "replan", "correction", "resumed"
        ] = "started",
    ) -> None: ...

    async def publish(
        self, *, session_id: str, job_id: str,
        stage: GenerationStage,
        event_type: ProgressEventType,
        payload: BaseModel,
    ) -> None: ...

    async def retire_target(
        self, *, session_id: str,
        target_type: Literal["research", "outline", "topic"],
        target_id: str,
        sequence_index: Optional[int] = None,
    ) -> None: ...

    async def clear_session(self, session_id: str) -> None: ...

    @asynccontextmanager
    async def subscribe(
        self, session_id: str,
    ) -> AsyncIterator[LiveSubscription]: ...

class LiveSubscription:
    snapshots: list[LiveDraftEvent]
    async def next_event(self) -> LiveDraftEvent: ...

session_live_stream = SessionLiveStreamBroadcaster()
```

`publish` accepts only the six new event types and their exact payload classes; it refuses durable milestone types. Producers never supply `sequence`. Begin/reset does not write a DB row. `publish` rejects mismatched job/stage/target metadata and silently ignores an older attempt; publishing before beginning a text target raises `ValueError` (source-count targets initialize on first publish). An equal begin attempt is idempotent; a lower begin attempt is ignored; a higher attempt replaces only that target. Transport retry/replan calls `begin_target` with a fixed reason above.

Canonical target key, within a session: `(target_type, target_id, sequence_index)`. Wire `target` is `json.dumps([target_type, target_id, sequence_index], separators=(",", ":"))`; no ambiguous concatenation. Research target_id is report ID and sequence_index is section index; outline target_id is session ID with no index; topic target_id is node ID and sequence_index is ordered topic index. Source-count target is type research, target_id=session ID, sequence_index=None. A new `job_id` clears previous job's retained drafts before accepting its target. Same-process SSE disconnect does not clear anything.

P2/P3 await `retire_target` **after** the corresponding validated artifact and durable ready milestone have been committed; retire research sections/outline/modules then. `topic_explanation_ready` retains a preview while quizzes are pending and never implies `module_ready`. Failure/pause retains current available preview until resume/reset or bounded expiry; producers stop publishing. P2/P3 call `clear_session` on explicit deletion or replacement job as available within their ownership. SSE also clears completed/cancelled sessions after sending their final retained snapshot.

### Payloads and SSE wire fields (P2/P3/P4)

All new payloads use `ConfigDict(extra="forbid", from_attributes=True)`; field limits below follow research:

| Event / payload class | Fields |
| --- | --- |
| `research_sources_updated` / `ResearchSourcesUpdatedPayload` | `unique_source_count: int 0..50`, `new_sources_count: int 0..50`, `provider_id: Optional[str] <=50 = None` |
| `research_text_delta` / `ResearchTextDeltaPayload` | `report_id: str 1..100`, `theme: str 1..100`, `sequence_index: int 0..20`, `text_delta: str 1..4000`, `attempt: int 1..5 = 1` |
| `outline_text_delta` / `OutlineTextDeltaPayload` | `course_title_delta: Optional[str] <=300 = None`, `topic_index: Optional[int] 0..30 = None`, `topic_title_delta: Optional[str] <=300 = None`, `attempt: int 1..5 = 1` |
| `topic_content_delta` / `TopicContentDeltaPayload` | `node_id: str 1..100`, `sequence_index: int 0..30`, `text_delta: str 1..4000`, `attempt: int 1..5 = 1` |
| `topic_explanation_ready` / `TopicExplanationReadyPayload` | `node_id: str 1..100`, `sequence_index: int 0..30`, `attempt: int 1..5 = 1` |
| `target_draft_reset` / `TargetDraftResetPayload` | `target_type: Literal["research", "outline", "topic"]`, `target_id: str 1..100`, `sequence_index: Optional[int] 0..30 = None`, `attempt: int 1..5`, `reason: str 1..200` (publisher restricts to safe literals above) |

Outline payload validator requires a nonempty title delta or a paired `topic_index` + nonempty `topic_title_delta`; an index alone is invalid. Source-count `new_sources_count <= unique_source_count`.

Live envelope, in `server/schemas/progress.py`, forbids extra fields:

```python
class DraftSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    text: str = ""
    text_offset: int = Field(default=0, ge=0)
    truncated: bool = False
    course_title: str = ""
    topics: dict[int, str] = Field(default_factory=dict)
    explanation_ready: bool = False
    unique_source_count: Optional[int] = Field(default=None, ge=0, le=50)
    new_sources_count: Optional[int] = Field(default=None, ge=0, le=50)
    provider_id: Optional[str] = Field(default=None, max_length=50)

class LiveDraftEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    id: Literal[0] = 0
    session_id: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    stage: GenerationStage
    target: str = Field(min_length=1)
    attempt: int = Field(ge=1, le=5)
    sequence: int = Field(ge=1)
    event_type: ProgressEventType
    payload: BaseModel
    snapshot: Optional[DraftSnapshot] = None
```

`LiveDraftEvent` validates payload against `PAYLOAD_BY_EVENT_TYPE`, restricts type to the new set, and verifies matching payload attempt if present. Internal snapshots are typed copies of approved display fields; never generic provider dictionaries. `DraftSnapshot.topics` JSON object keys are index strings on the wire.

- Durable framing stays unchanged (`id: N`, envelope `generation`, positive DB ID).
- Live framing uses the existing six SSE event names and the live envelope above, with **no SSE `id:` line**, no `generation` object, and JSON `id: 0`. This preserves EventSource's durable `Last-Event-ID` automatically.
- Reconnect needs only existing `?after=N` / `Last-Event-ID`. A registered subscription atomically captures current snapshots before any future events can be missed. Replay durable milestones, emit current draft snapshots, then tail live events. No new HTTP endpoint or query parameter.
- `snapshot != null` means **replace** the target draft with that snapshot at `sequence`; ignore its payload as a delta. Initial attempt reset has sequence 1; each subsequent event increments target sequence. Queued events at/below the snapshot's sequence are suppressed. Reconnect snapshots may replace equal-sequence state to recover a refreshed client.
- P4 uses `(session_id, job_id, target, attempt, sequence)` for draft duplicate/stale rejection; polling `generation.last_event_id` cannot change this cursor. P4 gates historical milestone UI effects with current authoritative stage.
- Before snapshot emission, reread current subscriptions' snapshots after durable replay; remove targets finalized by the replayed milestone or already authoritative current stage. This prevents a slow replay from showing an obsolete research/outline overlay.
- Retention budget is 96,000 UTF-8 text bytes per job (<100 KB research target). Preserve full current drafts while under budget; on overflow keep the latest text window, set `truncated=True`, and expose `text_offset` (Unicode character offset). Live overflow delivery is a snapshot replacement, so clients never have to guess how much prefix was trimmed. P4 labels this bounded preview; final validated saved content remains complete. Outline titles are bounded at their schema limits; old completed targets and old attempts are removed first.
- Dispatch immediately with no buffering in P1. This satisfies the research's 50–100 ms upper budget and <10 ms dispatch target; optional 40–60 ms coalescing is unnecessary. P4 can batch renders. Subscriber mailboxes hold at most 64 entries; overflow replaces queued deltas with the latest snapshots, never blocks a producer.

## Task 1: Add safe payloads and live envelope

**Files:** Modify `server/schemas/progress.py` and only `test_event_type_set_matches_locked_contract` in `server/tests/test_research_progress_contracts.py`; create `server/tests/test_live_progress_contracts.py`.

- [ ] Red: add this exact test module body.

```python
import unittest

from pydantic import ValidationError

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    PAYLOAD_BY_EVENT_TYPE, DraftSnapshot, LiveDraftEvent,
    ProgressEventType, ResearchSourcesUpdatedPayload,
    ResearchTextDeltaPayload, OutlineTextDeltaPayload,
    TopicContentDeltaPayload, TopicExplanationReadyPayload,
    TargetDraftResetPayload,
)

CASES = [
    ("research_sources_updated", ResearchSourcesUpdatedPayload,
     {"unique_source_count": 2, "new_sources_count": 1}),
    ("research_text_delta", ResearchTextDeltaPayload,
     {"report_id": "r", "theme": "Basics", "sequence_index": 0,
      "text_delta": "Growing"}),
    ("outline_text_delta", OutlineTextDeltaPayload,
     {"course_title_delta": "Course"}),
    ("topic_content_delta", TopicContentDeltaPayload,
     {"node_id": "n", "sequence_index": 0, "text_delta": "Text"}),
    ("topic_explanation_ready", TopicExplanationReadyPayload,
     {"node_id": "n", "sequence_index": 0}),
    ("target_draft_reset", TargetDraftResetPayload,
     {"target_type": "topic", "target_id": "n", "attempt": 2,
      "reason": "retry"}),
]

class LiveProgressContractsTests(unittest.TestCase):
    def test_all_six_types_have_closed_payloads(self):
        for name, cls, fields in CASES:
            with self.subTest(name=name):
                kind = ProgressEventType(name)
                self.assertIs(PAYLOAD_BY_EVENT_TYPE[kind], cls)
                payload = cls(**fields)
                self.assertEqual(payload.model_dump()[next(iter(fields))],
                                 fields[next(iter(fields))])
                for forbidden in (
                    "api_key", "answers", "reasoning", "raw_response"
                ):
                    with self.assertRaises(ValidationError):
                        cls(**fields, **{forbidden: "private"})

    def test_empty_outline_and_unpaired_topic_are_rejected(self):
        for fields in ({}, {"topic_index": 0},
                       {"topic_title_delta": "Topic"}):
            with self.assertRaises(ValidationError):
                OutlineTextDeltaPayload(**fields)
        with self.assertRaises(ValidationError):
            ResearchSourcesUpdatedPayload(
                unique_source_count=1, new_sources_count=2,
            )

    def test_envelope_rejects_durable_ids_and_wrong_payloads(self):
        fields = dict(
            session_id="s", job_id="j", stage=GenerationStage.OUTLINING,
            target='["outline","s",null]', attempt=1, sequence=2,
            event_type=ProgressEventType.OUTLINE_TEXT_DELTA,
            payload=OutlineTextDeltaPayload(course_title_delta="Course"),
        )
        event = LiveDraftEvent(**fields, snapshot=DraftSnapshot())
        self.assertEqual(event.id, 0)
        with self.assertRaises(ValidationError):
            LiveDraftEvent(**fields, id=1)
        fields["payload"] = TopicExplanationReadyPayload(
            node_id="n", sequence_index=0,
        )
        with self.assertRaises(ValidationError):
            LiveDraftEvent(**fields)
```

- [ ] Run red: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_progress_contracts -v`. Expected import failure for new names, not a paid request.
- [ ] Green: add the six enum members, implement the payload fields exactly from the table, and add them to `PAYLOAD_BY_EVENT_TYPE`. Add `DraftSnapshot` and `LiveDraftEvent` exactly as above. Reuse the existing payload-type check in both envelope validators. Define this exact set:

```python
LIVE_EVENT_TYPES = frozenset({
    ProgressEventType.RESEARCH_SOURCES_UPDATED,
    ProgressEventType.RESEARCH_TEXT_DELTA,
    ProgressEventType.OUTLINE_TEXT_DELTA,
    ProgressEventType.TOPIC_CONTENT_DELTA,
    ProgressEventType.TOPIC_EXPLANATION_READY,
    ProgressEventType.TARGET_DRAFT_RESET,
})
```

Append these exact six entries to the existing enum in this order and to the expected list in `test_event_type_set_matches_locked_contract`:

```python
# Enum entries:
RESEARCH_SOURCES_UPDATED = "research_sources_updated"
RESEARCH_TEXT_DELTA = "research_text_delta"
OUTLINE_TEXT_DELTA = "outline_text_delta"
TOPIC_CONTENT_DELTA = "topic_content_delta"
TOPIC_EXPLANATION_READY = "topic_explanation_ready"
TARGET_DRAFT_RESET = "target_draft_reset"

# Existing test's additional expected strings:
"research_sources_updated",
"research_text_delta",
"outline_text_delta",
"topic_content_delta",
"topic_explanation_ready",
"target_draft_reset",
```

Update that test's expectation in the red step before running it; the old nine-value enum must fail against the new fifteen-value list. Preserve all other tests and original milestone ordering.
Update the existing `progress.py` header's "nine locked event values" description to fifteen; preserve its mandatory banner.

Exact payload class declarations (add the validators below inside their respective classes):

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
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    node_id: str = Field(min_length=1, max_length=100)
    sequence_index: int = Field(ge=0, le=30)
    attempt: int = Field(default=1, ge=1, le=5)

class TargetDraftResetPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    target_type: Literal["research", "outline", "topic"]
    target_id: str = Field(min_length=1, max_length=100)
    sequence_index: Optional[int] = Field(default=None, ge=0, le=30)
    attempt: int = Field(ge=1, le=5)
    reason: str = Field(min_length=1, max_length=200)
```

Add `Literal` and `Optional` to imports. Extend the existing map with:

```python
PAYLOAD_BY_EVENT_TYPE.update({
    ProgressEventType.RESEARCH_SOURCES_UPDATED: ResearchSourcesUpdatedPayload,
    ProgressEventType.RESEARCH_TEXT_DELTA: ResearchTextDeltaPayload,
    ProgressEventType.OUTLINE_TEXT_DELTA: OutlineTextDeltaPayload,
    ProgressEventType.TOPIC_CONTENT_DELTA: TopicContentDeltaPayload,
    ProgressEventType.TOPIC_EXPLANATION_READY: TopicExplanationReadyPayload,
    ProgressEventType.TARGET_DRAFT_RESET: TargetDraftResetPayload,
})
```

Exact additional validators:

```python
@model_validator(mode="after")
def valid_source_counts(self):
    if self.new_sources_count > self.unique_source_count:
        raise ValueError("New sources cannot exceed unique sources")
    return self

@model_validator(mode="after")
def valid_outline_delta(self):
    if (self.topic_index is None) != (self.topic_title_delta is None):
        raise ValueError("Topic index and title must be supplied together")
    if not self.course_title_delta and not self.topic_title_delta:
        raise ValueError("A display delta is required")
    return self

@model_validator(mode="after")
def valid_live_payload(self):
    if self.event_type not in LIVE_EVENT_TYPES:
        raise ValueError("Durable events cannot use the live envelope")
    expected = PAYLOAD_BY_EVENT_TYPE[self.event_type]
    if not isinstance(self.payload, expected):
        raise ValueError("Payload does not match live event type")
    if getattr(self.payload, "attempt", self.attempt) != self.attempt:
        raise ValueError("Payload attempt does not match envelope")
    return self
```

- [ ] Verify green and regression: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_progress_contracts server.tests.test_generation_contracts server.tests.test_research_progress_contracts server.tests.test_progress_events server.tests.test_mongo_progress -v`.
- [ ] Commit: `git add server/schemas/progress.py server/tests/test_live_progress_contracts.py server/tests/test_research_progress_contracts.py` then `git commit -m "feat(realtime): add typed live draft event contracts"`.

## Task 2: Stream one Instructor attempt and validate the final model

**Files:** Modify `server/utils/instructor_client.py`; create `server/tests/realtime_foundation_helpers.py` and `server/tests/test_instructor_partial_stream.py`.

- [ ] Red: helper module body (keep this helper independent of unimplemented names):

```python
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import BaseModel, Field

class StreamOutput(BaseModel):
    text: str = Field(min_length=3)

@contextmanager
def fake_instructor(stream_factory):
    sdk = MagicMock()
    sdk.close = AsyncMock()
    partial = MagicMock(side_effect=stream_factory)
    wrapped = SimpleNamespace(chat=SimpleNamespace(
        completions=SimpleNamespace(create_partial=partial),
    ))
    with patch(
        "server.utils.instructor_client.AsyncOpenAI", return_value=sdk,
    ) as constructor, patch(
        "server.utils.instructor_client.instructor.from_openai",
        return_value=wrapped,
    ):
        yield constructor, sdk, partial
```

Exact failing test module body:

```python
import asyncio
import unittest

from pydantic import ValidationError

from server.tests.realtime_foundation_helpers import (
    StreamOutput, fake_instructor,
)
from server.utils.instructor_client import InstructorClient

class InstructorPartialStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_updates_arrive_before_provider_finishes(self):
        second = asyncio.Event()
        release = asyncio.Event()
        finished = asyncio.Event()
        updates = []

        async def chunks(**kwargs):
            yield StreamOutput.model_construct(text="a")
            yield StreamOutput.model_construct(text="ab")
            await release.wait()
            yield StreamOutput(text="abc")
            finished.set()

        async def collect(update):
            if update.kind == "partial":
                updates.append(update.partial.text)
                if len(updates) == 2:
                    second.set()

        with fake_instructor(chunks) as (_, sdk, partial):
            task = asyncio.create_task(
                InstructorClient().create_partial_structured(
                    role="researcher", response_model=StreamOutput,
                    messages=[{"role": "user", "content": "topic"}],
                    api_key="fixture-secret", model_override="model",
                    on_delta=collect,
                )
            )
            try:
                await asyncio.wait_for(second.wait(), 0.25)
                self.assertEqual(updates, ["a", "ab"])
                self.assertFalse(task.done())
                self.assertFalse(finished.is_set())
                self.assertFalse(release.is_set())
                release.set()
                self.assertEqual((await task).text, "abc")
                partial.assert_called_once()
                self.assertEqual(
                    partial.call_args.kwargs["max_retries"].stop.max_attempt_number,
                    1,
                )
                sdk.close.assert_awaited_once()
            finally:
                release.set()
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_final_chunk_is_validated_against_full_model(self):
        async def invalid(**kwargs):
            yield StreamOutput.model_construct(text="a")

        with fake_instructor(invalid) as (_, sdk, partial):
            with self.assertRaises(ValidationError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                )
            partial.assert_called_once()
            sdk.close.assert_awaited_once()

    async def test_role_cache_reasoning_and_token_clamp_are_preserved(self):
        async def valid(**kwargs):
            yield StreamOutput(text="complete")

        with fake_instructor(valid) as (constructor, _, partial):
            await InstructorClient().create_partial_structured(
                role="generator", response_model=StreamOutput,
                messages=[{"role": "user", "content": "topic"}],
                api_key="secret", model_override=" anthropic/model ",
                system_prompt="stable prefix",
                attribution_headers={"HTTP-Referer": "https://a2ui.test"},
                reasoning_params={"reasoning": {"effort": "low"}},
                max_completion_tokens=321,
            )
            args = partial.call_args.kwargs
            self.assertEqual(args["model"], "anthropic/model")
            self.assertEqual(args["max_tokens"], 321)
            self.assertEqual(args["temperature"], 0.7)
            self.assertEqual(args["extra_body"],
                             {"reasoning": {"effort": "low"}})
            self.assertEqual(args["messages"][0]["content"][0]
                             ["cache_control"], {"type": "ephemeral"})
            self.assertEqual(constructor.call_args.kwargs["max_retries"], 0)
```

- [ ] Run red: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_instructor_partial_stream -v`. Expect missing `create_partial_structured`.
- [ ] Green: add the callback dataclass/type from the public contract. Implement private `_create_partial_attempt` with the same request arguments except `initial_attempt`; it receives `attempt: int` and `on_delta`. For this task expose `create_partial_structured` as a one-attempt forwarding coroutine; Task 3 adds tenacity.

Exact request preparation and streaming body inside `_create_partial_attempt`:

```python
self._raise_for_invalid_state(role)
if not api_key:
    raise ValueError("AI API key is required")
if not model_override or not model_override.strip():
    raise ValueError("Select a model in Settings before generating")
if {"stream", "max_retries", "response_model"}.intersection(kwargs):
    raise ValueError("Streaming control arguments are managed internally")
config = MODEL_CONFIGS[role]
model_slug = model_override.strip()
full_messages = []
if system_prompt:
    full_messages.append({"role": "system", "content": system_prompt})
full_messages.extend(messages)
full_messages = apply_openrouter_cache_control(
    full_messages, provider.value, model_slug,
)
max_tokens = config["max_tokens"]
if max_completion_tokens and max_completion_tokens > 0:
    max_tokens = min(max_tokens, max_completion_tokens)
base_url, timeout = self._get_provider_config(provider)
base_client = AsyncOpenAI(
    base_url=base_url, api_key=api_key,
    default_headers=attribution_headers or {}, timeout=timeout,
    max_retries=0,
)
stream = None
try:
    client = instructor.from_openai(base_client, mode=instructor.Mode.JSON)
    stream = client.chat.completions.create_partial(
        model=model_slug, response_model=response_model,
        messages=full_messages, temperature=config["temperature"],
        max_tokens=max_tokens,
        extra_body=dict(reasoning_params) if reasoning_params else None,
        max_retries=AsyncRetrying(stop=stop_after_attempt(1), reraise=True),
        **kwargs,
    )
    last = None
    async for partial in stream:
        last = partial
        if on_delta:
            await on_delta(StructuredStreamUpdate(
                kind="partial", attempt=attempt, partial=partial,
            ))
    if last is None:
        raise ValueError("Provider returned an empty structured stream")
    return response_model.model_validate(last.model_dump())
except asyncio.CancelledError:
    raise
except Exception as exc:
    log_external_failure(
        logger, event=f"partial_generation_failed role={role}",
        session_id="n/a", error=exc,
    )
    raise
finally:
    if stream is not None:
        await stream.aclose()
    await base_client.close()
```

Import `log_external_failure` from its existing module and `AsyncRetrying` from tenacity. Installed `create_partial` is an async-generator function: do **not** await the generator itself. Do not reuse `sanitize_json_escapes` on raw streaming SDK chunks: that completed-response wrapper expects `.choices[].message`, while this path uses Instructor's partial JSON parsing. Leave `create_structured` behavior intact. Task 7 replaces callback partial with a redacted copy.

The one-attempt facade emits `attempt_started`, then calls `_create_partial_attempt` with `attempt=initial_attempt`. It returns only after the final validation. Callback error propagation is tightened in Task 3.

- [ ] Verify: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_instructor_partial_stream server.tests.test_prompt_cache server.tests.test_agent_model_resolution -v`.
- [ ] Commit: `git add server/utils/instructor_client.py server/tests/realtime_foundation_helpers.py server/tests/test_instructor_partial_stream.py` then `git commit -m "feat(realtime): stream structured partials with final validation"`.

## Task 3: Preserve transport retries, cancellation, and BaseAgent resolution

**Files:** Modify `server/utils/instructor_client.py`, `server/agents/base.py`; create `server/tests/test_streaming_agent_boundary.py`.

- [ ] Red: exact tests:

```python
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from pydantic import SecretStr
from tenacity import wait_none

from server.agents.base import BaseAgent
from server.schemas.llm import AIProviderEnum, AgentModelConfig, LLMContext
from server.tests.realtime_foundation_helpers import (
    StreamOutput, fake_instructor,
)
from server.utils.instructor_client import InstructorClient, StreamCallbackError

class FixtureAgent(BaseAgent):
    @property
    def system_prompt(self):
        return "default prompt"

class StreamingAgentBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_base_agent_resolves_role_and_forwards_callback(self):
        callback = AsyncMock()
        ctx = LLMContext(
            api_key=SecretStr("or-secret"), model="main",
            openrouter_api_key=SecretStr("or-secret"),
            generalcompute_api_key=SecretStr("gc-secret"),
            max_completion_tokens=123,
            agent_models={"planner": AgentModelConfig(
                model="planner/model", provider=AIProviderEnum.GENERALCOMPUTE,
                thinking_enabled=True, thinking_effort="low",
            )},
        )
        with patch(
            "server.agents.base.instructor_client.create_partial_structured",
            new_callable=AsyncMock,
        ) as create:
            create.return_value = StreamOutput(text="done")
            result = await FixtureAgent("planner").generate_streaming(
                StreamOutput, "topic", context={"scope": "Basics"},
                llm_context=ctx, system_prompt_override="override",
                on_delta=callback, initial_attempt=2,
            )
            self.assertEqual(result.text, "done")
            args = create.await_args.kwargs
            self.assertEqual(args["api_key"], "gc-secret")
            self.assertEqual(args["model_override"], "planner/model")
            self.assertEqual(args["provider"], AIProviderEnum.GENERALCOMPUTE)
            self.assertEqual(args["reasoning_params"],
                             {"reasoning": {"effort": "low"}})
            self.assertIn("override", args["system_prompt"])
            self.assertIn("Basics", args["system_prompt"])
            self.assertIs(args["on_delta"], callback)
            self.assertEqual(args["initial_attempt"], 2)
            self.assertEqual(args["max_completion_tokens"], 123)

    async def test_transport_retry_starts_new_attempt_before_new_text(self):
        calls = 0
        updates = []
        async def chunks(**kwargs):
            nonlocal calls
            calls += 1
            yield StreamOutput(text="first" if calls == 1 else "second")
            if calls == 1:
                raise OSError("provider disconnected")
        async def collect(update):
            updates.append((update.kind, update.attempt))
        with fake_instructor(chunks), patch(
            "server.utils.instructor_client.wait_exponential",
            return_value=wait_none(),
        ):
            result = await InstructorClient().create_partial_structured(
                role="generator", response_model=StreamOutput,
                messages=[], api_key="secret", model_override="model",
                on_delta=collect,
            )
        self.assertEqual(result.text, "second")
        self.assertEqual(updates, [("attempt_started", 1), ("partial", 1),
                                   ("attempt_started", 2), ("partial", 2)])
        self.assertEqual(calls, 2)

    async def test_cancellation_closes_stream_without_retry(self):
        entered = asyncio.Event()
        closed = asyncio.Event()
        async def chunks(**kwargs):
            try:
                yield StreamOutput(text="draft")
                entered.set()
                await asyncio.Event().wait()
            finally:
                closed.set()
        with fake_instructor(chunks) as (_, sdk, partial):
            task = asyncio.create_task(
                InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                )
            )
            await asyncio.wait_for(entered.wait(), 0.25)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(closed.is_set())
            partial.assert_called_once()
            sdk.close.assert_awaited_once()

    async def test_callback_failure_never_makes_another_chargeable_call(self):
        async def chunks(**kwargs):
            yield StreamOutput(text="draft")
        callback = AsyncMock(side_effect=RuntimeError("display failure"))
        with fake_instructor(chunks) as (_, _, partial):
            with self.assertRaises(StreamCallbackError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                    on_delta=callback,
                )
            self.assertEqual(partial.call_count, 0)

    async def test_retry_budget_cannot_exceed_attempt_five(self):
        starts = []
        async def chunks(**kwargs):
            raise OSError("transport failure")
            yield StreamOutput(text="unreachable")
        async def collect(update):
            if update.kind == "attempt_started":
                starts.append(update.attempt)
        with fake_instructor(chunks) as (_, _, partial), patch(
            "server.utils.instructor_client.wait_exponential",
            return_value=wait_none(),
        ):
            with self.assertRaises(OSError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput,
                    messages=[], api_key="secret", model_override="model",
                    initial_attempt=4, on_delta=collect,
                )
            self.assertEqual(partial.call_count, 2)
            self.assertEqual(starts, [4, 5])
```

- [ ] Run red: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_streaming_agent_boundary -v`.
- [ ] Green: add `StreamCallbackError` and `_notify` so display errors cannot trigger a new paid call:

```python
class StreamCallbackError(RuntimeError):
    """A presentation callback failed; no provider retry is permitted."""

async def _notify(callback, update):
    if callback is None:
        return
    try:
        await callback(update)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        raise StreamCallbackError("Streaming display callback failed") from exc
```

Replace direct callback awaiting in Task 2 with `_notify`. The facade's complete orchestration body is:

```python
if not 1 <= initial_attempt <= 5:
    raise ValueError("Attempt must be between 1 and 5")
async for retry_attempt in AsyncRetrying(
    stop=stop_after_attempt(min(3, 6 - initial_attempt)),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_not_exception_type((
        ValueError, TypeError, asyncio.CancelledError, StreamCallbackError,
    )),
    reraise=True,
):
    with retry_attempt:
        attempt = initial_attempt + retry_attempt.retry_state.attempt_number - 1
        await _notify(on_delta, StructuredStreamUpdate(
            kind="attempt_started", attempt=attempt,
        ))
        return await self._create_partial_attempt(
            role=role, response_model=response_model, messages=messages,
            api_key=api_key, model_override=model_override,
            attribution_headers=attribution_headers,
            system_prompt=system_prompt, provider=provider,
            reasoning_params=reasoning_params,
            max_completion_tokens=max_completion_tokens,
            on_delta=on_delta, attempt=attempt, **kwargs,
        )
raise RuntimeError("Streaming retry loop exited without a result")
```

Add `AsyncRetrying` to tenacity imports. Do not decorate an async generator with `@retry`; only this coroutine consumes it inside the retry scope. Retain the existing nonstreaming decorator.

Exact `BaseAgent.generate_streaming` body using its frozen public signature:

```python
if not llm_context:
    raise ValueError("AI API key is required in llm_context.")
model, provider, key, reasoning = llm_context.resolve_agent_call(self._role)
if not key:
    raise ValueError("AI API key is required in llm_context.")
return await instructor_client.create_partial_structured(
    role=self._role, response_model=response_model,
    messages=[{"role": "user", "content": user_message}],
    api_key=key, model_override=model,
    attribution_headers=llm_context.get_attribution_headers(),
    system_prompt=self._build_system_prompt(
        context, system_prompt_override=system_prompt_override,
    ),
    provider=provider, reasoning_params=reasoning,
    max_completion_tokens=llm_context.max_completion_tokens,
    on_delta=on_delta, initial_attempt=initial_attempt, **kwargs,
)
```

- [ ] Verify: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_streaming_agent_boundary server.tests.test_instructor_partial_stream server.tests.test_agent_model_resolution -v`.
- [ ] Commit: `git add server/utils/instructor_client.py server/agents/base.py server/tests/test_streaming_agent_boundary.py` then `git commit -m "feat(realtime): share agent streaming retries and cancellation"`.

## Task 4: Implement target isolation, accumulation, and attempt reset

**Files:** Modify `server/services/session_event_stream.py`; create `server/tests/test_session_live_broadcaster.py`.

- [ ] Red: exact tests:

```python
import asyncio
import unittest

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, TopicContentDeltaPayload,
)
from server.services.session_event_stream import SessionLiveStreamBroadcaster

async def begin(hub, node="n", attempt=1, session="s", index=0):
    await hub.begin_target(
        session_id=session, job_id="j", stage=GenerationStage.GENERATING_BATCH,
        target_type="topic", target_id=node, sequence_index=index,
        attempt=attempt, reason="started" if attempt == 1 else "retry",
    )

async def send(hub, text, node="n", attempt=1, session="s", index=0):
    await hub.publish(
        session_id=session, job_id="j", stage=GenerationStage.GENERATING_BATCH,
        event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
        payload=TopicContentDeltaPayload(
            node_id=node, sequence_index=index,
            text_delta=text, attempt=attempt,
        ),
    )

class SessionLiveBroadcasterTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_topics_and_sessions_are_isolated(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub, "a", index=0)
        await begin(hub, "b", index=1)
        await begin(hub, "a", session="other", index=0)
        await asyncio.gather(
            send(hub, "A", "a", index=0),
            send(hub, "B", "b", index=1),
        )
        await send(hub, "1", "a", index=0)
        await send(hub, "2", "b", index=1)
        await send(hub, "private", "a", session="other", index=0)
        async with hub.subscribe("s") as sub:
            values = {event.payload.target_id if
                      event.event_type == ProgressEventType.TARGET_DRAFT_RESET
                      else event.payload.node_id: event.snapshot.text
                      for event in sub.snapshots}
            self.assertEqual(values, {"a": "A1", "b": "B2"})
            self.assertNotIn("private", str(sub.snapshots))

    async def test_retry_resets_only_affected_target_and_drops_old_attempt(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub, "a", index=0)
        await begin(hub, "b", index=1)
        await send(hub, "old", "a", index=0)
        await send(hub, "healthy", "b", index=1)
        await begin(hub, "a", attempt=2, index=0)
        await send(hub, "stale", "a", attempt=1, index=0)
        await send(hub, "new", "a", attempt=2, index=0)
        async with hub.subscribe("s") as sub:
            by_node = {event.payload.node_id: event for event in sub.snapshots}
            self.assertEqual(by_node["a"].snapshot.text, "new")
            self.assertEqual(by_node["a"].attempt, 2)
            self.assertEqual(by_node["a"].sequence, 2)
            self.assertEqual(by_node["b"].snapshot.text, "healthy")

    async def test_subscribe_captures_snapshot_then_receives_future_delta(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        await send(hub, "first")
        async with hub.subscribe("s") as sub:
            self.assertEqual(sub.snapshots[0].snapshot.text, "first")
            await send(hub, "second")
            event = await asyncio.wait_for(sub.next_event(), 0.1)
            self.assertEqual(event.payload.text_delta, "second")
            self.assertEqual(event.sequence, 3)
        async with hub.subscribe("s") as reconnected:
            self.assertEqual(reconnected.snapshots[0].snapshot.text,
                             "firstsecond")
```

- [ ] Run red: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_session_live_broadcaster -v`.
- [ ] Green: add imports `asynccontextmanager`, `dataclass`, `field`, `Literal`, and the new schema classes. Keep existing framing helpers. Add private `_DraftEntry` and `LiveSubscription` below:

```python
@dataclass
class _DraftEntry:
    event: LiveDraftEvent
    draft: DraftSnapshot = field(default_factory=DraftSnapshot)

class LiveSubscription:
    def __init__(self, snapshots):
        self.snapshots = snapshots
        self.queue = asyncio.Queue()

    async def next_event(self):
        return await self.queue.get()

    def push(self, event, snapshots):
        self.queue.put_nowait(event)

def _target_key(target_type, target_id, sequence_index):
    return json.dumps(
        [target_type, target_id, sequence_index], separators=(",", ":"),
    )
```

`SessionLiveStreamBroadcaster.__init__` initializes `_lock = asyncio.Lock()`, `_entries: dict[tuple[str, str], _DraftEntry] = {}`, `_subscribers: dict[str, set[LiveSubscription]] = {}`, `_jobs: dict[str, str] = {}`, and saves both budget arguments. Each public coroutine performs its state change under `_lock`; no DB objects are imported. Implement these exact internal operations:

```python
def _snapshots_locked(self, session_id):
    return [entry.event.model_copy(deep=True, update={
        "snapshot": entry.draft.model_copy(deep=True),
    }) for (session, _), entry in self._entries.items()
        if session == session_id]

def _broadcast_locked(self, session_id, event):
    for subscriber in self._subscribers.get(session_id, set()):
        subscriber.push(event, self._snapshots_locked(session_id))

def _replace_job_locked(self, session_id, job_id):
    if self._jobs.get(session_id) not in (None, job_id):
        for key in list(self._entries):
            if key[0] == session_id:
                del self._entries[key]
    self._jobs[session_id] = job_id

@asynccontextmanager
async def subscribe(self, session_id):
    async with self._lock:
        subscriber = LiveSubscription(self._snapshots_locked(session_id))
        self._subscribers.setdefault(session_id, set()).add(subscriber)
    try:
        yield subscriber
    finally:
        async with self._lock:
            subscribers = self._subscribers.get(session_id, set())
            subscribers.discard(subscriber)
            if not subscribers:
                self._subscribers.pop(session_id, None)

async def snapshots(self, session_id: str) -> list[LiveDraftEvent]:
    async with self._lock:
        return self._snapshots_locked(session_id)

async def retire_target(
    self, *, session_id, target_type, target_id, sequence_index=None,
):
    async with self._lock:
        self._entries.pop((session_id, _target_key(
            target_type, target_id, sequence_index,
        )), None)

async def clear_session(self, session_id):
    async with self._lock:
        for key in list(self._entries):
            if key[0] == session_id:
                del self._entries[key]
        self._jobs.pop(session_id, None)
```

`snapshots(session_id)` is an additional public recovery method used by P1's SSE only. It takes the same lock as subscription/publish so replay can refresh its initial snapshots without missing subsequent events.

Exact `begin_target` body using the frozen signature:

```python
payload = TargetDraftResetPayload(
    target_type=target_type, target_id=target_id,
    sequence_index=sequence_index, attempt=attempt, reason=reason,
)
target = _target_key(target_type, target_id, sequence_index)
async with self._lock:
    self._replace_job_locked(session_id, job_id)
    old = self._entries.get((session_id, target))
    if old is not None and old.event.attempt >= attempt:
        return
    event = LiveDraftEvent(
        session_id=session_id, job_id=job_id, stage=stage, target=target,
        attempt=attempt, sequence=1,
        event_type=ProgressEventType.TARGET_DRAFT_RESET, payload=payload,
    )
    self._entries[(session_id, target)] = _DraftEntry(event)
    self._broadcast_locked(session_id, event)
```

Exact payload-to-target routing helper:

```python
def _payload_target(session_id, event_type, payload):
    if event_type == ProgressEventType.RESEARCH_SOURCES_UPDATED:
        return "research", session_id, None
    if event_type == ProgressEventType.RESEARCH_TEXT_DELTA:
        return "research", payload.report_id, payload.sequence_index
    if event_type == ProgressEventType.OUTLINE_TEXT_DELTA:
        return "outline", session_id, None
    if event_type in (
        ProgressEventType.TOPIC_CONTENT_DELTA,
        ProgressEventType.TOPIC_EXPLANATION_READY,
    ):
        return "topic", payload.node_id, payload.sequence_index
    return payload.target_type, payload.target_id, payload.sequence_index
```

Exact `publish` body (Task 7 adds stricter cross-field validation):

```python
if event_type not in LIVE_EVENT_TYPES:
    raise ValueError("Use the repository for durable milestones")
if not isinstance(payload, PAYLOAD_BY_EVENT_TYPE[event_type]):
    raise ValueError("Wrong live payload class")
if event_type == ProgressEventType.TARGET_DRAFT_RESET:
    await self.begin_target(
        session_id=session_id, job_id=job_id, stage=stage,
        target_type=payload.target_type, target_id=payload.target_id,
        sequence_index=payload.sequence_index, attempt=payload.attempt,
        reason=payload.reason,
    )
    return
kind, target_id, index = _payload_target(session_id, event_type, payload)
target = _target_key(kind, target_id, index)
async with self._lock:
    self._replace_job_locked(session_id, job_id)
    key = (session_id, target)
    old = self._entries.get(key)
    attempt = getattr(payload, "attempt", 1)
    if old is None and event_type != ProgressEventType.RESEARCH_SOURCES_UPDATED:
        raise ValueError("Begin the target before publishing text")
    if old is not None and attempt < old.event.attempt:
        return
    if old is not None and attempt != old.event.attempt:
        raise ValueError("Begin a new attempt before publishing")
    event = LiveDraftEvent(
        session_id=session_id, job_id=job_id, stage=stage, target=target,
        attempt=attempt, sequence=old.event.sequence + 1 if old else 1,
        event_type=event_type, payload=payload.model_copy(deep=True),
    )
    draft = old.draft.model_copy(deep=True) if old else DraftSnapshot()
    if event_type in (
        ProgressEventType.RESEARCH_TEXT_DELTA,
        ProgressEventType.TOPIC_CONTENT_DELTA,
    ):
        draft.text += payload.text_delta
    elif event_type == ProgressEventType.OUTLINE_TEXT_DELTA:
        draft.course_title += payload.course_title_delta or ""
        if payload.topic_index is not None:
            draft.topics[payload.topic_index] = (
                draft.topics.get(payload.topic_index, "")
                + payload.topic_title_delta
            )
    elif event_type == ProgressEventType.TOPIC_EXPLANATION_READY:
        draft.explanation_ready = True
    elif event_type == ProgressEventType.RESEARCH_SOURCES_UPDATED:
        draft.unique_source_count = payload.unique_source_count
        draft.new_sources_count = payload.new_sources_count
        draft.provider_id = payload.provider_id
    self._entries[key] = _DraftEntry(event, draft)
    self._broadcast_locked(session_id, event)
```

Finish with `session_live_stream = SessionLiveStreamBroadcaster()`. All new public methods need annotations matching the public contract; helper snippets omit repeated annotations only to keep their algorithm readable.

- [ ] Verify: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_session_live_broadcaster server.tests.test_live_progress_contracts -v`.
- [ ] Commit: `git add server/services/session_event_stream.py server/tests/test_session_live_broadcaster.py` then `git commit -m "feat(realtime): isolate live draft targets and retry attempts"`.

## Task 5: Merge live SSE with durable replay and atomic snapshots

**Files:** Modify `server/services/session_event_stream.py`; create `server/tests/test_live_session_replay.py`.

Public additions, backward compatible:

```python
def format_live_sse_frame(event: LiveDraftEvent) -> str: ...

async def stream_session_events(
    *, session_id: str, cursor: int, event_store: Any, job_store: Any,
    sleep: Optional[SleepFn] = None, heartbeat_seconds: float = 15.0,
    poll_seconds: float = 0.5,
    broadcaster: Optional[SessionLiveStreamBroadcaster] = None,
) -> AsyncIterator[str]: ...
```

The optional injected broadcaster is for deterministic tests; the existing router automatically uses `session_live_stream` without edits.

- [ ] Red: exact tests:

```python
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, StageChangedPayload, TopicContentDeltaPayload,
)
from server.services.session_event_stream import (
    SessionLiveStreamBroadcaster, stream_session_events,
)

def data(frame):
    return json.loads(next(line[6:] for line in frame.splitlines()
                           if line.startswith("data: ")))

class LiveSessionReplayTests(unittest.IsolatedAsyncioTestCase):
    async def test_reconnect_snapshot_then_resume_ignores_job_watermark(self):
        hub = SessionLiveStreamBroadcaster()
        await hub.begin_target(
            session_id="s", job_id="j", stage=GenerationStage.GENERATING_BATCH,
            target_type="topic", target_id="n", sequence_index=0, attempt=1,
        )
        async def publish(text):
            await hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta=text,
                ),
            )
        await publish("before")
        events = MagicMock()
        events.list_after.return_value = []
        jobs = MagicMock()
        jobs.to_public_by_session.return_value = {
            "id": "j", "stage": "GENERATING_BATCH", "last_event_id": 999,
        }
        stream = stream_session_events(
            session_id="s", cursor=10, event_store=events, job_store=jobs,
            broadcaster=hub,
        )
        try:
            snapshot = await asyncio.wait_for(anext(stream), 0.2)
            self.assertNotIn("\nid:", "\n" + snapshot)
            self.assertEqual(data(snapshot)["id"], 0)
            self.assertEqual(data(snapshot)["snapshot"]["text"], "before")
            await publish("after")
            delta = await asyncio.wait_for(anext(stream), 0.1)
            self.assertEqual(data(delta)["payload"]["text_delta"], "after")
            self.assertEqual(data(delta)["sequence"], 3)
            self.assertNotIn("generation", data(delta))
            self.assertEqual(events.list_after.call_args.args[1], 10)
            events.append_once.assert_not_called()
        finally:
            await stream.aclose()
        stream2 = stream_session_events(
            session_id="s", cursor=999, event_store=events, job_store=jobs,
            broadcaster=hub,
        )
        try:
            restored = data(await asyncio.wait_for(anext(stream2), 0.2))
            self.assertEqual(restored["snapshot"]["text"], "beforeafter")
            self.assertEqual(restored["sequence"], 3)
        finally:
            await stream2.aclose()

    async def test_publish_during_replay_is_in_snapshot_once(self):
        hub = SessionLiveStreamBroadcaster()
        await hub.begin_target(
            session_id="s", job_id="j", stage=GenerationStage.GENERATING_BATCH,
            target_type="topic", target_id="n", sequence_index=0, attempt=1,
        )
        events = MagicMock()
        events.list_after.side_effect = [[SimpleNamespace(
            id=8, event_type=ProgressEventType.STAGE_CHANGED,
            payload=StageChangedPayload(
                previous_stage=GenerationStage.PLANNING_BATCH,
                stage=GenerationStage.GENERATING_BATCH,
            ), created_at="2026-10-04T00:00:00Z",
        )], [], []]
        jobs = MagicMock()
        jobs.to_public_by_session.return_value = {
            "id": "j", "stage": "GENERATING_BATCH", "last_event_id": 8,
        }
        stream = stream_session_events(
            session_id="s", cursor=7, event_store=events, job_store=jobs,
            broadcaster=hub, heartbeat_seconds=0,
        )
        try:
            self.assertIn("id: 8\n", await anext(stream))
            await hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta="during",
                ),
            )
            snapshot = data(await anext(stream))
            self.assertEqual(snapshot["snapshot"]["text"], "during")
            self.assertEqual(snapshot["sequence"], 2)
            self.assertEqual(await anext(stream), ": keepalive\n\n")
        finally:
            await stream.aclose()
```

- [ ] Run red: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_session_replay -v`. Expect unsupported `broadcaster` parameter.
- [ ] Green: implement exact live framing. It deliberately serializes the subclass payload separately so Pydantic's `BaseModel` annotation cannot erase its fields:

```python
def format_live_sse_frame(event: LiveDraftEvent) -> str:
    envelope = event.model_dump(mode="json")
    envelope["payload"] = event.payload.model_dump(mode="json")
    body = json.dumps(envelope, separators=(",", ":"))
    return (
        f"event: {event.event_type.value}\n"
        "retry: 2000\n"
        f"data: {body}\n\n"
    )
```

Replace `stream_session_events` body while preserving its existing durable-envelope construction and helper functions. Exact merge algorithm:

```python
hub = broadcaster or session_live_stream
sleeper = sleep or asyncio.sleep
current = cursor
last_heartbeat = asyncio.get_running_loop().time()
watermarks = {}
snapshot_pending = True
waiter = None
try:
    async with hub.subscribe(session_id) as subscription:
        while True:
            rows = event_store.list_after(session_id, current, limit=100)
            if rows:
                for event in rows:
                    event_id = int(event.id)
                    event_type = _event_type_value(event)
                    public = job_store.to_public_by_session(session_id)
                    generation = (public.model_dump(mode="json")
                                  if hasattr(public, "model_dump") else public)
                    envelope = {
                        "id": event_id, "session_id": session_id,
                        "event_type": event_type, "payload": _payload_dict(event),
                        "generation": generation,
                        "created_at": _created_at_str(event),
                    }
                    yield format_sse_frame(
                        event_id=event_id, event_type=event_type, data=envelope,
                    )
                    current = event_id
                    await _retire_completed_target(hub, session_id, event)
                    if event_type in TERMINAL_EVENT_TYPES:
                        # Do not lose last output on cancellation; emit only
                        # retained drafts for the current job, then close.
                        for draft in await hub.snapshots(session_id):
                            if event_type == "generation_cancelled":
                                yield format_live_sse_frame(draft)
                        await hub.clear_session(session_id)
                        return
                continue

            public = job_store.to_public_by_session(session_id)
            stage = _stage_from_public(public)
            if snapshot_pending:
                for draft in await hub.snapshots(session_id):
                    if _draft_relevant(draft, public):
                        yield format_live_sse_frame(draft)
                        watermarks[(draft.target, draft.attempt)] = draft.sequence
                snapshot_pending = False
            if stage in TERMINAL_STAGES:
                if stage not in ("FAILED", "failed"):
                    await hub.clear_session(session_id)
                return

            # Drain without advancing the durable cursor, even when polls
            # report a newer last_event_id.
            if waiter is not None and waiter.done():
                draft = waiter.result()
                waiter = None
                key = (draft.target, draft.attempt)
                if draft.sequence > watermarks.get(key, 0):
                    if _draft_relevant(draft, public):
                        yield format_live_sse_frame(draft)
                        watermarks[key] = draft.sequence
            while not subscription.queue.empty():
                draft = subscription.queue.get_nowait()
                key = (draft.target, draft.attempt)
                if draft.sequence > watermarks.get(key, 0):
                    if _draft_relevant(draft, public):
                        yield format_live_sse_frame(draft)
                        watermarks[key] = draft.sequence

            now = asyncio.get_running_loop().time()
            if heartbeat_seconds <= 0 or now - last_heartbeat >= heartbeat_seconds:
                yield ": keepalive\n\n"
                last_heartbeat = now
            if waiter is None:
                waiter = asyncio.create_task(subscription.next_event())
            timer = asyncio.create_task(sleeper(
                poll_seconds if heartbeat_seconds > 0 else 0,
            ))
            try:
                done, _ = await asyncio.wait(
                    {waiter, timer}, return_when=asyncio.FIRST_COMPLETED,
                )
                if timer in done:
                    timer.result()  # Propagate injected sleep failures.
                if waiter in done:
                    draft = waiter.result()
                    waiter = None
                    key = (draft.target, draft.attempt)
                    latest_public = job_store.to_public_by_session(session_id)
                    if draft.sequence > watermarks.get(key, 0):
                        if _draft_relevant(draft, latest_public):
                            yield format_live_sse_frame(draft)
                            watermarks[key] = draft.sequence
            finally:
                if not timer.done():
                    timer.cancel()
                await asyncio.gather(timer, return_exceptions=True)
except asyncio.CancelledError:
    return
finally:
    if waiter is not None:
        if not waiter.done():
            waiter.cancel()
        await asyncio.gather(waiter, return_exceptions=True)
```

Define `_retire_completed_target` and `_draft_relevant` exactly:

```python
async def _retire_completed_target(hub, session_id, event):
    kind = _event_type_value(event)
    payload = _payload_dict(event)
    if kind == "outline_ready":
        await hub.retire_target(
            session_id=session_id, target_type="outline", target_id=session_id,
        )
    elif kind == "module_ready":
        await hub.retire_target(
            session_id=session_id, target_type="topic",
            target_id=payload["node_id"],
            sequence_index=payload.get("sequence_index"),
        )
    elif kind == "research_section_ready":
        await hub.retire_target(
            session_id=session_id, target_type="research",
            target_id=payload["report_id"],
            sequence_index=payload["sequence_index"],
        )

def _draft_relevant(draft, public):
    if public is None:
        return False
    public_id = (public.get("id") if isinstance(public, dict)
                 else getattr(public, "id", None))
    if public_id is not None and public_id != draft.job_id:
        return False
    stage = _stage_from_public(public)
    target_type = json.loads(draft.target)[0]
    if stage in ("PAUSED", "FAILED", "CANCELLED"):
        return True
    if target_type == "outline":
        return stage == "OUTLINING"
    if target_type == "research":
        return stage == "RESEARCHING"
    return stage in ("GENERATING_PREVIEW", "GENERATING_BATCH",
                     "PLANNING_BATCH")
```

Keep the queue waiter alive across poll timeouts; this avoids losing an item delivered between the timer wake and cancellation. At the top of the next tail iteration, consume a completed waiter before draining the queue. Each loop checks durable rows before processing more live output, so token traffic cannot starve ready/terminal events. The old `sleep` injection and zero-heartbeat test remain supported. Never call `request_cancel`, runtime cancellation, or delete-session functions from the SSE generator.

- [ ] Verify: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_session_replay server.tests.test_session_events server.tests.test_generation_api server.tests.test_session_live_broadcaster -v`.
- [ ] Commit: `git add server/services/session_event_stream.py server/tests/test_live_session_replay.py` then `git commit -m "feat(realtime): merge live SSE with durable replay snapshots"`.

## Task 6: Bound retention and slow subscribers without blocking providers

**Files:** Modify `server/services/session_event_stream.py`; create `server/tests/test_live_stream_bounds.py`.

- [ ] Red: exact tests:

```python
import asyncio
import unittest

from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.tests.test_session_live_broadcaster import begin, send

class LiveStreamBoundsTests(unittest.IsolatedAsyncioTestCase):
    async def test_utf8_budget_keeps_latest_window_with_character_offset(self):
        hub = SessionLiveStreamBroadcaster(max_draft_bytes=12)
        await begin(hub)
        await send(hub, "é" * 10)
        async with hub.subscribe("s") as sub:
            snapshot = sub.snapshots[0].snapshot
            self.assertLessEqual(len(snapshot.text.encode("utf-8")), 12)
            self.assertEqual(snapshot.text, "é" * 6)
            self.assertEqual(snapshot.text_offset, 4)
            self.assertTrue(snapshot.truncated)

    async def test_slow_subscriber_receives_replacement_not_missing_suffixes(self):
        hub = SessionLiveStreamBroadcaster(subscriber_limit=2)
        await begin(hub)
        async with hub.subscribe("s") as sub:
            for _ in range(20):
                await asyncio.wait_for(send(hub, "x"), 0.1)
            self.assertLessEqual(sub.queue.qsize(), 2)
            restored = sub.snapshots[0].snapshot.text
            sequence = sub.snapshots[0].sequence
            while not sub.queue.empty():
                event = sub.queue.get_nowait()
                if event.sequence <= sequence:
                    continue
                if event.snapshot is not None:
                    restored = event.snapshot.text
                else:
                    restored += event.payload.text_delta
                sequence = event.sequence
            self.assertEqual(restored, "x" * 20)

    async def test_retire_and_clear_release_retained_drafts(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        await send(hub, "preview")
        await hub.retire_target(
            session_id="s", target_type="topic", target_id="n",
            sequence_index=0,
        )
        self.assertEqual(await hub.snapshots("s"), [])
        await begin(hub)
        await send(hub, "preview")
        await hub.clear_session("s")
        self.assertEqual(await hub.snapshots("s"), [])
```

- [ ] Run red: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_stream_bounds -v`. Expect oversized retained text and unbounded subscriber queue.
- [ ] Green: change `LiveSubscription.__init__(snapshots, limit)` to `asyncio.Queue(maxsize=limit)` and have `subscribe` pass the configured limit. Reject nonpositive limits and `max_draft_bytes` in the hub constructor. Add this push body:

```python
def push(self, event, snapshots):
    if self.queue.full():
        while not self.queue.empty():
            self.queue.get_nowait()
        # All active targets must survive mailbox compaction. With ordinary
        # limits, <=52 live targets fit in the default 64 slots.
        if len(snapshots) > self.queue.maxsize:
            self.queue = asyncio.Queue(maxsize=len(snapshots))
        for snapshot in snapshots:
            self.queue.put_nowait(snapshot)
    else:
        self.queue.put_nowait(event)
```

The queue's exact bound is `max(subscriber_limit, current_target_count)`, default 64. Retained targets are limited to the existing maximum 30 topic + 20 research + 1 outline + 1 source-count = 52, so the default never grows; a test's smaller custom limit may grow only to current target count. Never replace a queue while a reader waits: queue replacement above happens only when full, hence no pending `get`. Reject a 53rd distinct target before allocating it; existing attempts never increase target count.

At both target allocation sites (`begin_target` and source-count initialization in `publish`), use this exact check before insertion, after looking up `old`:

```python
if old is None and sum(
    1 for session, _ in self._entries if session == session_id
) >= 52:
    raise ValueError("Live target capacity exceeded")
```

Add `_trim_locked(session_id)` and call it after recording a draft but before broadcasting. Return changed target keys so other affected subscribers receive snapshot replacements too:

```python
def _trim_locked(self, session_id):
    entries = [entry for (session, _), entry in self._entries.items()
               if session == session_id]
    def size(entry):
        draft = entry.draft
        return len(draft.text.encode("utf-8")) + len(
            draft.course_title.encode("utf-8")
        ) + sum(len(text.encode("utf-8")) for text in draft.topics.values())
    excess = sum(size(entry) for entry in entries) - self._max_draft_bytes
    changed = []
    while excess > 0:
        entry = max(entries, key=lambda item: len(item.draft.text), default=None)
        if entry is None or not entry.draft.text:
            raise ValueError("Outline display fields exceed draft capacity")
        removed_bytes = 0
        removed_chars = 0
        for char in entry.draft.text:
            removed_bytes += len(char.encode("utf-8"))
            removed_chars += 1
            if removed_bytes >= excess:
                break
        entry.draft.text = entry.draft.text[removed_chars:]
        entry.draft.text_offset += removed_chars
        entry.draft.truncated = True
        excess -= removed_bytes
        changed.append(entry.event.target)
    return set(changed)
```

Cap accumulated `course_title` and each topic title at 300 characters in `publish` (field previews only; final outline is unchanged), and cap outline indices at the payload limit. Default 96,000 bytes exceeds the maximum outline preview size. Use `changed = self._trim_locked(session_id)`; for each changed target, broadcast `entry.event.model_copy(deep=True, update={"snapshot": entry.draft.model_copy(deep=True)})`. If the current target was trimmed, do not also broadcast its suffix. If another target was trimmed, increment **that target's** event sequence before its replacement snapshot so existing clients apply it; the current target still sends its normal delta. Snapshot copies must not mutate under a subscriber.

Inactive-job retention expires after 1,800 seconds without a producer update, without adding a background task. Add `import time`, initialize `_touched: dict[str, float] = {}`, and implement:

```python
def _expire_locked(self):
    now = time.monotonic()
    expired = [session for session, touched in self._touched.items()
               if now - touched > 1800
               and not self._subscribers.get(session)]
    for session in expired:
        for key in list(self._entries):
            if key[0] == session:
                del self._entries[key]
        self._jobs.pop(session, None)
        self._touched.pop(session, None)
```

Call `_expire_locked()` immediately after acquiring the lock in begin/publish/subscribe/snapshots; set `_touched[session_id] = time.monotonic()` only after accepting begin/publish. Remove its entry in `clear_session`. A connected session is not expired; reading snapshots does not extend an inactive producer's expiry. Workers do not resume an expired job without `begin_target` (same as restart/resume). Topic/research failure output remains available within that documented window and through saved authoritative artifacts thereafter.

The 96,000-byte budget counts retained user-facing text per job; object and subscriber-envelope overhead per job is separately bounded by 52 targets / 64 messages. The existing runtime limits concurrent jobs; inactive jobs have a finite retention lifetime. No full history, old attempts, or per-token DB rows are retained.

- [ ] Verify: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_stream_bounds server.tests.test_session_live_broadcaster server.tests.test_live_session_replay -v`.
- [ ] Commit: `git add server/services/session_event_stream.py server/tests/test_live_stream_bounds.py` then `git commit -m "perf(realtime): bound draft retention and subscriber backpressure"`.

## Task 7: Enforce payload attribution and credential-safe callback/logging

**Files:** Modify `server/services/session_event_stream.py`, `server/utils/instructor_client.py`; create `server/tests/test_live_stream_safety.py`.

- [ ] Red: exact tests:

```python
import unittest

from pydantic import BaseModel

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, TopicContentDeltaPayload, TargetDraftResetPayload,
)
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_session_live_broadcaster import begin, send
from server.utils.instructor_client import InstructorClient

class SafeOutput(BaseModel):
    text: str

class LiveStreamSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_credential_echo_is_redacted_only_in_display_callback(self):
        seen = []
        async def chunks(**kwargs):
            yield SafeOutput(text="Provider echoed fixture-secret")
        async def collect(update):
            if update.partial is not None:
                seen.append(update.partial.text)
        with fake_instructor(chunks):
            final = await InstructorClient().create_partial_structured(
                role="generator", response_model=SafeOutput, messages=[],
                api_key="fixture-secret", model_override="model",
                on_delta=collect,
            )
        self.assertNotIn("fixture-secret", str(seen))
        self.assertIn("[redacted]", seen[0])
        self.assertIn("fixture-secret", final.text)

    async def test_provider_failure_logs_no_secrets_or_raw_body(self):
        async def fail(**kwargs):
            raise ValueError("fixture-secret raw-provider-body quiz-answer")
            yield SafeOutput(text="unreachable")
        with fake_instructor(fail), self.assertLogs(
            "server.utils.instructor_client", level="ERROR",
        ) as logs:
            with self.assertRaises(ValueError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=SafeOutput, messages=[],
                    api_key="fixture-secret", model_override="model",
                )
        rendered = "".join(logs.output)
        for secret in ("fixture-secret", "raw-provider-body", "quiz-answer"):
            self.assertNotIn(secret, rendered)
        self.assertIn("ValueError", rendered)

    async def test_wrong_stage_and_untrusted_reset_reason_are_rejected(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        with self.assertRaises(ValueError):
            await hub.publish(
                session_id="s", job_id="j", stage=GenerationStage.RESEARCHING,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta="wrong stage",
                ),
            )
        with self.assertRaises(ValueError):
            await hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TARGET_DRAFT_RESET,
                payload=TargetDraftResetPayload(
                    target_type="topic", target_id="n", sequence_index=0,
                    attempt=2, reason="raw-provider-body fixture-secret",
                ),
            )
        self.assertEqual((await hub.snapshots("s"))[0].snapshot.text, "")

    async def test_old_job_cannot_replace_the_new_jobs_draft(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        await send(hub, "current")
        with self.assertRaises(ValueError):
            await hub.publish(
                session_id="s", job_id="old-job",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta="stale",
                ),
            )
        self.assertEqual((await hub.snapshots("s"))[0].snapshot.text, "current")
```

- [ ] Run red: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_stream_safety -v`. Expect leaked callback credential, accepted wrong-stage event/reset reason, or stale job replacement.
- [ ] Green: add safe copy helper in `instructor_client.py` and invoke it only for callback partials:

```python
def _redact_display_value(value, secret):
    if isinstance(value, str):
        return value.replace(secret, "[redacted]") if secret else value
    if isinstance(value, BaseModel):
        return value.model_copy(update={
            name: _redact_display_value(getattr(value, name), secret)
            for name in type(value).model_fields
        })
    if isinstance(value, list):
        return [_redact_display_value(item, secret) for item in value]
    if isinstance(value, dict):
        return {name: _redact_display_value(item, secret)
                for name, item in value.items()}
    return value
```

Replace callback `partial=partial` with `partial=_redact_display_value(partial, api_key)`. Never log partial models, requests, reasoning, final content, exception messages, or validation details. The final model is not altered: public saved-output safety remains the existing artifact/renderer contract, and P2 must also scrub **search** credentials it owns before publishing its approved synthesis fields. Redacting API-key echoes here is an additional display safeguard, not an invitation to dump models.

At the beginning of `publish`, validate the exact class (`type(payload) is PAYLOAD_BY_EVENT_TYPE[event_type]`) rather than accepting arbitrary subclasses, then revalidate `payload.model_dump()` against that class (catches `model_construct` bypass). Add the same validation before forwarding reset. Stage allowlist:

```python
ALLOWED_LIVE_STAGES = {
    ProgressEventType.RESEARCH_SOURCES_UPDATED: {GenerationStage.RESEARCHING},
    ProgressEventType.RESEARCH_TEXT_DELTA: {GenerationStage.RESEARCHING},
    ProgressEventType.OUTLINE_TEXT_DELTA: {GenerationStage.OUTLINING},
    ProgressEventType.TOPIC_CONTENT_DELTA: {
        GenerationStage.GENERATING_PREVIEW, GenerationStage.GENERATING_BATCH,
    },
    ProgressEventType.TOPIC_EXPLANATION_READY: {
        GenerationStage.GENERATING_PREVIEW, GenerationStage.GENERATING_BATCH,
    },
}
SAFE_RESET_REASONS = {"started", "retry", "replan", "correction", "resumed"}
```

Reject invalid stage with a fixed message before changing any state. In `begin_target`, require stage RESEARCHING for research, OUTLINING for outline, and GENERATING_PREVIEW/BATCH for topic, and require reason membership in `SAFE_RESET_REASONS`. An active target's stage must match publish's stage; no crossing from one topic's stage/attempt metadata to another.

Inside `publish`'s lock, replace the previous `_replace_job_locked` call with:

```python
if self._jobs.get(session_id) not in (None, job_id):
    raise ValueError("Live payload does not match the active job")
if session_id not in self._jobs:
    self._jobs[session_id] = job_id
```

Only `begin_target` can replace the active job. Preserve target isolation and source count fields. All streams/reconnect snapshots are schema-projected safe payloads, never copied provider body/header dictionaries. Typed contracts exclude quiz/answers/hidden reasoning fields; P2/P3 projector tests provide defense against accidentally selecting them. Text safety (unsafe links, HTML, Mermaid) is owned by P4; P1 never executes or renders content.

- [ ] Verify: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_stream_safety server.tests.test_live_progress_contracts server.tests.test_instructor_partial_stream server.tests.test_streaming_agent_boundary server.tests.test_session_live_broadcaster -v`.
- [ ] Commit: `git add server/services/session_event_stream.py server/utils/instructor_client.py server/tests/test_live_stream_safety.py` then `git commit -m "fix(realtime): enforce safe live payload and credential boundaries"`.

## Task 8: Prove end-to-end in-flight transport and SQLite/Mongo replay parity

**Files:** Create `server/tests/test_live_stream_repository_parity.py`. Application changes only if these tests reveal a P1-owned defect; do not edit repositories or graph code.

- [ ] Red: write the exact tests below. To preserve TDD for this final verification task, add/run its first in-flight test immediately after Task 1, **before Task 2 implementation**; add/run the parity test before Task 5 implementation. Record those observed failing runs; execute the complete file again at this task. Do not manufacture red by reverting completed code. If execution starts after P1 code is already implemented, report this task as regression evidence rather than claiming an observed red phase.

```python
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from server.database.generation_jobs import GenerationJobStore
from server.database.generation_migrations import initialize_generation_schema
from server.database.learning_persistence import LearningManager
from server.database.progress_events import ProgressEventStore
from server.database.repositories.facade import RepositoryFacade
from server.database.repositories.mongo_progress import MongoProgressEventRepository
from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, StageChangedPayload, TopicContentDeltaPayload,
)
from server.services.session_event_stream import (
    SessionLiveStreamBroadcaster, stream_session_events,
)
from server.tests.realtime_foundation_helpers import StreamOutput, fake_instructor
from server.utils.instructor_client import InstructorClient

def frame_data(frame):
    return json.loads(next(line[6:] for line in frame.splitlines()
                           if line.startswith("data: ")))

class LiveStreamRepositoryParityTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_callback_reaches_sse_twice_before_completion(self):
        hub = SessionLiveStreamBroadcaster()
        release = asyncio.Event()
        updates_delivered = asyncio.Event()
        previous = ""
        async def chunks(**kwargs):
            yield StreamOutput.model_construct(text="a")
            yield StreamOutput.model_construct(text="ab")
            await release.wait()
            yield StreamOutput(text="abc")
        async def publish(update):
            nonlocal previous
            if update.kind == "attempt_started":
                previous = ""
                await hub.begin_target(
                    session_id="s", job_id="j",
                    stage=GenerationStage.GENERATING_BATCH,
                    target_type="topic", target_id="n", sequence_index=0,
                    attempt=update.attempt,
                )
            else:
                text = update.partial.text
                suffix = text[len(previous):]
                previous = text
                await hub.publish(
                    session_id="s", job_id="j",
                    stage=GenerationStage.GENERATING_BATCH,
                    event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                    payload=TopicContentDeltaPayload(
                        node_id="n", sequence_index=0,
                        text_delta=suffix, attempt=update.attempt,
                    ),
                )
                await asyncio.sleep(0)
        events = MagicMock()
        events.list_after.return_value = []
        jobs = MagicMock()
        jobs.to_public_by_session.return_value = {
            "id": "j", "stage": "GENERATING_BATCH", "last_event_id": 900,
        }
        stream = stream_session_events(
            session_id="s", cursor=10, event_store=events, job_store=jobs,
            broadcaster=hub,
        )
        received = []
        async def consume():
            async for frame in stream:
                if frame.startswith(":"):
                    continue
                value = frame_data(frame)
                if value["event_type"] == "topic_content_delta":
                    received.append(value["payload"]["text_delta"])
                    if len(received) == 2:
                        updates_delivered.set()
                        return
        consumer = asyncio.create_task(consume())
        await asyncio.sleep(0)  # Register before provider sends chunks.
        with fake_instructor(chunks):
            provider = asyncio.create_task(
                InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput, messages=[],
                    api_key="fixture-secret", model_override="model",
                    on_delta=publish,
                )
            )
            try:
                await asyncio.wait_for(updates_delivered.wait(), 0.25)
                self.assertEqual(received, ["a", "b"])
                self.assertFalse(provider.done())
                self.assertFalse(release.is_set())
                events.append_once.assert_not_called()
                release.set()
                self.assertEqual((await provider).text, "abc")
            finally:
                release.set()
                for task in (provider, consumer):
                    if not task.done():
                        task.cancel()
                await asyncio.gather(provider, consumer, return_exceptions=True)
                await stream.aclose()

    async def test_real_repository_adapters_share_milestone_and_draft_cursors(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "a2ui.db"
            LearningManager(path).init_learning_tables()
            initialize_generation_schema(path)
            session, _ = GenerationJobStore(path).create_session_shell_and_job(
                query="Parity", user_id=None, mode="lite",
                web_search_requested=False,
            )
            session_id = session["id"]
            sqlite = ProgressEventStore(path)
            milestone = sqlite.append_once(
                session_id=session_id,
                event_type=ProgressEventType.STAGE_CHANGED,
                payload=StageChangedPayload(
                    previous_stage=GenerationStage.PLANNING_BATCH,
                    stage=GenerationStage.GENERATING_BATCH,
                ), dedupe_key="parity-stage",
            )
            documents = [{
                "_id": milestone.id, "session_id": session_id,
                "event_type": "stage_changed",
                "payload": milestone.payload.model_dump(mode="json"),
                "dedupe_key": "parity-stage",
                "created_at": milestone.created_at.isoformat(),
            }]
            collection = MagicMock()
            def find(query):
                selected = [doc for doc in documents
                            if doc["_id"] > query["_id"]["$gt"]]
                cursor = MagicMock()
                cursor.sort.return_value = cursor
                cursor.limit.return_value = cursor
                cursor.__iter__.side_effect = lambda: iter(selected)
                return cursor
            collection.find.side_effect = find
            counters = MagicMock()
            database = MagicMock()
            database.__getitem__.side_effect = lambda name: {
                "progress_events": collection,
                "storage_counters": counters,
                "generation_jobs": MagicMock(),
            }[name]
            mongo = MongoProgressEventRepository(database)
            for backend in (sqlite, mongo):
                with self.subTest(backend=type(backend).__name__):
                    facade = RepositoryFacade(lambda: backend)
                    hub = SessionLiveStreamBroadcaster()
                    await hub.begin_target(
                        session_id=session_id, job_id="j",
                        stage=GenerationStage.GENERATING_BATCH,
                        target_type="topic", target_id="n", sequence_index=0,
                        attempt=1,
                    )
                    async def push(text):
                        await hub.publish(
                            session_id=session_id, job_id="j",
                            stage=GenerationStage.GENERATING_BATCH,
                            event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                            payload=TopicContentDeltaPayload(
                                node_id="n", sequence_index=0, text_delta=text,
                            ),
                        )
                    await push("retained")
                    jobs = MagicMock()
                    jobs.to_public_by_session.return_value = {
                        "id": "j", "stage": "GENERATING_BATCH",
                        "last_event_id": milestone.id + 500,
                    }
                    stream = stream_session_events(
                        session_id=session_id, cursor=0,
                        event_store=facade, job_store=jobs, broadcaster=hub,
                    )
                    try:
                        durable = frame_data(await anext(stream))
                        self.assertEqual(durable["id"], milestone.id)
                        snapshot = frame_data(await anext(stream))
                        self.assertEqual(snapshot["snapshot"]["text"], "retained")
                        self.assertEqual(snapshot["sequence"], 2)
                        await push(" live")
                        live = frame_data(await asyncio.wait_for(anext(stream), 0.1))
                        self.assertEqual(live["sequence"], 3)
                        self.assertEqual(live["id"], 0)
                        self.assertEqual(len(facade.list_after(session_id, 0)), 1)
                    finally:
                        await stream.aclose()
            collection.insert_one.assert_not_called()
            counters.find_one_and_update.assert_not_called()
```

- [ ] Red commands when scheduled early: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_stream_repository_parity.LiveStreamRepositoryParityTests.test_provider_callback_reaches_sse_twice_before_completion -v` and `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_stream_repository_parity.LiveStreamRepositoryParityTests.test_real_repository_adapters_share_milestone_and_draft_cursors -v`.
- [ ] Green minimal implementation: the code in Tasks 2–7 is the implementation for these independently observable contract tests. Do not add a parallel transport, alternate provider call, or Mongo test-only production branch. If a test fails, fix the failing P1-owned function with its test still red, using the previous task's implementation boundary.
- [ ] Verify: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_stream_repository_parity -v`. Expected both real adapter paths and unfinished-provider checks pass with no network calls or additional persistence.
- [ ] Commit: `git add server/tests/test_live_stream_repository_parity.py` then `git commit -m "test(realtime): prove in-flight SSE and repository replay parity"`.

## Final regression commands and handoff

Run once after all P1 tasks; broaden only when failures or new changes justify it:

```powershell
& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_progress_contracts server.tests.test_instructor_partial_stream server.tests.test_streaming_agent_boundary server.tests.test_session_live_broadcaster server.tests.test_live_session_replay server.tests.test_live_stream_bounds server.tests.test_live_stream_safety server.tests.test_live_stream_repository_parity -v
& server/.venv/Scripts/python.exe -m unittest server.tests.test_session_events server.tests.test_generation_api server.tests.test_generation_runtime server.tests.test_prompt_cache server.tests.test_agent_model_resolution server.tests.test_progress_events server.tests.test_mongo_progress server.tests.test_repository_contracts -v
& server/.venv/Scripts/python.exe -m unittest
& server/.venv/Scripts/python.exe -m compileall -q server/schemas/progress.py server/utils/instructor_client.py server/agents/base.py server/services/session_event_stream.py
git diff --check
```

Use stdlib `trace` for focused changed-line coverage without installing tooling:

```powershell
& server/.venv/Scripts/python.exe -m trace --count --summary --missing --coverdir docs/realtime-course-generation/.coverage-p1 --module unittest server.tests.test_live_progress_contracts server.tests.test_instructor_partial_stream server.tests.test_streaming_agent_boundary server.tests.test_session_live_broadcaster server.tests.test_live_session_replay server.tests.test_live_stream_bounds server.tests.test_live_stream_safety server.tests.test_live_stream_repository_parity
```

Inspect `.cover` files for the four owned modules and compare executed/unexecuted **new lines** against the implementation diff; >80% new executable lines is the requirement, not overall legacy-module coverage. Report uncovered branches and add small deterministic tests before handoff, especially expiry, target capacity, no-yield response, exhausted retries/attempt bounds, invalid begin metadata, sources, outline, explanation-ready, paused/failed snapshots, and concurrent subscribers. Do not commit coverage outputs. No configured Python linter/type checker exists; do not claim one ran.

Client code is unchanged by P1. P5 final project verification still runs, from `client/`: `npm run test -- --run`, `npm run test:generation:coverage`, `npm run lint`, and `npm run build`. These are downstream release gates, not proof of P1's server behavior. No paid provider runs are required.

Handoff must give P2/P3/P4 the frozen contract above, task commit hashes, observed red/green output, regression results, and honest coverage results. P1 supplies transport and generic streaming evidence; P2/P3 own actual producer projection/persistence and P4 owns safe rendering/zero-click UI. Do not claim A1–A15 integration is complete at P1's boundary.

## Traceability

| Task | Goal acceptance IDs supported | Research fixed decisions | Evidence / ownership boundary |
| --- | --- | --- | --- |
| 1 payload contracts | A10, A11, A14 | 5, 6, 10 | Six closed payloads, separate live envelope, forbidden secret fields |
| 2 genuine partial path | A3, A5, A6, A11 | 1, 2, 10 | Two cumulative updates while provider gate is closed; final full validation |
| 3 retries/BaseAgent | A9, A11, A12, A14 | 1, 2, 6, 10 | Role resolution preserved; transport retry reset callback; cancellation cleanup |
| 4 target broadcaster | A7, A10, A11 | 3, 4, 5, 6 | Concurrent node/session isolation, attempt replacement, retained current drafts |
| 5 SSE merge/reconnect | A10, A12, A15 | 2, 3, 4, 5 | Atomic subscription, snapshot-then-tail, no live Last-Event-ID, current-stage filtering |
| 6 bounds/backpressure | A7, A10, A12, A15 | 3, 4, 5, 10 | Latest-window snapshots, bounded subscriber state, final/pause retention policy |
| 7 safety | A11, A14 | 1, 3, 6, 9 (rendering handoff), 10 | Exact-class payload boundary, metadata checks, safe logs, credential-redacted previews |
| 8 integrated foundation proof | A3, A5, A6 (generic provider boundary), A10, A11, A15 | 1, 2, 3, 4, 5, 10 | Actual unfinished-provider-to-SSE fixture and real SQLite/Mongo facade replay paths |

Fixed decisions 7–9's client implementation belongs to P4. Research/planner/generator production behavior belongs to P2/P3; stage choreography, accessibility, search modes/budgets, and complete zero-click A8 belong to downstream plans/P5.

## Research alignment and refinements

No stack or fixed-decision deviation. Explicit full-model validation supplements Instructor's partial parser; this implements decision 1 without trusting relaxed partial validation. Internal tenacity transport retry uses an attempt-start callback; domain validation/replan stays with P2/P3, matching the research warning about retries after yielding. Immediate dispatch uses zero coalescing delay, within the research latency ceiling. Bounded snapshot truncation with offsets makes the research's ring-buffer/100 KB recommendation executable while keeping final artifacts complete; it is an explicit preview limitation downstream must label. Drafts remain process-local and disappear after process restart; authoritative milestones/artifacts continue through both repository implementations. No per-token persistence or graph/checkpoint/scheduler change.
