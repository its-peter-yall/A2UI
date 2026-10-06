# A2UI Agent Guide

Adaptive learning app: user submits a topic → LangGraph generates a course (optional web research) → mastery quizzes unlock the next node. Not a standalone chat product.

Read specs before implementing: `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/STRUCTURE.md`, `docs/CONVENTIONS.md`, `docs/TESTING.md`, `docs/INTEGRATIONS.md`, `docs/CONCERNS.md`. If docs conflict with scripts or source, trust the executable source.

## Commands (run from repo root)

Python package is `server.*`. Venv is `server/.venv`. **Do not `cd server` then `python -m uvicorn server.main:app`** — that cannot import `server`. Windows `run.bat` is the working launcher. POSIX `run.sh` cds into `server/` and breaks imports; ignore it.

```bash
# setup
setup.bat                                          # Windows: venv + pip + npm
python -m venv server/.venv                        # POSIX
server/.venv/Scripts/activate                      # Windows
source server/.venv/bin/activate                   # POSIX
pip install -r server/requirements.txt
cd client && npm install

# run
server/.venv/Scripts/python -m uvicorn server.main:app --reload --port 8000
cd client && npm run dev                           # :5173

# client
cd client
npm run lint
npm run build                                      # tsc -b && vite build
npm run test -- --run
npm run test -- --run src/lib/learningApi.test.ts
npm run test -- -t "LearningPage"
npm run test:generation:coverage                   # focused >80% generation gate

# server (repo root, venv on PATH)
python -m unittest
python -m unittest server.tests.test_generation_api -v
python -m unittest server.tests.test_generation_api.GenerationApiTests.test_generate_returns_202_before_job_finishes_without_secrets
```

No pytest, no CI, no root `package.json`. Node floor is Vite’s engines (20.19+ / 22.12+), not README’s “18+”. Python 3.10+.

## Layout that changes how you work

- `client/` — Vite + React 19 SPA. Alias `@/*` → `client/src/*`.
- `client/src/features/learning/` — product UI (quiz lives in `ConceptCard`, not a `QuizModal`).
- `client/src/lib/` — HTTP/SSE clients. **No** `api.ts`. Use `learningApi.ts`, `chatApi.ts`, `regenApi.ts`, `storageApi.ts`, `providerApi.ts`.
- `server/` — FastAPI package. Routers thin; persistence via facades.
- `server/graph/` — durable course graph (`build.py`, `nodes.py`, `state.py`, `runner.py`, `regen.py`).
- `server/database/repositories/` — Protocol + SQLite + Mongo. Call sites import facades from `storage_registry.py`, never store classes.
- `docs/<feature>/` and `docs/superpowers/` — historical plans. Do not overwrite.
- `conductor/` — gitignored, not on disk. UI notes: Cyber Yellow `#ffb74d`, dark theme.
- Never read or quote `.env`. `server/.env.example` is the template. This file is gitignored.

Routes (`client/src/App.tsx`): `/` and `/learn` → `LearningHome`; `/learn/:sessionId`; `/learn/:sessionId/revise/:revisionId`; `/settings`. No `/chat`. Unknown → `/`.

## Architecture agents miss

- **202 + SSE:** `POST /learning/generate` returns 202 immediately. Progress is `GET /learning/sessions/{id}/events` (credential-free EventSource) plus polling `GET /learning/sessions/{id}`. Resume: `POST /learning/sessions/{id}/resume`.
- **Secrets stay in the browser.** LLM/search keys are localStorage, sent as headers only on generate/resume/chat/regen (`X-OpenRouter-Key`, `X-GeneralCompute-Key`, `X-Tavily-Key`, …). Session/quiz/delete/SSE must not carry keys. Never put keys in `CourseState`, progress events, or logs (`server/utils/safe_logging.py`).
- **Node FSM (server-enforced):** `LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED` (`ERROR` branch). `server/schemas/learning.py`.
- **Two SQLite files:** app `server/data/a2ui.db` (`DB_PATH`); LangGraph checkpoints `server/data/checkpoints.db`. They cannot share a transaction. Cloud: Mongo + `MongoDBSaver` when `DEPLOYMENT_MODE=cloud` (`MONGO_URI` + `MONGO_DB` required).
- **Dual backends:** every new persistence method goes on the Protocol, SQLite store, **and** `mongo_*.py`. Missing Mongo = silent cloud bug. New tables: focused stores, do not grow `LearningManager`.
- **Agents:** `researcher`, `planner`, `generator`, `quizzer` (`REQUIRED_AGENT_ROLES`). Instructor JSON via `server/utils/instructor_client.py`. New role: subclass `BaseAgent`, export, headers, `MODEL_CONFIGS`.
- **Import direction:** routers → services/graph/schemas/facades. No SQL in routers or graph nodes. No secrets in graph state.

## Conventions that differ from defaults

- **Named exports only** for new React components. `App.tsx` is the existing default-export exception (`main.tsx` imports it). ESLint `react-refresh/only-export-components` is error (`allowExportNames: ['useErrorToast']`).
- TypeScript: `strict`, `verbatimModuleSyntax` → `import type { Foo }`. No `any` / `as any` / `@ts-ignore` in production. Semicolons. Prefer `?` over `| undefined`.
- Python: 4-space indent, wrap near 80 cols, `from __future__ import annotations` on new modules, double quotes dominate, `python -m` imports only.
- Routers: `try` / `except HTTPException: raise` / wrap unexpected; `status.HTTP_*` constants; Pydantic models in `server/schemas/`.
- Tailwind via `cn()` from `client/src/lib/utils.ts`. No Prettier/Ruff/Black config — match the file you touch.
- Tests: client colocated `*.test.ts(x)`, still `import { describe, it, expect, vi } from 'vitest'`. Server `server/tests/test_*.py` unittest. Target >80% on new code. TDD: tests before or with code.
- README still mentions `test_chat` / `test_orchestrator` / `test_learning` — those modules are gone. Use `server.tests.test_generation_api` as the pattern.

## Where to add code

| Change | Where |
|--------|--------|
| Learning UI | `client/src/features/learning/` + barrel `index.ts` |
| New URL | `client/src/App.tsx` |
| Learning HTTP | `server/routers/learning.py` + `client/src/lib/learningApi.ts` + `client/src/types/learning.ts` |
| New domain API | `server/routers/<domain>.py`, re-export in `server/routers/__init__.py`, `app.include_router` in `server/main.py` |
| Graph stage | `state.py` + `nodes.py` + `build.py` + `schemas/generation.py` / `progress.py` |
| Search provider | `search/registry.py` + `search/adapters/` + client `webSearchProviders.ts` / `webSearchHeaders.ts` |
| Shared chrome | `client/src/components/` only |

### Ponytail, lazy senior dev mode:

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern that's already here, don't re-write it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the task and the code it touches, trace the real flow end to end, then climb.

Bug fix = root cause, not symptom: a report names a symptom. Grep every caller of the function you touch and fix the shared function once — one guard there is a smaller diff than one per caller, and patching only the path the ticket names leaves a sibling caller still broken.

Rules:

- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, but only once you understand the problem. The smallest change in the wrong place isn't lazy, it's a second bug.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- Pick the edge-case-correct option when two stdlib approaches are the same size, lazy means less code, not the flimsier algorithm.
- Mark deliberate simplifications that cut a real corner with a known ceiling (global lock, O(n²) scan, naive heuristic) with a `ponytail:` comment naming the ceiling and upgrade path.

Not lazy about: understanding the problem (read it fully and trace the real flow before picking a rung, a small diff you don't understand is just laziness dressed up as efficiency), input validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs (the platform is never the spec ideal, a clock drifts, a sensor reads off), anything explicitly requested. Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind, the smallest thing that fails if the logic breaks (an assert-based demo/self-check or one small test file; no frameworks, no fixtures). Trivial one-liners need no test.

### File Header Requirements
**MANDATORY** for all code files:

**Example Header Style**
```typescript
/**
 * ============================================================================
 * FILE: <filename>
 * LOCATION: <filepath>
 * ============================================================================
 *
 * PURPOSE:
 *    Brief 1-line description of what this file does
 *
 * ROLE IN PROJECT:
 *    How this file fits into the larger system (2-3 lines)
 *
 * KEY COMPONENTS:
 *    - Component1: What it does
 *    - Component2: What it does
 * ============================================================================
 */
```

Python modules use the same boxed header as a module docstring (`FILE` / `LOCATION` / `PURPOSE` / `ROLE IN PROJECT` / `KEY COMPONENTS`). Existing files often also list `DEPENDENCIES` and `USAGE` — keep that when present.

- New `.ts` / `.tsx` / `.js` / `.jsx` / `.py`: header before first write
- Existing files: add header when changing >30%
- Separator line: exactly 76 `=` characters
