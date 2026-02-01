# gemini.md

**For Google Gemini CLI / Vertex AI Context**

**Generated:** 2026-02-01

## Project Overview

AgUI is a standalone "Pure Chat" application — a lightweight counterpart to AURA-CHAT that explicitly excludes RAG and Knowledge Graph functionality. It provides a React frontend with session sidebar and chat interface, backed by a FastAPI server for session persistence and direct Vertex AI (Gemini) integration.

**Target Audience:** Individual developers, freelancers, and small teams needing quick AI assistance without RAG complexity.

## Quick Reference

### Vertex AI Configuration (from `server/.env.example`)
```bash
PROJECT_ID=your-project-id-here
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
LOCATION=us-central1
```

### AI Clients (from `server/utils/`)
- **`vertex_client.py`**: Direct Vertex AI SDK client for streaming chat
- **`instructor_client.py`**: Structured output client using `instructor` library with Vertex AI

### Role-Based Model Selection (from `server/utils/instructor_client.py`)
```python
MODEL_CONFIGS = {
    'default': 'gemini-2.0-flash-001',
    'content': 'gemini-2.0-flash-001',      # Course content generation
    'quiz': 'gemini-2.0-flash-001',         # Quiz generation
    'outcomes': 'gemini-2.0-flash-001',     # Learning outcomes
    'plan': 'gemini-2.0-flash-001',         # Course structure planning
}
```

Default model: `gemini-2.0-flash-001` (see `server/schemas/chat.py`)

### Key Files
| Component | Path |
|-----------|------|
| Vertex client | `server/utils/vertex_client.py` |
| Instructor client | `server/utils/instructor_client.py` |
| Chat route | `server/routers/chat.py` |
| Sessions route | `server/routers/sessions.py` |
| **Learning route** | **`server/routers/learning.py`** |
| **Course orchestrator** | **`server/services/course_orchestrator.py`** |
| Chat schemas | `server/schemas/chat.py` |
| Session schemas | `server/schemas/session.py` |
| Persistence | `server/database/persistence.py` |
| API client | `client/src/lib/api.ts` |
| Query provider | `client/src/providers/QueryProvider.tsx` |
| Chat feature | `client/src/features/chat/` |
| **Learning agents** | **`server/agents/*` (planner, generator, quizzer)** |
| **Learning UI** | **`client/src/features/learning/`** |

### Application Routes
- `/chat` - Main chat interface (default)
- `/learn` - Adaptive learning page

### Dev Commands
```bash
cd AgUI/client && npm run dev
cd AgUI/server && python -m uvicorn server.main:app --reload --port 8000
```

### Tech Stack (from `conductor/tech-stack.md`)
- **Frontend:** React 19, Vite, Tailwind 4.x, TanStack Query v5, Axios, **framer-motion**, **lucide-react**, **react-markdown**
- **Backend:** FastAPI, Uvicorn, Google Vertex AI SDK (`google-cloud-aiplatform`), **Pydantic v2**, **instructor** (structured outputs), **tenacity** (retry logic)
- **Persistence:** SQLite (local file-based)
- **Default Model:** `gemini-2.0-flash-001`
- **Python:** 3.10+

### Notes
- Client base URL uses `VITE_API_URL` with fallback `http://localhost:8000`
- Server health endpoint exposes Vertex connection status at `/health`

## Spec-Based Development

**CRITICAL**: Always reference these conductor/ specifications before implementing:

1. **`conductor/product.md`** — Vision, purpose, target audience, core capabilities, technical architecture
2. **`conductor/product-guidelines.md`** — Visual identity (Cyber Yellow #FFD400), UX principles, component standards
3. **`conductor/tech-stack.md`** — Technology stack and development tools
4. **`conductor/workflow.md`** — TDD workflow, quality gates, commit guidelines
5. **`conductor/code_styleguides/`** — Language-specific style rules (TS, Python, HTML/CSS)

## Agent Behaviour

### Research-First Principle
- **ALWAYS web-search before implementing** unfamiliar libraries, APIs, or patterns
- **NEVER assume** library behavior — verify with official documentation
- **Search first** when encountering: new npm packages, Python libraries, framework features

### TDD Phases (Explicit)

#### Red Phase
- Write tests that define expected behavior
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

### Testing Setup
- **Client:** Vitest + Testing Library + `@vitest/coverage-v8`
  - Co-located: `*.test.ts` files in same directory as implementation
- **Server:** stdlib `unittest` in `server/tests/`
- Target: >80% coverage for new code

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
- **No default exports** (mandatory - use named exports only)
- Single quotes; explicit semicolons
- Avoid `any`, `as`, non-null assertions
- Optional params (`?`) preferred over `| undefined`
- `T[]` for simple arrays, `Array<T>` for unions
- `UpperCamelCase` components/types, `CONSTANT_CASE` constants

### Python (from `conductor/code_styleguides/python.md`)
- 4-space indent, **80-character line limit**
- `snake_case` functions, `PascalCase` classes
- Docstrings: summary + Args/Returns/Raises
- No mutable default args (use `None` + fallback)
- Type hints for public APIs
- F-strings preferred
- Import grouping: stdlib → third-party → local (`server.*`)

### HTML/CSS (from `conductor/code_styleguides/html-css.md`)
- 2-space indent, lowercase
- Class selectors preferred
- Alphabetize CSS declarations
- Use `cn()` from `client/src/lib/utils.ts` for Tailwind merging

## Product Context

### Pure Chat Application
AgUI is explicitly a **Pure Chat** application — direct LLM interaction without:
- RAG (Retrieval Augmented Generation)
- Knowledge Graph databases
- Document indexing

**Target Audience:** Researchers, students, professionals seeking AI assistance

### Product Guidelines (from `conductor/product-guidelines.md`)

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

### Component Standards
- **Message Bubbles**: User (distinct bg, right-aligned), AI (subtle bg, left-aligned, Markdown)
- **Input Area**: Auto-expanding textarea, Cyber Yellow send button, model toggles
- **Session Sidebar**: Clean list with active indicators, "New Session" button, rename/delete menus

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
