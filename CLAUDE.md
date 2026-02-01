# CLAUDE.md

**For Claude Code (Anthropic CLI)**

**Generated:** 2026-02-01

## Project Context

AgUI is a standalone "Pure Chat" application — a lightweight counterpart to AURA-CHAT that excludes RAG and Knowledge Graph functionality. Target audience: Developers, power users, technical professionals seeking distraction-free AI chat. Features session management, chat history, direct Vertex AI (Gemini) integration.

## Quick Reference

### Structure
- `client/`: React 19 + Vite + TypeScript + Tailwind 4.x
- `server/`: FastAPI + Pydantic v2 + Vertex AI integration
- `conductor/`: Product specs, style guides, and workflow docs

### Key Files
| Purpose | Path |
|---------|------|
| Client entry | `client/src/main.tsx` |
| API client | `client/src/lib/api.ts` |
| Query provider | `client/src/providers/QueryProvider.tsx` |
| Chat feature | `client/src/features/chat/` |
| Learning feature | `client/src/features/learning/` |
| Learning API | `client/src/lib/learningApi.ts` |
| Chat API | `server/routers/chat.py` |
| Learning API | `server/routers/learning.py` |
| Sessions API | `server/routers/sessions.py` |
| Chat schemas | `server/schemas/chat.py` |
| Session schemas | `server/schemas/session.py` |
| Persistence | `server/database/persistence.py` |
| Vertex client | `server/utils/vertex_client.py` |
| Course orchestrator | `server/services/course_orchestrator.py` |
| AI agents | `server/agents/*` |

### Dev Commands
```bash
cd AgUI/client && npm install && npm run dev        # Frontend (http://localhost:5173)
cd AgUI/server && python -m uvicorn server.main:app --reload --port 8000  # Backend
```

### Routing
- `/chat` - Main chat interface with session sidebar
- `/learn` - Interactive learning feature (course-based AI tutoring)

### Tech Stack
- **Frontend:** React 19, Vite, Tailwind 4.x, TanStack Query v5, Axios, framer-motion, lucide-react, react-markdown, react-router-dom
- **Backend:** FastAPI, Uvicorn, Google Vertex AI SDK, Pydantic v2, instructor, tenacity
- **Persistence:** SQLite (local file-based)
- **Testing:** Vitest (client), unittest (server)

### Configuration
- API base URL: `VITE_API_URL` (defaults to `http://localhost:8000`)
- Backend `.env`: `PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `LOCATION`
- Default model: `gemini-2.0-flash-001`

## Spec-Based Development

**CRITICAL**: Always reference these conductor/ specifications before implementing:

1. **`conductor/product.md`** — Vision, purpose, target audience, core capabilities
2. **`conductor/product-guidelines.md`** — Visual identity (Cyber Yellow #FFD400), UX principles, component standards
3. **`conductor/tech-stack.md`** — Technology stack and development tools
4. **`conductor/workflow.md`** — TDD workflow, quality gates, commit guidelines
5. **`conductor/code_styleguides/`** — Language-specific style rules (TS, Python, HTML/CSS)

**Rule**: If implementation differs from stack spec, STOP and update `tech-stack.md` first.

## Agent Behaviour

### Research-First Principle (per `conductor/workflow.md`)
- **ALWAYS web-search before implementing** unfamiliar libraries, APIs, or patterns
- **NEVER assume** library behavior — verify with official documentation
- **Search first** when encountering: new npm packages, Python libraries, framework features
- Use `librarian` agent for docs, `explore` agent for codebase patterns

### TDD Workflow (Red/Green/Refactor)
1. **Red phase**: Write failing tests first
2. **Green phase**: Implement to pass tests
3. **Refactor**: Improve clarity with passing tests as safety net
4. **Verify >80% coverage**

### Quality Gates (per `conductor/workflow.md`)
Before marking any task complete, verify:
- [ ] All tests pass
- [ ] Code coverage >80%
- [ ] Code follows style guides in `conductor/code_styleguides/`
- [ ] Public functions documented (docstrings/JSDoc)
- [ ] Type safety enforced (no `as any`, `@ts-ignore`)
- [ ] No linting errors
- [ ] Documentation updated if needed

### Delegation Guidelines
| Domain | Delegate To | When |
|--------|-------------|------|
| Visual/UI | `frontend-ui-ux-engineer` | Styling, layout, animations |
| External docs | `librarian` | Library API, official docs |
| Codebase patterns | `explore` | Finding existing implementations |
| Architecture | `oracle` | Multi-system tradeoffs |
| Documentation | `document-writer` | READMEs, guides |
| Hard debugging | `oracle` | After 2+ failed attempts |

### File Headers (Required)
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

## Code Style Quick Ref

### TypeScript (per `conductor/code_styleguides/typescript.md`)
- `const` by default; never `var`
- **Named exports only** (no default exports)
- Single quotes; explicit semicolons
- Avoid `any`, `as`, non-null assertions
- `UpperCamelCase` components/types
- Hooks start with `use`
- Type-only imports: `import type { Foo } from ...`

### Python (per `conductor/code_styleguides/python.md`)
- 4-space indent, **80-character lines**
- `snake_case` functions, `PascalCase` classes
- Docstrings: summary + Args/Returns/Raises
- No mutable default args
- Import grouping: stdlib → third-party → local (`server.*`)

### HTML/CSS (per `conductor/code_styleguides/html-css.md`)
- 2-space indent, lowercase
- Class selectors preferred
- **Alphabetize CSS declarations**
- Use `cn()` from `client/src/lib/utils.ts` for Tailwind merging

### Import Ordering
```ts
import { StrictMode } from 'react'
import type { Session } from '@/types/api'
import { api } from '@/lib/api'
import './index.css'
```

## Testing

- **Client**: Vitest + Testing Library (`@testing-library/react`)
- **Server**: stdlib `unittest` in `server/tests`
- **Naming**: `*.test.ts` for client, `test_*.py` for server
- **Coverage**: Target >80% per `conductor/workflow.md`
- **Setup**: Coverage configured via `vitest.config.ts` (client)
- Keep tests small, deterministic; mock external dependencies

## Product Guidelines (per `conductor/product-guidelines.md`)

### Visual Identity
- **Cyber Yellow (`#FFD400`)**: Primary actions, accents
- **Dark Backgrounds**: Deep grays/blacks
- **Typography**: Inter (UI), JetBrains Mono (code)
- **Glassmorphism**: Light usage for cards/panels
- **Rounding**: 8px-12px consistently

### UX Principles
- **Pure Chat**: No RAG, no Knowledge Graph — clean conversation interface
- **Minimalism**: Remove non-essential UI elements
- **Persistence**: Instant session switching, draft preservation
- **Clarity**: Visual cues for model states (thinking, generating, error)
- **Thinking Mode**: Visual indicator when model is processing/thinking
- **Responsiveness**: Sidebar toggle on mobile

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
