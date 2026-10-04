---
objective: realtime-course-generation
workflow: maw
status: in-progress
skipped_phases: [review]
goal_status: approved
design_status: approved
dag_status: provisional-awaiting-research
current_phase: planning
resume_gate: cleared-2026-10-04-user-approved-and-asked-to-proceed
pause_reason: none; user approved the written goal and authorized proceeding
created: 2026-10-04
updated: 2026-10-04
---

# State & Dependency Graph: Real-Time Course Generation

## Objective and workflow configuration

- Deliver the genuine real-time, zero-click course-generation UI specified in
  `docs/realtime-course-generation/goal.md`.
- Invocation: `@maw --skip review`.
- Research is enabled and is the only active phase. Unified code review alone
  is skipped.
- Workspace: `D:/Peter/A2UI`; shell: PowerShell; use forward-slash paths.
- Main orchestrator manages documentation, approvals, DAG, dispatch, and
  verification; it must not implement application code.
- No application code has changed in this workflow so far.
- The user approved the proposed design and emphasized actual response streaming.
- The user approved the written goal and instructed "proceed" on 2026-10-04.
  Approval persists; do not ask for it again during this workflow.
- Research must complete and be reconciled into the DAG before planners are
  dispatched. Do not run planning, implementation, or verification yet.

## Workflow milestones

- [x] Step 1: Brainstorming & Goal Alignment (goal committed 33df5dc; approved by user)
- [x] Step 2: Technical Research (`docs/realtime-course-generation/research.md`, commit dea0894; reconciled above)
- [ ] Step 3: Planning Completed (plan1.md done `5655061`; P2/P3/P4 planners dispatched)
- [ ] Step 4: Execution Completed (P1 worker done and verified; P2/P3/P4 pending)
- [x] Step 5: Unified Code Review (Skipped via --skip review; no reviewer dispatch)
- [ ] Step 6: Final Verification & Report (`docs/realtime-course-generation/final_report.md`)

## Brainstorming task record

- [x] Explore project context: all seven project specs, relevant source, clean
  working tree, and recent commits inspected.
- [x] Clarify intent: zero-click behavior; actual in-flight API output required.
- [x] Compare approaches: extend session SSE, separate stream, and rejected fake playback.
- [x] Present architecture, lifecycle, provisional output, and recovery design.
- [x] Obtain design approval through the design-approval question.
- [x] Write `goal.md` with user clarification and explicit acceptance criteria.
- [x] Self-review scope, ambiguity, placeholders, and internal consistency.
- [x] Fully populate this state, provisional dependency matrix, ownership, and gates.
- [ ] Obtain explicit approval of the written specification and proceed instruction
  (done 2026-10-04: user approved and said proceed).

## Initial findings and constraints

- HTTP 202 generation and detached LangGraph tasks already exist.
- Session SSE replays persisted milestones; the main generation agents await
  complete structured responses, so UI-only animation cannot meet the goal.
- Existing Sources and TOC modals have manual open state and focus handling.
- Existing topic skeletons become ready on completed-module data; they do not
  yet show growing generator text.
- SSE envelopes currently attach current job snapshots while replaying events;
  stage projection and draft cursors need explicit reconciliation guarantees.
- Mainstream course data is an ordered flat topic list, not nested modules.
- Outline validation can trigger replan; generator validation/corrections can
  trigger retries. Attempt-scoped replacement is necessary.
- The learning state machine and quiz visibility are separate from generation.
- SQLite and Mongo share repository facades and must behave consistently.
- Per-token synchronous writes, full-session refetches, and heavy Markdown
  rendering are risks identified in the specs; design bounded live updates.
- User workspace was clean at initial inspection; preserve any subsequent user work.

## Research reconciliation (research.md, commit dea0894)

Fixed decisions every planner and worker must treat as given:

1. **Streaming mechanism.** `instructor` 1.15.4 `create_partial` over the existing
   `AsyncOpenAI` client, `mode=instructor.Mode.JSON`, exactly one LLM call per
   attempt, full Pydantic validation on the final chunk. No duplicate display call.
2. **Graph runtime unchanged.** `graph.ainvoke` is preserved. Node functions stream
   internally and publish deltas. Checkpointing, 15s heartbeat, `Send` fan-out at
   concurrency 3, batch barriers, and cancellation stay intact.
3. **Delivery.** An in-process `SessionLiveStreamBroadcaster` in
   `server/services/session_event_stream.py` pushes deltas directly to connected
   SSE clients. No database write per token. Only existing durable milestone
   events continue through the repository facades.
4. **Reconnect/refresh.** The broadcaster retains the latest accumulated draft per
   `(session_id, target, attempt)`. A reconnecting or refreshed client receives a
   current-draft snapshot and then resumes deltas. This is required, not optional.
5. **Dual cursors.** Durable milestone `last_event_id` and a target-scoped draft
   `sequence` advance independently. A newer job snapshot watermark must never
   suppress or duplicate in-flight draft deltas.
6. **New event types** (payload models with `extra="forbid"`):
   `research_sources_updated`, `research_text_delta`, `outline_text_delta`,
   `topic_content_delta`, `topic_explanation_ready`, `target_draft_reset`.
   Attempt-scoped reset on retry/replan replaces only that target's draft.
7. **Client isolation.** Drafts live in a dedicated `useGenerationDrafts` hook, not
   in the TanStack Query cache per token. The cache updates only on milestone events.
8. **Overlay FSM.** `RESEARCHING` auto-opens Sources when web search is enabled;
   `OUTLINING` closes Sources and opens TOC; `OUTLINE_READY`/`GENERATING_PREVIEW`
   closes TOC and hydrates skeletons. Per-attempt manual-dismissal override
   suppresses auto-reopen for that attempt only.
9. **Partial markdown safety.** New `DraftMarkdownPreview` suppresses eager Mermaid
   and sanitizes unclosed tags during streaming.
10. **No stack deviation, no new dependency.** Verified against installed versions.

Goal alignment notes:

- A15 is satisfied through milestone persistence and draft-cursor semantics verified
  against both SQLite and Mongo repository implementations. Draft deltas are
  deliberately in-process and are not persisted; this is an accepted, documented
  consequence of the no-write-amplification constraint.
- A3/A5/A6 must be proven by controllable provider fixtures that assert visible
  growth while the response is still open. Post-completion typing is a failed test.

## Dependency matrix and execution status

| Plan ID | Title & scope | Worker dependencies | Touched files / subsystems | Planner status | Worker status | Commits |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **P1** | Streaming contracts, `create_partial` agent path, broadcaster, replay foundation | None | `server/schemas/progress.py`, `server/utils/instructor_client.py`, `server/agents/base.py`, `server/services/session_event_stream.py`, SSE framing | Done (`5655061`) | Completed | `eeebf07`, `724d527`, `c01d11b`, `d9f4472`, `b75f396`, `c195a6e`, `252d559`, `3503448` |
| **P2** | Live research synthesis and retrieved-source updates | P1 | `server/agents/researcher.py`, `server/services/research_runner.py`, focused research tests | Dispatching (parallel foreground) | Not dispatched | None |
| **P3** | Live curriculum and topic generation integration | P1 | `server/agents/planner.py`, `server/agents/generator.py`, `server/graph/nodes.py`, focused graph/agent tests | Dispatching (parallel foreground) | Not dispatched | None |
| **P4** | Client streaming state, automatic overlays, topic hydration | P1 | Client contracts, `useGenerationDrafts`, SSE/reducers, `LearningPage`, `LearningPathContainer`, `CourseSourcesPanel`, `TableOfContentsModal`, `SkeletonCard`, colocated tests | Dispatching (parallel foreground) | Not dispatched | None |
| **P5** | Integrated acceptance and verification-gate coverage | P2, P3, P4 | Dedicated server/client acceptance tests, `vitest.generation.config.ts`, `verification.md` | Not dispatched | Not dispatched; awaits P2/P3/P4 | None |

```text
Written-goal approval + explicit proceed
                 |
             Research
                 |
       Reconcile contracts and DAG
                 |
          P1 foundation worker
          /         |        \
   P2 research  P3 graph   P4 client
          \         |        /
           P5 acceptance worker
                 |
       Final tests / lint / build
                 |
       final_report.md + complete state
```

## Provisional file ownership

Each worker may change only its assigned files and explicitly allocated new
helpers/tests. Narrow this list after research; all unlisted files need
orchestrator coordination before editing.

### P1: shared foundation

- `server/schemas/progress.py`
- `server/utils/instructor_client.py`
- `server/agents/base.py`
- `server/services/session_event_stream.py`
- New focused streaming/event/replay helpers under `server/services/` or `server/utils/`.
- If required for the selected replay strategy: `server/database/progress_events.py`,
  `server/database/repositories/protocols.py`,
  `server/database/repositories/mongo_progress.py`, and narrowly scoped schema
  migration files. No storage edits unless research establishes the need.
- `server/routers/learning.py` only if a stream/snapshot contract adjustment is required.
- Dedicated foundation unittest files; existing foundation tests only with
  explicit ownership recorded in `plan1.md`.

### P2: research producer

- `server/agents/researcher.py`
- `server/services/research_runner.py`
- Dedicated research-streaming unittest files and assigned existing research tests.
- Uses P1 output callbacks/contracts; does not modify BaseAgent or graph nodes.

### P3: curriculum/topic producers

- `server/agents/planner.py`
- `server/agents/generator.py`
- `server/graph/nodes.py`
- Dedicated outline/topic-streaming unittest files and assigned existing graph tests.
- `server/graph/state.py` only if essential compact metadata is needed; never large text/secrets.
- No graph topology/scheduler changes unless explicitly required and approved.

### P4: client presentation

- `client/src/types/generation.ts`
- `client/src/features/learning/generationEvents.ts`
- `client/src/features/learning/useSessionEvents.ts`
- `client/src/features/learning/LearningPage.tsx`
- `client/src/features/learning/LearningPathContainer.tsx`
- `client/src/features/learning/GenerationStatusPanel.tsx`
- `client/src/features/learning/CourseSourcesPanel.tsx`
- `client/src/features/learning/TableOfContentsModal.tsx`
- `client/src/features/learning/SkeletonCard.tsx`
- New focused presentation hooks/reducers/components and colocated tests.
- `client/src/lib/learningApi.ts` only if the selected recovery contract needs it.
- Prefer a safe incremental preview wrapper over unrelated MarkdownRenderer refactoring.

### P5: integrated verification

- New `server/tests/test_realtime_generation_acceptance.py` and dedicated helper
  if needed; existing acceptance harness changes only after producer workers finish.
- New `client/src/features/learning/__tests__/realtimeCourseGeneration.test.tsx`.
- `client/vitest.generation.config.ts` to include new feature modules in the gate.
- `docs/realtime-course-generation/verification.md` with exact commands/results.
- No production fixes hidden inside acceptance work: report defects and assign
  targeted TDD workers even though standalone review is skipped.

## Planning and pipelining policy

- Dispatch mode: subagents run in the foreground, never backgrounded.
  Independent planners are dispatched as parallel foreground agents.
- Plan document format: planners must NOT prepend the boxed 76-`=` file header
  block or any decorative header banner to `plan*.md`. Start directly with the
  plan content. Source code files created by workers still follow the mandatory
  `AGENTS.md` header convention.
- After research, agree on the shared stream/event/recovery contract before
  dependent planners hard-code interfaces.
- Dispatch the P1 planner first; it defines the shared contract. Then dispatch the
  P2, P3, and P4 planners in parallel foreground, each receiving P1's contract
  decisions.
- Dispatch P1's worker immediately when `plan1.md` is ready. Do not wait for all plans.
- P2/P3/P4 workers start as soon as their plan is committed and P1's worker is complete.
- P2/P3/P4 may execute concurrently only after verifying disjoint actual file ownership.
- P5 planning may begin once the relevant contract/lifecycle decisions are stable;
  its worker requires all producer/presentation workers complete.
- Use `writing-plans` for planners; `executing-plans` and
  `test-driven-development` for workers. Use `systematic-debugging` for defects.
- Plans must contain exact test code, red/green commands, minimal implementation,
  exact paths, verification, and atomic commit messages.
- Serialize staging/commits in the shared checkout to avoid git-index conflicts.
- Stage only assigned files; never broadly stage or reset other agents' work.
- Update this matrix on every completion and immediately dispatch ready workers.

## Acceptance ownership and exit gates

| Owner | Goal acceptance IDs | Required exit evidence |
| :--- | :--- | :--- |
| P1 | A10, A11, A14, A15 | In-flight provider fixture, typed safe events, attempt reset, replay/cursor and SQLite/Mongo tests |
| P2 | A2, A3, A9, A12 | Source retrieval updates and growing synthesis before provider completion; degradation/cancel tests |
| P3 | A5, A6, A7, A9, A11 | Growing titles/content, concurrent isolation, replan/reset, persisted validation and quiz-readiness tests |
| P4 | A1, A4, A5, A6, A8, A10, A12, A13, A14 | Automatic lifecycle, previews, dismiss/focus, refresh/session/poll reconciliation tests |
| P5 | A1-A15 integrated where applicable | Zero-click controlled stream acceptance, regressions, and documented verification outcomes |

No worker is complete without observed red/green TDD, relevant regression
commands, and commit hashes. Do not count simulated post-completion typing as
evidence of A3/A5/A6. Hidden/locked learner content and quizzes retain their rules.

## Artifact and commit ledger

| Artifact | Current status | Commit record |
| :--- | :--- | :--- |
| `goal.md` | Written and user-approved | `33df5dc` |
| `state.md` | Fully populated; in progress | `33df5dc`, plus the approval/resume commit for this file |
| `research.md` | Complete; reconciled into fixed decisions | `dea0894` |
| `plan1.md` through `plan5.md` | Not created; blocked | None |
| `review.md` | Intentionally omitted via --skip review | Not applicable |
| `verification.md` | Not created | None |
| `final_report.md` | Not created | None |

## Resume procedure

1. Obtain written-goal approval and explicit permission to proceed. If the user
   requests revisions, update both goal/state and pause again.
2. Mark Step 1 complete and update state to in-progress/current phase research.
3. Dispatch only the Researcher subagent first. It reads the goal/project specs,
   verifies current official streaming APIs, checks code/persistence patterns,
   proposes bounded low-latency replay, writes `research.md`, and commits it.
4. Reconcile research findings into DAG and ownership. Stop for user approval if
   satisfying genuine streaming would require a material scope/stack deviation.
5. Start the planner/worker pipeline above; keep statuses and commit hashes current.
6. Do not spawn a unified Reviewer; fix observed test/integration defects via TDD.
7. Perform complete final verification and write/commit `final_report.md` and
   completed state only when the actual outcomes support completion.

## Final verification commands

Run from the stated directories and record actual results:

- Repository root: `server/.venv/Scripts/python.exe -m unittest`.
- `client/`: `npm run test -- --run`.
- `client/`: `npm run test:generation:coverage`.
- `client/`: `npm run lint`.
- `client/`: `npm run build`.
- Focused server/client streaming acceptance and coverage commands defined in plans.
- No configured standalone Python linter/type-checker exists in the inspected
  stack; do not claim a nonexistent check passed or introduce tooling silently.

## Current checkpoint

**P1 COMPLETE.** Plan `plan1.md` (`5655061`); worker landed 8 commits
(`eeebf07`..`3503448`). Orchestrator re-ran the 9 focused P1 test modules: 30
tests, OK. Landed contract: `InstructorClient.create_partial_structured`,
`BaseAgent.generate_streaming`, `SessionLiveStreamBroadcaster`
(`begin_target`/`publish`/`retire_target`/`subscribe`/`snapshots`/`clear_session`),
module singleton `session_live_stream`, and the six new typed live payloads in
`server/schemas/progress.py`. P2/P3/P4 planners now dispatching in parallel
foreground. No client work, no paid provider calls.
