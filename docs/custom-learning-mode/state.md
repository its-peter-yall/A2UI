---
objective: custom-learning-mode
workflow: maw
status: paused
skipped_phases: [review]
source: realtime user request, 2026-10-02
goal_status: approved
dag_status: initial
resume_gate: awaiting-user-resume
current_phase: pre-research
pause_reason: User requested researcher stop and complete state before resuming MAW.
---

# State & Dependency Graph: Custom Learning Mode

## Workflow configuration

- Workspace: D:/Peter/A2UI. Shell: PowerShell.
- Keep all workflow artifacts directly in docs/custom-learning-mode/.
- Invocation configuration: MAW --skip review. Research remains required.
- Mandatory phases: brainstorming, planning, worker execution, and final
  verification. Technical research is enabled. Unified code review is skipped.
- Goal approval: user explicitly approved the written design on 2026-10-02.
  Approval persists; do not ask for it again when this workflow resumes.
- Execution is paused at the user's explicit request. Do not spawn, resume,
  or dispatch any agent until the user explicitly resumes MAW.
- After resume, research is the first phase. Do not dispatch planners before
  the research artifact is committed and its summary reconciled with this DAG.
- Orchestrator manages the workflow and documentation; subagents implement.
- Orchestrator MUST NOT read research.md or plan*.md. Verify their existence
  and commits with git log -1 --stat <hash>; use reported summaries to manage
  dependencies and pass artifact paths directly to the next agent.
- Available concurrency: four agents including orchestrator. Independent
  planners run concurrently; dispatch each ready worker immediately after its
  plan is committed and all worker dependencies are complete.
- Serialize git staging and commits in the shared checkout.

## Workflow milestones

- [x] Step 1: Brainstorming & Goal Alignment (approved; 6123d6b)
- [ ] Step 2: Technical Research (required; interrupted before artifact)
- [ ] Step 3: Planning Completed (plan1.md through plan4.md)
- [ ] Step 4: Execution Completed (all workers and tests)
- [x] Step 5: Unified Code Review (Skipped via explicit --skip review request)
- [ ] Step 6: Final Verification & Report (final_report.md)

## Brainstorming tasks

- [x] Explore source idea, specs, architecture, conventions, and recent commits.
- [x] Clarify requirements, scope, and exact concept-count semantics.
- [x] Compare settings row, dropdown controls, and modal approaches.
- [x] Recommend a compact settings row and present the design.
- [x] Write goal.md (5d9c80a) and self-check consistency, ambiguity, and scope.
- [x] Record explicit approval of the written goal and 1-30 count range
  (6123d6b).
- [x] Construct pre-research DAG, file ownership, exit gates, acceptance
  mapping, and resume procedure.
- [x] Record review skip and explicit pause; stop the researcher.

## Initial findings

- client/src/features/learning/TopicInput.tsx owns the mode dropdown and
  webSearchEnabled state. It currently offers Auto, Lite, and Full.
- client/src/types/learning.ts defines selected modes auto|lite|full and
  resolved modes lite|full. GenerateCourseRequest has no custom count.
- server/routers/learning.py contains GenerateCourseRequest.
- server/schemas/learning.py defines MODE_TOPIC_BOUNDS: lite 3-10, full 10-30;
  MAX_COURSE_TOPICS is 30. CourseOutline has schema and explicit validator
  minimums of three topics; both need to support 1/2-topic Custom outlines.
- server/agents/planner.py receives resolved modes, injects mode templates,
  and retries once when the outline violates the mode's bounds.
- server/services/depth_router.py resolves Auto through an LLM classifier.
- server/services/generation_runtime.py.start calls the generation job
  repository to create the shell and job. Resume restores persisted mode.
- The shell is created in server/database/generation_jobs.py and its Mongo
  counterpart server/database/repositories/mongo_jobs.py, through the
  GenerationJobRepository contract in repositories/protocols.py. Updating
  only LearningManager would miss the production shell creation path.
- server/graph/state.py checkpoints mode, resolved_mode, web_search_enabled,
  and topic_count. Requested count must remain distinct from actual count.
- server/graph/nodes.py already routes optional research using
  web_search_enabled and research_report_id.
- client/src/lib/learningApi.ts already accepts webSearchEnabled options and
  builds scoped search headers. Reuse this path and its credential boundary.
- SQLite and Mongo persistence are selected through repository facades.
- Relevant docs: ARCHITECTURE.md, STACK.md, TESTING.md, CONVENTIONS.md,
  STRUCTURE.md, INTEGRATIONS.md, CONCERNS.md, and learning-depth-modes/goal.md.

## Confirmed product decisions

- Auto intelligently chooses Lite or Full based on subject complexity.
- Lite supports simple subjects; Full supports larger, more detailed courses.
- Add Custom as a fourth mode without changing those existing semantics.
- In Custom, the user supplies an exact number of concept cards, 1-30.
- Count initially empty; valid integer input is required before submission.
- Show Number of concepts and Research controls in a settings row below the
  topic input only while Custom is selected.
- Research is optional and initially off. Its control and the existing globe
  use a single shared per-course value.
- When research capability is unavailable, show the Custom research control
  disabled with Settings guidance; research-off generation remains usable.
- Retain the entered count while switching modes in the mounted form; send
  it only for Custom. Preserve Auto as the initial mode.
- Custom bypasses automatic classification and enforces exact cardinality.
- Wrong-count outlines get one strict retry, then a durable generation error;
  do not silently accept, truncate, or pad a different count.
- Persist requested count and mode for both storage backends and resume.
- Skip unified review only. Keep research, TDD, build, lint, regressions,
  diagnostics, coverage verification, and final reporting.

## File preservation rules and shared-workspace safety

- There were 283 modified paths before this feature's implementation, largely
  existing header simplifications. They are user work; do not restore,
  overwrite, or inadvertently commit unrelated changes.
- Source example: TopicInput.tsx already has a seven-line header deletion.
  Other files have similar baseline edits, and learning.py also has a changed
  line. Do not assume every pending hunk belongs to Custom.
- Before editing, each worker records baseline diffs for its owned paths.
  Commit only feature hunks using selective staging; inspect the staged diff.
  If feature and baseline hunks overlap, coordinate with the orchestrator to
  stage the intended feature change without sweeping in user modifications.
- Never use git add . or broad directory staging for source code.
- Do not revert another agent's changes. Every worker is told it is not alone.
- Python: use server/.venv/Scripts/python.exe -m from repository root.
- New source files need mandatory 76-character separator headers. Use named
  TypeScript exports, strict types, and existing API/repository patterns.

## Dependency matrix & execution status

R means research completed and committed. P# worker prerequisites mean the
implementation and focused tests are complete and committed. All execution
below additionally requires explicit user resume.

| Plan | Title and scope | Worker prerequisites | Files/subsystems | Planner status | Worker status | Commits |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Contracts and persistence | R | TS/Pydantic contracts; SQLite/Mongo shell and session storage | Pending | Pending | None |
| P2 | Planner and durable runtime | P1 | Depth resolution; exact-count planner; graph/start/resume | Pending | Pending | None |
| P3 | Custom settings and API payload | P1 | TopicInput; learning API; focused client tests | Pending | Pending | None |
| P4 | Integrated acceptance | P2, P3 | Cross-layer tests and verification evidence | Pending | Pending | None |

### Execution graph

```mermaid
flowchart TD
  G[Goal approved and state complete] --> H[Explicit user resume]
  H --> R[Technical research committed]
  R --> P1[P1 contracts and persistence]
  P1 --> P2[P2 planner and runtime]
  P1 --> P3[P3 Custom settings UI]
  P2 --> P4[P4 integrated acceptance]
  P3 --> P4
  P4 --> V[Final verification and report]
```

### Planner readiness and immediate worker dispatch

| Planner | Earliest planning prerequisites | Worker start condition |
| --- | --- | --- |
| P1 | User resume and R committed | plan1.md committed |
| P2 | P1 worker committed | plan2.md committed and P1 complete |
| P3 | P1 worker committed | plan3.md committed and P1 complete |
| P4 | P1 complete; P2/P3 plans committed | plan4.md committed; P2/P3 workers complete |

- P2/P3 planners run concurrently in the foreground; their workers own
  disjoint files and may run concurrently when ready.
- Start any ready worker immediately; do not wait for all planners.
- One agent at a time may stage/commit. Coordinate the shared git index.
- A changed upstream contract pauses affected downstream work until the
  contract, plans, and types are reconciled.
- Research may refine exact ownership and tests; update this state before
  dispatching planners, without changing approved product behavior.

## Plan scopes, file ownership, and completion gates

### P1 - Contracts and persistence

Deliverable: docs/custom-learning-mode/plan1.md and implementation commit(s).

Owned production files:
- client/src/types/learning.ts
- server/schemas/learning.py
- server/routers/learning.py (request model changes only)
- server/database/learning_persistence.py
- server/database/generation_jobs.py
- server/database/repositories/protocols.py
- server/database/repositories/mongo_learning.py
- server/database/repositories/mongo_jobs.py
- server/database/repositories/sqlite.py only if the adapter requires changes
- server/database/generation_migrations.py only if research confirms need;
  preserve the existing LearningManager migration ownership/pattern.

Owned existing tests: client/src/types/learning.test.ts;
server/tests/test_depth_mode_schema.py, test_depth_mode_persistence.py,
test_generation_jobs.py, test_mongo_jobs.py, test_mongo_learning.py, and
focused repository contract tests where needed.

Contract: add custom selected/resolved modes and optional custom_topic_count;
strict integer range 1-30, required for Custom and non-null rejected otherwise.
Allow general outline cardinality 1-30 while retaining per-mode validation.
Persist requested count independently of total_nodes on shell/session records;
existing records without the new field remain readable.

Exit gate: failing-then-passing request/schema tests, 1/2/30-topic schemas,
invalid-type/range tests, SQLite/Mongo session and shell round trips, existing
mode compatibility, and idempotent schema initialization/migration tests.

### P2 - Planner and durable runtime

Deliverable: docs/custom-learning-mode/plan2.md and implementation commit(s).

Owned production files: server/agents/planner.py,
server/services/depth_router.py, server/services/generation_runtime.py,
server/graph/state.py, server/graph/nodes.py, and server/graph/runner.py only
if necessary for start/resume state propagation.

Owned existing tests: server/tests/test_planner_mode.py, test_depth_router.py,
test_generation_runtime.py, test_staged_graph.py, test_graph.py, and focused
resume tests. Coordinate additional files before changing ownership.

Contract: Custom resolves to custom without a classifier call. Planner uses
an exact-count template and validation, with one retry and existing durable
failure mapping. Carry count through graph start/checkpoints/session restore.
Research true/false continues through the existing optional stage.

Exit gate: exact counts 1, 2, intermediate, and 30; bypassed classifier;
one retry and second-mismatch failure; stored count survives resume; research
on/off routing; existing Lite/Full/Auto and batching regressions pass.

### P3 - Custom settings and API payload

Deliverable: docs/custom-learning-mode/plan3.md and implementation commit(s).

Owned production files: client/src/features/learning/TopicInput.tsx and
client/src/lib/learningApi.ts only if request transport requires changes.
Owned tests: their co-located TopicInput.test.tsx and learningApi.test.ts.

Contract: show Custom in the existing dropdown, reveal accessible controls
below the input, validate count, share one research state with the globe,
handle unavailable capability, retain entered count across mode changes,
and omit custom_topic_count for other modes. Preserve progressive session
navigation and model/API-key gating; retain count/mode in seeded cache if
required by the extended session contract.

Exit gate: four options; count field only in Custom; exact payload; invalid
and empty counts blocked; shared research state and disabled guidance;
pending controls disabled; narrow viewport layout remains usable; tests,
TypeScript build, and relevant lint diagnostics pass.

### P4 - Integrated acceptance

Deliverable: docs/custom-learning-mode/plan4.md and integration commit(s).

Owned new tests: server/tests/test_custom_learning_mode_integration.py and
client/src/features/learning/__tests__/customLearningMode.test.tsx, adding
only tests that meaningfully prove cross-layer behavior. Use existing fixture
patterns and mocked external providers. Add mandatory headers to new files.

No unilateral edits to P1/P2/P3 production files. Coordinate defect fixes with
owners; integration verification is required even though review is skipped.

Exit gate: count and research choices survive UI/API/graph boundaries; durable
wrong-count failure is observable; resume and SQLite/Mongo contracts are
covered; existing modes pass regression. Record precise command outcomes.

## Acceptance coverage

| Goal criterion | Primary owners | Integrated verification |
| --- | --- | --- |
| AC1: Four dropdown modes | P3 | P4 client acceptance |
| AC2: Count and Research controls | P3 | P4 client acceptance |
| AC3: Exactly N topics, including 1/2/30 | P1, P2 | P4 server acceptance |
| AC4: Invalid count rejection | P1, P3 | P4 boundary tests |
| AC5: Research off/on stage selection | P2, P3 | P4 graph acceptance |
| AC6: Store parity and resumed count | P1, P2 | P4 persistence/resume acceptance |
| AC7: Existing modes remain compatible | All | Regression suites |
| AC8: TDD and quality gates | All | Final diagnostics/build/lint/coverage |

## Research handoff - interrupted; required after resume

Agent: /root/custom_research. Status: interrupted by orchestrator at user's
request. No research.md exists and no research commit was produced. Do not
mark research complete or reuse unreported conclusions.

On resume, restart research with the approved goal and this complete state.
Researcher owns ONLY docs/custom-learning-mode/research.md; it does not
implement. Its instructions must require preservation of existing changes.

Research deliverables:
1. Trace exact count through request, shell creation, session reads, graph
   start, checkpoints, and resume on SQLite and Mongo.
2. Identify every outline/count assumption that prevents 1/2-topic courses,
   including briefs/batches, complexity checks, and graph termination.
3. Specify strict validation, dynamic exact-count planner constraints, and
   one-retry failure handling using current project patterns.
4. Confirm research availability/model gates, shared UI state, search headers,
   optional graph research, and resume behavior without persisting secrets.
5. Inspect tests/fixtures, identify baseline failures, and refine disjoint
   ownership and acceptance coverage. Verify unfamiliar APIs using official
   documentation before recommending their use.
6. Commit research.md only and report its path, hash, concise architectural
   summary, exact files/contracts, commands, pitfalls, and DAG adjustments.

Orchestrator verifies the research commit without reading research.md, records
its reported decisions here, and sets dag_status to research-reconciled.

## Final verification commands and evidence

| Working directory | Command | Purpose/status |
| --- | --- | --- |
| client | npm run test -- --run | Full client regression; baseline interrupted on pause |
| client | npm run build | TypeScript + Vite; not run |
| client | npm run lint | ESLint; not run |
| repository root | server/.venv/Scripts/python.exe -m unittest | Full backend regression; baseline interrupted on pause |
| client | Focused Vitest coverage for changed files | Select exact command in plans; target >80% new code |
| repository root | Backend coverage command supported by environment | Research availability; document method and any limitation |
| repository root | git diff --check -- <owned paths> | Changed-path whitespace diagnostics |

Baseline notes: both test suites were started before pause and explicitly
interrupted, returning exit 1 without a final suite summary. This is an
incomplete baseline, not proof of failing regressions. Some client tests,
including the five existing TopicInput tests, passed before interruption.
Backend emitted expected test logs and deprecation warnings. Rerun needed
checks after resume; do not claim either complete suite passed.

The initial full git diff --check exited 0 with LF/CRLF warnings. No build,
lint, coverage gate, or Custom implementation test has been run. Final
verification remains required despite --skip review.

## Artifact and commit record

| Artifact/action | State | Commit/evidence |
| --- | --- | --- |
| goal.md and initial state.md | Written | 5d9c80a |
| Goal approval record | Approved | 6123d6b |
| Complete state and pause handoff | Paused at user request | Current documentation checkpoint commit |
| research.md | Missing; agent interrupted | No commit |
| plan1.md | Not started | None |
| plan2.md | Not started | None |
| plan3.md | Not started | None |
| plan4.md | Not started | None |
| Implementation | Not started | No source implementation commits |
| review.md | Skipped by explicit user request | No reviewer to be spawned |
| final_report.md | Pending after implementation/verification | None |

## Current gate and resume procedure

CURRENT GATE: PAUSED BY USER BEFORE RESEARCH. STATE COMPLETE.

1. Wait for explicit user resume; do not continue automatically.
2. Read goal.md and this state, check git status and intervening commits, and
   preserve all existing user changes. Keep approved design and --skip review.
3. Record status in-progress and resume_gate resumed. No new goal approval
   is needed. Goal remains approved; research remains incomplete.
4. Restart the interrupted researcher with the handoff above. A fresh
   research agent is appropriate because no completed artifact exists.
5. Verify its research.md commit via git log metadata; record summary/hash,
   reconcile exact ownership/DAG, and mark research complete.
6. Dispatch P1 planner; pass its committed plan path to P1 worker immediately.
7. After P1 worker commit, dispatch P2/P3 planners concurrently and pipeline
   their workers as each plan becomes ready. Serialize git operations.
8. Plan and execute P4 once its dependencies are satisfied. Address defects
   through targeted TDD fixes; do not dispatch a unified review agent.
9. Run required final checks and coverage verification, record outcomes in
   final_report.md and here, and mark complete only when acceptance is met.
10. Commit workflow documentation and add git notes for significant completed
    phases without overwriting existing notes; report the final outcome.
