# Completed-Course Review and Practice Quiz Parity

Date: 2026-10-05

Status: The user approved the proposed behavior and requested this detailed
specification. This written specification awaits user review. No implementation
or implementation plan is authorized by this document alone.

Workflow: MAW with technical research and unified code review explicitly skipped
by the user on 2026-10-05 (`--skip research,review`). Planning, test-first worker
execution, and final verification remain mandatory. The complete dependency
graph and handoff rules are in `docs/completed-course-review-parity/state.md`.
The workflow is paused pending approval; no subagents have been dispatched.

## 1. Objective

Make revisiting a completed course behave consistently with normal learning:
working quiz explanations, independent per-quiz correctness, clickable curiosity
questions, and a correctly positioned concept chatbot. Preserve the existing
Full Review layout with quizzes below each topic and the quiz-only Practice
layout. Revision activity must not modify original-course mastery or progress.

The two user-confirmed decisions are:

1. Match normal-course answer disclosure: explain selected options after a wrong
   answer and allow retry; reveal all option explanations after a correct answer.
2. Full Review completes a topic through **Mark as Reviewed**. Practice completes
   a topic after every quiz has been submitted, regardless of correctness.
   Skipping an available quiz does not count as a submission.

## 2. Scope and non-goals

### In scope

- Both `full_review` (Revise Course) and `quiz_only` (Practice Quizzes).
- Single-choice, multiple-choice, single-quiz, and multi-quiz topics.
- Immediate feedback, retries, quiz/topic navigation, and restoration on refresh.
- Independent reading completion, quiz attempt completion, and correctness.
- Curiosity-question prefill, heading-focused chat, and right-hand chat layout.
- Matching server/client contracts and behavior on SQLite and MongoDB.
- Correct revision progress, table-of-contents state, history, and summary data.
- Compatibility with existing revision records, without deleting saved attempts.

### Out of scope

- Rewriting the original learning state machine or its sequential gating.
- Changing course generation, quiz generation, regeneration, or quiz shuffling.
- A general redesign of course cards, dashboard, or settings.
- New dependencies, a new chat backend, or revision-specific chat storage.
- Retrofitting application authentication or repairing unrelated answer exposure.
- Changing the original-course scoring algorithm.

## 3. Investigation and root causes

The affected page is `client/src/features/learning/RevisionPage.tsx`, with a
separate `RevisionConceptCard.tsx` implementation. Revision #15 was inspected in
the running app; plain curiosity bullets and chat below the course were observed.
No quiz answers were submitted during that inspection.

| Issue | Evidence and cause |
| --- | --- |
| Feedback missing | The client expects `RevisionQuizResponse.node_id`, selected IDs, score, and attempt details. `RevisionQuizSubmissionResult` and both repository responses omit several of these. The success callback indexes results by a missing `node_id`. |
| Feedback crosses quizzes | The page stores one result per node, and the card reads that result without matching its quiz index. Feedback visibility also depends on topic-level status. |
| Whole topic becomes green | The card colors its outer border from `quiz_passed`; the mutation optimistically assumes a pass before evaluation. Both stores preserve `quiz_passed` after any earlier correct answer. |
| Partial practice treated as finished | Revision progress counts topic statuses rather than checking submission coverage across the topic's quiz indices. |
| Curiosity questions are bullets | Revision renders raw topic Markdown rather than using `parseCuriosityQuestions` and `CuriositySpark` with a chat callback. |
| Chat appears below/left | `ChatPanel` is an in-flow flex panel. Normal learning supplies a bounded horizontal container; revision renders it after the main content instead. |

Reference implementations: `ConceptCard.tsx`, `QuizFeedback.tsx`,
`LearningPathContainer.tsx`, `ChatPanel.tsx`, and `useConceptChat.ts`.

## 4. User-visible behavior

### 4.1 Topic presentation

- Retain the course title, topic carousel, topic order, table of contents, and
  theme/typography conventions of normal learning.
- In Full Review, show the explanation, clickable curiosity questions, citations
  when available, review action, and quiz section in that order.
- Practice remains quiz-only; it does not reveal the full topic explanation.
- Every revision topic remains navigable without normal-learning unlock rules.
- Use a neutral outer card border. Neither correctness nor review completion
  turns the entire topic card green or red.
- Show reading/practice completion through compact, clearly labeled badges.
  Completion is not described as mastery or assumed correctness.

### 4.2 Quiz submission and feedback

- A quiz starts with selectable radio buttons or checkboxes and Submit Answer.
- Disable submission with no selection and while that submission is pending.
- Associate every request and response with its revision, node, and quiz index.
- A successful request shows feedback immediately for the submitted quiz.
  A later progress refetch is not a prerequisite for showing feedback.
- On an incorrect answer, show an Incorrect result and explanations for the
  selected options. Do not display unselected correct answers or all-option
  explanations. Offer **Try Again**.
- For an incorrect multi-select submission, describe the selection as incorrect;
  do not claim every selected option is independently wrong. Do not expose the
  missing correct options through indicators or labels.
- On a correct answer, show Correct and explain every option, including
  unselected distractors. Each correct option uses its own explanation, not an
  explanation copied from a different correct option.
- Explain and style the selected response using stable `option_id` values, not
  shuffled display labels or option positions.
- Do not render normal-course Mastered, Complete Course, unlock-next-topic, or
  mastery-celebration actions in revision feedback.
- Feedback remains readable until navigation or an explicit retry. Submitting
  the final outstanding quiz must not immediately cover it with a summary modal.

### 4.3 Per-quiz indicators, navigation, and retries

- Show one compact indicator button for every quiz in the current topic, next
  to the quiz navigation. Clicking an indicator navigates directly to that quiz.
- Gray means no successful submission request has been recorded for that quiz;
  green means its latest saved attempt is correct; red means its latest saved
  attempt is incorrect. Include text/accessible labels, not color alone.
- Example: quiz 1 correct and quiz 2 wrong produces green/red, not green/green.
- Previous, Next, and Skip change the visible quiz without changing results.
  Skip does not create an attempt or change completion coverage.
- Preserve unsubmitted selections while navigating within the mounted revision,
  keyed by node and quiz. Persisting these selections across refresh is not
  required; submitted answers and feedback must survive refresh.
- Returning to a submitted quiz restores its own selected answers and feedback.
- Try Again opens editable inputs for that quiz and clears its input selection.
  The saved indicator/result remains the previous attempt until another request
  succeeds. A failed request does not erase that previous result.
- Retry is available for wrong answers. Correct quizzes remain in feedback mode
  for the current revision; additional practice is available in a new revision.
- Switching revision IDs resets revision-local navigation, results, selections,
  and summary-dismissal state. Attempts from another revision must never appear.

### 4.4 Completion rules

| Mode | Topic completion | Correctness |
| --- | --- | --- |
| Full Review | Explicit Mark as Reviewed action | Independent per-quiz latest results |
| Practice Quizzes | At least one saved submission for every available quiz | Independent per-quiz latest results |

- Quiz submissions never mark Full Review content as reviewed or undo an
  explicit review action, even when a subsequent quiz answer is wrong.
- In Practice, a correct answer to one of two quizzes leaves the topic unfinished.
  A wrong submission to the second quiz finishes coverage while keeping it red.
- Once every quiz has an attempt, retrying does not undo Practice completion.
- The header count, table of contents, revision history, and summary agree with
  these mode-specific rules. Practice labels say finished/attempted, not mastered.
- A revision completes when all participating topics satisfy its completion rule.
  No topics means no automatic completion.
- A topic without quizzes remains reviewable in Full Review. In Practice, show
  No quiz available, omit it from the completion denominator and score, and keep
  it navigable. If no topics have quizzes, show No practice quizzes available
  rather than an automatic successful-completion summary.
- On completion, offer **View Summary** without interrupting quiz feedback.
  Opening an already completed revision likewise does not immediately obscure
  the content. Users may continue reading, retry wrong quizzes, or navigate.

### 4.5 Summary and scoring

- Keep the existing attempt-based score: integer percentage of correct attempts
  among compatible attempts for available quizzes in this revision. Retain but
  exclude incompatible historical attempts and quizless topics from accuracy.
  No compatible attempts means a null score, not 0%.
- Every retry is another attempt. Latest-result indicators and overall attempt
  accuracy intentionally measure different things.
- Label summary breakdowns as correct attempts, incorrect attempts, and total
  attempts so they cannot be mistaken for unique quiz counts.
- Use that same accuracy in revision history, session responses, and summaries;
  do not calculate one view from topic-level pass/fail statuses.
- Preserve comparison with original, non-revision attempts. Other revisions do
  not enter either side of the comparison.
- Completion timestamps reflect the first completion under the applicable rules;
  retries after completion update score but do not restart the completion clock.
- Invalidate/refetch a previously viewed summary after a saved submission so its
  score does not remain stale.

## 5. Curiosity questions and concept chat

### 5.1 Clickable questions and heading context

- Full Review uses the same parser and `CuriositySpark` presentation as normal
  learning. Do not duplicate parsed questions as plain bullets below the widget.
- A question click opens chat for that question's topic, replaces the composer
  with the question, and focuses the composer. It does not send a message.
- Clicking the same question again must work after the previous prefill was
  consumed, including after closing/reopening chat.
- If no recognized curiosity section exists, preserve the Markdown unchanged;
  absence of a curiosity section does not break content or chat.
- Heading-chat controls behave like normal learning and supply selected heading
  IDs to chat. Heading selections are topic-scoped and never leak to another
  chat topic.

### 5.2 Layout and conversation ownership

- Place course content and chat in a bounded, viewport-height horizontal flex
  layout below the page header. The footer is not used as the chat container.
- On desktop, open chat on the right and shrink the content area. Both areas
  scroll independently. Chat never appears beneath the final quiz or at bottom
  left due to document flow.
- Match normal learning's desktop width: initially 25%, resizable from 25% to
  38%, with mouse and keyboard separator controls. Keep widths within bounds.
- Below a 768px viewport width, use a full-width chat overlay within the bounded
  content area, with a close action. Hide the desktop resize separator. At 768px
  and above, use the split layout. Closing restores the topic and its scroll
  position. This is a targeted responsive safeguard, not a redesign of normal
  learning.
- Opening chat explicitly captures its node ID. Carousel navigation alone does
  not silently rebind the open conversation or cancel it.
- An explicit question/heading action on another topic intentionally switches
  chat ownership, stops the previous stream, and loads the destination topic's
  conversation. Display the chat topic title so ownership is visible.
- Retain the existing session-plus-node conversation storage, expiry, web-search
  behavior, streaming controls, errors, Escape handling, and focus restoration.
- Revision completion must not trigger chat-history deletion. Do not reuse a
  completion flag whose chat-hook semantics are to clear stored messages.
- A prefill received while streaming may populate the composer, but must not
  send, interrupt, or overwrite the active assistant response; sending remains
  disabled until streaming stops.

## 6. Components and state boundaries

Prefer targeted sharing over merging the complete learning and revision flows.

| Unit | Responsibility and boundary |
| --- | --- |
| Shared quiz feedback presentation | Render result header and option explanations from a quiz and its matching result. Learning/revision callers own their distinct retry and completion actions. No persistence or mastery mutations. |
| Revision quiz section | Own quiz navigation, input selections, retry display, and per-quiz indicators. Consume results keyed by node/index; never derive correctness from the topic badge. |
| RevisionConceptCard | Render mode-appropriate topic content, curiosity/citations, explicit review action, and revision quiz section. No normal-course status transitions. |
| Chat layout/state helper | Reuse the working split-layout and resize patterns where practical, without transplanting generation/carousel orchestration. Own layout and explicit conversation targeting, not chat transport. |
| RevisionPage and mutations | Own revision-scoped queries, successful-result cache patches, errors, navigation, and explicit summary display. |
| Shared server revision projection | Derive latest per-quiz results, submission coverage, reading completion, and attempt accuracy consistently for both repositories. No HTTP or provider calls. |

The server remains authoritative. Client optimistic changes may mark an explicit
review action pending/completed with rollback; quiz mutations must not optimistically
declare correctness, a topic pass, or revision completion.

## 7. API and persistence contract

Use the existing revision endpoints; no new provider integration is needed.

### 7.1 Quiz submission result

`POST /learning/revisions/{revision_id}/nodes/{node_id}/submit-quiz` returns a
validated result containing:

- `id`: saved attempt ID.
- `revision_session_id`, `node_id`, and zero-based `quiz_index`.
- `attempt_number`: existing stored attempt sequence identifier. Do not reinterpret
  the historical node-wide numbering as a per-quiz attempt count.
- `quiz_attempt_count`: attempts for this revision/node/quiz, for the UI label.
- `selected_option_ids`, `is_correct`, and `score_percent` (0 or 100).
- `correct_option_ids`: populated on correct submission; empty on wrong submission.
- `explanation`: correct-answer explanation on success, otherwise an empty string.
- `selected_explanation`: optional nullable string for selected-answer explanation,
  retaining existing compatibility; option-by-option rendering uses each quiz
  option's explanation.
- `created_at`: ISO timestamp.
- `revision_node_status`: mode-aware aggregate topic state, not this quiz's color.

The Pydantic response model and TypeScript interface describe the same required
fields and nullability. Do not invent placeholder IDs, infer a missing result's
quiz index from the currently visible quiz, or assert the mismatch away.

### 7.2 Restoring a revision

Extend each node entry in `GET /learning/revisions/{revision_id}` with:

- `content_reviewed_at`: nullable timestamp recording explicit review only.
- `quiz_count`: available quiz count, with legacy single quizzes represented as 1.
- `quiz_results`: latest saved result for each attempted quiz index, sorted by
  index. Use the same attempt fields as submission results, without a redundant
  per-result topic status. An unanswered topic returns an empty list.

Select attempts by `(revision_session_id, node_id, quiz_index)`, with latest
determined by stored attempt sequence and a deterministic ID tie-breaker. Restore
selected options, score, disclosure policy, and per-quiz attempt count consistently
with immediate submissions. Never use the unfiltered node attempt-history endpoint
to restore revision feedback.

All node and revision aggregate fields are calculated from the same projection:

- Full Review status is `reviewed` or `pending`, based on explicit review only.
- Practice status is `pending` while coverage is incomplete; once complete, use
  `quiz_passed` if every latest result is correct and `quiz_failed` otherwise.
  Both complete statuses mean finished practice, not original-course mastery.
- Quizless Practice topics are excluded, regardless of their legacy status.

`POST /learning/revisions/{revision_id}/nodes/{node_id}/mark-reviewed` returns
the updated node details, including explicit review metadata and quiz results,
using the same node shape as the revision GET. It rejects Practice mode.

### 7.3 Writes and storage parity

- Keep append-only quiz attempts as the source of answer history. Do not add
  per-quiz success flags that can disagree with saved attempts.
- Persist explicit content review separately from the old overloaded status and
  `reviewed_at` fields. Add `content_reviewed_at` using existing SQLite schema
  migration and Mongo document-compatibility patterns.
- Mark as Reviewed is idempotent and retains the first explicit review timestamp.
  Quiz submissions never set or clear `content_reviewed_at`.
- Update attempt data and revision metadata together within the existing SQLite
  transaction. Mongo writes must be recoverable by recalculating the projection
  from committed attempts; do not require a new deployment transaction capability.
- Derive GET/list/summary responses from authoritative review metadata and attempts
  so an interrupted aggregate update does not misrepresent correctness or coverage.
- Validate revision ownership, node membership, quiz range, and selected option IDs
  before recording an attempt. Invalid requests must not affect any progress.
- Preserve repository facade usage and extend shared contracts where needed.
- Avoid per-node/per-quiz network queries when loading a revision: batch-read its
  attempts and topic quiz data, then project in memory.

## 8. Existing revisions and compatibility

- Do not delete, renumber, or rewrite existing attempts, revision IDs, course
  content, option IDs, or original learning records.
- Restore all compatible attempts belonging to an existing revision, including
  the partially attempted revisions shown in the user's screenshots.
- For legacy Full Review nodes whose stored status is `reviewed`, seed explicit
  review metadata from `reviewed_at`, or the revision start timestamp if that
  timestamp is absent. Treat this as a legacy compatibility inference.
- A legacy `quiz_passed`/`quiz_failed` status or timestamp does not prove an
  explicit review action: the previous code set that timestamp on correct answers
  and could overwrite a prior reviewed status. Do not infer review from it.
  Such topics show Mark as Reviewed again, with an explanatory notice once per
  page load for that revision if applicable.
- Existing Practice progress is recomputed from its own quiz attempts, not from
  a sticky passed topic status. Older partial revisions may consequently show a
  lower completion percentage; saved quiz feedback remains available.
- Legacy cached completion counts/statuses do not override the new rules. A
  historical revision previously reported complete may now be incomplete. Do
  not present its old completion timestamp as current completion; retain the
  historical stored value until a successful progress write reconciles metadata.
  If that revision later completes under the corrected rules, record the new
  completion time rather than reuse a disproven old completion time.
- Compatibility initialization is idempotent and must never backfill a new,
  intentionally null explicit-review field from a quiz-derived status.
- Missing/unresolvable old quiz options or indices are not applied to a different
  quiz. Retain their attempt records, omit incompatible feedback/coverage, and
  show a non-blocking notice. Valid quizzes remain usable.
- New revision attempts must remain excluded from normal-course feedback and
  mastery calculations. If a shared query currently mixes them, fix its scope
  narrowly without changing normal-learning mastery policy.

## 9. Errors, accessibility, and preservation

- Mutation failure keeps selections and existing saved feedback, clears pending
  state, and shows a recoverable error at the relevant quiz/review action.
- Do not require navigation or a page refresh to recover from submission failure.
- Associate late mutation results with their request's revision/node/index, even
  if the user has moved elsewhere. Results from an old route do not patch the
  currently loaded revision.
- Missing sessions/revisions and invalid ownership use existing 404/400 patterns;
  unexpected failures are logged safely and return a generic server error.
- No API keys are required or attached to quiz/revision reads and writes. Chat
  retains its existing scoped credential and web-search header policy.
- Quiz indicators expose accessible names such as Quiz 2: incorrect. Controls
  have visible focus, and feedback has an appropriate focus/live announcement.
- Review actions, quiz navigation, question buttons, resize controls, and summary
  actions are keyboard usable. Honor reduced motion and both themes.
- Original node statuses, completed count, last-active node, session timestamps,
  content, and quiz payloads remain unchanged by revision activity. Chat preserves
  its existing separate browser storage behavior.

## 10. Verification and acceptance criteria

Write failing tests before implementation. Use Vitest/Testing Library for the
client, stdlib unittest for the server, deterministic external mocks, and temporary
storage fixtures. Verify equivalent repository behavior on SQLite and MongoDB.

| ID | Required scenario and outcome |
| --- | --- |
| A1 | Correct single-choice submission immediately shows every option explanation and a green indicator only for that quiz. |
| A2 | Wrong submission shows selected-option explanations, hides unselected answers, remains red, and offers retry in both modes. |
| A3 | Quiz 1 correct, quiz 2 wrong/unanswered: their indicators and restored feedback remain independent; outer topic border stays neutral. |
| A4 | Multiple-choice exact-match evaluation and option-specific explanations work with shuffled labels and more than one correct option. |
| A5 | Previous/Next/Skip and topic navigation preserve submitted feedback and mounted input selections without creating attempts. |
| A6 | Refresh and re-entry restore only the matching revision's latest per-quiz result, selection, and attempt count. A new revision starts unanswered. |
| A7 | Full Review quizzes do not complete a topic. Mark as Reviewed completes reading once; subsequent wrong answers do not undo it. |
| A8 | Practice with two quizzes remains unfinished after one submission; the second wrong submission completes coverage, without claiming mastery. |
| A9 | Retry changes only its quiz result, keeps completed Practice coverage, updates attempt accuracy/summary, and does not restart completion time. |
| A10 | Final submission leaves feedback visible. View Summary opens current metrics explicitly; re-entry does not force the modal open. |
| A11 | Curiosity click prefills and focuses without sending, including repeated clicks on the same question. Plain fallback Markdown stays intact. |
| A12 | Heading selection reaches the intended chat request. Carousel navigation leaves an open conversation attached to its original topic. Explicit retargeting loads the intended conversation. |
| A13 | Desktop chat occupies the right-hand pane, supports bounded resizing, and has independent scrolling. Narrow-screen chat is usable and never rendered below the topic. |
| A14 | Submission/mark-review failures preserve inputs and saved feedback, show recovery, and never manufacture green correctness or completion. |
| A15 | Legacy reviewed nodes, quiz-derived timestamps, partial Practice coverage, and incompatible old attempts follow the compatibility rules without losing attempts. |
| A16 | Header, TOC, history, and summary agree on mode-specific completion and attempt accuracy. Quizless/empty revisions handle zero denominators. |
| A17 | Invalid quiz index, foreign node/revision ownership, and invalid option IDs produce errors without writes. Actual serialized API responses match frontend types. |
| A18 | Original session/node snapshots remain identical before and after revision actions, and original feedback/mastery queries exclude revision attempts. |
| A19 | Switching revision routes while a request is pending cannot leak result, selection, summary, or loading state into the destination revision. |
| A20 | Chat close/reopen, completion, explicit retargeting during a stream, Escape, focus restoration, and expiry retain the specified conversation behavior. |

Verification gates:

- Focused client tests, then the full client test suite, build, and ESLint.
- Focused server revision/router/persistence/parity tests, then the relevant
  learning and repository regression suites using `server/.venv` and `python -m`.
- Greater than 80% coverage for new client units; retain existing coverage gates.
- Browser checks at desktop and mobile sizes, in Full Review and Practice, with
  a separate test revision/fixture for submissions. Do not alter the user's old
  quiz answers solely to demonstrate the fix.
- Record any pre-existing failures separately; do not suppress diagnostics or
  report a pass for a gate that was not run.

## 11. Alternatives and specification references

Targeted shared presentation is selected over independent revision patches,
which perpetuate drift, and a complete flow unification, which risks changing
normal learning unnecessarily. No technology-stack deviation is proposed.

Follow these repository specifications when writing the implementation plan:

- `docs/ARCHITECTURE.md`: server authority, repository facades, and credential boundaries.
- `docs/STACK.md`: React 19, Tailwind 4, FastAPI/Pydantic v2, and existing testing tools.
- `docs/TESTING.md`: test-first workflow, diagnostics, and coverage.
- `docs/CONVENTIONS.md`: type safety, named exports, file headers, and error handling.
- `docs/STRUCTURE.md`: colocated client units/tests and server schemas/services/repositories.
- `docs/INTEGRATIONS.md`: existing chat transport, settings, and storage integrations.
- `docs/CONCERNS.md`: SQLite/Mongo parity, overloaded large modules, and quiz visibility.

Next gate: user approval of this written specification and the MAW dependency
graph in `state.md`, with authorization to proceed. After that gate, dispatch
ready planners and pipeline their workers according to the state. Application
code is unchanged at this stage.
