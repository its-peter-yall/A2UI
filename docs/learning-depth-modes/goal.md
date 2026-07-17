# Goal: Learning Depth Modes (auto / lite / full)

## Original Objective

Add **auto**, **lite**, and **full** depth modes to the learning topic input so course generation scales topic count and granularity to subject complexity.

User selects mode via a **dropdown** on the learning text box (default **auto**). Modes control how many concept cards the planner produces and how deeply subjects are decomposed.

## Why

Today the planner uses soft adaptive scaling (5–30 topics, “when in doubt add more”) and a hard schema minimum of 5 topics. Trivial subjects (e.g. “Placebo Effect”) get over-expanded; complex subjects need explicit room for full atomic coverage. Users also need a cheap default path that routes depth automatically.

## Modes

| Mode | Topic count | Intent | Examples |
|------|-------------|--------|----------|
| **lite** | 3–10 (min 3, max 10) | Trivial / single-concept subjects | Placebo Effect; Biological Immortality of Jellyfish; Six Degrees of Separation; Rubber Duck Debugging |
| **full** | 10–30 (min 10, max 30) | Non-trivial / complex domains | Quantum mechanics; Full LLM internals; ML from scratch; Fullstack app from scratch |
| **auto** | resolved to lite or full | Semantic depth routing before plan | Router classifies query → lite \| full |

Boundary: both modes allow **exactly 10** topics (overlap intentional).

## Product Decisions (locked)

1. **UI**: Dropdown on learning input; default **auto**.
2. **Auto routing**: Separate cheap LLM classify call (structured `lite|full` + reason).
3. **Enforcement**: Schema hard bounds by resolved mode (not prompt-only).
4. **Prompts**: One base planner system prompt + two injectable templates (`LITE_TEMPLATE`, `FULL_TEMPLATE`).
5. **Persistence**: Store `mode` (user selection) and `resolved_mode` (`lite|full`) on learning session.
6. **Router failure**: Fallback to **lite** (save tokens), log warning.
7. **Out-of-bounds outline**: One replan with stricter constraints; still invalid → 422.
8. **Architecture**: Approach A — prompt templates + graph mode state; no graph topology change.

## Success Criteria

- User can pick Auto / Lite / Full before Learn; Auto is default.
- `POST /learning/generate` accepts optional `mode` (default `auto`).
- Auto runs depth router; planner receives only `lite` or `full`.
- Planner system prompt = base + injected mode template.
- Generated `CourseOutline.topics` length is within mode bounds (hard validated).
- Session response includes `mode` and `resolved_mode`.
- Existing generate flow (first 3 sync + background remainder) still works.
- Unit/API/client tests cover mode default, routing, bounds, prompt injection.

## Out of Scope

- Changing generator/quizzer pedagogy beyond topic count.
- UI display of mode on course cards (persist only; display can come later).
- Per-topic user overrides of complexity.
- Multi-model routing config UI (use existing provider/settings stack).

## Key Touchpoints (current codebase)

| Layer | File | Role |
|-------|------|------|
| Client UI | `client/src/features/learning/TopicInput.tsx` | Input + Learn; add mode dropdown |
| Client types | `client/src/types/learning.ts` | `GenerateCourseRequest` |
| Client API | `client/src/lib/learningApi.ts` | `generateCourse` payload |
| Router | `server/routers/learning.py` | `POST /learning/generate` |
| Graph state | `server/graph/state.py` | `CourseState` |
| Graph node | `server/graph/nodes.py` | `planner_node` |
| Planner | `server/agents/planner.py` | `PLANNER_SYSTEM_PROMPT`, `plan()` |
| Schemas | `server/schemas/learning.py` | `CourseOutline` min topics = 5 today |
| DB | `server/database/learning_persistence.py` | `learning_sessions` table |

## Phases (high-level)

1. **Contracts** — types, request schema, DB columns, CourseState fields.
2. **Depth router** — classify service + tests.
3. **Planner templates** — base + LITE/FULL inject; bounds validation + replan.
4. **Wire generate path** — router → graph → planner → persist.
5. **Client UI** — dropdown default auto; payload includes mode.
6. **Verification** — tests, lint, build.

## References

- Design spec: `docs/superpowers/specs/2026-07-17-learning-depth-modes-design.md`
- Product screenshot context: Learn home “What do you want to learn today?” input bar
