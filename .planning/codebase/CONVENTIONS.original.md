# Coding Conventions

**Analysis Date:** 2026-05-27

## Naming Patterns

**Files (TypeScript/React):**
- Components: `UpperCamelCase.tsx` (e.g., `ConceptCard.tsx`, `LearningPage.tsx`, `QueryProvider.tsx`)
- Hooks: `camelCase.ts` prefixed with `use` (e.g., `useTypewriter.ts`, `useNodeState.ts`, `useLearningMutations.ts`)
- Utilities/Libraries: `camelCase.ts` (e.g., `learningApi.ts`, `providerSettings.ts`, `utils.ts`)
- Types: `camelCase.ts` (e.g., `learning.ts`, `provider.ts`, `openrouter.ts`)
- Tests: `*.test.ts` or `*.test.tsx` co-located with source (e.g., `ConceptCard.test.tsx` beside `ConceptCard.tsx`)
- E2E tests: placed in `__tests__/` subdirectory (e.g., `__tests__/e2e.test.tsx`)

**Files (Python):**
- Modules: `snake_case.py` (e.g., `course_orchestrator.py`, `learning_persistence.py`, `quiz_randomization.py`)
- Tests: `test_*.py` in `server/tests/` directory (e.g., `test_learning_router.py`, `test_course_orchestrator.py`)

**Functions (TypeScript):**
- camelCase: `generateCourse`, `getLearningSession`, `transitionNode`, `submitQuiz`
- Hooks: `use` prefix: `useTypewriter`, `useNodeState`, `useLearningMutations`, `useQuizFeedback`
- Boolean getters: `isValidTransition`, `getNextStatus`

**Functions (Python):**
- `snake_case`: `generate_course`, `get_learning_session`, `update_node_status`
- Private methods: `_` prefix: `_generate_concept_unit`, `_process_gather_results`, `_create_skeleton_card`
- Validators: `validate_` prefix: `validate_display_label`, `validate_options`, `validate_topics`

**Variables (TypeScript):**
- camelCase: `queryClient`, `displayText`, `mockNode`, `mockNavigate`
- Constants: `UPPER_SNAKE_CASE` for true constants (e.g., `CONTENT_VISIBLE_STATES`, `QUIZ_VISIBLE_STATES`)
- Environment vars: `VITE_` prefix (e.g., `VITE_API_URL`)

**Variables (Python):**
- `snake_case`: `learning_manager`, `session_payload`, `node_payloads`
- Module-level constants: `UPPER_SNAKE_CASE` (e.g., `AUTO_RELOAD`, `RELOAD_DELAY`, `WATCH_PATHS`)
- Logger instances: `logger = logging.getLogger(__name__)`

**Types (TypeScript):**
- Interfaces: `UpperCamelCase` (e.g., `ConceptNode`, `QuizCard`, `LearningSessionWithNodes`)
- Type aliases: `UpperCamelCase` (e.g., `NodeStatus`, `QuizDifficulty`, `Complexity`)
- Union types as string literals: `'LOCKED' | 'VIEWING_EXPLANATION' | 'IN_QUIZ'`

**Types (Python):**
- Classes: `PascalCase` (e.g., `CourseOrchestrator`, `QuizCard`, `NodeStatus`)
- Enums: `PascalCase` with `UPPER_SNAKE_CASE` values (e.g., `NodeStatus.LOCKED`, `NodeStatus.IN_QUIZ`)
- Pydantic models: `PascalCase` with suffix conventions: `*Response`, `*Request`, `*Create`, `*Base`

## Code Style

**Formatting (TypeScript):**
- ESLint with TypeScript + React Hooks + React Refresh plugins
- Config: `client/eslint.config.js`
- Files: `**/*.{ts,tsx}` only
- Key rules: `react-refresh/only-export-components` with allowlist for `useErrorToast`
- Run: `npm run lint` from `client/`

**Formatting (Python):**
- No explicit formatter config detected (ruff cache exists suggesting ruff usage)
- 4-space indentation
- Line length: approximately 80-100 characters observed
- F-strings preferred for string interpolation

**Linting (TypeScript):**
- TypeScript strict mode: `strict: true` in `client/tsconfig.app.json`
- `noUnusedLocals: true` — unused variables are errors
- `noUnusedParameters: true` — unused params are errors
- `noFallthroughCasesInSwitch: true`
- `noUncheckedSideEffectImports: true`
- `erasableSyntaxOnly: true`

**Linting (Python):**
- No explicit linter config detected
- Ruff cache directory present (`.ruff_cache/`) suggesting ruff is used
- Standard Python conventions followed throughout

## Import Organization

**TypeScript Order:**
1. React/framework imports (`import { StrictMode } from 'react'`)
2. Type-only imports (`import type { ReactNode } from 'react'`)
3. Third-party libraries (`import { QueryClient } from '@tanstack/react-query'`)
4. Internal modules via `@/` alias (`import { cn } from '@/lib/utils'`)
5. Relative imports (`import './index.css'`)
6. Type-only from internal (`import type { ConceptNode } from '@/types/learning'`)

**TypeScript Path Aliases:**
- `@/*` maps to `client/src/*` (configured in `client/tsconfig.app.json` and `client/vite.config.ts`)
- Use `@/` prefix for all internal imports: `import { api } from '@/lib/learningApi'`
- Relative imports only for same-directory files

**Python Order:**
1. Standard library (`import asyncio`, `import logging`, `from typing import Optional`)
2. Third-party (`from fastapi import APIRouter, HTTPException, status`)
3. Local (`from server.database.learning_persistence import learning_manager`)
4. Use `from __future__ import annotations` when needed for forward references

**Python Import Conventions:**
- Module-level logger: `logger = logging.getLogger(__name__)`
- Import specific names, not entire modules when possible
- Group imports with blank lines between groups

## Error Handling

**TypeScript Patterns:**
- Axios interceptors for global error handling in `client/src/lib/learningApi.ts`
- Response interceptor logs errors and re-rejects: `console.error('API Request Failed:', ...)`
- Components handle errors via React Query's `isError`/`error` states
- Error boundaries: `LearningErrorBoundary.tsx` for feature-level catch
- Toast notifications via `useErrorToast` hook for user-facing errors
- Never suppress errors with empty catch blocks

**Python Patterns:**
- Router endpoints: try/except → log → `HTTPException` with appropriate status code
- Re-raise `HTTPException` untouched: `except HTTPException: raise`
- Wrap unexpected exceptions: `except Exception as e: logger.error(...); raise HTTPException(500, ...)`
- Specific exception types for known errors: `LookupError` → 404, `ValueError` → 400
- Pattern in every router endpoint:
  ```python
  try:
      # business logic
  except HTTPException:
      raise
  except LookupError as e:
      raise HTTPException(status_code=404, detail=str(e))
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      logger.error(f"Error ...: {e}")
      raise HTTPException(status_code=500, detail=f"Failed to ...: {str(e)}")
  ```

## Logging

**TypeScript:**
- `console.error` for API failures in interceptors
- No structured logging framework — browser console only

**Python:**
- Module-level: `logger = logging.getLogger(__name__)`
- Root config: `logging.basicConfig(level=logging.INFO)` in `server/main.py`
- Levels: `logger.info()` for lifecycle, `logger.error()` for failures, `logger.debug()` for orchestrator details
- F-string formatting: `logger.error(f"Error generating course: {e}")`

## Comments

**TypeScript:**
- Every file has a mandatory header block (76 `=` separator):
  ```typescript
  /**
   * ============================================================================
   * FILE: <filename>
   * LOCATION: <filepath>
   * ============================================================================
   * PURPOSE: ...
   * ROLE IN PROJECT: ...
   * KEY COMPONENTS: ...
   * DEPENDENCIES: ...
   * USAGE: ...
   * ============================================================================
   */
  ```
- Section separators: `// --- Section Name ---` (e.g., `// --- Learning Session ---`)
- Inline comments for non-obvious logic
- JSDoc not widely used beyond file headers

**Python:**
- Every file has a mandatory header block (76 `=` separator):
  ```python
  """
  ============================================================================
  FILE: <filename>
  LOCATION: <filepath>
  ============================================================================
  PURPOSE: ...
  ROLE IN PROJECT: ...
  KEY COMPONENTS: ...
  DEPENDENCIES: ...
  USAGE: ...
  ============================================================================
  """
  ```
- Docstrings on public classes and methods with Args/Returns sections
- Inline comments for complex logic
- Type hints on public function signatures

## Function Design

**TypeScript:**
- Arrow functions for API calls: `export const generateCourse = async (...) => { ... }`
- Named functions for components: `function App() { ... }`
- Named exports only — no default exports (mandatory convention)
- Exception: `App.tsx` uses `export default App` (legacy)
- Hooks return objects or primitives, not arrays (except `useTypewriter` which returns string)
- Async functions return typed promises: `Promise<LearningSessionWithNodes>`

**Python:**
- `def` for sync, `async def` for async
- Type hints on all public parameters and return values
- `Optional[T]` for nullable parameters with `None` default
- Docstrings with summary + Args/Returns sections
- No mutable default arguments — use `None` + fallback

## Module Design

**TypeScript Exports:**
- Named exports only (enforced by ESLint)
- Barrel files: `client/src/features/learning/index.ts` re-exports feature components
- Types exported from dedicated `types/` directory
- API functions exported individually from `lib/` files

**Python Exports:**
- `__init__.py` files for package structure
- Routers exported via `server/routers/__init__.py`
- Schemas exported via `server/schemas/__init__.py`
- Agents exported via `server/agents/__init__.py`

## Component Patterns

**React Components:**
- Functional components only (no class components)
- Props interfaces defined inline or as separate types
- State management via React Query (`useQuery`, `useMutation`) for server state
- Local state via `useState` for UI-only state
- Effects via `useEffect` with proper cleanup
- Memoization: not widespread — apply only when profiling shows need

**Pydantic Models:**
- `ConfigDict(from_attributes=True)` on all models for ORM compatibility
- `Field(...)` with description for all fields
- Validators via `@field_validator` decorator with `@classmethod`
- Base/Response/Create pattern: `*Base` → `*Create` → `*Response`
- Inheritance: `ResponseBase, TimestampMixin, ConceptNodeBase` composition

## API Conventions

**FastAPI Routers:**
- `APIRouter(prefix="/learning", tags=["learning"])`
- `summary` and `description` on every endpoint decorator
- `response_model` specified on every endpoint
- `status_code` for non-200 responses
- `Depends()` for dependency injection (e.g., `LLMContext`)

**Axios Client:**
- Base URL from `VITE_API_URL` env var, defaults to `http://localhost:8000`
- Standard client: 30s timeout for normal operations
- Learning client: 5min timeout for course generation
- Request interceptor attaches provider headers (API key, model)
- Response interceptor logs errors and re-rejects

## Style Preferences

**TypeScript:**
- `const` by default; never `var`
- Single quotes for strings
- Explicit semicolons
- Avoid `any`, `as`, and non-null assertions (`!`) — use sparingly
- Optional params (`?`) preferred over `| undefined`
- `T[]` for simple arrays; `Array<T>` for union types
- Template literals for string interpolation
- Destructuring for props and imports

**Python:**
- 4-space indentation
- F-strings for interpolation
- `Optional[T]` for nullable (not `T | None` in older code, both acceptable)
- `from __future__ import annotations` for forward references
- No bare `except:` — always specify exception type
- Context managers (`with`) for resource cleanup

---

*Convention analysis: 2026-05-27*
