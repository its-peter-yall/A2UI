# P4: Integrated Acceptance Implementation Plan

> **For agentic workers:** Use the `executing-plans` skill to implement this
> plan task by task. Track checkboxes and report results to the orchestrator.
> P1, P2, and P3 are already implemented. This plan adds acceptance tests only.

**Goal:** Prove Custom count and research choices across the real form/API,
request/runtime/graph, durable failure, and store/read/resume boundaries.

**Architecture:** Keep the real client transport behind a recording Axios
double. Compose server HTTP routes with the existing temporary SQLite
acceptance harness and real planner cardinality enforcement. Separately
exercise real SQLite/Mongo session and job repositories through HTTP start,
read, and resume using a reopened checkpoint and deterministic graph probes.

**Tech stack:** Existing React 19, React Query, Vitest, Testing Library,
FastAPI, Pydantic v2, unittest, HTTPX, LangGraph, AsyncSqliteSaver, and
unittest.mock. No new dependency or production change is planned.

---

## References, ownership, and limits

Read `docs/custom-learning-mode/goal.md`, `docs/custom-learning-mode/research.md`,
`docs/custom-learning-mode/state.md`, `docs/custom-learning-mode/plan1.md`,
`docs/custom-learning-mode/plan2.md`, `docs/custom-learning-mode/plan3.md`,
`docs/CONVENTIONS.md`, and `docs/TESTING.md`. Supporting specs are
`docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/STRUCTURE.md`,
`docs/INTEGRATIONS.md`, and `docs/CONCERNS.md`.

Create exactly these files:

| File | Responsibility |
| --- | --- |
| `server/tests/test_custom_learning_mode_integration.py` | HTTP request to durable completion/failure; store/read/resume parity |
| `client/src/features/learning/__tests__/customLearningMode.test.tsx` | Mounted form to real transport, scoped headers, accepted cache, and navigation |

Do not modify the existing acceptance harness, existing tests, production
files, workflow state, or final report. The orchestrator owns workflow
documentation. Do not duplicate standalone schema, dropdown, switch, prompt,
repository CRUD, or planner unit tests already delivered by P1/P2/P3.
Assertions about these behaviors below belong inside composed workflows.

P4 proves the client/server seam with matching JSON and header contracts in
two deterministic suites; it is not a browser talking to a live server.
Mongo parity uses the real repository code with mocked collection transport
and transactions. Both store variants use a real reopened SQLite checkpointer
to prove count restoration. This does not prove Atlas transactions or the
MongoDBSaver driver. Report that boundary explicitly; do not claim live Atlas
or distributed checkpoint integration.

Verified current contracts:

- `GenerateCourseRequest(mode='custom', custom_topic_count=N)` accepts strict
  integers 1-30. Other modes omit the field or use null.
- `GenerationRuntime.start` forwards N to `create_session_shell_and_job`;
  `resume` accepts `session_id`, fresh `llm_context`, and `search_context`,
  **no new count parameter**.
- `PlannerAgent.plan(..., mode='custom', custom_topic_count=N)` retries once
  and raises `OutlineTopicCountError` on a second mismatch.
- `run_generation_job` reads count from the session on start and invokes the
  graph with `None` on resume, using the same `thread_id`.
- The implemented search flag header is **`X-Web-Search`**, not the
  `X-Web-Search-Enabled` spelling in some older workflow prose.
- `build_graph(checkpointer, node_overrides=...)` is the existing test hook.
- `GenerationAcceptanceHarness._install_fakes` mocks `planner_agent.plan`;
  restore the captured real bound method inside that context, then mock
  `planner_agent.generate` instead. Otherwise AC3 is never actually tested.

HTTPX documents [ASGITransport](https://www.python-httpx.org/advanced/transports/)
for async in-process HTTP tests and states that it does not run lifespan.
These tests explicitly construct and close their runtime; do not boot
`server/main.py` or install a lifespan package. LangGraph documents
[thread checkpoints and resume](https://docs.langchain.com/oss/python/langgraph/persistence);
reuse the repository's existing close/reopen saver pattern.

## Preparation and honest RED evidence

- [ ] From `D:/Peter/A2UI`, capture HEAD and the index without mutating them:

```powershell
$p4Base = git rev-parse HEAD
git diff --cached --name-only
git status --short -- server/tests/test_custom_learning_mode_integration.py client/src/features/learning/__tests__/customLearningMode.test.tsx
```

Both new paths must be absent before creation. If either already exists,
coordinate ownership before changing it. Approximately 283 modified paths
are user work. Never reset, restore, clean, broadly stage, or overwrite them.
Acquire the shared git mutation slot from the orchestrator before each commit.
If the index contains another worker's changes, wait; do not unstage them.

- [ ] Run the already-implemented focused baseline from the repository root:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_schema server.tests.test_depth_mode_persistence server.tests.test_generation_jobs server.tests.test_mongo_jobs server.tests.test_mongo_learning server.tests.test_planner_mode server.tests.test_depth_router server.tests.test_generation_runtime server.tests.test_staged_graph server.tests.test_graph server.tests.test_generation_recovery -v
```

- [ ] Run the client baseline from `D:/Peter/A2UI/client`:

```powershell
npm test -- --run src/features/learning/TopicInput.test.tsx src/lib/learningApi.test.ts src/types/learning.test.ts
```

P1/P2/P3 are implemented, so correct new acceptance tests may pass on first
execution. Do **not** invent a production defect or falsely report those runs
as RED. For each test task below, write the assertions first, then use the
specified temporary negative control in the new test file to prove an
assertion fails, restore it, and run GREEN. These controls only change fake
provider/test inputs; they never edit or disable production code. If the
normal test fails, retain it and use the owner-coordinated defect procedure
in Task 6 before proceeding. An import error is not meaningful RED evidence.

## Task 1: Request, count, and research to actual graph completion

**Create:** `server/tests/test_custom_learning_mode_integration.py`.

- [ ] **Step 1a (2-5 minutes): Create the file with the header and imports
      from the complete foundation below.** The separator is exactly 76 `=`
      characters. Imports include later task dependencies.
- [ ] **Step 1b (2-5 minutes): Add `_headers`, `_drain`, and class setup and
      teardown from the foundation.** This is test composition only.
- [ ] **Step 1c (2-5 minutes): Add `_externals` and `_start`.** Keep the
      restored real planner method inside the harness fake context.
- [ ] **Step 1d (2-5 minutes): Add the count/research test and `main`.**
      The exact assembled foundation is:

```python
"""
============================================================================
FILE: test_custom_learning_mode_integration.py
LOCATION: server/tests/test_custom_learning_mode_integration.py
============================================================================
PURPOSE:
    Verify Custom generation and persisted resume across layer boundaries.
ROLE IN PROJECT:
    Provides P4 acceptance with real HTTP, runtime, graph, and repositories.
    External providers and Mongo transport are deterministic doubles.
KEY COMPONENTS:
    - CustomLearningModeIntegrationTests: Composed acceptance contracts
USAGE:
    python -m unittest
    server.tests.test_custom_learning_mode_integration
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest
from contextlib import contextmanager
from copy import deepcopy
from types import SimpleNamespace
from typing import Any, Iterator, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from server.database.repositories.mongo_jobs import (
    MongoGenerationJobRepository,
)
from server.database.repositories.mongo_learning import (
    MongoLearningRepository,
)
from server.graph import nodes
from server.graph.build import build_graph
from server.graph.runner import ResumableGenerationError, run_generation_job
from server.routers.learning import router
from server.schemas.generation import GenerationStage
from server.schemas.learning import CourseOutline
from server.schemas.llm import get_llm_context
from server.services.generation_runtime import GenerationRuntime
from server.tests.generation_acceptance_harness import (
    AcceptanceScenario,
    GenerationAcceptanceHarness,
    make_outline,
)
from server.tests.llm_test_helpers import make_test_llm_context
from server.tests.test_mongo_jobs import make_job_document


def _headers(research: bool = False) -> dict[str, str]:
    """Return the search headers emitted by the real client transport."""
    if not research:
        return {"X-Web-Search": "false"}
    return {
        "X-Web-Search": "true",
        "X-Web-Search-Providers": "tavily",
        "X-Tavily-Key": "search-secret",
    }


async def _drain(runtime: GenerationRuntime) -> None:
    """Await detached work with a bounded timeout and propagate errors."""
    tasks = list(runtime.active_tasks)
    if tasks:
        await asyncio.wait_for(asyncio.gather(*tasks), timeout=30)


class CustomLearningModeIntegrationTests(unittest.IsolatedAsyncioTestCase):
    """Prove composed behavior using isolated temporary persistence."""

    async def asyncSetUp(self) -> None:
        self.harness = await GenerationAcceptanceHarness.create()
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.state.generation_runtime = self.harness.runtime
        self.app.dependency_overrides[get_llm_context] = (
            lambda: make_test_llm_context(api_key="llm-secret", model="m")
        )
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app),
            base_url="http://testserver",
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.harness.close()

    @contextmanager
    def _externals(
        self,
        count: int,
        research: bool = False,
        outlines: Optional[list[CourseOutline]] = None,
    ) -> Iterator[tuple[AsyncMock, AsyncMock]]:
        """Keep real cardinality enforcement inside the existing harness."""
        real_plan = nodes.planner_agent.plan
        scenario = AcceptanceScenario(topic_count=count, web_search=research)
        with (
            self.harness._install_fakes(scenario),
            patch.object(nodes.planner_agent, "plan", new=real_plan),
            patch.object(
                nodes.planner_agent, "generate", new_callable=AsyncMock
            ) as generate,
        ):
            generate.side_effect = (
                outlines if outlines is not None else [make_outline(count)]
            )
            yield generate, nodes.run_research

    async def _start(
        self, count: int, research: bool = False
    ) -> str:
        """Submit the same JSON shape built by learningApi.generateCourse."""
        response = await self.client.post(
            "/learning/generate",
            json={
                "query": "Modern CSS",
                "mode": "custom",
                "custom_topic_count": count,
            },
            headers=_headers(research),
        )
        self.assertEqual(response.status_code, 202, response.text)
        accepted = response.json()
        self.assertEqual(accepted["session"]["custom_topic_count"], count)
        self.assertEqual(accepted["session"]["total_nodes"], 0)
        self.assertEqual(
            accepted["generation"]["web_search_requested"], research
        )
        self.assertNotIn("llm-secret", response.text)
        self.assertNotIn("search-secret", response.text)
        return accepted["session"]["id"]

    async def test_request_count_and_research_reach_completion(self) -> None:
        for count in (1, 2, 5, 30):
            for research in (False, True):
                with (
                    self.subTest(count=count, research=research),
                    self._externals(count, research) as (generate, search),
                    patch(
                        "server.graph.nodes.resolve_depth_mode",
                        new_callable=AsyncMock,
                    ) as resolve,
                ):
                    session_id = await self._start(count, research)
                    await _drain(self.harness.runtime)
                    response = await self.client.get(
                        f"/learning/sessions/{session_id}"
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    public = response.json()
                    self.assertEqual(public["mode"], "custom")
                    self.assertEqual(public["resolved_mode"], "custom")
                    self.assertEqual(public["custom_topic_count"], count)
                    self.assertEqual(public["total_nodes"], count)
                    self.assertEqual(len(public["nodes"]), count)
                    self.assertEqual(public["generation"]["stage"], "COMPLETE")
                    self.assertEqual(
                        public["generation"]["counts"]["topics_ready"], count
                    )
                    self.assertEqual(
                        public["generation"]["counts"]["topics_failed"], 0
                    )
                    resolve.assert_not_awaited()
                    generate.assert_awaited_once()
                    self.assertIn(
                        f"EXACTLY {count} topics",
                        generate.await_args.kwargs["system_prompt_override"],
                    )
                    self.assertEqual(search.await_count, int(research))
                    result = self.harness._build_result(session_id)
                    if research:
                        self.assertLess(
                            result.stage_events.index("RESEARCHING"),
                            result.stage_events.index("OUTLINING"),
                        )
                        self.assertEqual(result.grounding_status, "GROUNDED")
                    else:
                        self.assertNotIn("RESEARCHING", result.stage_events)
                        self.assertEqual(result.grounding_status, "DISABLED")
                    job = self.harness.jobs.get_by_session(session_id)
                    self.assertIsNotNone(job)
                    snapshot = await self.harness.graph.aget_state(
                        {"configurable": {"thread_id": job.thread_id}}
                    )
                    self.assertEqual(
                        snapshot.values["custom_topic_count"], count
                    )
                    self.assertEqual(snapshot.values["topic_count"], count)
                    self.assertEqual(
                        snapshot.values["web_search_enabled"], research
                    )
                    self.assertNotIn("llm-secret", repr(snapshot.values))
                    self.assertNotIn("search-secret", repr(snapshot.values))


def main() -> None:
    """Run this acceptance module directly through Python's module runner."""
    unittest.main()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Prove RED without touching upstream production.** Temporarily
      replace the helper's default provider response with the following.
      Every supplied outline is valid for the general 1-30 schema, but fails
      the exact Custom request. The two responses also exercise the retry.

```python
            wrong = 2 if count == 1 else 1
            generate.side_effect = (
                outlines if outlines is not None
                else [make_outline(wrong), make_outline(wrong)]
            )
```

Run from the root:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_request_count_and_research_reach_completion -v
```

Expected: FAIL on the completion/cardinality assertions, with stored FAILED
generation; never a live provider call. Record the failing assertion.

- [ ] **Step 3: Minimal implementation.** Restore the exact `_externals`
      default response from Step 1. Add no production code. Run the same
      command; expect all eight subcases to pass.

- [ ] **Step 4: Verify the new file and commit only it.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration -v
git add -- server/tests/test_custom_learning_mode_integration.py
git diff --cached --check
git diff --cached --stat
git commit -m "test(learning): verify custom request count and research through graph"
```

## Task 2: Corrective retry and observable durable second-mismatch failure

**Modify only:** `server/tests/test_custom_learning_mode_integration.py`.

- [ ] **Step 1a (2-5 minutes): Add the corrective-success method below.**
- [ ] **Step 1b (2-5 minutes): Add the durable-failure method below.**
      Both belong inside `CustomLearningModeIntegrationTests`, before
      module-level `main`. These assertions cross the API, real planner,
      runner, persistent job, events, and public read boundaries.

```python
    async def test_corrected_outline_completes_without_wrong_nodes(
        self,
    ) -> None:
        wrong, corrected = make_outline(2), make_outline(5)
        with self._externals(5, outlines=[wrong, corrected]) as (generate, _):
            session_id = await self._start(5)
            await _drain(self.harness.runtime)
            response = await self.client.get(f"/learning/sessions/{session_id}")
            self.assertEqual(response.status_code, 200, response.text)
            public = response.json()
            self.assertEqual(public["generation"]["stage"], "COMPLETE")
            self.assertEqual(len(public["nodes"]), 5)
            self.assertEqual(
                [node["sequence_index"] for node in public["nodes"]],
                list(range(5)),
            )
            self.assertEqual(generate.await_count, 2)
            self.assertEqual(len(wrong.topics), 2)
            self.assertIn(
                "EXACTLY 5 topics",
                generate.await_args_list[1].kwargs["user_message"],
            )

    async def test_second_mismatch_is_failed_in_public_read_and_events(
        self,
    ) -> None:
        wrong_first, wrong_second = make_outline(2), make_outline(4)
        with self._externals(
            5, outlines=[wrong_first, wrong_second]
        ) as (generate, _):
            session_id = await self._start(5)
            await _drain(self.harness.runtime)
            self.assertEqual(generate.await_count, 2)
            response = await self.client.get(f"/learning/sessions/{session_id}")
            self.assertEqual(response.status_code, 200, response.text)
            public = response.json()
            self.assertEqual(public["custom_topic_count"], 5)
            self.assertEqual(public["generation"]["stage"], "FAILED")
            self.assertEqual(public["nodes"], [])
            self.assertEqual(public["total_nodes"], 0)
            result = self.harness._build_result(session_id)
            self.assertIn("FAILED", result.stage_events)
            self.assertNotIn("outline_ready", result.event_types)
            self.assertNotIn("generation_complete", result.event_types)
            self.assertEqual(len(wrong_first.topics), 2)
            self.assertEqual(len(wrong_second.topics), 4)
            job = self.harness.jobs.get_by_session(session_id)
            self.assertIsNotNone(job)
            self.assertEqual(job.stage, GenerationStage.FAILED)
            self.assertIsNone(job.lock_owner)
            stream = await self.client.get(
                f"/learning/sessions/{session_id}/events?after=0"
            )
            self.assertEqual(stream.status_code, 200, stream.text)
            self.assertIn('"FAILED"', stream.text)
            self.assertNotIn("llm-secret", stream.text)
            self.assertNotIn("search-secret", stream.text)
```

- [ ] **Step 2: Run RED.** Temporarily change only the failure test's provider
      responses to `[wrong_first, make_outline(5)]`. The normal production
      path now corrects and completes; the durable failure assertions must
      fail. This proves they distinguish correction from second mismatch.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_second_mismatch_is_failed_in_public_read_and_events -v
```

Expected: FAIL, COMPLETE differs from FAILED.

- [ ] **Step 3: Minimal implementation and GREEN.** Restore
      `[wrong_first, wrong_second]`. Keep the real planner and runner; add no
      production change. Run:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_corrected_outline_completes_without_wrong_nodes server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_second_mismatch_is_failed_in_public_read_and_events -v
```

Expected: PASS; one correction succeeds, second mismatch is durably FAILED
and visible through GET and SSE. The terminal SSE stream must close.

- [ ] **Step 4: Commit.**

```powershell
git add -- server/tests/test_custom_learning_mode_integration.py
git diff --cached --check
git diff --cached --stat
git commit -m "test(learning): verify durable custom mismatch failure and correction"
```

## Task 3: HTTP rejection has no detached side effects; old modes complete

**Modify only:** `server/tests/test_custom_learning_mode_integration.py`.

- [ ] **Step 1a (2-5 minutes): Add the rejection method below.**
- [ ] **Step 1b (2-5 minutes): Add the old-mode completion method below.**
      Both belong inside the same test class. Schema unit
      cases already exist; these verify route rejection never calls the real
      runtime and that existing HTTP requests still reach real completion.

```python
    async def test_invalid_http_counts_never_create_or_schedule_jobs(
        self,
    ) -> None:
        payloads = [{"query": "Modern CSS", "mode": "custom"}]
        payloads.extend(
            {
                "query": "Modern CSS", "mode": "custom",
                "custom_topic_count": value,
            }
            for value in (None, True, False, 2.5, 3.0, "5", 0, -1, 31)
        )
        payloads.extend(
            {"query": "Modern CSS", "mode": mode, "custom_topic_count": 5}
            for mode in ("auto", "lite", "full")
        )
        with patch.object(
            self.harness.runtime, "start", wraps=self.harness.runtime.start
        ) as start:
            for payload in payloads:
                with self.subTest(payload=payload):
                    response = await self.client.post(
                        "/learning/generate", json=payload, headers=_headers()
                    )
                    self.assertEqual(response.status_code, 422, response.text)
            start.assert_not_called()
        sessions, total = self.harness.learning.get_sessions_list(user_id=None)
        self.assertEqual(sessions, [])
        self.assertEqual(total, 0)
        self.assertEqual(self.harness.runtime.active_session_ids, [])

    async def test_existing_modes_without_count_still_complete(self) -> None:
        for mode, resolved, count in (
            ("auto", "lite", 3), ("lite", "lite", 3), ("full", "full", 10)
        ):
            with (
                self.subTest(mode=mode),
                self._externals(count) as (generate, search),
                patch(
                    "server.graph.nodes.resolve_depth_mode",
                    new_callable=AsyncMock,
                    return_value="lite",
                ) as resolve,
            ):
                response = await self.client.post(
                    "/learning/generate",
                    json={"query": "Modern CSS", "mode": mode},
                    headers=_headers(),
                )
                self.assertEqual(response.status_code, 202, response.text)
                accepted = response.json()
                self.assertIsNone(accepted["session"]["custom_topic_count"])
                await _drain(self.harness.runtime)
                session_id = accepted["session"]["id"]
                response = await self.client.get(
                    f"/learning/sessions/{session_id}"
                )
                self.assertEqual(response.status_code, 200, response.text)
                public = response.json()
                self.assertEqual(public["mode"], mode)
                self.assertEqual(public["resolved_mode"], resolved)
                self.assertIsNone(public["custom_topic_count"])
                self.assertEqual(public["generation"]["stage"], "COMPLETE")
                self.assertEqual(len(public["nodes"]), count)
                self.assertEqual(resolve.await_count, int(mode == "auto"))
                search.assert_not_awaited()
                generate.assert_awaited_once()
```

- [ ] **Step 2: Run RED.** Temporarily append this valid request to `payloads`:

```python
        payloads.append({
            "query": "Modern CSS", "mode": "custom", "custom_topic_count": 5
        })
```

Run:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_invalid_http_counts_never_create_or_schedule_jobs -v
```

For this negative-control run only, replace the spy context and request loop
with this exact temporary block, so an assertion cannot release provider
patches before the accepted task is drained:

```python
        with (
            self._externals(5),
            patch.object(
                self.harness.runtime, "start", wraps=self.harness.runtime.start
            ) as start,
        ):
            try:
                for payload in payloads:
                    with self.subTest(payload=payload):
                        response = await self.client.post(
                            "/learning/generate", json=payload,
                            headers=_headers(),
                        )
                        self.assertEqual(
                            response.status_code, 422, response.text
                        )
                start.assert_not_called()
            finally:
                await _drain(self.harness.runtime)
```

Expected: FAIL, 202 differs from 422 and the spy records a call. Delete the
temporary valid payload and restore the normal context after recording RED.

- [ ] **Step 3: Minimal implementation and verify GREEN.** No production
      code changes. Run:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_invalid_http_counts_never_create_or_schedule_jobs server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_existing_modes_without_count_still_complete -v
```

Expected: PASS; invalid requests create no sessions/tasks, all three old
modes finish with null requested counts.

- [ ] **Step 4: Commit.**

```powershell
git add -- server/tests/test_custom_learning_mode_integration.py
git diff --cached --check
git diff --cached --stat
git commit -m "test(learning): verify HTTP count rejection and existing mode compatibility"
```

## Task 4: Store/read/runtime-resume parity with a reopened checkpoint

**Modify only:** `server/tests/test_custom_learning_mode_integration.py`.

- [ ] **Step 1a (2-5 minutes): Add fixture setup and `matches` below.**
- [ ] **Step 1b (2-5 minutes): Add `insert`, `find`, and `update` below.**
- [ ] **Step 1c (2-5 minutes): Wire collections and repository returns.**
      The complete fixture belongs before the test class. It uses
      the existing MagicMock collection and `make_job_document` patterns.
      It implements only operations exercised by shell/read/lock/resume;
      unsupported predicates fail loudly. Repository methods remain real.

```python
def _mongo_stores() -> tuple[Any, Any]:
    """Compose real repositories with deterministic collection transport."""
    database = MagicMock()
    collections: dict[str, MagicMock] = {}
    documents: dict[str, dict[str, Any]] = {}

    def collection(name: str) -> MagicMock:
        if name not in collections:
            collections[name] = MagicMock(name=name)
        return collections[name]

    database.__getitem__.side_effect = collection
    transaction = MagicMock()
    database.client.start_session.return_value.__enter__.return_value = (
        transaction
    )
    transaction.start_transaction.return_value.__enter__.return_value = (
        transaction
    )

    def matches(document: dict[str, Any], query: dict[str, Any]) -> bool:
        for key, expected in query.items():
            if key == "$or":
                if not any(matches(document, item) for item in expected):
                    return False
                continue
            actual = document.get(key)
            if isinstance(expected, dict):
                for operator, operand in expected.items():
                    if operator == "$in":
                        ok = actual in operand
                    elif operator == "$gt":
                        ok = actual is not None and actual > operand
                    elif operator == "$lte":
                        ok = actual is not None and actual <= operand
                    else:
                        raise AssertionError(
                            f"Unsupported predicate: {operator}"
                        )
                    if not ok:
                        return False
            elif actual != expected:
                return False
        return True

    def insert(name: str, document: dict[str, Any], **kwargs: Any) -> None:
        del kwargs
        stored = make_job_document() if name == "generation_jobs" else {}
        stored.update(deepcopy(document))
        documents[name] = stored

    def find(name: str, query: dict[str, Any]) -> Optional[dict[str, Any]]:
        document = documents.get(name)
        if document is None or not matches(document, query):
            return None
        return deepcopy(document)

    def update(
        name: str, query: dict[str, Any], change: dict[str, Any], **kwargs: Any
    ) -> Optional[dict[str, Any]]:
        del kwargs
        document = documents.get(name)
        if document is None or not matches(document, query):
            return None
        if set(change) - {"$set", "$inc"}:
            raise AssertionError(f"Unsupported update: {change.keys()}")
        document.update(deepcopy(change.get("$set", {})))
        for key, amount in change.get("$inc", {}).items():
            document[key] = document.get(key, 0) + amount
        return deepcopy(document)

    for name in ("learning_sessions", "generation_jobs"):
        target = collection(name)
        target.insert_one.side_effect = (
            lambda document, name=name, **kw: insert(name, document, **kw)
        )
        target.find_one.side_effect = lambda query, name=name: find(name, query)
        target.find_one_and_update.side_effect = (
            lambda query, change, name=name, **kw:
            update(name, query, change, **kw)
        )
        target.update_one.side_effect = (
            lambda query, change, name=name:
            SimpleNamespace(
                matched_count=int(update(name, query, change) is not None)
            )
        )
    collection("concept_nodes").count_documents.return_value = 0
    collection("concept_nodes").find.return_value.sort.return_value = []
    return (
        MongoLearningRepository(database),
        MongoGenerationJobRepository(database),
    )
```

- [ ] **Step 2a (2-5 minutes): Add the parity loop, store selection, probe
      functions, overrides, and runner closure from the code below.**
- [ ] **Step 2b (2-5 minutes): Add the patched start/pause section.**
- [ ] **Step 2c (2-5 minutes): Add the close/reopen and HTTP resume section.**
- [ ] **Step 2d (2-5 minutes): Add restored-state/read assertions and cleanup.**
      The exact assembled parity test belongs in the test class. The
      initializer, HTTP endpoints, runtime scheduler, real job transitions,
      lock handling, runner start-state read, and checkpoint restoration stay
      real. Probe overrides bound the test to the resume contract; actual
      course completion and count enforcement are already proven in Tasks 1-3.

```python
    async def test_stored_count_survives_http_read_and_resume_on_both_stores(
        self,
    ) -> None:
        for backend in ("sqlite", "mongo"):
            for count in (1, 2, 5, 30):
                with self.subTest(backend=backend, count=count):
                    if backend == "sqlite":
                        learning = self.harness.learning
                        jobs = self.harness.jobs
                    else:
                        learning, jobs = _mongo_stores()
                    events = MagicMock()
                    events.latest_id.return_value = 0
                    app_state = SimpleNamespace()
                    seen: list[int] = []

                    async def pause_outline(state: Any, runtime: Any) -> dict:
                        del runtime
                        seen.append(state["custom_topic_count"])
                        raise ResumableGenerationError("pause before outline")

                    async def resume_outline(state: Any, runtime: Any) -> dict:
                        del runtime
                        seen.append(state["custom_topic_count"])
                        return {"topic_count": count, "next_topic_index": 0}

                    async def plan(state: Any, runtime: Any) -> dict:
                        del state, runtime
                        return {"active_batch_start": 0, "active_batch_size": 1}

                    overrides = {
                        "outline_planner_node": pause_outline,
                        "plan_brief_batch_node": plan,
                        "generator_node": AsyncMock(return_value={}),
                        "prepare_quiz_batch_node": AsyncMock(return_value={}),
                        "quizzer_node": AsyncMock(return_value={}),
                        "advance_batch_node": AsyncMock(
                            return_value={"next_topic_index": count}
                        ),
                        "finalize_generation_node": AsyncMock(return_value={}),
                    }

                    async def runner_fn(**kwargs: Any) -> None:
                        await run_generation_job(
                            **kwargs, job_store=jobs, event_store=events
                        )

                    runtime = GenerationRuntime(
                        app_state=app_state, job_store=jobs,
                        event_store=events, research=self.harness.research,
                        runner=runner_fn,
                    )
                    self.app.state.generation_runtime = runtime
                    cp_path = self.harness.checkpoint_path.parent / (
                        f"{backend}-{count}.db"
                    )
                    with (
                        patch("server.graph.runner.learning_manager", learning),
                        patch("server.graph.nodes.learning_manager", learning),
                        patch("server.graph.nodes.generation_job_store", jobs),
                        patch(
                            "server.graph.nodes.progress_event_store", events
                        ),
                        patch(
                            "server.routers.learning.learning_manager", learning
                        ),
                        patch(
                            "server.routers.learning.generation_job_store", jobs
                        ),
                        patch(
                            "server.database.storage_registry."
                            "progress_event_repository", events,
                        ),
                    ):
                        try:
                            cm = AsyncSqliteSaver.from_conn_string(str(cp_path))
                            async with cm as saver:
                                app_state.course_graph = build_graph(
                                    saver, node_overrides=overrides
                                )
                                session_id = await self._start(count)
                                await _drain(runtime)
                                paused = await self.client.get(
                                    f"/learning/sessions/{session_id}"
                                )
                                self.assertEqual(
                                    paused.status_code, 200, paused.text
                                )
                                self.assertEqual(
                                    paused.json()["custom_topic_count"], count
                                )
                                self.assertEqual(
                                    paused.json()["generation"]["stage"],
                                    "PAUSED",
                                )
                                job = jobs.get_by_session(session_id)
                                self.assertIsNotNone(job)
                                thread_id = job.thread_id
                            # Rebuild runtime and graph after closing the saver.
                            await runtime.shutdown()
                            runtime = GenerationRuntime(
                                app_state=app_state, job_store=jobs,
                                event_store=events,
                                research=self.harness.research,
                                runner=runner_fn,
                            )
                            self.app.state.generation_runtime = runtime
                            overrides["outline_planner_node"] = resume_outline
                            cm = AsyncSqliteSaver.from_conn_string(str(cp_path))
                            async with cm as saver:
                                graph = build_graph(
                                    saver, node_overrides=overrides
                                )
                                app_state.course_graph = graph
                                config = {
                                    "configurable": {"thread_id": thread_id}
                                }
                                before = await graph.aget_state(config)
                                self.assertEqual(
                                    before.values["custom_topic_count"], count
                                )
                                response = await self.client.post(
                                    f"/learning/sessions/{session_id}/resume",
                                    headers=_headers(),
                                )
                                self.assertEqual(
                                    response.status_code, 202, response.text
                                )
                                await _drain(runtime)
                                after = await graph.aget_state(config)
                                self.assertEqual(after.next, ())
                                self.assertEqual(
                                    after.values["custom_topic_count"], count
                                )
                                self.assertEqual(after.values["mode"], "custom")
                                self.assertEqual(
                                    after.values["resolved_mode"], "custom"
                                )
                                self.assertNotIn(
                                    "llm-secret", repr(after.values)
                                )
                                read = await self.client.get(
                                    f"/learning/sessions/{session_id}"
                                )
                                self.assertEqual(
                                    read.status_code, 200, read.text
                                )
                                self.assertEqual(
                                    read.json()["custom_topic_count"], count
                                )
                                self.assertEqual(
                                    jobs.get_by_session(session_id).thread_id,
                                    thread_id,
                                )
                                self.assertEqual(seen, [count, count])
                        finally:
                            await runtime.shutdown()
                            self.app.state.generation_runtime = (
                                self.harness.runtime
                            )
```

- [ ] **Step 3: Prove RED.** Temporarily replace only the resume probe body
      after `seen.append(...)` with:

```python
                        return {
                            "topic_count": count,
                            "next_topic_index": 0,
                            "custom_topic_count": None,
                        }
```

Run from the root:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration.CustomLearningModeIntegrationTests.test_stored_count_survives_http_read_and_resume_on_both_stores -v
```

Expected: FAIL on restored count, None differs from N. This control targets
the final checkpoint assertion even if the stored session still contains N.

- [ ] **Step 4: Minimal implementation and GREEN.** Restore the resume probe
      from Step 2. No new production code. Rerun the same command; expect all
      eight subcases to pass. Require Mongo count reads to derive from the
      document inserted by runtime shell creation, never a fixed return value.

- [ ] **Step 5: Verify integration and commit.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration server.tests.test_generation_recovery server.tests.test_mongo_jobs server.tests.test_mongo_learning -v
git add -- server/tests/test_custom_learning_mode_integration.py
git diff --cached --check
git diff --cached --stat
git commit -m "test(learning): verify stored custom count through HTTP resume on both stores"
```

## Task 5: Real client transport from controls to headers and accepted cache

**Create:** `client/src/features/learning/__tests__/customLearningMode.test.tsx`.

- [ ] **Step 1a (2-5 minutes): Create the header, imports, and hoisted
      recording Axios double from the foundation below.**
- [ ] **Step 1b (2-5 minutes): Add provider and router mocks.**
- [ ] **Step 1c (2-5 minutes): Add render/selection/shell helpers and hooks.**
      The complete foundation follows. Do not mock
      `@/lib/learningApi`, `buildAgentModelHeaders`, or `buildWebSearchHeaders`.
      The recording fake stops at Axios transport. All mocks use synthetic
      keys; no localStorage or real provider configuration is read.

```tsx
/**
 * ============================================================================
 * FILE: customLearningMode.test.tsx
 * LOCATION: client/src/features/learning/__tests__/customLearningMode.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Verify Custom controls through real API serialization and accepted cache.
 *
 * ROLE IN PROJECT:
 *    Provides P4 client acceptance at the HTTP transport boundary.
 *    Keeps React Query, request builders, and form behavior real.
 *
 * KEY COMPONENTS:
 *    - Custom mode transport and cache workflows
 *
 * USAGE:
 *    npm test -- --run src/features/learning/__tests__/customLearningMode.test.tsx
 * ============================================================================
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TopicInput } from '@/features/learning/TopicInput';
import type {
  GenerateCourseAcceptedResponse,
  GenerateCourseRequest,
  LearningDepthMode,
  LearningSessionWithNodes,
} from '@/types/learning';

const mocks = vi.hoisted(() => {
  let accepted: GenerateCourseAcceptedResponse | undefined;
  let lastConfig: InternalAxiosRequestConfig | undefined;
  const post = vi.fn(async (
    _url: string,
    _data?: GenerateCourseRequest,
    config?: InternalAxiosRequestConfig,
  ) => {
    lastConfig = config;
    if (!accepted) throw new Error('Set accepted response before submitting');
    return { data: accepted };
  });
  return {
    post,
    navigate: vi.fn(),
    capability: true,
    setAccepted(value: GenerateCourseAcceptedResponse) { accepted = value; },
    lastRequestConfig: () => lastConfig,
    reset() { accepted = undefined; lastConfig = undefined; },
    instance: {
      post,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

vi.mock('axios', () => ({
  default: { create: () => mocks.instance, isAxiosError: () => false },
}));

vi.mock('@/lib/providerSettings', () => ({
  getProviderSettings: () => ({
    activeProvider: 'openrouter',
    agentModels: {
      researcher: { modelId: 'r-model' },
      planner: { modelId: 'p-model' },
      generator: { modelId: 'g-model' },
      quizzer: { modelId: 'q-model' },
    },
    providers: {
      openrouter: {
        apiKey: 'llm-secret', model: 'm', modelTitle: 'M',
        thinking: { enabled: false, effort: 'high' },
      },
      generalcompute: { apiKey: '', model: '', modelTitle: '' },
    },
  }),
  areAgentModelsConfigured: () => true,
  hasWebSearchCapability: () => mocks.capability,
  getWebSearchSettings: () => ({
    masterEnabled: mocks.capability,
    providers: {
      tavily: { apiKey: mocks.capability ? 'search-secret' : '', enabled: true },
      exa: { apiKey: '', enabled: false },
      brave: { apiKey: '', enabled: false },
      serpapi: { apiKey: '', enabled: false },
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => mocks.navigate };
});

const clients: QueryClient[] = [];

function renderInput(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TopicInput />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'Modern CSS' },
  });
  return client;
}

function selectMode(label: string): void {
  fireEvent.click(screen.getByRole('button', { name: /learning depth mode/i }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

function acceptedShell(
  mode: LearningDepthMode,
  count?: number,
  research = false,
): GenerateCourseAcceptedResponse {
  return {
    session: {
      id: 'session-1', user_id: null, query: 'Modern CSS',
      course_title: 'Modern CSS', mode, resolved_mode: null,
      custom_topic_count: mode === 'custom' ? count : null,
      title_finalized: false, total_nodes: 0, completed_nodes: 0,
      last_active_node_id: null, nodes: [],
      created_at: '2026-10-02T00:00:00Z', updated_at: null,
    },
    generation: {
      id: 'job-1', session_id: 'session-1', stage: 'INITIALIZING',
      web_search_requested: research,
      grounding_status: research ? 'PENDING' : 'DISABLED',
      counts: {
        topics_total: 0, briefs_ready: 0, topics_ready: 0,
        topics_failed: 0, research_sections: 0, sources: 0,
      },
      warnings: [], cancel_requested: false,
      can_cancel: true, can_resume: false, last_event_id: 1,
      created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reset();
  mocks.capability = true;
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
```

- [ ] **Step 2a (2-5 minutes): Append the count/research matrix below.**
- [ ] **Step 2b (2-5 minutes): Append invalid-draft correction coverage.**
- [ ] **Step 2c (2-5 minutes): Append old-mode transport and unavailable
      research coverage.** The complete workflow test block follows.
      The matrix matches
      the server payload exactly: query, mode, custom_topic_count, and scoped
      search headers. This combines P3 unit boundaries previously mocked apart.

```tsx
describe('Custom learning mode transport acceptance', () => {
  const cases = [1, 2, 5, 30].flatMap((count) => [
    { count, research: false },
    { count, research: true },
  ]);

  it.each(cases)('submits $count concepts with research=$research', async ({ count, research }) => {
    mocks.setAccepted(acceptedShell('custom', count, research));
    const client = renderInput();
    fireEvent.click(screen.getByRole('button', { name: /learning depth mode/i }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Auto', 'Lite', 'Full', 'Custom',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /number of concepts/i }), {
      target: { value: String(count) },
    });
    if (research) {
      fireEvent.click(screen.getByRole('switch', { name: 'Research' }));
    }
    expect(screen.getByRole('button', { name: /use web search/i })).toHaveAttribute(
      'aria-pressed', String(research),
    );
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/learning/generate', {
      query: 'Modern CSS', mode: 'custom', custom_topic_count: count,
    }, expect.any(Object));
    const headers = mocks.lastRequestConfig()?.headers;
    expect(headers).toMatchObject({
      'X-OpenRouter-Key': 'llm-secret',
      'X-Web-Search': String(research),
      'X-Planner-Model': 'p-model',
    });
    if (research) {
      expect(headers).toMatchObject({
        'X-Web-Search-Providers': 'tavily', 'X-Tavily-Key': 'search-secret',
      });
    } else {
      expect(headers).not.toHaveProperty('X-Tavily-Key');
      expect(headers).not.toHaveProperty('X-Web-Search-Providers');
    }
    const requestBody = mocks.post.mock.calls[0]?.[1];
    expect(JSON.stringify(requestBody)).not.toMatch(/llm-secret|search-secret/);
    expect(client.getQueryData<LearningSessionWithNodes>([
      'learningSession', 'session-1',
    ])).toMatchObject({
      mode: 'custom', custom_topic_count: count, total_nodes: 0, nodes: [],
      generation: { web_search_requested: research },
    });
  });

  it('blocks invalid drafts before transport, then submits a corrected count', async () => {
    mocks.setAccepted(acceptedShell('custom', 2));
    renderInput();
    selectMode('Custom');
    const input = screen.getByRole('spinbutton', { name: /number of concepts/i });
    for (const value of ['', '2.5', '0', '-1', '31']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/whole number between 1 and 30/i);
      expect(mocks.post).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
    }
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0]?.[1]).toEqual({
      query: 'Modern CSS', mode: 'custom', custom_topic_count: 2,
    });
  });

  it.each([
    { label: 'Auto', mode: 'auto' },
    { label: 'Lite', mode: 'lite' },
    { label: 'Full', mode: 'full' },
  ] satisfies { label: string; mode: LearningDepthMode }[])(
    'omits retained count when switched to $label and keeps research headers',
    async ({ label, mode }) => {
      mocks.setAccepted(acceptedShell(mode, undefined, true));
      const client = renderInput();
      selectMode('Custom');
      fireEvent.change(screen.getByRole('spinbutton', { name: /number of concepts/i }), {
        target: { value: '5' },
      });
      fireEvent.click(screen.getByRole('switch', { name: 'Research' }));
      selectMode(label);
      fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
      expect(mocks.post.mock.calls[0]?.[1]).toEqual({ query: 'Modern CSS', mode });
      expect(mocks.lastRequestConfig()?.headers).toMatchObject({
        'X-Web-Search': 'true', 'X-Tavily-Key': 'search-secret',
      });
      expect(client.getQueryData<LearningSessionWithNodes>([
        'learningSession', 'session-1',
      ])).toMatchObject({ mode, custom_topic_count: null });
    },
  );

  it('still transports a Custom request with no configured research provider', async () => {
    mocks.capability = false;
    mocks.setAccepted(acceptedShell('custom', 1));
    renderInput();
    selectMode('Custom');
    expect(screen.getByRole('switch', { name: 'Research' })).toBeDisabled();
    expect(screen.getByText(/configure web search provider in settings/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: /number of concepts/i }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
    expect(mocks.post.mock.calls[0]?.[1]).toEqual({
      query: 'Modern CSS', mode: 'custom', custom_topic_count: 1,
    });
    expect(mocks.lastRequestConfig()?.headers).toMatchObject({ 'X-Web-Search': 'false' });
    expect(mocks.lastRequestConfig()?.headers).not.toHaveProperty('X-Tavily-Key');
  });
});
```

- [ ] **Step 3: Run meaningful RED.** Temporarily change the matrix count
      input to `String(count === 30 ? 29 : count + 1)`, leaving the expected
      body unchanged. The input is valid, so the real transport posts the
      changed count and the payload assertion must fail.

From `D:/Peter/A2UI/client`:

```powershell
npm test -- --run src/features/learning/__tests__/customLearningMode.test.tsx -t "submits"
```

Expected: FAIL with differing `custom_topic_count` in the recorded POST.

- [ ] **Step 4: Minimal implementation and GREEN.** Restore `String(count)`.
      The existing TopicInput and real learningApi are the implementation;
      change no production files. Verify:

```powershell
npm test -- --run src/features/learning/__tests__/customLearningMode.test.tsx src/features/learning/TopicInput.test.tsx src/lib/learningApi.test.ts src/types/learning.test.ts
npm run build
npx eslint src/features/learning/__tests__/customLearningMode.test.tsx
```

Expected: all 13 new cases plus existing focused suites pass; build and new
file lint exit zero. Never suppress types with casts, `any`, or ignores.

- [ ] **Step 5: Commit from the repository root.**

```powershell
git add -- client/src/features/learning/__tests__/customLearningMode.test.tsx
git diff --cached --check
git diff --cached --stat
git commit -m "test(learning): verify custom controls through real client transport"
```

## Task 6: Run the integrated exit gate and coordinate any targeted defects

**Files:** Verify the two new tests and existing implementations read-only.
No additional file is owned by P4. Report evidence to the orchestrator for
`docs/custom-learning-mode/final_report.md` and `state.md`.

- [ ] **Step 1: Run the cross-layer checks together and report exact outcomes.**

Repository root:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_custom_learning_mode_integration server.tests.test_internet_generation_acceptance server.tests.test_generation_api server.tests.test_generation_session_view server.tests.test_generation_recovery server.tests.test_generation_runtime server.tests.test_staged_graph -v
```

Client working directory:

```powershell
npm test -- --run src/features/learning/__tests__/customLearningMode.test.tsx src/features/learning/__tests__/internetGroundedGeneration.test.tsx src/features/learning/TopicInput.test.tsx src/lib/learningApi.test.ts src/types/learning.test.ts
```

Expected: exit zero; count/research matrix, failure, parity, and regression
assertions pass. Record test totals, subcase matrices, exit codes, and any
unexpected warnings. Do not summarize a still-running command as passed.

- [ ] **Step 2: If a normal acceptance assertion fails, preserve the failing
      test and send a concrete defect report to the orchestrator.** Include
      the command, payload, expected/actual value, stack trace, failing
      boundary, and smallest affected function. Coordinate this ownership:

| Observed failure | Plan owner and exact affected files |
| --- | --- |
| Strict validation, session count omitted, shell/read mismatch | P1: `server/routers/learning.py` request model, `server/schemas/learning.py`, `server/database/learning_persistence.py`, `server/database/generation_jobs.py`, `server/database/repositories/mongo_learning.py`, `server/database/repositories/mongo_jobs.py` |
| Count lost from start/checkpoint, prompt/retry defect, failure not durable | P2: `server/services/generation_runtime.py`, `server/graph/state.py`, `server/graph/runner.py`, `server/graph/nodes.py`, `server/agents/planner.py` |
| Controls emit wrong body/headers, wrong seeded count or mode | P3: `client/src/features/learning/TopicInput.tsx`, `client/src/lib/learningApi.ts` |
| Defect in a fake or test assembly | P4: only the two new test files |

The owner reproduces with the exact P4 command, adds a focused failing test
in its owned unit suite, verifies RED on the smallest broken contract,
patches only that function, verifies GREEN in its suite and the original
P4 test, then selectively commits the fix. Use commit format
`fix(learning): preserve custom count at <boundary>` with the actual boundary
named, or `fix(planner): enforce custom count during <operation>` for a
planner defect. P4 never makes unilateral P1/P2/P3 edits, broad rewrites,
schema relaxations, or changes to assertions to accept wrong counts.
Run the impacted focused checks again after any owner fix. The final gate
stays open until required defects are resolved.

- [ ] **Step 3: Run full regressions and required final quality commands.**

From the root:

```powershell
server/.venv/Scripts/python.exe -m unittest
server/.venv/Scripts/python.exe -m compileall -q server/tests/test_custom_learning_mode_integration.py
git diff --check -- server/tests/test_custom_learning_mode_integration.py client/src/features/learning/__tests__/customLearningMode.test.tsx
```

From `D:/Peter/A2UI/client`:

```powershell
npm test -- --run
npm run build
npm run lint
npm run test:generation:coverage
npm test -- --run src/features/learning/TopicInput.test.tsx src/features/learning/__tests__/customLearningMode.test.tsx src/lib/learningApi.test.ts --coverage --coverage.include=src/features/learning/TopicInput.tsx --coverage.include=src/lib/learningApi.ts --coverage.reportsDirectory=D:/Peter/A2UI-P4-client-coverage
```

Expected: zero exit codes and no new lint errors. The configured generation
coverage gate remains 81% per-file branches/functions/lines/statements.
The focused report includes P3 unit tests, since P4 should not duplicate
units merely to inflate coverage. Compare feature-added executable lines
with the report and require **greater than 80% for new production code**.
Whole-file legacy coverage is not new-code coverage. P4 itself adds tests,
so do not claim a production coverage delta just from counting test lines.

- [ ] **Step 4: Verify backend new-code coverage using the available stdlib
      tracer, with output outside the checkout.**

```powershell
$p4TraceDir = Join-Path $env:TEMP 'a2ui-custom-p4-trace'
New-Item -ItemType Directory -Force -Path $p4TraceDir | Out-Null
server/.venv/Scripts/python.exe -m trace --count --missing --summary --coverdir $p4TraceDir --ignore-dir server/.venv --module unittest server.tests.test_custom_learning_mode_integration server.tests.test_depth_mode_schema server.tests.test_depth_mode_persistence server.tests.test_generation_jobs server.tests.test_mongo_jobs server.tests.test_mongo_learning server.tests.test_planner_mode server.tests.test_depth_router server.tests.test_generation_runtime server.tests.test_staged_graph server.tests.test_generation_recovery
git show --format= --unified=0 0f780e8 0339020 87612d4 8d5e562 290c6e8 c2c6681 f760787 6cc100f 5f7a283 e3ec1fe a5155a4 26837a8 0232440 30fb626 a5e96ab 92b4f64 -- server/schemas/learning.py server/routers/learning.py server/database/learning_persistence.py server/database/generation_jobs.py server/database/repositories/mongo_learning.py server/database/repositories/mongo_jobs.py server/agents/planner.py server/services/depth_router.py server/services/generation_runtime.py server/graph/state.py server/graph/nodes.py server/graph/runner.py
```

Use the listed committed feature hunks, not the full user working-tree diff.
Record executed added executable lines / total added executable lines and
require >80%. Exclude comments and erased type declarations. State that
stdlib trace reports line coverage, not branch coverage. Include any
owner-coordinated later fix commits in this comparison. No dependency
installation is required. Record real limitations or blockers; do not
silently downgrade a required gate.

- [ ] **Step 5: Report the matrix below, commits, RED/GREEN evidence, quality
      outcomes, limitations, and preservation audit to the orchestrator.**
      Give exact failed commands even for pre-existing failures; the
      orchestrator determines disposition. Do not repair unrelated user work.

| Criterion | New cross-layer proof |
| --- | --- |
| AC1: Auto/Lite/Full/Custom | Task 5 matrix asserts all four options before real transport submission |
| AC2: Count and research controls | Task 5 count/research matrix reaches real header/body builders and accepted cache |
| AC3: Exactly N, including 1/2/5/30 | Task 1 HTTP/runtime/real planner/full graph completion matrix; Task 2 corrected outline and durable second mismatch |
| AC4: Invalid count rejection | Task 3 HTTP 422 prevents runtime/store/task side effects; Task 5 invalid draft blocks Axios, corrected draft succeeds |
| AC5: Research off/on | Task 1 stage order, researcher call count, request search context and checkpoint flag; Task 5 scoped headers and unavailable-provider submission |
| AC6: Store and resume parity | Task 4 1/2/5/30 on both real repository implementations, HTTP shell/read/resume, closed/reopened checkpoints, same thread and count |
| AC7: Existing modes compatible | Task 3 real HTTP old-mode completion; Task 5 retained Custom count omitted after each old-mode selection, existing research state preserved |
| AC8: Quality gates | Negative controls precede final test composition; Task 6 focused/full tests, build, lint, diagnostics, coverage, and owner-coordinated RED/GREEN fixes; final phase records results |

P4 exits only when the count/research seam, durable failure, stored/resumed
count parity, and old-mode regressions pass. Full final checks must be run
and their outcomes reported; AC8 remains the final phase's recorded gate.

- [ ] **Step 6: Record checkpoint completion after acquiring the git slot.**
      Task 6 is verification-only. Use an empty checkpoint commit with this
      exact message, only when the shared index is empty and all exit gates
      pass; the note attaches the verification result without adding a third
      P4 file. Report detailed outcomes to the orchestrator before recording
      completion:

```powershell
git diff --cached --name-only
git commit --allow-empty -m "test(learning): record P4 integrated acceptance verification"
git notes append -m "P4 complete: client transport and HTTP/graph count-research acceptance; durable wrong-count failure; SQLite/Mongo repository read-resume count parity; regression and quality-gate evidence reported to orchestrator."
```

Do not create the checkpoint commit or completion note if an exit gate
failed. Commit messages for Tasks 1-6 are exact above; an owner defect commit is separate. The
orchestrator commits final verification documentation.

## Planner observations and self-check

- No production defect was established by this planning read. Upstream unit
  tests already cover strict counts, cardinality retry, reopened SQLite
  checkpoints, and control behavior. The new tests cover their composition.
- The acceptance harness's `plan` stub can falsely prove exact counts if
  reused unchanged; Task 1 restores real planner enforcement explicitly.
- The default harness `run` hardcodes Full. Task 1 submits Custom through
  the actual HTTP route and runtime instead of calling that helper.
- Research header spelling in older prose is stale; tests use the live
  `X-Web-Search` contract and the real request header parser.
- Mongo transport/transaction fakes and SQLite saver parity do not prove
  real Atlas or MongoDBSaver recovery; preserve this limit in the report.
- Some state.md sections retain historical “not started” text beneath the
  current P1/P2/P3 completion table. This plan consumes the implemented code
  and current P4 scope; it does not reopen completed work.
- All new files carry mandatory headers; this Markdown plan deliberately
  starts with plan content. All file paths use forward slashes.
- Self-review: every P4 exit gate and AC1-AC8 maps to a task; no production
  ownership expansion is planned; each code step has complete content,
  exact commands, a negative control, and scoped commit instructions.

### Plan-example validation performed on 2026-10-02

The assembled Python example was syntax-parsed and executed **in memory**
against the current repository: **6 tests passed**, including eight
count/research completion subcases, corrective retry, durable failure,
HTTP rejection, old-mode completion, and eight store/resume subcases.
Its source snippets have no Python line over 80 characters and separators
contain exactly 76 `=` characters.

The assembled client example was checked with a virtual TypeScript source
file: **zero diagnostics**. ESLint `lintText` reported **zero errors and
warnings**. A temporary copy outside the repository ran with the existing
Vitest dependencies: **13 tests passed**. The temporary test configuration
reused jsdom, jest-dom, the real source alias, and automatic JSX. The run
emitted the existing jsdom/parse5 experimental Node warning.

These are validation of executable plan examples, not implementation commits
or completion of P4's full regression/build/coverage gates. Only this plan
was written in the repository. Negative-control RED runs remain explicit
worker steps above; planning did not claim them as performed.
