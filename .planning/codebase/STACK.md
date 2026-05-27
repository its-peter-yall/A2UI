# Technology Stack

**Analysis Date:** 2026-05-27

## Languages

**Primary:**
- TypeScript ~5.9.3 — Frontend application (`client/src/**/*.ts`, `client/src/**/*.tsx`)
- Python 3.10+ — Backend server (`server/**/*.py`)

**Secondary:**
- HTML — Entry point and static assets (`client/index.html`, `client/public/`)
- CSS — Tailwind CSS processed stylesheets (`client/src/index.css`)
- JavaScript — Configuration files (`client/eslint.config.js`, `client/vite.config.ts`)

## Runtime

**Environment:**
- Node.js — Frontend build tooling and development server
- Python 3.10+ — Backend runtime via Uvicorn ASGI server

**Package Manager:**
- npm — Frontend dependency management
- pip — Backend dependency management with `requirements.txt`
- Lockfile: `client/package-lock.json` (present), `server/requirements.txt` (no lockfile, unpinned versions)

## Frameworks

**Core:**
- React 19.2.0 — Frontend UI framework (`client/package.json`)
- FastAPI — Backend REST API framework (`server/main.py`)
- Vite 7.2.4 — Frontend build tool and dev server (`client/vite.config.ts`)
- Tailwind CSS 4.1.18 — Utility-first CSS framework (`client/tailwind.config.js`)

**Testing:**
- Vitest 3.2.4 — Frontend unit test runner (`client/vite.config.ts`, `client/vitest.setup.ts`)
- @testing-library/react 16.3.2 — React component testing utilities (`client/package.json`)
- unittest (stdlib) — Backend unit test framework (`server/tests/`)

**Build/Dev:**
- @vitejs/plugin-react 5.1.1 — Vite React integration with Fast Refresh (`client/vite.config.ts`)
- @tailwindcss/vite 4.1.18 — Tailwind CSS Vite plugin for v4 (`client/vite.config.ts`)
- Uvicorn — Python ASGI server with auto-reload (`server/main.py`)
- watchdog — File system watcher for server auto-reload (`server/main.py`)

## Key Dependencies

**Critical (Frontend):**
- `react` 19.2.0 — Core UI library (`client/package.json`)
- `react-dom` 19.2.0 — DOM rendering (`client/package.json`)
- `react-router-dom` 7.13.0 — Client-side routing (`client/src/App.tsx`)
- `@tanstack/react-query` 5.90.20 — Server state management and data fetching (`client/src/providers/QueryProvider.tsx`)
- `axios` 1.13.4 — HTTP client for API communication (`client/src/lib/learningApi.ts`, `client/src/lib/providerApi.ts`)

**Critical (Backend):**
- `fastapi` — Web framework with async support and dependency injection (`server/main.py`)
- `openai` — OpenAI-compatible SDK for LLM API calls (`server/utils/instructor_client.py`)
- `instructor` — Structured output validation with Pydantic models (`server/utils/instructor_client.py`)
- `pydantic` v2 — Data validation and serialization (`server/schemas/`)
- `tenacity` — Retry logic with exponential backoff (`server/utils/instructor_client.py`)
- `httpx` — Async HTTP client for external API calls (`server/routers/llm.py`)

**Infrastructure:**
- `sqlite3` (stdlib) — Embedded database for persistence (`server/database/persistence.py`, `server/database/learning_persistence.py`)
- `uvicorn[standard]` — ASGI server (`server/main.py`)
- `python-dotenv` — Environment variable loading from `.env` (`server/config.py`)
- `watchdog` — File system monitoring for auto-reload (`server/main.py`)

**UI/Animation:**
- `framer-motion` 12.29.2 — Animation library for React (`client/package.json`)
- `lucide-react` 0.563.0 — Icon library (`client/package.json`)
- `clsx` 2.1.1 — Conditional class name utility (`client/package.json`)
- `tailwind-merge` 3.4.0 — Tailwind class deduplication (`client/package.json`)

**Content Rendering:**
- `react-markdown` 10.1.0 — Markdown rendering in React (`client/src/features/learning/MarkdownRenderer.tsx`)
- `@tailwindcss/typography` 0.5.19 — Prose styling for markdown content (`client/package.json`)
- `rehype-raw` 7.0.0 — Allow raw HTML in markdown (`client/package.json`)
- `rehype-sanitize` 6.0.0 — Sanitize HTML in markdown (`client/package.json`)
- `remark-gfm` 4.0.1 — GitHub Flavored Markdown support (`client/package.json`)

**AI/LLM:**
- `jsonref` — JSON Schema reference resolution (used in agent schemas)
- `AsyncOpenAI` — Async OpenAI client for structured generation (`server/utils/instructor_client.py`)

## Configuration

**Environment:**
- Server uses `.env` file loaded by `python-dotenv` at import time (`server/config.py`)
- Client uses `VITE_API_URL` environment variable for backend URL (defaults to `http://localhost:8000`) (`client/src/lib/learningApi.ts`)
- AI provider API keys are user-supplied via frontend Settings panel, sent per-request via HTTP headers — no server-side API keys stored
- `.env.example` documents available variables (`server/.env.example`)

**Build:**
- Vite configuration: `client/vite.config.ts` — React plugin, Tailwind CSS v4 plugin, path aliases, Vitest config
- TypeScript configuration: `client/tsconfig.app.json` — Strict mode, bundler module resolution, `@/*` path alias
- ESLint configuration: `client/eslint.config.js` — TypeScript, React Hooks, React Refresh rules
- Tailwind CSS: `client/tailwind.config.js` — Tailwind v4 configuration

## Platform Requirements

**Development:**
- Node.js (for Vite dev server and npm)
- Python 3.10+ (for FastAPI and type hint syntax)
- SQLite3 (bundled with Python, no separate install)
- `.venv` virtual environment in `server/` directory

**Production:**
- FastAPI served via Uvicorn ASGI server on port 8000 (`server/main.py`)
- Vite builds static assets to `client/dist/` for deployment
- CORS configured for `localhost:5173` and `127.0.0.1:5173` origins (`server/main.py`)
- SQLite database stored at `server/data/a2ui.db` (`server/database/persistence.py`)

---

*Stack analysis: 2026-05-27*
