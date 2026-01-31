# Plan 06-01 Summary: Sequential Flow State Machine and Mastery Mutations

## Status: COMPLETED

**Executed:** 2025-01-XX
**Phase:** 06-state-flow
**Dependencies Met:** 05-01, 05-02, 05-03

---

## Objective

Implement React Query mutations that enforce the sequential learning flow with mastery-based progression:
- `VIEWING_EXPLANATION` → `IN_QUIZ` → `SHOWING_FEEDBACK` → (retry if score < 100%) → `COMPLETED`

---

## Implementation Summary

### 1. useNodeState Hook (Task 1)
**File:** `client/src/features/learning/useNodeState.ts`

Created a hook that determines available actions based on node status:

| Status | Available Actions |
|--------|-------------------|
| `LOCKED` | None |
| `VIEWING_EXPLANATION` | canViewExplanation, canProceedToQuiz |
| `IN_QUIZ` | canSubmitQuiz |
| `SHOWING_FEEDBACK` | canRetryQuiz (if not mastered), canContinueToNext (if mastered) |
| `COMPLETED` | canViewExplanation (review mode) |
| `ERROR` | canRegenerate |

Also includes:
- `isValidTransition(from, to)` - Validates state transitions
- `getNextStatus(current, isMastered)` - Gets expected next status

### 2. optimisticUpdates Utilities (Task 3)
**File:** `client/src/features/learning/optimisticUpdates.ts`

TanStack Query v5 best practices for optimistic updates:

```typescript
// Pattern: onMutate → snapshot → update → return rollback
optimisticStatusUpdate(queryClient, sessionId, nodeId, newStatus) → RollbackFn
optimisticCompletionUpdate(queryClient, sessionId, increment) → RollbackFn
optimisticUnlockNext(queryClient, sessionId, currentNodeIndex) → RollbackFn
optimisticMasteryUpdate(queryClient, sessionId, nodeId, nodeIndex) → RollbackFn
```

Best practices applied:
- Cancel outgoing refetches before optimistic update
- Snapshot previous data for rollback
- Return rollback function from onMutate
- Invalidate queries in onSettled (both success and error)

### 3. useLearningMutations Hook (Task 2)
**File:** `client/src/features/learning/useLearningMutations.ts`

Main mutations hook with sequential flow enforcement:

```typescript
const {
  proceedToQuiz,      // VIEWING_EXPLANATION → IN_QUIZ
  submitAnswer,       // IN_QUIZ → SHOWING_FEEDBACK
  retry,              // SHOWING_FEEDBACK → IN_QUIZ (if not mastered)
  continueToNext,     // Scroll to next node (if mastered)
  regenerate,         // ERROR → VIEWING_EXPLANATION
  
  // Loading states
  isTransitioning,
  isSubmitting,
  isRetrying,
  isRegenerating,
  isAnyLoading,
} = useLearningMutations({
  sessionId: 'session-123',
  onQuizResult,
  onMasteryAchieved,
  onRetryNeeded,
  onError,
});
```

### 4. LearningPathContainer Updates (Task 4)
**File:** `client/src/features/learning/LearningPathContainer.tsx`

Wired mutations to container:
- Quiz results tracked in `quizResults` state for feedback display
- Mastery celebration animation with auto-clear
- Auto-scroll to next node after mastery (1.5s delay)
- Loading overlay for mutations in progress

### 5. Test Suites (Tasks 5-6)
- `useNodeState.test.ts` - 36 tests covering all status states and transitions
- `useLearningMutations.test.tsx` - 15 tests covering mutations, callbacks, and loading states

---

## Sequential Flow State Machine

```
┌─────────┐    unlock     ┌─────────────────────┐
│ LOCKED  │──────────────►│ VIEWING_EXPLANATION │
└─────────┘               └──────────┬──────────┘
                                     │ proceed
                                     ▼
                          ┌─────────────────────┐
                          │       IN_QUIZ       │
                          └──────────┬──────────┘
                                     │ submit
                                     ▼
                          ┌─────────────────────┐
          retry           │  SHOWING_FEEDBACK   │
     ◄────────────────────┤                     │
     │   (not mastered)   └──────────┬──────────┘
     │                               │ (mastered)
     │                               ▼
     │                    ┌─────────────────────┐
     │                    │     COMPLETED       │ (terminal)
     │                    └─────────────────────┘
     │
     └──────────► back to IN_QUIZ
```

---

## Mastery Requirement

- **100% score required** to unlock next topic
- Retry loop: SHOWING_FEEDBACK → IN_QUIZ → SHOWING_FEEDBACK until mastered
- Mastery triggers:
  1. Celebration animation (2s)
  2. Node marked as COMPLETED
  3. Next node unlocked (LOCKED → VIEWING_EXPLANATION)
  4. Auto-scroll to next node (1.5s delay)

---

## Optimistic Update Strategy

1. **onMutate**: Cancel queries, snapshot, update cache, return rollback
2. **onError**: Execute rollback function
3. **onSettled**: Invalidate queries to sync with server

This ensures:
- Instant UI feedback
- Clean rollback on errors
- Eventual consistency with server

---

## Files Modified/Created

| File | Action | Purpose |
|------|--------|---------|
| `useNodeState.ts` | Created | State-based action availability |
| `optimisticUpdates.ts` | Created | Cache update utilities |
| `useLearningMutations.ts` | Created | Mutation hooks with sequential flow |
| `LearningPathContainer.tsx` | Modified | Wire up mutations |
| `useNodeState.test.ts` | Created | 36 tests |
| `useLearningMutations.test.tsx` | Created | 15 tests |
| `index.ts` | Modified | Export new hooks/utilities |

---

## Verification Results

```
✓ src/features/learning/useNodeState.test.ts (36 tests)
✓ src/features/learning/useLearningMutations.test.tsx (15 tests)
✓ src/features/learning/QuizFeedback.test.tsx (5 tests)
✓ src/features/learning/ConceptCard.test.tsx (6 tests)
✓ src/features/learning/LearningPathContainer.test.tsx (2 tests)

Test Files: 5 passed
Tests: 64 passed
```

---

## Success Criteria Met

| Criterion | Status |
|-----------|--------|
| Sequential flow enforced: explanation → quiz → feedback | ✅ |
| Mastery (100%) required to unlock next topic | ✅ |
| Retry loop works: feedback → quiz → feedback until mastered | ✅ |
| Optimistic updates provide instant feedback | ✅ |
| Rollback works on mutation errors | ✅ |
| Loading states prevent double-submission | ✅ |
| Auto-scroll to next topic after mastery | ✅ |

---

## Best Practices Applied (Research-Based)

From TanStack Query v5 documentation and industry best practices:

1. **Three-step optimistic update pattern**: onMutate → onError → onSettled
2. **Cancel queries before optimistic update** to prevent race conditions
3. **Use `isPending` instead of `isLoading`** for mutation states (v5 convention)
4. **Separate convenience functions from raw mutations** for cleaner component code
5. **Discriminated unions for state types** to prevent impossible states
6. **Return context from onMutate** for typed rollback in onError
