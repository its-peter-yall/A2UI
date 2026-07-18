# Final Report: Learning Depth Modes (auto / lite / full)

## Original Objective

Add **auto**, **lite**, and **full** depth modes to the learning topic input so course generation scales concept-card count to subject complexity:

| Mode | Topics | Purpose |
|------|--------|---------|
| lite | 3–10 | Trivial / single-concept subjects |
| full | 10–30 | Complex / multi-system domains |
| auto | → lite\|full | Cheap LLM semantic router |

One base planner system prompt + two injectable templates. Hard schema bounds. Persist user mode + resolved mode on session.

## Plan

- Goal: `docs/learning-depth-modes/goal.md`
- Design: `docs/superpowers/specs/2026-07-17-learning-depth-modes-design.md`
- Plan: `docs/learning-depth-modes/plan.md`
- Design commit: `8df32bd`
- Plan commit: `c46bd79`

## Implementation Summary

### Architecture (Approach A)

```
TopicInput dropdown (default auto)
  → POST /learning/generate { query, mode }
  → resolve_depth_mode (auto → classify; fail → lite)
  → CourseState { mode, resolved_mode }
  → planner_node → plan(mode=lite|full) + LITE/FULL template
  → bounds validate + one replan → else 422
  → session.mode + session.resolved_mode persisted
```

### Code Changes

| Area | Files | What |
|------|-------|------|
| Schema | `server/schemas/learning.py` | `LearningDepthMode`, `ResolvedDepthMode`, `MODE_TOPIC_BOUNDS`, `validate_topic_count_for_mode`, CourseOutline min 3 / max 30, session mode fields |
| DB | `server/database/learning_persistence.py` | `mode` + `resolved_mode` columns, migration, create/get |
| Router service | `server/services/depth_router.py` | `classify_depth`, `resolve_depth_mode` (fail→lite) |
| Instructor | `server/utils/instructor_client.py` | `depth_router` role |
| Planner | `server/agents/planner.py` | LITE/FULL templates, inject, replan once, `OutlineTopicCountError` |
| Graph | `server/graph/state.py`, `nodes.py` | state fields; plan + create_session with modes |
| API | `server/routers/learning.py` | request.mode default auto; resolve; 422 on bounds |
| Client | `client/src/types/learning.ts`, `TopicInput.tsx` | types + Auto/Lite/Full dropdown |

### Tests Added

- `server/tests/test_depth_mode_schema.py`
- `server/tests/test_depth_mode_persistence.py`
- `server/tests/test_depth_router.py`
- `server/tests/test_planner_mode.py`
- Mode cases in `server/tests/test_learning_graph_router.py`
- Graph mock updates in `server/tests/test_graph.py`

### Verification

| Check | Result |
|-------|--------|
| Full server unittest | **105 tests OK** |
| Client lint | OK |
| Client build (`tsc` + vite) | OK |

### Feature Commits

| Hash | Message |
|------|---------|
| `a67665d` | feat(schema): depth mode types, CourseOutline min 3, bounds helper |
| `85721d7` | feat(db): persist learning session mode and resolved_mode |
| `23c019f` | feat(depth-router): classify auto mode with lite fallback |
| `25ee63e` | feat(planner): inject lite/full templates, validate bounds, replan once |
| `c225da0` | feat(learning): wire depth mode resolve through graph and API |
| `6e66de0` | feat(client): depth mode dropdown default auto on TopicInput |

Docs: `8df32bd` (goal+design), `c46bd79` (plan).

## Manual Smoke (operator)

| Case | Expect |
|------|--------|
| Default Auto + trivial query | resolved lite or full; count in bounds |
| Explicit Lite | ≤10 topics; mode=lite |
| Explicit Full | ≥10 topics; mode=full |
| POST mode=turbo | 422 |
| Multi-topic course | first 3 sync + background remainder OK |

## Risks / Follow-ups

- List sessions API does not yet return mode fields (get-by-id does).
- Course card UI does not display mode badge (persist only).
- Auto adds one classify LLM call (fail→lite saves tokens).
- Browser smoke not run in this session.

## Status

**Workflow complete.** Feature implemented, tests green, client build green.
