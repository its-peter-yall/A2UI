# Architecture

**Analysis Date:** 2026-02-16

## Pattern Overview

**Overall:** Multi-Agent Scatter-Gather Architecture with Client-Server Separation

**Key Characteristics:**
- **Pure Chat Application**: Direct LLM interaction without RAG or Graph DB (per product constraints)
- **Agent-Based AI Pipeline**: Three specialized agents (Planner, Generator, Quizzer) orchestrated via Scatter-Gather pattern
- **Client-Server Architecture**: React 19 frontend + FastAPI backend with RESTful API
- **Server-Side State Machine**: Enforced state transitions for learning flow (LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED)
- **Adaptive Learning System**: Personalized content generation with revision sessions

## Layers

**Presentation Layer (Client):**
- Purpose: UI rendering, user interactions, state management via React Query
- Location: `client/src/`
- Contains: React components, custom hooks, API client, animations
- Depends on: Backend REST API, TanStack Query for server state
- Used by: End users via browser

**API Layer (Server):**
- Purpose: REST endpoint definitions, request/response validation, HTTP handling
- Location: `server/routers/`
- Contains: FastAPI `APIRouter` instances with endpoint definitions
- Depends on: Services layer, Schema layer
- Used by: Client applications, External integrations

**Service Layer (Server):**
- Purpose: Business logic orchestration, agent coordination, transaction management
- Location: `server/services/`
- Contains: `CourseOrchestrator` implementing Scatter-Gather pattern
- Depends on: Agent layer, Persistence layer
- Used by: API routers

**Agent Layer (Server):**
- Purpose: AI-powered content generation using specialized LLM agents
- Location: `server/agents/`
- Contains: `BaseAgent` (abstract), `PlannerAgent`, `GeneratorAgent`, `QuizzerAgent`
- Depends on: Utils layer (InstructorClient), Schemas layer
- Used by: Service layer (CourseOrchestrator)

**Persistence Layer (Server):**
- Purpose: Data storage, retrieval, and state management
- Location: `server/database/`
- Contains: `LearningManager` for learning data, `SessionManager` for chat data
- Depends on: SQLite database
- Used by: Service layer, API routers

**Schema Layer (Shared):**
- Purpose: Data validation and serialization contracts
- Location: `server/schemas/`
- Contains: Pydantic v2 models (CourseOutline, TopicNode, QuizCard, etc.)
- Depends on: Pydantic library
- Used by: All server layers

**Utility Layer (Server):**
- Purpose: External service integrations and shared utilities
- Location: `server/utils/`
- Contains: `InstructorClient` (OpenRouter wrapper)
- Depends on: Google Cloud SDK, Instructor library
- Used by: Agent layer, Main application

## Data Flow

**Course Generation Flow:**

1. **Client Request**: POST `/learning/generate` with topic query
2. **API Router**: Validates request, calls `course_orchestrator.generate_course()`
3. **Planner Agent (Serial)**: Decomposes query into `CourseOutline` with 5-7 `TopicNode`s
4. **Session Creation**: Creates learning session in SQLite database
5. **Context Building**: Builds prev/next summaries for narrative coherence
6. **Scatter Phase**: Creates async tasks for each topic's `_generate_concept_unit()`
7. **Parallel Generation**: 
   - Generator Agent creates educational content (300-500 words, 5E model)
   - Quizzer Agent generates quiz with 4 options
8. **Gather Phase**: Collects results with `return_exceptions=True` for partial failure handling
9. **Persistence**: Saves concept nodes with appropriate initial status
10. **Response**: Returns session with all nodes to client

**Quiz Submission Flow:**

1. **Client Request**: POST `/learning/nodes/{id}/submit-quiz` with `selected_option_id` (stable UUID)
2. **API Router**: Validates request, retrieves current node state
3. **Answer Evaluation**: Compares submitted `option_id` against stored correct answer
4. **Attempt Recording**: Saves quiz attempt with score in `quiz_attempts` table
5. **Mastery Check**: If 100% score, transitions node to `SHOWING_FEEDBACK`
6. **Progression**: If mastered and next node exists, unlocks it (`LOCKED` → `VIEWING_EXPLANATION`)
7. **Response**: Returns attempt result with `is_correct`, `explanation`, `is_mastered`, `next_node_unlocked`

**State Management:**

- **Server-Side State Machine**: Enforced via `LearningManager.update_node_status()` with valid transition checks
- **Client-Side Cache**: TanStack Query with 5-minute stale time for GET requests
- **Optimistic Updates**: Client updates UI immediately, rolls back on API error
- **Session Recovery**: `last_active_node_id` enables resuming interrupted sessions

## Key Abstractions

**CourseOrchestrator:**
- Purpose: Coordinates multi-agent pipeline with Scatter-Gather pattern
- Location: `server/services/course_orchestrator.py`
- Pattern: Scatter-Gather (serial planning → parallel generation → result aggregation)
- Responsibilities: 
  - Agent coordination
  - Parallel execution with `asyncio.gather()`
  - Partial failure handling via SkeletonCards
  - Performance metrics logging

**BaseAgent:**
- Purpose: Abstract base providing structured LLM generation capability
- Location: `server/agents/base.py`
- Pattern: Template Method (abstract `system_prompt`, concrete `generate()`)
- Responsibilities:
  - System prompt building with context injection
  - Retry logic (2 attempts with exponential backoff)
  - Pydantic validation via InstructorClient

**LearningManager:**
- Purpose: SQLite persistence with enforced state transitions
- Location: `server/database/learning_persistence.py`
- Pattern: Repository pattern with state machine enforcement
- Responsibilities:
  - CRUD operations for sessions, nodes, quizzes, attempts
  - State transition validation
  - Quiz set management with shuffle seeds
  - Revision session tracking

**InstructorClient:**
- Purpose: Structured output generation with OpenRouter models
- Location: `server/utils/instructor_client.py`
- Pattern: Singleton with role-based configuration
- Responsibilities:
  - Role-specific model selection (planner=Pro, others=Flash)
  - Pydantic response validation
  - Retry logic with tenacity (3 attempts, 2-10s backoff)

## Entry Points

**Backend Entry Point:**
- Location: `server/main.py`
- Triggers: Uvicorn server startup (`python -m uvicorn server.main:app --reload`)
- Responsibilities:
  - FastAPI app initialization with CORS
  - Lifespan context manager for startup/shutdown
  - Database initialization (`learning_manager.init_learning_tables()`)
  - OpenRouter client initialization
  - InstructorClient initialization
  - Router registration (`app.include_router(learning_router)`)

**Frontend Entry Point:**
- Location: `client/src/main.tsx`
- Triggers: Vite dev server or production build
- Responsibilities:
  - React root mounting
  - QueryProvider wrapping for TanStack Query
  - StrictMode enabling
  - App component rendering

**Client Routes:**
- `/` and `/learn`: LearningHome (dashboard with session list)
- `/learn/:sessionId`: LearningPage (active learning session)
- `/learn/:sessionId/revise/:revisionId`: RevisionPage (revision session)

**API Routes (Learning System):**
- `POST /learning/generate`: Create new course
- `GET /learning/sessions`: List sessions with filtering/pagination
- `GET /learning/sessions/{id}`: Get session with nodes
- `GET /learning/sessions/{id}/progress`: Get progress summary
- `GET /learning/nodes/{id}`: Get node with visibility flags
- `POST /learning/nodes/{id}/transition`: Change node state
- `POST /learning/nodes/{id}/submit-quiz`: Submit quiz answer
- `POST /learning/nodes/{id}/retry-quiz`: Retry quiz after failure
- `POST /learning/nodes/{id}/regenerate`: Regenerate failed content

## Error Handling

**Strategy:** Layer-specific error handling with transformation at API boundaries

**Patterns:**
- **Agent Layer**: ValidationError → retry (max 2 attempts) → re-raise; other exceptions → log and re-raise
- **Service Layer**: Catch exceptions → create SkeletonCard with error_message → continue processing other nodes
- **Persistence Layer**: sqlite3.Error → log and raise; ValueError (invalid transition) → raise for API handling
- **API Layer**: try/except → log → `HTTPException` with appropriate status codes (400, 404, 422, 500)
- **Client Layer**: Axios interceptors log errors; React Query handles retry and cache invalidation

## Cross-Cutting Concerns

**Logging:**
- Framework: Python standard `logging` module
- Pattern: Module-level `logger = logging.getLogger(__name__)`
- Usage: Structured logging with `extra` dict for metrics (session_id, timing, counts)
- Levels: INFO for operations, DEBUG for details, WARNING for skips, ERROR for failures

**Validation:**
- Framework: Pydantic v2 for all data models
- Pattern: `field_validator` for complex constraints (e.g., exactly 4 quiz options, exactly 1 correct)
- Location: Schema definitions enforce invariants at serialization boundaries

**Security:**
- Quiz Answer Protection: Server hides `is_correct` and `explanation` in `IN_QUIZ` state via `QuizCardHidden` schema
- Stable Identifiers: UUID-based `option_id` used for submissions, display_label (A-D) only for UI
- Shuffle Seeds: Deterministic randomization with per-node seeds stored server-side

---

*Architecture analysis: 2026-02-16*
