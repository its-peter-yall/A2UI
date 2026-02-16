# Roadmap: Retrieval-Based Learning Feature

## Milestone: v1.0 - Core Learning Path System

### Phase 01: Database Schema & Models
**Status**: `completed`
**Directory**: `phases/01-database-schema/`
**Estimated Plans**: 2

Extend SQLite schema for learning-specific entities.

**Deliverables**:
- `learning_sessions` table (user learning course instances)
- `concept_nodes` table (cards with status: LOCKED/VIEWING_EXPLANATION/IN_QUIZ/SHOWING_FEEDBACK/COMPLETED)
- `quiz_data` table (JSONB payload for quiz structure)
- Pydantic schemas for all new entities
- Database migration/initialization logic

**Dependencies**: None (foundation phase)

**Verification**:
- [ ] Tables created successfully
- [ ] Foreign key constraints working
- [ ] Pydantic models validate correctly
- [ ] Unit tests pass

---

### Phase 02: AI Agent Infrastructure
**Status**: `completed`
**Directory**: `phases/02-agent-infrastructure/`
**Estimated Plans**: 3

Implement Planner, Generator, and Quizzer agents with Instructor library.

**Deliverables**:
- Instructor library integration with Vertex AI
- `PlannerAgent` - Generates `CourseOutline` with `TopicNode` objects
- `GeneratorAgent` - Creates markdown explanations with context injection
- `QuizzerAgent` - Generates `QuizCard` with strict JSON schema
- Pydantic models: `TopicNode`, `CourseOutline`, `QuizCard`, `QuizOption`
- Agent prompts with KLI framework embedded

**Dependencies**: Phase 01 (database schemas)

**Verification**:
- [ ] Instructor validates LLM output
- [ ] Planner returns structured outline
- [ ] Generator produces coherent explanations
- [ ] Quizzer returns valid quiz JSON
- [ ] Self-correction loop works on invalid output

---

### Phase 03: Async Orchestration Layer
**Status**: `completed`
**Directory**: `phases/03-orchestration/`
**Estimated Plans**: 2

Implement Scatter-Gather pattern for parallel agent execution.

**Deliverables**:
- Course generation orchestrator with asyncio.gather
- Context injection logic (prev/next topic summaries)
- Partial failure handling with "Skeleton Card" fallback
- Tenacity retry decorators for transient failures
- Performance logging and latency tracking

**Dependencies**: Phase 02 (agents)

**Verification**:
- [ ] Parallel execution reduces latency vs serial
- [ ] Partial failures don't crash entire course
- [ ] Context injection produces coherent narratives
- [ ] Retry logic handles API errors gracefully

---

### Phase 03a: Schema Fixes for Sequential Flow
**Status**: `completed`
**Directory**: `phases/03a-schema-fixes/`
**Estimated Plans**: 2

Address design gaps identified in `issues.md` before implementing API endpoints.

**Deliverables**:
- Updated `NodeStatus` enum with sequential flow states:
  - `LOCKED`, `VIEWING_EXPLANATION`, `IN_QUIZ`, `SHOWING_FEEDBACK`, `COMPLETED`, `ERROR`
- Updated state transition logic in `_is_valid_transition()`
- `quiz_attempts` table for tracking multiple attempts per node
- Pydantic models: `QuizAttemptCreate`, `QuizAttemptResponse`, `QuizAttemptHistory`
- LearningManager methods: `create_quiz_attempt()`, `get_quiz_attempts()`, `check_mastery()`

**Dependencies**: Phase 03 (orchestration layer must exist)

**Verification**:
- [ ] NodeStatus has 6 values with correct transitions
- [ ] quiz_attempts table created with foreign key to concept_nodes
- [ ] Mastery check returns True only after 100% score
- [ ] All existing tests still pass

**Issues Addressed**:
- Issue #1: Quiz retry with mastery requirement
- Issue #2: Quiz integrity (state-based content visibility)
- Issue #3: Sequential flow (Option A decision)

---

### Phase 04: API Endpoints
**Status**: `completed`
**Directory**: `phases/04-api-endpoints/`
**Estimated Plans**: 2

Create REST endpoints for learning path operations.

**Deliverables**:
- `POST /api/learning/generate` - Generate course from query
- `GET /api/learning/sessions/{id}` - Get learning session with nodes
- `GET /api/learning/nodes/{id}` - Get single node with quiz
- `POST /api/learning/nodes/{id}/submit` - Submit quiz answer
- `POST /api/learning/nodes/{id}/regenerate` - Retry failed card
- Server-side unlock logic (state machine)

**Dependencies**: Phase 03 (orchestration)

**Verification**:
- [ ] Course generation returns structured data
- [ ] Quiz submission validates answers server-side
- [ ] Correct answer unlocks next node
- [ ] Cannot bypass locked nodes via API
- [ ] All endpoints have Pydantic response models

---

### Phase 05: Frontend Components
**Status**: `completed`
**Directory**: `phases/05-frontend-components/`
**Estimated Plans**: 3

Build React components for learning path UI.

**Deliverables**:
- `LearningPathContainer` - Smart component with React Query
- `ConceptCard` - Visual states: locked/active/completed
- `QuizIntervention` - Interactive quiz modal/inline component
- `SkeletonLoader` - Placeholder during generation
- TypeScript interfaces for learning API responses

**Dependencies**: Phase 04 (API endpoints)

**Verification**:
- [ ] Components render all visual states
- [ ] React Query manages server state
- [ ] Quiz selection/submission works
- [ ] Skeleton loaders show during generation
- [ ] Components are responsive

---

### Phase 06: Sequential Flow State Machine & Navigation
**Status**: `completed`
**Directory**: `phases/06-state-flow/`
**Estimated Plans**: 2

Implement the sequential learning flow with mastery-based progression.

**Sequential Flow**:
```
VIEWING_EXPLANATION → (proceed) → IN_QUIZ → (submit) → SHOWING_FEEDBACK
                                                              ↓
                                    ← (retry if <100%) ←─────┘
                                                              ↓
                                    → (continue if 100%) → COMPLETED → unlock next
```

**Deliverables**:
- `useNodeState` hook: Determines available actions per node status
- `useLearningMutations` hook: State machine mutations with mastery callbacks
- `optimisticUpdates.ts`: Cache updates with rollback on error
- `ProgressBar` component: Visual mastery progress, click-to-scroll (non-locked only)
- Mastery gate: 100% score required to unlock next topic
- Retry loop: SHOWING_FEEDBACK → IN_QUIZ → SHOWING_FEEDBACK until 100%
- Auto-scroll to next node after mastery achievement
- Course completion celebration overlay
- `LearningPage` / `LearningHome` page components with routing

**Dependencies**: Phase 05 (components)

**Verification**:
- [ ] Explanation hidden during quiz (IN_QUIZ status enforces this)
- [ ] Retry button only appears when score < 100%
- [ ] Continue button only appears when score = 100%
- [ ] Cannot click locked nodes in progress bar
- [ ] Next topic unlocks only after current topic mastered
- [ ] Course completion celebrated when all nodes COMPLETED
- [ ] Routes /learn and /learn/:sessionId work correctly

---

### Phase 07: Animations & Gamification
**Status**: `completed`
**Directory**: `phases/07-animations/`
**Estimated Plans**: 2

Add Framer Motion animations and gamification elements.

**Deliverables**:
- Card lock/unlock animations (blur fade, lock shatter)
- Success feedback (green flash, confetti)
- Smooth scroll to next card
- Card collapse/expand transitions
- Loading state animations

**Dependencies**: Phase 06 (state flow)

**Verification**:
- [ ] Unlock animation feels rewarding
- [ ] Transitions are smooth (60fps)
- [ ] Animations don't block interaction
- [ ] Works on mobile

---

### Phase 08: Integration & Polish
**Status**: `pending`
**Directory**: `phases/08-integration/`
**Estimated Plans**: 2
**Plans Completed**: 1/2

End-to-end integration, testing, and polish.

**Deliverables**:
- Navigation between chat and learning modes
- Entry point UI (topic input or chat trigger)
- Error boundaries and fallbacks
- Loading/empty/error states polished
- Performance optimization (if needed)

**Dependencies**: Phase 07 (animations)

**Verification**:
- [ ] Full user flow works end-to-end
- [ ] No console errors or warnings
- [ ] Build passes without errors
- [ ] All tests pass

---

## Phase Summary

| Phase | Name | Plans | Status | Dependencies |
|-------|------|-------|--------|--------------|
| 01 | Database Schema & Models | 2 | completed | - |
| 02 | AI Agent Infrastructure | 3 | completed | 01 |
| 03 | Async Orchestration Layer | 2 | completed | 02 |
| 03a | Schema Fixes for Sequential Flow | 2 | completed | 03 |
| 04 | API Endpoints | 2 | completed | 03a |
| 05 | Frontend Components | 3 | completed | 04 |
| 06 | Sequential Flow State Machine & Navigation | 2 | completed | 05 |
| 07 | Animations & Gamification | 2 | completed | 06 |
| 08 | Integration & Polish | 2 | pending | 07 |

**Total Estimated Plans**: 20
**Execution Model**: Sequential phases, atomic plans within each phase

---

---
---

## Milestone: v1.1 - Course Persistence, Progress Dashboard & Revision System

> **Brief**: `.planning/BRIEF-v1.1.md`
>
> **Goal**: Transform AgUI from a single-session learning tool into a personal
> learning dashboard where users can track, pause, resume, and revisit courses.
>
> **Two Features**:
> 1. **Course Persistence & Progress Dashboard** — Save courses, show progress,
>    pause/resume across multiple concurrent courses
> 2. **Course Revision & Quiz Re-attendance** — Re-attend completed courses for
>    review, re-take quizzes to test knowledge retention

---

### Phase 09: Database Schema Extensions for Progress & Revision
**Status**: `completed`
**Directory**: `phases/09-database-progress-revision/`
**Estimated Plans**: 2
**Plans Completed**: 2/2

Extend the SQLite schema to support session-level progress tracking, course
status management, and a separate revision system that preserves original
completion data.

**Why This Phase Exists:**
The current `learning_sessions` table has no concept of "status" or "progress" —
it only stores the query and title. Nodes track individual status but there is no
aggregated view. We also need a completely separate `revision_sessions` table so
that when a user revisits a completed course, the original 100% completion is
never corrupted.

**Plan 09-01: Session Progress & Status Columns**

Add progress tracking metadata to existing tables:

*Changes to `learning_sessions`:*
- `status` (TEXT, default 'in_progress'): One of 'in_progress', 'completed'
  - 'in_progress' = any course where not all nodes are COMPLETED
  - 'completed' = all nodes reached COMPLETED status
  - Note: "paused" is not an explicit status — any 'in_progress' course
    the user isn't actively viewing is implicitly paused. This avoids
    complex state management for tracking browser tab focus.
- `progress_percent` (INTEGER, default 0): Cached value 0-100, calculated as
  `(COMPLETED nodes / total nodes) × 100`, updated whenever a node transitions
  to COMPLETED
- `completed_at` (TIMESTAMP, nullable): Set when all nodes reach COMPLETED
- `last_active_node_id` (TEXT, nullable): The concept_node.id the user was
  viewing when they last interacted. Used for "resume where you left off."

*Changes to `concept_nodes`:*
- `started_at` (TIMESTAMP, nullable): Set when node first transitions from
  LOCKED to VIEWING_EXPLANATION
- `completed_at` (TIMESTAMP, nullable): Set when node transitions to COMPLETED

*Database migration approach:*
- Use ALTER TABLE ADD COLUMN (SQLite supports this)
- Follow the existing pattern in `_ensure_quiz_data_columns()` and
  `_ensure_quiz_attempts_columns()` in `learning_persistence.py`
- Create `_ensure_session_progress_columns()` method
- Create `_ensure_node_timestamp_columns()` method
- Both called from `_ensure_tables()` on startup

*Tests:*
- Verify columns exist after migration
- Verify default values (status='in_progress', progress_percent=0)
- Verify NULL handling for optional timestamp columns
- Verify progress calculation: 0 of 5 nodes = 0%, 3 of 5 = 60%, 5 of 5 = 100%
- Verify completed_at is set only when progress reaches 100%
- Verify last_active_node_id updates on node transition

**Plan 09-02: Revision Sessions Table & Quiz Attempt Extensions**

Create the revision tracking system:

*New table `revision_sessions`:*
```sql
CREATE TABLE IF NOT EXISTS revision_sessions (
    id TEXT PRIMARY KEY,                          -- UUID
    original_session_id TEXT NOT NULL,             -- FK → learning_sessions.id
    revision_number INTEGER NOT NULL DEFAULT 1,   -- 1st, 2nd, 3rd revision...
    mode TEXT NOT NULL DEFAULT 'full_review',      -- 'full_review' or 'quiz_only'
    status TEXT NOT NULL DEFAULT 'in_progress',    -- 'in_progress' or 'completed'
    progress_percent INTEGER NOT NULL DEFAULT 0,   -- 0-100
    total_quiz_score_percent INTEGER,              -- Overall quiz accuracy
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (original_session_id) REFERENCES learning_sessions(id)
);
CREATE INDEX idx_revision_original ON revision_sessions(original_session_id);
```

*New table `revision_node_progress`:*
```sql
CREATE TABLE IF NOT EXISTS revision_node_progress (
    id TEXT PRIMARY KEY,                          -- UUID
    revision_session_id TEXT NOT NULL,             -- FK → revision_sessions.id
    node_id TEXT NOT NULL,                         -- FK → concept_nodes.id
    status TEXT NOT NULL DEFAULT 'pending',        -- 'pending', 'reviewed', 'quiz_passed', 'quiz_failed'
    reviewed_at TIMESTAMP,
    FOREIGN KEY (revision_session_id) REFERENCES revision_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES concept_nodes(id) ON DELETE CASCADE
);
CREATE INDEX idx_revision_node_session ON revision_node_progress(revision_session_id);
```

*Extend `quiz_attempts` table:*
- `revision_session_id` (TEXT, nullable): FK → revision_sessions.id
  - NULL = original learning attempt
  - Non-NULL = revision attempt
  - This lets us query "show me only revision quiz attempts" vs "original attempts"

*Pydantic schemas:*
- `RevisionSessionCreate(mode: str)` — request to start revision
- `RevisionSessionResponse(id, original_session_id, revision_number, mode, status, progress_percent, total_quiz_score_percent, started_at, completed_at)`
- `RevisionNodeProgress(id, revision_session_id, node_id, status, reviewed_at)`
- `RevisionMode` enum: 'full_review', 'quiz_only'

*Tests:*
- Verify revision_sessions table created with correct schema
- Verify revision_node_progress table created with cascade deletes
- Verify quiz_attempts.revision_session_id column added
- Verify foreign key constraints work
- Verify revision_number auto-increments per original_session_id
- Verify Pydantic schemas validate correctly

**Deliverables**:
- Extended `learning_sessions` with status/progress columns
- Extended `concept_nodes` with timestamp columns
- New `revision_sessions` table
- New `revision_node_progress` table
- Extended `quiz_attempts` with revision tracking
- Pydantic schemas for all new entities
- Migration methods following existing patterns
- Unit tests for all schema changes

**Dependencies**: None (foundation for v1.1)

**Verification**:
- [ ] All new columns added via ALTER TABLE without data loss
- [ ] Foreign key constraints enforced on revision tables
- [ ] Pydantic models validate correctly
- [ ] Existing tests still pass (backward compatible)
- [ ] New unit tests pass with >80% coverage

---

### Phase 10: Backend — Session Listing & Progress API
**Status**: `completed`
**Directory**: `phases/10-session-listing-api/`
**Estimated Plans**: 2

Build the API endpoints for listing user sessions with progress data and
managing session lifecycle (progress updates, status transitions).

**Why This Phase Exists:**
The current API can only fetch a single session by ID. There is no way for the
frontend to say "show me all my courses." This phase adds the listing endpoint
and the progress update logic that powers the dashboard.

**Plan 10-01: Session Listing Endpoint with Filtering**

*New endpoint:*
```
GET /learning/sessions
  Query params:
    - user_id (optional): Filter by user
    - status (optional): 'in_progress', 'completed', or 'all' (default: 'all')
    - sort_by (optional): 'updated_at' (default), 'created_at', 'progress_percent'
    - sort_order (optional): 'desc' (default), 'asc'
    - limit (optional): default 20, max 100
    - offset (optional): default 0
  Response: {
    sessions: LearningSessionSummary[],
    total_count: int,
    has_more: bool
  }
```

*New Pydantic schema `LearningSessionSummary`:*
```python
class LearningSessionSummary(BaseModel):
    id: str
    query: str
    course_title: str
    status: str                    # 'in_progress' or 'completed'
    progress_percent: int          # 0-100
    total_nodes: int               # How many concept nodes
    completed_nodes: int           # How many COMPLETED
    last_active_node_title: str | None  # Title of last active node
    created_at: str                # ISO timestamp
    updated_at: str                # ISO timestamp
    completed_at: str | None       # ISO timestamp, null if in progress
    revision_count: int            # How many times revised (0 if never)
```

*Persistence method:*
- `get_sessions_list(user_id, status, sort_by, sort_order, limit, offset)`
  - Uses SQL JOIN to get node counts and last-active-node title
  - Uses SQL subquery to count revisions per session
  - Returns list of summaries + total count for pagination

*Tests:*
- Empty list returns `{ sessions: [], total_count: 0, has_more: false }`
- List with 3 sessions returns all 3 with correct progress
- Filter by status='in_progress' excludes completed
- Filter by status='completed' excludes in_progress
- Sort by progress_percent ascending puts 0% first
- Pagination: limit=2, offset=0 returns first 2; offset=2 returns next
- has_more is true when total_count > offset + limit
- Verify revision_count is accurate (0 for never revised, 2 for twice revised)

**Plan 10-02: Progress Tracking Service & Auto-Status Updates**

*Progress calculation logic:*
- `calculate_session_progress(session_id) -> int`:
  Count COMPLETED nodes / total nodes × 100 (integer math, floor)
- Called automatically whenever a node transitions to COMPLETED
- Updates `learning_sessions.progress_percent` and `learning_sessions.updated_at`

*Auto-completion detection:*
- When `progress_percent` reaches 100:
  - Set `learning_sessions.status = 'completed'`
  - Set `learning_sessions.completed_at = now()`
- This happens inside the existing `transition_node_status()` method

*Last-active-node tracking:*
- Update `learning_sessions.last_active_node_id` whenever:
  - Node transitions from LOCKED → VIEWING_EXPLANATION (user started this node)
  - User submits a quiz (they're actively on this node)
- This enables "Resume" button to jump to the right card

*Node timestamp tracking:*
- Set `concept_nodes.started_at` on first LOCKED → VIEWING_EXPLANATION transition
- Set `concept_nodes.completed_at` on COMPLETED transition

*New endpoint for explicit progress sync (fallback):*
```
GET /learning/sessions/{id}/progress
  Response: {
    progress_percent: int,
    status: str,
    completed_nodes: int,
    total_nodes: int,
    last_active_node_id: str | None,
    last_active_node_title: str | None
  }
```

*Integration with existing transition logic:*
- Modify `transition_node_status()` in `learning_persistence.py` to call
  `_update_session_progress()` after any successful status transition
- This is a side-effect of the existing state machine, not a new endpoint

*Tests:*
- Progress is 0% when no nodes completed
- Progress is 60% when 3 of 5 nodes completed
- Progress reaches 100% and auto-sets status='completed' + completed_at
- last_active_node_id updates on LOCKED→VIEWING_EXPLANATION
- last_active_node_id updates on quiz submission
- Node started_at set on first view, not on subsequent views
- Node completed_at set exactly once on mastery
- GET /sessions/{id}/progress returns correct data
- Progress never exceeds 100% or drops below 0%

**Deliverables**:
- `GET /learning/sessions` endpoint with filtering/pagination/sorting
- `GET /learning/sessions/{id}/progress` endpoint
- `LearningSessionSummary` Pydantic schema
- Progress calculation service in persistence layer
- Auto-completion detection on 100% progress
- Last-active-node tracking for resume
- Node timestamp tracking (started_at, completed_at)
- Unit tests for all new functionality

**Dependencies**: Phase 09 (schema extensions)

**Verification**:
- [ ] Session listing returns paginated results with correct counts
- [ ] Filtering by status works correctly
- [ ] Progress auto-updates when nodes transition
- [ ] Session auto-completes when all nodes mastered
- [ ] Last-active-node tracks correctly for resume
- [ ] All existing tests still pass
- [ ] New tests achieve >80% coverage

---

### Phase 11: Backend — Revision & Quiz Re-attendance API
**Status**: `completed`
**Directory**: `phases/11-revision-api/`
**Estimated Plans**: 2
**Plans Completed**: 2/2

Build the API endpoints for creating revision sessions, tracking revision
progress, and enabling quiz re-attendance with separate scoring.

**Why This Phase Exists:**
Once a course is COMPLETED, nodes are in a terminal state. We need a "layer on
top" — a revision session that creates its own progress tracking without touching
the original data. This phase builds the revision lifecycle from creation
through completion.

**Plan 11-01: Revision Session CRUD & State Management**

*New endpoints:*

```
POST /learning/sessions/{id}/revisions
  Body: { mode: 'full_review' | 'quiz_only' }
  Response: RevisionSessionResponse
  Logic:
    1. Verify original session exists and is 'completed'
    2. Count existing revisions for this session → revision_number = count + 1
    3. Create revision_session record
    4. Create revision_node_progress records for each concept_node:
       - full_review mode: status = 'pending' for all nodes
       - quiz_only mode: status = 'pending' for all nodes (skip explanations in UI)
    5. Return RevisionSessionResponse with all node progress

GET /learning/sessions/{id}/revisions
  Query params: limit, offset
  Response: {
    revisions: RevisionSessionResponse[],
    total_count: int
  }
  Logic: List all revision sessions for a given original session

GET /learning/revisions/{revision_id}
  Response: RevisionSessionWithProgress
  Schema: {
    ...RevisionSessionResponse,
    nodes: RevisionNodeProgressWithDetails[]  // includes node title, sequence_index
  }
  Logic: Get single revision with all node progress details

DELETE /learning/revisions/{revision_id}
  Response: { deleted: true }
  Logic: Delete revision and cascade to revision_node_progress
```

*Pydantic schemas:*
```python
class RevisionCreateRequest(BaseModel):
    mode: Literal['full_review', 'quiz_only'] = 'full_review'

class RevisionSessionResponse(BaseModel):
    id: str
    original_session_id: str
    revision_number: int
    mode: str
    status: str
    progress_percent: int
    total_quiz_score_percent: int | None
    started_at: str
    completed_at: str | None

class RevisionNodeProgressWithDetails(BaseModel):
    id: str
    node_id: str
    node_title: str
    sequence_index: int
    status: str  # 'pending', 'reviewed', 'quiz_passed', 'quiz_failed'
    reviewed_at: str | None

class RevisionSessionWithProgress(RevisionSessionResponse):
    nodes: list[RevisionNodeProgressWithDetails]
```

*Persistence methods:*
- `create_revision_session(original_session_id, mode) -> RevisionSessionResponse`
- `get_revisions_for_session(session_id, limit, offset) -> list`
- `get_revision_session(revision_id) -> RevisionSessionWithProgress`
- `delete_revision_session(revision_id)`

*Validation rules:*
- Cannot create revision for a non-completed session → 400 error
- Cannot create revision for a non-existent session → 404 error
- Only 'full_review' and 'quiz_only' modes allowed → 422 validation error

*Tests:*
- Create revision for completed session succeeds
- Create revision for in_progress session returns 400
- Create revision for non-existent session returns 404
- revision_number increments (1st revision = 1, 2nd = 2)
- List revisions returns correct count and order
- Get revision includes all node progress details
- Delete revision cascades to node progress
- Quiz_only mode creates same node count as full_review

**Plan 11-02: Revision Progress Tracking & Quiz Re-attendance**

*New endpoints for revision node progress:*

```
POST /learning/revisions/{revision_id}/nodes/{node_id}/mark-reviewed
  Response: RevisionNodeProgress
  Logic:
    - Set revision_node_progress.status = 'reviewed'
    - Set revision_node_progress.reviewed_at = now()
    - Recalculate revision progress_percent
    - Only allowed in 'full_review' mode (in quiz_only, nodes marked via quiz)

POST /learning/revisions/{revision_id}/nodes/{node_id}/submit-quiz
  Body: { selected_option_id: str, quiz_index: int = 0 }
  Response: {
    ...QuizAttemptResponse,
    revision_node_status: str  // 'quiz_passed' or 'quiz_failed'
  }
  Logic:
    1. Find the original quiz_data for this node
    2. Evaluate the answer (reuse existing evaluation logic)
    3. Create quiz_attempt with revision_session_id set
    4. Update revision_node_progress.status:
       - Correct → 'quiz_passed'
       - Incorrect → 'quiz_failed'
    5. Recalculate revision progress_percent and total_quiz_score_percent
    6. If all nodes reviewed/passed → set revision status = 'completed'

GET /learning/revisions/{revision_id}/summary
  Response: {
    revision_id: str,
    mode: str,
    progress_percent: int,
    total_quiz_score_percent: int | None,
    nodes_reviewed: int,
    nodes_total: int,
    quizzes_passed: int,
    quizzes_failed: int,
    quizzes_total: int,
    time_spent_seconds: int | None,  // completed_at - started_at
    comparison: {                     // vs original performance
      original_quiz_score_percent: int,
      improvement_percent: int         // can be negative
    } | None
  }
```

*Revision progress calculation:*
- full_review mode: progress = reviewed_or_quiz_passed nodes / total × 100
- quiz_only mode: progress = quiz_attempted nodes / total × 100
- A "quiz_failed" node still counts as "attempted" for progress
- total_quiz_score_percent = correct_quizzes / attempted_quizzes × 100

*Revision completion detection:*
- full_review: All nodes marked 'reviewed' or 'quiz_passed'/'quiz_failed'
- quiz_only: All nodes have quiz submitted (passed or failed)
- On completion: set status='completed', completed_at=now()

*Performance comparison:*
- Calculate original quiz performance from quiz_attempts WHERE revision_session_id IS NULL
- Compare with revision quiz_attempts WHERE revision_session_id = this revision
- Report improvement as a signed percentage

*Tests:*
- Mark node as reviewed in full_review mode succeeds
- Mark node as reviewed in quiz_only mode returns 400
- Submit quiz creates attempt with revision_session_id
- Correct quiz answer sets node status to 'quiz_passed'
- Incorrect quiz answer sets node status to 'quiz_failed'
- Can retry failed quiz (stays 'quiz_failed' until correct)
- Progress recalculates after each node action
- Revision auto-completes when all nodes done
- Summary shows correct quiz score comparison
- Separate quiz_attempts: revision vs original queries work

**Deliverables**:
- 6 new API endpoints for revision lifecycle
- Revision CRUD persistence methods
- Quiz re-attendance with separate attempt tracking
- Revision progress calculation
- Performance comparison (revision vs original)
- Pydantic schemas for all revision entities
- Comprehensive unit tests

**Dependencies**: Phase 10 (progress API must exist)

**Verification**:
- [ ] Revision creation only works for completed sessions
- [ ] Quiz re-attendance tracks attempts separately
- [ ] Progress calculation correct for both modes
- [ ] Auto-completion on all nodes done
- [ ] Performance comparison accurate
- [ ] All existing tests still pass
- [ ] New tests achieve >80% coverage

---

### Phase 12: Frontend — Course Dashboard Components
**Status**: `pending`
**Directory**: `phases/12-course-dashboard/`
**Estimated Plans**: 2
**Plans Completed**: 1/2

Build the React components for displaying the course dashboard on the
LearningHome page, showing all courses with progress indicators.

**Why This Phase Exists:**
Currently LearningHome is only a topic input form. After this phase, it becomes
a full dashboard showing recent courses, their progress, and actions (resume,
revise). This is the user's "home base" for their learning journey.

**Plan 12-01: CourseCard Component & Dashboard API Hook**

*New component: `CourseCard.tsx`*
Location: `client/src/features/learning/CourseCard.tsx`

Visual design (following `conductor/product-guidelines.md`):
```
┌─────────────────────────────────────────────┐
│ [Course Title]                   [Status]   │
│ "Original query text..."                    │
│                                             │
│ ████████████░░░░░░░░░░░  60%               │
│                                             │
│ 3/5 topics completed                        │
│ Last active: "Newton's Third Law"           │
│                                             │
│ [Resume Course]     [Started: Jan 15]       │
│─────────────────────────────────────────────│
│ ✦ Revised 2 times                          │
└─────────────────────────────────────────────┘
```

- **In Progress**: Progress bar with Cyber Yellow (#FFD400) fill
  - "Resume Course" primary button → navigates to /learn/{sessionId}
  - Shows last active topic title for context
- **Completed (100%)**: Green checkmark badge, full progress bar
  - "Revise Course" button → full_review mode
  - "Practice Quizzes" button → quiz_only mode
  - "Revised X times" if revision_count > 0
- **Dark theme**: card background #1a1a2e or similar dark shade
- **Glassmorphism**: Subtle glass effect per product guidelines
- **Hover**: Slight scale-up with glow effect (Framer Motion)
- **Responsive**: Full-width on mobile, 2-column grid on desktop

*Props interface:*
```typescript
interface CourseCardProps {
  session: LearningSessionSummary;
  onResume: (sessionId: string) => void;
  onRevise: (sessionId: string, mode: 'full_review' | 'quiz_only') => void;
}
```

*New React Query hook: `useCourseList.ts`*
```typescript
function useCourseList(options?: {
  status?: 'all' | 'in_progress' | 'completed';
  sortBy?: 'updated_at' | 'created_at' | 'progress_percent';
  limit?: number;
}) {
  return useQuery({
    queryKey: ['courses', options],
    queryFn: () => learningApi.getSessionsList(options),
    staleTime: 30_000,  // 30 seconds
  });
}
```

*API client addition in `learningApi.ts`:*
```typescript
async function getSessionsList(params?: {
  status?: string;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
  offset?: number;
}): Promise<SessionListResponse>
```

*TypeScript types in `learning.ts`:*
```typescript
interface LearningSessionSummary {
  id: string;
  query: string;
  course_title: string;
  status: 'in_progress' | 'completed';
  progress_percent: number;
  total_nodes: number;
  completed_nodes: number;
  last_active_node_title: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  revision_count: number;
}

interface SessionListResponse {
  sessions: LearningSessionSummary[];
  total_count: number;
  has_more: boolean;
}
```

*Tests:*
- CourseCard renders in-progress state with correct progress
- CourseCard renders completed state with revision buttons
- Resume button calls onResume with sessionId
- Revise buttons call onRevise with correct mode
- Progress bar width matches progress_percent
- revision_count badge appears only when > 0
- useCourseList hook fetches data and provides loading states
- API client correctly maps query params

**Plan 12-02: Dashboard Layout Integration into LearningHome**

*Update `LearningHome.tsx`:*

New layout structure:
```
┌──────────────────────────────────────────────┐
│ [AgUI Header]                [Navigation]    │
├──────────────────────────────────────────────┤
│                                              │
│  ✦ Learn Anything                            │
│  [TopicInput - existing component]           │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│  📚 Your Courses                             │
│                                              │
│  [Filter: All | In Progress | Completed]     │
│  [Sort: Recent | Progress | Date Created]    │
│                                              │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ CourseCard 1 │  │ CourseCard 2 │           │
│  │ (60%)        │  │ (100%)       │           │
│  └─────────────┘  └─────────────┘           │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ CourseCard 3 │  │ CourseCard 4 │           │
│  │ (100%)       │  │ (20%)        │           │
│  └─────────────┘  └─────────────┘           │
│                                              │
│  [Load More] (if has_more)                   │
│                                              │
├──────────────────────────────────────────────┤
│  (How It Works section - existing, moved     │
│   below courses, collapsed if courses exist) │
│                                              │
│  (Feature cards - existing, always visible)  │
└──────────────────────────────────────────────┘
```

*Behavioral rules:*
- If user has 0 courses: Show full hero + "How It Works" + Feature cards
  (existing experience, no changes)
- If user has 1+ courses: Show compact hero + TopicInput + "Your Courses"
  section + Feature cards. "How It Works" section collapsed behind
  an "expand" disclosure button.
- Filter buttons: "All" (default), "In Progress", "Completed"
- Sort options: "Recent" (updated_at desc), "Progress" (progress_percent desc),
  "Date Created" (created_at desc)
- "Load More" button for pagination (loads next 20)
- Empty filter state: "No [status] courses found" message

*New component: `CourseFilter.tsx`*
```typescript
interface CourseFilterProps {
  status: 'all' | 'in_progress' | 'completed';
  sortBy: 'updated_at' | 'created_at' | 'progress_percent';
  onStatusChange: (status: string) => void;
  onSortChange: (sort: string) => void;
}
```
- Pill-style filter buttons with active state (Cyber Yellow)
- Dropdown or pill group for sort options

*Animation:*
- CourseCard list uses Framer Motion `AnimatePresence` for enter/exit
- Cards stagger-animate on initial load (50ms gap between cards)
- Filter changes animate card rearrangement

*Tests:*
- LearningHome shows hero + "How It Works" when 0 courses
- LearningHome shows compact hero + course list when courses exist
- Filter buttons change the displayed courses
- Sort changes reorder the course cards
- "Load More" fetches next page
- Navigation to /learn/{id} works from Resume button
- Empty filter state shows appropriate message
- Skeleton loading cards show during fetch

**Deliverables**:
- `CourseCard` component with progress visualization
- `CourseFilter` component with filter/sort controls
- `useCourseList` React Query hook
- API client method for session listing
- TypeScript types for session summary
- Updated `LearningHome` layout with dashboard
- Framer Motion animations for card list
- Skeleton loading states
- Unit tests for all new components

**Dependencies**: Phase 10 (session listing API must exist)

**Verification**:
- [ ] CourseCard renders correctly for both states
- [ ] Dashboard shows when courses exist, hero when empty
- [ ] Filtering and sorting work correctly
- [ ] Pagination loads more courses
- [ ] Resume navigates to correct session
- [ ] Responsive layout (mobile single-column, desktop grid)
- [ ] Animations are smooth (60fps)
- [ ] All new component tests pass

---

### Phase 13: Frontend — Course Resume & Multi-Session Navigation
**Status**: `pending`
**Directory**: `phases/13-resume-navigation/`
**Estimated Plans**: 2

Implement the "resume where you left off" experience and enable smooth
navigation between multiple courses without losing progress.

**Why This Phase Exists:**
Phase 12 builds the dashboard that *shows* courses. This phase makes them
*actionable* — clicking "Resume" should take the user to the exact card they
were last working on, and navigating away should persist their position.

**Plan 13-01: Resume Course Flow & Last-Active-Node Scrolling**

*Resume behavior:*
1. User clicks "Resume" on CourseCard → navigates to `/learn/{sessionId}`
2. LearningPage loads session data (existing)
3. NEW: Auto-scroll to `last_active_node_id` in the carousel
4. Highlight the active node with a brief glow animation
5. If `last_active_node_id` is null (edge case), scroll to first non-COMPLETED node

*Changes to `LearningPathContainer.tsx`:*
- Accept optional `initialNodeId` prop from LearningPage
- On mount, if `initialNodeId` is set:
  1. Find the slide index for that node
  2. Set carousel position to that index
  3. Trigger highlight animation on the card
- If `initialNodeId` not set (new generation): keep existing behavior (start at 0)

*Changes to `LearningPage.tsx`:*
- Fetch session progress to get `last_active_node_id`
- Pass it to LearningPathContainer as `initialNodeId`
- Show brief "Resuming where you left off..." toast using existing
  toast/notification system (or inline banner)

*Last-active tracking on frontend:*
- When user navigates carousel or clicks a progress bar node → update
  `last_active_node_id` via API call (debounced, 2s delay)
- Don't update on every slide change — debounce to avoid API spam
- Use a lightweight PUT or PATCH:
  ```
  PATCH /learning/sessions/{id}/last-active
  Body: { node_id: str }
  Response: { updated: true }
  ```

*Backend: New endpoint*
```
PATCH /learning/sessions/{id}/last-active
  Body: { node_id: str }
  Response: { updated: true }
  Logic: UPDATE learning_sessions SET last_active_node_id = ? WHERE id = ?
```

*Tests:*
- Resume navigates to correct session URL
- Auto-scroll positions carousel at last active node
- Highlight animation plays on resumed node
- Null last_active_node_id falls back to first non-COMPLETED node
- Debounced PATCH fires after 2s of no carousel movement
- Multiple rapid carousel changes result in single PATCH
- PATCH updates database correctly
- LearningPathContainer accepts and uses initialNodeId

**Plan 13-02: Session Switching & Navigation Guards**

*Multi-session navigation:*
- User is on /learn/abc (60% done) → clicks browser back → lands on /learn
- Dashboard shows Course abc at 60% (last_active_node_id already saved)
- User clicks "Learn Something Else" → TopicInput shown
- User generates new course → navigated to /learn/xyz
- User clicks "← Back to Dashboard" on header → returns to /learn
- Dashboard now shows both courses with accurate progress

*Changes to LearningPage header:*
- Replace "← Back" button text with "← Dashboard"
- Ensure last_active_node_id is saved before navigation (flush debounce)
- On `beforeunload` or route change: fire pending PATCH immediately

*"New Topic" flow from LearningPage:*
- Add "New Topic" button in LearningPage header (if not already there)
- On click: Navigate to `/learn` (dashboard) — don't open a modal
- This keeps navigation simple: dashboard is the hub for everything

*React Query cache management:*
- When navigating between sessions, React Query cache persists session data
- `staleTime: 60_000` for session detail (1 minute)
- `staleTime: 30_000` for course list (30 seconds)
- Invalidate course list cache when returning to dashboard after progress
- Use `queryClient.invalidateQueries(['courses'])` on LearningPage unmount

*Navigation breadcrumb:*
```
Dashboard > Course Title > Topic N
```
- Or simpler: "← Dashboard" back button + course title in header
- Decision: keep it simple with just back button + course title

*Tests:*
- Back button saves last_active_node_id before navigating
- Course list refreshes when returning to dashboard
- React Query cache doesn't show stale progress data
- Multiple sessions in cache don't conflict
- New topic generation creates new session without affecting others
- Browser refresh on /learn/{id} correctly resumes (URL-based state)

**Deliverables**:
- Resume-to-exact-node functionality
- Last-active-node tracking (debounced)
- PATCH endpoint for last-active updates
- Dashboard ← → Session navigation
- React Query cache management for multi-session
- "← Dashboard" navigation with progress save
- Unit tests for resume and navigation flows

**Dependencies**: Phase 12 (dashboard must exist)

**Verification**:
- [ ] Resume scrolls to correct node
- [ ] Progress persists across session switches
- [ ] Cache invalidation keeps dashboard fresh
- [ ] No data loss when navigating between sessions
- [ ] Debounced PATCH isn't too aggressive (check network tab)
- [ ] Browser refresh correctly loads session state
- [ ] All tests pass

---

### Phase 14: Frontend — Revision Mode UI
**Status**: `pending`
**Directory**: `phases/14-revision-ui/`
**Estimated Plans**: 2

Build the frontend UI for course revision and quiz re-attendance, including
the revision launcher, revision-mode learning flow, and performance comparison.

**Why This Phase Exists:**
Phase 11 built the revision API. This phase creates the UI that drives it.
Users need to:
1. Launch a revision from the dashboard or completed course
2. Walk through content/quizzes in revision mode
3. See their performance compared to the original attempt

**Plan 14-01: Revision Launcher & Revision Mode Components**

*Revision launch flow:*
1. User sees completed CourseCard → clicks "Revise Course" or "Practice Quizzes"
2. Frontend calls `POST /learning/sessions/{id}/revisions` with mode
3. API returns revision session → navigate to `/learn/{sessionId}/revise/{revisionId}`
4. LearningPage detects revision mode via URL param
5. UI adjusts for revision mode (different header, different card behavior)

*New route:*
```
/learn/:sessionId/revise/:revisionId → RevisionPage
```

*New component: `RevisionPage.tsx`*
- Very similar to LearningPage but with revision-specific behavior
- Header shows: "📖 Revision #2 — Full Review" or "📝 Revision #3 — Quiz Only"
- Progress tracked via revision_node_progress, not concept_nodes.status
- Original concept_node.status stays COMPLETED (never modified)
- All cards are "unlocked" in revision mode — sequential gating removed
- Can navigate freely between all topics

*Revision-mode ConceptCard behavior:*

For **full_review** mode:
- All explanation content is visible (no gradual unlock needed)
- "Mark as Reviewed" button at bottom of explanation
- Quiz still interactive — user answers, gets feedback
- Clicking "Mark as Reviewed" → PATCH revision node status to 'reviewed'
- Then quiz appears → submit → 'quiz_passed' or 'quiz_failed'
- Card shows a check/cross badge based on quiz result

For **quiz_only** mode:
- Explanation content hidden (just shows topic title as context)
- Quiz shown immediately (no "I understand" gate)
- Submit answer → see feedback → automatically advance to next
- Card shows only quiz, not content markdown
- Much faster flow for practice

*New component: `RevisionConceptCard.tsx`*
- Wraps or extends `ConceptCard` with revision-specific behavior
- Props include `revisionMode: 'full_review' | 'quiz_only'`
- Props include `revisionNodeProgress: RevisionNodeProgress`
- Shows badge: ✅ Reviewed, ✅ Quiz Passed, ❌ Quiz Failed, ⏳ Pending

*New hook: `useRevisionMutations.ts`*
```typescript
function useRevisionMutations(revisionId: string) {
  return {
    markReviewed: (nodeId: string) => ...,
    submitRevisionQuiz: (nodeId: string, optionId: string, quizIndex?: number) => ...,
  };
}
```

*New hook: `useRevisionSession.ts`*
```typescript
function useRevisionSession(revisionId: string) {
  return useQuery({
    queryKey: ['revision', revisionId],
    queryFn: () => learningApi.getRevisionSession(revisionId),
  });
}
```

*API client additions in `learningApi.ts`:*
```typescript
createRevision(sessionId: string, mode: string): Promise<RevisionSessionResponse>
getRevisionSession(revisionId: string): Promise<RevisionSessionWithProgress>
markNodeReviewed(revisionId: string, nodeId: string): Promise<RevisionNodeProgress>
submitRevisionQuiz(revisionId: string, nodeId: string, optionId: string, quizIndex?: number): Promise<RevisionQuizResponse>
getRevisionSummary(revisionId: string): Promise<RevisionSummary>
```

*Tests:*
- "Revise Course" button creates revision and navigates correctly
- "Practice Quizzes" button creates quiz-only revision
- Full review mode shows content + quiz
- Quiz only mode hides content, shows quiz immediately
- Mark as reviewed updates revision node status
- Quiz submission in revision tracks separately
- All cards accessible (no sequential locking)
- Revision progress bar shows revision-specific progress
- RevisionConceptCard renders correct badges

**Plan 14-02: Revision History & Performance Comparison**

*New component: `RevisionSummaryModal.tsx`*
Shown when a revision session is completed:
```
┌───────────────────────────────────────────┐
│       📊 Revision Complete!               │
│                                           │
│  Mode: Full Review                        │
│  Topics Reviewed: 5/5                     │
│  Quiz Score: 80% (4/5 correct)            │
│                                           │
│  ── Compared to Original ──               │
│  Original Score: 60% (3/5)                │
│  Improvement: +20% ↑                      │
│                                           │
│  [Back to Dashboard]  [Revise Again]      │
└───────────────────────────────────────────┘
```

*Revision history on CourseCard:*
- Show "Revised X times" count
- Expandable section showing revision history:
  ```
  ▼ Revision History
  #3 - Feb 14 - Quiz Only - Score: 100% ✅
  #2 - Feb 10 - Full Review - Score: 80%
  #1 - Feb 08 - Full Review - Score: 60%
  ```
- Click any revision to view its detailed summary

*New component: `RevisionHistoryList.tsx`*
- Shown on CourseCard when expanded or on a separate route
- Each row shows: revision number, date, mode, score, improvement badge
- Sort by date descending (most recent first)
- Performance trend: small sparkline or trend indicator (optional)

*New hook: `useRevisionHistory.ts`*
```typescript
function useRevisionHistory(sessionId: string) {
  return useQuery({
    queryKey: ['revisions', sessionId],
    queryFn: () => learningApi.getRevisionsList(sessionId),
  });
}
```

*Update to `CourseCard.tsx`:*
- Add "Revised X times" badge (from Phase 12)
- Add expandable revision history section
- Performance comparison: show improvement trend with arrows
  - Green ↑ for improvement
  - Red ↓ for decline
  - Gray → for no change

*Tests:*
- RevisionSummaryModal shows correct scores and comparison
- Improvement calculated correctly (positive, negative, zero)
- Revision history shows all revisions in date order
- Clicking revision opens summary
- "Revise Again" creates new revision
- "Back to Dashboard" navigates to /learn
- CourseCard revision badge shows correct count
- Expandable history section toggles correctly

**Deliverables**:
- `RevisionPage` component with revision-mode carousel
- `RevisionConceptCard` component with mode-specific rendering
- `RevisionSummaryModal` with performance comparison
- `RevisionHistoryList` component
- `useRevisionMutations`, `useRevisionSession`, `useRevisionHistory` hooks
- API client methods for all revision endpoints
- TypeScript types for revision entities
- Route addition for /learn/:sessionId/revise/:revisionId
- Framer Motion animations for revision mode
- Unit tests for all new components and hooks

**Dependencies**: Phase 11 (revision API must exist), Phase 12 (CourseCard must exist)

**Verification**:
- [ ] Full review mode shows content + quiz for each node
- [ ] Quiz only mode shows only quizzes (no explanations)
- [ ] No sequential locking in revision mode (all nodes accessible)
- [ ] Performance comparison shows correct improvement/decline
- [ ] Revision history displays correctly on CourseCard
- [ ] RevisionSummaryModal appears on revision completion
- [ ] All cards show correct badges (reviewed/passed/failed)
- [ ] All new tests pass

---

### Phase 15: Integration, Testing & Polish
**Status**: `pending`
**Directory**: `phases/15-integration-polish/`
**Estimated Plans**: 2

End-to-end integration testing, edge case handling, animation polish, and
final quality verification for the entire v1.1 feature set.

**Why This Phase Exists:**
Phases 09-14 build individual pieces. This phase verifies they work together
as a cohesive experience, handles edge cases, and ensures the quality bar
defined in `conductor/workflow.md` is met.

**Plan 15-01: End-to-End Integration Testing**

*Integration test scenarios:*

Scenario 1: Multi-course lifecycle
1. Generate Course A → verify appears on dashboard at 0%
2. Complete 3/5 nodes of A → verify dashboard shows 60%
3. Navigate to dashboard → verify Course A visible with resume
4. Generate Course B → verify dashboard shows both courses
5. Complete Course B to 100% → verify status='completed'
6. Return to dashboard → verify Course B at 100%, Course A at 60%
7. Resume Course A → verify scrolls to node 4 (the 4th uncompleted)
8. Complete Course A → verify both at 100%

Scenario 2: Revision lifecycle
1. Complete a course to 100%
2. Start full_review revision → verify all nodes accessible
3. Review 3 topics, pass 4 quizzes, fail 1 → verify progress
4. Complete revision → verify summary shows comparison
5. Start quiz_only revision → verify no content shown
6. Pass all quizzes → verify 100% score, improvement shown
7. Check revision history → verify both revisions listed

Scenario 3: Edge cases
1. Delete browser cache → sessions still load from server
2. Open /learn/{invalidId} → shows 404 or "course not found"
3. Open /learn/{id}/revise/{invalidRevisionId} → graceful error
4. Generate course while another is in progress → no conflict
5. Rapid navigation between courses → no stale cache issues
6. Mobile responsiveness: dashboard, cards, revision on narrow viewport

*Server-side integration tests:*
- Full course lifecycle: generate → progress → complete → revise → quiz
- Concurrent session handling: multiple in-progress sessions
- Data integrity: deleting a session cascades properly
- Progress calculation accuracy across edge cases
- Revision quiz attempts don't affect original session stats

*Client-side integration tests:*
- React Testing Library tests for full user flows
- Mock API responses for dashboard → resume → complete → revise
- Verify React Query cache behavior across navigation
- Verify optimistic updates roll back on error

*Tests to write:*
- server/tests/test_session_lifecycle.py (new file, ~15 tests)
- client/src/features/learning/__tests__/dashboard-e2e.test.tsx (~10 tests)
- client/src/features/learning/__tests__/revision-e2e.test.tsx (~8 tests)

**Plan 15-02: Animation Polish, Edge Cases & Quality Gates**

*Animation polish:*
- CourseCard entrance: stagger animation with scale + fade
- Progress bar fill: smooth 0.5s ease-out transition on value change
- Revision mode: subtle color shift (e.g., border goes from yellow → blue
  to visually distinguish revision from original learning)
- RevisionSummaryModal: entrance with scale-up + backdrop blur
- "Load More" courses: new cards slide in from below
- Filter change: cards rearrange with layout animation

*Edge case handling:*
- Empty state for "no courses yet" → show motivational hero
- Network error during progress update → retry with exponential backoff
- Session deleted while user is on it → redirect to dashboard with toast
- Revision for session that was somehow deleted → 404 with helpful message
- Very long course titles → truncate with ellipsis (CSS)
- Progress_percent rounding: always floor to prevent "101%" display

*Accessibility:*
- CourseCard: keyboard navigable (Tab, Enter to resume/revise)
- Filter buttons: proper ARIA labels and role="tablist"
- Progress bar: aria-valuenow, aria-valuemin, aria-valuemax
- Revision badges: aria-label describing the status
- Screen reader announcements for status changes

*Performance:*
- Virtualize course list if >50 courses (react-window optional)
- Lazy load revision history (only fetch when expanded)
- Debounce dashboard refresh on window focus (5s)
- Prefetch session data on CourseCard hover (200ms delay)

*Final quality gates:*
```bash
# Server
cd server
python -m unittest  # All tests pass

# Client
cd client
npm run test -- --run           # All tests pass
npm run test -- --coverage      # >80% coverage
npm run lint                    # No lint errors
npm run build                   # Production build succeeds
```

*Production build verification:*
- Bundle size check: warn if JS exceeds 1MB (current is ~830KB)
- No console.log statements in production code
- No TODO comments left in committed code
- All TypeScript strict mode errors resolved

**Deliverables**:
- End-to-end integration test suites (server + client)
- Animation and transition polish (Framer Motion)
- Accessibility compliance (ARIA labels, keyboard nav)
- Edge case handling with graceful degradation
- Performance optimizations
- Final quality gate verification
- Updated documentation if needed

**Dependencies**: All previous v1.1 phases (09-14)

**Verification**:
- [ ] All integration test scenarios pass
- [ ] Server tests: 100% pass rate
- [ ] Client tests: 100% pass rate, >80% coverage
- [ ] ESLint: no errors
- [ ] TypeScript strict: no errors
- [ ] Production build: succeeds, <1MB JS
- [ ] Mobile responsive: all views tested at 375px width
- [ ] Keyboard navigation: full flow accessible
- [ ] No console errors in production
- [ ] Edge cases handled gracefully

---

## v1.1 Phase Summary

| Phase | Name | Plans | Status | Dependencies |
|-------|------|-------|--------|--------------|
| 09 | Database Schema Extensions | 2 | in_progress | - |
| 10 | Session Listing & Progress API | 2 | completed | 09 |
| 11 | Revision & Quiz Re-attendance API | 2 | completed | 10 |
| 12 | Course Dashboard Components | 2 | pending | 10 |
| 13 | Course Resume & Navigation | 2 | pending | 12 |
| 14 | Revision Mode UI | 2 | pending | 11, 12 |
| 15 | Integration, Testing & Polish | 2 | pending | 09-14 |

**Total Estimated Plans (v1.1)**: 14
**Total Estimated Plans (v1.0 + v1.1)**: 34
**Execution Model**: Sequential phases, some parallelism possible
(Phases 12+13 can run in parallel with Phase 11)

**Dependency Graph**:
```
Phase 09 (DB Schema)
    ↓
Phase 10 (Session API)
    ↓          ↓
Phase 11    Phase 12
(Rev API)   (Dashboard)
    ↓          ↓
    ↓       Phase 13
    ↓       (Resume Nav)
    ↓          ↓
Phase 14 ←─────┘
(Revision UI)
    ↓
Phase 15
(Integration)
```

---

## Future Milestones (v1.2+)

- **Spaced Repetition Automation**: SM-2 algorithm with scheduled review
  notifications suggesting "Review X course — it's been 7 days"
- **Adaptive Difficulty**: Quizzer adjusts question difficulty based on
  user's historical quiz performance across revisions
- **RAG Integration**: Ground explanations in verified source material
- **Semantic Caching**: Recognize similar queries, serve cached courses
- **Multi-Modal**: Generate diagrams with Imagen 3
- **LLM-as-Judge**: Automated quality evaluation pipeline
- **User Authentication**: Proper user accounts for cross-device sync
- **Social Learning**: Share courses with others, leaderboards
