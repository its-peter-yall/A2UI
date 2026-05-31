---
phase: quick
plan: 001
subsystem: learning
must_haves:
  truths:
    - User can delete a course card from Your Courses section
    - Delete action shows confirmation before proceeding
    - Deleted course is removed from UI immediately after success
    - Backend properly deletes session and all related data (cascade)
  artifacts:
    - path: "client/src/features/learning/CourseCard.tsx"
      provides: "Delete button with confirmation dialog"
      contains: "onDelete prop, delete confirmation UI"
    - path: "client/src/lib/learningApi.ts"
      provides: "deleteSession API function"
      contains: "DELETE /learning/sessions/{session_id}"
    - path: "server/routers/learning.py"
      provides: "DELETE endpoint for learning sessions"
      contains: "delete_learning_session handler"
    - path: "server/database/learning_persistence.py"
      provides: "delete_learning_session method"
      contains: "DELETE FROM learning_sessions with cascade"
  key_links:
    - from: "CourseCard.tsx"
      to: "learningApi.ts"
      via: "onDelete callback"
      pattern: "deleteSession call"
    - from: "learningApi.ts"
      to: "server/routers/learning.py"
      via: "axios DELETE request"
      pattern: "DELETE /learning/sessions/{session_id}"
    - from: "server/routers/learning.py"
      to: "learning_persistence.py"
      via: "learning_manager.delete_learning_session"
      pattern: "method call"
tags: [feature, learning, ui, backend]
dependency_graph:
  requires: []
  provides: [course-deletion]
  affects: [client/src/features/learning/CourseCard.tsx, client/src/features/learning/LearningHome.tsx, client/src/lib/learningApi.ts, server/routers/learning.py, server/database/learning_persistence.py]
tech-stack:
  added: []
  patterns:
    - React Query cache invalidation for real-time UI updates
    - Cascade deletion pattern for related database records
    - Hover-reveal UI pattern for secondary actions
    - Inline confirmation dialog for destructive actions
key-files:
  created: []
  modified:
    - client/src/features/learning/CourseCard.tsx
    - client/src/features/learning/LearningHome.tsx
    - client/src/lib/learningApi.ts
    - server/routers/learning.py
    - server/database/learning_persistence.py
decisions: []
metrics:
  duration: "45 minutes"
  completed_date: "2026-02-16"
  tasks_completed: 3
  test_count: 287
  test_status: "all passing"
  server_tests: 245
  server_test_status: "all passing"
---

# Quick Task 001: Add Delete Course Cards - Summary

Add delete functionality to course cards in the "Your Courses" section, allowing users to remove learning sessions with confirmation.

## What Was Built

A complete delete course feature with:
- **Backend**: DELETE endpoint with cascade deletion of all related data
- **Frontend**: Delete button with hover reveal and inline confirmation dialog
- **Integration**: React Query cache invalidation for immediate UI updates

## Implementation Details

### Backend Changes

**server/database/learning_persistence.py**
- Added `delete_learning_session(session_id: str) -> bool` method
- Cascade deletes:
  - Quiz attempts for all concept nodes
  - Concept nodes belonging to the session
  - Quiz attempts for all revision sessions
  - Revision sessions for the session
  - The learning session itself

**server/routers/learning.py**
- Added `DELETE /learning/sessions/{session_id}` endpoint
- Returns 200 with `{deleted: true}` on success
- Returns 404 if session not found
- Returns 500 on unexpected errors

### Frontend Changes

**client/src/lib/learningApi.ts**
- Added `deleteSession(sessionId: string): Promise<void>` function
- Uses axios DELETE request to backend endpoint

**client/src/features/learning/CourseCard.tsx**
- Added `onDelete` prop to component interface
- Added delete button with Trash2 icon from lucide-react
- Hover reveal pattern: `opacity-0 group-hover:opacity-100`
- Cyber Yellow (#FFD400) hover state for delete icon
- Inline confirmation dialog with:
  - Warning icon and "Delete Course?" heading
  - Course title display
  - Cancel and Delete buttons
  - Backdrop blur overlay
- `data-testid="delete-course-button"` for testing

**client/src/features/learning/LearningHome.tsx**
- Imported `deleteSession` from learningApi
- Added `handleDelete` callback with:
  - `window.confirm()` for user confirmation
  - API call to deleteSession
  - React Query cache invalidation with `queryClient.invalidateQueries({ queryKey: ['courses'] })`
  - Error handling with alert on failure
- Passed `onDelete={handleDelete}` to CourseCard components

## Verification

### Server Tests
```
Ran 245 tests in 8.843s
OK (skipped=1)
```

### Client Tests
```
Test Files  23 passed (23)
Tests       287 passed (287)
```

### Build Status
- Client build: SUCCESS
- TypeScript compilation: No errors

## Commits

1. `033cc9b` - feat(quick-001): add delete_learning_session method and DELETE endpoint
2. `94c33ee` - feat(quick-001): add deleteSession API and CourseCard delete UI
3. `a48d84e` - feat(quick-001): wire up delete handling in LearningHome with cache invalidation

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] DELETE /learning/sessions/{session_id} endpoint exists
- [x] deleteSession API function exists
- [x] CourseCard has delete button with confirmation
- [x] LearningHome passes onDelete to CourseCard
- [x] React Query cache invalidation implemented
- [x] All server tests pass (245)
- [x] All client tests pass (287)
- [x] Build succeeds without errors
