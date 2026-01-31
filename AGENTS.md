# AgUI Agent Guide

This file orients agentic coding assistants working in this repo.
Follow the commands and style rules below; match local patterns when editing.

## Repo layout
- `client/`: Vite + React + TypeScript frontend
- `server/`: FastAPI backend (Pydantic models, REST routers)
- `conductor/`: internal guidelines and product docs

## Build, lint, and test
### Client (AgUI/client)
- Install deps: `npm install`
- Dev server: `npm run dev` (Vite, http://localhost:5173)
- Build: `npm run build` (tsc -b + vite build)
- Lint: `npm run lint` (eslint .)
- Test (all): `npm run test` (vitest)
- Test single file: `npm run test -- src/lib/api.test.ts`
- Test name filter: `npm run test -- -t "QueryProvider"`
- Run once (no watch): `npm run test -- --run`

### Server (AgUI/server)
- Create venv (if needed): `python -m venv .venv`
- Activate (Windows): `\.venv\Scripts\activate`
- Activate (macOS/Linux): `source .venv/bin/activate`
- Install deps: `pip install -r requirements.txt`
- Run API: `python -m uvicorn server.main:app --reload --port 8000`
- Test (all): `python -m unittest`
- Test module: `python -m unittest server.tests.test_chat`
- Test case: `python -m unittest server.tests.test_chat.ChatSessionTests`
- Test single: `python -m unittest server.tests.test_chat.ChatSessionTests.test_invalid_session_id_returns_404`

### Env configuration
- Backend uses `.env` values; see `server/.env.example`
- Client reads `VITE_API_URL` (defaults to `http://localhost:8000`)

### Command examples (copy/paste)
```bash
cd AgUI/client
npm install
npm run dev
```
```bash
cd AgUI/server
python -m uvicorn server.main:app --reload --port 8000
```

## TypeScript config notes
- Strict mode is on (`strict: true` in `client/tsconfig.app.json`)
- Unused locals/params are errors (`noUnusedLocals`, `noUnusedParameters`)
- Path alias: `@/*` -> `client/src/*`
- `allowImportingTsExtensions` is enabled; prefer explicit extensions only when needed

## Code style (project rules)
### General (from `conductor/code_styleguides/general.md`)
- Readability first; avoid cleverness
- Follow existing patterns in nearby files
- Prefer simple, maintainable solutions
- Document why decisions were made when non-obvious

### TypeScript/React (from `conductor/code_styleguides/typescript.md` + codebase)
- Use ES modules; avoid `namespace`
- Use `const` by default; never use `var`
- Prefer named exports for new modules; keep default exports where already used
- Use single quotes; be consistent with semicolons within a file
- Avoid `any`, `as`, and non-null assertions unless justified
- Prefer optional params/fields (`?`) over `| undefined`
- Use `T[]` for simple arrays; `Array<T>` for unions
- Keep component names `UpperCamelCase`; hooks start with `use`
- Types/interfaces in `UpperCamelCase`; constants in `CONSTANT_CASE`
- Use type-only imports (`import type { Foo } from ...`) when possible
- Tests use Vitest; keep tests in `*.test.ts(x)` under `client/src`

### HTML/CSS (from `conductor/code_styleguides/html-css.md` + codebase)
- 2-space indentation; no tabs
- Lowercase element names, attributes, selectors, and properties
- Prefer class selectors; avoid IDs for styling
- Use meaningful kebab-case class names when custom CSS is needed
- Use shorthand properties and omit units for zero
- Use double quotes for HTML attributes; single quotes for CSS strings
- Alphabetize CSS declarations within a rule
- Tailwind is available; use `cn()` from `client/src/lib/utils.ts` for class merging
- Keep CSS rules grouped and consistent with `client/src/index.css`

### Python/FastAPI (from `conductor/code_styleguides/python.md` + codebase)
- 4-space indentation, 80-char lines
- Imports grouped: stdlib, third-party, local (`server.*`)
- Use `snake_case` for functions/vars, `PascalCase` for classes
- Avoid mutable default args; use `None` + fallback
- Add type hints for public APIs; prefer `Optional[T]` for nullable
- Use docstrings with summary + Args/Returns/Raises when public
- Use f-strings; avoid bare `except:`
- Pydantic models use `Field` constraints and `ConfigDict(from_attributes=True)`

### Error handling and logging
- API routers wrap logic in try/except, log errors, and raise `HTTPException` with status codes
- Re-raise `HTTPException` untouched; only wrap unexpected exceptions
- Use module-level `logger = logging.getLogger(__name__)`
- Client API calls go through `client/src/lib/api.ts` Axios instance
- Let Axios throw; handle errors at call sites or via interceptors

### Formatting and imports
- Match the local file style before making broad formatting changes
- Keep import order: stdlib -> third-party -> local; separate with blank lines in Python
- In TS/TSX, group imports as external, internal, relative
- Prefer explicit return types for exported functions when unclear

### Import ordering examples
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

## Testing notes
- Client tests: Vitest + Testing Library (`@testing-library/react`)
- Server tests: stdlib `unittest` in `server/tests`
- Keep tests small and deterministic; avoid network calls in unit tests

## Conventions to preserve
- API routes live in `server/routers`; schemas in `server/schemas`
- Use `APIRouter` with `summary`/`description` metadata
- Pydantic response models in router decorators are the contract
- Client uses React Query provider in `client/src/providers/QueryProvider.tsx`
- Keep axios base URL tied to `VITE_API_URL` fallback

## Data model notes
- Message roles are 'user' or 'model' (see `server/schemas/session.py`)
- Timestamps are ISO strings in API responses
- Session list endpoints support `limit` and `offset`
- `get_session_messages` accepts optional `limit` (None => full history)

## AGENT BEHAVIOUR

### Research-First Principle
- **ALWAYS web-search before implementing** unfamiliar libraries, APIs, or patterns
- **NEVER assume** library behavior — verify with official documentation
- **Search first** when encountering: new npm packages, Python libraries, framework features, or external APIs
- Use `librarian` agent for documentation lookup, `explore` agent for codebase patterns

### SWE Best Practices
- **Write tests BEFORE or WITH code**, not after — TDD when appropriate
- **Verify with diagnostics**: Run `lsp_diagnostics` before marking tasks complete
- **Build & test**: Always run build/test commands after implementation
- **Type safety first**: Never suppress type errors with `as any`, `@ts-ignore`
- **Error handling**: Never leave empty catch blocks `catch(e) {}`
- **Minimal changes**: Fix bugs without refactoring unrelated code

### Never Be Lazy
- **Don't skip verification** — always run diagnostics, build, and tests
- **Don't guess** — search for patterns, ask clarification questions when ambiguous
- **Don't partial-ship** — task is complete ONLY when all criteria met
- **Don't assume knowledge** — read the relevant code before modifying
- **Don't skip tests** — verify functionality, not just compilation

### Certainty Before Conclusion
- **NEVER declare complete** without 100% confidence
- **Verify every requirement** from the original request is addressed
- **Check for regressions**: Run relevant tests before claiming fix
- **Run diagnostics**: Ensure no new errors introduced
- **If uncertain, ask**: Better to clarify than ship broken code

### Productivity & Intelligence
- **Parallel execution**: Use background agents for independent tasks (explore, librarian, document-writer)
- **Delegate visual work**: Always use `frontend-ui-ux-engineer` agent for styling/layout changes
- **Consult Oracle** for: architecture decisions, 2+ failed fix attempts, complex debugging
- **Use todo tracking**: Mark in_progress → completed in real-time
- **Batch small tasks**: Group related edits, run diagnostics once
- **Think before code**: Understand the problem, then implement
- **Learn from failures**: Document what failed, consult Oracle after 3 attempts

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
- **Use suitable and available sub-agents whenever possible** to extend the current session by conserving the context window
- Sub-agents are crucial for **long-running tasks** that involve multiple files, complex exploration, or extensive modifications
- Launching sub-agents allows:
  - Fresh context windows for each subtask
  - Parallel execution of independent operations
  - Better focus on specific domains (visual, documentation, debugging)
- Delegate appropriately using the guidelines above — don't try to handle everything in a single session

### Evidence Requirements
Task is NOT complete without:
- [ ] `lsp_diagnostics` clean on changed files
- [ ] Build passes (if applicable)
- [ ] Tests pass (or explicit note of pre-existing failures)
- [ ] User's original request fully addressed

### File Header Requirements
**MANDATORY for every code file created or updated:**

```typescript
// {FILE_NAME}
// {Brief 1-line description of what this file does}

// Longer description (2-4 lines):
// - What problem does this solve?
// - What are the key functions/classes?
// - Any important context for future maintainers

// @see: {Related files}
// @note: {Important caveats or gotchas}
```

**Example (TypeScript):**
```typescript
// api.ts
// Axios client configuration with interceptors for auth and error handling

// Configures base URL, timeout (5min for document processing),
// and adds auth token to all requests. Error interceptor logs
// and rejects promises for consistent error handling across app.

// @see: types/api.ts - Type definitions for API responses
// @note: Always use 127.0.0.1, never localhost (IPv6 issues)
```

**Example (Python):**
```python
# rag_engine.py
# Hybrid RAG engine combining vector search and graph traversal

# Implements query analysis to determine intent (factual/conceptual),
# performs hybrid search (vector + graph), and synthesizes responses
# using retrieved context. Supports configurable similarity thresholds.

# @see: schemas/query.py - Query schema definitions
# @note: 2-hop graph traversal limits may need tuning for large graphs
```

**Enforcement:**
- File headers are REQUIRED for: `.ts`, `.tsx`, `.py`, `.pyi`, `.js`, `.jsx`
- Existing files without headers: Add when modifying significantly (>30% changes)
- New files: ALWAYS add header before first write
- Configuration files (tsconfig.json, pyproject.toml): Optional but encouraged

## Cursor/Copilot rules
- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md` files found in this repo

## References
- `conductor/code_styleguides/general.md`
- `conductor/code_styleguides/html-css.md`
- `conductor/code_styleguides/python.md`
- `conductor/code_styleguides/typescript.md`
