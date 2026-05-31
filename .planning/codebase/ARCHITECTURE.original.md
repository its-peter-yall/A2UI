<!-- refreshed: 2026-05-27 -->
# Architecture

**Analysis Date:** 2026-05-27

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (React SPA)                           │
│  Vite + React 19 + TypeScript + Tailwind CSS 4.x + React Router 7   │
├───────────────┬────────────────────┬────────────────────────────────┤
│  Learning     │  Settings          │  Shared Providers              │
│  Feature      │  Feature           │  (QueryProvider, ThemeProvider)│
│  `client/src/ │  `client/src/      │  `client/src/providers/`       │
│  features/    │  features/         │                                │
│  learning/`   │  settings/`        │                                │
└───────┬───────┴─────────┬──────────┴───────────────┬────────────────┘
        │                 │                           │
        ▼                 ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API Layer (`client/src/lib/`)                   │
│  learningApi.ts ─── providerApi.ts ─── providerSettings.ts          │
│  (Axios instances with provider-header interceptors)                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP (REST)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (`server/`)                        │
│  main.py (CORS, lifespan, router registration)                      │
├──────────────────┬──────────────────────┬───────────────────────────┤
│  Routers         │  Services            │  Agents                   │
│  `server/routers/│  `server/services/`  │  `server/agents/`         │
│  learning.py`    │  course_orchestrator │  base.py (ABC)            │
│  llm.py`         │  .py`               │  planner.py (KLI)         │
│                  │  quiz_randomization  │  generator.py (5E)        │
│                  │  .py`               │  quizzer.py (Retrieval)    │
├──────────────────┴──────────────────────┴───────────────────────────┤
│  Schemas (`server/schemas/`)                                        │
│  common.py (ResponseBase, TimestampMixin)                           │
│  learning.py (NodeStatus, QuizCard, QuizSet, CourseOutline, etc.)   │
│  llm.py (LLMContext, ModelResponse, AIProviderEnum)                 │
├─────────────────────────────────────────────────────────────────────┤
│  Utils (`server/utils/`)                                            │
│  instructor_client.py ─── Instructor + OpenAI SDK ─── tenacity      │
├─────────────────────────────────────────────────────────────────────┤
│  Database (`server/database/`)                                      │
│  persistence.py (DB_PATH)                                           │
│  learning_persistence.py (LearningManager — SQLite via sqlite3)     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  External Services                                                  │
│  ┌────────────────┐  ┌──────────────────────────────────────────┐   │
│  │  OpenRouter     │  │  General Compute                         │   │
│  │  (LLM Provider) │  │  (Alternative LLM Provider)              │   │
│  └────────────────┘  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **FastAPI App** | CORS, lifespan, router mounting, health checks | `server/main.py` |
| **Learning Router** | REST endpoints for sessions, nodes, quizzes, revisions | `server/routers/learning.py` |
| **LLM Router** | Model catalog proxy, provider authentication | `server/routers/llm.py` |
| **CourseOrchestrator** | Scatter-Gather parallel content generation | `server/services/course_orchestrator.py` |
| **QuizRandomization** | Deterministic quiz/option shuffling with seeds | `server/services/quiz_randomization.py` |
| **PlannerAgent** | KLI-framework curriculum decomposition (min 5 topics) | `server/agents/planner.py` |
| **GeneratorAgent** | 5E-model educational content generation | `server/agents/generator.py` |
| **QuizzerAgent** | Retrieval-based diagnostic quiz generation | `server/agents/quizzer.py` |
| **BaseAgent** | Abstract base with Instructor integration, retry logic | `server/agents/base.py` |
| **InstructorClient** | Structured LLM output via Instructor + OpenAI SDK | `server/utils/instructor_client.py` |
| **LearningManager** | SQLite persistence for sessions, nodes, quizzes, revisions | `server/database/learning_persistence.py` |
| **LearningHome** | Dashboard with topic input, course listing, filters | `client/src/features/learning/LearningHome.tsx` |
| **LearningPage** | Session page with progress, completion modal | `client/src/features/learning/LearningPage.tsx` |
| **LearningPathContainer** | Carousel orchestrator, session/mutation coordination | `client/src/features/learning/LearningPathContainer.tsx` |
| **ConceptCard** | Individual concept node display with state machine | `client/src/features/learning/ConceptCard.tsx` |
| **RevisionPage** | Revision session interface | `client/src/features/learning/RevisionPage.tsx` |
| **SettingsPage** | Provider configuration (API keys, models, thinking) | `client/src/features/settings/SettingsPage.tsx` |
| **QueryProvider** | React Query client with 5-min stale time | `client/src/providers/QueryProvider.tsx` |
| **ThemeProvider** | Light/dark theme with localStorage persistence | `client/src/providers/ThemeProvider.tsx` |

## Pattern Overview

**Overall:** Feature-based modular monolith with agent pipeline backend

**Key Characteristics:**
- **Client:** Feature-sliced architecture with co-located tests, hooks, and barrel exports
- **Server:** Router → Service → Agent layered architecture with Pydantic validation
- **AI Pipeline:** Scatter-Gather pattern — serial planning, parallel content generation
- **State Machine:** Server-authoritative node lifecycle (LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED)
- **Auth:** Client-side API key management via localStorage; passed per-request in headers
- **Data:** SQLite with direct sqlite3 access (no ORM); Pydantic v2 for all validation

## Layers

**Presentation Layer (Client):**
- Purpose: React SPA with routing, data fetching, and UI components
- Location: `client/src/`
- Contains: Components, hooks, providers, types, API clients
- Depends on: FastAPI backend via REST API
- Used by: End users via browser

**API Layer (Routers):**
- Purpose: HTTP endpoint definitions with request validation and response models
- Location: `server/routers/`
- Contains: FastAPI APIRouter modules (learning, llm)
- Depends on: Services, Database, Schemas
- Used by: Client via Axios HTTP calls

**Service Layer:**
- Purpose: Business logic orchestration and domain services
- Location: `server/services/`
- Contains: CourseOrchestrator (Scatter-Gather), QuizRandomization
- Depends on: Agents, Database, Schemas
- Used by: Routers

**Agent Layer:**
- Purpose: AI-powered content generation with structured output
- Location: `server/agents/`
- Contains: PlannerAgent, GeneratorAgent, QuizzerAgent (all extend BaseAgent)
- Depends on: InstructorClient, Schemas (LLMContext, TopicNode)
- Used by: CourseOrchestrator

**Schema Layer:**
- Purpose: Pydantic v2 data contracts for validation and serialization
- Location: `server/schemas/`
- Contains: Domain models, request/response schemas, LLM output schemas
- Depends on: pydantic
- Used by: All server layers

**Persistence Layer:**
- Purpose: SQLite database operations for learning data
- Location: `server/database/`
- Contains: LearningManager (sessions, nodes, quizzes, revisions)
- Depends on: sqlite3, Schemas
- Used by: Routers, Services

## Data Flow

### Course Generation (Primary Flow)

1. **User enters topic** → `LearningHome.tsx` TopicInput submits query
2. **Client sends POST** → `learningApi.ts` → `POST /learning/generate` (5-min timeout)
3. **Router validates** → `server/routers/learning.py:generate_course()` extracts `LLMContext` from headers
4. **Orchestrator plans** → `course_orchestrator.py:generate_course()` calls `planner_agent.plan(query)`
5. **PlannerAgent generates** → `server/agents/planner.py` → InstructorClient → OpenRouter API → returns `CourseOutline` (min 5 topics)
6. **DB creates session** → `learning_manager.create_learning_session()` in `server/database/learning_persistence.py`
7. **Scatter phase** → `asyncio.gather()` launches parallel `_generate_concept_unit()` for each topic
8. **Per-topic generation** → GeneratorAgent creates content → QuizzerAgent creates quiz set → `learning_manager.create_concept_node()`
9. **Gather phase** → Results collected; failures become SkeletonCards (ERROR status with retry)
10. **Response** → `LearningSessionWithNodes` returned to client with all nodes
11. **Client renders** → `LearningPathContainer.tsx` displays carousel of `ConceptCard` components

### Quiz Submission Flow

1. **User selects answer** → `ConceptCard.tsx` calls `submitQuiz(nodeId, optionId, quizIndex)`
2. **Client sends POST** → `learningApi.ts` → `POST /learning/nodes/{nodeId}/submit-quiz`
3. **Router evaluates** → `learning.py:submit_quiz()` → `learning_manager.create_quiz_attempt()`
4. **Mastery check** → If correct and not mastered, advances `current_index` in quiz set
5. **State transition** → Node moves to `SHOWING_FEEDBACK`; if mastered, unlocks next node
6. **Client updates** → React Query cache invalidated; `ConceptCard` shows feedback
7. **Next action** → User either retries (incorrect) or advances to next node (mastered)

### Node State Machine

```text
LOCKED ──→ VIEWING_EXPLANATION ──→ IN_QUIZ ──→ SHOWING_FEEDBACK ──→ COMPLETED
                │                       ↑              │
                ▼                       │              │
              ERROR ──(retry)──→ VIEWING_EXPLANATION   │
                                   ↑                   │
                                   └─── (retry quiz) ──┘
```

- **LOCKED**: Previous node not completed; content hidden
- **VIEWING_EXPLANATION**: Reading content; quiz hidden
- **IN_QUIZ**: Taking quiz; explanation hidden (prevents answer leakage)
- **SHOWING_FEEDBACK**: Results and explanations visible
- **COMPLETED**: 100% mastery achieved; can review
- **ERROR**: Generation failed; retry available

**State Management:**
- **Server-authoritative**: All state transitions validated server-side in `learning_persistence.py`
- **Client optimistic updates**: `optimisticUpdates.ts` provides rollback functions for failed mutations
- **React Query cache**: 5-minute stale time; manual invalidation on mutations
- **Last-active tracking**: `PATCH /learning/sessions/{id}/last-active` persists resume position

## Key Abstractions

**BaseAgent (Abstract Base Class):**
- Purpose: Common interface for all AI agents with structured output generation
- Examples: `server/agents/base.py`, `server/agents/planner.py`, `server/agents/generator.py`, `server/agents/quizzer.py`
- Pattern: Template Method — subclasses define `system_prompt`; base handles generation, retry, context formatting

**InstructorClient (Singleton):**
- Purpose: Wraps Instructor library for Pydantic-validated LLM responses
- Examples: `server/utils/instructor_client.py`
- Pattern: Strategy — role-based model config (`MODEL_CONFIGS` dict) selects model, temperature, max_tokens per agent role

**LearningManager (Singleton):**
- Purpose: All SQLite operations for learning domain
- Examples: `server/database/learning_persistence.py`
- Pattern: Repository — direct SQL with `sqlite3.Row` factory; no ORM

**CourseOrchestrator (Singleton):**
- Purpose: Coordinates the 3-agent pipeline with parallel execution
- Examples: `server/services/course_orchestrator.py`
- Pattern: Scatter-Gather — serial planning → parallel content generation → gather with partial failure handling

**LLMContext (Request-scoped):**
- Purpose: Carries API key, provider, model override, thinking config per request
- Examples: `server/schemas/llm.py`, `server/routers/learning.py`
- Pattern: Dependency Injection via FastAPI `Depends(get_llm_context)`

**QuizSet / QuizCard (Domain Models):**
- Purpose: Multi-quiz containers with secure randomization
- Examples: `server/schemas/learning.py`
- Pattern: Dual-schema — `LLMQuizCard` (no option_id) for AI output; `QuizCard` (with UUID option_id) for storage/client

## Entry Points

**Server Entry:**
- Location: `server/main.py`
- Triggers: `python -m uvicorn server.main:app --reload --port 8000`
- Responsibilities: App creation, CORS, lifespan (DB init), router registration, file watcher for auto-reload

**Client Entry:**
- Location: `client/src/main.tsx`
- Triggers: Vite dev server (`npm run dev`) or production build
- Responsibilities: React root creation, provider wrapping (ThemeProvider → QueryProvider → App)

**Router Entry:**
- Location: `server/routers/__init__.py`
- Triggers: Imported by `server/main.py`
- Responsibilities: Re-exports `learning_router` and `llm_router`

## Architectural Constraints

- **Threading:** Async event loop (FastAPI + asyncio). Parallel content generation via `asyncio.gather()`. SQLite accessed synchronously in thread-pool-compatible blocking calls.
- **Global state:** Singletons for `instructor_client`, `learning_manager`, `course_orchestrator`, `planner_agent`, `generator_agent`, `quizzer_agent`. All immutable after init.
- **Circular imports:** None detected. Clean dependency flow: `routers → services → agents → utils` and `routers → database`.
- **API key security:** Keys never stored server-side. Client sends keys in request headers per-call. Server extracts via `Depends(get_llm_context)`.
- **SQLite limitations:** Single-writer database. No connection pooling. Adequate for single-user/low-concurrency scenarios. `PRAGMA foreign_keys=ON` enforced per connection.

## Anti-Patterns

### Direct DB Access in Routers

**What happens:** Some router endpoints call `learning_manager._get_connection()` and `_get_node_by_id()` directly, bypassing the service layer.
**Why it's wrong:** Mixes HTTP concerns with data access; makes testing harder; inconsistent layering.
**Do this instead:** Route through service methods or add dedicated `get_node_by_id()` public method to `LearningManager`. See `server/routers/learning.py:718-722` and `server/routers/learning.py:817-826`.

### LLM Output vs Storage Schema Duality

**What happens:** Two parallel schema hierarchies exist — `LLMQuizCard` (no option_id) and `QuizCard` (with UUID option_id) — requiring conversion functions.
**Why it's wrong:** Adds complexity and maintenance burden; conversion functions (`convert_llm_to_quiz_card`, etc.) are error-prone.
**Do this instead:** This is a deliberate design choice (LLMs shouldn't generate UUIDs). Document the boundary clearly. Conversion functions live in `server/schemas/learning.py:415-490`.

## Error Handling

**Strategy:** Layered error handling with HTTP status codes and structured responses

**Server Patterns:**
- Routers: `try/except` → log → `HTTPException` with appropriate status code
- Re-raise `HTTPException` untouched; wrap only unexpected exceptions as 500
- Agents: Retry via tenacity (3 attempts, exponential backoff) for transient failures
- Orchestrator: Partial failure handling — failed topics become SkeletonCards with ERROR status

**Client Patterns:**
- Axios interceptors log errors and re-throw
- React Query `retry: 1` for automatic single retry
- `useErrorToast` hook for transient error display
- `LearningErrorBoundary` for component-level error recovery
- `ErrorStates.tsx` provides `ErrorState`, `NotFoundState`, `EmptyState`, `LoadingState`, `GeneratingState`

## Cross-Cutting Concerns

**Logging:** Python `logging` module; `logger = logging.getLogger(__name__)` per module. Structured `extra` dict for performance metrics.

**Validation:** Pydantic v2 on server (Field constraints, field_validator). TypeScript strict mode on client. `@tailwindcss/typography` for Markdown rendering.

**Authentication:** No user auth system. API keys managed client-side in localStorage (`providerSettings.ts`). Sent per-request in `X-OpenRouter-Key` / `X-GeneralCompute-Key` headers.

**Theming:** CSS custom properties via `ThemeProvider.tsx` with light/dark/system modes. Persisted in localStorage under `agui-theme` key.

---

*Architecture analysis: 2026-05-27*
