# claud.md

**For Claude Code (Anthropic CLI)**

**Generated:** 2026-01-31

## Project Context

AgUI is a standalone "Pure Chat" application — a lightweight counterpart to AURA-CHAT that excludes RAG and Knowledge Graph functionality. It features a React frontend with session sidebar and chat interface, backed by a FastAPI server for session persistence and direct Vertex AI (Gemini) integration.

## Quick Reference

### Structure
- `client/`: React 19 + Vite + TypeScript + Tailwind 4.x
- `server/`: FastAPI + Pydantic + Vertex AI integration
- `conductor/`: Product specs, style guides, and workflow docs

### Key Files
| Purpose | Path |
|---------|------|
| Client entry | `client/src/main.tsx` |
| API client | `client/src/lib/api.ts` |
| Query provider | `client/src/providers/QueryProvider.tsx` |
| Chat feature | `client/src/features/chat/` |
| Chat API | `server/routers/chat.py` |
| Sessions API | `server/routers/sessions.py` |
| Chat schemas | `server/schemas/chat.py` |
| Session schemas | `server/schemas/session.py` |
| Persistence | `server/database/persistence.py` |
| Vertex client | `server/utils/vertex_client.py` |

### Dev Commands
```bash
cd AgUI/client && npm install && npm run dev
cd AgUI/server && python -m uvicorn server.main:app --reload --port 8000
```

### Tech Stack (from `conductor/tech-stack.md`)
- **Frontend:** React 19, Vite, Tailwind 4.x, TanStack Query v5, Axios
- **Backend:** FastAPI, Uvicorn, Google Vertex AI SDK, Pydantic v2
- **Persistence:** SQLite (local file-based)
- **Testing:** Vitest (client), unittest (server)

### Configuration
- API base URL: `VITE_API_URL` (defaults to `http://localhost:8000`)
- Backend `.env`: `PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `LOCATION`
- Default model: `gemini-2.0-flash-001` (see `server/schemas/chat.py`)

## Spec-Based Development

**CRITICAL**: Always reference these conductor/ specifications before implementing:

1. **`conductor/product.md`** — Vision, purpose, target audience, core capabilities
2. **`conductor/product-guidelines.md`** — Visual identity (Cyber Yellow #FFD400), UX principles, component standards
3. **`conductor/tech-stack.md`** — Technology stack and development tools
4. **`conductor/workflow.md`** — TDD workflow, quality gates, commit guidelines
5. **`conductor/code_styleguides/`** — Language-specific style rules (TS, Python, HTML/CSS)

## Agent Behaviour

### Research-First Principle
- **ALWAYS web-search before implementing** unfamiliar libraries, APIs, or patterns
- **NEVER assume** library behavior — verify with official documentation

### TDD Workflow (per `conductor/workflow.md`)
1. Write failing tests (Red phase)
2. Implement to pass tests (Green phase)
3. Refactor with passing tests as safety net
4. Verify >80% coverage

### Quality Gates (per `conductor/workflow.md`)
- All tests pass
- Coverage >80%
- Follows style guides in `conductor/code_styleguides/`
- Type safety enforced
- No linting errors

### Delegation Guidelines
| Domain | Delegate To | When |
|--------|-------------|------|
| Visual/UI | `frontend-ui-ux-engineer` | Styling, layout, animations |
| External docs | `librarian` | Library API, official docs |
| Codebase patterns | `explore` | Finding existing implementations |
| Architecture | `oracle` | Multi-system tradeoffs |
| Documentation | `document-writer` | READMEs, guides |
| Hard debugging | `oracle` | After 2+ failed attempts |

### Evidence Requirements
Task complete only when:
- [ ] `lsp_diagnostics` clean
- [ ] Build passes
- [ ] Tests pass
- [ ] Coverage >80%
- [ ] User request fully addressed

### File Headers (Required)
```typescript
// {FILE_NAME}
// {Brief 1-line description}

// What problem does this solve?
// Key functions/classes?
// Context for future maintainers?

// @see: {Related files}
// @note: {Caveats or gotchas}
```

## Code Style Quick Ref

### TypeScript (from `conductor/code_styleguides/typescript.md`)
- `const` by default; never `var`
- Named exports preferred
- Single quotes; explicit semicolons
- Avoid `any`, `as`, non-null assertions
- `UpperCamelCase` components/types

### Python (from `conductor/code_styleguides/python.md`)
- 4-space indent, 80-char lines
- `snake_case` functions, `PascalCase` classes
- Docstrings: summary + Args/Returns/Raises
- No mutable default args

### HTML/CSS (from `conductor/code_styleguides/html-css.md`)
- 2-space indent, lowercase
- Class selectors preferred
- Alphabetize CSS declarations
- Use `cn()` from `client/src/lib/utils.ts` for Tailwind merging

## Product Guidelines (from `conductor/product-guidelines.md`)

### Visual Identity
- **Cyber Yellow (`#FFD400`)**: Primary actions, accents
- **Dark Backgrounds**: Deep grays/blacks
- **Typography**: Inter (UI), JetBrains Mono (code)
- **Rounding**: 8px-12px consistently

### UX Principles
- Minimalism: Remove non-essential UI elements
- Persistence: Instant session switching, draft preservation
- Clarity: Visual cues for model states
- Responsiveness: Sidebar toggle on mobile

## Full Documentation

**See `AGENTS.md`** for comprehensive documentation including:
- Complete build, lint, and test commands
- Detailed code style rules
- Full workflow and quality gates
- Testing requirements and conventions
- Data model notes

**See conductor/ specifications for:**
- Product vision (`conductor/product.md`)
- UI/UX standards (`conductor/product-guidelines.md`)
- Tech stack details (`conductor/tech-stack.md`)
- Development workflow (`conductor/workflow.md`)
- Language style guides (`conductor/code_styleguides/`)
