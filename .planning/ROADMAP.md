# Roadmap: Retrieval-Based Learning Feature

## Milestones

- ✅ **v1.0 MVP** - Phases 1-8 (shipped 2025-02-01)
- ✅ **v1.1 Course Persistence & Revision** - Phases 9-15 (shipped 2025-02-16)
- ✅ **v1.2 Dynamic Quiz Generation** - Phases 16-20 (shipped 2026-02-17)
- ✅ **v1.3 Human Verification & E2E Testing** - Phases 21-24 (shipped 2026-03-08)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) — SHIPPED 2025-02-01</summary>

### Phase 01: Database Schema & Models
**Status**: `completed`
**Directory**: `phases/01-database-schema/`
**Plans**: 2/2

### Phase 02: AI Agent Infrastructure
**Status**: `completed`
**Directory**: `phases/02-agent-infrastructure/`
**Plans**: 3/3

### Phase 03: Async Orchestration Layer
**Status**: `completed`
**Directory**: `phases/03-orchestration/`
**Plans**: 2/2

### Phase 03a: Schema Fixes for Sequential Flow
**Status**: `completed`
**Directory**: `phases/03a-schema-fixes/`
**Plans**: 2/2

### Phase 04: API Endpoints
**Status**: `completed`
**Directory**: `phases/04-api-endpoints/`
**Plans**: 2/2

### Phase 05: Frontend Components
**Status**: `completed`
**Directory**: `phases/05-frontend-components/`
**Plans**: 3/3

### Phase 06: Sequential Flow State Machine & Navigation
**Status**: `completed`
**Directory**: `phases/06-state-flow/`
**Plans**: 2/2

### Phase 07: Animations & Gamification
**Status**: `completed`
**Directory**: `phases/07-animations/`
**Plans**: 2/2

### Phase 08: Integration & Polish
**Status**: `completed`
**Directory**: `phases/08-integration/`
**Plans**: 2/2

**Total v1.0 Plans**: 20/20

</details>

<details>
<summary>✅ v1.1 Course Persistence & Revision (Phases 9-15) — SHIPPED 2025-02-16</summary>

### Phase 09: Database Schema Extensions for Progress & Revision
**Status**: `completed`
**Directory**: `phases/09-database-progress-revision/`
**Plans**: 2/2

### Phase 10: Backend — Session Listing & Progress API
**Status**: `completed`
**Directory**: `phases/10-session-listing-api/`
**Plans**: 2/2

### Phase 11: Backend — Revision & Quiz Re-attendance API
**Status**: `completed`
**Directory**: `phases/11-revision-api/`
**Plans**: 2/2

### Phase 12: Frontend — Course Dashboard Components
**Status**: `completed`
**Directory**: `phases/12-course-dashboard/`
**Plans**: 2/2

### Phase 13: Frontend — Course Resume & Multi-Session Navigation
**Status**: `completed`
**Directory**: `phases/13-resume-navigation/`
**Plans**: 2/2

### Phase 14: Frontend — Revision Mode UI
**Status**: `completed`
**Directory**: `phases/14-revision-ui/`
**Plans**: 2/2

### Phase 15: Integration, Testing & Polish
**Status**: `completed`
**Directory**: `phases/15-integration-polish/`
**Plans**: 2/2

**Total v1.1 Plans**: 14/14

</details>

### ✅ v1.2 Dynamic Quiz Generation (Shipped 2026-02-17)

**Milestone Goal:** Enhance the quiz system to dynamically determine quiz quantity based on topic complexity, using single quizzes for simple concepts and progressive multi-quiz chains (1-5) for deep, complex topics with difficulty gradients following Bloom's taxonomy.

**Phase Numbering:**
- Integer phases (16, 17, ...): Planned milestone work
- Decimal phases (16.1, 16.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 16: Schema Foundation & Backward Compatibility** - Extend TopicNode with complexity and quiz_count fields, ensuring existing courses still load (completed 2026-02-17)
- [x] **Phase 17: Quizzer Multi-Quiz Generation** - Generate QuizSets with difficulty gradients in a single batch LLM call (completed 2026-02-17)
- [x] **Phase 18: Planner Complexity Assignment** - Prompt engineering for AI-driven complexity rating and quiz count per topic (completed 2026-02-17)
- [x] **Phase 19: Orchestrator Integration & Backend Progression** - Wire Planner→Quizzer→Persistence and verify multi-quiz mastery logic (completed 2026-02-17)
- [x] **Phase 20: Frontend Verification & Polish** - Verify multi-quiz UI, implement onNextQuiz handler, add complexity/difficulty badges (completed 2026-02-17)

## Phase Details

### Phase 16: Schema Foundation & Backward Compatibility
**Goal**: TopicNode schema supports complexity and quiz_count fields without breaking existing courses
**Depends on**: Nothing (v1.2 foundation)
**Requirements**: PLAN-01 (partial — schema enablement), PLAN-02 (partial — schema enablement)
**Success Criteria** (what must be TRUE):
  1. TopicNode has `complexity` field (Basic/Intermediate/Advanced) with default "Intermediate"
  2. TopicNode has `quiz_count` field (1-5) with default 1
  3. Existing courses with no complexity/quiz_count data load without errors
  4. Field validation rejects invalid values (e.g., quiz_count=0, quiz_count=10, complexity="Expert")
**Plans**: 1 plan

Plans:
- [ ] 16-01-PLAN.md — TopicNode schema extension with complexity/quiz_count fields and comprehensive tests

### Phase 17: Quizzer Multi-Quiz Generation
**Goal**: QuizzerAgent can generate a complete QuizSet of N quizzes with ascending difficulty in a single LLM call
**Depends on**: Phase 16 (needs TopicNode schema for quiz_count)
**Requirements**: QUIZ-01, QUIZ-02, QUIZ-03, QUIZ-04
**Success Criteria** (what must be TRUE):
  1. User receives N quizzes (matching quiz_count) when QuizzerAgent is called with quiz_count > 1
  2. User's quizzes follow a difficulty gradient (Easy → Medium → Hard) across the set
  3. User's QuizSet is generated in a single LLM call (not N separate calls)
  4. User's quiz options have valid, unique IDs across the entire QuizSet
  5. User's QuizSet difficulty ordering is validated — no uniform or reversed gradients
**Plans**: 2 plans

Plans:
- [ ] 17-01-PLAN.md — generate_quiz_set() method with difficulty gradient and batch generation
- [ ] 17-02-PLAN.md — QuizSet difficulty validation, option ID fixing, and max_output_tokens config

### Phase 18: Planner Complexity Assignment
**Goal**: PlannerAgent assigns meaningful complexity ratings and quiz counts to each topic in a learning path
**Depends on**: Phase 16 (needs TopicNode complexity/quiz_count fields)
**Requirements**: PLAN-01, PLAN-02, PLAN-03
**Success Criteria** (what must be TRUE):
  1. User receives a learning path where topics have varied complexity ratings (not all the same)
  2. User receives quiz counts that correlate with complexity (simple topics get fewer quizzes)
  3. User's complex topics produce higher-quality, more demanding quizzes than simple topics
  4. User's learning path has a plausible complexity distribution (not all Advanced, not all Basic)
**Plans**: 2 plans

Plans:
- [ ] 18-01-PLAN.md — Planner prompt engineering with complexity assessment and quiz_count mapping
- [ ] 18-02-PLAN.md — Distribution validation function and complexity-to-quiz_count mapping tests

### Phase 19: Orchestrator Integration & Backend Progression
**Goal**: The full backend pipeline generates, stores, and enforces multi-quiz progression end-to-end
**Depends on**: Phase 17 (Quizzer must produce QuizSets), Phase 18 (Planner must assign quiz_count)
**Requirements**: PROG-01, PROG-02, PROG-03, PROG-04
**Success Criteria** (what must be TRUE):
  1. User must pass all quizzes in a set before the next topic unlocks (mastery gate works with real multi-quiz data)
  2. User cannot skip ahead to quiz N+1 without passing quiz N (sequential enforcement)
  3. User can retry only the specific failed quiz without restarting the entire chain
  4. User receives a full QuizSet (not single quiz) when regenerating a node that originally had quiz_count > 1
**Plans**: 2 plans

Plans:
- [ ] 19-01-PLAN.md — Orchestrator wiring: generate_quiz_set() for generate + regenerate paths, validate_complexity_distribution(), test updates
- [ ] 19-02-PLAN.md — Multi-quiz mastery gate, sequential enforcement, retry semantics, and regeneration with QuizSet tests

### Phase 20: Frontend Verification & Polish
**Goal**: Users experience a complete, polished multi-quiz flow with progress indicators and complexity/difficulty badges
**Depends on**: Phase 19 (backend must produce real multi-quiz data)
**Requirements**: UXUI-01, UXUI-02, UXUI-03, UXUI-04
**Success Criteria** (what must be TRUE):
  1. User sees "Quiz X of Y" progress indicator when a topic has multiple quizzes
  2. User can click "Next Quiz" after passing a quiz and advance to the next one in the chain
  3. User sees a complexity badge (Basic/Intermediate/Advanced) on each topic card
  4. User sees a difficulty label (Easy/Medium/Hard) on each quiz within a multi-quiz chain
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md — Backend complexity pipeline (DB schema + server schemas + orchestrator + TypeScript types)
- [ ] 20-02-PLAN.md — Frontend multi-quiz UI (advanceToNextQuiz mutation + component wiring + badges/labels)

<details>
<summary>✅ v1.3 Human Verification & E2E Testing (Phases 21-24) — SHIPPED 2026-03-08</summary>

### Phase 21: E2E Testing — Multi-Quiz Course Generation
**Status**: `completed`
**Directory**: `phases/21-e2e-testing-multi-quiz/`
**Plans**: 1/1

### Phase 22: E2E Testing — Node Regeneration
**Status**: `completed`
**Directory**: `phases/22-e2e-testing-node-regeneration/`
**Plans**: 1/1

### Phase 23: Visual Verification — Complexity & Difficulty Badges
**Status**: `completed`
**Directory**: `phases/23-visual-verification-badges/`
**Plans**: 1/1

### Phase 24: UX Verification — Navigation & Regression
**Status**: `completed`
**Directory**: `phases/24-ux-verification-navigation/`
**Plans**: 1/1

**Total v1.3 Plans**: 4/4

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-8 | v1.0 | 20/20 | Complete | 2025-02-01 |
| 9-15 | v1.1 | 14/14 | Complete | 2025-02-16 |
| 16-20 | v1.2 | 9/9 | Complete | 2026-02-17 |
| 21-24 | v1.3 | 4/4 | Complete | 2026-03-08 |

---

### 🚧 v1.4+ (Planned)

**Milestone Goal:** Future enhancements for the retrieval-based learning feature.

**Potential Features:**

## Future Milestones (v1.4+)

- **Spaced Repetition Automation**: SM-2 algorithm with scheduled review notifications
- **Adaptive Difficulty**: Quizzer adjusts question difficulty based on performance history
- **RAG Integration**: Ground explanations in verified source material
- **Semantic Caching**: Recognize similar queries, serve cached courses
- **Multi-Modal**: Generate diagrams with Imagen 3
- **User Authentication**: Proper user accounts for cross-device sync
