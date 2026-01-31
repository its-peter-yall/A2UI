# claud.md

**For Claude Code (Anthropic CLI)**

**Generated:** 2026-01-31

## Project Context

AgUI is a small, full-stack app with a Vite + React + TypeScript frontend and a
FastAPI backend that integrates with Vertex AI (Gemini) for chat responses.

## Structure
- `client/`: React 19 + Vite + TypeScript + Tailwind
- `server/`: FastAPI + Pydantic + Vertex AI integration
- `conductor/`: product and style guides

## Key Files

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

**See also**: `AGENTS.md` for comprehensive project documentation, build commands, and code style guidelines.

## Dev Commands
```bash
cd AgUI/client
npm install
npm run dev
```
```bash
cd AgUI/server
python -m uvicorn server.main:app --reload --port 8000
```

## Claude-Specific Notes
- API base URL defaults to `http://localhost:8000` (override via `VITE_API_URL`)
- Backend uses `.env` values; see `server/.env.example`
- Default model: `gemini-2.0-flash-001` (see `server/schemas/chat.py`)
- Client tests: `npm run test` (Vitest)
- Server tests: `python -m unittest` (stdlib)

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
