# Implementation Plan: Manual Topic Node Content Regeneration

## Overview

Allow users to manually regenerate any topic node's content (explanation + quizzes) on-demand via a refresh button in the concept card header. The existing ERROR-state retry flow stays untouched (Non-Goal #1).

---

## Architecture Summary

| Layer  | Component                  | Change                                                            |
| ------ | -------------------------- | ----------------------------------------------------------------- |
| Server | `regen.py`                 | Add `regenerate_topic_node()` — runs both agents unconditionally |
| Server | `learning_persistence.py`  | Add `replace_node_content()` — bypasses state-machine validation  |
| Server | `routers/learning.py`      | Branch on new `?manual=true` query param                          |
| Client | `lib/learningApi.ts`       | `regenerateNode()` sends `manual=true`                            |
| Client | `features/learning/ConceptCard.tsx` | Add `RefreshCw` icon button in card header                |

`LearningPathContainer.tsx` and `useLearningMutations.ts` need **no changes** — both already wire `onRegenerate` and `isRegenerating` through to `ConceptCard`.

---

## Critical Constraint: State-Machine Transition Validation

`LearningManager._is_valid_transition` (`server/database/learning_persistence.py:1782`) blocks these transitions:

| From                | To                  | Allowed? |
| ------------------- | ------------------- | -------- |
| `VIEWING_EXPLANATION` | `VIEWING_EXPLANATION` | yes (same) |
| `IN_QUIZ`             | `VIEWING_EXPLANATION` | **NO**   |
| `SHOWING_FEEDBACK`    | `VIEWING_EXPLANATION` | **NO**   |
| `COMPLETED`           | `VIEWING_EXPLANATION` | **NO**   |

Manual regen must reset `IN_QUIZ` / `SHOWING_FEEDBACK` / `COMPLETED` → `VIEWING_EXPLANATION`. Solution: a new persistence method `replace_node_content()` that writes content + status atomically **without** invoking `_is_valid_transition`. Existing `update_node_content()` stays untouched (used by `regenerate_failed_node` which only transitions from `ERROR` — already allowed).

---

## Phase 1 — Server: Extend Regeneration for Any Topic Node

### 1.1 `server/graph/regen.py` — Add `regenerate_topic_node()`

**Location:** Append new function after `regenerate_failed_node` (line 186).

**Signature:**

```python
async def regenerate_topic_node(
    node_id: str,
    llm_context: Optional[LLMContext] = None,
) -> Optional[Dict[str, Any]]:
```

**Behavior:**

1. Fetch node via `learning_manager.get_concept_node(node_id)` (line 71 reference).
2. Raise `LookupError` if node missing.
3. Raise `ValueError` if `node["status"] == NodeStatus.LOCKED.value` ("Node is locked; cannot regenerate").
4. Raise `ValueError` if `node["status"] == NodeStatus.ERROR.value` ("Use error retry endpoint for ERROR nodes"). This keeps the two paths disjoint.
5. Derive session context (lines 95–111 reference): `prev_summary`, `next_summary`, `previous_status` from siblings.
6. Compute `quiz_count` from existing quiz payload (lines 112–117 reference) — preserves the user's existing quiz count preference.
7. Build `TopicNode` (lines 119–126 reference).
8. **Always** run generator agent (mirrors lines 140–149, but unconditional):
   ```python
   content = await generator_agent.generate_explanation(
       topic=topic, prev_summary=prev_summary,
       next_summary=next_summary, llm_context=llm_context,
   )
   new_content_markdown = content.content_markdown
   ```
9. **Always** run quizzer agent (mirrors lines 151–157, but unconditional):
   ```python
   new_quiz_set = await quizzer_agent.generate_quiz_set(
       topic=topic, content=new_content_markdown,
       quiz_count=quiz_count, llm_context=llm_context,
   )
   ```
10. Compute new status (lines 159–163 reference):
    ```python
    new_status = NodeStatus.LOCKED
    if sequence_index == 0:
        new_status = NodeStatus.VIEWING_EXPLANATION
    elif previous_status == NodeStatus.COMPLETED.value:
        new_status = NodeStatus.VIEWING_EXPLANATION
    ```
11. Call `learning_manager.replace_node_content(...)` (new method — see 1.2) with `node_id`, `content_markdown`, `status=new_status`, `quiz_set=new_quiz_set`.
12. Log success + return updated node dict (mirror lines 175–185).

**Imports:** Reuse existing imports (lines 24–38) — no new symbols needed.

**Why a separate function (not extension of `regenerate_failed_node`):**
- Keeps the failed-node retry logic intact (Non-Goal #1).
- Manual regen has different validation rules (no `retry_available` check, no `failed_step` branching).
- Easier to test in isolation.

---

### 1.2 `server/database/learning_persistence.py` — Add `replace_node_content()`

**Location:** Insert after `update_node_content` (line 1624) — before `delete_revision_session`.

**Signature:**

```python
def replace_node_content(
    self,
    node_id: str,
    content_markdown: str,
    status: NodeStatus,
    quiz_set: Optional[QuizSet] = None,
) -> Optional[Dict[str, Any]]:
```

**Why a new method (not a flag on `update_node_content`):**
- Manual regen is semantically different: it's an intentional overwrite, not a state-machine transition.
- Keeps `update_node_content`'s validation contract intact for all other callers (`regenerate_failed_node`, course graph nodes).
- Single-purpose function = single test surface.

**Implementation outline (mirrors `update_node_content` lines 1641–1780 but skips validation):**

1. Open connection, get cursor (lines 1641–1644 reference).
2. Check node exists:
   ```sql
   SELECT id FROM concept_nodes WHERE id = ?
   ```
   Return `None` if missing (same semantics as `update_node_content`).
3. UPDATE content + status:
   ```sql
   UPDATE concept_nodes
   SET content_markdown = ?, status = ?, error_message = NULL,
       retry_available = 0, failed_step = NULL, updated_at = ?
   WHERE id = ?
   ```
   Note: also clears `error_message`, `retry_available`, `failed_step` so a manually regenerated node shows clean state.
4. **Quiz handling** — mirror lines 1686–1780 from `update_node_content`:
   - If `quiz_set is not None`: upsert into `quiz_data` with `format_version=1`, new `shuffle_seed` from quiz_set, `current_index` from quiz_set.
   - If `quiz_set is None`: delete existing `quiz_data` rows for the node.
5. Commit, return updated node dict via `_get_node_by_id` (line 1681 reference helper, around line 1900+).
6. Handle `sqlite3.Error` → log + re-raise (mirrors line 1656+ error pattern).

**No `_is_valid_transition` call.** No `current_status == status` check.

---

### 1.3 `server/routers/learning.py` — Branch on `?manual=true`

**Location:** `regenerate_node_endpoint` (lines 1003–1059).

**Change:** Add `manual: bool = Query(default=False, ...)` parameter and branch logic.

**New signature:**

```python
async def regenerate_node_endpoint(
    node_id: str,
    request: Request,
    step: Optional[str] = Query(default=None, ...),
    manual: bool = Query(
        default=False,
        description=(
            "If true, regenerate any non-LOCKED, non-ERROR node "
            "(manual refresh). If false, only ERROR nodes are eligible "
            "(failed-step retry)."
        ),
    ),
    llm_context: LLMContext = Depends(get_llm_context),
) -> ConceptNodeResponse:
```

**New imports (around line 45):**

```python
from server.graph.regen import regenerate_failed_node, regenerate_topic_node
```

**New branch (replace body of existing function):**

```python
try:
    if manual:
        # Manual regen: any non-LOCKED, non-ERROR node
        updated_node = await regenerate_topic_node(
            node_id=node_id,
            llm_context=llm_context,
        )
    else:
        # Existing error-retry path
        updated_node = await regenerate_failed_node(
            node_id=node_id,
            llm_context=llm_context,
            regen_step=step.upper() if step else None,
        )

    if updated_node is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Regeneration failed unexpectedly",
        )
    response_node = _apply_node_visibility(updated_node)
    return ConceptNodeResponse(**response_node)
except LookupError:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Concept node not found: {node_id}",
    )
except ValueError as e:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=str(e),
    )
except HTTPException:
    raise
except Exception as e:
    logger.error("Error regenerating node %s: %s", node_id, e)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Internal server error",
    )
```

**Update endpoint docstring (lines 1003–1008):**

```python
summary="Regenerate node",
description=(
    "Regenerate content for a concept node. "
    "Without manual=true: only ERROR nodes (failed-step retry). "
    "With manual=true: any non-LOCKED, non-ERROR node (full regen)."
),
```

**`step` param validation:** The current `VALID_STEPS` block (lines 1022–1028) only applies to the ERROR path. When `manual=true`, the `step` param is ignored. Keep the validation block where it is — it doesn't reject anything that matters for the manual path.

---

### 1.4 `client/src/lib/learningApi.ts` — Send `manual=true`

**Location:** `regenerateNode` (lines 218–228).

**Change:** Add `params` with `manual: 'true'` to the request config.

**New signature:**

```typescript
export const regenerateNode = async (
  nodeId: string,
  signal?: AbortSignal
): Promise<ConceptNode> => {
  const response = await api.post<ConceptNode>(
    `/learning/nodes/${nodeId}/regenerate?manual=true`,
    null,
    { signal }
  );
  return response.data;
};
```

**Rationale:** Sending `manual=true` unconditionally from this client function means both the existing ERROR retry button (in ConceptCard line 546) and the new manual refresh button (Phase 2) flow through the server's manual branch. Server-side branching (Phase 1.3) preserves the old ERROR partial-regen behavior when `status == ERROR`, so Non-Goal #1 is still respected.

**Why no signature change:** ConceptCard calls `regenerate(nodeId)` → `regenerateMutation.mutate(nodeId)` → `regenerateNode(nodeId)`. Keeping the function signature stable means `useLearningMutations.ts` needs no changes.

---

## Phase 2 — Client: Add Refresh Button to ConceptCard

### 2.1 `client/src/features/learning/ConceptCard.tsx`

**Three edits:**

#### 2.1.1 Add `RefreshCw` to lucide import

**Location:** Line 54.

**Before:**
```typescript
import { ChevronLeft } from "lucide-react";
```

**After:**
```typescript
import { ChevronLeft, RefreshCw } from "lucide-react";
```

#### 2.1.2 Add `isManualRegen` condition (for render gating)

**Location:** Inside `ConceptCard` function body, near other status checks (around line 175, after `statusIcons` definition).

**Add:**
```typescript
// Show refresh button for any non-LOCKED topic node
const showRefreshButton = node.status !== "LOCKED";
```

Per goal.md, the refresh button is visible for `VIEWING_EXPLANATION`, `IN_QUIZ`, `SHOWING_FEEDBACK`, `COMPLETED`. The `LOCKED` exclusion is exact; ERROR is intentionally excluded too (ERROR has its own "Retry Generation" button at line 545).

#### 2.1.3 Render RefreshCw button in card header

**Location:** Card header div (lines 241–269), inside the right-side area next to the `#sequence_index + 1` span.

**Insert (after the `<span>#{node.sequence_index + 1}</span>` closing tag at line 268):**

```tsx
{showRefreshButton && (
  <button
    type="button"
    onClick={() => onRegenerate?.(node.id)}
    disabled={isRegenerating}
    title="Regenerate the content"
    aria-label="Regenerate the content"
    className={cn(
      "p-1.5 rounded-md text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
      isRegenerating && "animate-spin"
    )}
  >
    <RefreshCw className="w-4 h-4" />
  </button>
)}
```

**Notes:**
- `title` attribute provides the tooltip natively (per spec — "using a simple title attribute or tooltip").
- `aria-label` mirrors the tooltip for screen readers.
- `animate-spin` Tailwind class gives the spinner animation when `isRegenerating` is true (Phase 2 spec).
- `disabled={isRegenerating}` prevents double-clicks during in-flight requests.
- `onClick` calls existing `onRegenerate?.(node.id)` — wired through `LearningPathContainer.tsx:850` → `regenerate` from `useLearningMutations` → `regenerateMutation` → `regenerateNode` (with new `?manual=true`) → server endpoint.

---

### 2.2 No Changes Required

**`client/src/features/learning/LearningPathContainer.tsx`** — Already passes `onRegenerate={regenerate}` and `isRegenerating={isRegenerating}` to `<ConceptCard>` at lines 850–851. No edits.

**`client/src/features/learning/useLearningMutations.ts`** — `regenerateMutation` (line 397) and `regenerate` convenience function (line 483) already call `regenerateNode(nodeId)`. The new `?manual=true` query param is encapsulated inside `learningApi.ts`, so the hook stays unchanged.

---

## Phase 3 — Verification

### 3.1 Client Build + Lint

```powershell
cd client
npm run lint
npm run build
```

Expected: zero TypeScript errors, zero ESLint errors.

**Specific checks:**
- `ConceptCard.tsx` compiles with new `RefreshCw` import + new button JSX.
- `learningApi.ts` URL change is a string literal — should be transparent to the type checker.

### 3.2 Server Tests

```powershell
cd server
python -m unittest server.tests.test_regen
python -m unittest server.tests.test_learning_graph_router
python -m unittest server.tests.test_learning_persistence
python -m unittest
```

**Critical regression tests:**
- `test_regenerate_calls_regen_function` (line 128 in `test_learning_graph_router.py`) — still passes because endpoint signature is backward-compatible (default `manual=false`).
- `test_regenerate_endpoint_passes_step_query` (line 155) — still passes (manual=false path unchanged).
- `test_regenerate_endpoint_invalid_step_returns_400` (line 187) — still passes.
- All `RegenFunctionTests` in `test_regen.py` — still pass because `regenerate_failed_node` body is untouched.

### 3.3 New Test Coverage (Recommended, Not Strictly Required)

If extending the test suite (optional, recommended):

**Add to `test_regen.py`:**
- `RegenerateTopicNodeTests` class with cases:
  - Rejects LOCKED nodes (`ValueError`).
  - Rejects ERROR nodes (`ValueError`).
  - Succeeds for VIEWING_EXPLANATION → VIEWING_EXPLANATION (or LOCKED if first/prev not complete).
  - Succeeds for IN_QUIZ → VIEWING_EXPLANATION (state-machine bypass).
  - Succeeds for COMPLETED → VIEWING_EXPLANATION.
  - Succeeds for SHOWING_FEEDBACK → VIEWING_EXPLANATION.
  - Calls both generator and quizzer agents (unconditional).

**Add to `test_learning_graph_router.py`:**
- `test_regenerate_endpoint_manual_true_calls_topic_node` — verify manual branch.
- `test_regenerate_endpoint_manual_true_locked_returns_400`.
- `test_regenerate_endpoint_manual_true_error_returns_400`.

These additions are optional — the goal.md did not explicitly request test coverage, but the `.planning/codebase/TESTING.md` TDD workflow recommends it.

### 3.4 Manual Smoke Test (Post-Build)

1. Start backend: `cd server && python -m uvicorn server.main:app --reload --port 8000`
2. Start frontend: `cd client && npm run dev`
3. Generate a new course, wait for first node to reach VIEWING_EXPLANATION.
4. Hover over the new RefreshCw button — confirm tooltip "Regenerate the content".
5. Click it — confirm spinner animation, then node content + quiz are replaced.
6. Navigate to a node in IN_QUIZ — click RefreshCw — confirm it resets to VIEWING_EXPLANATION with new content.
7. Navigate to a COMPLETED node — click RefreshCw — confirm it resets to VIEWING_EXPLANATION with new content.
8. Verify a LOCKED node shows no RefreshCw button (only on the previous carousel slide position).

---

## Risk + Edge Cases

| Risk                                                        | Mitigation                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| State-machine bypass allows unintended overwrites          | `replace_node_content` is a separate method — only callable from regen flow                 |
| `IN_QUIZ`/`COMPLETED` regen clears in-flight quiz attempts  | Acceptable — user explicitly clicked refresh; old attempts stay in `quiz_attempts` history |
| Quiz `shuffle_seed` regenerated → user gets different order | Expected — new content = new quiz = new seed; consistent with full re-gen                   |
| Long regeneration (>30s default axios timeout)              | Client already passes `signal?: AbortSignal`; server timeout is not an issue here          |
| User spams RefreshCw on multiple nodes simultaneously       | `disabled={isRegenerating}` per button only protects per-node; global protection via existing `isAnyLoading` UI overlay (line 872) |

---

## Files Changed Summary

| File                                                    | Lines Changed (approx) | Nature                  |
| ------------------------------------------------------- | ---------------------- | ----------------------- |
| `server/graph/regen.py`                                 | +60 new function       | New `regenerate_topic_node()` |
| `server/database/learning_persistence.py`               | +80 new method         | New `replace_node_content()` |
| `server/routers/learning.py`                            | ~15 (imports + signature + branch) | Endpoint branch on `?manual=true` |
| `client/src/features/learning/ConceptCard.tsx`          | ~25 (import + render)   | New RefreshCw button    |
| `client/src/lib/learningApi.ts`                         | 1 line                 | URL now includes `?manual=true` |

Total: ~180 lines of new code. No deletions. No renames.

---

## Non-Goals Reminder

Per `docs/goal.md`:

1. ❌ Do NOT change the ERROR-state regenerate flow — preserved: `manual=false` path keeps calling `regenerate_failed_node` with original `failed_step` logic. ERROR + `manual=true` → server returns 400 (Phase 1.3 branch).
2. ❌ Do NOT change quiz attempt history, revision data — preserved: `quiz_attempts` table untouched; only `concept_nodes` and `quiz_data` rows updated.
3. ❌ Do NOT add confirmation dialog — refresh is a direct action on click (single `onClick` handler in Phase 2.1.3).