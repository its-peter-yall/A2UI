# Codebase Structure

**Analysis Date:** 2026-05-27

## Directory Layout

```
AgUI/
├── client/                          # Vite + React 19 + TypeScript frontend
│   ├── src/
│   │   ├── components/              # Shared UI components
│   │   ├── features/                # Feature-sliced modules
│   │   │   ├── learning/            # Adaptive learning feature (primary)
│   │   │   └── settings/            # Provider configuration feature
│   │   ├── hooks/                   # Shared custom hooks
│   │   ├── lib/                     # API clients and utilities
│   │   ├── providers/               # React context providers
│   │   ├── types/                   # TypeScript type definitions
│   │   ├── App.tsx                  # Router and route definitions
│   │   ├── main.tsx                 # React entry point and bootstrap
│   │   └── index.css                # Tailwind CSS entry point
│   ├── public/                      # Static assets
│   ├── package.json                 # Dependencies and scripts
│   ├── vite.config.ts               # Vite + Vitest configuration
│   ├── tailwind.config.js           # Tailwind CSS configuration
│   ├── tsconfig.json                # TypeScript config (project references)
│   ├── tsconfig.app.json            # App TypeScript config (strict mode)
│   ├── eslint.config.js             # ESLint configuration
│   └── vitest.setup.ts              # Vitest global setup (jest-dom)
├── server/                          # FastAPI + Pydantic v2 backend
│   ├── agents/                      # AI agent pipeline
│   ├── database/                    # SQLite persistence layer
│   ├── routers/                     # FastAPI APIRouter modules
│   ├── schemas/                     # Pydantic v2 domain models
│   ├── services/                    # Business logic orchestration
│   ├── tests/                       # Python unit tests (unittest)
│   ├── utils/                       # Shared utilities (Instructor client)
│   ├── main.py                      # FastAPI app entry point
│   ├── config.py                    # Environment configuration
│   └── requirements.txt             # Python dependencies
├── conductor/                       # Product guidelines and UI/UX standards
├── .planning/                       # Project planning and documentation
│   └── codebase/                    # Codebase analysis documents
├── research/                        # Research notes and references
├── plans/                           # Implementation plans
├── AGENTS.md                        # Agent coding guidelines
└── README.md                        # Project overview
```

## Directory Purposes

**`client/src/components/`:**
- Purpose: Shared UI components used across features
- Contains: Reusable presentational components
- Key files: `SettingsButton.tsx`, `ThemeToggle.tsx`

**`client/src/features/learning/`:**
- Purpose: Adaptive learning feature — the primary application feature
- Contains: Page components, cards, hooks, animations, tests, barrel exports
- Key files: `LearningHome.tsx`, `LearningPage.tsx`, `LearningPathContainer.tsx`, `ConceptCard.tsx`, `RevisionPage.tsx`, `index.ts` (barrel)

**`client/src/features/settings/`:**
- Purpose: AI provider configuration (API keys, model selection, thinking mode)
- Contains: Settings page, model picker, provider panel, thinking toggle
- Key files: `SettingsPage.tsx`, `ModelPicker.tsx`, `OpenRouterSettingsPanel.tsx`, `ThinkingModeToggle.tsx`

**`client/src/hooks/`:**
- Purpose: Shared custom React hooks
- Contains: Reusable stateful logic
- Key files: `useTypewriter.ts`, `useTheme.ts`

**`client/src/lib/`:**
- Purpose: API clients, utilities, and provider configuration
- Contains: Axios instances, API functions, localStorage helpers
- Key files: `learningApi.ts`, `providerApi.ts`, `providerSettings.ts`, `utils.ts`

**`client/src/providers/`:**
- Purpose: React context providers for app-wide state
- Contains: Query client, theme management
- Key files: `QueryProvider.tsx`, `ThemeProvider.tsx`, `theme-context.tsx`

**`client/src/types/`:**
- Purpose: TypeScript type definitions mirroring backend schemas
- Contains: Interface definitions for API contracts
- Key files: `learning.ts`, `openrouter.ts`, `provider.ts`

**`server/agents/`:**
- Purpose: AI agent pipeline for content generation
- Contains: Base agent class and three specialized agents
- Key files: `base.py`, `planner.py`, `generator.py`, `quizzer.py`

**`server/database/`:**
- Purpose: SQLite persistence layer
- Contains: Database path config and LearningManager
- Key files: `persistence.py` (DB_PATH), `learning_persistence.py` (all CRUD)

**`server/routers/`:**
- Purpose: FastAPI REST API endpoint definitions
- Contains: APIRouter modules with request/response handling
- Key files: `learning.py` (learning endpoints), `llm.py` (model proxy)

**`server/schemas/`:**
- Purpose: Pydantic v2 data contracts
- Contains: Domain models, request/response schemas, LLM output schemas
- Key files: `common.py` (base classes), `learning.py` (learning domain), `llm.py` (LLM context)

**`server/services/`:**
- Purpose: Business logic orchestration
- Contains: Course generation orchestration, quiz randomization
- Key files: `course_orchestrator.py`, `quiz_randomization.py`

**`server/utils/`:**
- Purpose: Shared utility modules
- Contains: Instructor client wrapper for structured LLM output
- Key files: `instructor_client.py`

**`server/tests/`:**
- Purpose: Python unit tests using stdlib unittest
- Contains: Test modules for agents, routers, services, persistence
- Key files: `test_planner_agent.py`, `test_learning_router.py`, `test_course_orchestrator.py`, etc.

**`conductor/`:**
- Purpose: Product guidelines and UI/UX standards
- Contains: Visual identity, component standards, workflow docs
- Key files: `product-guidelines.md`, `tech-stack.md`, `workflow.md`

## Key File Locations

**Entry Points:**
- `client/src/main.tsx`: React app bootstrap (ThemeProvider → QueryProvider → App)
- `client/src/App.tsx`: Route definitions (`/`, `/learn`, `/learn/:sessionId`, `/learn/:sessionId/revise/:revisionId`, `/settings`)
- `server/main.py`: FastAPI app creation, CORS, lifespan, router registration
- `server/routers/__init__.py`: Router aggregation and re-export

**Configuration:**
- `client/vite.config.ts`: Vite plugins (React, Tailwind), path aliases (`@/`), Vitest config
- `client/tsconfig.app.json`: TypeScript strict mode, path aliases
- `client/tailwind.config.js`: Tailwind CSS theme configuration
- `client/vitest.setup.ts`: Global test setup (jest-dom matchers)
- `server/config.py`: Environment variables (OpenRouter/GeneralCompute base URLs, timeouts)
- `server/.env.example`: Example environment configuration

**Core Logic:**
- `server/services/course_orchestrator.py`: Scatter-Gather course generation pipeline
- `server/agents/planner.py`: KLI-framework curriculum decomposition
- `server/agents/generator.py`: 5E-model content generation
- `server/agents/quizzer.py`: Retrieval-based quiz generation
- `server/database/learning_persistence.py`: All SQLite CRUD operations
- `server/services/quiz_randomization.py`: Deterministic quiz shuffling

**API Layer:**
- `server/routers/learning.py`: Learning REST endpoints (generate, sessions, nodes, quizzes, revisions)
- `server/routers/llm.py`: Model catalog proxy endpoint
- `server/schemas/learning.py`: All learning domain Pydantic models
- `server/schemas/llm.py`: LLMContext, ModelResponse, AIProviderEnum

**Client API:**
- `client/src/lib/learningApi.ts`: Typed Axios functions for all learning endpoints
- `client/src/lib/providerApi.ts`: Model catalog fetch, provider header builder
- `client/src/lib/providerSettings.ts`: localStorage-based provider config management

**Testing:**
- `server/tests/`: Python unittest modules (15 test files)
- `client/src/features/learning/*.test.tsx`: Co-located Vitest tests for learning components
- `client/src/features/learning/__tests__/`: E2E-style integration tests
- `client/src/features/settings/*.test.tsx`: Settings component tests
- `client/src/lib/*.test.ts`: API client and utility tests

## Naming Conventions

**Files:**
- TypeScript components: `PascalCase.tsx` (e.g., `LearningPage.tsx`, `ConceptCard.tsx`)
- TypeScript hooks: `camelCase.ts` with `use` prefix (e.g., `useNodeState.ts`, `useLearningMutations.ts`)
- TypeScript utilities: `camelCase.ts` (e.g., `learningApi.ts`, `providerSettings.ts`)
- TypeScript types: `camelCase.ts` (e.g., `learning.ts`, `provider.ts`)
- Python modules: `snake_case.py` (e.g., `course_orchestrator.py`, `learning_persistence.py`)
- Python tests: `test_snake_case.py` (e.g., `test_planner_agent.py`)

**Directories:**
- Client features: `camelCase` (e.g., `learning/`, `settings/`)
- Server modules: `snake_case` (e.g., `agents/`, `database/`, `routers/`)
- Test directories: `__tests__/` for co-located integration tests, `tests/` for server unit tests

**Components:**
- React components: `PascalCase` named exports (e.g., `export function LearningPage()`)
- No default exports (mandatory per conventions)
- Barrel exports via `index.ts` in feature directories

**Functions/Variables:**
- TypeScript: `camelCase` (e.g., `generateCourse`, `getLearningSession`)
- Python: `snake_case` (e.g., `generate_course`, `create_learning_session`)

**Types/Classes:**
- TypeScript interfaces: `PascalCase` (e.g., `LearningSessionWithNodes`, `ConceptNode`)
- Python classes: `PascalCase` (e.g., `CourseOrchestrator`, `PlannerAgent`)
- Python enums: `PascalCase` with UPPER_CASE values (e.g., `NodeStatus.LOCKED`)

## Where to Add New Code

**New Learning Feature Component:**
- Implementation: `client/src/features/learning/NewComponent.tsx`
- Tests: `client/src/features/learning/NewComponent.test.tsx`
- Export: Add to `client/src/features/learning/index.ts` barrel

**New API Endpoint:**
- Router: `server/routers/learning.py` (add endpoint function)
- Schema: `server/schemas/learning.py` (add request/response models)
- Service: `server/services/` (if business logic is complex)
- Tests: `server/tests/test_learning_router.py`

**New AI Agent:**
- Agent: `server/agents/new_agent.py` (extend `BaseAgent`)
- Export: `server/agents/__init__.py`
- Config: Add role to `MODEL_CONFIGS` in `server/utils/instructor_client.py`
- Tests: `server/tests/test_new_agent.py`

**New Database Table:**
- Schema: `server/database/learning_persistence.py` (add CREATE TABLE in `init_learning_tables()`)
- Migration: Add `_ensure_*_columns()` method for schema evolution
- CRUD: Add methods to `LearningManager` class

**New Client Hook:**
- Hook: `client/src/hooks/useNewHook.ts` (shared) or `client/src/features/learning/useNewHook.ts` (feature-scoped)
- Tests: Co-located `useNewHook.test.ts`

**New Client Utility:**
- Shared: `client/src/lib/newUtility.ts`
- Feature-scoped: `client/src/features/learning/newUtility.ts`
- Tests: Co-located `newUtility.test.ts`

**New Settings Feature:**
- Component: `client/src/features/settings/NewSetting.tsx`
- Tests: `client/src/features/settings/NewSetting.test.tsx`

## Special Directories

**`client/node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (`npm install`)
- Committed: No (in `.gitignore`)

**`server/.venv/`:**
- Purpose: Python virtual environment
- Generated: Yes (`python -m venv .venv`)
- Committed: No (in `.gitignore`)

**`server/data/`:**
- Purpose: SQLite database files
- Generated: Yes (created at runtime)
- Committed: No (in `.gitignore`)

**`client/dist/`:**
- Purpose: Vite production build output
- Generated: Yes (`npm run build`)
- Committed: No (in `.gitignore`)

**`.planning/`:**
- Purpose: Project planning, roadmaps, and codebase documentation
- Generated: No (manually maintained)
- Committed: Yes

**`conductor/`:**
- Purpose: Product guidelines, UI/UX standards, workflow documentation
- Generated: No (manually maintained)
- Committed: Yes

**`client/src/features/learning/__tests__/`:**
- Purpose: E2E-style integration tests for learning feature
- Generated: No
- Committed: Yes

**`server/tests/`:**
- Purpose: Python unit tests using stdlib unittest
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-27*
