# Final Report: custom-learning-mode

Status: COMPLETE. All eight acceptance criteria satisfied and verified.

## Executive Summary

Custom was added as a fourth learning-depth mode alongside Auto, Lite, and
Full. In Custom the user supplies an exact whole-number concept count (1-30)
and an optional web-research toggle. The requested count is carried as a first
class value, distinct from the generated `total_nodes`, across the TypeScript
client types, the FastAPI request/response schemas, SQLite shell and session
records, Mongo shell and session records, the detached generation runtime, and
LangGraph checkpointed state. Custom bypasses the LLM depth classifier entirely,
the planner enforces exact cardinality with one strict retry and then a durable
job failure, and research on/off reuses the existing optional researcher stage
and scoped search headers with no new pipeline and no secret persistence.

Delivered through four pipelined plan units (P1 contracts and persistence, P2
planner and durable runtime, P3 Custom settings UI and API payload, P4 integrated
acceptance) plus a technical research phase and a unified code review that was
explicitly skipped by request.

## Workflow configuration

- Workflow: MAW (pipelined multi-agent DAG).
- Skipped phases: `review` (explicit user request).
- Retained phases: brainstorming, technical research, planning, worker
  execution, final verification.
- Goal approved by the user on 2026-10-02; approval persisted across the pause.
- Execution was paused before research and resumed by the user on 2026-10-02.

## Plan breakdown and execution record

| Plan ID | Title | Commits | Status |
| :--- | :--- | :--- | :--- |
| P1 | Contracts and persistence | 0f780e8, 0339020, 87612d4, 8d5e562, 290c6e8, c2c6681, f760787, 6cc100f | Completed |
| P2 | Planner and durable runtime | 5f7a283, e3ec1fe, a5155a4, 26837a8, 0232440, 30fb626, a5e96ab | Completed |
| P3 | Custom settings and API payload | 9894886, f7ba756, 341b223, 8ae0889 | Completed |
| P4 | Integrated acceptance | b5bb9bd, 1763781, cf64e72, 6b7b75d, 124b5ea, ed9cbaf | Completed |

Documentation commits: 5d9c80a (goal), 6123d6b (approval), 5becaf9 and 955b769
(pause/resume state), b900ed1 (research), 80b2093 (research reconciliation),
e2bfa9a (plan1), 7d710e6 (plan2), b53c884 (plan3), 95c4d2b (plan4).

Planner and worker agents ran in parallel foreground mode for the P2/P3 pair,
which research confirmed to have zero file overlap.

## Acceptance coverage

| Criterion | Primary owners | Verification evidence |
| :--- | :--- | :--- |
| AC1 Four dropdown modes | P3 | P4 client acceptance asserts exact option list `['Auto','Lite','Full','Custom']` |
| AC2 Count and Research controls | P3 | P4 client acceptance builds real `generateCourse` request with real header builders |
| AC3 Exactly N topics incl. 1/2/30 | P1, P2 | P4 server acceptance runs HTTP -> runtime -> real `PlannerAgent.plan` -> full graph for N=1, 2, 5, 30 |
| AC4 Invalid count rejection | P1, P3 | 13 HTTP payloads rejected 422 with zero sessions created; 5 client drafts blocked with zero Axios calls |
| AC5 Research off/on stage selection | P2, P3 | Stage order asserted (`RESEARCHING` before `OUTLINING`), researcher awaited 1/0 times, `X-Tavily-Key` present only when on |
| AC6 Store parity and resumed count | P1, P2 | 8 subcases across real SQLite and real Mongo repositories, plus checkpoint close/reopen and `/resume` |
| AC7 Existing modes compatible | All | auto/lite/full reach `COMPLETE` over real HTTP with `custom_topic_count is None` |
| AC8 TDD and quality gates | All | See verification table below |

### Invalid count rejection covered (AC4)

Missing, `None`, `True`, `False`, `2.5`, `3.0`, `"5"`, `0`, `-1`, `31`, and a
count supplied with a non-custom mode are all rejected with HTTP 422 and no
session or scheduled job created. This required `strict=True` on the Pydantic
field because Pydantic v2 otherwise coerces `True` -> 1, `"5"` -> 5, and
`2.5` -> 2.

## Research-driven decisions that shaped the implementation

- `CourseOutline.topics` had TWO independent minimum gates (schema `min_length`
  and a `validate_topics` validator). Relaxing only one would have left 1- and
  2-topic outlines failing before validation, so both were relaxed and per-mode
  checks were centralized in `validate_topic_count_for_mode`.
- `validate_complexity_distribution` in the planner errored unconditionally on
  uniform complexity; it is now guarded with `total >= 3`.
- `resolve_depth_mode` silently falls back to `lite` for unrecognized modes, so
  custom is short-circuited there AND skipped in `initialize_generation_node`.
- Shell creation lives in `generation_jobs.py` and `repositories/mongo_jobs.py`,
  not `LearningManager`, so both storage backends required parity changes.
- The pre-existing test `test_course_outline_rejects_2_topics` encoded the old
  three-topic minimum and was rewritten by P1.
- The live scoped-search header is `X-Web-Search`; some older workflow prose
  said `X-Web-Search-Enabled`. Both client and server use the live spelling.

## Verification and quality assurance

All commands below were run from the repository root (server) or `client/`.

| Command | Result |
| :--- | :--- |
| `server/.venv/Scripts/python.exe -m unittest` | 452 tests, OK, exit 0 (99.4s) |
| `npm test -- --run` | 229 tests passed across 34 files, exit 0 |
| `npm run build` | exit 0, built in 21.62s |
| `npm run lint` | exit 0, 0 errors, 3 warnings |
| `npm run test:generation:coverage` | exit 1, PRE-EXISTING FAILURE (see below) |
| Focused backend coverage (stdlib `trace`) | 110/110 new statements, 100% |
| `TopicInput.tsx` new-code coverage | 265/268 lines, 98.88% |
| `learningApi.ts` new-code coverage | 9/9 lines, 100% |

The 3 lint warnings are unused `eslint-disable` directives in
`client/coverage/{block-navigation,prettify,sorter}.js`, which is a gitignored
generated directory. They are pre-existing and unrelated to this feature.

### Known pre-existing failure (not blocking, not caused by this feature)

`npm run test:generation:coverage` exits 1 with:

```
ERROR: Coverage for branches (80%) does not meet global threshold (81%)
       for src/features/learning/GenerationStatusPanel.tsx
```

All 229 client tests still pass; only the coverage threshold fails. Proof that
this is independent of custom-learning-mode:

1. `client/vitest.generation.config.ts` sets its coverage `include` list to
   eight files, none of which this feature modified. `TopicInput.tsx` and
   `learningApi.ts` are not in that list.
2. `git log 5d9c80a..HEAD` returns no commits touching
   `GenerationStatusPanel.tsx`, `GenerationStatusPanel.test.tsx`, or
   `vitest.generation.config.ts`.
3. Excluding the new P4 test file reproduces the identical failure.

`GenerationStatusPanel.tsx` belongs to the separate Phase 7 progressive
generation work and is out of scope here. It is recorded in
`docs/CONCERNS.md`-style follow-up rather than silently patched.

## Defects found in P1/P2/P3 code

None. Every P4 cross-layer assertion passed on its normal path, so no
owner-coordinated fix commits were required. All defects surfaced during P4 were
in P4-owned test doubles (wrong-count outline doubles, a wrong resume probe, and
an off-by-one client count) and were corrected within P4-owned files.

P4 additionally ran a negative control that dropped `custom_topic_count` from
the stored Mongo document: 4 Mongo subcases failed with `500 != 200`, proving the
Mongo count reads genuinely derive from the document inserted by runtime shell
creation rather than from a fixed return value.

## Verification limitations

These bound the strength of the evidence and must not be overstated:

1. Not a browser against a live server. The client suite stops at a recording
   Axios double while keeping `learningApi`, the header builders, React Query,
   and `TopicInput` real. The server suite uses `httpx.ASGITransport`
   in-process, so the `server/main.py` lifespan never boots.
2. Mongo parity uses real repository code with mocked collection transport and
   transactions. It does not prove live Atlas behavior, server-side
   `$or`/`$lte`/`$nin` semantics, or index and migration effects. Unsupported
   predicates raise a loud `AssertionError` rather than diverging silently, and
   the supported subset is `$or`, `$in`, `$gt`, `$lte`, `$set`, `$inc`.
3. Checkpoint restore is proven only on a real reopened `AsyncSqliteSaver`,
   never on `MongoDBSaver`. No distributed-checkpoint or Mongo-driver recovery
   claim is made.
4. Backend coverage uses stdlib `trace`, which reports line coverage of added
   statements, not branch coverage.
5. `TopicInput.tsx` whole-file legacy coverage is 94.67% statements and
   `learningApi.ts` is 44.06%; the figures quoted above are new-code coverage.

## Workspace safety

The checkout carried 284 pre-existing modified paths of user work, mostly header
simplifications. Every agent used selective staging and inspected the staged
diff before committing; `git add .` was never used. The total set of files
changed by this workflow across all commits is 40 paths, all inside the approved
ownership lists plus the workflow's own documentation. The 284 user
modifications remain uncommitted and intact, and no feature work was left
uncommitted.

## Key artifacts

- Goal: `docs/custom-learning-mode/goal.md`
- State and matrix: `docs/custom-learning-mode/state.md`
- Research: `docs/custom-learning-mode/research.md` (commit b900ed1)
- Plans: `docs/custom-learning-mode/plan1.md` through `plan4.md`
- Review: skipped by explicit user request; no reviewer was spawned
- This report: `docs/custom-learning-mode/final_report.md`