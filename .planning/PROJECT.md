# AgUI

## What This Is

AgUI is an AI-powered adaptive learning platform that transforms complex topics into structured, sequential learning paths with mastery-based progression. Users submit a topic, receive AI-generated courses with explanations and quizzes, and must pass assessments to unlock subsequent content. The platform supports course persistence, progress dashboards, and revision sessions.

## Core Value

Users can learn any topic through AI-generated retrieval-based learning paths with gated progression that reinforces understanding through active recall.

## Requirements

### Validated

- v1.0 Sequential learning paths with AI-generated content and quizzes
- v1.0 Server-side state machine enforcing mastery-based progression
- v1.0 Three-agent pipeline (Planner, Generator, Quizzer) with Scatter-Gather orchestration
- v1.0 Skeleton card fallback for partial failures
- v1.0 Framer Motion animations and gamification
- v1.1 Course persistence with progress tracking dashboard
- v1.1 Resume functionality with last-active-node tracking
- v1.1 Revision sessions (full review and quiz-only modes)
- v1.1 Performance comparison across revision attempts
- v1.1 Session listing with filtering, sorting, and pagination
- v1.1 Course deletion

### Active

- [ ] Dynamic quiz generation based on topic complexity (1-5 quizzes per topic)
- [ ] Planner assigns complexity rating and quiz count per topic
- [ ] Multi-quiz chains with difficulty gradient (Recall -> Application -> Synthesis)
- [ ] Backend progression logic for multi-quiz mastery
- [ ] Quiz shuffling and explanation preservation across QuizSet
- [ ] Frontend QuizSet UI verification

### Out of Scope

- RAG integration for factual grounding — complexity beyond v1.2
- Adaptive difficulty based on performance history — deferred to v1.3+
- Spaced repetition automation (SM-2) — deferred to v1.3+
- Multi-modal content (diagrams, images) — deferred
- User authentication / cross-device sync — deferred
- Social features (sharing, leaderboards) — deferred

## Current Milestone: v1.2 Dynamic Quiz Generation

**Goal:** Enhance the quiz system to dynamically determine quiz quantity based on topic complexity, using single quizzes for simple concepts and progressive multi-quiz chains for deep, complex topics.

**Target features:**
- Complexity-aware quiz counts (1-5 per topic)
- Planner-driven complexity assignment
- Multi-quiz chains with difficulty gradient
- Backend multi-quiz mastery progression
- Quiz security preservation across QuizSet
- Frontend QuizSet verification

## Context

- Frontend `ConceptCard` already contains QuizSet rendering logic ("Quiz X of Y")
- `LearningManager` already supports `QuizSet` storage and `quiz_data` tables
- Scatter-Gather pattern in `CourseOrchestrator` supports variable-weight tasks
- Minimal cost impact: generating 2-3 extra small JSON objects for complex topics is negligible
- Feature spec: `.planning/codebase/features/dynamic-quiz-generation.md`

## Constraints

- **Stack**: Must use existing React 19, FastAPI, Vertex AI, SQLite stack
- **Backward compatibility**: Existing courses with single quizzes must continue working
- **Schema evolution**: Extend existing schemas, don't break existing data
- **Security**: Quiz answer protection (server-side hiding) must work for all quizzes in a set
- **Performance**: Multi-quiz generation should not significantly increase course generation time

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Planner assigns complexity | Centralized intelligence — Planner already analyzes topics | -- Pending |
| Quiz count 1-5 range | Balances depth vs fatigue; >5 quizzes risks user dropout | -- Pending |
| Difficulty gradient pattern | Bloom's taxonomy: Recall -> Application -> Synthesis | -- Pending |
| QuizSet (list of QuizCards) | Reuses existing QuizCard structure; frontend already supports it | -- Pending |

---
*Last updated: 2026-02-17 after milestone v1.2 initialization*
