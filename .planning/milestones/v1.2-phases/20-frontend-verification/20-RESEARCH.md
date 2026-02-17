# Phase 20: Frontend Verification & Polish - Research

**Researched:** 2026-02-17
**Domain:** React 19 frontend UI verification, multi-quiz UX, badge/label display
**Confidence:** HIGH

## Summary

Phase 20 is the final phase (20 of 20) of the v1.2 milestone. All backend work (Phases 16-19) is complete. The backend produces real multi-quiz data with QuizSets, difficulty gradients, and complexity fields. This phase is purely frontend: verifying existing multi-quiz UI code works with real data, implementing the onNextQuiz handler (currently a no-op), adding complexity badges to topic cards, and adding difficulty labels to quizzes.

The codebase investigation reveals that much of the UI scaffolding already exists but key wiring is missing. The "Quiz X of Y" progress indicator code is present in both ConceptCard and QuizFeedback, and QuizFeedback already has a "Next Quiz" button. However, the onNextQuiz handler passed from ConceptCard is an empty function, and LearningPathContainer does not wire any handler for quiz advancement. For complexity badges, the `complexity` field does NOT exist in the ConceptNode type, database, or API response -- it only exists in the planner's TopicNode output. For difficulty labels, the `difficulty` field IS already present in QuizCard/QuizCardHidden types but not rendered anywhere.

**Primary recommendation:** Implement onNextQuiz by reusing the existing retry-quiz endpoint (since the server auto-advances current_index on correct answers), add complexity to the data pipeline (DB column + schema + types), and add UI badges/labels using existing Tailwind utility classes.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | Component framework | Already in use |
| TypeScript | Strict mode | Type safety | Already enforced |
| Tailwind CSS | 4.x | Styling badges/labels | Already in use |
| @tanstack/react-query | v5 | Mutations and cache | Already in use |
| framer-motion | latest | Animations | Already in use |
| lucide-react | latest | Icons | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | latest | Unit testing | All new UI code |
| @testing-library/react | latest | Component testing | Rendering assertions |
| cn() from @/lib/utils | N/A | Conditional classnames | Badge/label styling |

### Alternatives Considered
No new libraries needed. All requirements achievable with existing stack.

**Installation:** No new packages required.

## Architecture Patterns

### Current Component Hierarchy
```
LearningPage
  └── LearningPathContainer (orchestrator)
        ├── ProgressBar
        ├── MasteryCelebration
        └── ConceptCard (per node via carousel)
              ├── MarkdownRenderer (VIEWING_EXPLANATION)
              ├── Quiz UI (IN_QUIZ) ← needs difficulty label
              └── QuizFeedback (SHOWING_FEEDBACK) ← needs difficulty label + onNextQuiz wiring
```

### Key Files and Their Roles

| File | Role | Phase 20 Changes |
|------|------|-----------------|
| `client/src/features/learning/ConceptCard.tsx` | Renders topic card with all states | Add complexity badge in header, add difficulty label in IN_QUIZ, wire real onNextQuiz |
| `client/src/features/learning/QuizFeedback.tsx` | Shows quiz results after submission | Add difficulty label, verify onNextQuiz button works |
| `client/src/features/learning/LearningPathContainer.tsx` | Orchestrates all learning UX | Wire onNextQuiz handler to ConceptCard |
| `client/src/features/learning/useLearningMutations.ts` | React Query mutations | Add advanceToNextQuiz mutation |
| `client/src/types/learning.ts` | TypeScript type definitions | Add complexity to ConceptNode type |
| `client/src/lib/learningApi.ts` | API client functions | No changes needed (retry-quiz already exists) |
| `server/schemas/learning.py` | Pydantic response schemas | Add complexity to ConceptNodeResponse |
| `server/database/learning_persistence.py` | SQLite persistence | Add complexity column, flow through create_concept_node |
| `server/routers/learning.py` | REST endpoints | Flow complexity through node responses |
| `server/services/course_orchestrator.py` | Course generation orchestration | Pass complexity from TopicNode to create_concept_node |

### Pattern 1: onNextQuiz as Retry Reuse
**What:** The server already auto-advances `current_index` in quiz_data when a correct (non-mastery) answer is submitted. The onNextQuiz handler on the frontend should call the existing `retry-quiz` endpoint to transition SHOWING_FEEDBACK -> IN_QUIZ, then invalidate the session query. The refetched node data will have quiz_set_hidden with the new current_index pointing to the next quiz.

**When to use:** User answers correctly on a non-last quiz in a multi-quiz set.

**Flow:**
```
User answers correctly (not last quiz)
  → Server: create_quiz_attempt → is_correct=true, is_mastered=false
  → Server: auto-advances current_index (e.g., 0 → 1)
  → Server: transitions node to SHOWING_FEEDBACK
  → Client: Shows QuizFeedback with "Next Quiz →" button
  → User clicks "Next Quiz →"
  → Client: Calls retry-quiz endpoint (POST /learning/nodes/{id}/retry-quiz)
  → Server: transitions SHOWING_FEEDBACK → IN_QUIZ
  → Client: Invalidates session query
  → Client: Refetched node has quiz_set_hidden.current_index = 1 (next quiz)
  → Client: Renders next quiz question
```

**Key code - Server submit_quiz (already implemented):**
```python
# server/routers/learning.py lines 851-862
if result.get("is_correct") and not result.get("is_mastered"):
    quiz_set_data = learning_manager.get_quiz_set_for_node(node_id)
    if quiz_set_data is not None:
        total_quizzes = len(quiz_set_data["quiz_set"].quizzes)
        next_index = request.quiz_index + 1
        if next_index < total_quizzes:
            learning_manager.update_quiz_set_progress(
                node_id=node_id,
                current_index=next_index,
            )
```

**Key code - ConceptCard onNextQuiz (currently NO-OP):**
```tsx
// ConceptCard.tsx lines 342-344 — NEEDS IMPLEMENTATION
onNextQuiz={() => {
  // Next quiz handling is managed by parent via quiz_index
  // The quiz set current_index is updated on the server
}}
```

### Pattern 2: Complexity Badge Display
**What:** Add a small badge in the ConceptCard header showing "Basic", "Intermediate", or "Advanced".

**Styling approach:** Use Tailwind utility classes with color variants:
```tsx
const complexityStyles = {
  Basic: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Intermediate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Advanced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};
```

### Pattern 3: Difficulty Label Display
**What:** Show "Easy", "Medium", or "Hard" label alongside quiz questions in both IN_QUIZ and SHOWING_FEEDBACK states.

**Data availability:** The `difficulty` field already exists in both `QuizCardHidden` (IN_QUIZ state) and `QuizCard` (SHOWING_FEEDBACK state). No data pipeline changes needed.

```tsx
const difficultyStyles = {
  easy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  hard: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
```

### Anti-Patterns to Avoid
- **Creating a new API endpoint for quiz advancement:** The server already advances current_index on correct answers. Reuse retry-quiz to transition back to IN_QUIZ.
- **Storing complexity in quiz_data:** Complexity is a topic-level attribute, not quiz-level. Store in concept_nodes table.
- **Putting onNextQuiz logic inside ConceptCard:** The handler should be wired from LearningPathContainer through ConceptCard props, consistent with all other mutation handlers.
- **Duplicating retry logic for onNextQuiz:** Create a dedicated mutation (or clearly named wrapper) rather than overloading the retry mutation, to maintain semantic clarity despite both calling the same endpoint.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conditional classnames | Manual string concatenation | `cn()` from `@/lib/utils` | Already standard in project |
| API calls | Raw fetch/axios | `learningApi.ts` functions | Already exists, typed |
| Cache invalidation | Manual state management | `useQueryClient.invalidateQueries` | React Query standard |
| Difficulty label formatting | Custom transform | Simple capitalize + map | Values come as lowercase enum |

**Key insight:** All infrastructure is already in place. This phase is about wiring, verification, and small UI additions -- not building new systems.

## Common Pitfalls

### Pitfall 1: State Machine Desync Between Node Status and Quiz Index
**What goes wrong:** After onNextQuiz, the node transitions back to IN_QUIZ but the quiz_set_hidden.current_index in the client cache may be stale, showing the old quiz instead of the next one.
**Why it happens:** The server advances current_index during submit-quiz, but the client cache still has the old current_index until invalidated.
**How to avoid:** Always invalidate the learningSession query after the retry-quiz call completes. Use `onSettled` in the mutation to ensure invalidation happens even on error.
**Warning signs:** User sees the same quiz question after clicking "Next Quiz".

### Pitfall 2: Quiz Result for Wrong Quiz Index
**What goes wrong:** QuizFeedback shows feedback for quiz N but the node is already pointing to quiz N+1.
**Why it happens:** The server auto-advances current_index on correct answer, but QuizFeedback receives currentQuizIndex from the node's quiz_set_hidden.current_index, which may already be N+1.
**How to avoid:** Pass `quiz_index` from the QuizSubmitResponse (not from the node's current state) as the feedback's currentQuizIndex. ConceptCard already does this at line 332-335:
```tsx
currentQuizIndex={
  node.quiz_set_hidden?.current_index ||
  feedbackResult.quiz_index ||
  0
}
```
This is a RISK: `node.quiz_set_hidden?.current_index` may already point to the next quiz after the server advances. Use `feedbackResult.quiz_index` as primary source.

### Pitfall 3: Complexity Column Migration Breaks Existing Data
**What goes wrong:** Adding a NOT NULL complexity column without a default breaks existing rows.
**Why it happens:** Existing concept_nodes rows don't have complexity data.
**How to avoid:** Use `ALTER TABLE concept_nodes ADD COLUMN complexity TEXT DEFAULT 'Intermediate'`. The default 'Intermediate' matches the TopicNode schema default.
**Warning signs:** SQLite constraint violations on existing queries.

### Pitfall 4: onNextQuiz Button Visibility After Wrong Answer
**What goes wrong:** "Next Quiz" button appears even when the user answered incorrectly.
**Why it happens:** Incorrect conditional logic in QuizFeedback.
**How to avoid:** QuizFeedback.tsx already handles this correctly at lines 275-276: `{isQuizSet && is_correct && hasMoreQuizzes && onNextQuiz && (...)}`. Verify this works with real data.

### Pitfall 5: Mastery Definition for Multi-Quiz
**What goes wrong:** is_mastered becomes true after first correct answer instead of after ALL quizzes are passed.
**Why it happens:** Mastery evaluation logic may not account for multi-quiz requirements.
**How to avoid:** Server-side create_quiz_attempt already handles this -- mastery requires ALL quizzes in the set to have a correct attempt (checked via `SELECT DISTINCT quiz_index` at persistence line 2368). Verify this behavior with tests.

## Code Examples

### Example 1: Advance to Next Quiz Mutation
```typescript
// In useLearningMutations.ts — new mutation
const advanceToNextQuizMutation = useMutation({
  mutationFn: (nodeId: string) => retryQuiz(nodeId),  // Reuses retry endpoint

  onMutate: async (nodeId): Promise<MutationContext> => {
    await queryClient.cancelQueries({ queryKey });
    const rollback = optimisticStatusUpdate(
      queryClient,
      sessionId,
      nodeId,
      'IN_QUIZ'
    );
    return { rollback };
  },

  onError: (error, _nodeId, context) => {
    context?.rollback();
    onError?.(error as Error, 'advanceToNextQuiz');
  },

  onSettled: () => {
    invalidateSession();
  },
});

// Convenience function
const advanceToNextQuiz = (nodeId: string) => {
  advanceToNextQuizMutation.mutate(nodeId);
};
```

### Example 2: Complexity Badge in ConceptCard Header
```tsx
// In ConceptCard.tsx — inside card header
<div className="flex items-center gap-3 p-4 border-b bg-card/50">
  <span className="text-xl">{statusIcons[node.status]}</span>
  <div className="flex-1">
    <div className="flex items-center gap-2">
      <h3 className="font-semibold">{node.title}</h3>
      {node.complexity && (
        <span className={cn(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          complexityStyles[node.complexity]
        )}>
          {node.complexity}
        </span>
      )}
    </div>
    <span className="text-xs text-muted-foreground uppercase tracking-wide">
      {node.status.replace(/_/g, ' ')}
    </span>
  </div>
  <span className="text-sm text-muted-foreground">
    #{node.sequence_index + 1}
  </span>
</div>
```

### Example 3: Difficulty Label in Quiz Display
```tsx
// In ConceptCard.tsx IN_QUIZ state — below "Quiz X of Y"
{isQuizSetHidden && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
    <span>Quiz {currentQuizIndex + 1} of {(visibleQuiz as { total_quizzes: number }).total_quizzes}</span>
    {currentQuiz.difficulty && (
      <span className={cn(
        'text-xs font-medium px-2 py-0.5 rounded-full',
        difficultyStyles[currentQuiz.difficulty as QuizDifficulty]
      )}>
        {currentQuiz.difficulty.charAt(0).toUpperCase() + currentQuiz.difficulty.slice(1)}
      </span>
    )}
  </div>
)}
```

### Example 4: QuizFeedback currentQuizIndex Fix
```tsx
// In ConceptCard.tsx — SHOWING_FEEDBACK state
// IMPORTANT: Use feedbackResult.quiz_index as primary source to avoid
// desync with server-advanced current_index
currentQuizIndex={
  feedbackResult.quiz_index ??
  node.quiz_set_hidden?.current_index ??
  0
}
```

## Data Pipeline Changes Required

### Complexity Field Pipeline
```
TopicNode.complexity (planner output, already exists)
  ↓
CourseOrchestrator._generate_node() — pass complexity to create_concept_node
  ↓
LearningManager.create_concept_node() — accept complexity parameter, store in DB
  ↓
concept_nodes table — new complexity column (TEXT DEFAULT 'Intermediate')
  ↓
LearningManager._get_node_by_id() — include complexity in SELECT
  ↓
learning router _build_node_response() — include complexity in response
  ↓
ConceptNodeResponse schema — add complexity field
  ↓
TypeScript ConceptNode type — add complexity field
  ↓
ConceptCard header — render complexity badge
```

### Files Requiring Changes for Complexity
| Layer | File | Change |
|-------|------|--------|
| DB Schema | `server/database/learning_persistence.py` | Add migration for complexity column, update create_concept_node, update SELECT queries |
| Server Schema | `server/schemas/learning.py` | Add `complexity` to `ConceptNodeResponse` |
| Orchestrator | `server/services/course_orchestrator.py` | Pass `complexity` from TopicNode to create_concept_node |
| TypeScript | `client/src/types/learning.ts` | Add `complexity` to `ConceptNode` interface |
| Component | `client/src/features/learning/ConceptCard.tsx` | Render complexity badge |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single quiz per node | QuizSet with 1-5 quizzes | v1.2 Phase 16-17 | Multi-quiz UI needed |
| No difficulty labels | difficulty field in QuizCard | v1.2 Phase 17 | Data available, UI not yet rendered |
| No complexity tracking | complexity in TopicNode | v1.2 Phase 16 | Not yet in ConceptNode/DB |
| Mastery = 1 correct answer | Mastery = ALL quizzes correct | v1.2 Phase 19 | Multi-quiz mastery logic |

**Deprecated/outdated:**
- Legacy single QuizCard format (format_version=0): Still supported via backward compat wrappers
- `quiz_hidden` field: Used for single quiz IN_QUIZ state; `quiz_set_hidden` now preferred for multi-quiz

## Open Questions

1. **currentQuizIndex Priority in Feedback**
   - What we know: ConceptCard passes `node.quiz_set_hidden?.current_index || feedbackResult.quiz_index || 0` to QuizFeedback
   - What's unclear: After server auto-advances current_index, `node.quiz_set_hidden?.current_index` may point to the NEXT quiz, causing wrong feedback display
   - Recommendation: Prioritize `feedbackResult.quiz_index` over `node.quiz_set_hidden?.current_index` to show feedback for the quiz that was just answered

2. **What Happens When Retry Is Called After Multi-Quiz Advancement**
   - What we know: `retry-quiz` endpoint transitions SHOWING_FEEDBACK → IN_QUIZ, but does NOT reset current_index
   - What's unclear: If user answers wrong on quiz 2, retries, and answers wrong again -- does current_index stay at 2?
   - Recommendation: Verify via manual testing that retry does not reset current_index (it should stay pointing to the quiz being retried)

## Sources

### Primary (HIGH confidence)
- Codebase investigation: All source files read directly from `d:/Peter/AURA Twin Proj/AgUI/`
- `server/routers/learning.py` lines 851-862: Server auto-advances quiz_set current_index
- `server/database/learning_persistence.py` line 2122: `update_quiz_set_progress` method
- `client/src/features/learning/ConceptCard.tsx` lines 272-276: Existing "Quiz X of Y" code
- `client/src/features/learning/ConceptCard.tsx` lines 342-344: No-op onNextQuiz handler
- `client/src/features/learning/QuizFeedback.tsx` lines 275-282: Existing "Next Quiz" button
- `server/schemas/learning.py` lines 351-366: TopicNode with complexity field
- `server/schemas/learning.py` lines 431-477: ConceptNodeResponse WITHOUT complexity

### Secondary (MEDIUM confidence)
- ConceptCard.test.tsx: Existing tests cover QuizSet progress indicator display
- QuizFeedback.test.tsx: Existing tests cover "Next Quiz" button visibility logic
- Prior decisions from phases 17-19 documented in roadmap

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, verified via package.json and imports
- Architecture: HIGH - Full codebase investigation completed, all key files read
- Pitfalls: HIGH - Based on direct code analysis of state machine, data flow, and existing bugs
- Complexity pipeline: HIGH - Verified absence of complexity field in DB/schema/types by direct inspection

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable -- all changes are within project codebase)
