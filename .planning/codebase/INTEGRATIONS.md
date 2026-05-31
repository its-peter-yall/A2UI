# External Integrations

**Analysis Date:** 2026-05-27

## APIs & External Services

**AI/LLM Providers:**
- OpenRouter — Primary LLM provider for structured content generation
  - SDK/Client: `openai` Python SDK (OpenAI-compatible) via `instructor` library (`server/utils/instructor_client.py`)
  - Base URL: `https://openrouter.ai/api/v1` (configurable via `OPENROUTER_BASE_URL`)
  - Auth: User-supplied API key sent per-request via `X-OpenRouter-Key` HTTP header (`server/schemas/llm.py:126-167`)
  - Timeout: 60 seconds default (`server/config.py:40-42`)
  - Used for: Planner, Generator, Quizzer agent structured generation (`server/utils/instructor_client.py:56-72`)
  - Attribution: `HTTP-Referer` and `X-OpenRouter-Title` headers sent for analytics (`server/schemas/llm.py:75-85`)
  - Thinking/Reasoning: Supported via `reasoning` parameter with configurable effort levels (`server/schemas/llm.py:87-101`)

- General Compute — Secondary LLM provider alternative
  - SDK/Client: `openai` Python SDK (OpenAI-compatible) via `instructor` library (`server/utils/instructor_client.py`)
  - Base URL: `https://api.generalcompute.com/v1` (configurable via `GENERALCOMPUTE_BASE_URL`)
  - Auth: User-supplied API key sent per-request via `X-GeneralCompute-Key` HTTP header (`server/schemas/llm.py:126-167`)
  - Timeout: 60 seconds default (`server/config.py:47-49`)
  - Used for: Model listing endpoint (`server/routers/llm.py:93-134`)
  - Model list endpoint: `POST /models/list` (different from OpenRouter's `GET /models`)

**Model Configurations:**
- Planner agent: `google/gemini-2.5-pro` (temperature: 0.3, max_tokens: 10000) (`server/utils/instructor_client.py:57-61`)
- Generator agent: `google/gemini-2.5-flash` (temperature: 0.7, max_tokens: 60000) (`server/utils/instructor_client.py:62-66`)
- Quizzer agent: `google/gemini-2.5-flash` (temperature: 0.2, max_tokens: 8000) (`server/utils/instructor_client.py:67-71`)
- Models can be overridden per-request via `X-OpenRouter-Model` or `X-GeneralCompute-Model` headers (`server/schemas/llm.py:130-131`)

## Data Storage

**Databases:**
- SQLite (embedded)
  - Connection: `server/data/a2ui.db` (`server/database/persistence.py:30`)
  - Client: Python stdlib `sqlite3` with `Row` factory (`server/database/learning_persistence.py:71-75`)
  - No ORM — raw SQL queries throughout (`server/database/learning_persistence.py`)
  - Foreign keys enabled via `PRAGMA foreign_keys=ON` (`server/database/learning_persistence.py:74`)
  - Tables: `learning_sessions`, `concept_nodes`, `quiz_data`, `revision_sessions`, `quiz_attempts`, `revision_node_progress` (`server/database/learning_persistence.py:77-246`)
  - Indexes: On `learning_sessions.user_id`, `concept_nodes(learning_session_id, sequence_index)`, `quiz_data.node_id`, `quiz_attempts(node_id, attempt_number)`, `revision_sessions.original_session_id` (`server/database/learning_persistence.py:136-238`)
  - Auto-initialization: Tables created on server startup via `lifespan()` (`server/main.py:56-71`)

**File Storage:**
- Local filesystem only — no cloud file storage detected

**Caching:**
- None — no caching layer detected

## Authentication & Identity

**Auth Provider:**
- Custom — No third-party auth provider
  - API keys user-supplied via frontend Settings panel, stored in browser `localStorage` (`client/src/lib/providerSettings.ts:35-37`)
  - Keys sent per-request via HTTP headers — never stored server-side (`server/.env.example:3-8`)
  - Auth validation: Server validates key presence on each request via `get_llm_context()` dependency (`server/schemas/llm.py:126-200`)
  - Returns 401 when key is missing or blank (`server/schemas/llm.py:163-167`)
  - Multi-provider support: `X-AI-Provider` header selects between `openrouter` and `generalcompute` (`server/schemas/llm.py:127`)

**User Identification:**
- Optional `user_id` field on learning sessions (`server/database/learning_persistence.py:257`)
- No user registration, login, or session management

## Monitoring & Observability

**Error Tracking:**
- None — no error tracking service integrated

**Logs:**
- Python `logging` module with `INFO` level (`server/main.py:44`)
- Module-level loggers: `logger = logging.getLogger(__name__)` pattern throughout server code
- Structured logging with `extra` dict for performance metrics (`server/services/course_orchestrator.py:213-226`)
- Client-side: `console.error` for API failures (`client/src/lib/learningApi.ts:94`)

## CI/CD & Deployment

**Hosting:**
- Local development only — no cloud deployment configuration detected
- Backend: Uvicorn on `0.0.0.0:8000` (`server/main.py:187-193`)
- Frontend: Vite dev server on port 5173 (default)

**CI Pipeline:**
- None — no CI/CD configuration files detected (no `.github/`, `.gitlab-ci.yml`, `Dockerfile`, etc.)

## Environment Configuration

**Required env vars (server):**
- None strictly required — all have defaults or are user-supplied per-request

**Optional env vars (server):**
- `OPENROUTER_BASE_URL` — OpenRouter API base URL (default: `https://openrouter.ai/api/v1`) (`server/config.py:36-39`)
- `OPENROUTER_TIMEOUT_SECONDS` — Request timeout (default: `60.0`) (`server/config.py:40-42`)
- `GENERALCOMPUTE_BASE_URL` — General Compute API base URL (default: `https://api.generalcompute.com/v1`) (`server/config.py:43-46`)
- `GENERALCOMPUTE_TIMEOUT_SECONDS` — Request timeout (default: `60.0`) (`server/config.py:47-49`)
- `AUTO_RELOAD` — Enable file watcher auto-reload (default: `true`) (`server/main.py:48`)
- `RELOAD_DELAY` — Seconds before restart after change (default: `1.0`) (`server/main.py:49-51`)

**Client env vars:**
- `VITE_API_URL` — Backend API base URL (default: `http://localhost:8000`) (`client/src/lib/learningApi.ts:60`, `client/src/lib/providerApi.ts:32`)

**Secrets location:**
- `.env` file in `server/` directory (gitignored)
- `.env.example` documents available variables (`server/.env.example`)
- AI provider API keys stored in browser `localStorage` under key `ai_provider_settings` (`client/src/lib/providerSettings.ts:36`)

## Webhooks & Callbacks

**Incoming:**
- None — no webhook endpoints detected

**Outgoing:**
- None — no outbound webhook calls detected

## Request Header Contract

Client sends provider-specific headers on every LLM-related request. Server extracts these via FastAPI's `Depends(get_llm_context)` pattern:

| Header | Purpose | Required |
|--------|---------|----------|
| `X-AI-Provider` | Provider selection (`openrouter` or `generalcompute`) | No (defaults to `openrouter`) |
| `X-OpenRouter-Key` | OpenRouter API key | Yes (when provider is `openrouter`) |
| `X-GeneralCompute-Key` | General Compute API key | Yes (when provider is `generalcompute`) |
| `X-OpenRouter-Model` | Model slug override | No |
| `X-GeneralCompute-Model` | Model slug override | No |
| `HTTP-Referer` | OpenRouter attribution | No |
| `X-OpenRouter-Title` | OpenRouter app title | No |
| `X-Thinking-Enabled` | Enable reasoning mode (`true`/`false`) | No |
| `X-Thinking-Effort` | Reasoning effort level (`minimal`/`low`/`medium`/`high`/`xhigh`) | No |
| `X-Max-Completion-Tokens` | Model-specific output token limit | No |

Header construction: `client/src/lib/providerApi.ts:46-80`
Header extraction: `server/schemas/llm.py:126-200`

## Retry & Resilience

**Backend:**
- `tenacity` retry with exponential backoff on LLM calls: 3 attempts, 2-10s wait (`server/utils/instructor_client.py:119-126`)
- Retries skipped for `ValueError`, `TypeError`, `asyncio.CancelledError` (`server/utils/instructor_client.py:122-124`)
- OpenAI SDK retries disabled (`max_retries=0`) to let tenacity handle retries (`server/utils/instructor_client.py:204`)
- Agent-level retry: 2 attempts for `ValidationError` with 0.5s * attempt delay (`server/agents/base.py:129-167`)
- SkeletonCard pattern: Failed content generation returns placeholder with retry option (`server/services/course_orchestrator.py:446-497`)

**Frontend:**
- Standard axios timeout: 30 seconds (`client/src/lib/learningApi.ts:68`)
- Generation timeout: 5 minutes for course generation (`client/src/lib/learningApi.ts:105`)
- Model list timeout: 15 seconds (`client/src/lib/providerApi.ts:95`)
- AbortSignal support for cancellable requests (`client/src/lib/learningApi.ts:122-131`)
- Server-side disconnect detection for long-running generation (`server/routers/learning.py:274-289`)

---

*Integration audit: 2026-05-27*
