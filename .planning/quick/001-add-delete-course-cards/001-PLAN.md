---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/features/learning/CourseCard.tsx
  - client/src/features/learning/LearningHome.tsx
  - client/src/lib/learningApi.ts
  - server/routers/learning.py
  - server/database/learning_persistence.py
autonomous: true
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
---

<objective>
Add delete functionality to course cards in the "Your Courses" section, allowing users to remove learning sessions with confirmation.

Purpose: Give users control over their course list by enabling deletion of unwanted or completed courses.
Output: Updated CourseCard with delete option, backend DELETE endpoint, and proper cascade deletion.
</objective>

<execution_context>
@C:/Users/Peter/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Peter/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/STACK.md

# Current implementation patterns

## CourseCard.tsx (client/src/features/learning/CourseCard.tsx)
- Props: session, onResume, onRevise, onViewRevision
- Uses glassmorphism styling with motion wrapper
- No delete functionality currently

## LearningHome.tsx (client/src/features/learning/LearningHome.tsx)
- Uses React Query for course list fetching
- Renders CourseCard components with callbacks
- Has queryClient for cache invalidation

## learningApi.ts (client/src/lib/learningApi.ts)
- Has getSessionsList but no deleteSession
- Uses axios with interceptors
- Pattern: export const functionName = async (...) => { ... }

## learning.py (server/routers/learning.py)
- Has GET /learning/sessions endpoint
- No DELETE endpoint for sessions
- Uses learning_manager for persistence operations

## learning_persistence.py (server/database/learning_persistence.py)
- Has delete_revision_session method (reference pattern)
- No delete_learning_session method
- Uses CASCADE deletes for related data
</context>

<tasks>

<task type="auto">
  <name>Backend: Add delete_learning_session method and DELETE endpoint</name>
  <files>
    server/database/learning_persistence.py
    server/routers/learning.py
  </files>
  <action>
    Add delete_learning_session method to LearningManager class in learning_persistence.py following the pattern of delete_revision_session. The method should:
    1. Delete related quiz_attempts for all concept nodes in the session
    2. Delete related concept_nodes
    3. Delete related revision_sessions (and their quiz_attempts)
    4. Delete the learning_sessions record
    5. Return True if deleted, False if not found

    Add DELETE /learning/sessions/{session_id} endpoint to learning.py router:
    1. Extract session_id path parameter
    2. Call learning_manager.delete_learning_session(session_id)
    3. Return 204 No Content on success
    4. Return 404 if session not found
    5. Handle exceptions with proper logging and 500 status

    Follow existing code style: 80-char line limit, 4-space indent, type hints.
  </action>
  <verify>
    Run server tests: python -m unittest discover server/tests -v
    Verify endpoint exists: curl -X DELETE http://localhost:8000/learning/sessions/test-id (should return 404, not 405)
  </verify>
  <done>
    DELETE /learning/sessions/{session_id} endpoint exists and returns appropriate status codes
  </done>
</task>

<task type="auto">
  <name>Frontend: Add deleteSession API and update CourseCard with delete UI</name>
  <files>
    client/src/lib/learningApi.ts
    client/src/features/learning/CourseCard.tsx
  </files>
  <action>
    Add deleteSession function to learningApi.ts:
    - export const deleteSession = async (sessionId: string): Promise<void>
    - Makes DELETE request to /learning/sessions/${sessionId}
    - Follows existing pattern with proper error handling

    Update CourseCard component:
    1. Add onDelete prop: (sessionId: string) => void | Promise<void>
    2. Add delete button with trash icon (use lucide-react Trash2 icon)
    3. Position delete button in top-right corner with opacity-0 group-hover:opacity-100 for subtle reveal
    4. Add confirmation dialog using native confirm() or inline confirmation state
    5. Call onDelete(session.id) after confirmation
    6. Prevent card click when clicking delete button (stopPropagation)
    7. Add data-testid="delete-course-button" for testing

    Styling requirements:
    - Use Cyber Yellow (#FFD400) for delete icon hover state
    - Follow glassmorphism pattern with backdrop-blur
    - Ensure accessibility with aria-label="Delete course"
  </action>
  <verify>
    Run client build: cd client && npm run build
    Run client tests: npm run test -- CourseCard
    Verify no TypeScript errors
  </verify>
  <done>
    deleteSession API function exists, CourseCard has delete button with confirmation
  </done>
</task>

<task type="auto">
  <name>Integration: Wire up delete handling in LearningHome with cache invalidation</name>
  <files>
    client/src/features/learning/LearningHome.tsx
  </files>
  <action>
    Add delete handling to LearningHome component:
    1. Import deleteSession from learningApi.ts
    2. Create handleDelete callback using useCallback:
       - Takes sessionId: string
       - Shows confirmation: "Are you sure you want to delete this course? This action cannot be undone."
       - If confirmed, calls deleteSession(sessionId)
       - On success, invalidate React Query cache for ['courses', ...] queries
       - On error, log to console and show alert (or keep in console for now)
    3. Pass handleDelete as onDelete prop to CourseCard components
    4. Wrap in try-catch to handle errors gracefully

    Cache invalidation pattern:
    - Use queryClient.invalidateQueries({ queryKey: ['courses'] })
    - This will trigger refetch of the course list
  </action>
  <verify>
    Run client tests: npm run test -- LearningHome
    Build passes: npm run build
    No TypeScript errors
  </verify>
  <done>
    LearningHome passes onDelete to CourseCard, handles delete with cache invalidation
  </done>
</task>

</tasks>

<verification>
- [ ] DELETE /learning/sessions/{session_id} endpoint returns 204 for valid deletion
- [ ] DELETE /learning/sessions/{session_id} returns 404 for non-existent session
- [ ] deleteSession API function makes correct DELETE request
- [ ] CourseCard shows delete button on hover
- [ ] Clicking delete shows confirmation dialog
- [ ] Confirming delete removes course from UI
- [ ] React Query cache is invalidated after delete
- [ ] All tests pass
- [ ] Build succeeds without errors
</verification>

<success_criteria>
1. User can see delete button when hovering over course card
2. Clicking delete shows confirmation dialog
3. Confirming delete removes course from "Your Courses" immediately
4. Backend properly deletes session and all related data
5. No console errors during delete operation
6. All existing tests continue to pass
</success_criteria>

<output>
After completion, create `.planning/quick/001-add-delete-course-cards/001-SUMMARY.md`
</output>
