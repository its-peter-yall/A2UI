# P3 — Live curriculum and topic generation integration

**Goal:** Emit growing curriculum titles and topic explanations from unfinished
provider responses, with target-scoped retries and explanation/quiz readiness.

**Architecture:** Agents use P1's partial structured-output path and retain their
existing domain validation loops. Each graph-node invocation owns its callback
state and publishes display-only suffixes into `session_live_stream`. Validated
artifacts and durable milestones stay in repository facades; previews never enter
LangGraph checkpoint state or unlock learning nodes.

**Tech Stack:** Existing Python 3.10+, asyncio, Pydantic v2, Instructor 1.15.4,
OpenAI-compatible SDK, LangGraph 1.2.4, SQLite/Mongo repository facades, stdlib
unittest. No new dependencies or stack changes.

For implementation workers: use the installed `executing-plans` and
`test-driven-development` skills. Execute the seven tasks in order. Each task has
an independent red run, minimal green change, verification, and commit. Do not
write application code during the planning handoff.

## Specification and research decisions

Read `goal.md`, `state.md`, `research.md`, and the seven repository specifications
before execution. In particular:

- `docs/ARCHITECTURE.md`: detached 202 generation, secret-free checkpoints,
  server-authoritative learning state, repository facades.
- `docs/STACK.md`: use the installed partial API, no dependency upgrades.
- `docs/CONVENTIONS.md`: public typing, safe logging, 80-column Python style.
- `docs/TESTING.md`: unittest, controlled external doubles, TDD and diagnostics.
- `docs/STRUCTURE.md`: agents own provider/domain work; graph owns integration;
  dedicated tests belong in `server/tests/`.
- `docs/INTEGRATIONS.md`: existing role/provider/key/reasoning routing is preserved
  by `BaseAgent.generate_streaming`.
- `docs/CONCERNS.md`: preserve staged barriers, lock fences, heartbeat, recovery,
  partial failure, and bounded LLM concurrency.

Research decision labels used below:

| Label | Selected decision in research.md/state.md |
| :--- | :--- |
| R1 | One Instructor `create_partial` request per attempt; final full-model validation |
| R2 | Preserve `graph.ainvoke`, `Send`, concurrency 3, heartbeat and checkpoints |
| R3 | Push live output via the process-local broadcaster, no per-token DB writes |
| R4 | Current-draft snapshots and independent draft/durable cursors |
| R5 | Attempt resets replace only the affected target |
| R6 | Allowlisted display fields, safe provisional Markdown, no answer/reasoning stream |
| R7 | Explanation-ready precedes module-ready; quizzes remain required |

Instructor documents cumulative optional-field snapshots and limited validator
support: [official partial-output documentation](https://python.useinstructor.com/concepts/partial/).
Cancellation cleanup uses `finally`, with cancellation propagated:
[official asyncio documentation](https://docs.python.org/3/library/asyncio-task.html#task-cancellation).
Installed P1 source is authoritative for signatures and retry behavior.

## Ownership and exact call sites

Modify only:

- `server/agents/planner.py`: `PlannerAgent.plan`, its two existing
  `self.generate(response_model=CourseOutline, ...)` call sites; add a private
  per-invocation streaming wrapper and an `OutlineDraftCorrection` exception.
  Leave `PlannerAgent.plan_briefs` and complexity/count rules intact.
- `server/agents/generator.py`: `GeneratorAgent.generate_explanation`, the
  `self.generate(response_model=GeneratedContent, ...)` inside its existing
  three-iteration Mermaid/citation correction loop; add its per-invocation
  streaming wrapper and `TopicDraftCorrection` exception. Leave prompt building,
  Mermaid validation and final citation sanitization intact.
- `server/graph/nodes.py`: `outline_planner_node` at `planner_agent.plan(...)`;
  `generator_node` at `generator_agent.generate_explanation(...)` and immediately
  after `persist_content_with_citations`; `quizzer_node` immediately after the
  successful `MODULE_READY` append. Add private projection/callback helpers in
  this file, with no topology or state-schema changes.
- Create dedicated tests:
  `server/tests/test_live_outline_streaming.py`,
  `server/tests/test_live_topic_streaming.py`,
  `server/tests/test_live_topic_readiness.py`,
  `server/tests/test_live_generation_safety.py`.

Do not modify `base.py`, `instructor_client.py`, `session_event_stream.py`, schemas,
repositories, graph build/runner/state, researcher, research runner, client files,
or existing tests. Other workers are active; preserve their changes. Stage only
the exact files belonging to the current task.

**Existing-test coordination:**
`server/tests/test_staged_graph.py:151` patches `planner_agent.generate` in
`StagedGraphTests.test_second_count_mismatch_is_durably_failed`. Once the graph
supplies a streaming callback that test must mock the streaming provider boundary
or `generate_streaming`, including `attempt_started` callbacks. Notify the parent
to allocate that fixture-only migration separately. Do not add a production
mock-detection branch or silently skip the regression. Agent tests calling
`plan()`/`generate_explanation()` without a callback retain their current
`generate` seam and behavior. A missing legacy state `job_id` may be resolved from
`generation_job_store.get_by_session(session_id).id` only when a real job
exists; otherwise use the existing legacy non-streaming branch. Never invent an
unscoped job ID. Production runner states include `job_id`.

## Exact landed P1 interfaces

From `server/utils/instructor_client.py`:

```python
@dataclass(frozen=True)
class StructuredStreamUpdate:
    kind: Literal["attempt_started", "partial"]
    attempt: int
    partial: Optional[BaseModel] = None

StreamDeltaCallback = Callable[
    [StructuredStreamUpdate], Awaitable[None]
]
```

From `server/agents/base.py` (call this; do not call the SDK directly):

```python
async def generate_streaming(
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
) -> T:
```

It forwards role, response model, messages, active API key, model, attribution,
system prompt, provider, reasoning and token cap to the already-landed
`InstructorClient.create_partial_structured`. That coroutine has those same
provider arguments plus keyword-only `on_delta` and `initial_attempt`. P3 does
not call it directly or change its implementation.

Actual P1 behavior:

- Async callback is awaited for `attempt_started` before each provider call,
  and for every cumulative partial while the stream is open.
- Final return validates `response_model.model_validate(last.model_dump())`.
- Active-provider key occurrences in callback snapshots are redacted by P1.
- Provider retry budget is `min(3, 6 - initial_attempt)`; attempts are 1–5.
- `ValueError`, `TypeError`, `CancelledError`, and `StreamCallbackError` are
  excluded from provider retries. Pydantic `ValidationError` is a `ValueError`.
- `_notify` wraps callback exceptions in `StreamCallbackError`, preserving
  `__cause__`; cancellation is re-raised unchanged. Only P3's explicit correction
  exceptions may be unwrapped into domain replan/correction handling. Arbitrary
  callback failures must never buy another provider call.

From `server/services/session_event_stream.py`:

```python
session_live_stream = SessionLiveStreamBroadcaster()

async def begin_target(
    self, *, session_id: str, job_id: str, stage: GenerationStage,
    target_type: Literal["research", "outline", "topic"],
    target_id: str, attempt: int,
    sequence_index: Optional[int] = None,
    reason: Literal[
        "started", "retry", "replan", "correction", "resumed"
    ] = "started",
) -> None:

async def publish(
    self, *, session_id: str, job_id: str, stage: GenerationStage,
    event_type: ProgressEventType, payload: BaseModel,
) -> None:

async def snapshots(self, session_id: str) -> list[LiveDraftEvent]:

async def retire_target(
    self, *, session_id: str,
    target_type: Literal["research", "outline", "topic"],
    target_id: str, sequence_index: Optional[int] = None,
) -> None:
```

Use exact payload classes from `server/schemas/progress.py`:

```python
OutlineTextDeltaPayload(
    course_title_delta=None, topic_index=None,
    topic_title_delta=None, attempt=1,
)
TopicContentDeltaPayload(
    node_id=node_id, sequence_index=index, text_delta=suffix, attempt=1,
)
TopicExplanationReadyPayload(
    node_id=node_id, sequence_index=index, attempt=1,
)
```

Titles are at most 300 characters per field. Text deltas are 1–4,000 characters;
split longer suffixes. Do not supply `sequence`, SSE `id`, or durable cursors.
The broadcaster assigns target-local sequences. `begin_target` is idempotent for
equal attempts and replaces only that target for higher attempts.

## P3 callback extension and lifecycle

Both domain methods gain keyword-only, optional arguments after their existing
parameters. These are new P3 interfaces, not claimed to exist in P1:

```python
on_delta: Optional[StreamDeltaCallback] = None,
on_attempt_started: Optional[Callable[
    [int, Literal["started", "retry", "replan", "correction"]],
    Awaitable[None],
]] = None,
initial_attempt: int = 1,
```

`on_attempt_started` bridges the reset reason absent from P1's update dataclass.
An agent's local relay calls it first, then forwards the original P1 update via
`on_delta`. The graph handles only partials in `on_delta`, so a begin happens once
per chargeable attempt. This avoids changing P1's shared contract. The relay
tracks the maximum attempt actually reported by P1, so a domain correction starts
at `latest_attempt + 1`, even following transport retries. No shared mutable
agent/singleton attributes hold attempts, text, or callbacks.

Graph callback setup reads matching current snapshots, keyed by the exact target
string `json.dumps([kind, target_id, index], separators=(",", ":"))`, plus job ID.
Initial attempt is previous matching attempt + 1, or 1. First begin after a
retained interrupted draft uses `resumed`; subsequent begins use the agent's
reason. Reject a next attempt above 5 before making a provider call. Keep prior
drafts on exhausted/failed/cancelled jobs for truthful recovery presentation.

Outline identity: `("outline", session_id, None)`, stage `OUTLINING`. Topic identity:
`("topic", node_id, ordered sequence_index)`, stage `GENERATING_PREVIEW` for the
first batch (`batch_start == 0`), otherwise `GENERATING_BATCH`. Retain this captured
stage throughout that target's lifetime; do not substitute a later job snapshot
stage into a publisher call, because P1 rejects a changed target stage.

For each attempt retain raw cumulative field values and emitted safe field values
separately. Ignore absent/None/empty fields and exact repeats. Accept only prefix
extensions. A non-prefix course/topic title, topic-list shrink/reordering, or
explanation replacement raises the respective P3 correction exception; do not
append replacement text. Outline replan restarts the entire outline target, while
topic correction restarts only that topic. Never persist partial models.

The title map uses list position as its provisional `topic_index`; absent partial
`TopicNode.index` is normal. If a present index disagrees with its position, reject
and replan. Final `CourseOutline` validation enforces contiguous indices and depth
counts. Compare complete raw strings before clipping emitted title text to 300.

No buffering for ordinary safe text: the awaited callback publishes immediately,
within research's 50–100 ms delivery budget. Only an unfinished security-sensitive
lexeme may be withheld until it is classified; do not wait for sentences, sections,
or complete responses. Existing 96,000-byte/64-mailbox broadcaster bounds apply.

Explanation persistence emits live `TOPIC_EXPLANATION_READY` only after the
transactional validated content/citation commit succeeds. It remains generation
preview content; quizzes and learning statuses are unchanged. Retirement happens
after `persist_outline` + durable `OUTLINE_READY`, or topic success persistence +
durable `MODULE_READY`. A failed durable append retains the draft. Quiz failure
retains the explanation with the existing durable `MODULE_FAILED` error state.

## Shared test fixture prefix

Task 1 creates `server/tests/test_live_outline_streaming.py` with this reusable
prefix. Other new test files import these helpers. Before first writing any new
Python module, prepend its mandatory docstring header with exactly 76 `=`
characters on separator lines, actual FILE/LOCATION/PURPOSE/ROLE/KEY COMPONENTS;
then the future import. Each test file ends with
`if __name__ == "__main__": unittest.main()`. This Markdown plan has no such banner.

```python
from __future__ import annotations

import asyncio
import json
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import SecretStr

from server.agents.generator import GeneratedContent
from server.agents.planner import PlannerAgent
from server.graph import nodes
from server.schemas.generation import GenerationStage
from server.schemas.learning import CourseOutline, TopicNode
from server.schemas.llm import LLMContext
from server.schemas.progress import ProgressEventType
from server.services.session_event_stream import (
    SessionLiveStreamBroadcaster,
)
from server.tests.realtime_foundation_helpers import fake_instructor


def topic(index=0):
    return TopicNode(
        index=index, title=f"Topic {index}",
        summary_for_context=f"Summary {index}",
        key_terms=["alpha", "beta"], complexity="Basic", quiz_count=1,
    )


def outline(count=1, title="Alpha course"):
    return CourseOutline(
        course_title=title, topics=[topic(i) for i in range(count)],
    )


def partial_content(**fields):
    fields.setdefault("key_takeaways", None)
    return GeneratedContent.model_construct(**fields)


def content(text="Alpha explanation. " * 20, **extra):
    return GeneratedContent(
        content_markdown=text, key_takeaways=["One", "Two", "Three"],
        **extra,
    )


async def dispose(task):
    if not task.done():
        task.cancel()
    await asyncio.gather(task, return_exceptions=True)


class OpenResponse:
    """Real async-generator fixture; never finishes before release."""

    def __init__(self, partials, final):
        self.partials = partials
        self.final = final
        self.release = asyncio.Event()
        self.open = asyncio.Event()
        self.closed = asyncio.Event()

    async def stream(self, **kwargs):
        try:
            for partial in self.partials:
                yield partial
            self.open.set()
            await self.release.wait()
            yield self.final
        finally:
            self.closed.set()


class RecordingHub(SessionLiveStreamBroadcaster):
    def __init__(self):
        super().__init__()
        self.events = []
        self.retired = []

    async def begin_target(self, **kwargs):
        await super().begin_target(**kwargs)
        self.events.append(("reset", dict(kwargs)))

    async def publish(self, **kwargs):
        await super().publish(**kwargs)
        self.events.append(("live", dict(kwargs)))

    async def retire_target(self, **kwargs):
        self.retired.append(dict(kwargs))
        await super().retire_target(**kwargs)


class LiveHarness:
    def __init__(self):
        self.hub = RecordingHub()
        self.jobs = MagicMock()
        self.jobs.is_cancel_requested.return_value = False
        self.jobs.get_by_session.return_value = None
        self.artifacts = MagicMock()
        self.artifacts.has_durable_content.return_value = False
        self.artifacts.node_id_for_topic.side_effect = (
            lambda session, index: f"n{index}"
        )
        self.artifacts.get_topic.side_effect = (
            lambda session, index: topic(index)
        )
        self.artifacts.get_brief.return_value = None
        self.artifacts.get_adjacent_summaries.return_value = (None, None)
        self.learning = MagicMock()
        self.saved = {}
        self.ready = set()
        self.trace = []
        self.events = MagicMock()
        self.events.append_once.side_effect = self.append
        self.artifacts.persist_content_with_citations.side_effect = (
            self.save_content
        )
        self.artifacts.persist_topic_success.side_effect = self.save_success
        self.learning.get_concept_node.side_effect = self.get_node
        self.learning.get_session_nodes.side_effect = (
            lambda session: [self.get_node(key) for key in self.saved]
        )
        self.llm = LLMContext(
            api_key=SecretStr("fixture-active-key"), model="fixture/model",
            generalcompute_api_key=SecretStr("fixture-secondary-key"),
        )
        self.runtime = {"llm_context": self.llm}
        self.stack = ExitStack()

    def save_content(self, *, node_id, content_markdown, citations):
        self.saved[node_id] = content_markdown
        self.trace.append(("content_saved", node_id))

    def save_success(self, *, node_id, quiz_set, citations):
        self.ready.add(node_id)
        self.trace.append(("quiz_saved", node_id))

    def get_node(self, node_id):
        if node_id not in self.saved:
            return None
        return {
            "id": node_id, "sequence_index": int(node_id[1:]),
            "status": "LOCKED", "content_markdown": self.saved[node_id],
            "generation_status": (
                "READY" if node_id in self.ready else "GENERATING"
            ),
        }

    def append(self, **kwargs):
        self.trace.append(("durable", kwargs["event_type"].value))
        return SimpleNamespace(**kwargs)

    def __enter__(self):
        for name, value in (
            ("generation_job_store", self.jobs),
            ("generation_artifact_store", self.artifacts),
            ("learning_manager", self.learning),
            ("progress_event_store", self.events),
            ("session_live_stream", self.hub),
        ):
            self.stack.enter_context(patch.object(
                nodes, name, value, create=True,
            ))
        return self

    def __exit__(self, *args):
        return self.stack.__exit__(*args)

    def outline_state(self, count=1):
        return {
            "job_id": "j", "session_id": "s", "query": "Alpha",
            "resolved_mode": "custom", "custom_topic_count": count,
        }

    def worker_state(self, index=0, batch_start=0):
        return {
            "job_id": "j", "session_id": "s",
            "batch_start": batch_start, "sequence_index": index,
        }


async def take_type(subscription, event_type):
    while True:
        event = await asyncio.wait_for(subscription.next_event(), 1)
        if event.event_type == event_type:
            return event
```

The fixture patches only provider construction and repository facades. It runs
real P1 validation, real agent methods, real graph nodes, and the real broadcaster.
Constructed partials explicitly set required unfinished fields to `None`, matching
Instructor's Partial models. Omitting such attributes entirely would break P1's
credential redactor before reaching the behavior under test.
`create=True` permits initial red tests before `nodes.session_live_stream` exists;
remove it after Task 2 lands so a typo cannot mask a missing integration import.
The 1-second deadlines detect hangs; gates, not sleeps, establish ordering.

## Task 1 — Planner streaming and attempt relay

**Files:** modify `server/agents/planner.py`; create
`server/tests/test_live_outline_streaming.py` with the prefix above and these
tests. This task defines the agent extension; graph integration follows in Task 2.

- [ ] Red: add the exact tests below.

```python
class LivePlannerAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_planner_partials_precede_response_completion(self):
        fake = OpenResponse([
            CourseOutline.model_construct(course_title="Al", topics=None),
            CourseOutline.model_construct(course_title="Alpha", topics=[]),
        ], outline())
        seen = []
        begins = []
        received = asyncio.Event()

        async def collect(update):
            if update.kind == "partial":
                seen.append(update.partial.course_title)
                if len(seen) == 2:
                    received.set()

        async def begin(attempt, reason):
            begins.append((attempt, reason))

        with fake_instructor(fake.stream) as (_, sdk, calls):
            task = asyncio.create_task(PlannerAgent().plan(
                "Alpha", mode="custom", custom_topic_count=1,
                llm_context=LLMContext(api_key="key", model="model"),
                on_delta=collect, on_attempt_started=begin,
            ))
            try:
                await asyncio.wait_for(received.wait(), 1)
                self.assertEqual(seen, ["Al", "Alpha"])
                self.assertFalse(task.done())
                self.assertFalse(fake.closed.is_set())
                self.assertEqual(begins, [(1, "started")])
                fake.release.set()
                self.assertEqual((await task).course_title, "Alpha course")
                calls.assert_called_once()
                sdk.close.assert_awaited_once()
            finally:
                await dispose(task)

    async def test_count_replan_uses_next_actual_attempt(self):
        calls = 0
        begins = []

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            yield outline(2 if calls == 1 else 1)

        async def begin(attempt, reason):
            begins.append((attempt, reason))

        with fake_instructor(stream):
            result = await PlannerAgent().plan(
                "Alpha", mode="custom", custom_topic_count=1,
                llm_context=LLMContext(api_key="key", model="model"),
                on_delta=AsyncMock(), on_attempt_started=begin,
                initial_attempt=3,
            )
        self.assertEqual(len(result.topics), 1)
        self.assertEqual(begins, [(3, "started"), (4, "replan")])
        self.assertEqual(calls, 2)
```

- [ ] Run red:
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_outline_streaming.LivePlannerAgentTests -v`
  Expected: `TypeError` for the new keyword arguments; never a network request.
- [ ] Green: add keyword-only arguments described above and keep the no-callback
  path calling `self.generate`. Within `plan`, add local `latest_attempt`,
  `call_reason` and a nested call wrapper. The existing first and replan calls use
  it with their original messages, `context`, `llm_context`, and system override.
  The streaming branch is:

```python
# Inside PlannerAgent.plan; latest_attempt initially initial_attempt - 1.
async def call_outline(message, reason):
    nonlocal latest_attempt
    start = latest_attempt + 1
    if start > 5:
        raise ResumablePlannerError("Outline attempt budget exhausted")

    async def relay(update):
        nonlocal latest_attempt
        if update.kind == "attempt_started":
            latest_attempt = max(latest_attempt, update.attempt)
            reset_reason = reason if update.attempt == start else "retry"
            if on_attempt_started is not None:
                await on_attempt_started(update.attempt, reset_reason)
        if on_delta is not None:
            await on_delta(update)

    return await self.generate_streaming(
        response_model=CourseOutline, user_message=message,
        context=context, llm_context=llm_context,
        system_prompt_override=system_prompt,
        on_delta=relay, initial_attempt=start,
    )
```

  Give nested functions precise annotations using P1 types. Add
  `OutlineDraftCorrection(ValueError)` for the next task. Do not replace the
  topic-count constraints, custom count validation, one-replan limit, or prompts.
- [ ] Verify: repeat the red command (now PASS), then
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode server.tests.test_planner_briefs -v`.
- [ ] Commit:
  `git add server/agents/planner.py server/tests/test_live_outline_streaming.py`
  then `git commit -m "feat(streaming): relay live planner attempts and partials"`.

## Task 2 — Live outline titles, correction and whole-target replan

**Files:** modify `server/graph/nodes.py`, `server/agents/planner.py`,
`server/tests/test_live_outline_streaming.py`.

- [ ] Red: append these exact tests.

```python
class LiveOutlineGraphTests(unittest.IsolatedAsyncioTestCase):
    async def test_toc_grows_before_provider_finishes(self):
        fake = OpenResponse([
            CourseOutline.model_construct(
                course_title="Al", topics=[TopicNode.model_construct(
                    index=None, title="To", summary_for_context=None, key_terms=None,
                )],
            ),
            CourseOutline.model_construct(
                course_title="Alpha", topics=[TopicNode.model_construct(
                    index=0, title="Topic", summary_for_context=None, key_terms=None,
                )],
            ),
        ], outline())
        with LiveHarness() as h, fake_instructor(fake.stream):
            async with h.hub.subscribe("s") as subscription:
                task = asyncio.create_task(nodes.outline_planner_node(
                    h.outline_state(), h.runtime,
                ))
                try:
                    titles = []
                    rows = []
                    while len(titles) < 2 or len(rows) < 2:
                        event = await take_type(
                            subscription, ProgressEventType.OUTLINE_TEXT_DELTA,
                        )
                        payload = event.payload
                        if payload.course_title_delta:
                            titles.append(payload.course_title_delta)
                        if payload.topic_title_delta:
                            rows.append(payload.topic_title_delta)
                    self.assertEqual("".join(titles), "Alpha")
                    self.assertEqual("".join(rows), "Topic")
                    self.assertFalse(task.done())
                    self.assertFalse(fake.closed.is_set())
                    h.artifacts.persist_outline.assert_not_called()
                    self.assertEqual(h.events.append_once.call_count, 0)
                    snap = (await h.hub.snapshots("s"))[0]
                    self.assertEqual(snap.target, '["outline","s",null]')
                    self.assertEqual(snap.snapshot.topics, {0: "Topic"})
                    fake.release.set()
                    await task
                    h.artifacts.persist_outline.assert_called_once()
                    self.assertEqual(await h.hub.snapshots("s"), [])
                finally:
                    await dispose(task)

    async def test_count_replan_replaces_all_old_rows(self):
        second = OpenResponse([], outline(1, "New"))
        calls = 0

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                yield outline(2, "Old")
            else:
                yield CourseOutline.model_construct(
                    course_title="New", topics=[topic(0)],
                )
                async for value in second.stream(**kwargs):
                    yield value

        with LiveHarness() as h, fake_instructor(stream):
            task = asyncio.create_task(nodes.outline_planner_node(
                h.outline_state(), h.runtime,
            ))
            try:
                await asyncio.wait_for(second.open.wait(), 1)
                snap = (await h.hub.snapshots("s"))[0]
                self.assertEqual(snap.attempt, 2)
                self.assertEqual(snap.snapshot.course_title, "New")
                self.assertEqual(set(snap.snapshot.topics), {0})
                resets = [args for kind, args in h.hub.events
                          if kind == "reset"]
                self.assertEqual(resets[-1]["reason"], "replan")
                self.assertFalse(task.done())
                h.artifacts.persist_outline.assert_not_called()
                second.release.set()
                await task
                self.assertEqual(calls, 2)
            finally:
                await dispose(task)

    async def test_nonprefix_title_closes_attempt_and_replans(self):
        calls = 0
        closed = asyncio.Event()

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                try:
                    yield CourseOutline.model_construct(
                        course_title="Wrong", topics=None,
                    )
                    yield CourseOutline.model_construct(
                        course_title="Changed", topics=None,
                    )
                    self.fail("Correction must close this attempt")
                finally:
                    closed.set()
            else:
                yield outline(1, "Correct")

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            self.assertTrue(closed.is_set())
            resets = [args for kind, args in h.hub.events if kind == "reset"]
            self.assertEqual([item["attempt"] for item in resets], [1, 2])
            self.assertEqual(resets[-1]["reason"], "replan")
            self.assertEqual(calls, 2)
            saved = h.artifacts.persist_outline.call_args.args[1]
            self.assertEqual(saved.course_title, "Correct")

    async def test_ignored_fields_repeats_and_title_cap(self):
        async def stream(**kwargs):
            yield CourseOutline.model_construct(course_title=None, topics=None)
            yield CourseOutline.model_construct(course_title="", topics=[])
            yield outline(1, "x" * 350)
            yield outline(1, "x" * 350)

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            payloads = [args["payload"] for kind, args in h.hub.events
                        if kind == "live"]
            self.assertEqual(sum(len(p.course_title_delta or "")
                                 for p in payloads), 300)
            self.assertEqual(sum(p.topic_title_delta is not None
                                 for p in payloads), 1)
            self.assertTrue(all(p.course_title_delta or p.topic_title_delta
                                for p in payloads))
```

- [ ] Run red:
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_outline_streaming.LiveOutlineGraphTests -v`.
  Expected: no outline deltas, gated fixture times out, no replan reset.
- [ ] Green: import P1 stream update/payload types and singleton in `nodes.py`.
  Create `_OutlineLiveOutput` with invocation-local `raw_title`, `raw_topics`,
  `display_title`, `display_topics`, `attempt`, and identity metadata. Its
  `begin(attempt, reason)` checks cancellation, clears its dictionaries, then
  awaits `begin_target(target_type="outline", target_id=session_id,
  sequence_index=None, stage=OUTLINING, ...)`. Its async `update` ignores
  `attempt_started` and stale attempts; gets fields with `getattr`, processes
  `topics or []` in ordered position, verifies prefix extension, clips titles,
  and publishes only non-empty suffixes. For an absent list do not erase prior
  rows; for a present shorter list after prior rows, raise correction.

  Concrete suffix/publish operation:

```python
if current and not current.startswith(previous):
    raise OutlineDraftCorrection("Outline display field changed")
suffix = current[:300][len(previous[:300]):]
if suffix:
    await session_live_stream.publish(
        session_id=session_id, job_id=job_id,
        stage=GenerationStage.OUTLINING,
        event_type=ProgressEventType.OUTLINE_TEXT_DELTA,
        payload=OutlineTextDeltaPayload(
            course_title_delta=suffix, attempt=attempt,
        ),
    )
# For a row, use topic_index=position and topic_title_delta=suffix instead.
# Preserve full raw strings separately; never compare clipped strings only.
```

  In `PlannerAgent.plan`, normalize the existing two domain calls into an initial
  call plus one correction/replan opportunity. Reuse its current count feedback
  for count mismatch; use a static correction message for changed/invalid output.
  Catch `ValidationError` and only a `StreamCallbackError` whose `__cause__` is
  `OutlineDraftCorrection`. Other `ValueError`/callback errors propagate. Both
  correction paths consume the same one-replan opportunity, with
  `initial_attempt=latest_attempt + 1` and reset reason `replan`. A second count
  mismatch raises the current `OutlineTopicCountError`; a second malformed or
  corrected stream raises `ResumablePlannerError`. Never loop without a bound.

  Wire the callbacks at the existing `planner_agent.plan` call. Persist only its
  fully validated return. Retire after a successful outline milestone append:

```python
generation_artifact_store.persist_outline(session_id, outline)
try:
    progress_event_store.append_once(
        session_id=session_id,
        event_type=ProgressEventType.OUTLINE_READY,
        payload=OutlineReadyPayload(
            course_title=outline.course_title,
            topic_count=len(outline.topics),
        ),
        dedupe_key="outline:ready",
    )
except Exception:
    logger.debug("outline_ready event skipped for session %s", session_id)
else:
    await session_live_stream.retire_target(
        session_id=session_id, target_type="outline", target_id=session_id,
        sequence_index=None,
    )
```

  Keep stage transitions/counts/return fields unchanged. Remove fixture
  `create=True` now that the broadcaster is imported.
- [ ] Verify: repeat red command, then
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_outline_streaming server.tests.test_planner_mode server.tests.test_planner_briefs -v`.
- [ ] Commit:
  `git add server/agents/planner.py server/graph/nodes.py server/tests/test_live_outline_streaming.py`
  then `git commit -m "feat(streaming): publish live curriculum with isolated replans"`.

## Task 3 — Generator streaming through existing correction loop

**Files:** modify `server/agents/generator.py`; create
`server/tests/test_live_topic_streaming.py`.

- [ ] Red: add the module header, imports and exact tests below.

```python
from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from tenacity import wait_none

from server.agents.generator import GeneratedContent, GeneratorAgent
from server.graph import nodes
from server.schemas.progress import ProgressEventType
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_live_outline_streaming import (
    LiveHarness, OpenResponse, content, dispose, partial_content,
    take_type, topic,
)


class LiveGeneratorAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_explanation_grows_while_response_is_open(self):
        fake = OpenResponse([
            partial_content(content_markdown="Al"),
            partial_content(content_markdown="Alpha"),
        ], content())
        seen = []
        received = asyncio.Event()

        async def collect(update):
            if update.kind == "partial":
                seen.append(update.partial.content_markdown)
                if len(seen) == 2:
                    received.set()

        with LiveHarness() as h, fake_instructor(fake.stream) as (_, _, calls):
            task = asyncio.create_task(GeneratorAgent().generate_explanation(
                topic(), llm_context=h.llm, on_delta=collect,
                on_attempt_started=AsyncMock(),
            ))
            try:
                await asyncio.wait_for(received.wait(), 1)
                self.assertEqual(seen, ["Al", "Alpha"])
                self.assertFalse(task.done())
                self.assertFalse(fake.closed.is_set())
                fake.release.set()
                self.assertEqual((await task).content_markdown,
                                 content().content_markdown)
                calls.assert_called_once()
            finally:
                await dispose(task)

    async def test_transport_retry_then_mermaid_correction_attempts(self):
        calls = 0
        begins = []

        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                yield partial_content(content_markdown="Old")
                raise OSError("disconnect")
            if calls == 2:
                yield content("```mermaid\nbad diagram\n```\n" + "a" * 320)
            else:
                yield content()

        async def begin(attempt, reason):
            begins.append((attempt, reason))

        with LiveHarness() as h, fake_instructor(stream), patch(
            "server.utils.instructor_client.wait_exponential",
            return_value=wait_none(),
        ), patch("server.agents.generator.validate_mermaid_code",
                 return_value="invalid"):
            result = await GeneratorAgent().generate_explanation(
                topic(), llm_context=h.llm, on_delta=AsyncMock(),
                on_attempt_started=begin,
            )
        self.assertEqual(begins, [
            (1, "started"), (2, "retry"), (3, "correction"),
        ])
        self.assertEqual(calls, 3)
        self.assertEqual(result.content_markdown, content().content_markdown)
```

- [ ] Run red:
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_topic_streaming.LiveGeneratorAgentTests -v`.
  Expected: unsupported streaming keywords.
- [ ] Green: add keyword-only callback/attempt parameters and
  `TopicDraftCorrection(ValueError)`. Add a local typed relay/call wrapper using
  the Task 1 pattern, with `response_model=GeneratedContent`, the current
  `active_user_message`, and `llm_context`. No-callback calls retain `self.generate`.
  Keep domain `current_attempt` (1–3) separate from P1's `latest_attempt` (1–5).
  First call uses reason `started`; transport retry uses `retry`; Mermaid,
  citation, schema validation, and non-prefix explanation correction use
  `correction`. Re-use existing correction prompts and final sanitizer.

```python
try:
    content = await call_content(
        active_user_message,
        "started" if current_attempt == 1 else "correction",
    )
except StreamCallbackError as exc:
    if not isinstance(exc.__cause__, TopicDraftCorrection):
        raise
    if current_attempt >= max_attempts or latest_attempt >= 5:
        raise ValueError("Explanation correction budget exhausted") from exc
    active_user_message = (
        user_message + "\n\nCORRECTION REQUIRED: Return one complete "
        "consistent explanation without replacing previously emitted text."
    )
    current_attempt += 1
    continue
except ValidationError:
    if current_attempt >= max_attempts or latest_attempt >= 5:
        raise
    active_user_message = (
        user_message + "\n\nCORRECTION REQUIRED: Return all required "
        "GeneratedContent fields with valid lengths."
    )
    current_attempt += 1
    continue
```

  Track `content` only after a fully validated return; exhausted invalid schema
  output cannot use the existing final sanitization return path. Retain the
  existing behavior for a fully validated content model with exhausted Mermaid
  corrections (`mermaid_invalid` warning). Gate `start > 5` before each next call.
  Never turn arbitrary callback failures or provider rejection into fake output.
- [ ] Verify: repeat red command, then
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_generator_agent server.tests.test_live_topic_streaming.LiveGeneratorAgentTests -v`.
- [ ] Commit:
  `git add server/agents/generator.py server/tests/test_live_topic_streaming.py`
  then `git commit -m "feat(streaming): stream explanations across generator corrections"`.

## Task 4 — Graph topic deltas and concurrent target isolation

**Files:** modify `server/graph/nodes.py`,
`server/tests/test_live_topic_streaming.py`.

- [ ] Red: append these exact integration tests.

```python
class LiveTopicGraphTests(unittest.IsolatedAsyncioTestCase):
    async def test_topic_grows_before_content_commit(self):
        fake = OpenResponse([
            partial_content(content_markdown="Al"),
            partial_content(content_markdown="Alpha"),
        ], content())
        with LiveHarness() as h, fake_instructor(fake.stream):
            async with h.hub.subscribe("s") as subscription:
                task = asyncio.create_task(nodes.generator_node(
                    h.worker_state(), h.runtime,
                ))
                try:
                    first = await take_type(
                        subscription, ProgressEventType.TOPIC_CONTENT_DELTA,
                    )
                    second = await take_type(
                        subscription, ProgressEventType.TOPIC_CONTENT_DELTA,
                    )
                    self.assertEqual(first.payload.text_delta, "Al")
                    self.assertEqual(second.payload.text_delta, "pha")
                    self.assertEqual(second.payload.node_id, "n0")
                    self.assertEqual(second.payload.sequence_index, 0)
                    self.assertFalse(task.done())
                    self.assertFalse(fake.closed.is_set())
                    self.assertEqual(h.saved, {})
                    h.events.append_once.assert_not_called()
                    fake.release.set()
                    result = await task
                    self.assertTrue(result["generator_results"][0]
                                    ["content_ready"])
                finally:
                    await dispose(task)

    async def test_interleaved_workers_keep_drafts_isolated(self):
        a_first = asyncio.Event()
        b_first = asyncio.Event()
        a_second = asyncio.Event()
        both_open = asyncio.Event()
        release = asyncio.Event()

        async def stream(**kwargs):
            request = str(kwargs["messages"])
            if "Topic 0" in request:
                yield partial_content(content_markdown="Alpha")
                a_first.set()
                await b_first.wait()
                yield partial_content(
                    content_markdown="Alpha grows",
                )
                a_second.set()
                await release.wait()
                yield content("Alpha grows. " * 30)
            else:
                await a_first.wait()
                yield partial_content(content_markdown="Beta")
                b_first.set()
                await a_second.wait()
                yield partial_content(
                    content_markdown="Beta grows",
                )
                both_open.set()
                await release.wait()
                yield content("Beta grows. " * 30)

        with LiveHarness() as h, fake_instructor(stream):
            tasks = [asyncio.create_task(nodes.generator_node(
                h.worker_state(index), h.runtime,
            )) for index in (0, 1)]
            try:
                await asyncio.wait_for(both_open.wait(), 1)
                snaps = await h.hub.snapshots("s")
                by_node = {json.loads(s.target)[1]: s for s in snaps}
                self.assertEqual(by_node["n0"].snapshot.text, "Alpha grows")
                self.assertEqual(by_node["n1"].snapshot.text, "Beta grows")
                self.assertTrue(all(not task.done() for task in tasks))
                self.assertEqual(h.saved, {})
                release.set()
                await asyncio.gather(*tasks)
                self.assertTrue(h.saved["n0"].startswith("Alpha grows"))
                self.assertTrue(h.saved["n1"].startswith("Beta grows"))
            finally:
                for task in tasks:
                    await dispose(task)

    async def test_correction_resets_only_its_topic(self):
        from server.schemas.generation import GenerationStage
        from server.schemas.progress import TopicContentDeltaPayload

        calls = 0
        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                yield partial_content(content_markdown="Old")
                yield partial_content(content_markdown="Changed")
                self.fail("Non-prefix replacement must close old stream")
            else:
                yield content("Correct explanation. " * 20)

        with LiveHarness() as h, fake_instructor(stream):
            await h.hub.begin_target(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                target_type="topic", target_id="n1",
                sequence_index=1, attempt=1,
            )
            await h.hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n1", sequence_index=1, text_delta="Sibling",
                ),
            )
            await nodes.generator_node(h.worker_state(), h.runtime)
            snaps = await h.hub.snapshots("s")
            by_node = {json.loads(s.target)[1]: s for s in snaps}
            self.assertEqual(by_node["n0"].attempt, 2)
            self.assertTrue(by_node["n0"].snapshot.text.startswith("Correct"))
            self.assertEqual(by_node["n1"].attempt, 1)
            self.assertEqual(by_node["n1"].snapshot.text, "Sibling")
            resets = [args for kind, args in h.hub.events
                      if kind == "reset" and args["target_id"] == "n0"]
            self.assertEqual(resets[-1]["reason"], "correction")
            self.assertEqual(calls, 2)

    async def test_large_suffix_is_split_at_payload_limit(self):
        async def stream(**kwargs):
            yield content("a" * 9001)

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(4, 3), h.runtime)
            deltas = [args["payload"] for kind, args in h.hub.events
                      if kind == "live" and args["event_type"] ==
                      ProgressEventType.TOPIC_CONTENT_DELTA]
            self.assertEqual([len(p.text_delta) for p in deltas],
                             [4000, 4000, 1001])
            self.assertTrue(all(p.node_id == "n4" and p.sequence_index == 4
                                for p in deltas))
            self.assertEqual("".join(p.text_delta for p in deltas), "a" * 9001)
```

Add `import json` to the topic-test imports.

- [ ] Run red:
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_topic_streaming.LiveTopicGraphTests -v`.
  Expected: missing graph callback publications and resets.
- [ ] Green: add `_TopicLiveOutput` to `nodes.py`, with local target/attempt/raw
  markdown/emitted markdown. Its `begin` checks cancellation, clears only local
  accumulators and awaits the target-scoped begin. Its `update` ignores non-partial
  updates, missing/empty display fields and stale attempts. Validate raw prefix
  growth; compute safe display prefix (Task 6 hardens projection); publish suffixes
  in blocks of 4,000. Never access `thinking_content`, takeaways, citations,
  warnings, quiz extras, or `model_dump` on the partial as a public payload.

```python
if not isinstance(value, str) or not value:
    return
if not value.startswith(self.raw_markdown):
    raise TopicDraftCorrection("Explanation display field changed")
self.raw_markdown = value
safe_value = value  # Task 6 replaces this with safe projection.
suffix = safe_value[len(self.display_markdown):]
for offset in range(0, len(suffix), 4000):
    await session_live_stream.publish(
        session_id=self.session_id, job_id=self.job_id, stage=self.stage,
        event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
        payload=TopicContentDeltaPayload(
            node_id=self.node_id, sequence_index=self.sequence_index,
            text_delta=suffix[offset:offset + 4000], attempt=self.attempt,
        ),
    )
self.display_markdown = safe_value
```

  Insert setup and kwargs at the existing generator call, after the current
  `has_durable_content` early return. Preserve artifact/topic/brief/adjacent
  lookups, transactional persistence, cancellation exception and failure result.
  Do not begin a new target or issue an LLM call for durable-content resume skips.
  No changes to Send packets, batch sizes, reducer result shape or quiz barrier.
- [ ] Verify: repeat red command, then
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_outline_streaming server.tests.test_live_topic_streaming -v`.
- [ ] Commit:
  `git add server/graph/nodes.py server/tests/test_live_topic_streaming.py`
  then `git commit -m "feat(streaming): isolate concurrent live topic explanations"`.

## Task 5 — Two-phase readiness and safe retirement

**Files:** modify `server/graph/nodes.py`; create
`server/tests/test_live_topic_readiness.py`.

- [ ] Red: add the header and exact tests below.

```python
from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server.graph import nodes
from server.schemas.learning import QuizCard, QuizOption, QuizSet
from server.schemas.progress import ProgressEventType
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_live_outline_streaming import (
    LiveHarness, content, dispose, outline,
)


def quiz_set():
    return QuizSet(quizzes=[QuizCard(
        question_text="Which is correct?",
        options=[QuizOption(
            option_id=str(index), display_label=label,
            text=f"Option {index}", is_correct=index == 0,
            explanation="QUIZ_ANSWER_SECRET",
        ) for index, label in enumerate("ABCD")],
    )])


class LiveReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_explanation_ready_waits_for_commit_and_keeps_preview(self):
        entered = asyncio.Event()
        release = asyncio.Event()

        async def stream(**kwargs):
            yield content()

        async def quizzes(**kwargs):
            entered.set()
            await release.wait()
            return quiz_set()

        with LiveHarness() as h, fake_instructor(stream), patch.object(
            nodes.quizzer_agent, "generate_quiz_set", side_effect=quizzes,
        ):
            original_publish = h.hub.publish
            async def publish(**kwargs):
                if kwargs["event_type"] == (
                    ProgressEventType.TOPIC_EXPLANATION_READY
                ):
                    self.assertIn("n0", h.saved)
                    self.assertIn(("content_saved", "n0"), h.trace)
                    self.assertNotIn("n0", h.ready)
                await original_publish(**kwargs)
            h.hub.publish = publish
            original_retire = h.hub.retire_target
            async def retire(**kwargs):
                self.assertIn(("quiz_saved", "n0"), h.trace)
                self.assertIn(("durable", "module_ready"), h.trace)
                await original_retire(**kwargs)
            h.hub.retire_target = retire
            await nodes.generator_node(h.worker_state(), h.runtime)
            snap = (await h.hub.snapshots("s"))[0]
            self.assertTrue(snap.snapshot.explanation_ready)
            self.assertEqual(h.saved["n0"], content().content_markdown)
            self.assertEqual(h.ready, set())
            self.assertEqual(h.hub.retired, [])
            self.assertNotIn(("durable", "module_ready"), h.trace)
            live = [args for kind, args in h.hub.events if kind == "live"]
            ready = [args for args in live if args["event_type"] ==
                     ProgressEventType.TOPIC_EXPLANATION_READY]
            self.assertEqual(len(ready), 1)
            task = asyncio.create_task(nodes.quizzer_node(
                h.worker_state(), h.runtime,
            ))
            try:
                await asyncio.wait_for(entered.wait(), 1)
                self.assertFalse(task.done())
                self.assertTrue((await h.hub.snapshots("s"))[0]
                                .snapshot.explanation_ready)
                self.assertEqual(h.ready, set())
                release.set()
                await task
                self.assertEqual(h.ready, {"n0"})
                self.assertLess(h.trace.index(("quiz_saved", "n0")),
                                h.trace.index(("durable", "module_ready")))
                self.assertEqual(await h.hub.snapshots("s"), [])
            finally:
                await dispose(task)

    async def test_persist_failure_never_emits_explanation_ready(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream):
            h.artifacts.persist_content_with_citations.side_effect = (
                RuntimeError("commit failed")
            )
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertFalse(result["generator_results"][0]["content_ready"])
            snaps = await h.hub.snapshots("s")
            self.assertFalse(snaps[0].snapshot.explanation_ready)
            self.assertEqual(h.saved, {})
            self.assertEqual(h.hub.retired, [])

    async def test_failed_module_ready_append_retains_preview(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream), patch.object(
            nodes.quizzer_agent, "generate_quiz_set",
            new=AsyncMock(return_value=quiz_set()),
        ):
            await nodes.generator_node(h.worker_state(), h.runtime)
            def append(**kwargs):
                if kwargs["event_type"] == ProgressEventType.MODULE_READY:
                    raise RuntimeError("durable event unavailable")
                return h.append(**kwargs)
            h.events.append_once.side_effect = append
            await nodes.quizzer_node(h.worker_state(), h.runtime)
            self.assertEqual(h.ready, {"n0"})
            self.assertEqual(h.hub.retired, [])
            self.assertTrue((await h.hub.snapshots("s"))[0]
                            .snapshot.explanation_ready)

    async def test_outline_ready_append_failure_retains_toc(self):
        async def stream(**kwargs):
            yield outline()

        with LiveHarness() as h, fake_instructor(stream):
            def append(**kwargs):
                if kwargs["event_type"] == ProgressEventType.OUTLINE_READY:
                    raise RuntimeError("durable event unavailable")
                return h.append(**kwargs)
            h.events.append_once.side_effect = append
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            self.assertEqual(h.hub.retired, [])
            self.assertEqual(len(await h.hub.snapshots("s")), 1)

    async def test_quiz_failure_preserves_explanation_and_error_milestone(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream), patch.object(
            nodes.quizzer_agent, "generate_quiz_set",
            new=AsyncMock(side_effect=RuntimeError("quiz unavailable")),
        ):
            await nodes.generator_node(h.worker_state(), h.runtime)
            result = await nodes.quizzer_node(h.worker_state(), h.runtime)
            self.assertEqual(result["topic_results"][0]["terminal_status"],
                             "ERROR")
            self.assertNotIn(("durable", "module_ready"), h.trace)
            self.assertIn(("durable", "module_failed"), h.trace)
            self.assertTrue((await h.hub.snapshots("s"))[0]
                            .snapshot.explanation_ready)
            self.assertEqual(h.hub.retired, [])
```

- [ ] Run red:
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_topic_readiness -v`.
  Expected: absent explanation-ready signal and successful module never retires.
- [ ] Green: immediately after validated content/citation persistence, publish:

```python
await session_live_stream.publish(
    session_id=session_id, job_id=job_id, stage=live_output.stage,
    event_type=ProgressEventType.TOPIC_EXPLANATION_READY,
    payload=TopicExplanationReadyPayload(
        node_id=node_id, sequence_index=seq_idx,
        attempt=live_output.attempt,
    ),
)
```

  Do this only when a streaming target exists (legacy no-job branch stays legacy).
  Do not call `retire_target` from the generator. Do not persist this live event
  via `progress_event_store`; the explanation commit is the durable source of
  truth. Guard presentation publication failure separately after persistence:
  log a static message and retain valid content instead of marking the durable
  explanation as a generator failure. Do not catch cancellation.

  In `quizzer_node`, put retirement in the `else` of the existing
  `MODULE_READY` append try/except, after quiz persistence succeeds. It has no
  stage or attempt parameter and uses the durable node's ID:

```python
else:
    await session_live_stream.retire_target(
        session_id=session_id, target_type="topic",
        target_id=node["id"], sequence_index=seq_idx,
    )
```

  Leave learner status selection, quiz generation, count updates, barriers and
  `module_ready` dedupe key intact. No premature module-ready publication.
  Successful outline retirement from Task 2 already observes the same rule.
  Cancellation/failure and failed milestone writes retain current drafts.
- [ ] Verify: repeat red command, then
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_topic_streaming server.tests.test_live_topic_readiness server.tests.test_partial_failure -v`.
- [ ] Commit:
  `git add server/graph/nodes.py server/tests/test_live_topic_readiness.py`
  then `git commit -m "feat(streaming): retain explanation previews until durable module readiness"`.

## Task 6 — Display allowlist and incremental secret/link safety

**Files:** modify `server/graph/nodes.py`; create
`server/tests/test_live_generation_safety.py`. Final citation validation in
`generator.py` remains authoritative. Do not modify P1 or client rendering.

- [ ] Red: add the header and exact tests below.

```python
from __future__ import annotations

import json
import unittest

from server.agents.generator import GeneratedContent
from server.graph import nodes
from server.schemas.progress import ProgressEventType
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_live_outline_streaming import (
    LiveHarness, content, outline, partial_content,
)


def live_json(hub):
    return json.dumps([
        {
            "event": args["event_type"].value,
            "payload": args["payload"].model_dump(mode="json"),
        } for kind, args in hub.events if kind == "live"
    ])


class LiveSafetyTests(unittest.IsolatedAsyncioTestCase):
    def test_sensitive_syntax_is_withheld_until_classified(self):
        cases = (
            ("Visible [source:", "Visible "),
            ("Visible [source:bad] end", "Visible  end"),
            ("Visible [source:ok] end", "Visible [source:ok] end"),
            ("Visible <img src='https://bad", "Visible "),
            ("Visible <img src='https://bad'> end", "Visible  end"),
            ("Visible ![image](data:SECRET_IMAGE) end", "Visible  end"),
            ("Visible [link](https://bad/SECRET) end", "Visible  end"),
            ("Visible ht", "Visible "),
        )
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(nodes._safe_live_display(
                    raw, secrets=(), approved_source_ids={"ok"},
                ), expected)

    async def test_only_explanation_field_is_public(self):
        async def stream(**kwargs):
            yield content(
                thinking_content="HIDDEN_REASONING_SECRET",
                quiz_answer="QUIZ_ANSWER_SECRET",
                provider_body="RAW_PROVIDER_SECRET",
                warnings=["WARNING_SECRET"],
            )

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(), h.runtime)
            wire = live_json(h.hub)
            for secret in ("HIDDEN_REASONING_SECRET", "QUIZ_ANSWER_SECRET",
                           "RAW_PROVIDER_SECRET", "WARNING_SECRET"):
                self.assertNotIn(secret, wire)
            self.assertIn("Alpha explanation", wire)
            self.assertNotIn("key_takeaways", wire)
            self.assertNotIn("citations", wire)

    async def test_secret_and_unsafe_link_split_across_partials(self):
        async def stream(**kwargs):
            for text in (
                "Safe opening. fixture-secon",
                "Safe opening. fixture-secondary-key More. ht",
                "Safe opening. fixture-secondary-key More. "
                "https://user:password@bad.example/?api_key=SECRET_URL ",
                "Safe opening. fixture-secondary-key More. "
                "https://user:password@bad.example/?api_key=SECRET_URL "
                "[source:unapproved] [click](javascript:alert(1)) ",
            ):
                yield partial_content(content_markdown=text)
            yield content(
                "Safe opening. fixture-secondary-key More. "
                "https://user:password@bad.example/?api_key=SECRET_URL "
                "[source:unapproved] [click](javascript:alert(1)) "
                + "Explanation. " * 30,
            )

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(), h.runtime)
            wire = live_json(h.hub)
            for forbidden in ("fixture-secon", "secondary-key", "https://",
                              "bad.example", "SECRET_URL", "password",
                              "javascript:", "source:unapproved"):
                self.assertNotIn(forbidden, wire)
            self.assertIn("Safe opening", wire)
            self.assertIn("Explanation", wire)

    async def test_title_fields_also_redact_inactive_provider_credentials(self):
        async def stream(**kwargs):
            yield outline(1, "Title fixture-secondary-key")

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            self.assertNotIn("fixture-secondary-key", live_json(h.hub))
            self.assertIn("Title", live_json(h.hub))

    async def test_invalid_final_partials_never_become_saved_artifacts(self):
        calls = 0
        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            yield partial_content(
                content_markdown="Short preview", key_takeaways=[],
            )

        with LiveHarness() as h, fake_instructor(stream):
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertFalse(result["generator_results"][0]["content_ready"])
            self.assertEqual(h.saved, {})
            self.assertEqual(h.ready, set())
            h.artifacts.persist_content_with_citations.assert_not_called()
            self.assertNotIn("topic_explanation_ready", live_json(h.hub))
            self.assertNotIn(("durable", "module_ready"), h.trace)
            self.assertLessEqual(calls, 3)

    async def test_approved_citation_objects_and_claims_are_not_streamed(self):
        from server.schemas.generation import SourceCitation

        async def stream(**kwargs):
            yield content(citations=[SourceCitation(
                source_id="not-approved", claim="UNAPPROVED_CLAIM_SECRET",
            )])

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertNotIn("UNAPPROVED_CLAIM_SECRET", live_json(h.hub))
            persisted = h.artifacts.persist_content_with_citations.call_args
            self.assertEqual(persisted.kwargs["citations"], [])
```

- [ ] Run red:
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_generation_safety -v`.
  Expected: secondary-provider credentials, split link text, and unapproved
  inline markers currently leak from raw explanation projection. Field allowlist
  and invalid-final tests may already pass; keep them as regression guards.
- [ ] Green: implement `_safe_live_display` as a pure helper in `nodes.py`, used
  by both callback adapters. Keep complete raw values for correction detection;
  compare and emit only its safe prefix. The helper's inputs are cumulative text,
  all non-empty LLMContext secret values, and `set(brief.approved_source_ids)` for
  the topic (empty when no brief). Do not serialize context or store secrets in
  output/checkpoints. Extract `api_key`, `openrouter_api_key`,
  `generalcompute_api_key` explicitly using `SecretStr.get_secret_value()` into
  invocation-local data. P1 remains responsible for provider bodies/logging.

  Implement the following deterministic lexical rules, with no provider calls:

```python
def _redact_live_secrets(text: str, secrets: tuple[str, ...]) -> str:
    for secret in sorted(set(secrets), key=len, reverse=True):
        if secret:
            text = text.replace(secret, "[redacted]")
    # A prefix of a secret at the open right edge cannot be published yet.
    hold = 0
    for secret in secrets:
        for size in range(1, min(len(secret), len(text)) + 1):
            if text.endswith(secret[:size]):
                hold = max(hold, size)
    return text[:-hold] if hold else text
```

  Before redaction, find and suppress complete URL/scheme tokens and incomplete
  scheme prefixes at the open right edge (`h`, `ht`, `htt`, `http`, `https`,
  `http:`, `https:`, `http:/`, `https:/`, `javascript`, `data`, `vbscript`, and
  their scheme-prefix forms). Hold incomplete prefixes only at token boundaries;
  ordinary explanation prose must continue streaming immediately. Drop a URL
  destination through the next whitespace or closing Markdown delimiter, even
  while it grows. Do not expose URL credentials or query values before deciding
  a destination is disallowed.

  Scan bracket and angle constructs left-to-right. At an unfinished `[` or `<`,
  return the safe prefix before it until closing syntax arrives. Strip HTML tags,
  Markdown image destinations, link destinations and reference definitions. A
  completed `[source:ID]` is kept only when ID is approved; suppress unapproved
  IDs. Other bracket constructs can conservatively be suppressed in the preview;
  preserve `[redacted]` as a trusted replacement. Suppress complete Markdown link
  constructs rather than exposing unvalidated destinations. The exact final
  explanation comes from the existing validated/sanitized artifact, so the live
  preview need not preserve every unsafe construct's formatting.

  Implement that scan with this exact minimal helper; add `re` to the graph's
  stdlib imports. Keep it private and type its inputs/return. No changes to shared
  sanitizers are permitted.

```python
_LIVE_SCHEMES = (
    "http://", "https://", "javascript:", "data:", "vbscript:",
)
_LIVE_SCHEME_TOKEN = re.compile(r"[a-z][a-z0-9+.-]*:", re.IGNORECASE)


def _safe_live_display(
    text: str, *, secrets: tuple[str, ...],
    approved_source_ids: set[str],
) -> str:
    text = _redact_live_secrets(text, secrets)
    parts: list[str] = []
    index = 0
    while index < len(text):
        char = text[index]
        bracket = index + 1 if text.startswith("![", index) else index
        if text[bracket:bracket + 1] == "[":
            close = text.find("]", bracket + 1)
            if close < 0:
                break
            token = text[bracket:close + 1]
            next_index = close + 1
            if text[next_index:next_index + 1] == "(":
                destination_end = text.find(")", next_index + 1)
                if destination_end < 0:
                    break
                index = destination_end + 1
                continue
            if token == "[redacted]":
                parts.append(token)
            elif token.startswith("[source:"):
                source_id = token[len("[source:"):-1]
                if source_id in approved_source_ids:
                    parts.append(token)
            index = next_index
            continue
        if char == "<":
            close = text.find(">", index + 1)
            if close < 0:
                break
            index = close + 1
            continue
        boundary = index == 0 or not (
            text[index - 1].isalnum() or text[index - 1] in "_-"
        )
        if boundary:
            remaining = text[index:].lower()
            if any(scheme.startswith(remaining) for scheme in _LIVE_SCHEMES):
                break
            if _LIVE_SCHEME_TOKEN.match(text, index):
                # Suppress the entire growing destination, including query.
                while index < len(text) and not text[index].isspace():
                    index += 1
                continue
        parts.append(char)
        index += 1
    return "".join(parts)
```

  Keep inline citations with approved IDs only; citation objects/claims are never
  streamed. A full approved marker is atomic for safety. Ordinary safe prose is
  not sentence-buffered. Final validated artifacts retain their current formatting
  and reconciliation contract; this helper is a preview-only projection.

  If projection unexpectedly replaces previously emitted safe text, raise the
  relevant P3 correction exception and retry/reset that target. Never send a
  deletion as an append delta. `None`, empty projections and repeated safe prefixes
  do not produce events. Title projection has the same credential and unsafe-link
  rules before its 300-character cap. Client P4 still owns rendering safety,
  including incomplete Mermaid/HTML suppression; P3 never executes Markdown.

  Do not copy partial quiz fields or hidden reasoning even when a partial model
  has `extra="allow"`. Existing final citations pass through the current
  approved-source sanitizer before the transactional persistence call.
- [ ] Verify: repeat red command, then
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_generation_safety server.tests.test_live_stream_safety server.tests.test_generator_agent -v`.
- [ ] Commit:
  `git add server/graph/nodes.py server/tests/test_live_generation_safety.py`
  then `git commit -m "fix(streaming): restrict live previews to safe display fields"`.

## Task 7 — Cancellation, resume attempts, callback failure and depth contracts

**Files:** modify `server/agents/planner.py`, `server/agents/generator.py`,
`server/graph/nodes.py`, `server/tests/test_live_outline_streaming.py`,
`server/tests/test_live_topic_streaming.py`. Do not change runner/topology/tests
outside this ownership.

- [ ] Red: append the exact topic lifecycle tests below.

```python
class LiveTopicLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancellation_closes_provider_without_ready_or_retry(self):
        fake = OpenResponse([
            partial_content(content_markdown="Live preview"),
        ], content())
        with LiveHarness() as h, fake_instructor(fake.stream) as (_, sdk, calls):
            task = asyncio.create_task(nodes.generator_node(
                h.worker_state(), h.runtime,
            ))
            await asyncio.wait_for(fake.open.wait(), 1)
            self.assertEqual(len(await h.hub.snapshots("s")), 1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(fake.closed.is_set())
            calls.assert_called_once()
            sdk.close.assert_awaited_once()
            h.artifacts.persist_content_with_citations.assert_not_called()
            h.artifacts.persist_topic_error.assert_not_called()
            self.assertEqual(h.hub.retired, [])
            self.assertEqual(h.events.append_once.call_count, 0)

    async def test_job_cancel_between_chunks_is_not_wrapped_as_failure(self):
        from server.graph.runner import GenerationCancelled

        closed = asyncio.Event()
        async def stream(**kwargs):
            try:
                yield partial_content(content_markdown="Live")
                h.jobs.is_cancel_requested.return_value = True
                yield partial_content(content_markdown="Live next")
            finally:
                closed.set()

        with LiveHarness() as h, fake_instructor(stream) as (_, _, calls):
            with self.assertRaises(GenerationCancelled):
                await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertTrue(closed.is_set())
            calls.assert_called_once()
            h.artifacts.persist_topic_error.assert_not_called()
            self.assertEqual(h.saved, {})

    async def test_resume_replaces_retained_attempt_without_concatenation(self):
        from server.schemas.generation import GenerationStage
        from server.schemas.progress import TopicContentDeltaPayload

        fake = OpenResponse([
            partial_content(content_markdown="Fresh"),
        ], content("Fresh explanation. " * 20))
        with LiveHarness() as h, fake_instructor(fake.stream):
            await h.hub.begin_target(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                target_type="topic", target_id="n0", sequence_index=0,
                attempt=2,
            )
            await h.hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_PREVIEW,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n0", sequence_index=0, attempt=2,
                    text_delta="Interrupted",
                ),
            )
            task = asyncio.create_task(nodes.generator_node(
                h.worker_state(), h.runtime,
            ))
            try:
                await asyncio.wait_for(fake.open.wait(), 1)
                snap = (await h.hub.snapshots("s"))[0]
                self.assertEqual(snap.attempt, 3)
                self.assertEqual(snap.snapshot.text, "Fresh")
                resets = [args for kind, args in h.hub.events
                          if kind == "reset"]
                self.assertEqual(resets[-1]["reason"], "resumed")
            finally:
                await dispose(task)

    async def test_durable_content_skip_makes_no_stream_call(self):
        with LiveHarness() as h, patch.object(
            nodes.generator_agent, "generate_streaming", new_callable=AsyncMock,
        ) as generate:
            h.artifacts.has_durable_content.return_value = True
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertTrue(result["generator_results"][0]["content_ready"])
            generate.assert_not_called()
            self.assertEqual(h.hub.events, [])

    async def test_arbitrary_display_failure_never_retries_provider(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream) as (_, _, calls):
            h.hub.publish = AsyncMock(side_effect=RuntimeError("display failed"))
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            calls.assert_called_once()
            self.assertFalse(result["generator_results"][0]["content_ready"])
            self.assertEqual(h.saved, {})
```

Append these outline tests (Task 1 prefix already imports all required helpers):

```python
class LiveOutlineLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_outline_is_not_persisted(self):
        fake = OpenResponse([
            CourseOutline.model_construct(course_title="Live", topics=None),
        ], outline())
        with LiveHarness() as h, fake_instructor(fake.stream) as (_, _, calls):
            task = asyncio.create_task(nodes.outline_planner_node(
                h.outline_state(), h.runtime,
            ))
            await asyncio.wait_for(fake.open.wait(), 1)
            self.assertEqual(len(await h.hub.snapshots("s")), 1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(fake.closed.is_set())
            calls.assert_called_once()
            h.artifacts.persist_outline.assert_not_called()
            self.assertEqual(h.hub.retired, [])

    async def test_resolved_depth_counts_preserved_with_live_callback(self):
        for mode, count in (("lite", 3), ("full", 10), ("custom", 1),
                            ("custom", 2), ("custom", 30)):
            with self.subTest(mode=mode, count=count):
                async def stream(**kwargs):
                    yield outline(count)
                with fake_instructor(stream):
                    result = await PlannerAgent().plan(
                        "Alpha", mode=mode,
                        custom_topic_count=count if mode == "custom" else None,
                        llm_context=LLMContext(api_key="key", model="model"),
                        on_delta=AsyncMock(), on_attempt_started=AsyncMock(),
                    )
                self.assertEqual(len(result.topics), count)

    async def test_invalid_custom_count_fails_before_any_chargeable_call(self):
        with patch.object(PlannerAgent, "generate_streaming",
                          new_callable=AsyncMock) as generate:
            with self.assertRaises(ValueError):
                await PlannerAgent().plan(
                    "Alpha", mode="custom", custom_topic_count=31,
                    llm_context=LLMContext(api_key="key", model="model"),
                    on_delta=AsyncMock(),
                )
            generate.assert_not_called()

    async def test_replan_cannot_start_above_attempt_five(self):
        from server.agents.planner import ResumablePlannerError

        calls = 0
        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            yield outline(2)

        with fake_instructor(stream):
            with self.assertRaises(ResumablePlannerError):
                await PlannerAgent().plan(
                    "Alpha", mode="custom", custom_topic_count=1,
                    llm_context=LLMContext(api_key="key", model="model"),
                    on_delta=AsyncMock(), initial_attempt=5,
                )
        self.assertEqual(calls, 1)
```

- [ ] Run red:
  `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_topic_streaming.LiveTopicLifecycleTests server.tests.test_live_outline_streaming.LiveOutlineLifecycleTests -v`.
  Expected: between-chunk `GenerationCancelled` is currently wrapped in
  `StreamCallbackError`; missing resume attempt advancement fails if not already
  implemented. Some invariants already pass and remain regression guards.
- [ ] Green: graph `begin` and `update` check `raise_if_cancel_requested` before
  output publication. In both agent relays, catch domain cancellation and express
  it as `asyncio.CancelledError` so P1 preserves cancellation rather than wrapping
  it. To avoid agents importing graph runtime, graph callbacks themselves convert
  `GenerationCancelled` to `CancelledError` with the original cause:

```python
try:
    raise_if_cancel_requested(session_id)
except GenerationCancelled as exc:
    raise asyncio.CancelledError() from exc
```

  Around the graph's agent await, recover that specific cause for the existing
  cancellation contract; arbitrary task cancellation propagates unchanged:

```python
except asyncio.CancelledError as exc:
    if isinstance(exc.__cause__, GenerationCancelled):
        raise exc.__cause__
    raise
```

  Put this before broad `except Exception` in `generator_node`; outline has no
  broad failure conversion. Do not emit generator-failed events for cancellation.
  P1 closes the actual async generator and SDK in `finally`, including when an
  open fixture is cancelled before its completion gate.

  Complete initial-attempt lookup and `resumed` mapping described in the lifecycle
  contract if not implemented earlier. On durable skip, do not reset, publish or
  buy a call. Keep outer callback failures charge-safe. Add the same bounded
  attempt check for generator corrections so transport plus domain retries never
  exceed five. No cancellation wait loop, heartbeat or lock changes are needed.
- [ ] Verify: repeat red command, then all four dedicated suites below.
- [ ] Commit:
  `git add server/agents/planner.py server/agents/generator.py server/graph/nodes.py server/tests/test_live_outline_streaming.py server/tests/test_live_topic_streaming.py`
  then `git commit -m "fix(streaming): preserve cancellation recovery and depth contracts"`.

## Final regression commands and completion gates

Run from `D:/Peter/A2UI`, in PowerShell. Record actual red and green results and
any pre-existing failure separately; never report a skipped/unrun gate as passed.

```powershell
& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_outline_streaming server.tests.test_live_topic_streaming server.tests.test_live_topic_readiness server.tests.test_live_generation_safety -v
& server/.venv/Scripts/python.exe -m unittest server.tests.test_instructor_partial_stream server.tests.test_streaming_agent_boundary server.tests.test_live_stream_safety server.tests.test_live_stream_bounds server.tests.test_live_stream_repository_parity -v
& server/.venv/Scripts/python.exe -m unittest server.tests.test_graph server.tests.test_staged_graph server.tests.test_generation_recovery server.tests.test_partial_failure -v
& server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode server.tests.test_planner_briefs server.tests.test_generator_agent server.tests.test_depth_router server.tests.test_custom_learning_mode_integration server.tests.test_regen server.tests.test_regen_stream -v
& server/.venv/Scripts/python.exe -m unittest
& server/.venv/Scripts/python.exe -m compileall -q server/agents/planner.py server/agents/generator.py server/graph/nodes.py server/tests/test_live_outline_streaming.py server/tests/test_live_topic_streaming.py server/tests/test_live_topic_readiness.py server/tests/test_live_generation_safety.py
git diff --check
```

The graph/staged-graph/recovery/partial-failure command is mandatory per
`docs/CONCERNS.md`, even without a topology change. Parent-owned fixture migration
must land before claiming this regression green. Do not rewrite unrelated
behavior to accommodate a stale test seam.

Server `coverage.py` is not a declared dependency. Use the existing stdlib trace
tool without installing a package:

```powershell
& server/.venv/Scripts/python.exe -m trace --count --summary --coverdir server/.coverage-p3 --module unittest server.tests.test_live_outline_streaming server.tests.test_live_topic_streaming server.tests.test_live_topic_readiness server.tests.test_live_generation_safety
```

Assess changed executable lines in the three owned production modules against
the trace files, recording numerator/denominator; target >80% new-line coverage,
not >80% of each entire pre-existing large module. If uncovered changed lines are
meaningful behavior, add dedicated red/green cases before completion. Never claim
branch coverage from trace. Keep generated coverage files unstaged.

Full-project client checks are the parent's final milestone gate, not P3 client
implementation work:

```powershell
npm --prefix client run test -- --run
npm --prefix client run test:generation:coverage
npm --prefix client run lint
npm --prefix client run build
```

Final inspection must show:

- No modifications to topology, runner, state schemas, concurrency constants,
  heartbeat intervals, locks, preview/batch sizes or research orchestration.
- No draft text, API key or callback stored in checkpoint state/results.
- No database/token writes or complete-response typewriter playback.
- At least two actual broadcaster growth events while planner/generator response
  gates remain closed; concurrent target isolation is proven before completion.
- Only validated artifacts persist; explanation-ready follows its commit;
  module-ready still waits for quizzes; retirement follows durable milestones.
- Callback/retry/replan/cancellation behavior is tested with real P1 iteration and
  final validation rather than an AsyncMock replaying complete responses.

## Traceability

| Acceptance | Owned behavior and proof | Tasks | Research |
| :--- | :--- | :--- | :--- |
| A5 | In-flight course title and ordered topic-title suffixes; final outline persist/milestone; replan clears old rows | 1, 2, 5 | R1, R3, R4, R5 |
| A6 | Topic-target explanations grow before response completion; existing persisted outline skeleton titles remain intact | 3, 4 | R1, R2, R3 |
| A7 | Interleaved workers remain isolated; explanation-ready after content commit; module-ready after quizzes; preview retained meanwhile | 4, 5 | R2, R5, R7 |
| A9 | Lite/Full/Custom exact counts retained; Auto resolution remains upstream; existing search-off and staged routing regression suites | 1, 7 | R2 |
| A11 | Higher attempts reset only affected target; non-prefix replans/corrections; final invalid partials never persist; bounded retry/resume | 2, 3, 4, 6, 7 | R1, R4, R5 |
| A14 | Display-only projection; no thinking/quiz/extra/provider/citation bodies; split secrets and unsafe links withheld; final citation allowlist intact | 6 | R6 |
| A12 (server contribution) | Task and between-chunk job cancellation close source and preserve truthful retained preview without false readiness | 7 | R2, R4 |
| A15 (integration contribution) | All durable writes remain repository facade calls; reuse P1 SQLite/Mongo replay/parity regression | 5, final gates | R3, R4 |

A5's modal close and A6's skeleton rendering are P4-owned consumer effects. P3
provides the truthful incremental and durable signals; it does not claim client
acceptance alone. A9 Auto classification/search budgets, A10 UI recovery cursors,
and A15 complete end-to-end parity remain covered by P1/P2/P4/P5 with P3 regression
protection. There is no deviation from landed P1 contracts; optional domain reset
callbacks are explicitly defined here, while all six shared payloads and provider
interfaces remain unchanged.
