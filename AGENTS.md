# AgUI Agent Guide

This file orients agentic coding assistants working in this repo.
Follow the commands and style rules below; match local patterns when editing.

## Spec-Based Development

**ALL work must reference these specification documents:**

| Document | Purpose |
|----------|---------|
| `conductor/product.md` | Vision, purpose, target audience, core capabilities, technical architecture |
| `conductor/product-guidelines.md` | Visual identity (Cyber Yellow #FFD400), UX principles, component standards |
| `conductor/tech-stack.md` | Technology choices: React 19, FastAPI, Vertex AI, SQLite, Tailwind 4.x |
| `conductor/workflow.md` | TDD workflow, quality gates, commit guidelines, definition of done |
| `conductor/code_styleguides/general.md` | Cross-language principles: readability, consistency, simplicity |
| `conductor/code_styleguides/typescript.md` | Google TS Style Guide: `const` default, named exports, single quotes |
| `conductor/code_styleguides/python.md` | Google Python Style Guide: 80-char lines, 4-space indent, docstrings |
| `conductor/code_styleguides/html-css.md` | Google HTML/CSS Guide: 2-space indent, lowercase, alphabetize CSS |

**Rule**: Before implementing any feature, read the relevant spec documents above.

## Repo Layout
- `client/`: Vite + React + TypeScript frontend
- `server/`: FastAPI backend (Pydantic models, REST routers)
- `conductor/`: Internal guidelines and product docs (the specs)

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

## Quick Reference: Code Style

### TypeScript/React (per `conductor/code_styleguides/typescript.md`)
- Use `const` by default; never `var`
- Named exports preferred; keep existing default exports
- Single quotes; explicit semicolons
- Avoid `any`, `as`, non-null assertions
- Optional params (`?`) preferred over `| undefined`
- `T[]` for simple arrays, `Array<T>` for unions
- `UpperCamelCase` for components/types, `CONSTANT_CASE` for constants
- Hooks start with `use`
- Type-only imports: `import type { Foo } from ...`

### Python/FastAPI (per `conductor/code_styleguides/python.md`)
- 4-space indentation, 80-character lines
- Import grouping: stdlib → third-party → local (`server.*`)
- `snake_case` functions/vars, `PascalCase` classes
- No mutable default args; use `None` + fallback
- Type hints for public APIs; `Optional[T]` for nullable
- Docstrings with summary + Args/Returns/Raises
- F-strings preferred; no bare `except:`
- Pydantic: `Field` constraints, `ConfigDict(from_attributes=True)`

### HTML/CSS (per `conductor/code_styleguides/html-css.md`)
- 2-space indentation; no tabs
- Lowercase: elements, attributes, selectors, properties
- Class selectors preferred; avoid ID selectors for styling
- Meaningful kebab-case class names
- Shorthand properties; omit units for zero
- Double quotes HTML attributes; single quotes CSS strings
- Alphabetize CSS declarations within rules
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
- Client: Vitest + Testing Library (`@testing-library/react`)
- Server: stdlib `unittest` in `server/tests`
- Keep tests small, deterministic; mock external dependencies
- Target: >80% code coverage per `conductor/workflow.md`

## Conventions to Preserve
- API routes in `server/routers`; schemas in `server/schemas`
- `APIRouter` with `summary`/`description` metadata
- Pydantic response models in router decorators are the contract
- Client uses React Query provider in `client/src/providers/QueryProvider.tsx`
- Axios base URL tied to `VITE_API_URL` fallback

## Data Model Notes
- Message roles: 'user' or 'model' (see `server/schemas/session.py`)
- Timestamps: ISO strings in API responses
- Session list endpoints: support `limit` and `offset`
- `get_session_messages`: optional `limit` (None = full history)

## AGENT BEHAVIOUR (Spec-Driven)

### Research-First Principle (per `conductor/workflow.md`)
- **ALWAYS web-search before implementing** unfamiliar libraries, APIs, or patterns
- **NEVER assume** library behavior — verify with official documentation
- **Search first** when encountering: new npm packages, Python libraries, framework features
- Use `librarian` agent for docs, `explore` agent for codebase patterns

### SWE Best Practices (per `conductor/workflow.md`)
- **Write tests BEFORE or WITH code**, not after — TDD required
- **Verify with diagnostics**: Run diagnostics before marking tasks complete
- **Build & test**: Always run build/test commands after implementation
- **Type safety first**: Never suppress errors with `as any`, `@ts-ignore`
- **Error handling**: Never leave empty catch blocks `catch(e) {}`
- **Minimal changes**: Fix bugs without refactoring unrelated code

### Quality Gates (per `conductor/workflow.md`)
Before marking any task complete, verify:
- [ ] All tests pass
- [ ] Code coverage >80%
- [ ] Code follows style guides in `conductor/code_styleguides/`
- [ ] Public functions documented (docstrings/JSDoc)
- [ ] Type safety enforced
- [ ] No linting errors
- [ ] Documentation updated if needed

### Task Workflow (per `conductor/workflow.md`)
1. **Read specs**: Check `conductor/product.md`, `conductor/tech-stack.md`, relevant style guides
2. **Select task**: Choose next task from `plan.md`
3. **Mark in progress**: Change `[ ]` to `[~]` in `plan.md`
4. **Red phase**: Write failing tests first
5. **Green phase**: Implement to pass tests
6. **Refactor**: Improve clarity with passing tests as safety net
7. **Verify coverage**: >80% for new code
8. **Document deviations**: If implementation differs from stack, STOP and update `tech-stack.md`
9. **Commit**: Clear message per `conductor/workflow.md` commit format

### Definition of Done (per `conductor/workflow.md`)
A task is complete when:
1. All code implemented to specification
2. Unit tests written and passing (>80% coverage)
3. Documentation complete
4. Code passes linting/static analysis
5. Works on mobile (if applicable)
6. Implementation notes added to `plan.md`
7. Changes committed with proper message

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

### Component Standards (per `conductor/product-guidelines.md`)
- **Message Bubbles**: User (distinct bg, right-aligned), AI (subtle bg, left-aligned, Markdown)
- **Input Area**: Auto-expanding textarea, Cyber Yellow send button, model toggles
- **Session Sidebar**: Clean list with active indicators, "New Session" button, rename/delete menus

## References
- `conductor/product.md` - Product vision and architecture
- `conductor/product-guidelines.md` - UI/UX standards
- `conductor/tech-stack.md` - Technology specifications
- `conductor/workflow.md` - Development workflow and quality gates
- `conductor/code_styleguides/general.md` - General principles
- `conductor/code_styleguides/typescript.md` - TypeScript/React rules
- `conductor/code_styleguides/python.md` - Python/FastAPI rules
- `conductor/code_styleguides/html-css.md` - HTML/CSS rules
