# Final Report: Manual Topic Node Content Regeneration

## Objective

Add ability to regenerate topic node contents on-demand via refresh button on topic cards.

## Plan

See `docs/plan.md` (commit `48fcfe6`).

## Code Changes

| File | Change | Lines |
|------|--------|-------|
| `server/database/learning_persistence.py` | New `replace_node_content()` — bypasses state-machine validation for manual regen | +103 |
| `server/graph/regen.py` | New `regenerate_topic_node()` — runs generator + quizzer unconditionally, resets status | +111 |
| `server/routers/learning.py` | Endpoint auto-detects node status: ERROR → existing partial regen, non-ERROR → full regen, LOCKED → 400 | +51/-16 |
| `client/src/features/learning/ConceptCard.tsx` | RefreshCw button in card header with tooltip "Regenerate the content", visible on non-LOCKED nodes | +28 |
| `server/tests/test_learning_graph_router.py` | Updated 3 tests to mock `get_concept_node` | +52 |

## Key Design Decisions

- **No client API changes**: `learningApi.ts` and `useLearningMutations.ts` unchanged. Server auto-detects node status to route between error retry vs manual regen.
- **State-machine bypass**: `replace_node_content()` method writes content + status atomically without invoking `_is_valid_transition`, since manual regen must reset IN_QUIZ/COMPLETED → VIEWING_EXPLANATION.
- **Non-Goal preservation**: ERROR nodes still use `regenerate_failed_node` with partial-regen based on `failed_step`. ERROR + manual-regen path rejected with 400.

## Verification

- **Client**: `npm run lint` — zero new errors (all 22 pre-existing). `npm run build` — success (tsc + vite).
- **Server**: 56/56 tests pass (0 failures, 0 errors).

## Commit

Commit `13fbd7d` — `feat: manual topic node regeneration with refresh button`
