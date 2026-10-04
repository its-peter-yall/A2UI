# Goal: Interactive, Real-Time Course Generation Pipeline UI

## Workflow and approval

- Objective slug: `realtime-course-generation`.
- Workflow: MAW, invoked with `--skip review`; research is not skipped.
- Date: 2026-10-04.
- The user approved the proposed design, then explicitly reaffirmed that actual
  real-time response streaming is required.
- This document records that design. Written-spec approval and an explicit
  instruction to proceed are still required before research or any subagent.
- After writing this file, fully populate `state.md` and pause before research.

## Problem and outcome

Replace the static course-generation placeholder with a zero-click presentation
of the real generation pipeline. Users see research evidence, the evolving
curriculum, and topic explanations while their underlying API responses are
still arriving, rather than waiting for each agent's complete response.

**Actual response streaming is mandatory.** Do not collect a complete response
and then replay its characters, words, or tokens with timers. Stage events,
polling, completed research sections, and completed topic notifications alone
do not satisfy this feature.

## Specification references

Follow `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/STRUCTURE.md`,
`docs/CONVENTIONS.md`, `docs/TESTING.md`, `docs/INTEGRATIONS.md`, and
`docs/CONCERNS.md`. Preserve their durable background-generation architecture,
repository facades, scoped credential handling, TDD, and UI conventions.

## Existing integration points

- Generation returns HTTP 202 and runs independently of browser connections.
- `server/schemas/progress.py` defines replayable milestone events, but no live
  research text, outline text, or topic explanation events.
- `server/services/session_event_stream.py` exposes the existing session SSE.
- `server/utils/instructor_client.py` and `server/agents/base.py` currently await
  complete structured responses on the main generation path.
- `server/services/research_runner.py` orchestrates research and persists sections.
- `server/graph/nodes.py` coordinates outlining, brief planning, topic generation,
  and quizzes.
- Client integration lives in `useSessionEvents.ts`, `generationEvents.ts`,
  `LearningPage.tsx`, and `LearningPathContainer.tsx`.
- Reuse `CourseSourcesPanel.tsx`, `TableOfContentsModal.tsx`, and
  `SkeletonCard.tsx` where practical rather than creating competing UI flows.

These observations are initial goal-alignment inspection, not the pending MAW
technical-research deliverable.

## Approaches considered

1. **Extend the existing session SSE (selected).** Add genuine incremental
   output and replay-safe presentation state to the existing generation flow.
   Reuses established lifetime, transport, and recovery boundaries.
2. **Introduce a separate live-output stream.** Isolates high-frequency output,
   but requires additional cross-stream ordering and reconnection handling.
3. **Animate completed responses (rejected).** Cheaper UI-only work, but explicitly
   fails the user's real-time streaming requirement.

## UX lifecycle

### Initialization

- Navigate to the generated session as today, without waiting for content.
- Show concise, truthful agent/stage status in place of the static placeholder.
- No percentage, source count, or text is fabricated.

### Research stage

- If web research is enabled, automatically open the Sources / Research panel
  on entry to `RESEARCHING`, including when joining an already researching job.
- Display the count of unique retrieved, accepted sources as search results
  arrive, before waiting for section synthesis to finish.
- Stream user-facing research synthesis/report text incrementally while the
  researcher's API response is in progress. Distinguish live drafts from
  validated, saved sections and the final report.
- Search providers that return result batches update sources as those batches
  arrive; do not pretend that non-streaming search results are token streams.
- Automatically close the automatically opened panel when research finishes or
  the pipeline advances. Transition to planning without a confirmation click.
- Retain warnings and completed sources for later manual inspection.
- With web research disabled, skip this presentation entirely.

### Curriculum planning stage

- On entry to `OUTLINING`, show transient status such as
  “Invoking planning agents...” and automatically open the existing TOC modal.
- Populate the course title and ordered topic/module entries incrementally,
  including growing topic titles, while the planner response is still arriving.
- Present extracted display fields, not raw JSON syntax or provider envelopes.
- Preserve the current flat ordered-topic data model. “Modules” means existing
  topic/module entries; new nested curriculum grouping is out of scope.
- Provisional rows are read-only and cannot trigger learning transitions.
- When the outline is validated and persisted, reconcile drafts with the
  authoritative curriculum and automatically dismiss the auto-opened TOC.
- Later brief-planning batches show status but do not repeatedly reopen the TOC.

### Topic generation stage

- Once the outline is final, render the existing topic/module skeletons with
  their finalized titles in the current learning-path layout.
- Progressively replace each topic's skeleton body with its growing explanation
  while that topic's generator response is in progress.
- Correctly associate concurrently arriving text with the intended topic.
- Provide automatic visibility of an actively streaming topic without requiring
  a first click. After the learner deliberately selects another topic, new
  output must not repeatedly steal selection or force scrolling.
- Queued topics remain skeletons; active topics show growing draft content;
  completed topics reconcile to authoritative saved content.
- Partial explanation text is a read-only generation preview, not an unlocked
  learning node. Existing mastery progression and quiz visibility stay intact.
- Quiz generation may continue after explanation streaming completes. Show that
  truthful intermediate state; do not mark the module ready prematurely.
- Failed topics show the existing recoverable error state instead of endlessly
  animated skeletons. Healthy topics continue according to existing behavior.

### Automatic controls and accessibility

- No open, next, continue, or dismiss action is required for normal progression.
- Only one automatically managed pipeline overlay is active at a time.
- Escape and close controls remain available. Manual dismissal suppresses
  automatic reopening for the same stage/attempt and does not stop generation.
- Manual Sources/TOC reopening remains available. Stage auto-close applies to
  automatically opened presentation, not a panel deliberately reopened to inspect.
- Manage focus on open/close and between automatic overlays; avoid repeated
  focus changes on text updates or focusing detached elements.
- Announce stages and meaningful milestones through accessible status feedback;
  do not announce every token to screen readers.
- Support small viewports, reduced motion, dark backgrounds, Cyber Yellow
  accents, and existing topic-content typography.

## Streaming and state architecture

1. **Agent streaming boundary:** add a shared streaming-capable structured-output
   path. Research synthesis, outline planning, and topic explanations must emit
   incremental display output before final validation/return. Preserve model
   selection, provider routing, reasoning parameters, prompt caching, cancellation,
   and validation/retry behavior. Never make a duplicate LLM call just for display.
2. **Typed event boundary:** extend the existing SSE contracts with safe,
   attributable live output and source-count updates. Identify session/job,
   stage, output target, and generation attempt; define ordered updates, resets,
   and finalization so retries cannot concatenate incompatible drafts.
3. **Presentation-state boundary:** keep growing drafts separate from validated
   course/research artifacts and the learning-state machine. Reconcile completion
   to server-authoritative saved data without retaining duplicate text.
4. **Automatic UI controller:** derive overlay transitions and initial active
   streaming-topic presentation from pipeline events/current state. Components
   render presentation data; they do not own generation orchestration.
5. **Recovery boundary:** restore current output/current stage after reconnect,
   refresh, or session re-entry without flashing historical completed stages.

Provider tokens may arrive in variable-size chunks. “Token-by-token” means
incremental visible text from the live response, not a promise of one transport
message per tokenizer token. Brief bounded coalescing for transport and React
rendering is acceptable, but waiting for a sentence, section, topic, or entire
response to finish is not. The implementation must demonstrate output before
completion using a controllable streaming test fixture.

The researcher must verify compatible streaming APIs and recommend bounded
buffering/replay storage that works with both SQLite and MongoDB. Avoid one
synchronous database write and a full-session refetch for every model token.
Document the selected latency/buffering budget and enforce it in focused tests.

## Reliability and safety

- SSE disconnect must not cancel the detached course job.
- Scope output by session, target, and attempt; reject duplicate/stale updates.
- Keep draft replay cursors distinct from snapshot watermarks where needed:
  polling a newer job snapshot must not silently skip unconsumed draft output.
- Replayed events must not regress the current stage or reopen completed modals.
- Retry, outline replan, or content correction replaces the affected attempt's
  draft. Final validation may revise provisional text; clearly label previews.
- Paused/cancelled/failed jobs stop live animations and retain available output
  with an explicit state. Do not auto-resume or make new chargeable calls.
- Preserve existing stop/resume/delete behavior and degraded-research warnings.
- If live streaming is unavailable or rejected by a provider, make that
  limitation explicit and retain truthful stage/milestone feedback. Never
  silently substitute fake streaming or claim fallback satisfies live acceptance.
- Partial output is untrusted: sanitize rendering, do not eagerly execute
  incomplete Mermaid/HTML, and expose only approved display fields/URLs.
- Do not expose quizzes/answers, hidden reasoning, credentials, request headers,
  raw provider response bodies, or secrets in public events or logs.
- Keep API keys and large text out of LangGraph checkpoint state.
- Extend persistence through repository facades with SQLite/Mongo parity.
- Preserve Auto/Lite/Full/Custom modes, exact Custom counts, search budgets,
  preview/batch scheduling, and existing concurrency limits.

## Acceptance criteria

| ID | Required observable behavior |
| :--- | :--- |
| A1 | Research panel opens without interaction on a live research-stage event. |
| A2 | Unique source count updates on retrieval, before synthesis completes. |
| A3 | At least two growing research-text updates appear while the provider fixture remains unfinished. |
| A4 | Research-to-planning transition closes the automatic Sources panel and opens TOC without clicks. |
| A5 | TOC title/entries grow during the unfinished planner response; final validation reconciles and closes it. |
| A6 | Final outline creates titled skeletons; at least two growing topic-text updates appear before generator completion. |
| A7 | Interleaved concurrent topic streams remain isolated; readiness waits for required artifacts, including quizzes. |
| A8 | A complete successful generation lifecycle requires zero UI interaction. |
| A9 | Search-off generation skips Sources; all supported depth modes retain current contracts. |
| A10 | Duplicate events, reconnect, refresh, stale polling, and session switching neither duplicate text nor replay old modals. |
| A11 | Retries/replans reset only the affected draft; invalid partial data cannot become a saved ready artifact. |
| A12 | Pause/cancel/failure/degraded research have truthful, non-stuck UI and preserve recovery controls. |
| A13 | Optional dismissal, focus transitions, reduced motion, and manual inspection work without blocking generation. |
| A14 | Malicious partial text, unsafe links, secrets, hidden reasoning, and quiz answers are not exposed unsafely. |
| A15 | Streaming persistence/replay semantics work through both SQLite and Mongo repository implementations. |

## Verification and completion gates

- Strict TDD: controlled incremental provider fakes must prove failing behavior
  before implementation and prove partial visibility before response completion.
- Server unittest coverage for contracts, streaming, stage integration, retries,
  concurrency, cancellation, replay, credential boundaries, and repository parity.
- Client Vitest/Testing Library coverage for reducers, SSE lifecycle, overlay
  automation, draft rendering, snapshot reconciliation, and accessibility.
- Integrated zero-click acceptance scenario covering real graph/events and client
  presentation with deterministic external-provider fakes, not live paid calls.
- Full client tests, generation coverage gate (>80% new code), ESLint, TypeScript
  production build, and full server unittest suite at final verification.
- Record any pre-existing failures separately; do not report unrun checks as passed.
- No standalone unified code review: explicitly skipped by the user. Planning,
  TDD, implementation, and final verification remain mandatory.

## Out of scope

- Fake typewriter playback, user-driven wizard steps, or manual stage advancement.
- New curriculum hierarchy, generation scheduler, job queue, or WebSocket service.
- User authentication, unrelated storage/security refactors, or new providers.
- Live quiz/answer streaming, hidden chain-of-thought, or changes to mastery rules.
- Redesigning the rest of the learning app or forcing all topics into a new grid.

## Spec self-review

- Actual in-flight response streaming is explicit for all three output stages.
- Automatic progression and optional dismissal are compatible and separately defined.
- Existing module semantics, validation, quiz readiness, and locking are preserved.
- Recovery, retries, persistence parity, and acceptance checks have explicit scope.
- SDK syntax, exact event names, and bounded replay implementation are deliberately
  delegated to the required technical research and detailed implementation plans.
