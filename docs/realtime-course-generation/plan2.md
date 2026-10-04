# P2 — Live research synthesis and retrieved-source updates

**Goal:** Publish accepted unique-source counts during retrieval and safe research display text during unfinished provider responses, with validated persistence, attempt resets, and cancellation preserved.

**Architecture:** Keep the existing bounded `ResearchRunner` search/synthesize/finalize loop. Add awaited display callbacks to the researcher’s existing calls; use P1’s process-local broadcaster for drafts and the existing repository facades for authoritative sections and milestones. Each section owns a report/index target; source counts own a separate session target. Drafts never enter graph checkpoints or per-token database writes.

**Tech Stack:** Python 3.10+, asyncio, installed Instructor/Pydantic v2/OpenAI/tenacity foundation, existing SQLite/Mongo repository facades, stdlib unittest and unittest.mock. No new dependencies or stack deviation.

Use the writing-plans output with executing-plans and test-driven-development when implementing. This document is a plan only: the code below has not been applied, and test commands below are implementation instructions, not claims of passing results.

## Authority and ownership

- Approved specification: `docs/realtime-course-generation/goal.md`; DAG and decisions: `state.md` and `research.md` in the same directory. P1’s landed source takes precedence over illustrative names in the research document.
- Read `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/CONVENTIONS.md`, `docs/TESTING.md`, `docs/STRUCTURE.md`, `docs/INTEGRATIONS.md`, and `docs/CONCERNS.md`. Respect detached background jobs, repository facades, secret-free checkpoints, and 80-column Python conventions.
- Modify only `server/agents/researcher.py` and `server/services/research_runner.py`. Create only the dedicated test modules explicitly listed below. Existing tests are read-only regression inputs. No graph, client, schemas, repositories, BaseAgent, InstructorClient, or SSE changes.
- You are not alone in this checkout. Preserve other workers’ changes; stage only assigned paths, serialize commits with the orchestrator, and wait/retry an index lock without removing it.
- Run every command from `D:/Peter/A2UI` in PowerShell. Python command prefix is `& server/.venv/Scripts/python.exe -m`.
- Every new Python test file starts with the mandatory module docstring: exactly 76 `=` characters on separator lines, FILE/LOCATION/PURPOSE/ROLE IN PROJECT/KEY COMPONENTS, then `from __future__ import annotations`. End executable test modules with `if __name__ == "__main__": unittest.main()`. Headers are omitted from snippets to avoid repeating them; their addition is part of each test-write step.
- Keep prompts, source fencing, theme selection, budget reservations, provider rotation, locks, durable milestone dedupe keys, and existing degraded status rules. Do not add a duplicate LLM call for display or a completed-response typewriter.

## Exact landed P1 interfaces

These are existing APIs, not proposed new foundation APIs.

```python
# server/utils/instructor_client.py
@dataclass(frozen=True)
class StructuredStreamUpdate:
    kind: Literal["attempt_started", "partial"]
    attempt: int
    partial: Optional[BaseModel] = None

StreamDeltaCallback = Callable[
    [StructuredStreamUpdate], Awaitable[None]
]

async def InstructorClient.create_partial_structured(
    self, role: str, response_model: Type[T],
    messages: list[dict[str, str]], api_key: str,
    model_override: Optional[str] = None,
    attribution_headers: Optional[dict[str, str]] = None,
    system_prompt: Optional[str] = None,
    provider: AIProviderEnum = AIProviderEnum.OPENROUTER,
    reasoning_params: Optional[dict[str, Any]] = None,
    max_completion_tokens: Optional[int] = None,
    *, on_delta: Optional[StreamDeltaCallback] = None,
    initial_attempt: int = 1, **kwargs: Any,
) -> T: ...

# server/agents/base.py: the researcher calls THIS method.
async def BaseAgent.generate_streaming(
    self, response_model: Type[T], user_message: str,
    context: Optional[dict[str, Any]] = None,
    llm_context: Optional[LLMContext] = None,
    system_prompt_override: Optional[str] = None,
    *, on_delta: Optional[StreamDeltaCallback] = None,
    initial_attempt: int = 1, **kwargs: Any,
) -> T: ...

# server/services/session_event_stream.py
session_live_stream = SessionLiveStreamBroadcaster()

async def SessionLiveStreamBroadcaster.begin_target(
    self, *, session_id: str, job_id: str,
    stage: GenerationStage,
    target_type: Literal["research", "outline", "topic"],
    target_id: str, attempt: int,
    sequence_index: Optional[int] = None,
    reason: Literal[
        "started", "retry", "replan", "correction", "resumed"
    ] = "started",
) -> None: ...

async def SessionLiveStreamBroadcaster.publish(
    self, *, session_id: str, job_id: str,
    stage: GenerationStage, event_type: ProgressEventType,
    payload: BaseModel,
) -> None: ...

async def SessionLiveStreamBroadcaster.retire_target(
    self, *, session_id: str,
    target_type: Literal["research", "outline", "topic"],
    target_id: str, sequence_index: Optional[int] = None,
) -> None: ...
```

For tests the landed broadcaster also has `subscribe(session_id)` as an async context manager yielding an object with `.queue`, and `await snapshots(session_id) -> list[LiveDraftEvent]`.

Use `ResearchSourcesUpdatedPayload(unique_source_count, new_sources_count, provider_id)` and `ResearchTextDeltaPayload(report_id, theme, sequence_index, text_delta, attempt)` from `server/schemas/progress.py`. Count bounds are 0..50, text chunks 1..4000 characters, text index 0..20, and attempts 1..5. The broadcaster generates sequence numbers; producers never set them.

`research_sources_updated` automatically maps to `("research", session_id, None)` and may initialize that target without `begin_target`. Text maps to `("research", report_id, sequence_index)` and requires `begin_target` first. Always use `GenerationStage.RESEARCHING` and the real job ID.

P1 partials are cumulative Pydantic snapshots. Ignore absent/non-string/empty display fields and duplicates. Emit only a suffix of an extending safe display string; split suffixes at 4000 characters. Non-prefix replacement must abandon the incompatible provider attempt and restart through a budgeted domain correction with a higher attempt, rather than concatenating or renumbering provider updates inside one call. `attempt_started` starts the target before text, with `started` for the first call, `retry` for transport retries, and `correction` for an explicit domain correction call.

P1 validates the full final model before return and redacts the selected LLM key in callback copies. Its `_notify` wraps ordinary callback exceptions in `StreamCallbackError` with the original exception in `__cause__`; `asyncio.CancelledError` escapes untouched. Domain cancellation must be recovered from that cause chain. Never change the foundation to accommodate P2.

## File map and call-site decisions

| File | Responsibility |
| --- | --- |
| `server/agents/researcher.py` | Optional `on_delta`/`initial_attempt` on existing synthesis, source-ID correction, and finalization methods; same prompts and validated return types |
| `server/services/research_runner.py` | Accepted-source count updates, safe field projection, target attempts, bounded corrections, cancellation, durable retirement, real production job identity |
| `server/tests/test_live_research_agent.py` | Real P1 partial boundary with controllable unfinished async generator |
| `server/tests/test_live_research_streaming.py` | Source acceptance, in-flight synthesis, correction, persistence ordering, failure/cancel paths |
| `server/tests/test_live_research_projection.py` | Incremental URL/credential guards, suffixes, chunking, field allowlist |
| `server/tests/test_live_research_integration.py` | Actual production composition, real job identity, concurrent sessions, and reserved summary turn |

Exact agent calls to modify in `research_runner.py` (line references are pre-implementation anchors):

1. `ResearchRunner.run`: `await self._agent.synthesize_iteration(...)` around line 536 — add `on_delta` and `initial_attempt`.
2. `ResearchRunner._validate_source_ids`: `await self._agent.correct_source_ids(...)` around line 828 — reuse the same section target with a higher attempt and correction reason.
3. `ResearchRunner._finalize`: `await self._agent.finalize_report(...)` around line 734 — stream **summary only** on target `(report_id, next_section_index)`, fixed theme `summary`.
4. `run_research`: `ResearchRunner(...)` and `runner.run(job_id=f"job-{session_id}", ...)` around lines 1211–1220 — pass ephemeral credentials for redaction and the actual `GenerationJobRecord.id`, not a fabricated identifier.

Leave `self._agent.analyze_query(...)` complete-response only: it produces a private research plan, not the approved synthesis display. Do not stream coverage JSON, queries, source lists, conflicts, limitations, freshness metadata, headers, or reasoning.

The final summary is a separate live display target, not a new durable section. Persist it with the existing `research_store.finalize_report`. There is no report-ready payload in P1: do not invent one or emit a false `research_section_ready`. Retain this summary draft until the existing SSE stage reconciliation/terminal cleanup removes it. Retire **section** targets only after both their validated section and `research_section_ready` are durable. Source-count targets likewise survive until stage reconciliation.

## Task 1 — Enable the researcher’s existing display calls

**Files:** Modify `server/agents/researcher.py`; create `server/tests/test_live_research_agent.py`.

- [ ] Write this exact failing test module after its required header. The async generator stays open after two growing partials, so success cannot come from replaying a complete response.

```python
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server.agents.researcher import ResearcherAgent
from server.schemas.llm import AgentModelConfig, LLMContext
from server.schemas.research import (
    ResearchFinalization, ResearchIteration, ResearchPlan,
)
from server.tests.realtime_foundation_helpers import fake_instructor


class LiveResearchAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_partials_arrive_before_provider_finishes(self):
        entered = asyncio.Event()
        release = asyncio.Event()
        closed = asyncio.Event()
        updates = []
        plan = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q"],
        )

        async def chunks(**kwargs):
            try:
                yield ResearchIteration.model_construct(
                    theme=None, section_markdown="First ",
                )
                yield ResearchIteration.model_construct(
                    theme=None, section_markdown="First evidence. ",
                )
                entered.set()
                await release.wait()
                yield ResearchIteration(
                    theme="fundamentals",
                    section_markdown="First evidence. Final.",
                )
            finally:
                closed.set()

        async def collect(update):
            updates.append(update)

        context = LLMContext(
            api_key="llm-secret",
            agent_models={"researcher": AgentModelConfig(model="r/model")},
        )
        with fake_instructor(chunks) as (_, sdk, partial):
            task = asyncio.create_task(
                ResearcherAgent().synthesize_iteration(
                    query="q", plan=plan, coverage=[],
                    untrusted_source_context="SOURCES BEGIN\nSOURCES END",
                    target_theme="fundamentals", llm_context=context,
                    on_delta=collect, initial_attempt=2,
                )
            )
            try:
                await asyncio.wait_for(entered.wait(), 0.5)
                self.assertFalse(task.done())
                texts = [u.partial.section_markdown for u in updates
                         if u.kind == "partial"]
                self.assertEqual(texts, ["First ", "First evidence. "])
                self.assertEqual(updates[0].kind, "attempt_started")
                self.assertEqual(updates[0].attempt, 2)
                self.assertFalse(closed.is_set())
                release.set()
                result = await asyncio.wait_for(task, 0.5)
                self.assertEqual(result.theme, "fundamentals")
                partial.assert_called_once()
                sdk.close.assert_awaited_once()
            finally:
                release.set()
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def test_correction_and_summary_forward_callback_and_attempt(self):
        agent = ResearcherAgent()
        callback = AsyncMock()
        context = LLMContext(api_key="k", model="m")
        draft = ResearchIteration(theme="fundamentals", section_markdown="x")
        final = ResearchFinalization(summary="s", freshness_note="today")
        with patch.object(
            agent, "generate_streaming", new=AsyncMock(),
        ) as stream, patch.object(agent, "generate", new=AsyncMock()) as old:
            stream.return_value = draft
            self.assertEqual(await agent.correct_source_ids(
                draft, [], context, on_delta=callback, initial_attempt=3,
            ), draft)
            stream.return_value = final
            self.assertEqual(await agent.finalize_report(
                query="q", coverage=[], sections=[], conflicts=[],
                llm_context=context, on_delta=callback, initial_attempt=2,
            ), final)
            self.assertEqual([c.kwargs["initial_attempt"]
                              for c in stream.await_args_list], [3, 2])
            self.assertTrue(all(c.kwargs["on_delta"] is callback
                                for c in stream.await_args_list))
            old.assert_not_awaited()
```

- [ ] Red command: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_agent -v`. Expect an unexpected `on_delta` argument failure (or the open-stream test timeout caused by that task failure), not a network/import error.
- [ ] Minimal implementation: import `StreamDeltaCallback` from `server.utils.instructor_client`. Add keyword-only `on_delta: Optional[StreamDeltaCallback] = None` and `initial_attempt: int = 1` to `synthesize_iteration`, `correct_source_ids`, and `finalize_report`. Preserve positional correction parameters by adding `*` after `llm_context`. Replace each of those methods’ final return block with this pattern, using its existing response model and existing `user_message`:

```python
        if on_delta is None:
            return await self.generate(
                response_model=ResearchIteration,
                user_message=user_message,
                llm_context=llm_context,
            )
        return await self.generate_streaming(
            response_model=ResearchIteration,
            user_message=user_message,
            llm_context=llm_context,
            on_delta=on_delta,
            initial_attempt=initial_attempt,
        )
```

For `finalize_report`, the response model is `ResearchFinalization`. `analyze_query` remains unchanged. The no-callback branch preserves existing direct callers and tests; production runner display calls will always supply a callback.

- [ ] Green and verification: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_agent server.tests.test_researcher_agent server.tests.test_streaming_agent_boundary -v`.
- [ ] Commit: `git add server/agents/researcher.py server/tests/test_live_research_agent.py`; `git commit -m "feat(realtime): enable researcher display streaming callbacks"`.

## Task 2 — Publish only accepted deduplicated source growth

**Files:** Modify `server/services/research_runner.py`; create `server/tests/test_live_research_streaming.py`.

- [ ] Write the following exact fixture and tests. Later tasks add methods to this class; fixture functions remain usable from the integration test module.

```python
import asyncio
import json
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from server.schemas.generation import GenerationStage
from server.schemas.llm import LLMContext
from server.schemas.progress import ProgressEventType
from server.schemas.research import (
    ResearchFinalization, ResearchIteration, ResearchPlan,
)
from server.search.types import (
    NormalizedSearchResult, SearchProviderId, SearchResponse,
)
from server.services.research_runner import ResearchRunner
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.utils.instructor_client import StructuredStreamUpdate


def make_hit(url, text="Evidence", provider=SearchProviderId.TAVILY):
    return NormalizedSearchResult(
        title="Source", url=url, canonical_url=url, content=text,
        retrieved_at=datetime.now(timezone.utc),
        provider_id=provider, provider_rank=1,
    )


def make_fixture(session="session-1", report="report-1"):
    stores = MagicMock()
    stores.research.create_report.return_value = SimpleNamespace(id=report)
    stores.research.get_report.return_value = None
    stores.research.upsert_source.side_effect = lambda **kw: kw["source"]
    stores.research.upsert_section.return_value = SimpleNamespace(id="section")
    stores.jobs.is_cancel_requested.return_value = False
    stores.jobs.get_job.return_value = None
    agent = MagicMock()
    agent.analyze_query = AsyncMock(return_value=ResearchPlan(
        audience="Learner", provisional_concept_count=3,
        initial_queries=["q"],
    ))
    agent.synthesize_iteration = AsyncMock(return_value=ResearchIteration(
        theme="fundamentals", section_markdown="Evidence.",
    ))
    agent.correct_source_ids = AsyncMock(return_value=ResearchIteration(
        theme="fundamentals", section_markdown="Corrected evidence.",
    ))
    agent.finalize_report = AsyncMock(return_value=ResearchFinalization(
        summary="Summary.", freshness_note="today",
    ))
    coordinator = MagicMock()
    coordinator.provider_order = (SearchProviderId.TAVILY,)
    coordinator.search = AsyncMock(return_value=SearchResponse(
        results=[make_hit("https://example.org/a")], response_bytes=10,
    ))
    runner = ResearchRunner(
        agent=agent, research_store=stores.research,
        job_store=stores.jobs, event_store=stores.events,
    )
    args = dict(
        job_id="job-" + session, session_id=session, query="q",
        resolved_mode="lite", coordinator=coordinator,
        llm_context=LLMContext(api_key="llm-secret", model="m"),
    )
    return runner, agent, stores, coordinator, args


async def read_until(subscription, event_type):
    while True:
        event = await asyncio.wait_for(subscription.queue.get(), 0.1)
        if event.event_type == event_type:
            return event


class LiveResearchStreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_sources_grow_before_synthesis_and_remain_unique(self):
        runner, agent, stores, coordinator, args = make_fixture()
        entered = asyncio.Event()
        release = asyncio.Event()
        plan = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q1", "q2"],
        )
        args["existing_plan"] = plan
        first = make_hit("https://example.org/a")
        second = make_hit("https://example.net/b", "Different evidence")
        coordinator.search.side_effect = [
            SearchResponse(results=[first, first], response_bytes=10),
            SearchResponse(results=[first, second], response_bytes=10),
        ]

        async def synthesize(**kwargs):
            entered.set()
            await release.wait()
            return ResearchIteration(theme="fundamentals",
                                     section_markdown="Evidence.")

        agent.synthesize_iteration.side_effect = synthesize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                task = asyncio.create_task(runner.run(**args))
                try:
                    await asyncio.wait_for(entered.wait(), 0.5)
                    one = await read_until(
                        sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                    )
                    two = await read_until(
                        sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                    )
                    self.assertFalse(task.done())
                    self.assertFalse(release.is_set())
                    self.assertEqual(one.payload.unique_source_count, 1)
                    self.assertEqual(two.payload.unique_source_count, 2)
                    self.assertEqual(two.payload.new_sources_count, 1)
                    self.assertEqual(two.payload.provider_id, "tavily")
                    self.assertEqual(json.loads(two.target),
                                     ["research", args["session_id"], None])
                    self.assertEqual(two.job_id, args["job_id"])
                    self.assertEqual(two.stage, GenerationStage.RESEARCHING)
                    stores.research.upsert_section.assert_not_called()
                    release.set()
                    await asyncio.wait_for(task, 0.5)
                finally:
                    release.set()
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_failed_or_unsafe_sources_never_inflate_count(self):
        runner, agent, stores, coordinator, args = make_fixture()
        coordinator.search.return_value = SearchResponse(results=[
            make_hit("https://example.org/a"),
            make_hit("https://example.net/b", "Unstored"),
            make_hit("http://127.0.0.1/private", "Unsafe"),
        ], response_bytes=10)

        def persist(**kwargs):
            if str(kwargs["source"].url).startswith("https://example.net"):
                raise RuntimeError("secret-in-provider-body")
            return kwargs["source"]

        stores.research.upsert_source.side_effect = persist
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                await runner.run(**args)
                event = await read_until(
                    sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                )
                self.assertEqual(event.payload.unique_source_count, 1)
                self.assertEqual(event.payload.new_sources_count, 1)
                self.assertNotIn("secret", event.model_dump_json())

    async def test_source_budget_never_counts_rejected_hits(self):
        from server.search.budget import (
            ResearchBudgetLedger, resolve_research_budget,
        )
        runner, agent, stores, coordinator, args = make_fixture()
        args["existing_plan"] = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q"],
        )
        ledger = ResearchBudgetLedger(resolve_research_budget("lite", 3))
        original_reserve = ledger.reserve_sources

        def reserve_one(count):
            if ledger.usage_snapshot().sources >= 1:
                from server.search.budget import ResearchBudgetExceeded
                raise ResearchBudgetExceeded("sources")
            original_reserve(count)

        args["ledger"] = ledger
        coordinator.search.return_value = SearchResponse(results=[
            make_hit("https://example.org/a", "First"),
            make_hit("https://example.net/b", "Second"),
        ], response_bytes=10)
        hub = SessionLiveStreamBroadcaster()
        with patch.object(ledger, "reserve_sources", side_effect=reserve_one), \
                patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                await runner.run(**args)
                event = await read_until(
                    sub, ProgressEventType.RESEARCH_SOURCES_UPDATED,
                )
                self.assertEqual(event.payload.unique_source_count, 1)
                self.assertEqual(stores.research.upsert_source.call_count, 1)
```

- [ ] Red command: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_streaming -v`. Initially the runner-module broadcaster symbol is missing. Once imported, missing events make the tests fail within the bounded timeout. The source-budget test injects a one-source reservation ceiling while keeping the normal lite-mode ledger; it does not mutate frozen budget constants.
- [ ] Minimal implementation:
  1. Import `session_live_stream`, `GenerationStage`, `ResearchSourcesUpdatedPayload`, `canonicalize_source_url`, and `UnsafeSourceUrl` from their existing modules. Remove `del job_id`.
  2. Immediately after `create_report`, load `research_store.get_report(session_id)` and seed `sources_by_id` from its typed `.sources`, if present. Seed accepted canonical URL and content-hash lookup maps from those actual sources. No fabricated count based on cursor/ledger counters.
  3. Validate each retained hit with the existing URL allowlist before persistence. Reuse an already accepted source ID when either canonical URL or nonempty content identity repeats across responses; include that ID in this batch’s evidence without reserving another unique-source slot. Keep raw result and provider-byte budgets exactly where they are.
  4. Add identities to accepted maps only after `_persist_hit` returns an actual accepted source. Keep failed writes/unsafe URLs/budget-rejected hits out of all accepted maps.
  5. Capture `before = set(sources_by_id)` for each successful search response, then publish after its acceptance loop and before awaiting synthesis. Publish on actual growth; duplicate-only batches do not manufacture a new count event. Use the new sources’ provider enum value when they share one provider; otherwise `None`.

```python
                    added_ids = set(sources_by_id) - before
                    if added_ids:
                        self._ensure_not_cancelled(session_id)
                        providers = {
                            sources_by_id[sid].provider_id.value
                            for sid in added_ids
                        }
                        await session_live_stream.publish(
                            session_id=session_id,
                            job_id=job_id,
                            stage=GenerationStage.RESEARCHING,
                            event_type=(
                                ProgressEventType.RESEARCH_SOURCES_UPDATED
                            ),
                            payload=ResearchSourcesUpdatedPayload(
                                unique_source_count=len(sources_by_id),
                                new_sources_count=len(added_ids),
                                provider_id=(
                                    next(iter(providers))
                                    if len(providers) == 1 else None
                                ),
                            ),
                        )
```

Use the existing real store’s `upsert_source` return ID, not its input UUID. Keep `deduplicate_results` for per-response normalization. Deduplicate `batch_source_ids` before constructing untrusted context. Do not send URLs, titles, excerpts, raw bodies, or credentials in count payloads.

- [ ] Green/verification: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_streaming server.tests.test_research_runner server.tests.test_source_safety server.tests.test_research_budget -v`.
- [ ] Commit: `git add server/services/research_runner.py server/tests/test_live_research_streaming.py`; `git commit -m "feat(realtime): publish accepted unique research source counts"`.

## Task 3 — Project safe cumulative partials and wire live synthesis

**Files:** Modify `server/services/research_runner.py`; create `server/tests/test_live_research_projection.py`; extend `server/tests/test_live_research_streaming.py`.

- [ ] Add these exact tests to `LiveResearchStreamingTests`. The fake is an async generator, not a list replayed after a final response. It stays open after both deltas.

```python
    async def test_two_text_updates_while_synthesis_response_is_open(self):
        runner, agent, stores, coordinator, args = make_fixture()
        open_response = asyncio.Event()
        release = asyncio.Event()
        closed = asyncio.Event()

        async def chunks():
            try:
                yield ResearchIteration.model_construct(
                    section_markdown="First ",
                )
                yield ResearchIteration.model_construct(
                    section_markdown="First evidence. ",
                )
                open_response.set()
                await release.wait()
                yield ResearchIteration(
                    theme="fundamentals",
                    section_markdown="First evidence. Final.",
                )
            finally:
                closed.set()

        async def synthesize(**kwargs):
            callback = kwargs["on_delta"]
            attempt = kwargs["initial_attempt"]
            await callback(StructuredStreamUpdate("attempt_started", attempt))
            async for value in chunks():
                await callback(StructuredStreamUpdate("partial", attempt, value))
                last = value
            return ResearchIteration.model_validate(last.model_dump())

        agent.synthesize_iteration.side_effect = synthesize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                task = asyncio.create_task(runner.run(**args))
                try:
                    await asyncio.wait_for(open_response.wait(), 0.5)
                    first = await read_until(sub,
                                            ProgressEventType.RESEARCH_TEXT_DELTA)
                    second = await read_until(sub,
                                             ProgressEventType.RESEARCH_TEXT_DELTA)
                    self.assertEqual(first.payload.text_delta, "First ")
                    self.assertEqual(second.payload.text_delta, "evidence. ")
                    self.assertFalse(task.done())
                    self.assertFalse(closed.is_set())
                    self.assertEqual(first.payload.attempt, 1)
                    self.assertEqual(json.loads(first.target),
                                     ["research", "report-1", 0])
                    stores.research.upsert_section.assert_not_called()
                    self.assertFalse(any(
                        c.kwargs["event_type"]
                        == ProgressEventType.RESEARCH_SECTION_READY
                        for c in stores.events.append_once.call_args_list
                    ))
                    release.set()
                    await asyncio.wait_for(task, 0.5)
                    stores.research.upsert_section.assert_called_once()
                    saved = stores.research.upsert_section.call_args.kwargs
                    self.assertEqual(saved["markdown"],
                                     "First evidence. Final.")
                finally:
                    release.set()
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_retire_occurs_after_section_and_durable_ready(self):
        runner, agent, stores, coordinator, args = make_fixture()
        hub = SessionLiveStreamBroadcaster()
        order = []
        stores.research.upsert_section.side_effect = lambda **kw: (
            order.append("section") or SimpleNamespace(id="section")
        )

        def ready(**kwargs):
            if kwargs["event_type"] == ProgressEventType.RESEARCH_SECTION_READY:
                order.append("ready")

        stores.events.append_once.side_effect = ready
        original = hub.retire_target

        async def retire(**kwargs):
            order.append("retire")
            await original(**kwargs)

        with patch("server.services.research_runner.session_live_stream", hub), \
                patch.object(hub, "retire_target", side_effect=retire):
            await runner.run(**args)
        self.assertEqual(order, ["section", "ready", "retire"])
```

Write this exact projection-test file after its header. `_ResearchTextDisplay` and `_ResearchDraftCorrection` are **new P2-private helpers**, defined by this task in the owned runner file. They are not purported P1 APIs.

```python
import unittest
from unittest.mock import AsyncMock

from server.schemas.research import ResearchIteration
from server.services.research_runner import (
    _ResearchDraftCorrection, _ResearchTextDisplay,
)
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.utils.instructor_client import StructuredStreamUpdate


class ResearchProjectionTests(unittest.IsolatedAsyncioTestCase):
    def make_display(self, secrets=()):
        hub = SessionLiveStreamBroadcaster()
        display = _ResearchTextDisplay(
            hub=hub, session_id="s", job_id="j", report_id="r",
            sequence_index=0, theme="fundamentals",
            field_name="section_markdown", allowed_ids={"known"},
            secrets=secrets, check_cancelled=lambda: None,
        )
        return display, hub

    async def send(self, display, text, attempt=1):
        await display.on_delta(StructuredStreamUpdate(
            "partial", attempt,
            ResearchIteration.model_construct(section_markdown=text),
        ))

    async def test_suffix_empty_duplicate_and_chunk_bound(self):
        display, hub = self.make_display()
        with unittest.mock.patch.object(
            hub, "publish", wraps=hub.publish,
        ) as publish:
            await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
            for text in (None, "", "A", "A", "A" + "x" * 9000):
                await self.send(display, text)
            chunks = [c.kwargs["payload"].text_delta
                      for c in publish.await_args_list]
            self.assertEqual("".join(chunks), "A" + "x" * 9000)
            self.assertTrue(all(0 < len(c) <= 4000 for c in chunks))

    async def test_nonprefix_requires_domain_correction_not_concat(self):
        display, hub = self.make_display()
        await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
        await self.send(display, "Original ")
        with self.assertRaises(_ResearchDraftCorrection):
            await self.send(display, "Replacement ")
        snapshot = (await hub.snapshots("s"))[0]
        self.assertEqual(snapshot.snapshot.text, "Original ")

    async def test_fragmented_links_and_credentials_are_never_published(self):
        display, hub = self.make_display(("tvly-private-key", "gc-private-key"))
        await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
        partials = [
            "Evidence ht", "Evidence https://evil.example/key",
            "Evidence https://evil.example/key safe ",
            "Evidence https://evil.example/key safe [link](http://127.0",
            "Evidence https://evil.example/key safe [link](http://127.0.0.1) ",
        ]
        base = partials[-1]
        partials.extend([base + "tvly-pr", base + "tvly-private-key ",
                         base + "tvly-private-key gc-private-key "])
        with unittest.mock.patch.object(
            hub, "publish", wraps=hub.publish,
        ) as publish:
            for text in partials:
                await self.send(display, text)
                snapshot = (await hub.snapshots("s"))[0].snapshot.text
                for forbidden in ("http", "127.0", "evil.example",
                                  "tvly-pr", "gc-private-key"):
                    self.assertNotIn(forbidden, snapshot)
            wire = "".join(c.kwargs["payload"].text_delta
                           for c in publish.await_args_list)
            self.assertIn("Evidence", wire)
            self.assertIn("[redacted]", wire)

    async def test_only_approved_display_field_is_selected(self):
        display, hub = self.make_display()
        await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
        partial = ResearchIteration.model_construct(
            section_markdown="Safe evidence. ", theme="attacker-secret",
            conflicts=["provider-body-secret"],
            follow_up_queries=["hidden-reasoning-secret"],
            source_ids=["unknown-secret"],
        )
        await display.on_delta(StructuredStreamUpdate("partial", 1, partial))
        wire = (await hub.snapshots("s"))[0].model_dump_json()
        self.assertIn("Safe evidence", wire)
        self.assertNotIn("secret", wire)
```

- [ ] Red command: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_projection server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_two_text_updates_while_synthesis_response_is_open server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_retire_occurs_after_section_and_durable_ready -v`. Expect missing P2 helpers and missing `on_delta` forwarding/retirement.
- [ ] Minimal implementation: add the following small private dataclass in the runner, importing `Callable`, `BaseModel`, `SessionLiveStreamBroadcaster`, and `StructuredStreamUpdate` from their existing modules. Define `_ResearchDraftCorrection(RuntimeError)` with a fixed message, not partial text.

```python
@dataclass
class _ResearchTextDisplay:
    hub: SessionLiveStreamBroadcaster
    session_id: str
    job_id: str
    report_id: str
    sequence_index: int
    theme: str
    field_name: str
    allowed_ids: set[str]
    secrets: Sequence[str] = field(repr=False)
    check_cancelled: Callable[[], None] = field(repr=False)
    start_reason: str = "started"
    attempt: int = 0
    previous_raw: str = field(default="", repr=False)
    previous_display: str = field(default="", repr=False)
    stopped: bool = False

    def __post_init__(self) -> None:
        if self.field_name not in {"section_markdown", "summary"}:
            raise ValueError("Research display field is not allowed")
```

Implement these two callback branches and suffix publisher:

```python
    async def on_delta(self, update: StructuredStreamUpdate) -> None:
        self.check_cancelled()
        if self.stopped:
            return
        if update.kind == "attempt_started":
            reason = self.start_reason if not self.attempt else "retry"
            self.attempt = update.attempt
            self.previous_raw = ""
            self.previous_display = ""
            await self.hub.begin_target(
                session_id=self.session_id, job_id=self.job_id,
                stage=GenerationStage.RESEARCHING,
                target_type="research", target_id=self.report_id,
                sequence_index=self.sequence_index,
                attempt=self.attempt, reason=reason,
            )
            return
        if update.attempt != self.attempt or update.partial is None:
            return
        raw = getattr(update.partial, self.field_name, None)
        if not isinstance(raw, str) or not raw:
            return
        if not raw.startswith(self.previous_raw):
            raise _ResearchDraftCorrection("Research display correction")
        self.previous_raw = raw
        safe = self._safe_display(raw, final=False)
        await self._publish_extension(safe)

    async def _publish_extension(self, safe: str) -> None:
        if not safe.startswith(self.previous_display):
            raise _ResearchDraftCorrection("Research display correction")
        suffix = safe[len(self.previous_display):]
        for offset in range(0, len(suffix), 4000):
            self.check_cancelled()
            await self.hub.publish(
                session_id=self.session_id, job_id=self.job_id,
                stage=GenerationStage.RESEARCHING,
                event_type=ProgressEventType.RESEARCH_TEXT_DELTA,
                payload=ResearchTextDeltaPayload(
                    report_id=self.report_id, theme=self.theme,
                    sequence_index=self.sequence_index,
                    text_delta=suffix[offset:offset + 4000],
                    attempt=self.attempt,
                ),
            )
        self.previous_display = safe
```

`_safe_display(raw, final)` is incremental, not a regex run on each independent suffix. Apply the following ordered operations to the **cumulative** string:

1. Redact exact nonempty runtime secret values with `[redacted]`. On non-final snapshots withhold the longest trailing proper prefix of any secret before publishing; otherwise a fragmented key would escape before redaction could recognize it.
2. Withhold the longest trailing proper prefix of `http://` or `https://`. Remove active raw URL spans completely with the existing sanitizer; never publish a pending URL span. URLs in this display are always removed, including approved source URLs; source IDs supply citations.
3. For Markdown, withhold an unmatched `[` construct until its `]`/destination is resolved. Strip link destinations for **all schemes**, including javascript/data, leaving the label. Retain only `[src: id]`/`[source: id]` markers whose ID is in the accepted source set. Drop unknown IDs. This also prevents fragments of a disallowed link leaking before `sanitize_section_markdown` recognizes a closed link.
4. Call existing `sanitize_section_markdown` on the safe cumulative text. Avoid changing the existing saved-section sanitization contract in unrelated paths.
5. Ordinary display text is emitted immediately, without waiting for whitespace, a sentence, or response completion. Only ambiguous URL/link/secret suffixes are withheld. On validated completion, `finish(model)` calls `_safe_display(..., final=True)` and `_publish_extension`; unresolved dangerous constructs are dropped rather than flushed raw. If `attempt == 0` (legacy AsyncMock returned without callbacks), `finish` does nothing: do not manufacture streaming by publishing the final response.

The minimal safe-display implementation is below. Add `_DISPLAY_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]*\)")` and `_DISPLAY_RAW_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)` next to the existing regex constants. Keep the private raw field repr-excluded and cap snapshots at the existing model's 20,000-character display bound.

```python
    def _safe_display(self, raw: str, *, final: bool) -> str:
        text = raw
        for secret in self.secrets:
            text = text.replace(secret, "[redacted]")
        if not final:
            guarded = self.secrets
            withheld = max((
                length
                for value in guarded
                for length in range(1, len(value))
                if text.endswith(value[:length])
            ), default=0)
            if withheld:
                text = text[:-withheld]
            url_prefix = max((
                length for value in ("http://", "https://")
                for length in range(1, len(value))
                if text.lower().endswith(value[:length])
            ), default=0)
            if url_prefix:
                text = text[:-url_prefix]
        # An incomplete bracket/destination must not become public syntax.
        # Resolve complete links first so their opening '[' does not linger.
        text = _DISPLAY_LINK_RE.sub(r"\1", text)
        opened = text.rfind("[")
        closed = text.rfind("]")
        if opened > closed:
            text = text[:opened]
        elif opened >= 0 and text[closed + 1:].startswith("("):
            text = text[:opened]
        text = _DISPLAY_RAW_URL_RE.sub("", text)
        return sanitize_section_markdown(text, allowed_ids=self.allowed_ids)

    async def finish(self, model: BaseModel) -> None:
        if not self.attempt or self.stopped:
            return
        self.check_cancelled()
        raw = getattr(model, self.field_name, None)
        if isinstance(raw, str) and raw:
            await self._publish_extension(self._safe_display(raw, final=True))

    def new_correction(self) -> "_ResearchTextDisplay":
        return _ResearchTextDisplay(
            hub=self.hub, session_id=self.session_id, job_id=self.job_id,
            report_id=self.report_id, sequence_index=self.sequence_index,
            theme=self.theme, field_name=self.field_name,
            allowed_ids=self.allowed_ids, secrets=self.secrets,
            check_cancelled=self.check_cancelled,
            start_reason="correction",
        )
```

Unknown source markers can make the sanitized snapshot shrink when their closing bracket arrives. Treat that as the same bounded correction, never append a replacement. Exact selected-key redaction performed by P1 can also revise a raw cumulative callback copy: the same correction path remains safe. Do not attempt to undo P1 redaction.

Require `field_name` to be one of `section_markdown` and `summary`; use trusted runner-selected theme (`target_theme` or fixed `research`), never partial `.theme`. Runtime secrets are private, repr-excluded, and never serialized. Task 6 adds search-key composition; P1 already protects the selected model key, but this projector must also guard other runtime secrets.

Construct one display before the synthesis call and forward it:

```python
                display = _ResearchTextDisplay(
                    hub=session_live_stream,
                    session_id=session_id, job_id=job_id,
                    report_id=report_id,
                    sequence_index=next_section_index,
                    theme=target_theme or "research",
                    field_name="section_markdown",
                    allowed_ids=set(sources_by_id),
                    secrets=self._display_secrets,
                    check_cancelled=lambda: self._ensure_not_cancelled(
                        session_id
                    ),
                )
```

Add `on_delta=display.on_delta, initial_attempt=1` to the existing synthesis call. Initialize `self._display_secrets` to an empty tuple in `__init__` for now. Check cancellation after the validated return, call `display.finish(draft)` before any section write, and recheck cancellation. After `upsert_section` and successful `append_once(RESEARCH_SECTION_READY, ...)`, call `await session_live_stream.retire_target(session_id=session_id, target_type="research", target_id=report_id, sequence_index=next_section_index)`. Task 4 adds the bounded correction handling around all correction-capable final flushing.

- [ ] Green/verification: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_projection server.tests.test_live_research_streaming server.tests.test_live_research_agent -v`.
- [ ] Commit: `git add server/services/research_runner.py server/tests/test_live_research_projection.py server/tests/test_live_research_streaming.py`; `git commit -m "feat(realtime): stream safe research synthesis display deltas"`.

## Task 4 — Reset bounded corrections and protect readiness

**Files:** Modify `server/services/research_runner.py`; extend `server/tests/test_live_research_streaming.py`.

- [ ] Add these exact failing tests to `LiveResearchStreamingTests`.

```python
    async def test_nonprefix_correction_restarts_only_affected_target(self):
        runner, agent, stores, coordinator, args = make_fixture()

        async def synthesize(**kwargs):
            cb, attempt = kwargs["on_delta"], kwargs["initial_attempt"]
            await cb(StructuredStreamUpdate("attempt_started", attempt))
            text = "Original " if attempt == 1 else "Corrected evidence. "
            await cb(StructuredStreamUpdate("partial", attempt,
                ResearchIteration.model_construct(section_markdown=text)))
            if attempt == 1:
                await cb(StructuredStreamUpdate("partial", attempt,
                    ResearchIteration.model_construct(
                        section_markdown="Replacement ")))
            return ResearchIteration(theme="fundamentals",
                                     section_markdown=text)

        agent.synthesize_iteration.side_effect = synthesize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                await runner.run(**args)
                resets = []
                texts = []
                while not sub.queue.empty():
                    event = sub.queue.get_nowait()
                    if event.event_type == ProgressEventType.TARGET_DRAFT_RESET:
                        resets.append(event.payload)
                    if event.event_type == ProgressEventType.RESEARCH_TEXT_DELTA:
                        texts.append(event.payload)
                section_resets = [r for r in resets if r.sequence_index == 0]
                self.assertEqual([(r.attempt, r.reason)
                                  for r in section_resets],
                                 [(1, "started"), (2, "correction")])
                self.assertEqual("".join(p.text_delta for p in texts
                                        if p.attempt == 2),
                                 "Corrected evidence. ")
                self.assertEqual(agent.synthesize_iteration.await_count, 2)
                stores.research.upsert_section.assert_called_once()

    async def test_source_id_correction_streams_same_target_new_attempt(self):
        runner, agent, stores, coordinator, args = make_fixture()

        async def synthesize(**kwargs):
            cb = kwargs["on_delta"]
            await cb(StructuredStreamUpdate("attempt_started", 1))
            draft = ResearchIteration(theme="fundamentals",
                                      section_markdown="Old ",
                                      source_ids=["unknown"])
            await cb(StructuredStreamUpdate("partial", 1, draft))
            return draft

        async def correct(**kwargs):
            cb, attempt = kwargs["on_delta"], kwargs["initial_attempt"]
            await cb(StructuredStreamUpdate("attempt_started", attempt))
            draft = ResearchIteration(theme="fundamentals",
                                      section_markdown="Grounded ",
                                      source_ids=kwargs["allowed_source_ids"])
            await cb(StructuredStreamUpdate("partial", attempt, draft))
            return draft

        agent.synthesize_iteration.side_effect = synthesize
        agent.correct_source_ids.side_effect = correct
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                await runner.run(**args)
                events = []
                while not sub.queue.empty():
                    events.append(sub.queue.get_nowait())
                resets = [e.payload for e in events
                          if e.event_type == ProgressEventType.TARGET_DRAFT_RESET
                          and e.payload.sequence_index == 0]
                self.assertEqual([(r.attempt, r.reason) for r in resets],
                                 [(1, "started"), (2, "correction")])
                self.assertEqual(agent.correct_source_ids.await_args.kwargs[
                    "initial_attempt"], 2)
                saved = stores.research.upsert_section.call_args.kwargs
                self.assertNotIn("unknown", saved["source_ids"])
                self.assertEqual(saved["markdown"], "Grounded ")

    async def test_invalid_final_model_never_saves_or_retires_section(self):
        runner, agent, stores, coordinator, args = make_fixture()

        async def invalid(**kwargs):
            cb = kwargs["on_delta"]
            await cb(StructuredStreamUpdate("attempt_started", 1))
            await cb(StructuredStreamUpdate("partial", 1,
                ResearchIteration.model_construct(section_markdown="Preview ")))
            return ResearchIteration.model_validate({"section_markdown": "x"})

        agent.synthesize_iteration.side_effect = invalid
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub), \
                patch.object(hub, "retire_target", new=AsyncMock()) as retire:
            with self.assertRaises(ValueError):
                await runner.run(**args)
            stores.research.upsert_section.assert_not_called()
            retire.assert_not_awaited()
            self.assertFalse(any(
                c.kwargs["event_type"] == ProgressEventType.RESEARCH_SECTION_READY
                for c in stores.events.append_once.call_args_list
            ))

    async def test_transport_retry_resets_section_without_resetting_counts(self):
        runner, agent, stores, coordinator, args = make_fixture()

        async def synthesize(**kwargs):
            cb = kwargs["on_delta"]
            for attempt, text in ((1, "Old "), (2, "Retry evidence. ")):
                await cb(StructuredStreamUpdate("attempt_started", attempt))
                await cb(StructuredStreamUpdate("partial", attempt,
                    ResearchIteration.model_construct(section_markdown=text)))
            return ResearchIteration(theme="fundamentals",
                                     section_markdown="Retry evidence. ")

        agent.synthesize_iteration.side_effect = synthesize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                await runner.run(**args)
                events = []
                while not sub.queue.empty():
                    events.append(sub.queue.get_nowait())
                resets = [e.payload for e in events
                          if e.event_type == ProgressEventType.TARGET_DRAFT_RESET]
                self.assertEqual([(r.attempt, r.reason) for r in resets],
                                 [(1, "started"), (2, "retry")])
                drafts = await hub.snapshots(args["session_id"])
                counts = [e.snapshot.unique_source_count for e in drafts
                          if e.snapshot.unique_source_count is not None]
                self.assertEqual(counts, [1])
                stores.research.upsert_section.assert_called_once()
```

- [ ] Red command: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_nonprefix_correction_restarts_only_affected_target server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_source_id_correction_streams_same_target_new_attempt server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_invalid_final_model_never_saves_or_retires_section -v`. The first two fail until correction loops and callback forwarding exist; the invalid-final assertion is a protection test that may already pass.
- [ ] Minimal implementation:
  1. Preserve P1’s provider attempt numbering. Catch `_ResearchDraftCorrection` directly in doubles or as the cause of `StreamCallbackError` in real calls. Recreate a display for the same target, `start_reason="correction"`, and pass `initial_attempt=last_display.attempt + 1`. Reserve **one additional LLM turn** before every new domain call, and stop at attempt 5 or exhausted ledger. Do not change provider rotation/search loops or use an unbounded retry.
  2. Keep the first synthesis reservation at its existing location. The correction loop wraps only synthesis; it does not repeat retrieval or duplicate accepted-source count events.

```python
                while True:
                    try:
                        draft = await self._agent.synthesize_iteration(
                            query=query, plan=plan, coverage=coverage,
                            untrusted_source_context=untrusted,
                            llm_context=llm_context,
                            target_theme=target_theme,
                            budget_context=budget_context,
                            uncovered_themes=uncovered,
                            on_delta=display.on_delta,
                            initial_attempt=initial_attempt,
                        )
                        break
                    except Exception as exc:
                        cause = _stream_failure_cause(exc)
                        if not isinstance(cause, _ResearchDraftCorrection):
                            raise
                        if display.attempt >= 5:
                            raise ValueError(
                                "Research streaming correction limit"
                            ) from None
                        ledger.reserve_llm_turn()
                        initial_attempt = display.attempt + 1
                        display = display.new_correction()
                        budget_context = format_budget_for_prompt(
                            ledger.remaining_snapshot()
                        )
```

Define `_stream_failure_cause(exc)` to unwrap only `StreamCallbackError` cause links, without parsing exception strings. Define `display.new_correction()` to construct the same private helper parameters with `start_reason="correction"`; never reset another index or the source-count target. Set `initial_attempt = 1` before the loop. If actual final model validation fails, keep the existing graph warning path; do not turn invalid partials into a ready section.

  3. Add the required private keyword argument `display: _ResearchTextDisplay` to `_validate_source_ids`, and change its return type to `tuple[ResearchIteration, _ResearchTextDisplay]`. Update its one `run` caller to `draft, display = await self._validate_source_ids(...)`. Existing code search shows no direct test callers; the public runner API remains unchanged. All existing successful/drop-ID returns now return `(draft, display)` or `(corrected, display)`. When invalid IDs trigger the existing permitted correction turn, retain the previous attempt, create a new correction display, and use the following call block in place of its existing call:

```python
                next_attempt = display.attempt + 1
                display = display.new_correction()
                corrected = await self._agent.correct_source_ids(
                    draft=draft,
                    allowed_source_ids=sorted(allowed_ids),
                    llm_context=llm_context,
                    on_delta=display.on_delta,
                    initial_attempt=next_attempt,
                )
```

If no callback occurred in a legacy double, `display.attempt == 0` gives first actual display attempt 1. Do not leave the caller finishing the abandoned original display object.
  4. Source correction still uses the existing allowlist and ledger. If no turn/attempt remains, retain the existing drop-invalid-ID warning behavior; do not invent an extra chargeable call. Cancel exceptions escape the correction catch (Task 5), while unexpected correction failures use the existing fixed `invalid_source_ids` warning and safe class-only logging. Set the failed correction display’s `stopped=True` before falling back to the original validated draft with dropped IDs; do not flush or pretend to stream that completed fallback. Its validated saved section and ready milestone reconcile the preview.
  5. After allowlist correction, force the trusted target theme again, sanitize the authoritative markdown as today, call `display.finish(draft)` **before** either durable write, and check cancellation. A finishing non-prefix change uses the same bounded correction mechanism. Then write the section, write the ready milestone, and retire. If the milestone write fails, leave the draft retained and propagate failure; do not retire in `finally`.

- [ ] Green/verification: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_streaming server.tests.test_live_research_projection server.tests.test_research_runner server.tests.test_instructor_partial_stream -v`.
- [ ] Commit: `git add server/services/research_runner.py server/tests/test_live_research_streaming.py`; `git commit -m "fix(realtime): reset research corrections before validated readiness"`.

## Task 5 — Propagate cancellation and stop on truthful failure

**Files:** Modify `server/services/research_runner.py`; extend `server/tests/test_live_research_streaming.py`.

- [ ] Add these exact tests to `LiveResearchStreamingTests`.

```python
    async def test_callback_cancel_is_unwrapped_and_never_degraded(self):
        from server.services.research_runner import ResearchCancelled
        from server.utils.instructor_client import StreamCallbackError

        runner, agent, stores, coordinator, args = make_fixture()

        async def synthesize(**kwargs):
            cb = kwargs["on_delta"]
            await cb(StructuredStreamUpdate("attempt_started", 1))
            stores.jobs.is_cancel_requested.return_value = True
            try:
                await cb(StructuredStreamUpdate("partial", 1,
                    ResearchIteration.model_construct(
                        section_markdown="Must never publish")))
            except ResearchCancelled as exc:
                raise StreamCallbackError("Streaming display callback failed") \
                    from exc

        agent.synthesize_iteration.side_effect = synthesize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            with self.assertRaises(ResearchCancelled):
                await runner.run(**args)
            drafts = await hub.snapshots(args["session_id"])
            self.assertTrue(all(not e.snapshot.text for e in drafts))
            stores.research.mark_degraded.assert_not_called()
            stores.research.upsert_section.assert_not_called()
            agent.finalize_report.assert_not_awaited()
            stores.jobs.update_cursor.assert_called()

    async def test_domain_cancel_escapes_correction_and_finalization(self):
        from server.graph.runner import GenerationCancelled
        from server.services.research_runner import ResearchCancelled

        for method in ("correct_source_ids", "finalize_report"):
            for error in (ResearchCancelled("cancel"),
                          GenerationCancelled("session-1")):
                with self.subTest(method=method, error=type(error).__name__):
                    runner, agent, stores, coordinator, args = make_fixture()
                    agent.synthesize_iteration.return_value = ResearchIteration(
                        theme="fundamentals", section_markdown="Evidence",
                        source_ids=["unknown"] if method == "correct_source_ids"
                        else [],
                    )
                    getattr(agent, method).side_effect = error
                    hub = SessionLiveStreamBroadcaster()
                    with patch(
                        "server.services.research_runner.session_live_stream", hub,
                    ):
                        with self.assertRaises(type(error)):
                            await runner.run(**args)
                    if method == "correct_source_ids":
                        stores.research.upsert_section.assert_not_called()
                    stores.research.finalize_report.assert_not_called()
                    warnings = [c.kwargs["payload"].warning.code
                                for c in stores.events.append_once.call_args_list
                                if c.kwargs["event_type"]
                                == ProgressEventType.RESEARCH_DEGRADED]
                    # Insufficient coverage was recorded before finalization;
                    # cancellation must not add a streaming/fallback warning.
                    self.assertTrue(all(code == "research_incomplete"
                                        for code in warnings))

    async def test_unexpected_stream_failure_has_safe_warning_no_ready(self):
        runner, agent, stores, coordinator, args = make_fixture()
        agent.synthesize_iteration.side_effect = RuntimeError(
            "provider response Authorization: secret-in-body"
        )
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            with self.assertLogs("server.services.research_runner", "WARNING") \
                    as logs:
                with self.assertRaises(RuntimeError):
                    await runner.run(**args)
            wire = json.dumps([c.kwargs["payload"].model_dump(mode="json")
                               for c in stores.events.append_once.call_args_list])
            self.assertIn("research_stream_unavailable", wire)
            self.assertNotIn("secret-in-body", wire)
            self.assertNotIn("secret-in-body", " ".join(logs.output))
            stores.research.upsert_section.assert_not_called()

    async def test_finalization_failure_keeps_fixed_safe_fallback(self):
        runner, agent, stores, coordinator, args = make_fixture()
        agent.finalize_report.side_effect = RuntimeError("unsafe-key-body")
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            outcome = await runner.run(**args)
        self.assertTrue(outcome.report_id)
        saved = stores.research.finalize_report.call_args.kwargs
        self.assertEqual(saved["summary"],
                         "Research ended with limited synthesis.")
        wire = json.dumps([c.kwargs["payload"].model_dump(mode="json")
                           for c in stores.events.append_once.call_args_list])
        self.assertIn("research_stream_unavailable", wire)
        self.assertNotIn("unsafe-key-body", wire)
```

- [ ] Red command: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_callback_cancel_is_unwrapped_and_never_degraded server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_domain_cancel_escapes_correction_and_finalization server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_unexpected_stream_failure_has_safe_warning_no_ready server.tests.test_live_research_streaming.LiveResearchStreamingTests.test_finalization_failure_keeps_fixed_safe_fallback -v`. Expect swallowed cancellation in existing correction/finalization catches and missing safe warnings.
- [ ] Minimal implementation:
  1. Import `GenerationCancelled` from `server.graph.runner` (that module has no top-level import of research_runner). Make every new callback call `_ensure_not_cancelled` before begin/publish and before durable commits. Continue honoring the lock passed to existing cursor updates.
  2. Normalize callback cancellation where an agent call is awaited: catch an ordinary exception, use `_stream_failure_cause`, and re-raise the original `ResearchCancelled` or `GenerationCancelled` cause unchanged. `asyncio.CancelledError` must propagate unchanged and never enter an ordinary `except Exception` fallback.
  3. Extend the existing runner cancellation handler to `(ResearchCancelled, GenerationCancelled)` and persist the same research cursor before re-raising. Change `_validate_source_ids` and `_finalize` to re-raise those domain types before their broad fallback catches. When a wrapper hides cancellation, unwrap and re-raise first.

```python
        except (ResearchCancelled, GenerationCancelled):
            raise
        except Exception as exc:
            cause = _stream_failure_cause(exc)
            if isinstance(cause, (ResearchCancelled, GenerationCancelled)):
                raise cause
            logger.warning(
                "Research streaming unavailable (%s)", type(cause).__name__
            )
            warning = GenerationWarning(
                code="research_stream_unavailable",
                message="Live research output is unavailable.",
            )
            if not any(w.code == warning.code for w in warnings):
                warnings.append(warning)
                self._emit_degraded(session_id, warning)
            raise
```

Place this warning logic around display-producing synthesis failures, not around unrelated fence/persistence failures. Invalid final output remains an exception so the existing graph `research_unavailable` warning/degraded continuation is preserved. No extra LLM completion fallback and no fake streaming.

  4. For finalization’s existing unexpected failure fallback, add the same fixed warning then keep the current safe `ResearchFinalization` fallback; replace `raise` with that existing fallback block. Domain cancellation must never use it. Provider exhaustion/auth/budget paths retain their existing codes and behavior.
  5. Stop using the failing display callback after any failure. Do not retire drafts on cancel/failure/pause. Retained previews are reconciled by the existing stage/terminal SSE logic. Safe logs include a constant event/message and exception class, never `str(exc)`, response bodies, raw partials, keys, or headers.

Keep lock/fence errors outside display-unavailability conversion. Existing persistence/cursor writes still use the supplied `GenerationLock`; a lost lock is a resumable interruption, not insufficient evidence. Graph pause/task cancellation must retain the last preview and cannot initiate another paid fallback call.

- [ ] Green/verification: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_streaming server.tests.test_research_runner server.tests.test_streaming_agent_boundary server.tests.test_live_stream_safety -v`.
- [ ] Commit: `git add server/services/research_runner.py server/tests/test_live_research_streaming.py`; `git commit -m "fix(realtime): preserve research cancellation and safe failure warnings"`.

## Task 6 — Stream reserved summary and verify production identity/isolation

**Files:** Modify `server/services/research_runner.py`; create `server/tests/test_live_research_integration.py`.

- [ ] Write the following exact failing tests after the new module header. The production test uses actual temporary SQLite stores and actual adapter/coordinator construction from the existing test fixture; only HTTP/LLM are fake. It does not modify that existing test file.

```python
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server.schemas.progress import ProgressEventType
from server.schemas.research import ResearchFinalization, ResearchIteration
from server.services.research_runner import run_research
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.tests.test_live_research_streaming import make_fixture, read_until
from server.tests.test_run_research_production import ProductionRunResearchTests
from server.utils.instructor_client import StructuredStreamUpdate


class ResearchIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_summary_grows_during_reserved_finalization_turn(self):
        runner, agent, stores, coordinator, args = make_fixture()
        entered, release = asyncio.Event(), asyncio.Event()

        async def chunks():
            yield ResearchFinalization.model_construct(summary="Summary ")
            yield ResearchFinalization.model_construct(summary="Summary evidence. ")
            entered.set()
            await release.wait()
            yield ResearchFinalization(summary="Summary evidence. Final.",
                                       freshness_note="today")

        async def finalize(**kwargs):
            cb, attempt = kwargs["on_delta"], kwargs["initial_attempt"]
            await cb(StructuredStreamUpdate("attempt_started", attempt))
            async for model in chunks():
                await cb(StructuredStreamUpdate("partial", attempt, model))
                last = model
            return ResearchFinalization.model_validate(last.model_dump())

        agent.finalize_report.side_effect = finalize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            async with hub.subscribe(args["session_id"]) as sub:
                task = asyncio.create_task(runner.run(**args))
                try:
                    await asyncio.wait_for(entered.wait(), 0.5)
                    first = await read_until(sub,
                                            ProgressEventType.RESEARCH_TEXT_DELTA)
                    second = await read_until(sub,
                                             ProgressEventType.RESEARCH_TEXT_DELTA)
                    self.assertEqual(first.payload.theme, "summary")
                    self.assertEqual(first.payload.sequence_index, 1)
                    self.assertEqual(first.payload.text_delta, "Summary ")
                    self.assertEqual(second.payload.text_delta, "evidence. ")
                    self.assertFalse(task.done())
                    stores.research.finalize_report.assert_not_called()
                    release.set()
                    await asyncio.wait_for(task, 0.5)
                    stores.research.upsert_section.assert_called_once()
                    agent.finalize_report.assert_awaited_once()
                    saved = stores.research.finalize_report.call_args.kwargs
                    self.assertEqual(saved["summary"],
                                     "Summary evidence. Final.")
                finally:
                    release.set()
                    if not task.done():
                        task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def test_interleaved_sessions_have_separate_text_and_counts(self):
        fixtures = [make_fixture("s1", "r1"), make_fixture("s2", "r2")]
        gates = [asyncio.Event(), asyncio.Event()]
        release = asyncio.Event()
        hub = SessionLiveStreamBroadcaster()

        def stream_for(index):
            async def synthesize(**kwargs):
                cb = kwargs["on_delta"]
                await cb(StructuredStreamUpdate("attempt_started", 1))
                await cb(StructuredStreamUpdate("partial", 1,
                    ResearchIteration.model_construct(
                        section_markdown=f"Session {index} first ")))
                gates[index].set()
                await release.wait()
                final = ResearchIteration(theme="fundamentals",
                    section_markdown=f"Session {index} first final.")
                await cb(StructuredStreamUpdate("partial", 1, final))
                return final
            return synthesize

        with patch("server.services.research_runner.session_live_stream", hub):
            tasks = []
            try:
                for index, (runner, agent, stores, coordinator, args) \
                        in enumerate(fixtures):
                    agent.synthesize_iteration.side_effect = stream_for(index)
                    tasks.append(asyncio.create_task(runner.run(**args)))
                await asyncio.wait_for(asyncio.gather(
                    *(gate.wait() for gate in gates)), 0.5)
                self.assertTrue(all(not task.done() for task in tasks))
                for index, session in enumerate(("s1", "s2")):
                    events = await hub.snapshots(session)
                    texts = [e for e in events if e.snapshot.text]
                    self.assertEqual(len(texts), 1)
                    self.assertEqual(texts[0].snapshot.text,
                                     f"Session {index} first ")
                    self.assertEqual(texts[0].job_id, "job-" + session)
                    counts = [e.snapshot.unique_source_count for e in events
                              if e.snapshot.unique_source_count is not None]
                    self.assertEqual(counts, [1])
                release.set()
                await asyncio.wait_for(asyncio.gather(*tasks), 0.5)
            finally:
                release.set()
                for task in tasks:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)


class ProductionIdentityTests(ProductionRunResearchTests):
    async def test_production_publishes_real_job_id_and_redacts_search_key(self):
        import httpx
        from server.schemas.llm import LLMContext
        from server.schemas.research import ResearchPlan
        from server.schemas.search import SearchContext
        from server.search.types import SearchProviderId
        from server.tests.test_live_research_streaming import make_fixture

        _, agent, _, _, _ = make_fixture()
        agent.analyze_query.return_value = ResearchPlan(
            audience="Learner", provisional_concept_count=3,
            initial_queries=["q"],
        )

        async def synthesize(**kwargs):
            cb = kwargs["on_delta"]
            await cb(StructuredStreamUpdate("attempt_started", 1))
            for text in ("Evidence tvly-pr", "Evidence tvly-private-key safe "):
                await cb(StructuredStreamUpdate("partial", 1,
                    ResearchIteration.model_construct(section_markdown=text)))
            return ResearchIteration(
                theme="fundamentals",
                section_markdown="Evidence tvly-private-key safe ",
            )

        agent.synthesize_iteration.side_effect = synthesize

        def handler(request):
            return httpx.Response(200, request=request, json={"results": [{
                "title": "Source", "url": "https://example.org/a",
                "content": "Evidence",
            }]})

        search = SearchContext.from_plaintext_credentials(
            enabled=True, provider_ids=[SearchProviderId.TAVILY],
            credentials={SearchProviderId.TAVILY: "tvly-private-key"},
        )
        hub = SessionLiveStreamBroadcaster()
        job = self.jobs.get_by_session(self.session_id)
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
        ) as client:
            with patch(
                "server.database.storage_registry.generation_job_repository",
                self.jobs,
            ), patch(
                "server.database.storage_registry.progress_event_repository",
                self.events,
            ), patch(
                "server.database.storage_registry.research_repository",
                self.research,
            ), patch(
                "server.agents.researcher.researcher_agent", agent,
            ), patch(
                "server.services.research_runner.session_live_stream", hub,
            ):
                async with hub.subscribe(self.session_id) as sub:
                    await run_research(
                        session_id=self.session_id, topic_query="q",
                        llm_context=LLMContext(api_key="llm-key", model="m"),
                        search_context=search, resolved_mode="full",
                        http_client=client,
                    )
                    events = []
                    while not sub.queue.empty():
                        events.append(sub.queue.get_nowait())
        self.assertTrue(events)
        self.assertTrue(all(e.job_id == job.id for e in events))
        wire = " ".join(e.model_dump_json() for e in events)
        self.assertNotIn("tvly-pr", wire)
        self.assertNotIn("llm-key", wire)
        self.assertNotIn("Authorization", wire)
        self.assertIn("[redacted]", wire)
        saved = self.research.get_report(self.session_id).model_dump_json()
        self.assertNotIn("tvly-private-key", saved)
        self.assertNotIn("llm-key", saved)
```

- [ ] Red command: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_integration -v`. Summary callback forwarding and actual production job identity/search-key redaction fail before implementation; concurrency is a required regression assertion.
- [ ] Minimal implementation:
  1. Add `display_secrets: Sequence[str] = ()` to the runner constructor as an optional keyword-only input and store a deduplicated nonempty tuple privately. At production composition collect the configured search credentials plus `LLMContext.api_key`, `openrouter_api_key`, and `generalcompute_api_key` using `SecretStr.get_secret_value()`. Keep them strictly in the runner lifetime; do not attach them to outcome, warnings, cursor, logs, or callback payloads. For direct callers also collect the real LLMContext secret fields in `run`, without touching MagicMock-only test doubles.
     Redact these exact values from the authoritative section markdown and finalization summary/limitations/freshness strings immediately before persistence as well. This keeps echoed runtime keys out of public saved research while preserving the existing validated model/allowlist flow. Do not serialize the secret tuple to perform redaction. Build merged LLM/search secret values in run-local state; do not mutate shared instance secrets or store target accumulators on the singleton researcher agent.
  2. In `run_research`, obtain `generation_job_store.get_by_session(session_id)` and pass `job.id` to `runner.run`. If a real production job is absent, raise a constant safe error rather than using `f"job-{session_id}"`. Keep persisted provider-order handling and client ownership/finally cleanup unchanged. A display count emitted with a fabricated job ID can evict another producer’s drafts, so this is required integration work within P2 ownership.
     Also make `_load_research_cursor` use the actual production `get_by_session` accessor, retaining its `get_job` fallback only for legacy doubles. Otherwise a resumed production report can pair hydrated source counts with a stale section index. Both accessors remain repository calls; no direct database access is introduced.
  3. Thread `job_id` and `display_secrets`/safe-display factory to **all four existing `_finalize` call sites** in `run`: provider exhaustion, nonrotatable search error, normal completion (including a loop budget break), and outer budget-exceeded finalization. Use optional private parameters to avoid breaking direct helper tests. `_finalize` constructs a separate display with index `next_section_index`, theme `summary`, field `summary`, accepted source IDs, and the same cancellation guard.

```python
            final = await self._agent.finalize_report(
                query=query,
                coverage=coverage,
                sections=list(section_markdowns),
                conflicts=list(conflicts),
                llm_context=llm_context,
                budget_context=finalize_budget,
                on_delta=summary_display.on_delta,
                initial_attempt=1,
            )
            self._ensure_not_cancelled(session_id)
            await summary_display.finish(final)
```

  4. Preserve `reserve_finalization_turn()` once and its existing fallback. Do not introduce an extra domain finalization call when text is corrected: a non-prefix summary abandons that unsupported display attempt, emits the fixed safe streaming warning, and uses the existing safe limited-synthesis fallback. P1’s existing bounded transport retry remains in force. Summary corrections cannot consume ordinary research turns or fabricate a section milestone.
  5. Do not retire the summary or source-count target from `_finalize`; there is no corresponding durable section-ready event for either. Existing stage reconciliation cleans them after the researching stage advances. Do not add a summary section or change section indices already persisted.
  6. The production fixture returns the final cumulative section text so it tests public preview redaction without manufacturing a non-prefix final correction. P2 must never expose the fixture key in a live delta, snapshot, warning, log, or persisted public research string.

- [ ] Green/verification: `& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_agent server.tests.test_live_research_streaming server.tests.test_live_research_projection server.tests.test_live_research_integration server.tests.test_run_research_production server.tests.test_research_runner -v`.
- [ ] Commit: `git add server/services/research_runner.py server/tests/test_live_research_integration.py`; `git commit -m "feat(realtime): stream research summaries with real job identity"`.

## Final red/green audit and regression gates

Before implementing, create every dedicated failing test and run the four-module focused command once to capture the original missing behaviors. Then execute tasks in order; each task’s new red assertions must fail for the intended missing behavior before its production edits. Some protection assertions are expected to stay green; they do not replace the task’s failing assertions. Record red/green outputs and commits in the orchestrator’s execution log, without staging unrelated documentation.

Add these additional exact methods to `LiveResearchStreamingTests` during Task 5’s red step (they exercise cancellation and degraded controls, without new files):

```python
    async def test_provider_exhaustion_never_claims_live_text(self):
        from server.search.types import AllProvidersUnavailable
        from server.schemas.research import ResearchStatus
        runner, agent, stores, coordinator, args = make_fixture()
        coordinator.search.side_effect = AllProvidersUnavailable(
            provider_ids=(SearchProviderId.TAVILY,))
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            outcome = await runner.run(**args)
            self.assertEqual(outcome.status, ResearchStatus.DEGRADED)
            agent.synthesize_iteration.assert_not_awaited()
            stores.research.mark_degraded.assert_called_once()
            self.assertFalse(any(e.snapshot.text for e in
                                 await hub.snapshots(args["session_id"])))

    async def test_async_task_cancel_keeps_preview_and_stops_publication(self):
        runner, agent, stores, coordinator, args = make_fixture()
        entered, closed = asyncio.Event(), asyncio.Event()

        async def synthesize(**kwargs):
            try:
                cb = kwargs["on_delta"]
                await cb(StructuredStreamUpdate("attempt_started", 1))
                await cb(StructuredStreamUpdate("partial", 1,
                    ResearchIteration.model_construct(section_markdown="Preview ")))
                entered.set()
                await asyncio.Event().wait()
            finally:
                closed.set()

        agent.synthesize_iteration.side_effect = synthesize
        hub = SessionLiveStreamBroadcaster()
        with patch("server.services.research_runner.session_live_stream", hub):
            task = asyncio.create_task(runner.run(**args))
            try:
                await asyncio.wait_for(entered.wait(), 0.5)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertTrue(closed.is_set())
                drafts = await hub.snapshots(args["session_id"])
                self.assertTrue(any(e.snapshot.text == "Preview " for e in drafts))
                stores.research.upsert_section.assert_not_called()
                agent.finalize_report.assert_not_awaited()
            finally:
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)
```

Run focused producer + foundation + existing research gates:

```powershell
& server/.venv/Scripts/python.exe -m unittest server.tests.test_live_research_agent server.tests.test_live_research_streaming server.tests.test_live_research_projection server.tests.test_live_research_integration -v
& server/.venv/Scripts/python.exe -m unittest server.tests.test_researcher_agent server.tests.test_research_runner server.tests.test_run_research_production server.tests.test_research_budget server.tests.test_source_safety server.tests.test_research_store server.tests.test_mongo_research server.tests.test_research_progress_contracts -v
& server/.venv/Scripts/python.exe -m unittest server.tests.test_instructor_partial_stream server.tests.test_streaming_agent_boundary server.tests.test_live_stream_safety server.tests.test_live_stream_bounds server.tests.test_live_stream_repository_parity -v
& server/.venv/Scripts/python.exe -m unittest discover -s server/tests -v
& server/.venv/Scripts/python.exe -m compileall -q server/agents/researcher.py server/services/research_runner.py server/tests/test_live_research_agent.py server/tests/test_live_research_streaming.py server/tests/test_live_research_projection.py server/tests/test_live_research_integration.py
git diff --check
```

Use stdlib trace for a no-new-dependency statement coverage diagnostic:

```powershell
& server/.venv/Scripts/python.exe -m trace --count --summary --coverdir "$env:TEMP/a2ui-p2-coverage" --module unittest server.tests.test_live_research_agent server.tests.test_live_research_streaming server.tests.test_live_research_projection server.tests.test_live_research_integration server.tests.test_researcher_agent server.tests.test_research_runner server.tests.test_run_research_production
```

Review the generated `.cover` entries for the changed lines in the two owned production files; >80% of **new executable lines** must be executed. The trace command is diagnostic, not an automatic branch-coverage gate. Close uncovered safety/failure branches with additional deterministic tests in the owned dedicated files before reporting complete. Do not install a coverage dependency or claim client coverage applies to Python producers.

Final project-wide client gates belong to P5/orchestrator, but the complete final regression command set is:

```powershell
npm --prefix client run test -- --run
npm --prefix client run test:generation:coverage
npm --prefix client run lint
npm --prefix client run build
```

Existing graph/depth/router acceptance suites in full server discovery verify search-off routing and Auto/Lite/Full/Custom count contracts. P2 does not change the route deciding whether research runs, the graph scheduler, or depth resolution; never call `run_research` for search-off just to produce a source count of zero. Unsupported streaming is a truthful warning/degraded path, not a silent completed-response substitute. P5 supplies client observability and integrated zero-click acceptance; these producer tests alone do not claim A1/A4/A8/A13 or cross-process draft recovery.

## Traceability and research decisions

| Acceptance / decision | Implementation | Evidence |
| --- | --- | --- |
| A2: accepted unique source growth before synthesis | Task 2, count target `(research, session_id, None)` | Two provider response batches, dedup across queries, failed/unsafe hits excluded, paused synthesis |
| A3: at least two updates before completion | Tasks 1, 3, 6 | Controlled real P1 async generator and runner async generators remain open during two growing synthesis/summary deltas |
| A9: search-off and all depth modes preserved | Tasks 2 and 6 preserve existing runner/coordinator budgets and production mode handling | Existing budget, graph/API/depth acceptance tests in full discovery; no graph/depth edits |
| A11: attempts reset only affected target; invalid partials never ready | Task 4 | Correction reset reason/attempt, source-ID allowlist correction, invalid final Pydantic model, durable ready precedes retirement |
| A12: pause/cancel/failure/degraded recovery | Task 5 | Wrapped ResearchCancelled, GenerationCancelled in correction/finalization, async task cancellation, fixed safe warning, provider exhaustion |
| A14: grounded-output safety | Tasks 2, 3, 5, 6 | URL allowlist on accepted hits; only section/summary fields; fragmented URL/search-key guards; no secret bodies in warnings/logs |
| Research decision 1: genuine Instructor partial path | Task 1 | `generate_streaming` callback; final Pydantic validation; one provider call per attempt |
| Research decision 2: retain `graph.ainvoke` and concurrency | All tasks | No graph files edited; concurrent session test and full server regression |
| Research decisions 3–5: in-process drafts, independent durable cursor | Tasks 2–6 | Typed broadcaster events, no token DB writes, existing foundation parity/replay regression |
| Research decision 6: six typed event contracts | Tasks 2–6 | Only existing research count/text/reset payloads plus existing durable milestones; no invented report-ready event |
| Research decision 9: safe partial Markdown | Task 3 producer-side extraction; P4 owns rendering | Pending URL/link guards; no raw provider serialization; no eager execution belongs to P4 |
| Research decision 10: no dependency/stack changes | All tasks | stdlib tests/trace; existing P1 APIs and repositories |

## P1 contract conformance and execution handoff

No change to P1’s signatures, event schemas, chunk bounds, retry policy, target scoping, or durable-retirement rule is requested. Use the **landed** name `generate_streaming`, not research.md’s illustrative `generate_stream`/`synthesize_iteration_stream`. Cumulative correction restarts use a budgeted higher attempt; they never concatenate non-prefix text. The summary target’s retention until stage cleanup follows P1’s failure/authoritative-stage reconciliation semantics because no section-ready milestone exists for that target.

Six ordered tasks. A worker should report each red/green result, commit hash, actual new-code coverage, regression failures, and any required orchestrator coordination. Application implementation is not part of this planning commit.
