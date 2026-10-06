# Completed-Course Review Parity — Verification

## Scope and provenance
P7 verifies P1–P6; it does not implement production fixes.

- Initial P7 evidence HEAD: `8d9a961` (`test(review-parity): add disposable desktop and mobile acceptance evidence`), branch `master`.
- Post-remediation verification HEAD: `91da45b` (`test(review-parity): assert expired revision chat storage is removed`).
- P6 handoff commit: `ab06f95` (`docs(review-parity): record P6 completion, P7 worker unblocked`).
- Date: 2026-10-06 (all times local, UTC+05:30).
- Node: v24.18.0. Python (server `.venv`): 3.14.6. Vite 7.3.3.
- Fixture origin for browser evidence: `http://127.0.0.1:5178` (dedicated Vite process, `VITE_API_URL=http://127.0.0.1:8018`) backed by the disposable uvicorn factory `server.tests.revision_acceptance_helpers:create_browser_app` at `http://127.0.0.1:8018`, title `P7 DISPOSABLE — Review parity`. P7 stopped the backend after its run; its Vite process remained on 5178 and was confirmed by process command line/time to be the P7 client. The orchestrator reused that fixture origin for a post-fix smoke check and stopped the leftover Vite process and its npm parent. No user dev server was touched; no API key, provider, or user database was involved (fixture SQLite lives in a `TemporaryDirectory` owned by app lifetime).
- P7 owned/committed files: `server/tests/test_revision_repository_parity.py`, `server/tests/test_revision_acceptance.py`, `server/tests/revision_acceptance_helpers.py`, `client/src/features/learning/__tests__/completedCourseReviewParity.test.tsx`, `client/vitest.revision.config.ts`, `docs/completed-course-review-parity/verification.md`, and the four PNG evidences. No production files were modified.

Categorical labels used below: **REAL** (executed in this session, command + exit code + counts recorded), **DEFERRED** (routed to an owner plan with evidence), **UNAVAILABLE** (tool could not produce the observation; never counted as a pass).

## Baseline versus current results
The orchestrator measured 614 passing server tests and 262 passing learning-feature
client tests across 32 files before P6/P7. The latter is NOT the full client suite.
P3 resolved seven pre-existing custom_topic_count errors, originally reproduced at
3c8681c. Keep that historical failure and its fix references; do not list it as a
remaining failure if the current rerun passes. Initial lint had zero errors and
three generated-coverage warnings. Record new warnings/failures separately.

- Current server full discovery after owner fixes: **624 tests, all passing** (was 614 passing pre-P6/P7; growth is P1–P7's new tests, none failing).
- Current full client suite after owner fixes: **427 tests, all passing** across 53 files. The two A20 mode cases pass after P6 fixed focus return (`1450c34`) and P7 corrected the expired-storage null assertion (`91da45b`).
- Current focused revision coverage: **184 tests, all passing**; all five included production units clear all 81% per-file metrics. `useConceptChatPanel.ts` now has 100% statements/lines/branches/functions (46/46 branches), following P5 test commit `0ed3a66`.
- Current generation coverage gate: **427 tests, all passing**; generation thresholds remain unchanged and pass.
- Current build: pass (11.79s). Current lint: exit 0, zero errors; six warnings are unused eslint-disable directives in generated `coverage/` HTML-report JavaScript only.
- `server.tests.test_mongo_learning` custom_topic_count baseline: **resolved by P3** — included in Gate 2 and Gate 3 reruns at HEAD `8d9a961`, all passing. Historical reference: reproduced at `3c8681c`; not a remaining failure.
- Initial P7 lint (before generating both coverage reports): 0 errors / 3 warnings in generated coverage helpers. Latest post-fix lint: 0 errors / 6 warnings; the additional three are from generated `client/coverage/{block-navigation,prettify,sorter}.js` helpers. No source lint warnings/errors were introduced.

## Commands and outcomes
The table below records the initial P7 run before owner remediation (historical
first-run findings). The post-remediation reruns later in this document are the
current final verdict and supersede these first-run failures.

| Time / HEAD | Working directory | Exact command | Exit code | Files/tests/counts or diagnostics | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-06T12:49:29+0530 / `8d9a961` | Repository root | `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_contracts server.tests.test_revision_progress server.tests.test_repository_contracts -v` | 0 | Ran 27 tests, OK | `/tmp/p7-g1.log` (session log) | REAL PASS |
| 2026-10-06T12:49:34+0530 / `8d9a961` | Repository root | `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_sqlite server.tests.test_revision_api server.tests.test_revision_mongo server.tests.test_migrate_to_mongo server.tests.test_mongo_learning server.tests.test_revision_repository_parity server.tests.test_revision_acceptance -v` | 0 | Ran 76 tests, OK; all ten upstream P2/P3 test names linked below verified present in the verbose output (5 SQLite + 5 Mongo) | `/tmp/p7-g2.log` (session log) | REAL PASS |
| 2026-10-06T12:49:57+0530 / `8d9a961` | Repository root | `server/.venv/Scripts/python.exe -m unittest discover -s server/tests -t .` | 0 | Ran 624 tests, OK (82.657s) | `/tmp/p7-g3.log` (session log) | REAL PASS |
| 2026-10-06T12:51:25+0530 / `8d9a961` | `client/` | `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx` | 1 | 17 tests: 15 passed, 2 failed (`A20: full_review…`, `A20: quiz_only…` — known producer defect) | `/tmp/p7-g4.log` (session log) | REAL FAILURE (routed defect) |
| 2026-10-06T12:51:44+0530 / `8d9a961` | `client/` | `npx vitest run --config vitest.revision.config.ts --coverage` | 1 | 19 files / 169 tests: 167 passed, 2 failed (same A20 defect); coverage thresholds: 4 of 5 files pass, `useConceptChatPanel.ts` branches 73.68% < 81% (routed to P5, see Per-file table) | `/tmp/p7-g5.log` (session log) | REAL FAILURE (routed defect) |
| 2026-10-06T12:52:13+0530 / `8d9a961` | `client/` | `npm run test -- --run` (full repository) | 1 | 53 files / 412 tests: 410 passed, 2 failed (same two A20 defect tests; no other file failed) | `/tmp/p7-g6.log` (session log) | REAL FAILURE (routed defect) |
| 2026-10-06T12:52:53+0530 / `8d9a961` | `client/` | `npm run build` | 0 | `tsc -b && vite build`, built in 11.43s | `/tmp/p7-g7.log` (session log) | REAL PASS |
| 2026-10-06T12:52:53+0530 (lint ran immediately after build in the same session, ≈12:53:05) / `8d9a961` | `client/` | `npm run lint` | 0 | 0 errors, 3 warnings (all from untracked generated `coverage/revision/*.js` report helpers) | `/tmp/p7-g8.log` (session log) | REAL PASS with warnings |
| 2026-10-06T12:53:25+0530 / `8d9a961` | `client/` | `npm run test:generation:coverage` | 1 | 53 files / 412 tests: 410 passed, 2 failed (same two A20 defect tests); **no generation coverage-threshold error** | `/tmp/p7-g9.log` (session log) | REAL FAILURE (routed defect) |
| 2026-10-06T12:54:09+0530 / `8d9a961` | Repository root | `git diff --check` | 0 | no output (no whitespace errors) | session record | REAL PASS |

## Post-remediation reruns

The following commands were run after the P5/P6/P7 follow-up commits, against
source HEAD `91da45b` (2026-10-06). These outcomes supersede the earlier blocked
verdicts below; the first-pass failures remain in the history to show what was
fixed and why.

| Working directory | Exact command | Exit code | Result |
| --- | --- | --- | --- |
| `client/` | `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx -t 'A20:'` | 0 | 1 file; 3 passed, 14 skipped. Both Full Review and Practice A20 focus/expiry cases pass. |
| `client/` | `npm run test -- --run` | 0 | Full client suite: 53 files; 427 passed, 0 failed (32.53s). |
| `client/` | `npx vitest run --config vitest.revision.config.ts --coverage` | 0 | 19 files; 184 passed, 0 failed (46.41s). All five new production units clear 81% in branches/functions/lines/statements. |
| `client/` | `npm run test:generation:coverage` | 0 | 53 files; 427 passed, 0 failed (47.71s); generation coverage config unchanged. |
| `client/` | `npm run build` | 0 | TypeScript and Vite build passed in 11.79s; only the existing large-chunk warning. |
| `client/` | `npm run lint` | 0 | 0 errors; 6 warnings, all unused eslint-disable directives in generated `coverage/` and `coverage/revision/` HTML helper files. No source lint errors. |
| Repository root | `server/.venv/Scripts/python.exe -m unittest discover -s server/tests -t .` | 0 | Full server suite: 624 tests, OK (85.595s). |
| Repository root | `git diff --check` | 0 | No whitespace errors. |

Post-fix coverage summary from `client/coverage/revision/coverage-summary.json`:

| Unit | Statements / lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| `QuizResultDetails.tsx` | 100% | 100% | 100% |
| `RevisionQuizSection.tsx` | 100% | 100% | 100% |
| `revisionQuizState.ts` | 100% | 100% | 100% |
| `ConceptChatLayout.tsx` | 97.93% | 94.59% | 100% |
| `useConceptChatPanel.ts` | 100% | 100% | 100% |

The disposable browser factory was restarted for a post-fix Full Review smoke
check and loaded through the existing P7 Vite origin. The route/data rendered and
chat opened/closed with the disposable SQLite fixture; the browser tool does not
provide a reliable keyboard-Escape injection or active-element read, so the
post-fix keyboard/focus assertion is credited to the real RTL A20 tests, not to
that smoke check. Existing four screenshots remain valid for the unchanged
desktop/mobile layout and are explicitly pre-focus-fix visual evidence.

Session logs (`/tmp/p7-g*.log`) are tool-managed temp files; counts above were read directly from them and are not staged as repo files.

Task 7 sub-gate commands (recorded at HEAD `3f623f2`, before the Task 7 commit):

| Time / HEAD | Working directory | Exact command | Exit code | Diagnostics | Verdict |
| --- | --- | --- | --- | --- | --- |
| 2026-10-06T12:17:28+0530 / `3f623f2` | `client/` | `npx vitest run --config vitest.revision.config.ts --coverage` (RED) | 1 | `X [ERROR] Could not resolve "…\client\vitest.revision.config.ts"` — configuration RED, not a measured low-coverage claim | REAL (infrastructure RED) |
| 2026-10-06T12:18:26+0530 / `3f623f2` | `client/` | `npx vitest run --config vitest.revision.config.ts --coverage` (first GREEN attempt) | 1 | 167/169 pass; branches 68.57% on `useConceptChatPanel.ts` → focused acceptance scenarios added to the P7-owned test | REAL (led to coverage extension) |
| 2026-10-06T12:30:07+0530 / `3f623f2` | `client/` | `npm run test:generation:coverage` (independent, pre-Task-7-commit) | 1 | 410/412 pass; only the two A20 defect tests; no threshold error | REAL FAILURE (routed defect) |

`git diff -- client/vitest.generation.config.ts client/vite.config.ts client/package.json` before creating the new config: **empty (no P7 changes)** — REAL PASS for gate preservation.

## Infrastructure RED and behavioral regressions
Distinguish absent helper/config failures from objective regressions and genuine
first-run GREEN acceptance tests. Preserve command/output for each actual RED.

Infrastructure REDs (missing test infrastructure, all converted to GREEN in the same task):

1. **Task 1 RED** — `ModuleNotFoundError: revision_acceptance_helpers` (adapter fixture self-test run before the helper module existed); GREEN: 1 test passing, commit `504b42d`.
2. **Task 3 RED** — missing wire helpers: `ImportError: cannot import name 'wire_fixture'` / `route_client` from `server.tests.revision_acceptance_helpers` when the HTTP acceptance test ran first; GREEN: 9 tests, commit `3062902`.
3. **Task 7 RED** — `npx vitest run --config vitest.revision.config.ts --coverage` exit 1, `Could not resolve "…\client\vitest.revision.config.ts"` at 12:17:28+0530 (missing config gate); GREEN after creating the config verbatim from the plan, commit `3e1bda9`.
4. **Task 8 RED** — `server/.venv/Scripts/python.exe -m unittest server.tests.test_revision_acceptance.RevisionAcceptanceTests.test_browser_factory_uses_disposable_courses_and_no_provider -v` exit nonzero at 12:31:44+0530: `ImportError: cannot import name 'create_browser_app' from 'server.tests.revision_acceptance_helpers'`; GREEN after adding the disposable factory (guard test ok in 6.405s; full P7 server pair `server.tests.test_revision_repository_parity server.tests.test_revision_acceptance` = 10 tests OK), commit `8d9a961`.
5. **Task 9 RED** — documentation-infrastructure RED only: `docs/completed-course-review-parity/verification.md` did not exist at 12:49:25+0530 (`LEDGER_MISSING`), confirming the evidence gate was not pre-satisfied. This ledger is that gate's GREEN.

Behavioral regressions and genuine first-run GREEN acceptance tests:

- **Genuine first-run GREEN:** Task 4's real component/query/router acceptance tests (A1/A2/A3, both modes) passed on the first integrated run against real serialized route payloads; no acceptance test was loosened to pass.
- **Objective producer defect (not a P7 regression):** A20 focus restoration, detailed under *Defects and reruns*. It fails deterministically in both modes and is reproduced in a real browser.
- **No behavioral regression introduced by P7:** full server discovery 624/624 pass; `npm run build` and strict TypeScript decode pass; the only client failures are the pre-identified A20 producer defect.

## Per-file revision coverage
Gate: `npx vitest run --config vitest.revision.config.ts --coverage`, `client/`, HEAD `8d9a961` (12:51:44+0530), thresholds perFile 81% on branches/functions/lines/statements, report `client/coverage/revision/coverage-summary.json` (untracked). Numbers are raw numerator/denominator from the JSON summary.

| New production unit | Statements | Branches | Functions | Lines | Covered/total | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `src/features/learning/QuizResultDetails.tsx` | 100% (61/61) | 100% (25/25) | 100% (1/1) | 100% (61/61) | 61/61 statements | REAL PASS |
| `src/features/learning/RevisionQuizSection.tsx` | 100% (86/86) | 100% (53/53) | 100% (10/10) | 100% (86/86) | 86/86 statements | REAL PASS |
| `src/features/learning/revisionQuizState.ts` | 100% (44/44) | 100% (23/23) | 100% (4/4) | 100% (44/44) | 44/44 statements | REAL PASS |
| `src/features/learning/ConceptChatLayout.tsx` | 97.93% (142/145) | 94.59% (35/37) | 100% (6/6) | 97.93% (142/145) | 142/145 statements; uncovered lines 70–72 are the legacy `media.addListener` fallback | REAL PASS |
| `src/features/learning/useConceptChatPanel.ts` | 95.65% (132/138) | **73.68% (28/38)** | 100% (1/1) | 95.65% (132/138) | 132/138 statements | **REAL FAIL on branches — routed to P5** |

`useConceptChatPanel.ts` branch detail (P7-owned acceptance test was extended first, per plan):

- P7 extended `completedCourseReviewParity.test.tsx` (commit `3e1bda9`) with the two scenarios the **real RevisionPage UI can reach**: same-heading toggle deselect (`Chat about "…"` twice → `prev.filter` branch) and the ChatPanel `Clear selections` chip (`clearHeadings`). Branches rose 68.57% → 73.68%.
- Remaining uncovered branches (source lines ~131–133 `openChat` same-node title fill, ~154 `askQuestion` title-falsy fallback chain, ~159–160 `askQuestion` same-node title fill, ~182 `toggleHeadingChat` title-falsy fallback chain) are **unreachable through both production pages**: `RevisionPage.tsx` (lines 621, 628, 687) and `LearningPathContainer.tsx` (lines 484, 495, 969) always pass a non-empty `currentNode.title` (or `undefined` together with an undefined node id). Exercising them requires direct hook calls — i.e., missing unit cases in P5's `src/features/learning/useConceptChatPanel.test.ts`. **DEFERRED to P5** (plan Task 7 Step 4: "route missing unit tests to P4/P5"); thresholds were not lowered, no include removed, no ignore comments added.
- `npm run test:generation:coverage` independently: exit 1 with **no threshold error**; failure is solely the two A20 defect tests (see Commands table). Generation thresholds themselves pass.

## Acceptance evidence
| Criterion | Genuine assertion/evidence | Actual result |
| --- | --- | --- |
| A1 | P7 A1/A2/A3, both modes: every q0 explanation, green q0 only, held refetch | REAL PASS — RTL `A1/A2/A3: patches feedback before refetch…` both modes (Gate 4/5 runs): all four `Explanation q0-*` visible after correct submit, `Quiz 1: correct` green while `Quiz 2: unanswered` muted, submissions held until `releaseRefetch` (`h.posts()` length 2 asserted); identical wire transcript asserted on both adapters by `test_serialized_contracts_and_wire_fixture` (Gate 2, 76 tests). |
| A2 | P7 A1/A2/A3, both modes: only q1 selected explanation, red and Try Again | REAL PASS — RTL asserts only `Explanation q1-1` visible (q1-0/2/3 absent), `Incorrect` + enabled `Try Again`, `Quiz 2: incorrect` red; browser reproduction: wrong feedback `Incorrect / Attempt #1 • Score: 0% / Explanation q1-1` readable on screen (both modes captured). |
| A3 | P7 A1/A2/A3 and A5/A6: independent restored colors/feedback, border-border | REAL PASS — RTL asserts `revision-concept-card` keeps `border-border` and not green/red while indicator chips are colored; browser: card class measured `…border border-border bg-card` with green/red chips present (full-review desktop). |
| A4 | P7 real adapter multi_select test + edge UI A4: exact IDs, selected-only wrong, separate correct reasons | REAL PASS — `server/tests/test_revision_repository_parity.py` multi-select transcript on both adapters (exact `selected_option_ids` order, per-option reasons) + RTL `A4: shuffled multiple-choice disclosure…` (`submit.mock.calls` payload `['q0-2','q0-0']`, both correct explanations rendered, no "wrong" styling for correct picks). |
| A5 | P7 A5/A6: Previous/Next/Skip/topic draft retention and zero transport submissions | REAL PASS — RTL `A5/A6: mounted drafts survive quiz/topic navigation…`: selections survive Previous/Next/Skip and topic switches with `h.posts()` length 0. |
| A6 | P7 A5/A6 remount/new route + adapter fresh revision + P2/P3 deterministic latest restoration | REAL PASS — RTL remount restores matching saved results and fresh revision shows unanswered; upstream deterministic-restoration assertions executed now: `test_revision_sqlite.RevisionSqliteTests.test_restore_latest_results_and_list_use_own_attempts`, `test_revision_mongo.RevisionMongoTests.test_legacy_single_quiz_and_scalar_attempt_restore_without_rewrite` (both in Gate 2 verbose output). |
| A7 | P7 both-mode transcripts + P2/P3 explicit idempotent reading: wrong does not undo review | REAL PASS — adapter transcripts `first_review`/`second_review` equal; upstream `test_revision_sqlite.RevisionSqliteTests.test_full_review_is_explicit_idempotent_and_independent` and `test_revision_mongo.RevisionMongoTests.test_full_review_is_explicit_idempotent_and_quiz_independent` executed in Gate 2. |
| A8 | P7 transcripts and A7/A8/A9/A10/A16: one of two pending, second wrong finished | REAL PASS — RTL `A7/A8/A9/A10/A16: completion and latest feedback stay independent…` both modes: after first quiz only status pending; after second (wrong) quiz status `Reviewed`/`Practice finished`; wire transcript `mixed` state matches. |
| A9 | P7 transcripts: 2/3=66, completion clock unchanged; UI retry updates its result/current summary | REAL PASS — `test_serialized_contracts_and_wire_fixture` asserts `retry.total_quiz_score_percent == 66` and summary `quizzes_total == 3` on both adapters; RTL retry updates result and current summary without auto-modal. |
| A10 | P7 final feedback/no auto modal + explicit current summary and completed re-entry | REAL PASS — RTL asserts no `Revision Summary` dialog after completion, explicit `View Summary` opens 50% summary with correct-attempts/incorrect-attempts counts, Escape closes, Try Again keeps prior result visible. |
| A11 | P7 A11/A12/A20: real curiosity/composer repeated prefill, zero sends, fallback Markdown | REAL PASS — RTL: single rendered question button, composer prefilled + focused, re-click restores prefill over an edited draft, `transport.stream` never called; browser: composer value `Why study A?`, `[active]` focus, chat log empty-state only, close/reopen repeats prefill. |
| A12 | P7 A11/A12/A20: actual heading ID in request, carousel ownership, explicit destination history | REAL PASS — RTL: `stream.calls[0].selectedHeadingIds` equals the real Markdown heading id from `data-heading-id`; carousel navigation keeps dialog `Chat: Topic A` (no silent switch); explicit heading-chat retarget loads destination (`Preserved B history`), aborts A's stream (`signal.aborted === true`), late A delta rejected; browser: dialog stayed `Chat: Topic A` through `Next topic`, `Chat about "Plain heading"` switched to `Chat: Topic B` with empty B log, A's delta count froze. |
| A13 | P7 A13 + producer layout assertions + four measured browser pane/overlay/scroll captures | REAL PASS — RTL `A13: desktop separator clamps to 25–38 and mobile uses a bounded overlay` (+ `ConceptChatLayout.test.tsx` 768px boundary assertions, Gate 5 suite) + measured browser geometry: desktop root `flex-direction: row`, `overflow: hidden`, content pane 960×636 `overflow-y: auto`, chat pane 320×636 (25%) at x=960, same vertical band y=111–747, footer below at y=747; node-targeted wheel over chat log changed log scrollTop 4143→2042 while content held 0 (independent scroll); mobile 375×667 overlay 375×483 full-width bounded, no separator. Screenshot paths below. Tool limit recorded: generic coordinate wheel was not pane-precise; node-path scroll and geometry reads were used; the keyboard Home/End/Arrow clamps and pointer drag were exercised live (25→35.16% drag; End→38, Home→25, arrows clamped). |
| A14 | P7 failed retry/review UI + P2 rollback/P3 insert-failure regressions | REAL PASS — RTL failed-retry/review error rendering; upstream `test_revision_sqlite.RevisionSqliteTests.test_failed_aggregate_update_rolls_back_attempt_and_metadata`, `test_revision_mongo.RevisionMongoTests.test_committed_attempt_survives_aggregate_failure`, `test_revision_mongo.RevisionMongoTests.test_attempt_insert_failure_keeps_saved_result` executed in Gate 2. |
| A15 | P7 legacy partial/incompatible test + P2 one-time migration/P3 absent-null inference + notice UI | REAL PASS — P7 legacy/incompatible-transcript tests; upstream `test_revision_sqlite.RevisionSqliteTests.test_review_migration_is_one_time_and_preserves_rows`, `test_revision_sqlite.RevisionSqliteTests.test_legacy_single_quiz_null_index_and_quizless_nodes`, `test_revision_mongo.RevisionMongoTests.test_legacy_review_inference_only_for_absent_reviewed_field` executed in Gate 2; RTL `A15/A16: … notices and quizless states are visible without false completion` both modes. |
| A16 | P7 transcript summary/list/get equality, live header/TOC/history/summary, quizless/empty states | REAL PASS — transcript equality (`summary`, `listed`, fresh get) asserted on both adapters; RTL header counter, TOC dialog (`RevisionContentsDialog`), revision history list, summary modal, and the quizless/empty-state notices (Task 6) all pass. |
| A17 | P7 actual HTTP no-write errors/foreign course + exact keys + typed wire decoder and client build | REAL PASS — `test_http_errors_write_nothing_on_both_adapters` (422/400/404 matrix, raw snapshots unchanged after each write attempt), `test_real_foreign_course_membership_cannot_authorize_a_write` (400/404, no write), exact `ATTEMPT_KEYS` contract via `RevisionQuizSubmissionResult.model_validate` on real wire bodies, strict TS wire decode in the client harness, `npm run build` exit 0 (strict TS). |
| A18 | P7 raw original snapshots/history/mastery before/after on both adapters and wire original equality | REAL PASS — `wire_fixture` asserts `original_before == original_after` raw snapshots on both adapters; `test_revision_repository_parity.py` original-isolation transcripts; `original_after` equality asserted in `test_serialized_contracts_and_wire_fixture`. |
| A19 | P7 late resolve/reject after real router switch: no results/drafts/errors/loading/summary leak | REAL PASS — Task 5 route-race tests (`…route races` commits `6ad8c19`): late-resolving and late-rejecting requests after navigation produce no leaked results, drafts, errors, loading overlays, or summary state. |
| A20 | P7 stream abort/late delta, repeat prefill, completed chat/re-entry/expiry/Escape/focus + browser notes | **REAL PARTIAL — genuine producer defect on focus restoration (routed to P5/P6).** PASSING parts: stream abort/late-delta rejection, repeated prefill, completed re-entry history preservation, chat expiry (3 600 001 ms seeded history not rendered, localStorage purged) — all RTL-asserted both modes; browser supplements: `Stop streaming` froze delta count at 50/81, retarget abort, prefill repeats, expiry live. FAILING parts (exactly 2 tests, both modes): `A20: full_review completion/re-entry preserve chat and expiry still applies` and `A20: quiz_only …` fail at `await waitFor(() => expect(screen.getByRole('button', { name: 'Open concept chat' })).toHaveFocus())` — received focus target is `<body>`. Live browser reproduction: after Escape-close of the mobile overlay, `document.activeElement` = `BODY`. See Defects and reruns. |

## Browser measurements and screenshots
All four views use disposable fixture data at origin `http://127.0.0.1:5178` → factory `http://127.0.0.1:8018` (`P7 DISPOSABLE — Review parity`). Browser: ZCode in-app browser (IAB). Viewport sizes were read back from the tool (`viewportSize()`), not inferred from a label. No settings/secrets/user data screens were captured.

1. **Full Review — desktop** — `docs/completed-course-review-parity/p7-full-review-desktop.png`, viewport **1280×800**, route `/learn/00000000-0000-0000-0000-000000000001/revise/00000000-0000-0000-0000-000000000015`.
   Interactions observed: q0 Option 0 submit → `Correct!`, `Quiz 1: correct` chip `bg-green-500`; q1 Option 1 submit → `Incorrect / Attempt #1 • Score: 0%` + `Try Again`, only the selected option's explanation shown; card border stayed `border-border`; both topics `Mark as Reviewed` → counter `2 / 2 topics reviewed` + `View Summary`; same-tab refresh restored indicators, `Reviewed` badge, and wrong-answer feedback; curiosity prefill + draft-retention + close/reopen repeat with zero sends; heading-chat select/clear/deselect chip; streaming, `Stop streaming` abort (delta count frozen at 50), carousel isolation, explicit retarget to Topic B (`Chat about "Plain heading"`); separator pointer drag 25→35.16%; keyboard End→38 / Home→25 / arrows clamped.
   Computed layout (measured via in-page geometry): root `flex-direction: row`, `overflow: hidden`; content pane `{x:-4, y:111, w:960, h:636, overflow-y:auto}`; chat pane `{x:960, y:111, w:320, h:636}` (25%); separator `{x:956, w:4}`; chat log `{x:961, w:319, overflow-y:auto}`; footer `{y:747, h:53}` — content and chat share the vertical band 111–747, chat is right and above the footer, never below quizzes.
   Independent scroll: node-targeted wheel over the chat log moved log scrollTop 4143→2042 while content scrollTop stayed 0; content wheel moved content 1907→157→0 while log held 3757. Minor observed quirk (recorded, non-blocking): the 4px separator is not subtracted from the 75/25 flex split, so the content pane's left edge is clipped 4px (`x=-4`).
   Console: the IAB tool does not expose console history (UNAVAILABLE as a direct read); no Vite error overlay, no failed interaction, and no broken state appeared in any snapshot; the deterministic chat stream rendered 40/40 deltas when unaborted. Result: PASS.
2. **Full Review — mobile** — `docs/completed-course-review-parity/p7-full-review-mobile.png`, viewport **375×667** (measured width 375 < 768), same route.
   Interactions observed: chat reopened via FAB renders `concept-chat-overlay` full-width `{x:0, y:131, w:375, h:483}` within the bounded content band (main area), no desktop separator (`separatorPresent: false`), composer visible at `{y:566}`; Escape closes the overlay (count 0 after) and topic scroll position is restored (scrollTop 800 before and after close).
   **Defect reproduced live:** focus after Escape lands on `<body>` (`activeElement` = BODY), not the `Open concept chat` FAB — matches the A20 RTL failures. Result: PASS for layout/scroll evidence; focus restoration FAIL routed (A20).
3. **Practice — desktop** — `docs/completed-course-review-parity/p7-practice-desktop.png`, viewport **1280×800**, route `/learn/00000000-0000-0000-0000-000000000001/revise/00000000-0000-0000-0000-000000000018`.
   Interactions observed: quiz-only page shows **no** content markdown, curiosity controls, or `Mark as Reviewed` action (snapshot-verified); two fixture submissions (q0 Option 0 → green `1`, q1 Option 1 → red `2` with readable `Incorrect / Attempt #1 • Score: 0% / Explanation q1-1` on the selected option only, consistent with A2 semantics in both modes); explicit `View Summary` and `1 / 1 topics finished`; chat right pane opens, closes, and reopens with the conversation history retained (deterministic fixture messages). Result: PASS.
4. **Practice — mobile** — `docs/completed-course-review-parity/p7-practice-mobile.png`, viewport **375×667** (measured width 375 < 768), same route.
   Interactions observed: full-width bounded overlay `{x:0, y:131, w:375, h:483}`, no separator, composer visible, close control present; same fixture data. Result: PASS.

Tool-limit notes (honest classification): the generic coordinate `scroll` was not pane-precise (it moved the wrong container once), so per-pane independence was proven with a node-targeted scroll plus geometry reads; keyboard resize was exercised via element-scoped key events after CUA-level keys did not reach the separator; console output could not be read retroactively. RTL-only evidence (not browser-reproducible here): exact 768.0px boundary switch, expiry timing (3 600 001 ms), abort-signal state, and route-race timing — these remain covered by the deterministic `ConceptChatLayout.test.tsx` / `completedCourseReviewParity.test.tsx` assertions. Screenshots alone do not prove route races, expiry, exact-match evaluation, or original-data preservation; those are covered by the tests above.

## Defects and reruns
| Defect | Reproduction | Actual/expected | Owner | Failing command | Fix commit | Affected reruns |
| --- | --- | --- | --- | --- | --- | --- |
| A20 focus restoration: chat FAB focus was lost on Escape-close | Initial run: both mode cases failed focus restoration; live browser also observed BODY after mobile Escape-close. | Actual was BODY because `RevisionPage` unmounted the FAB while chat was open. P6 now keeps the opener mounted but inaccessible while open and restores non-body opener focus after mobile panel unmount. | P6 | Initial targeted run failed; post-fix `npx vitest run src/features/learning/__tests__/completedCourseReviewParity.test.tsx -t 'A20:'` passes 3/3 selected tests. | Fixed by `1450c34`; tests by `RevisionPage.test.tsx`; P7 expiry matcher also corrected in `91da45b`. | RESOLVED — full client suite 427/427 passes; revision and generation coverage gates pass. |
| Revision coverage gate: `useConceptChatPanel.ts` branches were 73.68% < 81% | Initial `npx vitest run --config vitest.revision.config.ts --coverage` measured 28/38 branches. Uncovered paths were public-hook title fallback/title-fill cases not reachable via current page UI. | P5 added direct `renderHook` cases for active/current title fallbacks and same-node title fill. No production behavior or threshold changed. Latest: 46/46 branches, 100% statements/lines/branches/functions. | P5 | Initial Gate 5 failed threshold; post-fix focused coverage command exits 0 with 184/184 tests. | Fixed by `0ed3a66`. | RESOLVED — all five units meet 81% in all four metrics. |
| P7 expiry assertion used string matcher for removed storage item | After the focus fix, both A20 tests advanced to line 335 and threw because `localStorage.getItem(key)` was `null`, then `.not.toContain(string)` received null. | Expired storage removal is the expected behavior. P7 changed the assertion to `toBeNull()` while retaining the UI absence assertion; no producer code changed. | P7 test harness | Initial post-P6 targeted run failed at null/string matcher; current A20 run passes 3 selected tests. | Fixed by `91da45b`. | RESOLVED — full client suite 427/427 passes. |
| Minor visual quirk (non-blocking observation): desktop content pane clipped 4px on the left | Measured geometry at 1280px: content `{x:-4, w:960}` + separator 4px + chat 320px = 1284 > 1280 inside `overflow-hidden` root | Actual: 75/25 flex split does not reserve the separator width; expected (cosmetic): no clipping. No assertion or guideline violated; padding absorbs it visually | P5 (`ConceptChatLayout` split math) — informational | n/a (measured, no failing test) | none | none |

Historical baseline failure `test_mongo_learning` custom_topic_count (reproduced at `3c8681c`): **resolved by P3**; current reruns pass, including the post-remediation full server suite (624 tests at source HEAD `91da45b`). Kept as historical reference only, not a remaining failure.

Rerun discipline: after each P7-owned change (Task 7 coverage extension `3e1bda9`, browser evidence `8d9a961`, and expiry assertion fix `91da45b`), affected suites were rerun. P5/P6 changes were also followed by targeted, full client, coverage, build/lint, and full server reruns. P7 did not modify any producer file to obtain a pass.

## Unrun gates and remaining evidence limitations

All planned final gates were run. There are no current code/test/coverage blockers.
The initial failures listed above are resolved and the post-remediation outcomes
are recorded in the current rerun table. No skipped standalone research/review
verdict is manufactured.

Remaining evidence limitations (not failed gates): retroactive browser console
history and direct post-fix Escape key/focus inspection are unavailable through
the browser control API; the exact 768.0px live boundary and CUA-level separator
key injection were not observed directly. Deterministic RTL assertions cover
these cases; the four disposable desktop/mobile screenshots remain layout
evidence from before the focus-only fix. No such limitation is counted as a
browser pass.

## Exit decision
Only PASS after all A1–A20 assertions/evidence exist, both adapters pass, all five
new units exceed 80% in every metric, both coverage gates and all required commands
are recorded, and desktop/mobile evidence exists for both modes without user writes.

- A1–A19: **REAL PASS** — every row cites genuine assertions (RTL, both adapter transcripts/wire, upstream P2/P3 names, build, strict decode).
- A20: **REAL PASS** — focus restoration and expired-history removal pass in both modes after P6 producer fix and P7 matcher correction; targeted rerun is 3/3 passing.
- Both adapters: **PASS** (Gate 2: 76 tests; parity transcripts; wire equality).
- Per-file coverage: all 5 new units **≥ 81% in all four metrics**; `useConceptChatPanel.ts` now 100% branch coverage.
- Both coverage gates: **PASS** — revision coverage 184/184 and generation coverage 427/427; neither threshold was weakened.
- All final commands: recorded with working directories, exit codes, counts, and tested HEAD; `git diff --check` clean; four desktop/mobile screenshots exist for both modes with disposable data only; no user DB/settings or API key/provider were used.
- **Verdict: PASS after remediation.** A1–A20 are evidenced, both adapters are equivalent, full server (624/624) and full client (427/427) suites pass, build passes, lint has no errors, and both coverage gates pass. P7 did not modify producer code; P5/P6 resolved their assigned blockers and the P7 test assertion was corrected by P7 ownership.
