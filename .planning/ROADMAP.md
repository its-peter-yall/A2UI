# Roadmap: Retrieval-Based Learning Feature

## Milestone: v1.0 - Core Learning Path System

### Phase 01: Database Schema & Models
**Status**: `pending`
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
**Status**: `pending`
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
**Status**: `in_progress`
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
**Status**: `pending`
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
**Status**: `pending`
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
**Status**: `in_progress`
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
**Status**: `pending`
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
**Status**: `pending`
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
| 03 | Async Orchestration Layer | 2 | in_progress | 02 |
| 03a | Schema Fixes for Sequential Flow | 2 | pending | 03 |
| 04 | API Endpoints | 2 | pending | 03a |
| 05 | Frontend Components | 3 | in_progress | 04 |
| 06 | Sequential Flow State Machine & Navigation | 2 | pending | 05 |
| 07 | Animations & Gamification | 2 | pending | 06 |
| 08 | Integration & Polish | 2 | pending | 07 |

**Total Estimated Plans**: 20
**Execution Model**: Sequential phases, atomic plans within each phase

---

## Future Milestones (v1.1+)

- **Adaptive Difficulty**: Quizzer adjusts based on user performance
- **RAG Integration**: Ground explanations in verified source material
- **Semantic Caching**: Recognize similar queries, serve cached courses
- **Multi-Modal**: Generate diagrams with Imagen 3
- **LLM-as-Judge**: Automated quality evaluation pipeline
