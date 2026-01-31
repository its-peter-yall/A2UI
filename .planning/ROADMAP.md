# Roadmap: Retrieval-Based Learning Feature

## Milestone: v1.0 - Core Learning Path System

### Phase 01: Database Schema & Models
**Status**: `pending`
**Directory**: `phases/01-database-schema/`
**Estimated Plans**: 2

Extend SQLite schema for learning-specific entities.

**Deliverables**:
- `learning_sessions` table (user learning course instances)
- `concept_nodes` table (cards with status: LOCKED/UNLOCKED/COMPLETED)
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
**Status**: `pending`
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
**Status**: `pending`
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

### Phase 06: State Management & Flow
**Status**: `pending`
**Directory**: `phases/06-state-flow/`
**Estimated Plans**: 2

Wire up client-side state management and gated progression.

**Deliverables**:
- React Query mutations for quiz submission
- Optimistic updates with invalidation
- Client-side quiz answer state (Zustand optional)
- Unlock flow: submit → validate → unlock → scroll to next
- Error handling and retry UI

**Dependencies**: Phase 05 (components)

**Verification**:
- [ ] Quiz submission triggers refetch
- [ ] UI reflects server state after mutation
- [ ] Error states display retry option
- [ ] Flow completes end-to-end

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
| 01 | Database Schema & Models | 2 | pending | - |
| 02 | AI Agent Infrastructure | 3 | pending | 01 |
| 03 | Async Orchestration Layer | 2 | pending | 02 |
| 04 | API Endpoints | 2 | pending | 03 |
| 05 | Frontend Components | 3 | pending | 04 |
| 06 | State Management & Flow | 2 | pending | 05 |
| 07 | Animations & Gamification | 2 | pending | 06 |
| 08 | Integration & Polish | 2 | pending | 07 |

**Total Estimated Plans**: 18
**Execution Model**: Sequential phases, atomic plans within each phase

---

## Future Milestones (v1.1+)

- **Adaptive Difficulty**: Quizzer adjusts based on user performance
- **RAG Integration**: Ground explanations in verified source material
- **Semantic Caching**: Recognize similar queries, serve cached courses
- **Multi-Modal**: Generate diagrams with Imagen 3
- **LLM-as-Judge**: Automated quality evaluation pipeline
