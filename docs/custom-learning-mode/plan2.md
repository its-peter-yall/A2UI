# P2: Planner and Durable Runtime Implementation Plan

> **For agentic workers:** Use the `executing-plans` skill to implement this
> plan task by task. Track checkboxes and report the P2 exit gate to the
> orchestrator. P1 is implemented and committed; consume its contracts.

**Goal:** Generate exactly the requested number of Custom topics, without
classification, and retain the count through detached generation and resume.

**Architecture:** Extend the existing depth resolver and planner, including
its separate brief-planning call. Forward the persisted request count into
the existing secret-free graph state. Keep the graph topology, optional
research stage, one semantic retry, and durable failure mapping intact.

**Tech stack:** Python, Pydantic v2, stdlib unittest/AsyncMock, LangGraph
1.2.4, existing SQLite repositories and AsyncSqliteSaver. No new dependency.

---

## Scope and contracts

Read `docs/custom-learning-mode/goal.md`, `research.md`, `state.md`, and
`plan1.md` under `docs/custom-learning-mode/`, plus `docs/ARCHITECTURE.md`,
`docs/STACK.md`, `docs/CONVENTIONS.md`, and `docs/TESTING.md`. Relevant
supporting specs are `docs/STRUCTURE.md`, `docs/INTEGRATIONS.md`, and
`docs/CONCERNS.md`. Approved product behavior is fixed. This is P2 only.

P1 commits end at `6cc100f` at planning time. Its live contracts are:

```python
LearningDepthMode = Literal["auto", "lite", "full", "custom"]
ResolvedDepthMode = Literal["lite", "full", "custom"]

def validate_topic_count_for_mode(
    outline: "CourseOutline",
    mode: ResolvedDepthMode,
    custom_topic_count: Optional[int] = None,
) -> bool:
    # Existing P1 implementation; do not replace it in P2.
    count = len(outline.topics)
    if mode == "custom":
        if type(custom_topic_count) is not int:
            return False
        return 1 <= custom_topic_count <= 30 and count == custom_topic_count
    if custom_topic_count is not None:
        return False
    bounds = MODE_TOPIC_BOUNDS.get(mode)
    if bounds is None:
        return False
    return bounds[0] <= count <= bounds[1]
```

`GenerateCourseRequest.custom_topic_count` and
`LearningSessionResponse.custom_topic_count` are optional strict integers
with bounds 1-30, required for Custom and non-null rejected otherwise.
`CourseOutline` already accepts 1-30 topics. `MODE_TOPIC_BOUNDS` deliberately
has only Lite (3-10) and Full (10-30). Both store families already accept
`create_session_shell_and_job(..., custom_topic_count=None)` and return the
count independently of `total_nodes`. Do not replan or edit any P1 file.

The actual runner needs an owned-file change: it currently filters stored
`resolved_mode` to Lite/Full and builds start state without the count.
Resume already invokes `ainvoke(None)` on the same thread; retain that.
Checkpointed state, rather than a new resume request parameter, restores N.
The [official checkpointer guide](https://docs.langchain.com/oss/python/langgraph/checkpointers)
documents thread state and recovery from a failed super-step. The restart
test below uses the repository's existing AsyncSqliteSaver pattern.

Brief planning also calls `build_planner_system_prompt(mode)`. Supporting
Custom only in `plan()` would fail at the first brief batch. The existing
`GenerationBrief.expected_depth` remains `Literal["lite", "full"]`; Custom
controls course count, not a new per-topic pedagogy setting. Use the existing
Full default for that field in Custom prompt guidance. Existing research
runner normalization maps unrecognized depth modes to its Lite budget;
Custom continues through that existing behavior. Do not modify research
budgets, schemas, search headers, or persist credentials in P2.

### File ownership

| File | Responsibility |
| --- | --- |
| `server/services/depth_router.py` | Direct Custom resolution |
| `server/agents/planner.py` | Exact Custom template, semantic retry, brief prompt, small-outline complexity |
| `server/services/generation_runtime.py` | Forward request count and return it in accepted shell |
| `server/graph/state.py` | Optional checkpoint channel for requested count |
| `server/graph/nodes.py` | Skip resolver for Custom; pass count to outline planner |
| `server/graph/runner.py` | Start-state restoration from stored session only |
| `server/tests/test_depth_router.py` | Resolver bypass |
| `server/tests/test_planner_mode.py` | Prompt, exact count, retry, short outline, briefs |
| `server/tests/test_generation_runtime.py` | Detached shell count forwarding |
| `server/tests/test_staged_graph.py` | Node bypass, research routes, durable mismatch failure |
| `server/tests/test_graph.py` | State and batch regression |
| `server/tests/test_generation_recovery.py` | Session restoration and real checkpoint restart |

No new source/test file is necessary. Coordinate with the orchestrator before
expanding ownership. P3 owns the client form/API files and tests. Leave them
alone. The orchestrator owns `state.md` and final workflow documentation.

### Preparation and selective commits

Commands run in PowerShell from `D:/Peter/A2UI`. All paths use forward
slashes. Each numbered step is one action; implement long code blocks in
the explicitly listed smaller steps, retaining the complete test examples.

- [ ] Capture HEAD and owned-path user edits before execution:

```powershell
$p2Base = git rev-parse HEAD
$p2Baseline = Join-Path $env:TEMP 'a2ui-custom-p2-baseline.diff'
git diff -- server/agents/planner.py server/services/depth_router.py server/services/generation_runtime.py server/graph/state.py server/graph/nodes.py server/graph/runner.py server/tests/test_planner_mode.py server/tests/test_depth_router.py server/tests/test_generation_runtime.py server/tests/test_staged_graph.py server/tests/test_graph.py server/tests/test_generation_recovery.py | Set-Content -LiteralPath $p2Baseline -Encoding utf8
git diff --cached --name-only
```

There are approximately 283 pre-existing modified paths, including these
files. Preserve them. Every task commit below uses `git add -p` for exact
paths; stage only feature hunks compared with the captured baseline. Split
overlapping hunks or coordinate a feature-only patch. Obtain the shared git
mutation slot from the orchestrator before staging/committing. Check the
complete cached diff; never unstage someone else's work. Never use broad
staging, reset, checkout, restore, clean, or whole-file overwrites.

- [ ] Run the focused baseline:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode server.tests.test_depth_router server.tests.test_generation_runtime server.tests.test_staged_graph server.tests.test_graph server.tests.test_generation_recovery server.tests.test_planner_briefs -v
```

Planning baseline: **33 tests passed** on 2026-10-02. Rerun before execution.
Each task provides its exact RED and GREEN command. Keep old tests in place.

## Task 1: Bypass classification at both Custom entry points

**Modify:** `server/services/depth_router.py:resolve_depth_mode` and
`server/graph/nodes.py:initialize_generation_node`.
**Test:** `server/tests/test_depth_router.py` and
`server/tests/test_staged_graph.py`.

- [ ] **Step 1: Add this method to `DepthRouterTests`.**

```python
    async def test_custom_skips_classifier_and_llm(self) -> None:
        with (
            patch(
                "server.services.depth_router.classify_depth",
                new_callable=AsyncMock,
            ) as classify,
            patch(
                "server.services.depth_router.instructor_client."
                "create_structured",
                new_callable=AsyncMock,
            ) as create,
        ):
            for llm in (None, self.llm):
                with self.subTest(llm_present=llm is not None):
                    result = await resolve_depth_mode(
                        "Photosynthesis", "custom", llm_context=llm
                    )
                    self.assertEqual(result, "custom")
            classify.assert_not_called()
            create.assert_not_called()
```

- [ ] **Step 2: Add this method to `StagedGraphTests`.** No new imports.

```python
    async def test_custom_initialize_skips_depth_resolver(self) -> None:
        jobs = MagicMock()
        jobs.is_cancel_requested.return_value = False
        with (
            patch("server.graph.nodes.generation_job_store", jobs),
            patch("server.graph.nodes.learning_manager") as learning,
            patch("server.graph.nodes.progress_event_store"),
            patch(
                "server.graph.nodes.resolve_depth_mode",
                new_callable=AsyncMock,
            ) as resolve,
        ):
            result = await nodes.initialize_generation_node(
                {
                    "session_id": "s1",
                    "query": "Topic",
                    "mode": "custom",
                    "custom_topic_count": 2,
                },
                runtime={
                    "llm_context": LLMContext(api_key="k", model="m"),
                    "search_context": SearchContext(),
                },
            )
        self.assertEqual(result["resolved_mode"], "custom")
        resolve.assert_not_called()
        learning.update_session_resolved_mode.assert_called_once_with(
            "s1", "custom"
        )
```

- [ ] **Step 3: Run RED.** Expected: resolver returns Lite; initialization
      calls mocked resolver instead of returning Custom.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_router.DepthRouterTests.test_custom_skips_classifier_and_llm server.tests.test_staged_graph.StagedGraphTests.test_custom_initialize_skips_depth_resolver -v
```

- [ ] **Step 4: Update resolver return annotation and pass-through.** Import
      `ResolvedDepthMode` from `server.schemas.learning`; keep
      `DepthRouteResult.mode` Lite/Full because the classifier never outputs
      Custom. Replace only the return annotation and explicit-mode block:

```python
) -> ResolvedDepthMode:
```

```python
    if mode == "custom":
        return "custom"
    if mode == "lite":
        return "lite"
    if mode == "full":
        return "full"
```

Update the resolver docstring mode/return lists to include Custom. Keep Auto
fallback and classification unchanged; do not introduce a type-ignore.

- [ ] **Step 5: Replace the initializer's explicit-mode condition only.**

```python
    elif user_mode in ("lite", "full", "custom"):
        resolved_mode = user_mode
```

- [ ] **Step 6: Verify GREEN and all existing route cases.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_router server.tests.test_staged_graph -v
```

- [ ] **Step 7: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/services/depth_router.py server/graph/nodes.py server/tests/test_depth_router.py server/tests/test_staged_graph.py
git diff --cached --check
git diff --cached
git commit -m "feat(learning): bypass depth classification for custom mode"
```

## Task 2: Build exact-count prompts and permit small complexity distributions

**Modify:** `server/agents/planner.py:build_planner_system_prompt`, new
`build_custom_template`, and `validate_complexity_distribution`.
**Test:** `server/tests/test_planner_mode.py`.

- [ ] **Step 1: Extend the existing planner import with
      `validate_complexity_distribution`; add these `PlannerModeTests` methods.**

```python
    def test_custom_prompt_uses_exact_requested_count(self) -> None:
        for count in (1, 2, 7, 30):
            with self.subTest(count=count):
                prompt = build_planner_system_prompt("custom", count)
                self.assertIn("CUSTOM mode", prompt)
                self.assertIn(f"EXACTLY {count} topics", prompt)
                self.assertNotIn("LITE mode", prompt)
                self.assertNotIn("FULL mode", prompt)
                self.assertNotIn("{mode_template}", prompt)

    def test_custom_prompt_rejects_invalid_target(self) -> None:
        for count in (None, True, 0, 31, 2.5, "2"):
            with self.subTest(count=count):
                with self.assertRaises(ValueError):
                    build_planner_system_prompt("custom", count)

    def test_uniform_small_outline_is_valid(self) -> None:
        for count in (1, 2):
            with self.subTest(count=count):
                result = validate_complexity_distribution(_outline(count))
                self.assertTrue(result["valid"])
                self.assertEqual(result["errors"], [])

    def test_uniform_three_topics_still_invalid(self) -> None:
        result = validate_complexity_distribution(_outline(3))
        self.assertFalse(result["valid"])
        self.assertTrue(result["errors"])

    def test_small_outline_still_validates_quiz_count(self) -> None:
        outline = _outline(1)
        outline.topics[0].quiz_count = 2
        result = validate_complexity_distribution(outline)
        self.assertFalse(result["valid"])
        self.assertIn("expected 1", result["errors"][0])
```

- [ ] **Step 2: Run RED.** Expected: new prompt argument raises TypeError;
      uniform 1/2-topic outlines incorrectly fail. The 3-topic and quiz checks
      are regression assertions and should already pass.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode.PlannerModeTests.test_custom_prompt_uses_exact_requested_count server.tests.test_planner_mode.PlannerModeTests.test_custom_prompt_rejects_invalid_target server.tests.test_planner_mode.PlannerModeTests.test_uniform_small_outline_is_valid -v
```

- [ ] **Step 3: Add `MAX_COURSE_TOPICS`, `ResolvedDepthMode` to existing
      learning imports; add this helper immediately before prompt builder.**

```python
def build_custom_template(count: int) -> str:
    """Build exact-count constraints for a Custom curriculum.

    Args:
        count: Strict integer requested topic count, from 1 through 30.

    Returns:
        Custom mode constraints for outline and brief planning.

    Raises:
        ValueError: Count is missing, non-integer, or out of bounds.
    """
    if type(count) is not int or not 1 <= count <= MAX_COURSE_TOPICS:
        raise ValueError("custom_topic_count must be an integer from 1 to 30")
    return (
        "You are in CUSTOM mode.\n"
        f"- Produce EXACTLY {count} topics, no fewer and no more.\n"
        "- Keep topic indices contiguous from 0.\n"
        "- Preserve prerequisite ordering and atomic topic focus.\n"
        "- For 1 or 2 topics, uniform complexity is permitted.\n"
        "- Preserve the base quiz-count mapping.\n"
        "- In generation briefs, use expected_depth: full; "
        "this field describes topic pedagogy, not course length."
    )
```

- [ ] **Step 4: Replace prompt builder with this complete implementation.**

```python
def build_planner_system_prompt(
    mode: ResolvedDepthMode,
    custom_topic_count: Optional[int] = None,
) -> str:
    """Return the base prompt with resolved-mode constraints.

    Args:
        mode: Resolved Lite, Full, or Custom mode.
        custom_topic_count: Exact topic count, required for Custom.

    Returns:
        System prompt containing only the selected mode template.

    Raises:
        ValueError: Mode/count combination is invalid.
    """
    if mode == "custom":
        if custom_topic_count is None:
            raise ValueError("custom mode requires custom_topic_count")
        template = build_custom_template(custom_topic_count)
    else:
        if mode not in MODE_TEMPLATES or custom_topic_count is not None:
            raise ValueError("Invalid planner mode/count combination")
        template = MODE_TEMPLATES[mode]
    marker = "{mode_template}"
    if marker not in PLANNER_SYSTEM_PROMPT:
        return f"{PLANNER_SYSTEM_PROMPT}\n\n## Mode Constraints\n{template}"
    return PLANNER_SYSTEM_PROMPT.replace(marker, template)
```

- [ ] **Step 5: Guard only the uniform-complexity error.**

```python
    if total >= 3 and len(unique_complexities) == 1:
```

Leave quiz correlation and skew warnings intact. No blanket validator skip.

- [ ] **Step 6: Verify GREEN and prior mode prompts.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode server.tests.test_planner_briefs -v
```

- [ ] **Step 7: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/agents/planner.py server/tests/test_planner_mode.py
git diff --cached --check
git diff --cached
git commit -m "feat(planner): add exact custom prompts and small-outline validation"
```

## Task 3: Enforce exact outlines with one semantic retry

**Modify:** `server/agents/planner.py:PlannerAgent.plan`.
**Test:** `server/tests/test_planner_mode.py`.

- [ ] **Step 1: Add the following methods to `PlannerModeTests`.** Reuse
      existing `_topics`, `_outline`, `LLMContext`, and AsyncMock imports.

```python
    async def test_custom_accepts_exact_boundaries_and_middle(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        for count in (1, 2, 7, 30):
            with self.subTest(count=count):
                expected = _outline(count)
                with patch.object(
                    agent, "generate", new_callable=AsyncMock
                ) as generate:
                    generate.return_value = expected
                    actual = await agent.plan(
                        "Topic", mode="custom",
                        custom_topic_count=count, llm_context=llm,
                    )
                    self.assertIs(actual, expected)
                    self.assertEqual(len(actual.topics), count)
                    generate.assert_awaited_once()
                    prompt = generate.await_args.kwargs[
                        "system_prompt_override"
                    ]
                    self.assertIn(f"EXACTLY {count} topics", prompt)

    async def test_custom_retries_once_without_changing_outline(self) -> None:
        agent = PlannerAgent()
        for wrong in (1, 30):
            with self.subTest(wrong=wrong):
                invalid, expected = _outline(wrong), _outline(7)
                with patch.object(
                    agent, "generate", new_callable=AsyncMock
                ) as generate:
                    generate.side_effect = [invalid, expected]
                    result = await agent.plan(
                        "Topic", mode="custom", custom_topic_count=7,
                        llm_context=LLMContext(api_key="k", model="m"),
                    )
                    self.assertIs(result, expected)
                    self.assertEqual(len(invalid.topics), wrong)
                    self.assertEqual(generate.await_count, 2)
                    first, second = generate.await_args_list
                    correction = second.kwargs["user_message"]
                    self.assertIn(f"previously produced {wrong}", correction)
                    self.assertIn("EXACTLY 7 topics", correction)
                    self.assertIn("STRICT MODE CONSTRAINTS", correction)
                    self.assertEqual(
                        first.kwargs["system_prompt_override"],
                        second.kwargs["system_prompt_override"],
                    )

    async def test_custom_second_mismatch_raises_count_error(self) -> None:
        agent = PlannerAgent()
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as generate:
            generate.side_effect = [_outline(6), _outline(8)]
            with self.assertRaises(OutlineTopicCountError) as caught:
                await agent.plan(
                    "Topic", mode="custom", custom_topic_count=7,
                    llm_context=LLMContext(api_key="k", model="m"),
                )
            self.assertEqual(generate.await_count, 2)
        error = caught.exception
        self.assertEqual(
            (error.mode, error.count, error.min_topics, error.max_topics),
            ("custom", 8, 7, 7),
        )

    async def test_invalid_custom_target_never_calls_generate(self) -> None:
        agent = PlannerAgent()
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as generate:
            with self.assertRaises(ValueError):
                await agent.plan("Topic", mode="custom")
            with self.assertRaises(ValueError):
                await agent.plan(
                    "Topic", mode="lite", custom_topic_count=7
                )
            generate.assert_not_called()
```

- [ ] **Step 2: Run RED.** Expected: unsupported `custom_topic_count`
      keyword or invalid Custom mode error, before generation.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode.PlannerModeTests.test_custom_accepts_exact_boundaries_and_middle server.tests.test_planner_mode.PlannerModeTests.test_custom_retries_once_without_changing_outline server.tests.test_planner_mode.PlannerModeTests.test_custom_second_mismatch_raises_count_error server.tests.test_planner_mode.PlannerModeTests.test_invalid_custom_target_never_calls_generate -v
```

- [ ] **Step 3: Extend `plan()` signature and replace its initial guard/prompt
      setup.** Keep existing query, research_context, context, llm_context
      positional order and default Full mode; append optional count:

```python
        mode: ResolvedDepthMode = "full",
        custom_topic_count: Optional[int] = None,
```

```python
        system_prompt = build_planner_system_prompt(mode, custom_topic_count)
```

Delete `if mode not in MODE_TEMPLATES: ...` from `plan()`; the prompt builder
now validates mode/count before `generate`. Update Args/Returns/Raises to
include Custom exact counts and `ValueError` before any LLM call.

- [ ] **Step 4: Update BOTH acceptance checks using P1's exact signature.**

```python
        if validate_topic_count_for_mode(outline, mode, custom_topic_count):
```

Keep early return/logging and both existing `self.generate` calls unchanged.
Do not catch schema/transport exceptions or add another semantic retry.

- [ ] **Step 5: Replace bound lookup and correction message.**

```python
        if mode == "custom":
            # The prompt builder validated this before the first call.
            if custom_topic_count is None:
                raise ValueError("custom mode requires custom_topic_count")
            min_t = max_t = custom_topic_count
        else:
            min_t, max_t = MODE_TOPIC_BOUNDS[mode]
```

```python
        constraint = (
            f"EXACTLY {min_t} topics"
            if mode == "custom"
            else f"between {min_t} and {max_t} topics inclusive"
        )
        replan_message = (
            f"{user_message}\n\n"
            f"STRICT MODE CONSTRAINTS: You previously produced {count} "
            f"topics. You MUST produce {constraint} for {mode} mode. "
            "No fewer, no more. Regenerate the complete outline."
        )
```

Keep `raise OutlineTopicCountError(mode, final_count, min_t, max_t)` after
the second failed check. Never slice, pad, mutate, or accept the first bad
outline. This exception must continue escaping the outline node to runner.

- [ ] **Step 6: Verify GREEN and prior Lite/Full retry cases.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode server.tests.test_planner_briefs -v
```

- [ ] **Step 7: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/agents/planner.py server/tests/test_planner_mode.py
git diff --cached --check
git diff --cached
git commit -m "feat(planner): enforce custom topic count with one retry"
```

## Task 4: Keep Custom brief batches compatible with the planner

**Modify:** `server/agents/planner.py:PlannerAgent.plan_briefs`.
**Test:** `server/tests/test_planner_mode.py` (within ownership).

- [ ] **Step 1: Import `GenerationBrief`, `GenerationBriefBatch`, and
      `GroundingStatus` from `server.schemas.generation`. Add this local
      factory above `PlannerModeTests`.**

```python
def _custom_brief(index: int) -> GenerationBrief:
    return GenerationBrief(
        topic_index=index,
        topic_scope=f"Scope {index}",
        learning_objectives=[f"Explain topic {index}"],
        prerequisites=[],
        assumed_knowledge=[],
        current_facts=[],
        methodologies=[],
        conventions=[],
        deprecated_approaches=[],
        migration_notes=[],
        caveats=[],
        source_excerpts=None,
        required_examples=["Example"],
        common_misconceptions=["Misconception"],
        failure_modes=["Failure"],
        pedagogical_guidance="Explain clearly.",
        expected_depth="full",
        boundaries_with_adjacent_topics="Keep topic atomic.",
        quiz_learning_targets=["Recall"],
        expected_learner_evidence=["Explanation"],
        grounding_status=GroundingStatus.DISABLED,
    )
```

- [ ] **Step 2: Add this exact test to `PlannerModeTests`.** Cover preview,
      regular, and remainder batches with course count separate from batch
      count; use existing schema validation rather than model_construct.

```python
    async def test_custom_briefs_use_course_count_and_exact_indices(
        self,
    ) -> None:
        agent = PlannerAgent()
        cases = ((1, 0, 1), (2, 0, 2), (7, 3, 4), (30, 23, 7))
        for count, start, size in cases:
            with self.subTest(count=count, start=start):
                expected = GenerationBriefBatch(
                    start_index=start,
                    briefs=[
                        _custom_brief(i) for i in range(start, start + size)
                    ],
                )
                with patch.object(
                    agent, "generate", new_callable=AsyncMock
                ) as generate:
                    generate.return_value = expected
                    actual = await agent.plan_briefs(
                        outline=_outline(count), start_index=start,
                        batch_size=size, mode="custom",
                        llm_context=LLMContext(api_key="k", model="m"),
                    )
                    self.assertIs(actual, expected)
                    generate.assert_awaited_once()
                    prompt = generate.await_args.kwargs[
                        "system_prompt_override"
                    ]
                    self.assertIn(f"EXACTLY {count} topics", prompt)
                    self.assertIn("expected_depth: full", prompt)
                    self.assertEqual(
                        [brief.topic_index for brief in actual.briefs],
                        list(range(start, start + size)),
                    )
                    self.assertTrue(all(
                        brief.source_excerpts is None
                        and brief.research_report_id is None
                        for brief in actual.briefs
                    ))
```

- [ ] **Step 3: Run RED.** Expected: prompt builder rejects Custom without
      count before calling the mocked LLM.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode.PlannerModeTests.test_custom_briefs_use_course_count_and_exact_indices -v
```

- [ ] **Step 4: Change only `plan_briefs` mode type and prompt call.**

```python
        mode: ResolvedDepthMode = "full",
```

```python
        system_prompt = build_planner_system_prompt(
            mode,
            len(outline.topics) if mode == "custom" else None,
        )
```

The outline has already been accepted at exact N; derive N from its complete
topic list, never from `batch_size`. Keep all brief index, source, grounding,
retry and batch-size checks. Update the mode docstring to include Custom.
Do not change `GenerationBrief.expected_depth` or graph batch topology.

- [ ] **Step 5: Verify GREEN plus existing 3/10 and research-field tests.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_planner_mode server.tests.test_planner_briefs server.tests.test_generation_contracts -v
```

- [ ] **Step 6: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/agents/planner.py server/tests/test_planner_mode.py
git diff --cached --check
git diff --cached
git commit -m "feat(planner): support custom mode in staged brief planning"
```

## Task 5: Forward the request count through detached acceptance

**Modify:** `server/services/generation_runtime.py:start`,
`_shell_session_payload`.
**Test:** `server/tests/test_generation_runtime.py`.

- [ ] **Step 1: Add these tests to `GenerationRuntimeTests`.**

```python
    async def test_start_forwards_custom_count_and_returns_shell(self) -> None:
        for count in (1, 2, 7, 30):
            for research in (False, True):
                with self.subTest(count=count, research=research):
                    jobs, events, runner = MagicMock(), MagicMock(), AsyncMock()
                    jobs.create_session_shell_and_job.return_value = (
                        {
                            "id": "s1", "query": "Topic", "mode": "custom",
                            "custom_topic_count": count, "total_nodes": 0,
                            "created_at": "2026-10-02T00:00:00Z",
                        },
                        SimpleNamespace(id="j1"),
                    )
                    jobs.to_public.return_value = {"id": "j1"}
                    runtime = GenerationRuntime(
                        app_state=SimpleNamespace(), job_store=jobs,
                        event_store=events, runner=runner,
                    )
                    result = await runtime.start(
                        request_body=SimpleNamespace(
                            query="Topic", user_id=None, mode="custom",
                            custom_topic_count=count,
                        ),
                        llm_context=LLMContext(api_key="k", model="m"),
                        search_context=SearchContext(enabled=research),
                    )
                    await asyncio.gather(*runtime.active_tasks)
                    jobs.create_session_shell_and_job.assert_called_once_with(
                        query="Topic", user_id=None, mode="custom",
                        web_search_requested=research,
                        custom_topic_count=count,
                    )
                    self.assertEqual(
                        result["session"]["custom_topic_count"], count
                    )
                    self.assertEqual(result["session"]["total_nodes"], 0)
                    self.assertEqual(result["session"]["mode"], "custom")
                    runner.assert_awaited_once()
                    self.assertFalse(runner.await_args.kwargs["resume"])

    def test_legacy_shell_returns_null_custom_count(self) -> None:
        result = GenerationRuntime._shell_session_payload(
            {"id": "s-old", "mode": "lite", "total_nodes": 3}
        )
        self.assertIsNone(result["custom_topic_count"])
```

- [ ] **Step 2: Run RED.** Expected: missing forwarding keyword and missing
      count key in shell projection.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_generation_runtime.GenerationRuntimeTests.test_start_forwards_custom_count_and_returns_shell server.tests.test_generation_runtime.GenerationRuntimeTests.test_legacy_shell_returns_null_custom_count -v
```

- [ ] **Step 3: Add one keyword to `start` store call.** `getattr` keeps the
      existing legacy SimpleNamespace doubles compatible.

```python
            custom_topic_count=getattr(
                request_body, "custom_topic_count", None
            ),
```

- [ ] **Step 4: Add one member beside mode fields in shell payload.**

```python
            "custom_topic_count": session.get("custom_topic_count"),
```

- [ ] **Step 5: Verify GREEN plus detached task/lifecycle regression.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_generation_runtime server.tests.test_generation_api server.tests.test_generation_controls -v
```

- [ ] **Step 6: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/services/generation_runtime.py server/tests/test_generation_runtime.py
git diff --cached --check
git diff --cached
git commit -m "feat(runtime): retain custom requested count in accepted sessions"
```

## Task 6: Carry the stored count through start state and reopened checkpoints

**Modify:** `server/graph/state.py:CourseState`, `server/graph/runner.py`
(non-resume state construction only).
**Test:** `server/tests/test_graph.py`,
`server/tests/test_generation_recovery.py` (focused resume ownership).

- [ ] **Step 1: Add this method to `StagedStateTests`.**

```python
    def test_custom_count_is_a_checkpoint_state_channel(self) -> None:
        from typing import get_type_hints
        from server.graph.state import CourseState

        hints = get_type_hints(CourseState, include_extras=True)
        self.assertIn("custom_topic_count", hints)
        self.assertIn("NotRequired", str(hints["custom_topic_count"]))
```

- [ ] **Step 2: Extend recovery test imports with `patch`; add this test to
      `GenerationRunnerTests`.** Existing AsyncMock/MagicMock imports remain.

```python
    async def test_start_restores_custom_count_from_session(self) -> None:
        for count in (1, 2, 7, 30):
            with self.subTest(count=count):
                graph, jobs = AsyncMock(), MagicMock()
                jobs.get_by_session.return_value = SimpleNamespace(
                    id="j1", thread_id="gen-s1"
                )
                jobs.try_acquire_lock.return_value = SimpleNamespace(
                    owner="w1", version=1
                )
                session = {
                    "id": "s1", "query": "Topic", "mode": "custom",
                    "resolved_mode": "custom", "custom_topic_count": count,
                    "total_nodes": 0,
                }
                with patch(
                    "server.graph.runner.learning_manager."
                    "get_learning_session", return_value=session,
                ):
                    await run_generation_job(
                        app_state=SimpleNamespace(course_graph=graph),
                        session_id="s1", worker_id="w1",
                        llm_context=LLMContext(api_key="k", model="m"),
                        search_context=SearchContext(), job_store=jobs,
                        event_store=MagicMock(),
                    )
                state = graph.ainvoke.await_args.args[0]
                self.assertEqual(state["custom_topic_count"], count)
                self.assertEqual(state["resolved_mode"], "custom")
                self.assertEqual(state["mode"], "custom")
                self.assertEqual(state["topic_count"], 0)
                self.assertNotIn("llm_context", state)
                self.assertNotIn("search_context", state)
```

- [ ] **Step 3: Add imports and write the restart test.** Additional stdlib
      imports: `tempfile`, `Path` from `pathlib`. Third-party import:
      `AsyncSqliteSaver` from `langgraph.checkpoint.sqlite.aio`. Local imports:
      `GenerationJobStore`, `LearningManager`,
      `initialize_generation_schema`, and `build_graph` from their existing
      `server/database/generation_jobs.py`,
      `server/database/learning_persistence.py`,
      `server/database/generation_migrations.py`, `server/graph/build.py`
      modules. Add the complete method to `GenerationRunnerTests`:

```python
    async def test_custom_count_survives_reopened_checkpoint_resume(
        self,
    ) -> None:
        for count in (1, 2, 7, 30):
            with (
                self.subTest(count=count),
                tempfile.TemporaryDirectory() as tmp,
            ):
                db_path = Path(tmp) / "a2ui.db"
                cp_path = str(Path(tmp) / "checkpoints.db")
                learning = LearningManager(db_path)
                learning.init_learning_tables()
                initialize_generation_schema(db_path)
                jobs = GenerationJobStore(db_path)
                session, job = jobs.create_session_shell_and_job(
                    query="Topic", user_id=None, mode="custom",
                    custom_topic_count=count, web_search_requested=False,
                )
                seen = []

                async def pause_outline(state, runtime):
                    seen.append(state["custom_topic_count"])
                    raise ResumableGenerationError("pause before outline")

                async def resume_outline(state, runtime):
                    seen.append(state["custom_topic_count"])
                    return {"topic_count": count, "next_topic_index": 0}

                async def plan(state, runtime):
                    return {
                        "active_batch_start": 0,
                        "active_batch_size": 1,
                    }

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
                events = MagicMock()
                with (
                    patch("server.graph.runner.learning_manager", learning),
                    patch("server.graph.nodes.learning_manager", learning),
                    patch("server.graph.nodes.generation_job_store", jobs),
                    patch("server.graph.nodes.progress_event_store", events),
                    patch("server.graph.nodes.resolve_depth_mode",
                          new_callable=AsyncMock) as resolve,
                ):
                    saver_cm = AsyncSqliteSaver.from_conn_string(cp_path)
                    async with saver_cm as saver:
                        graph = build_graph(saver, node_overrides=overrides)
                        await run_generation_job(
                            app_state=SimpleNamespace(course_graph=graph),
                            session_id=session["id"], job_store=jobs,
                            event_store=events,
                            llm_context=LLMContext(api_key="k", model="m"),
                            search_context=SearchContext(),
                        )
                        self.assertEqual(
                            jobs.get_by_session(session["id"]).stage,
                            GenerationStage.PAUSED,
                        )
                    # Close/reopen saver and rebuild graph against same file.
                    overrides["outline_planner_node"] = resume_outline
                    jobs.prepare_resume(session["id"])
                    saver_cm = AsyncSqliteSaver.from_conn_string(cp_path)
                    async with saver_cm as saver:
                        graph = build_graph(saver, node_overrides=overrides)
                        config = {"configurable": {"thread_id": job.thread_id}}
                        before = await graph.aget_state(config)
                        self.assertEqual(
                            before.values["custom_topic_count"], count
                        )
                        with patch(
                            "server.graph.runner.learning_manager."
                            "get_learning_session"
                        ) as read_session:
                            await run_generation_job(
                                app_state=SimpleNamespace(course_graph=graph),
                                session_id=session["id"], resume=True,
                                job_store=jobs, event_store=events,
                                llm_context=LLMContext(
                                    api_key="fresh-key", model="m"
                                ),
                                search_context=SearchContext(),
                            )
                            read_session.assert_not_called()
                        after = await graph.aget_state(config)
                        self.assertEqual(
                            after.values["custom_topic_count"], count
                        )
                        self.assertEqual(after.values["mode"], "custom")
                        self.assertEqual(
                            after.values["resolved_mode"], "custom"
                        )
                        self.assertEqual(after.next, ())
                        self.assertNotIn("fresh-key", repr(after.values))
                    resolve.assert_not_called()
                self.assertEqual(seen, [count, count])
                self.assertEqual(
                    learning.get_learning_session(session["id"])[
                        "custom_topic_count"
                    ], count,
                )
```

This isolates count restoration, not content acceptance. Downstream workers
are fakes; the real initializer, runner, job/session stores, checkpoint schema,
and file reopening are exercised. Existing recovery tests separately assert
`None` input, stable thread, fresh contexts, and lock behavior. Do not claim
live Mongo checkpoint integration from this SQLite restart proof.

- [ ] **Step 4: Run RED.** Expected: state channel absent, runner start count
      absent/Custom resolved mode reset, and restart fails before checkpoint
      retains the count. If a real-store failure differs, diagnose it before
      changing production code; do not weaken assertions.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_graph.StagedStateTests.test_custom_count_is_a_checkpoint_state_channel server.tests.test_generation_recovery.GenerationRunnerTests.test_start_restores_custom_count_from_session server.tests.test_generation_recovery.GenerationRunnerTests.test_custom_count_survives_reopened_checkpoint_resume -v
```

- [ ] **Step 5: Add this member beside modes in `CourseState`.** Existing
      `NotRequired`, `Optional` imports suffice. Update mode comments to
      Auto/Lite/Full/Custom and Lite/Full/Custom respectively.

```python
    custom_topic_count: NotRequired[Optional[int]]
```

- [ ] **Step 6: Extend runner's stored-resolution whitelist.**

```python
            if resolved_mode not in ("lite", "full", "custom"):
                resolved_mode = None
```

- [ ] **Step 7: Add this member to the non-resume `input_data` dictionary
      beside mode fields.** Keep `topic_count: 0`, all reducers and context
      handling; never substitute requested count for actual topic count.

```python
                "custom_topic_count": (
                    session.get("custom_topic_count") if session else None
                ),
```

The `if resume: input_data = None` branch remains unchanged. No duplicate
request/session read, default count, new secret field, or graph rebuild in
production is required.

- [ ] **Step 8: Verify GREEN and all recovery/state regressions.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_graph server.tests.test_generation_recovery server.tests.test_generation_runtime server.tests.test_checkpointer server.tests.test_checkpoint_migration -v
```

- [ ] **Step 9: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/graph/state.py server/graph/runner.py server/tests/test_graph.py server/tests/test_generation_recovery.py
git diff --cached --check
git diff --cached
git commit -m "feat(graph): preserve custom count across generation start and resume"
```

## Task 7: Pass the count to the planner and prove durable mismatch failure

**Modify:** `server/graph/nodes.py:outline_planner_node`.
**Test:** `server/tests/test_staged_graph.py`.

- [ ] **Step 1: Add a local outline factory above `StagedGraphTests`.**

```python
def _custom_outline(count: int) -> CourseOutline:
    return CourseOutline(
        course_title="Custom Course",
        topics=[
            TopicNode(
                index=index, title=f"Topic {index}",
                summary_for_context=f"Summary {index}",
                key_terms=["term-a", "term-b"],
                complexity="Basic", quiz_count=1,
            )
            for index in range(count)
        ],
    )
```

- [ ] **Step 2: Add this boundary test to `StagedGraphTests`.**

```python
    async def test_outline_node_passes_custom_requested_count(self) -> None:
        jobs = MagicMock()
        jobs.is_cancel_requested.return_value = False
        jobs.get_by_session.return_value = None
        llm = LLMContext(api_key="k", model="m")
        with (
            patch("server.graph.nodes.generation_job_store", jobs),
            patch("server.graph.nodes.generation_artifact_store") as artifacts,
            patch("server.graph.nodes.progress_event_store"),
            patch("server.graph.nodes.planner_agent.plan",
                  new_callable=AsyncMock) as plan,
        ):
            expected = _custom_outline(2)
            plan.return_value = expected
            result = await nodes.outline_planner_node(
                {
                    "session_id": "s1", "query": "Topic",
                    "resolved_mode": "custom", "custom_topic_count": 2,
                }, runtime={"llm_context": llm},
            )
            self.assertEqual(plan.await_args.kwargs["custom_topic_count"], 2)
            self.assertEqual(plan.await_args.kwargs["mode"], "custom")
            self.assertEqual(result["topic_count"], 2)
            artifacts.persist_outline.assert_called_once_with("s1", expected)
```

- [ ] **Step 3: Add imports and durable failure test.** Add stdlib
      `tempfile`, `Path`, and `SimpleNamespace`; local imports
      `GenerationJobStore`, `LearningManager`, `GenerationArtifactStore`,
      `ProgressEventStore`, `initialize_generation_schema`, and
      `run_generation_job` from their existing modules in
      `server/database/` and `server/graph/runner.py`. Import
      `ProgressEventType` from `server.schemas.progress`.

```python
    async def test_second_count_mismatch_is_durably_failed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "a2ui.db"
            learning = LearningManager(db_path)
            learning.init_learning_tables()
            initialize_generation_schema(db_path)
            jobs = GenerationJobStore(db_path)
            events = ProgressEventStore(db_path)
            artifacts = GenerationArtifactStore(db_path)
            session, _ = jobs.create_session_shell_and_job(
                query="Topic", user_id=None, mode="custom",
                custom_topic_count=7, web_search_requested=False,
            )
            graph = build_graph()
            with (
                patch("server.graph.runner.learning_manager", learning),
                patch("server.graph.nodes.learning_manager", learning),
                patch("server.graph.nodes.generation_job_store", jobs),
                patch(
                    "server.graph.nodes.generation_artifact_store", artifacts
                ),
                patch("server.graph.nodes.progress_event_store", events),
                patch.object(
                    nodes.planner_agent, "generate", new_callable=AsyncMock
                ) as generate,
                patch("server.graph.nodes.planner_agent.plan_briefs",
                      new_callable=AsyncMock) as briefs,
            ):
                generate.side_effect = [_custom_outline(6), _custom_outline(8)]
                await run_generation_job(
                    app_state=SimpleNamespace(course_graph=graph),
                    session_id=session["id"], job_store=jobs,
                    event_store=events,
                    llm_context=LLMContext(api_key="k", model="m"),
                    search_context=SearchContext(),
                )
            self.assertEqual(generate.await_count, 2)
            briefs.assert_not_called()
            stored = jobs.get_by_session(session["id"])
            self.assertEqual(stored.stage, GenerationStage.FAILED)
            self.assertIsNone(stored.lock_owner)
            self.assertEqual(artifacts.count_topics(session["id"]), 0)
            self.assertEqual(learning.get_session_nodes(session["id"]), [])
            emitted = events.list_after(session["id"], 0)
            self.assertTrue(any(
                event.event_type == ProgressEventType.STAGE_CHANGED
                and event.payload.model_dump(mode="json").get("stage")
                == GenerationStage.FAILED.value
                for event in emitted
            ))
            self.assertFalse(any(
                event.event_type == ProgressEventType.OUTLINE_READY
                for event in emitted
            ))
```

- [ ] **Step 4: Run RED.** Expected: boundary count is missing; durable test
      gets zero generation calls because prompt rejects missing Custom N.
      The durable test must require TWO calls, ensuring an unrelated error
      cannot satisfy its FAILED assertion.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_staged_graph.StagedGraphTests.test_outline_node_passes_custom_requested_count server.tests.test_staged_graph.StagedGraphTests.test_second_count_mismatch_is_durably_failed -v
```

- [ ] **Step 5: Add this keyword to the existing `planner_agent.plan` call.**

```python
        custom_topic_count=state.get("custom_topic_count"),
```

Do not wrap `OutlineTopicCountError` in `ResumableGenerationError` and do not
change runner error mapping. Brief validation pauses and outline cardinality
failure remain distinct existing flows.

- [ ] **Step 6: Verify GREEN and durable failure/control regressions.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_staged_graph server.tests.test_planner_mode server.tests.test_generation_recovery server.tests.test_partial_failure server.tests.test_generation_controls -v
```

- [ ] **Step 7: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/graph/nodes.py server/tests/test_staged_graph.py
git diff --cached --check
git diff --cached
git commit -m "feat(graph): enforce custom outline count through durable failure flow"
```

## Task 8: Prove Custom research routing and batching compatibility

**Modify production:** None expected; reuse the unchanged optional stage and
batch topology. **Test:** `server/tests/test_staged_graph.py`,
`server/tests/test_graph.py`.

- [ ] **Step 1: Add this graph execution test to `StagedGraphTests`.** It
      runs the real initializer/research/outline nodes, with provider and
      persistence doubles, stopping downstream content work via node overrides.

```python
    async def test_custom_reuses_optional_research_stage(self) -> None:
        choices = ((False, None), (True, None), (True, "saved"))
        for enabled, report_id in choices:
            with self.subTest(enabled=enabled, report_id=report_id):
                calls = []
                jobs = MagicMock()
                jobs.is_cancel_requested.return_value = False
                jobs.get_by_session.return_value = None
                research_store = MagicMock()
                research_store.get_report_context.return_value = "Evidence"

                async def research(**kwargs):
                    calls.append("research")
                    return "new-report", False

                async def plan(**kwargs):
                    calls.append("outline")
                    self.assertEqual(kwargs["mode"], "custom")
                    self.assertEqual(kwargs["custom_topic_count"], 2)
                    return _custom_outline(2)

                graph = build_graph(node_overrides={
                    "plan_brief_batch_node": AsyncMock(return_value={
                        "active_batch_start": 0, "active_batch_size": 2,
                    }),
                    "generator_node": AsyncMock(return_value={}),
                    "prepare_quiz_batch_node": AsyncMock(return_value={}),
                    "quizzer_node": AsyncMock(return_value={}),
                    "advance_batch_node": AsyncMock(return_value={
                        "next_topic_index": 2,
                    }),
                    "finalize_generation_node": AsyncMock(return_value={}),
                })
                with (
                    patch("server.graph.nodes.generation_job_store", jobs),
                    patch("server.graph.nodes.learning_manager"),
                    patch("server.graph.nodes.generation_artifact_store"),
                    patch("server.graph.nodes.progress_event_store"),
                    patch("server.graph.nodes.research_store", research_store),
                    patch("server.graph.nodes.run_research",
                          new=AsyncMock(side_effect=research)) as run_research,
                    patch("server.graph.nodes.planner_agent.plan",
                          new=AsyncMock(side_effect=plan)) as planner,
                    patch("server.graph.nodes.resolve_depth_mode",
                          new_callable=AsyncMock) as resolve,
                ):
                    result = await graph.ainvoke({
                        "job_id": "j1", "session_id": "s1", "query": "Topic",
                        "user_id": None, "mode": "custom",
                        "custom_topic_count": 2, "web_search_enabled": enabled,
                        "research_report_id": report_id,
                        "next_topic_index": 0, "generator_results": [],
                        "topic_results": [], "degraded": False,
                    }, context={
                        "llm_context": LLMContext(api_key="k", model="m"),
                        "search_context": SearchContext(enabled=enabled),
                        "worker_id": "w1",
                    })
                resolve.assert_not_called()
                planner.assert_awaited_once()
                self.assertEqual(result["custom_topic_count"], 2)
                if enabled and report_id is None:
                    run_research.assert_awaited_once()
                    self.assertEqual(calls, ["research", "outline"])
                    self.assertEqual(result["research_report_id"], "new-report")
                else:
                    run_research.assert_not_called()
                    self.assertEqual(calls, ["outline"])
                expected_context = "Evidence" if enabled else None
                self.assertEqual(
                    planner.await_args.kwargs["research_context"],
                    expected_context,
                )
```

- [ ] **Step 2: Add this regression test to `StagedStateTests`.**

```python
    def test_custom_counts_retain_existing_batch_schedule(self) -> None:
        from server.graph.nodes import route_next_batch, select_topic_batch

        expected = {
            1: [(0, 1)],
            2: [(0, 2)],
            7: [(0, 3), (3, 4)],
            30: [(0, 3), (3, 10), (13, 10), (23, 7)],
        }
        for count, batches in expected.items():
            with self.subTest(count=count):
                cursor, actual = 0, []
                while cursor < count:
                    batch = select_topic_batch(cursor, count)
                    actual.append((batch.start, batch.size))
                    cursor = batch.start + batch.size
                    route = route_next_batch({
                        "topic_count": count, "next_topic_index": cursor,
                    })
                    self.assertEqual(
                        route, "plan_next" if cursor < count else "finalize"
                    )
                self.assertEqual(actual, batches)
```

- [ ] **Step 3: Run the exact focused command.** These assertions are added
      WITH the implementation from Tasks 1/6/7 and should be GREEN now.
      For independent RED evidence, execute the research test after Task 6
      and before Task 7's keyword change: it fails on the missing count.
      The batch test is a regression test and is expected to pass at baseline;
      never introduce an artificial batch failure to pretend RED occurred.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_staged_graph.StagedGraphTests.test_custom_reuses_optional_research_stage server.tests.test_graph.StagedStateTests.test_custom_counts_retain_existing_batch_schedule -v
```

- [ ] **Step 4: Verify unchanged production behavior.** The relevant existing
      implementations stay exactly:

```python
def route_optional_research(state: CourseState, runtime: Any = None) -> str:
    if state.get("web_search_enabled") and not state.get("research_report_id"):
        return "researcher_node"
    return "outline_planner_node"
```

```python
def select_topic_batch(cursor: int, total_topics: int) -> BatchSpec:
    if cursor == 0:
        size = min(PREVIEW_BATCH_SIZE, total_topics)
    else:
        size = min(STANDARD_BATCH_SIZE, total_topics - cursor)
    return BatchSpec(start=cursor, size=size)
```

No new research pipeline, graph edge, or batching implementation. If a test
finds a defect, diagnose it and coordinate any change outside owned files.

- [ ] **Step 5: Run the compatibility suite.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_router server.tests.test_planner_mode server.tests.test_planner_briefs server.tests.test_generation_runtime server.tests.test_staged_graph server.tests.test_graph server.tests.test_generation_recovery server.tests.test_grounded_generation server.tests.test_run_research_production -v
```

- [ ] **Step 6: Selectively stage, inspect, and commit.**

```powershell
git add -p -- server/tests/test_staged_graph.py server/tests/test_graph.py
git diff --cached --check
git diff --cached
git commit -m "test(learning): verify custom research routing and batch compatibility"
```

## P2 verification and handoff

- [ ] Run P2 regressions plus committed P1 contracts; record exact outcomes:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_router server.tests.test_planner_mode server.tests.test_planner_briefs server.tests.test_generation_runtime server.tests.test_staged_graph server.tests.test_graph server.tests.test_generation_recovery server.tests.test_generation_api server.tests.test_generation_controls server.tests.test_grounded_generation server.tests.test_run_research_production server.tests.test_depth_mode_schema server.tests.test_depth_mode_persistence server.tests.test_generation_jobs server.tests.test_mongo_jobs server.tests.test_mongo_learning -v
```

Expected: all pass; mock providers prevent network calls. P2 does not execute
P3 client acceptance or add P4 integration files. Full backend/client suites,
client build and lint remain the orchestrator's final workflow gate.

- [ ] Run exact-path whitespace and Python compilation diagnostics:

```powershell
git diff --check -- server/agents/planner.py server/services/depth_router.py server/services/generation_runtime.py server/graph/state.py server/graph/nodes.py server/graph/runner.py server/tests/test_planner_mode.py server/tests/test_depth_router.py server/tests/test_generation_runtime.py server/tests/test_staged_graph.py server/tests/test_graph.py server/tests/test_generation_recovery.py
server/.venv/Scripts/python.exe -m compileall -q server/agents/planner.py server/services/depth_router.py server/services/generation_runtime.py server/graph/state.py server/graph/nodes.py server/graph/runner.py server/tests/test_planner_mode.py server/tests/test_depth_router.py server/tests/test_generation_runtime.py server/tests/test_staged_graph.py server/tests/test_graph.py server/tests/test_generation_recovery.py
```

Expected: exit 0. Retain mandatory existing source headers. All added Python
lines should fit the 80-column convention; wrap long test context managers
and chained assertions before committing. Do not reformat unrelated code.

- [ ] Measure >80% new executable Python line coverage without installing a
      dependency. Use the available stdlib tracer; artifacts go outside repo:

```powershell
$p2TraceDir = Join-Path $env:TEMP 'a2ui-custom-p2-trace'
New-Item -ItemType Directory -Force -Path $p2TraceDir | Out-Null
server/.venv/Scripts/python.exe -m trace --count --missing --summary --coverdir $p2TraceDir --ignore-dir server/.venv --module unittest server.tests.test_depth_router server.tests.test_planner_mode server.tests.test_planner_briefs server.tests.test_generation_runtime server.tests.test_staged_graph server.tests.test_graph server.tests.test_generation_recovery
git diff --unified=0 $p2Base HEAD -- server/agents/planner.py server/services/depth_router.py server/services/generation_runtime.py server/graph/state.py server/graph/nodes.py server/graph/runner.py
```

Compare only added executable lines in P2 feature commit hunks to `.cover`
execution counts, excluding existing baseline/user hunks, comments, annotations
and docstrings. Record executed/new executable numerator and denominator;
require >80%. Whole-module coverage is not the new-code gate. Stdlib trace
measures line coverage, not branch coverage. The defensive missing-N guard
after a validated prompt is intentionally unreachable; record it as uncovered
rather than mocking validation to manufacture coverage. Exercise prompt
missing/invalid targets, exact pass, retry success, second failure, old modes,
small uniform and quiz errors, legacy runtime doubles and reopened checkpoints.

- [ ] Review commit diffs against `$p2Baseline` and confirm no other user's
      hunks were staged. Obtain git slot and append a checkpoint note:

```powershell
git notes append -m "P2 complete: Custom bypasses classification; exact-count outline retry/failure, brief compatibility, requested count start/checkpoint/resume, optional research and batching verified."
```

Report eight task commit hashes, RED/GREEN evidence, regression outcomes,
new-line coverage numerator/denominator, and any unresolved diagnostic. Ask
the orchestrator to update state; do not edit it yourself.

| P2 exit requirement | Proof |
| --- | --- |
| Exact counts 1, 2, intermediate, 30 | Task 3 exact-outline tests; Task 4 brief batches |
| No Custom classifier/LLM call | Task 1 resolver and initializer mocks never called |
| Wrong count retries once | Task 3 under/over target, exactly two calls |
| Second mismatch durably fails | Task 3 exception attributes; Task 7 real stored FAILED event and no outline |
| Stored count enters graph | Task 5 forwarding; Task 6 start state for 1/2/7/30 |
| Count survives actual resume | Task 6 saver close/reopen, same thread, no session reread, preserved N |
| Research on/off follows existing stage | Task 8 real stage ordering and saved-report skip |
| Lite/Full/Auto and batching stay compatible | Existing suites retained; Tasks 4/8 plus exit regression command |
| No secrets persisted | Existing state/recovery tests; Task 6 fresh key absent from checkpoint |

### Risks and plan validation

- The plan preserves the existing Full brief pedagogy default and existing
  Lite research-budget fallback for Custom. No unrelated schema or budget
  expansion is required; report these technical constraints at handoff.
- Start without an existing checkpoint and resume from an existing checkpoint
  are different contracts. This plan does not invent a missing-checkpoint
  recovery policy or replay completed work to recover a count.
- SQLite checkpoint restart is directly tested here. Mongo repository parity
  is committed P1 and rerun read-only; broader store/checkpoint integration
  remains owned by the later acceptance phase.
- Headers and other user work are present in owned files; selective hunk
  staging is mandatory on every commit.
- Planning validation is separate from implementation: the planner ran the
  33-test focused baseline successfully. Future test code and RED/GREEN steps
  are instructions, not claims that Custom is implemented already.

Planner self-review on 2026-10-02: all 37 Python snippets syntax-parse, all
Python snippet lines fit 80 columns, and every referenced Python source path
exists. All 21 proposed test methods passed in a temporary in-memory rehearsal
of the proposed function changes, including the real SQLite failure and saver
reopening cases. No production or test file was written by that rehearsal.
Workers must still perform and record actual RED/GREEN steps against their
owned workspace changes; this validation does not replace execution.
