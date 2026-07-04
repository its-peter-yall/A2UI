# Goal: Manual Topic Node Content Regeneration

## Objective

Add ability to manually regenerate topic node contents (explanation + quizzes) on-demand via a refresh button on each topic card.

## Current State

- Server has `POST /learning/nodes/{id}/regenerate` endpoint
- Only works for ERROR-status nodes via `regenerate_failed_node()`
- Client has `regenerateNode` API call + `regenerateMutation` in `useLearningMutations`
- ConceptCard already wires `onRegenerate` for ERROR-state retry button

## What Needs to Change

### Server (`server/graph/regen.py`)
- `regenerate_failed_node()` blocks non-ERROR nodes with ValueError
- Need new function (or extended) to regenerate any topic node regardless of status
- Should re-run generator agent (content) + quizzer agent (quiz set)
- Should reset node status to appropriate unlocked state
- Endpoint should accept a flag/param for manual regen vs error retry

### Server (`server/routers/learning.py`)
- Extend `POST /nodes/{id}/regenerate` endpoint to accept `?manual=true`
- When manual=true, allow regeneration of any non-LOCKED node
- Return updated ConceptNodeResponse

### Client (`client/src/features/learning/ConceptCard.tsx`)
- Add RefreshCw icon button in card header
- Tooltip: "Regenerate the content"
- Only visible for non-LOCKED topic nodes (VIEWING_EXPLANATION, IN_QUIZ, SHOWING_FEEDBACK, COMPLETED)
- Wire to existing `onRegenerate` prop

### Client (`client/src/features/learning/LearningPathContainer.tsx`)
- No changes needed — already passes `onRegenerate` and `isRegenerating` to ConceptCard

### Client (`client/src/features/learning/useLearningMutations.ts`)
- No changes needed — `regenerateMutation` already calls `regenerateNode` API

## Non-Goals
- Do NOT change the ERROR-state regenerate flow (existing "Retry Generation" button stays)
- Do NOT change quiz attempt history, revision data
- Do NOT add confirmation dialog (direct action on click)
