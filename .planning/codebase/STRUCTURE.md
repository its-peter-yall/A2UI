# Codebase Structure

**Analysis Date:** 2026-02-16

## Directory Layout

```
AgUI/
├── client/                    # React 19 + TypeScript frontend
│   ├── src/
│   │   ├── features/          # Feature-based module organization
│   │   │   └── learning/      # Learning system components & hooks
│   │   ├── hooks/             # Shared custom React hooks
│   │   ├── lib/               # Utility libraries (API clients)
│   │   ├── providers/         # React context providers
│   │   ├── types/             # TypeScript type definitions
│   │   ├── App.tsx            # Main router component
│   │   └── main.tsx           # Application entry point
│   ├── vitest.setup.ts        # Test configuration
│   └── vite.config.ts         # Vite build configuration
│
├── server/                    # FastAPI + Python backend
│   ├── agents/                # AI agent implementations
│   ├── database/              # Persistence layer
│   ├── routers/               # FastAPI API route definitions
│   ├── schemas/               # Pydantic v2 data models
│   ├── services/              # Business logic & orchestration
│   ├── utils/                 # Utility modules (AI clients)
│   ├── tests/                 # Unit and integration tests
│   ├── data/                  # SQLite database files
│   ├── main.py                # FastAPI application entry point
│   └── config.py              # Environment configuration
│
├── conductor/                 # Product specifications & guidelines
│   ├── code_styleguides/      # Language-specific style guides
│   ├── product.md             # Product vision and requirements
│   ├── product-guidelines.md  # UI/UX standards
│   ├── tech-stack.md          # Technology specifications
│   └── workflow.md            # Development workflow
│
└── .planning/                 # Planning documents (this directory)
    └── codebase/              # Codebase analysis documents
```

## Directory Purposes

**client/src/features/learning/:**
- Purpose: Learning system UI components and state management
- Contains: React components, custom hooks, animations, tests
- Key files:
  - `LearningPage.tsx` - Active session view with concept cards
  - `LearningHome.tsx` - Dashboard with session list
  - `RevisionPage.tsx` - Revision session interface
  - `ConceptCard.tsx` - Individual concept display component
  - `QuizFeedback.tsx` - Quiz result display
  - `useLearningMutations.ts` - React Query mutations for learning actions
  - `animations/` - Framer Motion animation components

**client/src/lib/:**
- Purpose: API clients and utility libraries
- Contains: Axios instances with interceptors
- Key files:
  - `learningApi.ts` - All learning feature API functions
  - `utils.ts` - Shared utility functions (e.g., `cn()` for Tailwind)

**client/src/types/:**
- Purpose: TypeScript type definitions mirroring backend schemas
- Contains: Interface definitions for API request/response types
- Key files:
  - `learning.ts` - Learning system types (ConceptNode, QuizCard, etc.)

**server/agents/:**
- Purpose: AI agent implementations for content generation
- Contains: Agent classes inheriting from BaseAgent
- Key files:
  - `base.py` - Abstract base class with structured generation
  - `planner.py` - PlannerAgent decomposes queries into CourseOutline
  - `generator.py` - GeneratorAgent creates educational content
  - `quizzer.py` - QuizzerAgent generates quiz questions

**server/database/:**
- Purpose: Data persistence and state management
- Contains: Database managers with CRUD operations
- Key files:
  - `persistence.py` - Shared DB_PATH configuration
  - `learning_persistence.py` - LearningManager for learning data

**server/routers/:**
- Purpose: REST API endpoint definitions
- Contains: FastAPI APIRouter instances with endpoint handlers
- Key files:
  - `learning.py` - All learning system endpoints
  - `__init__.py` - Router exports and registration

**server/schemas/:**
- Purpose: Data validation and serialization contracts
- Contains: Pydantic v2 models
- Key files:
  - `learning.py` - Learning system schemas (CourseOutline, TopicNode, QuizCard, etc.)
  - `common.py` - Shared base classes and mixins

**server/services/:**
- Purpose: Business logic and orchestration
- Contains: Service classes coordinating multiple components
- Key files:
  - `course_orchestrator.py` - Main orchestrator implementing Scatter-Gather
  - `quiz_randomization.py` - Quiz shuffling and option randomization logic

**server/utils/:**
- Purpose: External service integrations and shared utilities
- Contains: Client wrappers for AI services
- Key files:
  - `instructor_client.py` - Instructor library wrapper for Vertex AI
  - `vertex_client.py` - Google Vertex AI SDK initialization

**server/tests/:**
- Purpose: Unit and integration tests
- Contains: Test files for all major components
- Key files:
  - `test_course_orchestrator.py` - Orchestrator integration tests
  - `test_learning_router.py` - API endpoint tests
  - `test_quizzer_agent.py` - QuizzerAgent unit tests
  - `test_learning_persistence.py` - Database layer tests

**conductor/:**
- Purpose: Product specifications and development guidelines
- Contains: Markdown documentation defining standards
- Key files:
  - `product.md` - Product vision and architecture
  - `tech-stack.md` - Technology choices and versions
  - `workflow.md` - Development workflow and quality gates
  - `code_styleguides/typescript.md` - TypeScript/React style guide
  - `code_styleguides/python.md` - Python/FastAPI style guide

## Key File Locations

**Entry Points:**
- `client/src/main.tsx` - Frontend application bootstrap
- `server/main.py` - Backend FastAPI application
- `run.bat` - Convenience script to start both client and server

**Configuration:**
- `client/vite.config.ts` - Vite build and dev server config
- `client/vitest.setup.ts` - Vitest test environment setup
- `server/config.py` - Environment variables and settings
- `server/.env.example` - Template for environment variables

**Core Logic:**
- `server/services/course_orchestrator.py` - Main learning flow orchestration
- `server/agents/base.py` - Agent abstraction and structured generation
- `server/database/learning_persistence.py` - State management and persistence

**Testing:**
- `client/src/**/*.test.tsx` - Co-located component tests
- `server/tests/test_*.py` - Server-side unit/integration tests

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `ConceptCard.tsx`, `LearningPage.tsx`)
- Hooks: `camelCase.ts` starting with `use` (e.g., `useLearningMutations.ts`)
- Utilities: `camelCase.ts` (e.g., `learningApi.ts`, `utils.ts`)
- Tests: Co-located with `*.test.tsx` or `*.test.ts` suffix
- Python modules: `snake_case.py` (e.g., `course_orchestrator.py`)

**Directories:**
- Feature folders: `kebab-case` (e.g., `features/learning/`)
- Utility folders: `camelCase` or `snake_case` (e.g., `lib/`, `providers/`)

**TypeScript/React:**
- Components: `PascalCase` (e.g., `ConceptCard`)
- Hooks: `camelCase` starting with `use` (e.g., `useNodeState`)
- Types/Interfaces: `PascalCase` (e.g., `ConceptNode`, `QuizCard`)
- Constants: `SCREAMING_SNAKE_CASE` or `camelCase` depending on context

**Python:**
- Classes: `PascalCase` (e.g., `CourseOrchestrator`, `BaseAgent`)
- Functions/Variables: `snake_case` (e.g., `generate_course`, `learning_manager`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `MODEL_CONFIGS`, `DB_PATH`)
- Private methods: `_leading_underscore` (e.g., `_build_system_prompt`)

## Where to Add New Code

**New Learning Feature:**
- API endpoints: `server/routers/learning.py`
- Business logic: `server/services/course_orchestrator.py` or new service
- Database operations: `server/database/learning_persistence.py`
- Schemas: `server/schemas/learning.py`
- Frontend components: `client/src/features/learning/`
- API client: `client/src/lib/learningApi.ts`
- Types: `client/src/types/learning.ts`
- Tests: Co-located with implementation or `server/tests/`

**New Component:**
- Implementation: `client/src/features/learning/NewComponent.tsx`
- Tests: `client/src/features/learning/NewComponent.test.tsx`
- Export: `client/src/features/learning/index.ts`

**New Agent:**
- Implementation: `server/agents/new_agent.py`
- Inherit from: `server/agents/base.py::BaseAgent`
- Add to: `server/agents/__init__.py` exports
- Tests: `server/tests/test_new_agent.py`

**New API Endpoint:**
- Add to: `server/routers/learning.py`
- Follow pattern: `@router.post("/path", response_model=..., summary=...)`
- Include: Request/response schemas in `server/schemas/learning.py`

**Utilities:**
- Shared frontend utils: `client/src/lib/utils.ts`
- Backend utils: `server/utils/` (consider if it belongs in existing file or new module)

## Special Directories

**server/data/:**
- Purpose: SQLite database storage
- Contains: `agui.db` (main database), `test_learning.db` (test database)
- Generated: No (created at runtime if missing)
- Committed: No (in `.gitignore`)

**server/.venv/:**
- Purpose: Python virtual environment
- Generated: Yes (created by user)
- Committed: No (in `.gitignore`)

**client/node_modules/:**
- Purpose: npm package dependencies
- Generated: Yes (created by `npm install`)
- Committed: No (in `.gitignore`)

**__pycache__/:**
- Purpose: Python bytecode cache
- Generated: Yes (created at import time)
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-02-16*
