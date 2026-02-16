# AgUI Agent Guide

This file orients agentic coding assistants working in this repo.
Follow the commands and style rules below; match local patterns when editing.

## Spec-Based Development

**ALL work must reference these specification documents:**

| Document | Purpose |
|----------|---------|
| `.planning/codebase/ARCHITECTURE.md` | Vision, purpose, target audience, core capabilities, technical architecture |
| `conductor/product-guidelines.md` | Visual identity (Cyber Yellow #FFD400), UX principles, component standards |
| `.planning/codebase/STACK.md` | Technology choices: React 19, FastAPI, Vertex AI, SQLite, Tailwind 4.x |
| `.planning/codebase/TESTING.md` | TDD workflow, quality gates, testing patterns, definition of done |
| `.planning/codebase/CONVENTIONS.md` | Coding conventions for TypeScript, Python, and HTML/CSS |
| `.planning/codebase/STRUCTURE.md` | Directory layout and where to add new code |
| `.planning/codebase/INTEGRATIONS.md` | External service integrations and configuration |
| `.planning/codebase/CONCERNS.md` | Known tech debt, security considerations, performance bottlenecks |

**Rule**: Before implementing any feature, read the relevant spec documents above.

## Repo Layout

- `client/`: Vite + React 19 + TypeScript frontend
- `server/`: FastAPI backend with Pydantic v2 (models, REST routers, services, utils)
- `conductor/`: Product guidelines and UI/UX standards
- `.planning/codebase/`: Comprehensive codebase documentation (architecture, stack, conventions)
- `features/learning/`: Adaptive learning system components
  - Client: LearningPage, LearningPathContainer, ConceptCard, QuizModal
  - Server: CourseOrchestrator, agent architecture (PlannerAgent, GeneratorAgent, QuizzerAgent)
  - Database: concept_nodes, quiz_data, learning_sessions tables

## Technology Versions

- **React**: 19
- **Tailwind CSS**: 4.x
- **Pydantic**: v2
- **TypeScript**: Strict mode enabled
- **Python**: 3.10+

## Dependencies

### Client
Core: React 19, React-DOM, TypeScript, Vite
Routing: `react-router-dom`
UI/Animation: `framer-motion`, `lucide-react`, `tailwindcss`
Content: `react-markdown`, `@tailwindcss/typography`
State/Query: `@tanstack/react-query`, `axios`
Testing: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `jsdom`

### Server
Web Framework: `fastapi`, `uvicorn`, `python-multipart`
AI/ML: `google-cloud-aiplatform`, `instructor`, `pydantic`
Database: `sqlalchemy`, `alembic`
Utilities: `tenacity` (retry logic)
Testing: `unittest` (stdlib)

## Build, Lint, and Test

### Client (AgUI/client)
```bash
cd client
npm install          # Install deps
npm run dev          # Dev server (http://localhost:5173)
npm run build        # Build (tsc -b + vite build)
npm run lint         # ESLint
npm run test         # Vitest (add -- --run for single run)
npm run test -- src/lib/api.test.ts    # Test single file
npm run test -- -t "QueryProvider"     # Test name filter
npm run test -- --coverage             # Coverage report (requires @vitest/coverage-v8)
```

### Server (AgUI/server)
```bash
cd server
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python -m uvicorn server.main:app --reload --port 8000
python -m unittest                    # All tests
python -m unittest server.tests.test_chat.ChatSessionTests.test_invalid_session_id_returns_404  # Single test
```

### Env Configuration
- Backend: `.env` values (see `server/.env.example`)
- Client: `VITE_API_URL` (defaults to `http://localhost:8000`)
- Vertex AI: `PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `LOCATION`

## TypeScript Config Notes
- Strict mode: `strict: true` in `client/tsconfig.app.json`
- Unused locals/params are errors
- Path alias: `@/*` -> `client/src/*`
- `allowImportingTsExtensions` enabled
- Testing: `jsdom` environment via `vitest.setup.ts`

## Application Routes

The application uses `react-router-dom` with the following routes:
- `/chat` - Main chat interface (default)
- `/learn` - Adaptive learning page

## Quick Reference: Code Style

### TypeScript/React (per `.planning/codebase/CONVENTIONS.md`)
- Use `const` by default; never `var`
- **No default exports** (mandatory - use named exports only)
- Single quotes; explicit semicolons
- Avoid `any`, `as`, non-null assertions
- Optional params (`?`) preferred over `| undefined`
- `T[]` for simple arrays, `Array<T>` for unions
- `UpperCamelCase` for components/types, `CONSTANT_CASE` for constants
- Hooks start with `use`
- Type-only imports: `import type { Foo } from ...`

### Python/FastAPI (per `.planning/codebase/CONVENTIONS.md`)
- 4-space indentation, **80-character line limit**
- Import grouping: stdlib → third-party → local (`server.*`)
- `snake_case` functions/vars, `PascalCase` classes
- No mutable default args; use `None` + fallback
- Type hints for public APIs; `Optional[T]` for nullable
- Docstrings with summary + Args/Returns/Raises
- F-strings preferred; no bare `except:`
- Pydantic: `Field` constraints, `ConfigDict(from_attributes=True)`
- **main() function pattern** for executable Python files

### HTML/CSS (per `.planning/codebase/CONVENTIONS.md`)
- 2-space indentation; no tabs
- Lowercase: elements, attributes, selectors, properties
- Class selectors preferred; avoid ID selectors for styling
- Meaningful kebab-case class names
- Shorthand properties; omit units for zero
- Double quotes HTML attributes; single quotes CSS strings
- **Alphabetize CSS declarations within rules**
- Tailwind available; use `cn()` from `client/src/lib/utils.ts`

### Error Handling and Logging
- API routers: try/except → log → `HTTPException` with status codes
- Re-raise `HTTPException` untouched; wrap only unexpected exceptions
- Module-level: `logger = logging.getLogger(__name__)`
- Client API calls through `client/src/lib/api.ts` Axios instance
- Let Axios throw; handle at call sites or via interceptors

### Import Ordering
```ts
import { StrictMode } from 'react'
import type { Session } from '@/types/api'
import { api } from '@/lib/api'
import './index.css'
```
```python
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from server.database.persistence import session_manager
```

## Testing Notes
- **Client**: Vitest + Testing Library (`@testing-library/react`)
  - File naming: `*.test.ts` or `*.test.tsx`
  - Co-located with source files (test in same directory as implementation)
  - Environment: `jsdom` configured in `vitest.setup.ts`
  - Coverage: Requires `@vitest/coverage-v8` package
- **Server**: stdlib `unittest` in `server/tests`
  - File naming: `test_*.py`
  - Located in `server/tests/` directory
- Keep tests small, deterministic; mock external dependencies
- Target: >80% code coverage per `.planning/codebase/TESTING.md`

## Conventions to Preserve
- API routes in `server/routers`; schemas in `server/schemas`
- `APIRouter` with `summary`/`description` metadata
- Pydantic response models in router decorators are the contract
- Client uses React Query provider in `client/src/providers/QueryProvider.tsx`
- Axios base URL tied to `VITE_API_URL` fallback

## Server Directory Structure

### Routers (`server/routers/`)
- REST API endpoints with FastAPI `APIRouter`
- Chat: `/chat/sessions`, message endpoints
- Learning: `/learning/generate`, `/learning/sessions/{id}`, etc.

### Schemas (`server/schemas/`)
- Pydantic v2 models for request/response validation
- Session schemas, message schemas, learning schemas

### Services (`server/services/`)
- Business logic layer
- `course_orchestrator.py`: Main learning orchestration service

### Utils (`server/utils/`)
- Shared utility modules
- `vertex_client.py`: Google Vertex AI client wrapper
- `instructor_client.py`: Instructor library integration for structured outputs

### Database (`server/database/`)
- Persistence layer
- `persistence.py`: SessionManager and data access
- `models.py`: SQLAlchemy models
- `connection.py`: Database connection management

## Data Model Notes
- Message roles: 'user' or 'model' (see `server/schemas/session.py`)
- Timestamps: ISO strings in API responses
- Session list endpoints: support `limit` and `offset`
- `get_session_messages`: optional `limit` (None = full history)

## Learning Feature Architecture

### Client Components
- **LearningPage**: Main learning interface route
- **LearningPathContainer**: Displays learning path tree structure
- **ConceptCard**: Individual concept node visualization
- **QuizModal**: Interactive quiz interface

### Server Components
- **CourseOrchestrator**: Central service coordinating learning flow
- **PlannerAgent**: Generates learning roadmaps
- **GeneratorAgent**: Creates educational content
- **QuizzerAgent**: Generates and evaluates quizzes

### Database Tables
- `concept_nodes`: Learning concept hierarchy
- `quiz_data`: Quiz questions and user answers
- `learning_sessions`: Learning session state tracking

### API Endpoints
- `POST /learning/generate` - Generate new learning content
- `GET /learning/sessions/{id}` - Get learning session details
- `PUT /learning/sessions/{id}/progress` - Update progress
- `GET /learning/sessions/{id}/next` - Get next content item

## AGENT BEHAVIOUR (Spec-Driven)

### Research-First Principle (per `.planning/codebase/CONVENTIONS.md`)
- **ALWAYS web-search before implementing** unfamiliar libraries, APIs, or patterns
- **NEVER assume** library behavior — verify with official documentation
- **Search first** when encountering: new npm packages, Python libraries, framework features
- Use `librarian` agent for docs, `explore` agent for codebase patterns

### SWE Best Practices (per `.planning/codebase/TESTING.md`)
- **Write tests BEFORE or WITH code**, not after — TDD required
- **Verify with diagnostics**: Run diagnostics before marking tasks complete
- **Build & test**: Always run build/test commands after implementation
- **Type safety first**: Never suppress errors with `as any`, `@ts-ignore`
- **Error handling**: Never leave empty catch blocks `catch(e) {}`
- **Minimal changes**: Fix bugs without refactoring unrelated code
- **Running python files**: Always use .venv in the root of the server directory, and run with `python -m` to ensure correct imports and environment

### Quality Gates (per `.planning/codebase/TESTING.md`)
Before marking any task complete, verify:
- [ ] All tests pass
- [ ] Code coverage >80%
- [ ] Code follows conventions in `.planning/codebase/CONVENTIONS.md`
- [ ] Public functions documented (docstrings/JSDoc)
- [ ] Type safety enforced
- [ ] No linting errors
- [ ] Documentation updated if needed

### Task Workflow (per `.planning/codebase/TESTING.md`)
1. **Read specs**: Check `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STACK.md`, `.planning/codebase/CONVENTIONS.md`
2. **Select task**: Choose next task from roadmap in `.planning/`
3. **Mark in progress**: Update task status in `.planning/` roadmap
4. **Red phase**: Write failing tests first (verify they fail!)
5. **Green phase**: Implement to pass tests
6. **Refactor**: Improve clarity with passing tests as safety net
7. **Verify coverage**: >80% for new code
8. **Document deviations**: If implementation differs from stack, STOP and update `.planning/codebase/STACK.md`
9. **Commit**: Clear message per `.planning/codebase/TESTING.md` commit format

### TDD Phases (Explicit)

#### Red Phase
- Write tests that define the expected behavior
- **Verify tests FAIL before implementation** (critical!)
- Tests act as specification and safety net
- Do not proceed until tests fail appropriately

#### Green Phase
- Implement minimal code to make tests pass
- Focus on functionality, not perfection
- All tests must pass before moving on

#### Refactor Phase
- Improve code clarity and structure
- Maintain all passing tests as safety net
- No behavior changes during refactoring

### Definition of Done (per `.planning/codebase/TESTING.md`)
A task is complete when:
1. All code implemented to specification
2. Unit tests written and passing (>80% coverage)
3. Documentation complete
4. Code passes linting/static analysis
5. Works on mobile (if applicable)
6. Implementation notes added to `plan.md`
7. Changes committed with proper message

### Phase Checkpointing Protocol
When working on multi-phase tasks:
- **Stop at phase boundaries** to verify completeness
- **Document progress** in git notes: `git notes add -m "Phase X complete: ..."`
- **Review checkpoints** before starting next phase
- **Flag blockers** immediately if phase cannot complete

### Git Notes Workflow
Use git notes to track task summaries:
```bash
# Add note after completing significant work
git notes add -m "Implemented feature X with Y approach"

# Show notes in log
git log --show-notes

# Notes persist with commits and provide audit trail
```

### Delegation Guidelines
| Domain | Delegate To | When |
|--------|-------------|------|
| Visual/UI changes | `frontend-ui-ux-engineer` | Styling, layout, animations |
| External docs | `librarian` | Library API, official docs |
| Codebase patterns | `explore` | Finding existing implementations |
| Architecture review | `oracle` | Multi-system tradeoffs, design |
| Documentation | `document-writer` | READMEs, guides, AGENTS.md |
| Hard debugging | `oracle` | After 2+ failed fix attempts |

### Use Sub-Agents to Extend Sessions
- Use suitable sub-agents to conserve context window
- Launch sub-agents for: long-running tasks, multi-file changes, complex exploration
- Benefits: Fresh context per subtask, parallel execution, domain focus

### File Header Requirements
**MANDATORY** for `.ts`, `.tsx`, `.py`, `.pyi`, `.js`, `.jsx`:

```typescript
// {FILE_NAME}
// {Brief 1-line description}

// Longer description (2-4 lines):
// - What problem does this solve?
// - What are the key functions/classes?
// - Any important context for future maintainers

// @see: {Related files}
// @note: {Important caveats or gotchas}
```

**Enforcement:**
- New files: ALWAYS add header before first write
- Existing files: Add header when modifying >30%
- Config files: Optional but encouraged

## Product Context

### Product Nature
- **Pure Chat Application**: Direct LLM interaction without RAG or Graph DB
- **Target Audience**: Researchers, students, professionals seeking AI assistance
- **Tone**: Academic/professional communication

### Visual Identity (per `conductor/product-guidelines.md`)
- **Cyber Yellow (`#FFD400`)**: Primary actions, accents, brand
- **Dark Backgrounds**: Deep grays/blacks for reduced eye strain
- **Typography**: Inter (UI), JetBrains Mono (code)
- **Glassmorphism**: Light usage for cards/panels
- **Rounded Corners**: 8px-12px consistently

### UX Principles (per `conductor/product-guidelines.md`)
- **Minimalism**: Remove UI elements not contributing to chat/session management
- **Persistence**: Instant session switching, preserved draft content
- **Clarity**: Distinct visual cues for model states (thinking, generating, error)
- **Responsiveness**: Sidebar toggle on smaller viewports

### UX Requirements
- **Thinking Mode Visualization**: Show when model is processing/reasoning
- **Draft Content Preservation**: Maintain unsent message drafts across session switches
- **Academic Tone**: Professional, clear communication style

### Component Standards (per `conductor/product-guidelines.md`)
- **Message Bubbles**: User (distinct bg, right-aligned), AI (subtle bg, left-aligned, Markdown)
- **Input Area**: Auto-expanding textarea, Cyber Yellow send button, model toggles
- **Session Sidebar**: Clean list with active indicators, "New Session" button, rename/delete menus

## References
- `.planning/codebase/ARCHITECTURE.md` - Product vision and architecture
- `conductor/product-guidelines.md` - UI/UX standards
- `.planning/codebase/STACK.md` - Technology specifications
- `.planning/codebase/TESTING.md` - Development workflow and quality gates
- `.planning/codebase/CONVENTIONS.md` - Coding conventions for all languages
- `.planning/codebase/STRUCTURE.md` - Directory layout
- `.planning/codebase/INTEGRATIONS.md` - External service integrations
- `.planning/codebase/CONCERNS.md` - Known issues and tech debt
